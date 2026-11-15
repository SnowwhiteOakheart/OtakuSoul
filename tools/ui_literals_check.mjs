#!/usr/bin/env node
// Finds interface text written straight into components instead of the language files:
// words in JSX text (oxlint's `react/jsx-no-literals`) and in `title`, `placeholder`,
// `aria-label` and `alt` attributes. Units, product names and examples that read the same in
// every language are allowed below. Exit code 1 lists what to move into `presets/locales/ui/`.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Words that are the same in every interface language (units, products, protocol terms). */
const ALLOWED_WORDS = new Set([
  // units and hardware
  'GB', 'MB', 'KB', 'ms', 'tok', 'CPU', 'GPU', 'RAM', 'VRAM', 'VRM', 'NPC', 'NSFW', 'URL', 'JSON', 'json',
  // products and services
  'OtakuSoul', 'Discord', 'ElevenLabs', 'Edge-TTS', 'PrismML', 'ComfyUI', 'Automatic1111', 'WebUI', 'OpenAI',
  'DALL-E', 'NovelAI', 'Image', 'Gen', 'VRoid', 'Hub', 'Transport', 'SD',
  // VRoid Hub's own name for its terms (shown as pixiv writes it)
  'Model', 'Data', 'Conditions', 'of', 'Use',
  // Discord bot commands and the socket path are typed as they are
  'ask', 'character', 'status', 'reset', 'Text', 'Name', 'run', 'user', 'UID', 'discord-ipc-0',
  // language names written in their own language
  'Deutsch', 'English', 'Français', 'Español',
]);

/** Attribute values that are examples or addresses, not sentences (file names, model IDs, patterns
 * are let through on their own: they contain `.`, `_`, `/`, `\` or are one hyphenated token). */
const ALLOWED_ATTRIBUTES = [
  /^https?:\/\//,
  /^MTAx/, // Discord bot token prefix
  /^Avatar$/,
  /^Anime, Tsundere/,
  /^1girl, /,
  /^low quality, /,
  /^masterpiece, /,
];

const WORD = /[A-Za-zÄÖÜäöüßÀ-ÿ][A-Za-zÄÖÜäöüßÀ-ÿ0-9-]{1,}/g;
const findings = [];

// 1. JSX text, as oxlint sees it (columns are byte offsets).
let out = '';
try {
  out = execFileSync(process.execPath, [path.join(root, 'node_modules/oxlint/bin/oxlint'), '-A', 'all', '-D', 'react/jsx-no-literals', '--format', 'unix', 'src'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (e) {
  out = e.stdout ?? '';
}
const lines = new Map();
const lineOf = (file, n) => {
  if (!lines.has(file)) lines.set(file, readFileSync(path.join(root, file), 'utf8').split(/\r?\n/));
  return lines.get(file)[n - 1] ?? '';
};
for (const row of out.split(/\r?\n/)) {
  const match = /^(.+?):(\d+):(\d+):/.exec(row);
  if (!match || /[\\/]test[\\/]/.test(match[1])) continue;
  const [, file, ln, col] = match;
  const bytes = Buffer.from(lineOf(file, Number(ln)), 'utf8');
  const text = bytes.subarray(Number(col) - 1).toString('utf8').split(/[<{]/)[0].trim();
  const words = (text.replace(/&\w+;/g, ' ').match(WORD) ?? []).filter((w) => !ALLOWED_WORDS.has(w));
  if (words.length > 0) findings.push(`${file}:${ln}: Text „${text}“`);
}

// 2. Attributes with a fixed string.
const files = execFileSync('git', ['ls-files', 'src/*.tsx', 'src/**/*.tsx'], { cwd: root, encoding: 'utf8' })
  .split(/\r?\n/)
  .filter((f) => f && !/[\\/]test[\\/]/.test(f));
const ATTRIBUTE = /\b(title|placeholder|aria-label|alt)="([^"]*)"/g;
for (const file of files) {
  lineOf(file, 1);
  lines.get(file).forEach((line, index) => {
    for (const [, name, value] of line.matchAll(ATTRIBUTE)) {
      if (!/[A-Za-zÄÖÜäöüß]{3,}/.test(value) || ALLOWED_ATTRIBUTES.some((re) => re.test(value))) continue;
      if (/[._/\\]/.test(value) || /^\w+(-\w+)+$/.test(value)) continue;
      const words = (value.match(WORD) ?? []).filter((w) => !ALLOWED_WORDS.has(w));
      if (words.length > 0) findings.push(`${file}:${index + 1}: ${name}="${value}"`);
    }
  });
}

if (findings.length > 0) {
  console.error(`✗ ui:literals: ${findings.length} feste Oberflächentexte – bitte über t()/tPlural() und presets/locales/ui/*.json:`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log('✓ ui:literals: keine festen Oberflächentexte');
