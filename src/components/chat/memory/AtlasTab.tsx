import { useEffect, useMemo, useState } from 'react';
import { Link2, Network } from 'lucide-react';
import { api } from '../../../services/api';
import { useAppStore } from '../../../store/useAppStore';
import { memoryCharacter } from '../../../utils/groupChat';
import { errorMessage } from '../../../utils/errors';
import { useTranslation, type TranslationKey } from '../../../i18n';
import type { AtlasNode, MemoryAtlas } from '../../../types';
import { LANES, LANE_Y, edgePath, layoutAtlas, neighbours, type Lane } from '../../../utils/memoryAtlas';

/** Dot colours per kind (fill) – beliefs warm, experiences in the accent colour. */
const FILL: Record<string, string> = {
  identity: 'fill-rose-400',
  habit: 'fill-amber-300',
  milestone: 'fill-yellow-200',
  trust: 'fill-pink-400',
  tension: 'fill-orange-400',
  agenda: 'fill-lime-300',
  memory: 'fill-accent-400',
  diary: 'fill-sky-300',
  intention: 'fill-emerald-300',
};

const LANE_LABEL: Record<Lane, TranslationKey> = {
  belief: 'memory.atlasLaneBeliefs',
  memory: 'memory.atlasLaneMemories',
  diary: 'memory.atlasLaneDiary',
  intention: 'memory.atlasLaneIntentions',
};

const short = (text: string, max = 90) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/**
 * "Atlas": the memory as a map. Beliefs on top, below them experiences, diary entries and
 * plans along the time axis; a line shows which experience shaped which belief (dashed =
 * found by matching words, solid = stored).
 */
export const AtlasTab = () => {
  const { t } = useTranslation();
  const characterId = useAppStore((state) => memoryCharacter(state)?.id);
  const userName = useAppStore((state) => state.activePersona.name);
  const overview = useAppStore((state) => state.cognitiveOverview);
  const appLanguage = useAppStore((state) => state.appLanguage);
  const [history, setHistory] = useState(false);
  const [result, setResult] = useState<{ key: string; atlas: MemoryAtlas | null; error: string | null } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  // The map stays while history is switched; another character or persona starts empty.
  const key = `${characterId}|${userName}`;

  // Loads again after a reflection (the overview changes) and when history is switched.
  useEffect(() => {
    if (!characterId) return;
    let current = true;
    api.getMemoryAtlas(characterId, userName, history)
      .then((atlas) => { if (current) setResult({ key, atlas: atlas ?? null, error: null }); })
      .catch((error) => { if (current) setResult({ key, atlas: null, error: errorMessage(error) }); });
    return () => { current = false; };
  }, [characterId, userName, history, key, overview]);

  const atlas = result?.key === key ? result.atlas : null;
  const layout = useMemo(() => atlas && layoutAtlas(atlas, (at) => new Date(at * 1000).toLocaleDateString(appLanguage, { day: 'numeric', month: 'short' })), [atlas, appLanguage]);
  const byId = useMemo(() => new Map(atlas?.nodes.map((n) => [n.id, n]) ?? []), [atlas]);

  const focus = hovered ?? selected;
  const linked = new Set(focus && atlas ? [focus, ...neighbours(atlas.edges, focus).map((n) => n.other)] : []);
  const current = selected ? byId.get(selected) : undefined;
  const kindLabel = (node: AtlasNode) => t(`memory.atlasKind.${node.kind}` as TranslationKey);
  const dateOf = (node: AtlasNode) => (node.at != null ? new Date(node.at * 1000).toLocaleString(appLanguage) : '');

  const showSource = async (node: AtlasNode) => {
    const store = useAppStore.getState;
    if (!node.chat_id || !node.message_id) return;
    if (store().activeChatId !== node.chat_id) await store().switchChatSession(node.chat_id);
    store().setMemoryDrawerOpen(false);
    store().requestChatJump(node.message_id);
  };

  return (
    <div className="space-y-3" data-memory-atlas>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs text-slate-400 max-w-xl">{t('memory.atlasIntro')}</p>
        <label className="flex items-center gap-1.5 text-xs text-slate-400">
          <input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} />
          {t('memory.atlasHistory')}
        </label>
      </div>

      {result?.key === key && result.error && (
        <p role="alert" className="text-xs text-rose-300">{t('memory.atlasLoadFailed', { error: result.error })}</p>
      )}
      {!atlas || !layout ? (
        !result?.error && <p className="text-xs text-slate-400">{t('memory.loading')}</p>
      ) : atlas.nodes.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-400 italic">{t('memory.atlasEmpty')}</div>
      ) : (
        <div className="flex rounded-xl border border-slate-800 bg-app/60">
          <div className="relative w-24 shrink-0 border-r border-slate-800 text-[11px] text-slate-400" style={{ height: layout.height }}>
            {LANES.map((lane) => (
              <span key={lane} className="absolute left-2 right-1 -translate-y-1/2 leading-tight" style={{ top: LANE_Y[lane] }}>
                {t(LANE_LABEL[lane])}
              </span>
            ))}
          </div>
          <div className="overflow-x-auto">
            <svg width={layout.width} height={layout.height} role="group" aria-label={t('memory.atlasLabel')}>
              {LANES.slice(1).map((lane) => (
                <line key={lane} x1={0} x2={layout.width} y1={LANE_Y[lane]} y2={LANE_Y[lane]} className="stroke-slate-800" strokeWidth={1} />
              ))}
              {layout.ticks.map((tick) => (
                <text key={`${tick.x}-${tick.label}`} x={tick.x} y={layout.height - 8} textAnchor="middle" className="fill-slate-400 text-[10px]">
                  {tick.label}
                </text>
              ))}
              {atlas.edges.map((edge, index) => {
                const a = layout.points.get(edge.from);
                const b = layout.points.get(edge.to);
                if (!a || !b) return null;
                const lit = focus !== null && (edge.from === focus || edge.to === focus);
                return (
                  <path key={index} d={edgePath(a, b)} fill="none"
                    className={lit ? 'stroke-accent-300' : 'stroke-slate-600'}
                    strokeOpacity={focus === null ? 0.45 : lit ? 0.95 : 0.12}
                    strokeWidth={lit ? 1.8 : 1}
                    strokeDasharray={edge.inferred ? '4 3' : undefined} />
                );
              })}
              {atlas.nodes.map((node) => {
                const p = layout.points.get(node.id);
                if (!p) return null;
                const dim = focus !== null && !linked.has(node.id);
                return (
                  <g key={node.id} role="button" tabIndex={0} data-atlas-node={node.id}
                    aria-label={`${kindLabel(node)}: ${short(node.text, 140)}`}
                    aria-pressed={selected === node.id}
                    className="cursor-pointer outline-hidden focus-visible:[&>circle]:stroke-white"
                    opacity={dim ? 0.3 : node.superseded ? 0.55 : 1}
                    onMouseEnter={() => setHovered(node.id)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(node.id)}
                    onBlur={() => setHovered(null)}
                    onClick={() => setSelected(selected === node.id ? null : node.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelected(selected === node.id ? null : node.id);
                      }
                    }}>
                    <title>{short(node.text, 200)}</title>
                    <circle cx={p.x} cy={p.y} r={p.r} className={`${FILL[node.kind] ?? 'fill-slate-300'} stroke-slate-950`}
                      strokeWidth={selected === node.id ? 3 : node.pinned ? 2 : 1}
                      strokeDasharray={node.superseded ? '2 2' : undefined} />
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}

      {atlas && atlas.hidden_memories > 0 && (
        <p className="text-[11px] text-slate-400">{t('memory.atlasHidden', { count: atlas.hidden_memories })}</p>
      )}
      <p className="flex items-center gap-3 text-[11px] text-slate-400">
        <span className="flex items-center gap-1"><svg width="22" height="6" aria-hidden><line x1="0" x2="22" y1="3" y2="3" className="stroke-slate-400" /></svg>{t('memory.atlasStored')}</span>
        <span className="flex items-center gap-1"><svg width="22" height="6" aria-hidden><line x1="0" x2="22" y1="3" y2="3" className="stroke-slate-400" strokeDasharray="4 3" /></svg>{t('memory.atlasInferred')}</span>
      </p>

      {atlas && current ? (
        <section aria-live="polite" className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-3 space-y-2 text-xs" data-atlas-detail>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase font-bold px-2 py-0.5 rounded bg-accent-900/60 text-accent-300 border border-accent-500/30">
              {kindLabel(current)}
            </span>
            {current.tag && <span className="text-slate-400">{current.tag}</span>}
            {current.superseded && <span className="text-amber-300">{t('memory.atlasSuperseded')}</span>}
            <span className="ml-auto text-[11px] text-slate-400">{dateOf(current)}</span>
          </div>
          <p className="text-slate-200 whitespace-pre-wrap leading-relaxed">{current.text}</p>
          {current.chat_id && current.message_id && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void showSource(current)} className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-accent-300">
                <Link2 className="w-3 h-3" />
                {t('memory.atlasToMessage')}
              </button>
            </div>
          )}
          {neighbours(atlas.edges, current.id).length > 0 && (
            <ul className="space-y-1 border-t border-slate-700/60 pt-2">
              {neighbours(atlas.edges, current.id).map(({ edge, other }) => {
                const node = byId.get(other);
                if (!node) return null;
                const relation = edge.from === current.id ? 'out' : 'in';
                return (
                  <li key={`${edge.kind}-${other}`}>
                    <button type="button" onClick={() => setSelected(other)} className="text-left text-slate-300 hover:text-accent-300">
                      <span className="text-slate-400">{t(`memory.atlasEdge.${edge.kind}.${relation}` as TranslationKey)}</span>{' '}
                      {short(node.text)}
                      {edge.inferred && <span className="text-slate-400"> · {t('memory.atlasInferredShort')}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : (
        <p className="flex items-center gap-1.5 text-[11px] text-slate-400"><Network className="w-3.5 h-3.5" />{t('memory.atlasPick')}</p>
      )}
    </div>
  );
};
