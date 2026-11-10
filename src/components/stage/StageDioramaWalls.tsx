import { useId } from 'react';
import type { BattleMap } from '../../types';
import { DIORAMA_TRANSFORM, isRevealed, projectBoardPoint, TILE } from './stageBoardProjection';

// A wall fills the middle third of its tile and joins neighbors with arms on the same grid.
const BLOCK = TILE / 3;
const SIDES = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

interface WallBlock {
  x: number;
  y: number;
  height: number;
}

const blockKey = (x: number, y: number) => `${x}:${y}`;

function wallBlocks(map: BattleMap) {
  const blocks = new Map<string, WallBlock>();
  const visibleCell = (x: number, y: number) => isRevealed(map, x, y) ? map.cells[y * map.width + x] : undefined;
  const floorBehind = (x: number, y: number) => {
    const cell = visibleCell(x, y);
    return cell && cell.kind !== 'wall';
  };
  map.cells.forEach((cell, index) => {
    const x = index % map.width;
    const y = Math.floor(index / map.width);
    if (cell.kind !== 'wall' || !isRevealed(map, x, y)) return;

    // A raised wall projects back over the floor. Cut it down if that floor is visible.
    const height = floorBehind(x - 1, y) || floorBehind(x, y - 1) ? 12 : 37;
    const addBlock = (dx: number, dy: number) => {
      const bx = x * 3 + 1 + dx;
      const by = y * 3 + 1 + dy;
      blocks.set(blockKey(bx, by), { x: bx, y: by, height });
    };
    addBlock(0, 0);
    for (const [dx, dy] of SIDES) {
      const neighbor = visibleCell(x + dx, y + dy);
      if (neighbor?.kind === 'wall' || neighbor?.object?.startsWith('door_')) addBlock(dx, dy);
    }
  });
  return blocks;
}

export const StageDioramaWalls = ({ map }: { map: BattleMap }) => {
  const id = useId();
  const masonry = `${id}-masonry`;
  const coping = `${id}-coping`;
  const shade = `${id}-shade`;
  const blocks = wallBlocks(map);
  const ordered = [...blocks.values()].sort((a, b) => a.x + a.y - b.x - b.y);

  return (
    <g data-diorama-walls>
      <defs>
        <pattern id={masonry} patternUnits="userSpaceOnUse" width="64" height="24">
          <rect width="64" height="24" fill="#403841" />
          <path d="M0 1H19l1 2v7H0z M22 1h24l1 2v7H22z M49 1h15v9H49z M0 13h8l1 2v7H0z M34 13h20l2 2v7H34z" fill="#71666b" />
          <path d="M11 13h20l1 1v8H11z M58 13h6v9h-6z" fill="#62575f" />
          <path d="M1 2h17m6 0h21m6 0h12M1 14h6m6 0h17m6 0h17m6 0h4" stroke="#ad9991" strokeOpacity=".48" strokeWidth=".8" />
          <path d="M5 6l3-1 2 1m19 1h4m21 0 3-1M16 18l4 1m21 0 4-2m7 3h2" fill="none" stroke="#433841" strokeOpacity=".65" strokeWidth=".8" />
        </pattern>
        <pattern id={coping} patternUnits="userSpaceOnUse" width="48" height="32">
          <rect width="48" height="32" fill="#5b5057" />
          <path d="M0 1h27l2 2-1 12H0z M31 1h17v14H30z M0 17h12l2 2-1 12H0z M16 17h32v14H15z" fill="#887b7d" />
          <path d="M0 2h26m6 0h16M0 18h11m7 0h30" stroke="#b0a19c" strokeOpacity=".65" strokeWidth="1" />
          <path d="M6 6l3-2m9 6 5 1 3-2m11-3h5M4 23l4 2m12-2 4-2 5 1m10 5h4" fill="none" stroke="#594e58" strokeOpacity=".65" strokeWidth=".9" />
        </pattern>
        <linearGradient id={shade} x2="0" y2="1">
          <stop stopColor="#221925" stopOpacity="0" />
          <stop offset="1" stopColor="#221925" stopOpacity=".36" />
        </linearGradient>
      </defs>
      {ordered.map(({ x, y, height }) => {
        const left = projectBoardPoint(x * BLOCK, (y + 1) * BLOCK, true);
        const front = projectBoardPoint((x + 1) * BLOCK, (y + 1) * BLOCK, true);
        const faces = [
          { lower: blocks.get(blockKey(x, y + 1))?.height ?? 0, along: x * BLOCK, from: left, slope: .44, dark: .08 },
          { lower: blocks.get(blockKey(x + 1, y))?.height ?? 0, along: -(y + 1) * BLOCK, from: front, slope: -.44, dark: .29 },
        ];
        return (
          <g key={blockKey(x, y)}>
            {faces.map(({ lower, along, from, slope, dark }) => {
              if (lower >= height) return null;
              const transform = `matrix(.84 ${slope} 0 1 ${from.x - .84 * along} ${from.y - slope * along})`;
              const face = { x: along, y: -height, width: BLOCK + .1, height: height - lower };
              return (
                <g key={slope} transform={transform}>
                  <rect {...face} fill={`url(#${masonry})`} />
                  <rect {...face} fill="#211923" opacity={dark} />
                  <rect {...face} fill={`url(#${shade})`} />
                </g>
              );
            })}
            <g transform={`translate(0 ${-height})`}>
              <rect x={x * BLOCK} y={y * BLOCK} width={BLOCK + .1} height={BLOCK + .1} transform={DIORAMA_TRANSFORM} fill={`url(#${coping})`} />
            </g>
          </g>
        );
      })}
    </g>
  );
};
