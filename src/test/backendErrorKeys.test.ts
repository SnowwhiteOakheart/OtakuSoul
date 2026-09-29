import { describe, expect, it } from 'vitest';
import { LOCALES } from '../i18n';

/** Rust sources by path, read at build time by Vite. */
const rustSources = import.meta.glob<string>('../../src-tauri/src/**/*.rs', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** Text of the macro call starting at `start` (just after `err!(`), up to its closing paren. */
const callBody = (source: string, start: number) => {
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (char === '(') depth++;
    else if (char === ')' && depth-- === 0) return source.slice(start, i);
  }
  return source.slice(start);
};

/** Every `err!("backend.…", name = …)` call in the Rust sources with its parameter names. */
const errCalls = Object.entries(rustSources)
  // The macro's own module only has documentation examples and test codes.
  .filter(([file]) => !file.endsWith('error.rs'))
  .flatMap(([, source]) => {
    return [...source.matchAll(/err!\(\s*"(backend\.[\w.]+)"/g)].map((match) => {
      const body = callBody(source, match.index! + match[0].length);
      return { key: match[1]!, params: [...body.matchAll(/,\s*(\w+)\s*=(?!=)/g)].map((param) => param[1]!) };
    });
  });

describe('backend error codes', () => {
  it('finds the err! calls in the Rust sources', () => {
    expect(errCalls.length).toBeGreaterThan(200);
  });

  it('has a translation for every code in every language', () => {
    for (const [lang, dict] of Object.entries(LOCALES)) {
      const missing = errCalls.filter(({ key }) => !(key in dict)).map(({ key }) => key);
      expect(missing, lang).toEqual([]);
    }
  });

  it('fills every placeholder of the German text', () => {
    const de = LOCALES.de as Record<string, string>;
    for (const { key, params } of errCalls) {
      const placeholders = [...(de[key] ?? '').matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
      for (const name of placeholders) expect(params, `${key} needs {{${name}}}`).toContain(name);
    }
  });
});
