#!/usr/bin/env node
// Prüft die modulare KI-Dokumentation:
// 1. Alle Links auf `docs/ai/*.md` in AI.md und ARCHITECTURE_INDEX.md existieren.
// 2. Keine Datei in `docs/ai/` ist verwaist (muss in AI.md und ARCHITECTURE_INDEX.md verlinkt sein).
// 3. Alle im Themen-Navigator von ARCHITECTURE_INDEX.md genannten Quellpfade existieren.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsAiDir = path.join(root, 'docs/ai');

const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const errors = [];

const aiMd = read('AI.md');
const archMd = read('ARCHITECTURE_INDEX.md');

if (!fs.existsSync(docsAiDir)) {
  console.error('✗ docs/ai/ fehlt');
  process.exit(1);
}

const moduleFiles = fs
  .readdirSync(docsAiDir)
  .filter((f) => f.endsWith('.md'))
  .sort();

if (moduleFiles.length === 0) {
  errors.push('Keine .md-Dateien in docs/ai/ gefunden');
}

for (const file of moduleFiles) {
  const rel = `docs/ai/${file}`;
  const full = path.join(root, rel);
  if (!fs.readFileSync(full, 'utf8').trim()) {
    errors.push(`${rel}: Datei ist leer`);
  }
  if (!aiMd.includes(rel)) {
    errors.push(`${rel}: nicht in AI.md verlinkt`);
  }
  if (!archMd.includes(rel)) {
    errors.push(`${rel}: nicht in ARCHITECTURE_INDEX.md verlinkt`);
  }
}

const checkDocLinks = (docName, content) => {
  const matches = content.matchAll(/docs\/ai\/([A-Za-z0-9_.-]+\.md)(?:#([A-Za-z0-9_-]+))?/g);
  for (const m of matches) {
    const rel = `docs/ai/${m[1]}`;
    const full = path.join(root, rel);
    if (!fs.existsSync(full)) {
      errors.push(`${docName}: kaputter Link auf ${rel}`);
      continue;
    }
    if (m[2]) {
      const targetContent = fs.readFileSync(full, 'utf8');
      const headings = [...targetContent.matchAll(/^#{1,6}\s+(.+)$/gm)].map((h) =>
        h[1]
          .trim()
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s-]/gu, '')
          .replace(/\s+/g, '-')
      );
      if (!headings.includes(m[2].toLowerCase())) {
        errors.push(`${docName}: Anker #${m[2]} nicht in ${rel} gefunden`);
      }
    }
  }
};

checkDocLinks('AI.md', aiMd);
checkDocLinks('ARCHITECTURE_INDEX.md', archMd);

const rulesDir = path.join(root, '.claude/rules');
let ruleFilesCount = 0;
if (fs.existsSync(rulesDir)) {
  const ruleFiles = fs.readdirSync(rulesDir).filter((f) => f.endsWith('.md')).sort();
  ruleFilesCount = ruleFiles.length;
  for (const rf of ruleFiles) {
    checkDocLinks(`.claude/rules/${rf}`, fs.readFileSync(path.join(rulesDir, rf), 'utf8'));
  }
}

// Quellcode-Pfade im Themen-Navigator von ARCHITECTURE_INDEX.md prüfen
const navSection = archMd.split('## 🧭 Themen-Navigator')[1]?.split('\n---')[0] ?? '';
const navPaths = [...navSection.matchAll(/`((?:src-tauri|src|crates|presets)\/[^`]+)`/g)].map((m) => m[1]);
for (const p of navPaths) {
  if (p.includes('*')) continue;
  const clean = p.replace(/\/$/, '');
  if (!fs.existsSync(path.join(root, clean))) {
    errors.push(`ARCHITECTURE_INDEX.md Navigator: Pfad existiert nicht: ${p}`);
  }
}

if (errors.length > 0) {
  for (const err of errors) console.error(`✗ ${err}`);
  process.exit(1);
}

const rulesNote = ruleFilesCount > 0 ? `, ${ruleFilesCount} .claude/rules` : '';
console.log(`✓ docs:check OK (${moduleFiles.length} Themen-Module unter docs/ai/${rulesNote}, ${navPaths.length} Navigator-Pfade geprüft)`);
