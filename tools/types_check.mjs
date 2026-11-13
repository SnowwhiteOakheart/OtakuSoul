#!/usr/bin/env node
// Prüft, ob alle aus Rust generierten TypeScript-Typen (`src/types/generated/`) aktuell sind.
// Normalisiert Zeilenenden (LF vs. CRLF unter Windows) und hinterlässt ohne `--update` keine
// uncommitteten Änderungen im Arbeitsbaum.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const genDir = path.join(root, 'src', 'types', 'generated');
const update = process.argv.includes('--update');

const normalize = (buf) => buf.toString('utf8').replace(/\r\n/g, '\n');

const walk = (dir, base = dir, out = new Map()) => {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, base, out);
    } else if (entry.name.endsWith('.ts')) {
      const rel = path.relative(base, full).replace(/\\/g, '/');
      const raw = fs.readFileSync(full);
      out.set(rel, { full, raw, norm: normalize(raw) });
    }
  }
  return out;
};

const before = walk(genDir);

const runCargo = (cargoArgs) =>
  spawnSync('cargo', cargoArgs, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });

const steps = [
  ['test', '-q', '--manifest-path', 'src-tauri/Cargo.toml', '--lib', 'export_bindings'],
  ['test', '-q', '--manifest-path', 'crates/otakusoul-rules5e/Cargo.toml', '--lib', 'export_bindings'],
];

for (const args of steps) {
  const res = runCargo(args);
  if (res.status !== 0 || res.error) {
    console.error(`✗ types:check: cargo ${args.join(' ')} fehlgeschlagen`);
    const combined = `${res.stdout ?? ''}\n${res.stderr ?? ''}`.trim();
    if (combined) console.error(combined.split(/\r?\n/).slice(-60).join('\n'));
    process.exit(res.status ?? 1);
  }
}

const after = walk(genDir);
const changed = [];
const added = [];

for (const [rel, cur] of after) {
  const prev = before.get(rel);
  if (!prev) {
    added.push(rel);
    if (!update) fs.rmSync(cur.full, { force: true });
    continue;
  }
  if (cur.norm !== prev.norm) {
    changed.push(rel);
    if (!update) fs.writeFileSync(cur.full, prev.raw);
  } else if (!cur.raw.equals(prev.raw)) {
    // Reines CRLF/LF-Rauschen unter Windows zurücksetzen, falls Zeileninhalt identisch ist.
    fs.writeFileSync(cur.full, prev.raw);
  }
}

if (changed.length > 0 || added.length > 0) {
  console.error(`✗ types:check: Rust↔TS-Typ-Drift gefunden (${changed.length} geändert, ${added.length} neu):`);
  for (const f of [...changed, ...added].slice(0, 20)) console.error(`  - src/types/generated/${f}`);
  if (changed.length + added.length > 20) console.error(`  … (+${changed.length + added.length - 20} weitere)`);
  if (!update) console.error('→ Zum Aktualisieren `npm run types:gen` ausführen.');
  process.exit(1);
}

console.log(`✓ types:check: OK (${after.size} Typ-Dateien aktuell)`);
