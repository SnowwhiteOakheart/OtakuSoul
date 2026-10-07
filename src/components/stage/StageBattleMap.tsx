import React, { useMemo, useState } from 'react';
import { useStoreFields } from '../../store/useAppStore';
import { useTranslation, type TranslationKey } from '../../i18n';
import { localizedName, tierLabel } from '../../utils/combatEvents';
import { areaSquares, squaresBetween } from '../../utils/spellArea';
import type { BattleMap, Combatant, CombatOptions, GridPos } from '../../types';

/** Pixels per square in the SVG (tiles are drawn 64×64). */
const TILE = 64;
/** Ground tiles that come in numbered variants (`floor_stone_1` …). */
const VARIANTS: Record<string, number> = { floor_stone: 3, grass: 3 };
const CLASSIC_HEROES = ['thorin', 'lyra', 'finn', 'althea'];

/** Objects that block walking (same list as `BLOCKING_OBJECTS` in `rules5e/map.rs`). */
const BLOCKING = new Set([
  'door_locked', 'pillar', 'chest_closed', 'chest_open', 'altar', 'altar_dark', 'sarcophagus', 'brazier',
  'tree', 'tree_pine', 'rock', 'wagon_left', 'wagon_right', 'crates', 'campfire',
]);
/** Objects the party can use while exploring. */
const USABLE = new Set(['door_closed', 'door_open', 'door_locked', 'chest_closed']);

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
  /** Outside fights: clicks walk the party and use doors and chests. */
  exploring?: boolean;
}

/**
 * The 5e battle map: tiles from public/stage/tiles, tokens with health rings, the squares the
 * current combatant may move to (click to move) and enemies in reach (click to attack).
 */
export const StageBattleMap: React.FC<Props> = ({ map, combatants, currentIndex, options, disabled, onAction, exploring = false }) => {
  const { t } = useTranslation();
  const { availableCharacters, stageAimedSpell, appLanguage } = useStoreFields('availableCharacters', 'stageAimedSpell', 'appLanguage');
  const [hover, setHover] = useState<GridPos | null>(null);
  const portraits = useMemo(
    () => new Map(availableCharacters.filter((c) => c.avatar_data_url).map((c) => [c.card.data.name.toLowerCase(), c.avatar_data_url!])),
    [availableCharacters],
  );
  // An area spell being aimed: squares it may be aimed at, and what it would cover from the hovered one.
  const aimed = stageAimedSpell ? options?.spells.find((s) => s.spell_id === stageAimedSpell.spellId) : undefined;
  const caster = combatants[currentIndex]?.position;
  const aimSquares = useMemo(() => {
    if (!aimed || !caster) return [];
    // Self-origin areas (range 0) only take a direction: any square up to their size away.
    const rangeFt = aimed.range_ft > 0 ? aimed.range_ft : (aimed.area?.size_ft ?? 5);
    const squares: GridPos[] = [];
    map.cells.forEach((cell, index) => {
      const p = { x: index % map.width, y: Math.floor(index / map.width) };
      const away = squaresBetween(caster, p);
      const seen = map.revealed.length === 0 || !!map.revealed[index];
      if (seen && cell.kind !== 'wall' && away * 5 <= rangeFt && (away > 0 || aimed.range_ft > 0)) squares.push(p);
    });
    return squares;
  }, [aimed, caster, map]);
  const covered = aimed && caster && hover ? (aimed.area ? areaSquares(aimed.area, caster, hover) : [hover]) : [];
  const castAt = (p: GridPos) => stageAimedSpell && onAction(`cast:${stageAimedSpell.spellId}:${stageAimedSpell.slot}:@${p.x}:${p.y}`);

  // Fog of war: only what the party has seen is drawn (maps without fog show everything).
  const revealed = (x: number, y: number) => map.revealed.length === 0 || !!map.revealed[y * map.width + x];
  const occupied = new Set(combatants.filter((c) => c.position && isUp(c)).map((c) => `${c.position!.x}:${c.position!.y}`));

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
        if (!revealed(x, y)) {
          return <rect key={index} x={x * TILE} y={y * TILE} width={TILE} height={TILE} fill="#020617" data-fog="" />;
        }
        return (
          <g key={index} transform={`translate(${x * TILE} ${y * TILE})`}>
            <image href={groundTile(map, cell.ground, x, y)} width={TILE} height={TILE} />
            {/* Walls darker and the 5-ft grid on open ground, so rooms read at a glance. */}
            {cell.kind === 'wall' ? (
              <rect width={TILE} height={TILE} fill="#020617" opacity={0.55} />
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

      {/* Exploring: walk to any seen square, use doors and chests. */}
      {exploring && !disabled && (
        <g data-testid="explore-layer">
          {map.cells.map((cell, index) => {
            const x = index % map.width;
            const y = Math.floor(index / map.width);
            if (!revealed(x, y)) return null;
            const object = cell.object ?? '';
            const usable = USABLE.has(object);
            if (usable) {
              const action = t(`explore.object.${object}` as TranslationKey);
              return (
                <rect
                  key={`use-${index}`}
                  x={x * TILE + 3}
                  y={y * TILE + 3}
                  width={TILE - 6}
                  height={TILE - 6}
                  rx={10}
                  role="button"
                  tabIndex={0}
                  aria-label={t('board.use', { action, x: x + 1, y: y + 1 })}
                  data-use={`${x}:${y}`}
                  onClick={() => onAction(`use:${x}:${y}`)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onAction(`use:${x}:${y}`)}
                  className="cursor-pointer fill-transparent stroke-amber-300/60 hover:fill-amber-300/20 focus:fill-amber-300/20 outline-none"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                >
                  <title>{action}</title>
                </rect>
              );
            }
            const walkable = cell.kind !== 'wall' && cell.kind !== 'pit' && !BLOCKING.has(object) && !occupied.has(`${x}:${y}`);
            if (!walkable) return null;
            return (
              <rect
                key={`walk-${index}`}
                x={x * TILE + 2}
                y={y * TILE + 2}
                width={TILE - 4}
                height={TILE - 4}
                rx={8}
                role="button"
                aria-label={t('board.walkTo', { x: x + 1, y: y + 1 })}
                data-explore={`${x}:${y}`}
                onClick={() => onAction(`move:${x}:${y}`)}
                className="cursor-pointer fill-transparent hover:fill-sky-300/20 hover:stroke-sky-200/60 outline-none"
                strokeWidth={2}
              />
            );
          })}
        </g>
      )}

      {/* Aiming an area spell: the covered squares light up, a click casts. */}
      {!disabled && aimed && (
        <g data-testid="spell-aim">
          {covered.map((p) => (
            <rect key={`area-${p.x},${p.y}`} x={p.x * TILE} y={p.y * TILE} width={TILE} height={TILE} fill="#f97316" opacity={0.35} pointerEvents="none" data-area={`${p.x}:${p.y}`} />
          ))}
          {aimSquares.map((p) => (
            <rect
              key={`aim-${p.x},${p.y}`}
              x={p.x * TILE + 2}
              y={p.y * TILE + 2}
              width={TILE - 4}
              height={TILE - 4}
              rx={8}
              role="button"
              tabIndex={0}
              aria-label={t('board.castAt', { spell: localizedName(aimed.name, appLanguage), x: p.x + 1, y: p.y + 1 })}
              data-cast-at={`${p.x}:${p.y}`}
              onMouseEnter={() => setHover(p)}
              onFocus={() => setHover(p)}
              onClick={() => castAt(p)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && castAt(p)}
              className="cursor-crosshair fill-violet-400/10 stroke-violet-300/40 hover:fill-violet-400/25 focus:fill-violet-400/25 outline-none"
              strokeWidth={1.5}
            />
          ))}
        </g>
      )}

      {/* Squares to move to */}
      {!disabled && !aimed &&
        options?.reachable.filter((square) => revealed(square.x, square.y)).map((square) => (
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
        if (!c.position || !isUp(c) || !revealed(c.position.x, c.position.y)) return null;
        const cx = c.position.x * TILE + TILE / 2;
        const cy = c.position.y * TILE + TILE / 2;
        const image = tokenImage(c, portraits);
        const current = index === currentIndex;
        const ratio = Math.max(0, Math.min(1, c.hp / Math.max(1, c.max_hp)));
        const ring = isParty(c) ? (ratio > 0.5 ? '#22c55e' : ratio > 0.25 ? '#f59e0b' : '#ef4444') : '#e11d48';
        const attack = !disabled && !aimed && !isParty(c) ? attackFor(c) : undefined;
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
            // While aiming, clicks go through the tokens to the square below.
            pointerEvents={aimed ? 'none' : undefined}
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
