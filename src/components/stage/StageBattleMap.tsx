import { findCharacterByName } from '../../utils/characterName';
import React, { useId, useMemo, useState } from 'react';
import { Box, Crosshair, Map, Maximize2, Minus, PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react';
import { useStoreFields } from '../../store/useAppStore';
import { useTranslation, type TranslationKey } from '../../i18n';
import { localizedName, tierLabel } from '../../utils/combatEvents';
import { areaSquares, squaresBetween } from '../../utils/spellArea';
import type { BattleMap, CharacterProfile, Combatant, CombatOptions, GridPos } from '../../types';
import { usePersistentFlag } from '../../hooks/usePersistentFlag';
import { boardBounds, DIORAMA_TRANSFORM, isRevealed, projectBoardPoint, TILE } from './stageBoardProjection';
import { StageDiorama } from './StageDiorama';
import { useStageBoardCamera } from './useStageBoardCamera';

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

const activateWithKey = (event: React.KeyboardEvent<SVGElement>, action: () => void) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  action();
};

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
export const boardTokenImage = (c: Combatant, characters: CharacterProfile[]) => {
  // Every SRD monster has a token (checked by stageAssets.test.ts).
  if (c.stats5e?.monster_id) return `/stage/tokens/monster_${c.stats5e.monster_id}.svg`;
  const first = c.name.split(' ')[0]!.toLowerCase();
  if (CLASSIC_HEROES.includes(first)) return `/stage/tokens/hero_${first}.svg`;
  return findCharacterByName(characters, c.name)?.avatar_data_url ?? null;
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
  focused: boolean;
  onToggleFocus: () => void;
  selectedTarget?: string | null;
  onTarget?: (id: string) => void;
}

const BattleMapTiles = React.memo<{ map: BattleMap; diorama: boolean }>(({ map, diorama }) => {
  return (
    <>
      {map.cells.map((cell, index) => {
        const x = index % map.width;
        const y = Math.floor(index / map.width);
        if (!isRevealed(map, x, y)) {
          return <rect key={index} x={x * TILE} y={y * TILE} width={TILE} height={TILE} fill="transparent" data-fog="" />;
        }
          if (diorama && cell.kind === 'wall') {
            return <rect key={index} x={x * TILE} y={y * TILE} width={TILE} height={TILE} fill="#342d38" />;
          }
        return (
          <g key={index} transform={`translate(${x * TILE} ${y * TILE})`}>
            <image href={groundTile(map, cell.ground, x, y)} width={TILE} height={TILE} />
            {/* Walls darker and the 5-ft grid on open ground, so rooms read at a glance. */}
            {cell.kind === 'wall' ? (
                <rect width={TILE} height={TILE} fill="#020617" opacity={.22} />
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
    </>
  );
});
BattleMapTiles.displayName = 'BattleMapTiles';

/**
 * The 5e battle map: tiles from public/stage/tiles, tokens with health rings, the squares the
 * current combatant may move to (click to move) and enemies in reach (click to attack).
 */
export const StageBattleMap: React.FC<Props> = ({
  map, combatants, currentIndex, options, disabled, onAction, exploring = false, focused, onToggleFocus, selectedTarget, onTarget,
}) => {
  const { t } = useTranslation();
  const { availableCharacters, stageAimedSpell, appLanguage } = useStoreFields('availableCharacters', 'stageAimedSpell', 'appLanguage');
  const [hover, setHover] = useState<GridPos | null>(null);
  const [hoverLabel, setHoverLabel] = useState('');
  const [diorama, setDiorama] = usePersistentFlag('otakusoul.stage.diorama', false);
  const bounds = useMemo(() => boardBounds(map, diorama), [map, diorama]);
  const camera = useStageBoardCamera(bounds);
  const clip = useId();
  // An area spell being aimed: squares it may be aimed at, and what it would cover from the hovered one.
  const aimed = stageAimedSpell ? options?.spells.find((s) => s.spell_id === stageAimedSpell.spellId) : undefined;
  const actor = combatants[currentIndex];
  const caster = actor?.position;
  const focus = exploring
    ? combatants.find((c) => c.role === 'player' && c.position)?.position
    : caster;
  const boardFocus = focus && isRevealed(map, focus.x, focus.y)
    ? projectBoardPoint((focus.x + .5) * TILE, (focus.y + .5) * TILE, diorama)
    : null;
  const transform = diorama ? DIORAMA_TRANSFORM : undefined;
  const aimSquares = useMemo(() => {
    if (!aimed || !caster) return [];
    // Self-origin areas (range 0) only take a direction: any square up to their size away.
    const rangeFt = aimed.range_ft > 0 ? aimed.range_ft : (aimed.area?.size_ft ?? 5);
    const squares: GridPos[] = [];
    map.cells.forEach((cell, index) => {
      const p = { x: index % map.width, y: Math.floor(index / map.width) };
      const away = squaresBetween(caster, p);
      const seen = isRevealed(map, p.x, p.y);
      if (seen && cell.kind !== 'wall' && away * 5 <= rangeFt && (away > 0 || aimed.range_ft > 0)) squares.push(p);
    });
    return squares;
  }, [aimed, caster, map]);
  const covered = aimed && caster && hover ? (aimed.area ? areaSquares(aimed.area, caster, hover) : [hover]) : [];
  const castAt = (p: GridPos) => stageAimedSpell && onAction(`cast:${stageAimedSpell.spellId}:${stageAimedSpell.slot}:@${p.x}:${p.y}`);

  // Fog of war: only what the party has seen is drawn (maps without fog show everything).
  const revealed = (x: number, y: number) => isRevealed(map, x, y);
  const occupied = new Set(combatants.filter((c) => c.position && isUp(c)).map((c) => `${c.position!.x}:${c.position!.y}`));
  const move = !disabled && !aimed && hover ? options?.reachable.find(({ x, y }) => hover.x === x && hover.y === y) : undefined;
  const route = caster && move?.path?.length ? [caster, ...move.path] : [];
  const firstHidden = route.findIndex(({ x, y }) => !revealed(x, y));
  const visibleRoute = firstHidden === -1 ? route : route.slice(0, firstHidden);
  const movePath = visibleRoute.map(({ x, y }) => `${(x + .5) * TILE},${(y + .5) * TILE}`).join(' ');
  const hint = disabled ? '' : move ? t('board.moveCost', { feet: move.feet }) : hoverLabel;
  const clearHover = () => {
    setHover(null);
    setHoverLabel('');
  };
  const setView = (next: boolean) => {
    if (diorama === next) return;
    setDiorama(next);
    camera.reset();
    clearHover();
  };
  const control = 'inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-slate-100 aria-pressed:bg-accent-600/25 aria-pressed:text-accent-100 disabled:opacity-40';

  const attackFor = (target: Combatant) =>
    options?.actions
      .filter((o) => o.target_id === target.id)
      .sort((a, b) => Number(a.disadvantage) - Number(b.disadvantage))[0];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-100">{localizedName(map.name, appLanguage)}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label={t('board.view')} className="flex rounded-lg border border-slate-700 bg-slate-900 p-0.5">
            <button type="button" className={control} aria-pressed={!diorama} data-board-view="top" onClick={() => setView(false)}>
              <Map aria-hidden="true" size={15} />{t('board.topDown')}
            </button>
            <button type="button" className={control} aria-pressed={diorama} data-board-view="diorama" onClick={() => setView(true)}>
              <Box aria-hidden="true" size={15} />{t('board.diorama')}
            </button>
          </div>
          <div role="group" aria-label={t('board.camera')} className="flex rounded-lg border border-slate-700 bg-slate-900 p-0.5">
            <button type="button" className={control} title={t('board.zoomOut')} aria-label={t('board.zoomOut')} disabled={camera.zoom <= .75} onClick={() => camera.zoomBy(1 / 1.25)}>
              <Minus aria-hidden="true" size={15} />
            </button>
            <button type="button" className={control} title={t('board.zoomIn')} aria-label={t('board.zoomIn')} disabled={camera.zoom >= 4} onClick={() => camera.zoomBy(1.25)}>
              <Plus aria-hidden="true" size={15} />
            </button>
            <button type="button" className={control} title={t('board.fit')} aria-label={t('board.fit')} onClick={camera.reset}>
              <Maximize2 aria-hidden="true" size={15} />
            </button>
            <button type="button" className={control} title={t('board.focusActor')} aria-label={t('board.focusActor')} disabled={!boardFocus} onClick={() => boardFocus && camera.focus(boardFocus)}>
              <Crosshair aria-hidden="true" size={15} />
            </button>
          </div>
          <button
            type="button"
            data-board-focus-toggle
            onClick={onToggleFocus}
            className={`${control} border border-slate-700 bg-slate-900`}
          >
            {focused ? <PanelLeftOpen aria-hidden="true" size={15} /> : <PanelLeftClose aria-hidden="true" size={15} />}
            {t(focused ? 'board.withChat' : 'board.onlyMap')}
          </button>
        </div>
      </div>
      <div className="relative min-h-60 flex-1 overflow-hidden rounded-xl border border-slate-700 bg-[radial-gradient(ellipse_at_center,#302936,#14121b_75%)]">
        <svg
          viewBox={camera.viewBox}
          role="group"
          aria-label={t('board.title', { name: localizedName(map.name, appLanguage) })}
          data-testid="battle-map"
          data-projection={diorama ? 'diorama' : 'top'}
          className="absolute inset-0 h-full w-full touch-none select-none"
          {...camera.pointerEvents}
        >
          <defs>
            <clipPath id={clip} clipPathUnits="objectBoundingBox">
              <circle cx="0.5" cy="0.5" r="0.5" />
            </clipPath>
          </defs>
          <g transform={transform} pointerEvents="none">
            <BattleMapTiles map={map} diorama={diorama} />
          </g>
          {diorama && <StageDiorama map={map} />}

          <g transform={transform}>
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
                        onMouseEnter={() => setHoverLabel(action)}
                        onMouseLeave={clearHover}
                        onFocus={() => setHoverLabel(action)}
                        onBlur={clearHover}
                        onClick={() => onAction(`use:${x}:${y}`)}
                        onKeyDown={(e) => activateWithKey(e, () => onAction(`use:${x}:${y}`))}
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
                      tabIndex={0}
                      aria-label={t('board.walkTo', { x: x + 1, y: y + 1 })}
                      data-explore={`${x}:${y}`}
                      onClick={() => onAction(`move:${x}:${y}`)}
                      onKeyDown={(e) => activateWithKey(e, () => onAction(`move:${x}:${y}`))}
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
                {covered.filter(({ x, y }) => revealed(x, y)).map((p) => (
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
                    onMouseLeave={clearHover}
                    onFocus={() => setHover(p)}
                    onBlur={clearHover}
                    onClick={() => castAt(p)}
                    onKeyDown={(e) => activateWithKey(e, () => castAt(p))}
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
                  onMouseEnter={() => setHover(square)}
                  onMouseLeave={clearHover}
                  onFocus={() => setHover(square)}
                  onBlur={clearHover}
                  onClick={() => onAction(`move:${square.x}:${square.y}`)}
                  onKeyDown={(e) => activateWithKey(e, () => onAction(`move:${square.x}:${square.y}`))}
                  className="cursor-pointer fill-emerald-400/5 stroke-emerald-200/40 hover:fill-emerald-400/30 focus:fill-emerald-400/30 focus:stroke-emerald-100 outline-none"
                  strokeWidth={1.5}
                />
              ))}
              {visibleRoute.length > 1 && <polyline data-board-path points={movePath} fill="none" stroke="#a7f3d0" strokeWidth={4} strokeDasharray="6 5" strokeLinecap="round" pointerEvents="none" />}
          </g>

          {/* Tokens */}
          {combatants.map((c, index) => {
            if (!c.position || !isUp(c) || !revealed(c.position.x, c.position.y)) return null;
            const { x: cx, y: baseY } = projectBoardPoint((c.position.x + .5) * TILE, (c.position.y + .5) * TILE, diorama);
            const cy = baseY - (diorama ? 13 : 0);
            const scale = diorama ? .8 : 1;
            const image = boardTokenImage(c, availableCharacters);
            const current = exploring ? c.role === 'player' : index === currentIndex;
            const ratio = Math.max(0, Math.min(1, c.hp / Math.max(1, c.max_hp)));
            const ring = isParty(c) ? (ratio > 0.5 ? '#22c55e' : ratio > 0.25 ? '#f59e0b' : '#ef4444') : '#e11d48';
            const attack = !disabled && !aimed && !isParty(c) ? attackFor(c) : undefined;
            const attackName = actor?.stats5e?.attacks.find((a) => a.id === attack?.attack_id)?.name;
            const attackLabel = attack && attackName
              ? `${t('fight.attackOn', { attack: localizedName(attackName, appLanguage), target: c.name })}${attack.disadvantage ? ` · ${t('fight.disadvantage')}` : ''}`
              : t('board.attack', { target: c.name });
            const activate = attack ? () => onTarget ? onTarget(c.id) : onAction(attack.id) : undefined;
            const label = isParty(c)
              ? t('board.token', { name: c.name, state: t('fight.hp', { current: c.hp, max: c.max_hp }) })
              : t('board.token', { name: c.name, state: tierLabel(tierOf(c)) });
            return (
              <g
                key={c.id}
                data-token={c.id}
                role={attack ? 'button' : 'img'}
                tabIndex={attack ? 0 : undefined}
                aria-label={attack ? attackLabel : label}
                aria-pressed={attack && onTarget ? selectedTarget === c.id : undefined}
                onClick={activate}
                onKeyDown={activate ? (e) => activateWithKey(e, activate) : undefined}
                onMouseEnter={attack ? () => setHoverLabel(attackLabel) : undefined}
                onMouseLeave={attack ? clearHover : undefined}
                onFocus={attack ? () => setHoverLabel(attackLabel) : undefined}
                onBlur={attack ? clearHover : undefined}
                className={attack ? 'cursor-crosshair focus-visible:brightness-150' : undefined}
                // While aiming, clicks go through the tokens to the square below.
                pointerEvents={aimed ? 'none' : undefined}
              >
                <title>{label}</title>
                {diorama && <ellipse cx={cx} cy={baseY + 6} rx={20} ry={9} fill="#100e18" opacity=".72" />}
                <g transform={diorama ? `translate(${cx * (1 - scale)} ${cy * (1 - scale)}) scale(${scale})` : undefined}>
                  {current && <circle cx={cx} cy={cy} r={30} fill="none" stroke="#fbbf24" strokeWidth={4} className="animate-pulse motion-reduce:animate-none" />}
                  <circle cx={cx} cy={cy} r={26} fill="#0f172a" />
                  {image ? (
                    <image href={image} x={cx - 24} y={cy - 24} width={48} height={48} clipPath={`url(#${clip})`} preserveAspectRatio="xMidYMid slice" />
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
                  {attack && <circle cx={cx} cy={cy} r={29} fill="none" stroke={selectedTarget === c.id ? '#fda4af' : '#fb7185'} strokeWidth={selectedTarget === c.id ? 4 : 2} strokeDasharray={selectedTarget === c.id ? undefined : '6 4'} />}
                </g>
              </g>
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-x-2 bottom-2 flex flex-wrap items-end justify-between gap-1 text-xs text-slate-200">
          <span className="rounded-md bg-[#15111d]/90 px-2 py-1 text-[#d7d1df]">{t('board.scale')}</span>
          {hint && <span className="rounded-md bg-[#15111d]/95 px-2 py-1 text-[#f0e9f9]" data-board-preview>{hint}</span>}
        </div>
      </div>
    </div>
  );
};
