#!/usr/bin/env node
// Agentenfreundlicher Check-Runner: fasst bestandene Prüfungen auf eine kompakte Zeile je Schritt
// zusammen und gibt bei Fehlern nur die bereinigte Fehlerdiagnose statt tausender OK-/Worker-Zeilen aus.
// Nutzung:
//   npm run check:agent                  Vollprüfung (Docs, Lint, TypeCheck, Vitest, Rustfmt, Clippy, Cargo Test)
//   npm run check:agent -- --fast        Schneller Pre-Check (Docs, Lint, TypeCheck, cargo check)
//   npm run check:agent -- --web         Nur Web-Checks (Docs, Lint, TypeCheck, Vitest)
//   npm run check:agent -- --rust        Nur Rust-Checks (rustfmt, clippy, cargo test)
//   npm run check:agent -- --json        Strukturierte JSON-Ausgabe
//   npm run check:agent -- --verbose     Ungefilterte Live-Ausgabe
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const nodeBin = (relPath) => path.join(root, 'node_modules', relPath);

const KNOWN_FLAGS = new Set(['--fast', '--web', '--rust', '--i18n', '--json', '--verbose', '-v', '--keep-going', '-k', '--help', '-h']);
const args = process.argv.slice(2);
for (const arg of args) {
  if (!KNOWN_FLAGS.has(arg)) {
    console.error(`✗ Unbekannte Option: ${arg} (Hilfe mit --help)`);
    process.exit(2);
  }
}

const flags = new Set(args);
if (flags.has('--help') || flags.has('-h')) {
  console.log(`Nutzung: npm run check:agent -- [Optionen]
Optionen:
  --fast            Docs, Oxlint, tsc und cargo check
  --web             Docs, Oxlint, tsc und Vitest
  --rust            cargo fmt, cargo clippy und cargo test (rules5e + src-tauri)
  --i18n            Zusätzlich i18n:check ausführen
  --keep-going, -k  Bei Fehlern verbleibende Schritte trotzdem prüfen
  --verbose, -v     Live-Ausgabe ohne Kompaktfilter
  --json            Strukturierte JSON-Zusammenfassung auf stdout`);
  process.exit(0);
}

const verbose = flags.has('--verbose') || flags.has('-v');
const jsonOut = flags.has('--json');
const keepGoing = flags.has('--keep-going') || flags.has('-k');
const onlyFast = flags.has('--fast');
const onlyWeb = flags.has('--web');
const onlyRust = flags.has('--rust');
const includeI18n = flags.has('--i18n');

if ([onlyFast, onlyWeb, onlyRust].filter(Boolean).length > 1) {
  console.error('✗ Bitte nur einen Modus (--fast, --web oder --rust) wählen.');
  process.exit(2);
}

const fmtMs = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);
const bin = (rel) => {
  const full = nodeBin(rel);
  if (!fs.existsSync(full)) throw new Error(`Fehlende Abhängigkeit: ${full} (npm install ausführen)`);
  return full;
};

const stripVitestNoise = (text) =>
  text
    .split(/\r?\n/)
    .filter(
      (line) =>
        !/ExperimentalWarning:\s*`?localStorage`?\s+is not available/.test(line) &&
        !/Use `node --trace-warnings/.test(line),
    )
    .join('\n')
    .trim();

const tailLines = (text, limit = 120) => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length <= limit) return lines.join('\n');
  return `[... ${lines.length - limit} frühere Zeilen gekürzt ...]\n${lines.slice(-limit).join('\n')}`;
};

const extractVitestFailure = (output) => {
  const cleaned = stripVitestNoise(output);
  const idx = cleaned.search(/⎯+\s*Failed|\n\s*FAIL\s+/);
  return idx >= 0 ? tailLines(cleaned.slice(idx), 120) : tailLines(cleaned, 120);
};

const extractCargoFailure = (output) => {
  const lines = output.split(/\r?\n/);
  const failIdx = lines.findIndex((l) => /^failures:$/.test(l.trim()) || /^error(\[E\d+\])?:/.test(l.trim()));
  if (failIdx >= 0) return tailLines(lines.slice(failIdx).join('\n'), 140);
  return tailLines(output, 120);
};

const summarizeCargoTests = (output) => {
  const matches = [...output.matchAll(/test result:\s*\w+\.\s*(\d+)\s+passed;\s*(\d+)\s+failed;\s*(\d+)\s+ignored/g)];
  if (matches.length === 0) return 'OK';
  let passed = 0;
  let failed = 0;
  let ignored = 0;
  for (const m of matches) {
    passed += Number(m[1]);
    failed += Number(m[2]);
    ignored += Number(m[3]);
  }
  const extra = ignored > 0 ? `, ${ignored} ignoriert` : '';
  return `${passed} bestanden, ${failed} fehlgeschlagen${extra}`;
};

const ANSI_ESCAPE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

const summarizeVitest = (output) => {
  const clean = output.replace(ANSI_ESCAPE, '');
  const files = clean.match(/Test Files\s+([^\n]+)/)?.[1]?.trim();
  const tests = clean.match(/Tests\s+([^\n]+)/)?.[1]?.trim();
  if (files && tests) return `${files} | ${tests}`;
  return 'OK';
};

const steps = [];
if (!onlyRust) {
  steps.push({
    name: 'docs:check',
    cmd: process.execPath,
    args: ['tools/docs_check.mjs'],
    summarize: (out) => out.replace(/^✓\s*docs:check\s*/i, '').trim() || 'OK',
  });
  steps.push({
    name: 'oxlint',
    cmd: process.execPath,
    args: [bin('oxlint/bin/oxlint')],
    summarize: (out) => out.split(/\r?\n/).find((l) => l.includes('Found ') || l.includes('Finished '))?.trim() || 'OK',
  });
  steps.push({
    name: 'tsc',
    cmd: process.execPath,
    args: [bin('typescript/bin/tsc'), '--noEmit'],
    summarize: () => '0 Typfehler',
  });
}

if (!onlyFast && !onlyRust) {
  steps.push({
    name: 'vitest',
    cmd: process.execPath,
    args: [bin('vitest/vitest.mjs'), 'run', '--reporter=dot'],
    summarize: summarizeVitest,
    extractError: extractVitestFailure,
  });
}

if (includeI18n) {
  steps.push({
    name: 'i18n:check',
    cmd: process.execPath,
    args: ['tools/i18n_check.mjs'],
    summarize: () => 'Platzhalter & JSON gültig',
  });
}

if (onlyFast) {
  steps.push({
    name: 'cargo check',
    cmd: 'cargo',
    args: ['check', '--manifest-path', 'src-tauri/Cargo.toml', '--message-format=short'],
    summarize: () => 'OK',
    extractError: extractCargoFailure,
  });
} else if (!onlyWeb) {
  steps.push({
    name: 'cargo fmt (rules5e)',
    cmd: 'cargo',
    args: ['fmt', '--manifest-path', 'crates/otakusoul-rules5e/Cargo.toml', '--check'],
    summarize: () => 'formatiert',
  });
  steps.push({
    name: 'cargo fmt (src-tauri)',
    cmd: 'cargo',
    args: ['fmt', '--manifest-path', 'src-tauri/Cargo.toml', '--check'],
    summarize: () => 'formatiert',
  });
  steps.push({
    name: 'cargo clippy (rules5e)',
    cmd: 'cargo',
    args: ['clippy', '--manifest-path', 'crates/otakusoul-rules5e/Cargo.toml', '--all-targets', '--message-format=short', '--', '-D', 'warnings'],
    summarize: () => '0 Warnungen',
    extractError: extractCargoFailure,
  });
  steps.push({
    name: 'cargo clippy (src-tauri)',
    cmd: 'cargo',
    args: ['clippy', '--manifest-path', 'src-tauri/Cargo.toml', '--all-targets', '--message-format=short', '--', '-D', 'warnings'],
    summarize: () => '0 Warnungen',
    extractError: extractCargoFailure,
  });
  steps.push({
    name: 'cargo test (rules5e)',
    cmd: 'cargo',
    args: ['test', '-q', '--manifest-path', 'crates/otakusoul-rules5e/Cargo.toml'],
    summarize: summarizeCargoTests,
    extractError: extractCargoFailure,
  });
  steps.push({
    name: 'cargo test (src-tauri)',
    cmd: 'cargo',
    args: ['test', '-q', '--manifest-path', 'src-tauri/Cargo.toml'],
    summarize: summarizeCargoTests,
    extractError: extractCargoFailure,
  });
}

const totalStart = Date.now();
const results = [];

for (const step of steps) {
  const startedAt = Date.now();
  if (verbose) console.log(`\n→ [${step.name}]`);
  const res = spawnSync(step.cmd, step.args, {
    cwd: root,
    stdio: verbose ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  const durationMs = Date.now() - startedAt;
  const combined = `${res.stdout ?? ''}${res.stderr ? `\n${res.stderr}` : ''}`.trim();
  const ok = res.status === 0 && !res.error;
  const summary = ok ? step.summarize(combined) : `Exit ${res.status ?? 1}`;
  const diagnostics = ok ? undefined : (step.extractError ?? ((t) => tailLines(t, 120)))(combined || res.error?.message || '');

  results.push({ name: step.name, ok, durationMs, summary, ...(diagnostics ? { diagnostics } : {}) });

  if (!jsonOut && !verbose) {
    console.log(`${ok ? '✓' : '✗'} ${step.name}: ${summary} (${fmtMs(durationMs)})`);
  }
  if (!ok) {
    if (!jsonOut && !verbose && diagnostics) {
      console.error(`--- Diagnose ${step.name} ---\n${diagnostics}\n---`);
    }
    if (!keepGoing) break;
  }
}

const totalMs = Date.now() - totalStart;
const failed = results.filter((r) => !r.ok);

if (jsonOut) {
  console.log(JSON.stringify({ ok: failed.length === 0, durationMs: totalMs, results }, null, 2));
} else if (failed.length > 0) {
  console.error(`\n✗ ${failed.length} Prüfung(en) fehlgeschlagen (${fmtMs(totalMs)}): ${failed.map((f) => f.name).join(', ')}`);
} else {
  console.log(`\n✓ Alle ${results.length} Prüfungen bestanden (${fmtMs(totalMs)}).`);
}

process.exit(failed.length > 0 ? 1 : 0);
