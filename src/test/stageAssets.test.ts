// @vitest-environment jsdom
/**
 * Rules for the Stage graphics in public/stage (todo_assets.md): plain SVG with a fixed set of
 * elements, the right size per kind, no external links or scripts, unique ids, size limits.
 * Regenerated assets are checked here before they reach the board.
 */
import { describe, expect, it } from 'vitest';
import monsterData from '../../presets/srd5/monsters.json';

const svgs = import.meta.glob<string>('../../public/stage/**/*.svg', { query: '?raw', import: 'default', eager: true });

const ALLOWED = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath']);
const RULES: Record<string, { size: number; maxBytes: number }> = {
  tiles: { size: 64, maxBytes: 12 * 1024 },
  tokens: { size: 256, maxBytes: 20 * 1024 },
  conditions: { size: 24, maxBytes: 6 * 1024 },
};

describe('stage assets', () => {
  it('exist for the board and the starter party', () => {
    const names = Object.keys(svgs).map((file) => file.replace(/^.*public\/stage\//, ''));
    for (const required of ['tiles/dungeon/floor_stone_1.svg', 'tiles/dungeon/wall_stone.svg', 'tiles/dungeon/door_closed.svg', 'tokens/hero_thorin.svg', 'tokens/monster_goblin.svg']) {
      expect(names).toContain(required);
    }
  });

  it('give every SRD monster a token', () => {
    const names = Object.keys(svgs).map((file) => file.replace(/^.*public\/stage\//, ''));
    const missing = monsterData.monsters.map((m) => `tokens/monster_${m.id}.svg`).filter((token) => !names.includes(token));
    expect(missing).toEqual([]);
  });

  it('follow the SVG rules', () => {
    const problems: string[] = [];
    for (const [file, source] of Object.entries(svgs)) {
      const name = file.replace(/^.*public\/stage\//, '');
      const rule = RULES[name.split('/')[0]!];
      if (!rule) continue;
      const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
      const root = doc.documentElement;
      if (root.nodeName !== 'svg' || doc.getElementsByTagName('parsererror').length) {
        problems.push(`${name}: kein gültiges SVG`);
        continue;
      }
      const elements = [root, ...Array.from(root.getElementsByTagName('*'))];
      const forbidden = [...new Set(elements.map((el) => el.localName).filter((tag) => !ALLOWED.has(tag)))];
      if (forbidden.length) problems.push(`${name}: verbotene Elemente ${forbidden.join(', ')}`);
      for (const el of elements) {
        for (const attribute of Array.from(el.attributes)) {
          if (attribute.name.endsWith('href') && !attribute.value.startsWith('#')) problems.push(`${name}: externer Link`);
          if (attribute.name === 'style' || attribute.name === 'class') problems.push(`${name}: Attribut ${attribute.name}`);
        }
      }
      const ids = elements.map((el) => el.getAttribute('id')).filter(Boolean);
      if (new Set(ids).size !== ids.length) problems.push(`${name}: doppelte IDs`);
      const box = (root.getAttribute('viewBox') ?? '').trim().split(/\s+/).map(Number);
      if (box[2] !== rule.size || box[3] !== rule.size) problems.push(`${name}: viewBox ${box.join(' ')} statt ${rule.size}×${rule.size}`);
      if (source.length > rule.maxBytes) problems.push(`${name}: ${Math.round(source.length / 1024)} KB zu groß`);
    }
    expect(problems).toEqual([]);
  });
});
