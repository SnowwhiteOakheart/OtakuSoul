#!/usr/bin/env python3
"""C8 experiment: battle maps from a picture. Can a local image model paint a top-down view of an
improvised place, and can we read a 5e grid (walls, floor, water, trees, rocks) out of it?

Not part of the app. Needs Pillow and numpy (e.g. `python -m venv target/battlemap-venv` and
`pip install pillow numpy`); generating needs the app's sd.cpp runtime and models, the vision
check its llama.cpp runtime with Qwen3-VL.

    python tools/battlemap_probe.py render MAP.json OUT.png        # draw an existing map (self-test input)
    python tools/battlemap_probe.py generate --model flux1 --out DIR [--only NAME]
    python tools/battlemap_probe.py grid IMAGE --cols 16 --rows 12 --out DIR   # pixels → map JSON + overlay
    python tools/battlemap_probe.py vlm-serve                                  # Qwen3-VL on port 8091 (own window)
    python tools/battlemap_probe.py vlm IMAGE --cols 16 --rows 12 --out DIR    # vision model → map JSON
    python tools/battlemap_probe.py score MAP.json [--truth MAP.json]           # playability (and agreement)
    python tools/battlemap_probe.py selftest                                    # render → grid → compare, all shipped maps

Output map files use the app's format (`presets/srd5/maps/*.json`: rows of characters + legend).
"""
import argparse
import base64
import json
import os
import subprocess
import sys
import time
import urllib.request
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get('OTAKUSOUL_DATA') or Path(os.environ.get('APPDATA', '')) / 'snowwhite' / 'otakusoul' / 'data')

# The characters this experiment writes, with the legend entries of the shipped maps.
LEGEND_INDOOR = {
    '#': {'ground': 'wall_stone', 'kind': 'wall'},
    '.': {'ground': 'floor_stone', 'kind': 'floor'},
    '~': {'ground': 'water_shallow', 'kind': 'difficult'},
    'O': {'ground': 'floor_stone', 'kind': 'floor', 'object': 'pillar'},
    ':': {'ground': 'floor_stone', 'kind': 'floor', 'object': 'rubble'},
    'p': {'ground': 'floor_stone', 'kind': 'floor', 'zone': 'party'},
    's': {'ground': 'floor_stone', 'kind': 'floor', 'zone': 'spawn'},
}
LEGEND_OUTDOOR = {
    ',': {'ground': 'grass', 'kind': 'floor'},
    '=': {'ground': 'dirt_road', 'kind': 'floor'},
    '~': {'ground': 'stream', 'kind': 'difficult'},
    'T': {'ground': 'grass', 'kind': 'floor', 'object': 'tree'},
    'R': {'ground': 'grass', 'kind': 'floor', 'object': 'rock'},
    '#': {'ground': 'wall_stone', 'kind': 'wall'},
    'p': {'ground': 'dirt_road', 'kind': 'floor', 'zone': 'party'},
    's': {'ground': 'grass', 'kind': 'floor', 'zone': 'spawn'},
}
BLOCKING = {'pillar', 'tree', 'tree_pine', 'rock', 'wagon_left', 'wagon_right', 'crates', 'chest_closed', 'altar_dark',
            'sarcophagus', 'brazier', 'door_locked', 'campfire'}
SIGHT = {'pillar', 'tree', 'tree_pine', 'door_closed', 'door_locked', 'wagon_left', 'wagon_right'}

# Colours to draw a map (self-test) – roughly what a painted map looks like.
GROUND_RGB = {
    'wall_stone': (40, 38, 44), 'floor_stone': (150, 140, 125), 'water_shallow': (60, 110, 170), 'stream': (60, 120, 175),
    'grass': (95, 150, 70), 'dirt_road': (160, 130, 90),
}
OBJECT_RGB = {
    'pillar': (90, 85, 95), 'tree': (35, 80, 35), 'tree_pine': (25, 70, 40), 'rock': (120, 120, 120), 'rubble': (120, 110, 100),
    'bush': (60, 115, 50), 'log': (100, 70, 40), 'crates': (130, 95, 60), 'wagon_left': (110, 80, 50), 'wagon_right': (110, 80, 50),
}

# Places a game master might improvise, two indoor and three outdoor, plus a cave.
PLACES = {
    'cellar': 'a tavern cellar with barrels, stone pillars and thick stone walls',
    'watchtower': 'the ground floor of a ruined round watchtower, broken walls, rubble',
    'clearing': 'a forest clearing with a small stream, scattered trees and rocks',
    'crossroads': 'a dirt road crossroads in open grassland with a few trees',
    'riverbank': 'a river bank with a wooden bridge, reeds and boulders',
    'cave': 'a natural cave with an underground pool and rough rock walls',
}
PROMPT = ('top-down orthographic battle map for a tabletop roleplaying game, {place}, seen directly from above, '
          'flat even lighting, clear readable layout, walls drawn as thick dark solid areas, no characters, no text, no grid lines')
NEGATIVE = 'perspective, isometric, people, characters, text, letters, watermark, blurry, frame, border'

MODELS = {
    # Files in <data>/image-models and the settings the app uses (`modules/local_image.rs`):
    # (args, width, height, steps, cfg). 4:3 suits a 16×12 grid.
    'flux1': (['--diffusion-model', 'flux1-dev-Q5_K_S.gguf', '--vae', 'ae.safetensors', '--clip_l', 'clip_l.safetensors',
               '--t5xxl', 't5-v1_1-xxl-encoder-Q5_K_M.gguf', '--clip-on-cpu', '--vae-tiling', '--diffusion-fa'], 1024, 768, 20, 1.0),
    'flux2': (['--diffusion-model', 'flux2-dev-Q4_K_S.gguf', '--vae', 'flux2-vae.safetensors',
               '--llm', 'Mistral-Small-3.2-24B-Instruct-2506-Q4_K_M.gguf', '--offload-to-cpu', '--diffusion-fa'], 1024, 768, 28, 1.0),
    'qwen': (['--diffusion-model', 'qwen_image_2.1-Q4_K.gguf', '--vae', 'qwen_image_2.1_vae_bf16.safetensors',
              '--llm', 'Qwen3VL-8B-Instruct-Q4_K_M.gguf', '--offload-to-cpu', '--diffusion-fa'], 1024, 768, 20, 6.0),
}


# ---------------------------------------------------------------------------------------------
# Maps

def load_map(path):
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    return data, [list(row) for row in data['rows']], data['legend']


def write_map(path, name, rows, legend, tileset):
    used = {c for row in rows for c in row}
    data = {'id': Path(path).stem, 'name': {'de': name, 'en': name}, 'tileset': tileset,
            'rows': [''.join(r) for r in rows], 'legend': {k: v for k, v in legend.items() if k in used}}
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    return data


def render(map_path, out, cell=48, noise=True):
    """Draws a map as a painted-looking picture (texture noise, objects as blobs)."""
    _, rows, legend = load_map(map_path)
    h, w = len(rows), len(rows[0])
    img = Image.new('RGB', (w * cell, h * cell))
    draw = ImageDraw.Draw(img)
    rng = np.random.default_rng(7)
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            entry = legend.get(ch, {})
            draw.rectangle([x * cell, y * cell, (x + 1) * cell - 1, (y + 1) * cell - 1], fill=GROUND_RGB.get(entry.get('ground'), (128, 128, 128)))
            obj = entry.get('object')
            if obj in OBJECT_RGB:
                m = cell // 6
                draw.ellipse([x * cell + m, y * cell + m, (x + 1) * cell - m, (y + 1) * cell - m], fill=OBJECT_RGB[obj])
    if noise:
        arr = np.asarray(img).astype(np.int16) + rng.integers(-18, 19, size=(h * cell, w * cell, 3))
        img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    img.save(out)
    return out


# ---------------------------------------------------------------------------------------------
# Pixels → grid

def cell_features(img, cols, rows):
    """Per cell: median colour (RGB), HSV, brightness spread and edge density."""
    arr = np.asarray(img.convert('RGB')).astype(np.float32) / 255.0
    H, W, _ = arr.shape
    gray = arr.mean(axis=2)
    gx = np.abs(np.diff(gray, axis=1, prepend=gray[:, :1]))
    gy = np.abs(np.diff(gray, axis=0, prepend=gray[:1, :]))
    edges = (gx + gy) > 0.12
    feats = np.zeros((rows, cols, 7), np.float32)
    for y in range(rows):
        for x in range(cols):
            # The middle 70 % of the cell: borders bleed into neighbours.
            y0, y1 = int((y + 0.15) * H / rows), int((y + 0.85) * H / rows)
            x0, x1 = int((x + 0.15) * W / cols), int((x + 0.85) * W / cols)
            patch = arr[y0:y1, x0:x1].reshape(-1, 3)
            r, g, b = np.median(patch, axis=0)
            mx, mn = max(r, g, b), min(r, g, b)
            v = mx
            s = 0.0 if mx == 0 else (mx - mn) / mx
            if mx == mn:
                hue = 0.0
            elif mx == r:
                hue = ((g - b) / (mx - mn)) % 6
            elif mx == g:
                hue = (b - r) / (mx - mn) + 2
            else:
                hue = (r - g) / (mx - mn) + 4
            feats[y, x] = (hue * 60, s, v, gray[y0:y1, x0:x1].std(), edges[y0:y1, x0:x1].mean(), r, g)
    return feats


def classify(img, cols, rows):
    """Heuristic grid: indoor (stone) or outdoor (green) picture, then per cell wall/floor/water/tree/rock."""
    f = cell_features(img, cols, rows)
    hue, sat, val, spread = f[..., 0], f[..., 1], f[..., 2], f[..., 3]
    green = (hue > 70) & (hue < 160) & (sat > 0.25)
    water = (hue > 180) & (hue < 250) & (sat > 0.25) & (val > 0.25)
    outdoor = green.mean() > 0.25
    # Brightness threshold of this picture (Otsu on cell brightness): darker part = walls/foliage.
    threshold = otsu(val.ravel())
    dark = val < min(threshold, 0.42)
    grid = []
    for y in range(rows):
        row = []
        for x in range(cols):
            if water[y, x]:
                row.append('~')
            elif outdoor:
                if green[y, x] and dark[y, x]:
                    row.append('T')
                elif dark[y, x] and not green[y, x]:
                    row.append('#')
                elif sat[y, x] < 0.18 and spread[y, x] > 0.07:
                    row.append('R')
                elif (20 < hue[y, x] < 50) and sat[y, x] > 0.2 and not green[y, x]:
                    row.append('=')
                else:
                    row.append(',')
            else:
                if dark[y, x]:
                    row.append('#')
                else:
                    row.append('.')
        grid.append(row)
    return grid, ('forest' if outdoor else 'dungeon')


def otsu(values, bins=64):
    hist, edges = np.histogram(values, bins=bins, range=(0, 1))
    centers = (edges[:-1] + edges[1:]) / 2
    best, best_t = -1, 0.5
    for i in range(1, bins):
        w0, w1 = hist[:i].sum(), hist[i:].sum()
        if w0 == 0 or w1 == 0:
            continue
        m0 = (hist[:i] * centers[:i]).sum() / w0
        m1 = (hist[i:] * centers[i:]).sum() / w1
        between = w0 * w1 * (m0 - m1) ** 2
        if between > best:
            best, best_t = between, centers[i]
    return best_t


def place_zones(grid, legend):
    """Party at the left, enemies at the right, on walkable squares of the largest open area."""
    walk = walkable(grid, legend)
    region = largest_region(walk)
    if not region:
        return grid
    cells = sorted(region, key=lambda p: (p[0], p[1]))
    left = [p for p in cells if p[0] <= cells[0][0] + 1][:4]
    right = [p for p in sorted(region, key=lambda p: (-p[0], p[1])) if p not in left][:3]
    for x, y in left:
        grid[y][x] = 'p'
    for x, y in right:
        grid[y][x] = 's'
    return grid


def overlay(img, grid, out):
    rows, cols = len(grid), len(grid[0])
    base = img.convert('RGBA')
    layer = Image.new('RGBA', base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    colors = {'#': (255, 40, 40, 110), '~': (40, 120, 255, 110), 'T': (0, 200, 0, 110), 'R': (200, 200, 0, 110),
              'O': (255, 140, 0, 120), 'p': (255, 255, 255, 140), 's': (255, 0, 255, 140)}
    W, H = base.size
    for y in range(rows):
        for x in range(cols):
            box = [x * W / cols, y * H / rows, (x + 1) * W / cols - 1, (y + 1) * H / rows - 1]
            if grid[y][x] in colors:
                draw.rectangle(box, fill=colors[grid[y][x]])
            draw.rectangle(box, outline=(0, 0, 0, 60))
    Image.alpha_composite(base, layer).convert('RGB').save(out)


# ---------------------------------------------------------------------------------------------
# Playability

def entry_of(ch, legend):
    return legend.get(ch, {'kind': 'floor'})


def walkable(grid, legend):
    out = set()
    for y, row in enumerate(grid):
        for x, ch in enumerate(row):
            e = entry_of(ch, legend)
            if e.get('kind') not in ('wall', 'pit') and e.get('object') not in BLOCKING:
                out.add((x, y))
    return out


def largest_region(cells):
    seen, best = set(), set()
    for start in cells:
        if start in seen:
            continue
        region, queue = {start}, deque([start])
        seen.add(start)
        while queue:
            x, y = queue.popleft()
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    n = (x + dx, y + dy)
                    if n in cells and n not in seen:
                        seen.add(n)
                        region.add(n)
                        queue.append(n)
        if len(region) > len(best):
            best = region
    return best


def score(map_data, truth=None):
    rows = [list(r) for r in map_data['rows']]
    legend = map_data['legend']
    total = len(rows) * len(rows[0])
    walk = walkable(rows, legend)
    region = largest_region(walk)
    zones = {(x, y): entry_of(ch, legend).get('zone') for y, r in enumerate(rows) for x, ch in enumerate(r)}
    party = [p for p, z in zones.items() if z == 'party']
    spawn = [p for p, z in zones.items() if z and z.startswith('spawn')]
    sight = sum(1 for y, r in enumerate(rows) for x, ch in enumerate(r)
                if entry_of(ch, legend).get('kind') == 'wall' or entry_of(ch, legend).get('object') in SIGHT)
    result = {
        'walkable': round(len(walk) / total, 2),
        'connected': round(len(region) / max(1, len(walk)), 2),
        'blocks_sight': round(sight / total, 2),
        'party_and_spawn_connected': bool(party and spawn and all(p in region for p in party + spawn)),
    }
    # A map you can fight on: enough room, mostly one area, some cover, and the sides can meet.
    result['playable'] = (0.35 <= result['walkable'] <= 0.95 and result['connected'] >= 0.8
                          and result['party_and_spawn_connected'])
    if truth:
        t_rows = [list(r) for r in truth['rows']]
        kinds = lambda grid, lg: [[('block' if (entry_of(c, lg).get('kind') in ('wall', 'pit') or entry_of(c, lg).get('object') in BLOCKING)
                                   else 'water' if entry_of(c, lg).get('kind') == 'difficult' else 'open') for c in r] for r in grid]
        a, b = kinds(rows, legend), kinds(t_rows, truth['legend'])
        same = sum(1 for y in range(len(a)) for x in range(len(a[0])) if a[y][x] == b[y][x])
        result['agreement'] = round(same / total, 2)
    return result


# ---------------------------------------------------------------------------------------------
# Commands

def cmd_grid(image, cols, rows, out, name=None):
    img = Image.open(image)
    grid, tileset = classify(img, cols, rows)
    legend = LEGEND_OUTDOOR if tileset == 'forest' else LEGEND_INDOOR
    grid = place_zones(grid, legend)
    out = Path(out)
    stem = Path(image).stem
    data = write_map(out / f'{stem}.grid.json', name or stem, grid, legend, tileset)
    overlay(img, grid, out / f'{stem}.overlay.png')
    return data


def cmd_generate(model, out, only=None, seed=42):
    runtime = json.loads((DATA / 'runtimes' / 'sd.cpp' / 'current.json').read_text(encoding='utf-8'))
    cli = Path(runtime['server_path']).with_name('sd-cli.exe' if os.name == 'nt' else 'sd-cli')
    args, width, height, steps, cfg = MODELS[model]
    models = DATA / 'image-models'
    resolved = [str(models / a) if a.endswith(('.gguf', '.safetensors')) else a for a in args]
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    timings = {}
    for name, place in PLACES.items():
        if only and name != only:
            continue
        target = out / f'{model}_{name}.png'
        started = time.time()
        cmd = [str(cli), *resolved, '-p', PROMPT.format(place=place), '-n', NEGATIVE, '-W', str(width), '-H', str(height),
               '--steps', str(steps), '--cfg-scale', str(cfg), '--sampling-method', 'euler', '-s', str(seed), '-o', str(target)]
        result = subprocess.run(cmd, capture_output=True, text=True)
        timings[name] = round(time.time() - started, 1)
        print(f'{target.name}: {"ok" if result.returncode == 0 and target.exists() else "FEHLER"} ({timings[name]} s)')
        if result.returncode != 0:
            print(result.stderr[-800:])
    (out / f'{model}_timings.json').write_text(json.dumps(timings, indent=1), encoding='utf-8')


VLM_PROMPT = """This is a top-down battle map. Describe it as a grid of exactly {rows} rows with exactly {cols} characters each,
one character per square, reading left to right, top to bottom:
# wall or solid rock   . open floor or ground   ~ water   T tree   R rock or boulder   O pillar
Answer with the {rows} rows only, no other text."""


def cmd_vlm(image, cols, rows, out, port=8091):
    """Asks Qwen3-VL (llama-server with mmproj, started by the caller on `port`) for the grid."""
    data = base64.b64encode(Path(image).read_bytes()).decode()
    body = {'messages': [{'role': 'user', 'content': [
        {'type': 'image_url', 'image_url': {'url': f'data:image/png;base64,{data}'}},
        {'type': 'text', 'text': VLM_PROMPT.format(rows=rows, cols=cols)}]}],
        'temperature': 0.1, 'max_tokens': 800}
    request = urllib.request.Request(f'http://127.0.0.1:{port}/v1/chat/completions', data=json.dumps(body).encode(),
                                     headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=300) as response:
        text = json.load(response)['choices'][0]['message']['content']
    lines = [l.strip().strip('`') for l in text.splitlines() if l.strip() and not l.strip().startswith('```')]
    grid = [list((l + '.' * cols)[:cols]) for l in lines[:rows]]
    while len(grid) < rows:
        grid.append(['.'] * cols)
    green = sum(1 for r in grid for c in r if c == 'T') > cols * rows * 0.05
    legend = dict(LEGEND_OUTDOOR if green else LEGEND_INDOOR)
    legend.setdefault('.', {'ground': 'grass' if green else 'floor_stone', 'kind': 'floor'})
    legend.setdefault('O', LEGEND_INDOOR['O'])
    legend.setdefault('T', LEGEND_OUTDOOR['T'])
    legend.setdefault('R', LEGEND_OUTDOOR['R'])
    grid = place_zones(grid, legend)
    stem = Path(image).stem
    data = write_map(Path(out) / f'{stem}.vlm.json', stem, grid, legend, 'forest' if green else 'dungeon')
    overlay(Image.open(image), grid, Path(out) / f'{stem}.vlm.png')
    return data, text


def cmd_vlm_serve(port=8091):
    """Starts llama-server with Qwen3-VL 8B and its vision file (stop it with Ctrl+C)."""
    runtime = json.loads((DATA / 'runtimes' / 'llama.cpp' / 'current.json').read_text(encoding='utf-8'))
    models = DATA / 'image-models'
    subprocess.run([runtime['server_path'], '-m', str(models / 'Qwen3VL-8B-Instruct-Q4_K_M.gguf'),
                    '--mmproj', str(models / 'mmproj-Qwen3VL-8B-Instruct-Q8_0.gguf'), '--port', str(port),
                    '-ngl', '99', '-c', '8192', '--host', '127.0.0.1'])


def cmd_selftest(out):
    """Shipped maps drawn as noisy pictures, read back: an upper bound for the pixel approach."""
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    report = {}
    for path in sorted((ROOT / 'presets' / 'srd5' / 'maps').glob('*.json')):
        truth, rows, _ = load_map(path)
        picture = render(path, out / f'{path.stem}.png')
        data = cmd_grid(picture, len(rows[0]), len(rows), out)
        report[path.stem] = score(data, truth)
        print(path.stem, report[path.stem])
    (out / 'selftest.json').write_text(json.dumps(report, indent=1), encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('render'); p.add_argument('map'); p.add_argument('out')
    p = sub.add_parser('generate'); p.add_argument('--model', choices=MODELS, required=True); p.add_argument('--out', required=True); p.add_argument('--only')
    for name in ('grid', 'vlm'):
        p = sub.add_parser(name); p.add_argument('image'); p.add_argument('--cols', type=int, default=16)
        p.add_argument('--rows', type=int, default=12); p.add_argument('--out', required=True)
    p = sub.add_parser('score'); p.add_argument('map'); p.add_argument('--truth')
    sub.add_parser('vlm-serve')
    p = sub.add_parser('selftest'); p.add_argument('--out', default=str(ROOT / 'target' / 'battlemap' / 'selftest'))
    a = parser.parse_args()
    sys.stdout.reconfigure(encoding='utf-8')
    if a.cmd == 'render':
        render(a.map, a.out)
    elif a.cmd == 'generate':
        cmd_generate(a.model, a.out, a.only)
    elif a.cmd == 'grid':
        print(json.dumps(score(cmd_grid(a.image, a.cols, a.rows, a.out)), indent=1))
    elif a.cmd == 'vlm':
        data, raw = cmd_vlm(a.image, a.cols, a.rows, a.out)
        print(raw)
        print(json.dumps(score(data), indent=1))
    elif a.cmd == 'score':
        truth = json.load(open(a.truth, encoding='utf-8')) if a.truth else None
        print(json.dumps(score(json.load(open(a.map, encoding='utf-8')), truth), indent=1))
    elif a.cmd == 'selftest':
        cmd_selftest(a.out)
    elif a.cmd == 'vlm-serve':
        cmd_vlm_serve()


if __name__ == '__main__':
    main()
