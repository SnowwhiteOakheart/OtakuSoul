import { memo, useId } from 'react';
import type { BattleMap } from '../../types';
import { DIORAMA_TRANSFORM, isRevealed, projectBoardPoint, TILE } from './stageBoardProjection';
import { StageDioramaWalls } from './StageDioramaWalls';

/** Shallow cutaway walls leave the floor and its hit areas visible. */
export const StageDiorama = memo(function StageDiorama({ map }: { map: BattleMap }) {
  const glow = useId();
  const props = map.cells.flatMap((cell, index) => {
    const x = index % map.width;
    const y = Math.floor(index / map.width);
    if (!isRevealed(map, x, y)) return [];
    const pillar = cell.object === 'pillar';
    const fire = cell.object === 'brazier' || cell.object === 'campfire';
    const door = cell.object === 'door_closed' || cell.object === 'door_locked';
    if (!pillar && !fire && !door) return [];
    return [{ x, y, pillar, fire, door }];
  }).sort((a, b) => a.x + a.y - b.x - b.y);

  return (
    <g aria-hidden="true" pointerEvents="none">
      <defs>
        <radialGradient id={glow}>
          <stop stopColor="#fcb86a" stopOpacity={.36} />
          <stop offset="1" stopColor="#f59741" stopOpacity={0} />
        </radialGradient>
      </defs>
      <g transform={DIORAMA_TRANSFORM}>
        {props.filter(({ fire }) => fire).map(({ x, y }) => (
          <circle key={`${x}:${y}`} cx={(x + .5) * TILE} cy={(y + .5) * TILE} r={TILE * .86} fill={`url(#${glow})`} />
        ))}
      </g>
      <StageDioramaWalls map={map} />
      {props.map(({ x, y, pillar, fire, door }) => {
        const key = `${x}:${y}`;
        const center = projectBoardPoint((x + .5) * TILE, (y + .5) * TILE, true);
        if (fire) {
          return <ellipse key={key} cx={center.x} cy={center.y - 5} rx={10} ry={12} fill={`url(#${glow})`} />;
        }
        const rise = pillar ? 26 : 10;
        const besideWall = (dx: number, dy: number) => isRevealed(map, x + dx, y + dy)
          && map.cells[(y + dy) * map.width + x + dx]?.kind === 'wall';
        const verticalDoor = door && besideWall(0, -1) && besideWall(0, 1);
        const insetX = verticalDoor ? 25 : pillar ? 18 : 8;
        const insetY = verticalDoor ? 8 : pillar ? 18 : 25;
        const corner = (dx: number, dy: number) =>
          projectBoardPoint(x * TILE + dx, y * TILE + dy, true);
        const a = corner(insetX, insetY);
        const b = corner(TILE - insetX, insetY);
        const c = corner(TILE - insetX, TILE - insetY);
        const d = corner(insetX, TILE - insetY);
        const top = pillar ? '#8a8290' : '#b28c69';
        const face = pillar ? '#524b5c' : '#6d4833';
        return (
          <g key={key} stroke="#28232d" strokeWidth={1.2} strokeLinejoin="round">
            <path d={`M${b.x},${b.y - rise} L${c.x},${c.y - rise} V${c.y} L${b.x},${b.y} Z`} fill={face} />
            <path d={`M${d.x},${d.y - rise} L${c.x},${c.y - rise} V${c.y} L${d.x},${d.y} Z`} fill={face} opacity=".8" />
            <path d={`M${a.x},${a.y - rise} L${b.x},${b.y - rise} L${c.x},${c.y - rise} L${d.x},${d.y - rise} Z`} fill={top} />
          </g>
        );
      })}
    </g>
  );
});
