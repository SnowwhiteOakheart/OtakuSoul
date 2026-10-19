#!/usr/bin/env node
// Checks interface language files against the German reference (presets/locales/ui/de.json):
// missing and unknown keys, different {{placeholders}}, empty texts and missing __meta.
//
//   npm run i18n:check                 all shipped languages
//   npm run i18n:check -- path/pl.json one file (e.g. from <Daten>/locales/ui/)
//
// Missing keys only warn (the app shows the fallback text); broken placeholders, empty texts and
// invalid JSON fail with exit code 1.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const uiDir = path.join(root, 'presets/locales/ui');
const META = '__meta';

const read = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`✗ ${file}: ${e.message}`);
    return null;
  }
};

const placeholders = (text) => (text.match(/\{\{\w+\}\}/g) ?? []).sort().join(', ');

const reference = read(path.join(uiDir, 'de.json'));
if (!reference) process.exit(1);
delete reference[META];

const files = process.argv.slice(2);
const targets = files.length
  ? files
  : fs.readdirSync(uiDir).filter((f) => f.endsWith('.json') && f !== 'de.json').map((f) => path.join(uiDir, f));

let failed = false;
for (const file of targets) {
  const dict = read(file);
  if (!dict) {
    failed = true;
    continue;
  }
  const id = path.basename(file, '.json');
  const errors = [];
  const warnings = [];
  const meta = dict[META];
  if (!meta || typeof meta !== 'object') warnings.push(`kein "${META}" (Name in der Sprachauswahl wäre „${id}“)`);
  else if (!meta.name) warnings.push(`"${META}.name" fehlt`);
  if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(id)) errors.push(`Dateiname „${id}“ ist kein Sprachkürzel (z. B. pl, pt-BR) – die App ignoriert die Datei`);

  const missing = Object.keys(reference).filter((key) => !(key in dict));
  const unknown = Object.keys(dict).filter((key) => key !== META && !(key in reference));
  for (const [key, text] of Object.entries(dict)) {
    if (key === META || !(key in reference)) continue;
    if (typeof text !== 'string') errors.push(`${key}: kein Text`);
    else if (!text.trim()) errors.push(`${key}: leer`);
    else if (placeholders(text) !== placeholders(reference[key]))
      errors.push(`${key}: Platzhalter „${placeholders(text)}“ statt „${placeholders(reference[key])}“`);
  }
  const total = Object.keys(reference).length;
  const translated = total - missing.length;
  console.log(`${errors.length ? '✗' : '✓'} ${id}: ${translated}/${total} übersetzt (${Math.floor((translated / total) * 100)} %)`);
  if (missing.length) warnings.push(`${missing.length} fehlende Schlüssel, z. B. ${missing.slice(0, 5).join(', ')}`);
  if (unknown.length) warnings.push(`${unknown.length} unbekannte Schlüssel (veraltet oder Tippfehler): ${unknown.slice(0, 5).join(', ')}`);
  for (const w of warnings) console.log(`  ! ${w}`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  if (errors.length) failed = true;
}
process.exit(failed ? 1 : 0);
