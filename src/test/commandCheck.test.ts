/**
 * Checks every `invoke('command', { … })` of the frontend against the Rust side: the command
 * exists and is registered in `generate_handler!`, every passed argument is a parameter of it
 * (Tauri expects camelCase), and no required parameter is missing. The data types themselves
 * come from ts-rs (`src/types/generated`); this covers the calls, which tauri-specta would
 * generate once it is stable.
 */
import { describe, expect, it } from 'vitest';

/** Sources by path, read at build time by Vite (like `backendErrorKeys.test.ts`). */
const rustSources = import.meta.glob<string>('../../src-tauri/src/**/*.rs', { query: '?raw', import: 'default', eager: true });
const frontendSources = import.meta.glob<string>(['../**/*.ts', '../**/*.tsx', '!../test/**', '!../types/generated/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
});
const shortPath = (file: string) => file.replace(/^(\.\.\/)+/, '');

/** Text from `open` up to its matching closing bracket (exclusive), or null. */
const balanced = (text: string, start: number, open: string, close: string): string | null => {
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === open) depth += 1;
    else if (text[i] === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start + 1, i);
    }
  }
  return null;
};

/** Splits at commas outside brackets; `<>` count only for Rust types (in TS they compare). */
const splitTopLevel = (text: string, angles = false): string[] => {
  const opening = angles ? '<([{' : '([{';
  const closing = angles ? '>)]}' : ')]}';
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (opening.includes(char)) depth += 1;
    if (closing.includes(char)) depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else current += char;
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
};

const camel = (name: string) => name.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** Parameters Tauri fills itself instead of taking them from the frontend. */
const INJECTED = /^(?:tauri::)?(?:State|AppHandle|Window|WebviewWindow|Webview)\b/;

interface RustCommand {
  file: string;
  params: { name: string; optional: boolean }[];
}

const rustCommands = (): Map<string, RustCommand> => {
  const commands = new Map<string, RustCommand>();
  for (const [file, source] of Object.entries(rustSources)) {
    const attribute = /#\[tauri::command\]/g;
    for (let match = attribute.exec(source); match; match = attribute.exec(source)) {
      const fn = /pub\s+(?:async\s+)?fn\s+(\w+)\s*(<[^(]*>)?\s*\(/g;
      fn.lastIndex = match.index;
      const signature = fn.exec(source);
      if (!signature) continue;
      const params = balanced(source, signature.index + signature[0].length - 1, '(', ')') ?? '';
      commands.set(signature[1]!, {
        file: shortPath(file),
        params: splitTopLevel(params, true)
          .map((param) => /^(?:mut\s+)?(\w+)\s*:\s*(.+)$/s.exec(param))
          .filter((m): m is RegExpExecArray => m !== null)
          .filter((m) => !INJECTED.test(m[2]!.trim()))
          .map((m) => ({ name: camel(m[1]!), optional: m[2]!.trim().startsWith('Option<') })),
      });
    }
  }
  return commands;
};

const registeredCommands = (): Set<string> => {
  const lib = rustSources['../../src-tauri/src/lib.rs'] ?? '';
  const start = lib.indexOf('generate_handler![');
  const list = (balanced(lib, lib.indexOf('[', start), '[', ']') ?? '').replace(/\/\/.*$/gm, '');
  return new Set(splitTopLevel(list).map((entry) => entry.split('::').at(-1)!.trim()));
};

interface Call {
  where: string;
  command: string;
  /** Keys of the argument object; null when a variable or spread hides them. */
  keys: string[] | null;
}

const frontendCalls = (): Call[] => {
  const calls: Call[] = [];
  for (const [file, source] of Object.entries(frontendSources)) {
    const call = /\binvoke(?:<.*?>)?\(\s*'(\w+)'\s*(,\s*)?/g;
    for (let match = call.exec(source); match; match = call.exec(source)) {
      const line = source.slice(0, match.index).split('\n').length;
      const where = `src/${shortPath(file)}:${line}`;
      const after = match.index + match[0].length;
      if (!match[2]) {
        calls.push({ where, command: match[1]!, keys: [] });
        continue;
      }
      if (source[after] !== '{') {
        calls.push({ where, command: match[1]!, keys: null });
        continue;
      }
      const body = balanced(source, after, '{', '}') ?? '';
      const entries = splitTopLevel(body);
      calls.push({
        where,
        command: match[1]!,
        keys: entries.some((e) => e.startsWith('...')) ? null : entries.map((e) => /^(\w+)/.exec(e)?.[1] ?? e),
      });
    }
  }
  return calls;
};

describe('frontend invoke calls match the Rust commands', () => {
  const commands = rustCommands();
  const registered = registeredCommands();
  const calls = frontendCalls();

  it('finds the commands and calls at all', () => {
    expect(commands.size).toBeGreaterThan(200);
    expect(calls.length).toBeGreaterThan(200);
  });

  it('only calls registered commands with their parameters', () => {
    const problems: string[] = [];
    for (const { where, command, keys } of calls) {
      const rust = commands.get(command);
      if (!rust) {
        problems.push(`${where}: Befehl '${command}' gibt es in Rust nicht`);
        continue;
      }
      if (!registered.has(command)) problems.push(`${where}: '${command}' fehlt in generate_handler!`);
      if (keys === null) continue;
      const names = new Set(rust.params.map((p) => p.name));
      for (const key of keys) {
        if (!names.has(key)) problems.push(`${where}: '${command}' hat keinen Parameter '${key}' (erwartet: ${[...names].join(', ') || '–'})`);
      }
      for (const param of rust.params) {
        if (!param.optional && !keys.includes(param.name)) problems.push(`${where}: '${command}' fehlt Pflichtargument '${param.name}' (${rust.file})`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('registers only commands that exist', () => {
    const unknown = [...registered].filter((name) => !commands.has(name));
    expect(unknown).toEqual([]);
  });
});
