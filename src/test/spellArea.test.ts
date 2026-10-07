import { describe, expect, it } from 'vitest';
import { areaSquares } from '../utils/spellArea';

const has = (squares: { x: number; y: number }[], x: number, y: number) => squares.some((s) => s.x === x && s.y === y);

// Same expectations as `areas_cover_the_expected_squares` in rules5e/tests.rs.
describe('areaSquares', () => {
  const caster = { x: 5, y: 5 };

  it('cone widens towards its end and spares the caster', () => {
    const cone = areaSquares({ shape: 'cone', size_ft: 15 }, caster, { x: 9, y: 5 });
    expect(has(cone, 6, 5) && has(cone, 8, 6) && has(cone, 8, 4)).toBe(true);
    expect(has(cone, 5, 5) || has(cone, 4, 5) || has(cone, 9, 5)).toBe(false);
  });

  it('sphere covers a square around the point', () => {
    expect(areaSquares({ shape: 'sphere', size_ft: 20 }, caster, { x: 2, y: 2 })).toHaveLength(81);
  });

  it('cube starts next to the caster', () => {
    const cube = areaSquares({ shape: 'cube', size_ft: 15 }, caster, { x: 5, y: 9 });
    expect(has(cube, 5, 6) && has(cube, 4, 8)).toBe(true);
    expect(has(cube, 5, 9)).toBe(false);
  });
});
