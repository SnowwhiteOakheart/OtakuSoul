import type { BattleMap, GridPos } from '../../types';

export const TILE = 64;
export const DIORAMA_TRANSFORM = 'matrix(.84 .44 -.84 .44 0 0)';

export const projectBoardPoint = (x: number, y: number, diorama: boolean): GridPos =>
  diorama ? { x: (x - y) * .84, y: (x + y) * .44 } : { x, y };

export const isRevealed = (map: BattleMap, x: number, y: number) =>
  x >= 0 && y >= 0 && x < map.width && y < map.height
  && (map.revealed.length === 0 || !!map.revealed[y * map.width + x]);

/** Fit the revealed tiles, including a little room for wall height and markers. */
export function boardBounds(map: BattleMap, diorama: boolean) {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  const include = (x: number, y: number) => {
    const p = projectBoardPoint(x, y, diorama);
    left = Math.min(left, p.x);
    top = Math.min(top, p.y);
    right = Math.max(right, p.x);
    bottom = Math.max(bottom, p.y);
  };
  const includeRect = (x: number, y: number, width: number, height: number) => {
    include(x, y);
    include(x + width, y);
    include(x, y + height);
    include(x + width, y + height);
  };
  map.cells.forEach((_, index) => {
    const x = index % map.width;
    const y = Math.floor(index / map.width);
    if (isRevealed(map, x, y)) includeRect(x * TILE, y * TILE, TILE, TILE);
  });
  if (!Number.isFinite(left)) includeRect(0, 0, map.width * TILE, map.height * TILE);
  const margin = diorama ? 32 : 12;
  return {
    x: (left + right) / 2,
    y: (top + bottom) / 2 - (diorama ? 8 : 0),
    width: right - left + margin * 2,
    height: bottom - top + margin * 2,
  };
}
