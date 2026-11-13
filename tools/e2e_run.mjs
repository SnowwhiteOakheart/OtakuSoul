#!/usr/bin/env node
// Führt gezielt einzelne E2E-Tests aus `package.json` (`e2e:run`) aus.
// Beispiele:
//   npm run e2e:filter -- stage
//   npm run e2e:filter -- --build memory chat-group
//   npm run e2e:filter -- --list avatar
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const allScripts = (pkg.scripts?.['e2e:run'] ?? '')
  .split('&&')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((cmd) => cmd.replace(/^node\s+/, ''));

const args = process.argv.slice(2);
const withBuild = args.includes('--build');
const listOnly = args.includes('--list');
const filters = args.filter((a) => a !== '--build' && a !== '--list');

const selected = filters.length
  ? allScripts.filter((script) => filters.some((f) => script.toLowerCase().includes(f.toLowerCase())))
  : allScripts;

if (selected.length === 0) {
  console.error(`✗ Keine passenden E2E-Skripte für Filter: ${filters.join(', ')}`);
  process.exit(1);
}

if (listOnly) {
  console.log(`${selected.length} E2E-Skripte gefunden:`);
  for (const s of selected) console.log(`  - ${s}`);
  process.exit(0);
}

const run = (cmd, cmdArgs) => {
  const res = spawnSync(cmd, cmdArgs, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (res.status !== 0) process.exit(res.status ?? 1);
};

if (withBuild) {
  console.log('→ Baue E2E-Binary (npm run e2e:build)…');
  run('npm', ['run', 'e2e:build']);
}

console.log(`→ Starte ${selected.length} von ${allScripts.length} E2E-Tests…`);
for (const [idx, script] of selected.entries()) {
  console.log(`\n[${idx + 1}/${selected.length}] node ${script}`);
  run('node', [script]);
}
console.log(`\n✓ ${selected.length} E2E-Test(s) bestanden.`);
