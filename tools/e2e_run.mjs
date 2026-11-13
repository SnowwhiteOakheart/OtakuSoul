#!/usr/bin/env node
// Führt gezielt E2E-Tests aus `package.json` (`e2e:run`) agentenfreundlich aus.
// Standard: kompakte Statuszeilen je Skript; volle Ausgabe nur bei Fehlern (oder `--verbose`).
// Beispiele:
//   npm run e2e:filter -- stage
//   npm run e2e:filter -- --build memory chat-group
//   npm run e2e:filter -- --list avatar
//   npm run e2e:filter -- --keep-going --json stage
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

const KNOWN_FLAGS = new Set(['--build', '--list', '--verbose', '-v', '--stream', '--keep-going', '-k', '--json', '--help', '-h']);
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('-')));
const filters = args.filter((a) => !a.startsWith('-'));

for (const flag of flags) {
  if (!KNOWN_FLAGS.has(flag)) {
    console.error(`✗ Unbekannte Option: ${flag} (Hilfe mit --help)`);
    process.exit(2);
  }
}

if (flags.has('--help') || flags.has('-h')) {
  console.log(`Nutzung: npm run e2e:filter -- [Optionen] [Filter...]
Optionen:
  --list              Gefundene Skripte nur auflisten
  --build             Vorab npm run e2e:build ausführen
  --keep-going, -k    Bei Fehlern weitere Skripte trotzdem ausführen
  --verbose, -v       Live-Ausgabe inklusive tauri-driver-Logs
  --json              Maschinenlesbare JSON-Zusammenfassung ausgeben`);
  process.exit(0);
}

const withBuild = flags.has('--build');
const listOnly = flags.has('--list');
const verbose = flags.has('--verbose') || flags.has('--stream');
const keepGoing = flags.has('--keep-going') || flags.has('-k');
const jsonOut = flags.has('--json');

const selected = filters.length
  ? allScripts.filter((script) => filters.some((f) => script.toLowerCase().includes(f.toLowerCase())))
  : allScripts;

if (selected.length === 0) {
  console.error(`✗ Keine passenden E2E-Skripte für Filter: ${filters.join(', ')}`);
  process.exit(1);
}

if (listOnly) {
  if (jsonOut) {
    console.log(JSON.stringify({ total: selected.length, scripts: selected }, null, 2));
  } else {
    console.log(`${selected.length} E2E-Skripte gefunden:`);
    for (const s of selected) console.log(`  - ${s}`);
  }
  process.exit(0);
}

const formatDuration = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);
const tailLines = (text, limit = 120) => {
  const lines = text.trimEnd().split(/\r?\n/).filter(Boolean);
  if (lines.length <= limit) return lines.join('\n');
  return `[... ${lines.length - limit} frühere Zeilen gekürzt ...]\n${lines.slice(-limit).join('\n')}`;
};

const runBuffered = (cmd, cmdArgs, extraEnv = {}) => {
  const startedAt = Date.now();
  const env = { ...process.env, ...extraEnv };
  const useShell = process.platform === 'win32' && cmd !== 'node';
  if (verbose) {
    const res = spawnSync(cmd, cmdArgs, { cwd: root, stdio: 'inherit', shell: useShell, env });
    return { ok: res.status === 0, exitCode: res.status ?? 1, durationMs: Date.now() - startedAt, output: '' };
  }
  const res = spawnSync(cmd, cmdArgs, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    shell: useShell,
    env,
  });
  const combined = `${res.stdout ?? ''}${res.stderr ? `\n${res.stderr}` : ''}`;
  const errorNote = res.error ? `\n${res.error.message}` : '';
  return {
    ok: res.status === 0 && !res.error,
    exitCode: res.status ?? 1,
    durationMs: Date.now() - startedAt,
    output: `${combined}${errorNote}`.trim(),
  };
};

const logLine = (msg) => {
  if (!jsonOut) console.log(msg);
};

if (withBuild) {
  logLine('→ Baue E2E-Binary (npm run e2e:build)…');
  const buildRes = runBuffered('npm', ['run', 'e2e:build']);
  if (!buildRes.ok) {
    if (buildRes.output) console.error(tailLines(buildRes.output, 120));
    process.exit(buildRes.exitCode);
  }
  logLine(`✓ Build fertig (${formatDuration(buildRes.durationMs)})`);
}

const suiteStart = Date.now();
const results = [];
logLine(`→ Starte ${selected.length} von ${allScripts.length} E2E-Tests…`);

for (const [idx, script] of selected.entries()) {
  if (verbose) console.log(`\n[${idx + 1}/${selected.length}] node ${script}`);
  const res = runBuffered('node', [script], verbose ? { OTAKUSOUL_E2E_VERBOSE: '1' } : {});
  const entry = {
    script,
    ok: res.ok,
    exitCode: res.exitCode,
    durationMs: res.durationMs,
    ...(res.ok ? {} : { outputTail: tailLines(res.output, 120) }),
  };
  results.push(entry);

  if (res.ok) {
    if (!verbose) logLine(`[${idx + 1}/${selected.length}] ✓ ${script} (${formatDuration(res.durationMs)})`);
  } else {
    if (!verbose) logLine(`[${idx + 1}/${selected.length}] ✗ ${script} (${formatDuration(res.durationMs)}, Exit ${res.exitCode})`);
    if (!jsonOut && entry.outputTail) {
      console.error(`--- Fehlerausgabe ${script} ---\n${entry.outputTail}\n---`);
    }
    if (!keepGoing) break;
  }
}

const totalMs = Date.now() - suiteStart;
const failed = results.filter((r) => !r.ok);
const passed = results.length - failed.length;

if (jsonOut) {
  console.log(
    JSON.stringify(
      {
        ok: failed.length === 0,
        total: results.length,
        passed,
        failed: failed.length,
        durationMs: totalMs,
        results,
      },
      null,
      2,
    ),
  );
} else if (failed.length > 0) {
  console.error(`\n✗ ${failed.length} von ${results.length} E2E-Test(s) fehlgeschlagen (${formatDuration(totalMs)}): ${failed.map((f) => f.script).join(', ')}`);
} else {
  console.log(`\n✓ ${passed} E2E-Test(s) bestanden (${formatDuration(totalMs)}).`);
}

process.exit(failed.length > 0 ? 1 : 0);
