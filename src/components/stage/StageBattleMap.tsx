import React, { useMemo } from 'react';
import { useStoreFields } from '../../store/useAppStore';
import { useTranslation } from '../../i18n';
import { tierLabel } from '../../utils/combatEvents';
import type { BattleMap, Combatant, CombatOptions } from '../../types';

/** Pixels per square in the SVG (tiles are drawn 64×64). */
const TILE = 64;
/** Ground tiles that come in numbered variants (`floor_stone_1` …). */
const VARIANTS: Record<string, number> = { floor_stone: 3, grass: 3 };
const CLASSIC_HEROES = ['thorin', 'lyra', 'finn', 'althea'];

const isParty = (c: Combatant) => c.role === 'player' || c.role === 'companion';
const isUp = (c: Combatant) => c.hp > 0 && !c.conditions.some((condition) => condition.name === 'fled');
const tierOf = (c: Combatant) =>
  c.hp <= 0 ? 'down' : c.hp >= c.max_hp ? 'unhurt' : c.hp * 2 > c.max_hp ? 'wounded' : 'badly_wounded';

/** Stable pseudo-random variant per square, so the floor does not repeat visibly. */
const variant = (x: number, y: number, count: number) => 1 + (((x * 73856093) ^ (y * 19349663)) >>> 0) % count;

const groundTile = (map: BattleMap, ground: string, x: number, y: number) => {
  const count = VARIANTS[ground];
  return `/stage/tiles/${map.tileset}/${count ? `${ground}_${variant(x, y, count)}` : ground}.svg`;
};

/** Doors are drawn for a wall running left–right; in a wall running up–down they turn. */
const doorRotation = (map: BattleMap, x: number, y: number) => {
  const wall = (dx: number, dy: number) => map.cells[(y + dy) * map.width + (x + dx)]?.kind === 'wall';
  return wall(0, -1) && wall(0, 1) && !(wall(-1, 0) && wall(1, 0)) ? 90 : 0;
};

/** Token image of a combatant: monsters by SRD id, the classic heroes by name, others by portrait. */
const tokenImage = (c: Combatant, portraits: Map<string, string>) => {
  if (c.stats5e?.monster_id) return `/stage/tokens/monster_${c.stats5e.monster_id}.svg`;
  const first = c.name.split(' ')[0]!.toLowerCase();
  if (CLASSIC_HEROES.includes(first)) return `/stage/tokens/hero_${first}.svg`;
  return portraits.get(c.name.toLowerCase()) ?? null;
};

interface Props {
  map: BattleMap;
  combatants: Combatant[];
  currentIndex: number;
  options: CombatOptions | null;
  disabled: boolean;
  onAction: (action: string) => void;
}

/**
 * The 5e battle map: tiles from public/stage/tiles, tokens with health rings, the squares the
 * current combatant may move to (click to move) and enemies in reach (click to attack).
 */
export const StageBattleMap: React.FC<Props> = ({ map, combatants, currentIndex, options, disabled, onAction }) => {
  const { t } = useTranslation();
  const { availableCharacters } = useStoreFields('availableCharacters');
  const portraits = useMemo(
    () => new Map(availableCharacters.filter((c) => c.avatar_data_url).map((c) => [c.card.data.name.toLowerCase(), c.avatar_data_url!])),
    [availableCharacters],
  );
  const attackFor = (target: Combatant) =>
    options?.actions
      .filter((o) => o.target_id === target.id)
      .sort((a, b) => Number(a.disadvantage) - Number(b.disadvantage))[0];

  return (
    <svg
      viewBox={`0 0 ${map.width * TILE} ${map.height * TILE}`}
      role="group"
      aria-label={t('board.title', { name: map.name.de || map.name.en })}
      data-testid="battle-map"
      className="w-full h-auto max-h-full select-none rounded-xl border border-slate-800 bg-black"
    >
      <defs>
        <clipPath id="board-token-clip" clipPathUnits="objectBoundingBox">
          <circle cx="0.5" cy="0.5" r="0.5" />
        </clipPath>
      </defs>
      {map.cells.map((cell, index) => {
        const x = index % map.width;
        const y = Math.floor(index / map.width);
        return (
          <g key={index} transform={`translate(${x * TILE} ${y * TILE})`}>
            <image href={groundTile(map, cell.ground, x, y)} width={TILE} height={TILE} />
            {/* Walls darker and the 5-ft grid on open ground, so rooms read at a glance. */}
            {cell.kind === 'wall' ? (
              <rect width={TILE} height={TILE} fill="#020617" opacity={0.6} />
            ) : (
              <rect width={TILE} height={TILE} fill="none" stroke="#020617" strokeOpacity={0.35} strokeWidth={1} />
            )}
            {cell.object && (
              <image
                href={`/stage/tiles/${map.tileset}/${cell.object}.svg`}
                width={TILE}
                height={TILE}
                transform={cell.object.startsWith('door') ? `rotate(${doorRotation(map, x, y)} ${TILE / 2} ${TILE / 2})` : undefined}
              />
            )}
          </g>
        );
      })}

      {/* Squares to move to */}
      {!disabled &&
        options?.reachable.map((square) => (
          <rect
            key={`${square.x},${square.y}`}
            x={square.x * TILE + 2}
            y={square.y * TILE + 2}
            width={TILE - 4}
            height={TILE - 4}
            rx={8}
            role="button"
            tabIndex={0}
            aria-label={t('board.moveTo', { x: square.x + 1, y: square.y + 1, feet: square.feet })}
            data-move={`${square.x}:${square.y}`}
            onClick={() => onAction(`move:${square.x}:${square.y}`)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onAction(`move:${square.x}:${square.y}`)}
            className="cursor-pointer fill-emerald-400/25 stroke-emerald-300/70 hover:fill-emerald-400/45 focus:fill-emerald-400/45 outline-none"
            strokeWidth={2}
          />
        ))}

      {/* Tokens */}
      {combatants.map((c, index) => {
        if (!c.position || !isUp(c)) return null;
        const cx = c.position.x * TILE + TILE / 2;
        const cy = c.position.y * TILE + TILE / 2;
        const image = tokenImage(c, portraits);
        const current = index === currentIndex;
        const ratio = Math.max(0, Math.min(1, c.hp / Math.max(1, c.max_hp)));
        const ring = isParty(c) ? (ratio > 0.5 ? '#22c55e' : ratio > 0.25 ? '#f59e0b' : '#ef4444') : '#e11d48';
        const attack = !disabled && !isParty(c) ? attackFor(c) : undefined;
        const label = isParty(c)
          ? t('board.token', { name: c.name, state: t('fight.hp', { current: c.hp, max: c.max_hp }) })
          : t('board.token', { name: c.name, state: tierLabel(tierOf(c)) });
        return (
          <g
            key={c.id}
            data-token={c.id}
            role={attack ? 'button' : 'img'}
            tabIndex={attack ? 0 : undefined}
            aria-label={attack ? t('board.attack', { target: c.name }) : label}
            onClick={attack ? () => onAction(attack.id) : undefined}
            onKeyDown={attack ? (e) => (e.key === 'Enter' || e.key === ' ') && onAction(attack.id) : undefined}
            className={attack ? 'cursor-crosshair' : undefined}
          >
            <title>{label}</title>
            {current && <circle cx={cx} cy={cy} r={30} fill="none" stroke="#fbbf24" strokeWidth={4} className="animate-pulse motion-reduce:animate-none" />}
            <circle cx={cx} cy={cy} r={26} fill="#0f172a" />
            {image ? (
              <image href={image} x={cx - 24} y={cy - 24} width={48} height={48} clipPath="url(#board-token-clip)" preserveAspectRatio="xMidYMid slice" />
            ) : (
              <text x={cx} y={cy + 7} textAnchor="middle" fontSize={22} fontWeight={700} fill="#e2e8f0">{c.name.charAt(0)}</text>
            )}
            {/* Health ring: the party shows its share of hit points, enemies only a red frame. */}
            <circle
              cx={cx}
              cy={cy}
              r={25}
              fill="none"
              stroke={ring}
              strokeWidth={4}
              strokeDasharray={isParty(c) ? `${ratio * 157} 157` : undefined}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
            {attack && <circle cx={cx} cy={cy} r={29} fill="none" stroke="#f43f5e" strokeWidth={2} strokeDasharray="6 4" />}
          </g>
        );
      })}
    </svg>
  );
};
