import type { Area, GridPos } from '../types';

/** Feet per square on the battle map. */
const SQUARE_FT = 5;

/** Squares between two positions (diagonals count as 5 ft, like the engine). */
export const squaresBetween = (a: GridPos, b: GridPos) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/**
 * Squares an area spell covers, the same way the rules engine counts them (`area_squares` in
 * `rules5e/spells.rs`): spheres around `point`; cones, cubes and lines from the caster towards it.
 */
export function areaSquares(area: Area, caster: GridPos, point: GridPos): GridPos[] {
  const size = Math.floor(area.size_ft / SQUARE_FT);
  const dx = point.x - caster.x;
  const dy = point.y - caster.y;
  const length = Math.max(Math.hypot(dx, dy), 1e-9);
  const ux = dx / length;
  const uy = dy / length;
  const centre = area.shape === 'sphere' ? point : caster;
  const reach = size + 1;
  const squares: GridPos[] = [];
  for (let y = centre.y - reach; y <= centre.y + reach; y += 1) {
    for (let x = centre.x - reach; x <= centre.x + reach; x += 1) {
      const p = { x, y };
      let inside: boolean;
      if (area.shape === 'sphere') {
        inside = squaresBetween(p, point) <= size;
      } else if (x === caster.x && y === caster.y) {
        inside = false;
      } else {
        const px = x - caster.x;
        const py = y - caster.y;
        const along = px * ux + py * uy;
        const across = Math.abs(px * uy - py * ux);
        const ahead = along > 0 && along <= size + 0.5;
        if (area.shape === 'cone') inside = ahead && across <= along / 2 + 0.5;
        else if (area.shape === 'line') inside = ahead && across <= 0.5;
        else inside = ahead && across <= size / 2;
      }
      if (inside) squares.push(p);
    }
  }
  return squares;
}
