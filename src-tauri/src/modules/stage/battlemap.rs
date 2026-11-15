//! Improvised battle maps (C8): a top-down picture of the current place, painted by a local
//! Flux model, read as a 5e grid (wall, floor, water, tree, rock, road) in the format of the
//! shipped maps, plus a check whether one can fight on it. The reading is the one tested in
//! `tools/battlemap_probe.py` (`docs/battlemap-versuch-2026-11-15.md`): per cell colour, brightness and
//! texture; indoors the floor is what fills the middle of the picture. Parity with the Python tool
//! is checked against fixtures (`tests/fixtures/battlemap`).

use super::SceneState;
use super::rules5e::{BattleMap, CellKind, GridPos, LocalizedName, MapCell, MapFile};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};
use std::path::PathBuf;
use ts_rs::TS;

/// Grid of an improvised map (16 × 12 squares of 5 ft, 4:3 like the picture).
pub const COLS: usize = 16;
pub const ROWS: usize = 12;

/// Per cell: hue (degrees), saturation, value, brightness spread, edge share, red, green.
type Features = [f64; 7];

fn cell(ground: &str, kind: CellKind, object: Option<&str>, zone: Option<&str>) -> MapCell {
    MapCell {
        ground: ground.into(),
        kind,
        object: object.map(str::to_string),
        zone: zone.map(str::to_string),
    }
}

/// The legend of each kind of place; the characters match the Python tool.
fn legend(outdoor: bool) -> HashMap<String, MapCell> {
    let entries: Vec<(char, MapCell)> = if outdoor {
        vec![
            (',', cell("grass", CellKind::Floor, None, None)),
            ('=', cell("dirt_road", CellKind::Floor, None, None)),
            ('~', cell("stream", CellKind::Difficult, None, None)),
            ('T', cell("grass", CellKind::Floor, Some("tree"), None)),
            ('R', cell("grass", CellKind::Floor, Some("rock"), None)),
            ('#', cell("wall_stone", CellKind::Wall, None, None)),
            ('p', cell("dirt_road", CellKind::Floor, None, Some("party"))),
            ('s', cell("grass", CellKind::Floor, None, Some("spawn"))),
        ]
    } else {
        vec![
            ('#', cell("wall_stone", CellKind::Wall, None, None)),
            ('.', cell("floor_stone", CellKind::Floor, None, None)),
            ('~', cell("water_shallow", CellKind::Difficult, None, None)),
            (
                'p',
                cell("floor_stone", CellKind::Floor, None, Some("party")),
            ),
            (
                's',
                cell("floor_stone", CellKind::Floor, None, Some("spawn")),
            ),
        ]
    };
    entries
        .into_iter()
        .map(|(c, e)| (c.to_string(), e))
        .collect()
}

fn median(values: &mut [f64]) -> f64 {
    values.sort_by(f64::total_cmp);
    let n = values.len();
    if n == 0 {
        0.0
    } else if n % 2 == 1 {
        values[n / 2]
    } else {
        (values[n / 2 - 1] + values[n / 2]) / 2.0
    }
}

fn cell_features(img: &image::RgbImage, cols: usize, rows: usize) -> Vec<Features> {
    let (w, h) = (img.width() as usize, img.height() as usize);
    let px = |x: usize, y: usize, c: usize| f64::from(img.get_pixel(x as u32, y as u32)[c]) / 255.0;
    let gray: Vec<f64> = (0..h)
        .flat_map(|y| (0..w).map(move |x| (px(x, y, 0) + px(x, y, 1) + px(x, y, 2)) / 3.0))
        .collect();
    let g = |x: usize, y: usize| gray[y * w + x];
    let edge = |x: usize, y: usize| {
        let gx = if x == 0 {
            0.0
        } else {
            (g(x, y) - g(x - 1, y)).abs()
        };
        let gy = if y == 0 {
            0.0
        } else {
            (g(x, y) - g(x, y - 1)).abs()
        };
        gx + gy > 0.12
    };
    let mut out = Vec::with_capacity(cols * rows);
    for y in 0..rows {
        for x in 0..cols {
            // The middle 70 % of the cell: borders bleed into neighbours.
            let y0 = ((y as f64 + 0.15) * h as f64 / rows as f64) as usize;
            let y1 = ((y as f64 + 0.85) * h as f64 / rows as f64) as usize;
            let x0 = ((x as f64 + 0.15) * w as f64 / cols as f64) as usize;
            let x1 = ((x as f64 + 0.85) * w as f64 / cols as f64) as usize;
            let mut channels = [Vec::new(), Vec::new(), Vec::new()];
            let (mut sum, mut count, mut edges) = (0.0, 0usize, 0usize);
            for py in y0..y1 {
                for px_ in x0..x1 {
                    for (c, values) in channels.iter_mut().enumerate() {
                        values.push(px(px_, py, c));
                    }
                    sum += g(px_, py);
                    count += 1;
                    edges += usize::from(edge(px_, py));
                }
            }
            let mean = sum / count.max(1) as f64;
            let mut var = 0.0;
            for py in y0..y1 {
                for px_ in x0..x1 {
                    var += (g(px_, py) - mean).powi(2);
                }
            }
            let spread = (var / count.max(1) as f64).sqrt();
            let [r, gr, b] = channels.map(|mut v| median(&mut v));
            let (mx, mn) = (r.max(gr).max(b), r.min(gr).min(b));
            let s = if mx == 0.0 { 0.0 } else { (mx - mn) / mx };
            let hue = if mx == mn {
                0.0
            } else if mx == r {
                ((gr - b) / (mx - mn)).rem_euclid(6.0)
            } else if mx == gr {
                (b - r) / (mx - mn) + 2.0
            } else {
                (r - gr) / (mx - mn) + 4.0
            };
            out.push([
                hue * 60.0,
                s,
                mx,
                spread,
                edges as f64 / count.max(1) as f64,
                r,
                gr,
            ]);
        }
    }
    out
}

/// Otsu's threshold on 64 bins between 0 and 1.
fn otsu(values: &[f64]) -> f64 {
    const BINS: usize = 64;
    let mut hist = [0u64; BINS];
    for &v in values {
        hist[((v * BINS as f64) as usize).min(BINS - 1)] += 1;
    }
    let center = |i: usize| (i as f64 / BINS as f64 + (i + 1) as f64 / BINS as f64) / 2.0;
    let (mut best, mut best_t) = (-1.0, 0.5);
    for i in 1..BINS {
        let w0: u64 = hist[..i].iter().sum();
        let w1: u64 = hist[i..].iter().sum();
        if w0 == 0 || w1 == 0 {
            continue;
        }
        let m0 = (0..i).map(|k| hist[k] as f64 * center(k)).sum::<f64>() / w0 as f64;
        let m1 = (i..BINS).map(|k| hist[k] as f64 * center(k)).sum::<f64>() / w1 as f64;
        let between = w0 as f64 * w1 as f64 * (m0 - m1).powi(2);
        if between > best {
            best = between;
            best_t = center(i);
        }
    }
    best_t
}

/// Indoors: the floor is what fills the middle of the picture (it may be darker than the walls);
/// cells clearly unlike it are walls or solid rock. 3-means on brightness, saturation, warmth and
/// texture, started at the 1/6, 1/2 and 5/6 brightness quantile.
fn indoor_walls(f: &[Features], water: &[bool], cols: usize, rows: usize) -> Vec<bool> {
    let feats: Vec<[f64; 4]> = f
        .iter()
        .map(|c| [c[2], c[1] * 0.6, (c[5] - c[6]) * 1.5, c[3] * 2.0])
        .collect();
    let mut order: Vec<usize> = (0..feats.len()).collect();
    order.sort_by(|&a, &b| feats[a][0].total_cmp(&feats[b][0]));
    let n = order.len();
    let mut centers = [
        feats[order[n / 6]],
        feats[order[n / 2]],
        feats[order[n * 5 / 6]],
    ];
    let dist =
        |a: &[f64; 4], b: &[f64; 4]| a.iter().zip(b).map(|(x, y)| (x - y).powi(2)).sum::<f64>();
    let mut labels = vec![0usize; n];
    for _ in 0..25 {
        for (i, c) in feats.iter().enumerate() {
            labels[i] = (0..3)
                .min_by(|&a, &b| dist(c, &centers[a]).total_cmp(&dist(c, &centers[b])))
                .unwrap_or(0);
        }
        for (k, center) in centers.iter_mut().enumerate() {
            let members: Vec<&[f64; 4]> = feats
                .iter()
                .zip(&labels)
                .filter(|(_, l)| **l == k)
                .map(|(c, _)| c)
                .collect();
            if !members.is_empty() {
                for d in 0..4 {
                    center[d] = members.iter().map(|m| m[d]).sum::<f64>() / members.len() as f64;
                }
            }
        }
    }
    let mut counts = [0usize; 3];
    for y in rows / 4..rows - rows / 4 {
        for x in cols / 4..cols - cols / 4 {
            counts[labels[y * cols + x]] += 1;
        }
    }
    let floor = (0..3).fold(0, |best, k| if counts[k] > counts[best] { k } else { best });
    // A second cluster close to the floor's colour is floor too (light and shadow on one ground).
    let ground: Vec<usize> = (0..3)
        .filter(|&k| k == floor || dist(&centers[k], &centers[floor]).sqrt() < 0.12)
        .collect();
    labels
        .iter()
        .zip(water)
        .map(|(l, w)| !ground.contains(l) && !w)
        .collect()
}

/// Reads the picture as rows of map characters; `true` for an outdoor place.
pub fn read_grid(img: &image::RgbImage, cols: usize, rows: usize) -> (Vec<Vec<char>>, bool) {
    let f = cell_features(img, cols, rows);
    let green: Vec<bool> = f
        .iter()
        .map(|c| c[0] > 70.0 && c[0] < 160.0 && c[1] > 0.25)
        .collect();
    let water: Vec<bool> = f
        .iter()
        .map(|c| c[0] > 180.0 && c[0] < 250.0 && c[1] > 0.25 && c[2] > 0.25)
        .collect();
    let outdoor = green.iter().filter(|g| **g).count() as f64 / f.len() as f64 > 0.25;
    let values: Vec<f64> = f.iter().map(|c| c[2]).collect();
    let threshold = otsu(&values).min(0.42);
    let walls = indoor_walls(&f, &water, cols, rows);
    let mut grid = vec![vec!['.'; cols]; rows];
    for (y, row) in grid.iter_mut().enumerate() {
        for (x, square) in row.iter_mut().enumerate() {
            let i = y * cols + x;
            let [hue, sat, val, spread, ..] = f[i];
            let dark = val < threshold;
            *square = if water[i] {
                '~'
            } else if outdoor {
                if green[i] && dark {
                    'T'
                } else if dark && !green[i] {
                    '#'
                } else if sat < 0.18 && spread > 0.07 {
                    'R'
                } else if hue > 20.0 && hue < 50.0 && sat > 0.2 && !green[i] {
                    '='
                } else {
                    ','
                }
            } else if walls[i] {
                '#'
            } else {
                '.'
            };
        }
    }
    (grid, outdoor)
}

fn walkable_cells(grid: &[Vec<char>], legend: &HashMap<String, MapCell>) -> HashSet<(i32, i32)> {
    let mut out = HashSet::new();
    for (y, row) in grid.iter().enumerate() {
        for (x, ch) in row.iter().enumerate() {
            if legend
                .get(&ch.to_string())
                .is_none_or(|c| !c.blocks_movement())
            {
                out.insert((x as i32, y as i32));
            }
        }
    }
    out
}

/// The largest 8-connected region; regions are visited row by row (ties: the first one).
fn largest_region(cells: &HashSet<(i32, i32)>) -> HashSet<(i32, i32)> {
    let mut starts: Vec<(i32, i32)> = cells.iter().copied().collect();
    starts.sort_by_key(|&(x, y)| (y, x));
    let (mut seen, mut best) = (HashSet::new(), HashSet::new());
    for start in starts {
        if !seen.insert(start) {
            continue;
        }
        let mut region = HashSet::from([start]);
        let mut queue = VecDeque::from([start]);
        while let Some((x, y)) = queue.pop_front() {
            for dx in -1..=1 {
                for dy in -1..=1 {
                    let n = (x + dx, y + dy);
                    if cells.contains(&n) && seen.insert(n) {
                        region.insert(n);
                        queue.push_back(n);
                    }
                }
            }
        }
        if region.len() > best.len() {
            best = region;
        }
    }
    best
}

/// Party on the left, enemies on the right of the largest open area.
fn place_zones(grid: &mut [Vec<char>], legend: &HashMap<String, MapCell>) {
    let region = largest_region(&walkable_cells(grid, legend));
    let mut by_x: Vec<(i32, i32)> = region.iter().copied().collect();
    by_x.sort();
    let Some(&(min_x, _)) = by_x.first() else {
        return;
    };
    let left: Vec<(i32, i32)> = by_x
        .iter()
        .copied()
        .filter(|p| p.0 <= min_x + 1)
        .take(4)
        .collect();
    let mut by_far_x: Vec<(i32, i32)> = region.iter().copied().collect();
    by_far_x.sort_by_key(|&(x, y)| (-x, y));
    let right: Vec<(i32, i32)> = by_far_x
        .into_iter()
        .filter(|p| !left.contains(p))
        .take(3)
        .collect();
    for (x, y) in left {
        grid[y as usize][x as usize] = 'p';
    }
    for (x, y) in right {
        grid[y as usize][x as usize] = 's';
    }
}

/// How the map plays: share of walkable squares, how much of that is one area, cover, and
/// whether party and enemies can reach each other.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MapCheck {
    pub walkable: f64,
    pub connected: f64,
    pub blocks_sight: f64,
    pub sides_meet: bool,
    pub playable: bool,
}

pub fn check(map: &BattleMap) -> MapCheck {
    let total = (map.width * map.height).max(1) as f64;
    let squares: Vec<GridPos> = (0..map.height)
        .flat_map(|y| (0..map.width).map(move |x| GridPos::new(x, y)))
        .collect();
    let walk: HashSet<(i32, i32)> = squares
        .iter()
        .filter(|p| map.walkable(**p))
        .map(|p| (p.x, p.y))
        .collect();
    let region = largest_region(&walk);
    let sight = squares
        .iter()
        .filter(|p| map.cell(**p).is_some_and(MapCell::blocks_sight))
        .count() as f64;
    let in_region = |zone: &str| {
        let cells = map.zone_cells(zone);
        !cells.is_empty() && cells.iter().all(|p| region.contains(&(p.x, p.y)))
    };
    let walkable = walk.len() as f64 / total;
    let connected = region.len() as f64 / walk.len().max(1) as f64;
    let sides_meet = in_region("party") && in_region("spawn");
    let round = |v: f64| (v * 100.0).round() / 100.0;
    MapCheck {
        walkable: round(walkable),
        connected: round(connected),
        blocks_sight: round(sight / total),
        sides_meet,
        playable: (0.35..=0.95).contains(&walkable) && connected >= 0.8 && sides_meet,
    }
}

/// The picture as a battle map (16 × 12), named after the place.
pub fn map_from_image(img: &image::RgbImage, id: &str, place: &str) -> Result<BattleMap, String> {
    let (mut grid, outdoor) = read_grid(img, COLS, ROWS);
    let legend = legend(outdoor);
    place_zones(&mut grid, &legend);
    let used: HashSet<char> = grid.iter().flatten().copied().collect();
    MapFile {
        id: id.into(),
        name: LocalizedName {
            de: place.into(),
            en: place.into(),
            ru: place.into(),
        },
        tileset: if outdoor { "forest" } else { "dungeon" }.into(),
        rows: grid.iter().map(|r| r.iter().collect()).collect(),
        legend: legend
            .into_iter()
            .filter(|(k, _)| k.chars().next().is_some_and(|c| used.contains(&c)))
            .collect(),
        ..Default::default()
    }
    .build()
}

// ---------------------------------------------------------------------------------------------
// Improvised maps of a scene: `<data>/battlemaps/<scene>/index.json` and the pictures beside it.
// Kept apart from the scene file: painting takes up to two minutes, and a turn played meanwhile
// rewrites the scene state.

/// Local models that paint usable top-down maps (the experiment: Flux 2 best, Flux 1 slanted).
pub const PAINTERS: [&str; 2] = ["flux2-dev-q4", "flux1-dev-q5"];

/// Picture size (4:3 like the 16 × 12 grid).
pub const IMAGE_SIZE: (u32, u32) = (1024, 768);

/// An improvised battle map of one place of a scene.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ImprovisedMap {
    /// The place as the game master named it.
    pub place: String,
    /// The place normalized (lower case, single spaces): the map's key in its scene.
    pub key: String,
    /// The picture's file name next to the index.
    pub image: String,
    /// Image model that painted it (`import` for a picture the user chose).
    pub model: String,
    pub map: BattleMap,
    pub check: MapCheck,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct Index {
    #[serde(default)]
    maps: Vec<ImprovisedMap>,
    /// Places whose map the user threw away: not painted again on their own.
    #[serde(default)]
    discarded: Vec<String>,
}

/// The key of a place: lower case, single spaces.
pub fn place_key(place: &str) -> String {
    place
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

fn folder(scene_id: &str) -> PathBuf {
    let safe: String = scene_id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    PathBuf::from(crate::modules::paths::resolve_app_paths().data_dir)
        .join("battlemaps")
        .join(safe)
}

fn load_index(scene_id: &str) -> Index {
    std::fs::read_to_string(folder(scene_id).join("index.json"))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn save_index(scene_id: &str, index: &Index) -> Result<(), String> {
    let dir = folder(scene_id);
    std::fs::create_dir_all(&dir).map_err(|e| crate::err!("backend.battlemap.save", error = e))?;
    let text = serde_json::to_string_pretty(index)
        .map_err(|e| crate::err!("backend.battlemap.save", error = e))?;
    std::fs::write(dir.join("index.json"), text)
        .map_err(|e| crate::err!("backend.battlemap.save", error = e))
}

/// The map of `place` in a scene, unless thrown away.
pub fn for_place(scene_id: &str, place: &str) -> Option<ImprovisedMap> {
    let key = place_key(place);
    let index = load_index(scene_id);
    index.maps.into_iter().find(|m| m.key == key)
}

/// Whether the user threw away the map of `place` (then it is not painted again by itself).
pub fn discarded(scene_id: &str, place: &str) -> bool {
    load_index(scene_id).discarded.contains(&place_key(place))
}

/// Reads `png` as the map of `place` and keeps both (replacing an older map of the place).
pub fn store(
    scene_id: &str,
    place: &str,
    png: &[u8],
    model: &str,
) -> Result<ImprovisedMap, String> {
    let img = image::load_from_memory(png)
        .map_err(|e| crate::err!("backend.battlemap.image", error = e))?
        .to_rgb8();
    let key = place_key(place);
    let stamp = chrono::Utc::now().timestamp_millis();
    let id = format!("improvised_{stamp}");
    let map = map_from_image(&img, &id, place.trim())?;
    let improvised = ImprovisedMap {
        place: place.trim().to_string(),
        key: key.clone(),
        image: format!("{id}.png"),
        model: model.to_string(),
        check: check(&map),
        map,
    };
    let dir = folder(scene_id);
    std::fs::create_dir_all(&dir).map_err(|e| crate::err!("backend.battlemap.save", error = e))?;
    std::fs::write(dir.join(&improvised.image), png)
        .map_err(|e| crate::err!("backend.battlemap.save", error = e))?;
    let mut index = load_index(scene_id);
    for old in index.maps.iter().filter(|m| m.key == key) {
        let _ = std::fs::remove_file(dir.join(&old.image));
    }
    index.maps.retain(|m| m.key != key);
    index.discarded.retain(|k| *k != key);
    index.maps.push(improvised.clone());
    save_index(scene_id, &index)?;
    Ok(improvised)
}

/// Throws the map of `place` away (picture included) and remembers not to paint it again.
pub fn discard(scene_id: &str, place: &str) -> Result<(), String> {
    let key = place_key(place);
    let mut index = load_index(scene_id);
    let dir = folder(scene_id);
    for old in index.maps.iter().filter(|m| m.key == key) {
        let _ = std::fs::remove_file(dir.join(&old.image));
    }
    index.maps.retain(|m| m.key != key);
    if !index.discarded.contains(&key) {
        index.discarded.push(key);
    }
    save_index(scene_id, &index)
}

/// The picture of an improvised map (by map id), for the board's background.
pub fn image_of(scene_id: &str, map_id: &str) -> Option<Vec<u8>> {
    let index = load_index(scene_id);
    let map = index.maps.iter().find(|m| m.map.id == map_id)?;
    std::fs::read(folder(scene_id).join(&map.image)).ok()
}

/// Whether the scene may get improvised maps: 5e without a map of its own.
pub fn scene_wants_maps(state: &SceneState) -> bool {
    state.definition.is_5e()
        && state
            .definition
            .rules
            .as_ref()
            .is_none_or(|r| r.map_id.is_none())
}

/// The map a fight in this scene uses: the improvised map of the current place when it is
/// playable; `None` keeps fights without a board (scenes with a map of their own use that).
pub fn for_fight(state: &SceneState) -> Option<BattleMap> {
    if !scene_wants_maps(state) || state.world.location.trim().is_empty() {
        return None;
    }
    for_place(&state.definition.id, &state.world.location)
        .filter(|m| m.check.playable)
        .map(|m| m.map)
}

/// What to tell the painter about the place.
pub fn prompt(place: &str, context: &str) -> String {
    let context: String = context.chars().take(240).collect();
    format!(
        "top-down orthographic battle map for a tabletop roleplaying game, {place}{}, seen directly from above, \
         flat even lighting, clear readable layout, walls drawn as thick dark solid areas, no characters, no text, no grid lines",
        if context.trim().is_empty() {
            String::new()
        } else {
            format!(" ({})", context.trim())
        }
    )
}

pub const NEGATIVE: &str =
    "perspective, isometric, people, characters, text, letters, watermark, blurry, frame, border";

/// The rows of a map (for tests and the probe's format).
pub fn rows_of(map: &BattleMap) -> Vec<String> {
    let char_of = |c: &MapCell| -> char {
        match (
            c.kind,
            c.object.as_deref(),
            c.zone.as_deref(),
            c.ground.as_str(),
        ) {
            (_, _, Some("party"), _) => 'p',
            (_, _, Some("spawn"), _) => 's',
            (CellKind::Wall, ..) => '#',
            (CellKind::Difficult, ..) => '~',
            (_, Some("tree"), ..) => 'T',
            (_, Some("rock"), ..) => 'R',
            (_, _, _, "dirt_road") => '=',
            (_, _, _, "grass") => ',',
            _ => '.',
        }
    };
    (0..map.height)
        .map(|y| {
            (0..map.width)
                .map(|x| char_of(map.cell(GridPos::new(x, y)).expect("inside")))
                .collect()
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixtures() -> std::path::PathBuf {
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/battlemap")
    }

    #[test]
    fn reads_the_pictures_like_the_python_probe() {
        let expected: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(fixtures().join("expected.json")).unwrap(),
        )
        .unwrap();
        for (name, want) in expected.as_object().unwrap() {
            let img = image::open(fixtures().join(format!("{name}.png")))
                .unwrap()
                .to_rgb8();
            let map = map_from_image(&img, &format!("improvised_{name}"), name).unwrap();
            let rows = rows_of(&map);
            let want_rows: Vec<String> = want["rows"]
                .as_array()
                .unwrap()
                .iter()
                .map(|r| r.as_str().unwrap().into())
                .collect();
            assert_eq!(
                rows, want_rows,
                "{name}: rows differ from tools/battlemap_probe.py"
            );
            assert_eq!(map.tileset, want["tileset"].as_str().unwrap(), "{name}");
        }
    }

    #[test]
    fn a_map_without_room_is_not_playable_and_a_shipped_one_is() {
        let crypt = super::super::rules5e::battle_map("crypt_hall").unwrap();
        assert!(check(crypt).playable, "{:?}", check(crypt));
        let walls = image::RgbImage::from_pixel(160, 120, image::Rgb([20, 20, 24]));
        let check = map_from_image(&walls, "improvised_wall", "Wand").map(|m| check(&m));
        assert!(check.is_err() || !check.unwrap().playable);
    }
}
