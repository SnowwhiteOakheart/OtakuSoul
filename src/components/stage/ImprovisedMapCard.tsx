import React, { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Map as MapIcon, Trash2, TriangleAlert } from 'lucide-react';
import { useStoreFields } from '../../store/useAppStore';
import { useTranslation } from '../../i18n';
import { useBattleMaps } from './battleMapStore';
import type { SceneState } from '../../types';

/** The scene may get improvised maps: 5e without a map of its own (as `battlemap::scene_wants_maps`). */
export const wantsImprovisedMaps = (scene: SceneState | null): scene is SceneState =>
  !!scene && scene.definition.rules?.ruleset === '5e' && !scene.definition.rules.map_id;

const placeKey = (place: string) => place.split(/\s+/).filter(Boolean).join(' ').toLowerCase();

/**
 * Improvised battle map (C8) of the current place, above the turn bar: the picture with the squares
 * the rules treat as blocked, a note when one cannot fight on it, and "discard". It also loads the
 * map when the place changes and, with automatic maps on, paints a new place after the turn.
 */
export const ImprovisedMapCard: React.FC = () => {
  const { t } = useTranslation();
  const { stageState, isProcessingStageTurn, stageAutoPlay, isGeneratingSceneImage } = useStoreFields(
    'stageState', 'isProcessingStageTurn', 'stageAutoPlay', 'isGeneratingSceneImage',
  );
  const { painters, current, painting, error, auto, loadPainters, refresh, paint, discard, image } = useBattleMaps();
  const [picture, setPicture] = useState<string | null>(null);
  const tried = useRef(new Set<string>());
  const scene = wantsImprovisedMaps(stageState) ? stageState : null;
  const sceneId = scene?.definition.id ?? '';
  const place = scene?.world.location.trim() ?? '';
  const inFight = !!scene?.combat.is_active;

  useEffect(() => {
    void loadPainters();
  }, [loadPainters]);
  useEffect(() => {
    if (sceneId) void refresh(sceneId);
  }, [sceneId, place, refresh]);

  // A new place, after the turn (the language model no longer computes): paint it once.
  useEffect(() => {
    if (!auto || !sceneId || !place || inFight || painting || isProcessingStageTurn || stageAutoPlay || isGeneratingSceneImage) return;
    if (!painters?.length || (current?.sceneId === sceneId && current.map.key === placeKey(place))) return;
    const attempt = `${sceneId}|${placeKey(place)}`;
    if (tried.current.has(attempt)) return;
    tried.current.add(attempt);
    void paint(sceneId, place);
  }, [auto, sceneId, place, inFight, painting, isProcessingStageTurn, stageAutoPlay, isGeneratingSceneImage, painters, current, paint]);

  const shown = current && current.sceneId === sceneId && current.map.key === placeKey(place) ? current.map : null;
  useEffect(() => {
    setPicture(null);
    if (shown) void image(sceneId, shown.map.id).then(setPicture);
  }, [shown, sceneId, image]);

  if (!scene || inFight) return null;
  const busy = painting?.sceneId === sceneId;
  if (!shown && !busy && !error) return null;

  return (
    <div className="mx-3 mb-2 flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900/80 p-2 text-xs text-slate-300" data-improvised-map>
      {shown && picture ? (
        <div className="relative h-16 w-[5.33rem] shrink-0 overflow-hidden rounded-lg border border-slate-700">
          <img src={picture} alt="" className="absolute inset-0 h-full w-full object-cover" />
          {/* What the rules read: blocked squares red, water blue. */}
          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${shown.map.width}, 1fr)` }} aria-hidden="true">
            {shown.map.cells.map((cell, i) => (
              <span
                key={i}
                className={cell.kind === 'wall' || ['tree', 'rock', 'pillar'].includes(cell.object ?? '') ? 'bg-rose-500/40' : cell.kind === 'difficult' ? 'bg-sky-500/30' : ''}
              />
            ))}
          </div>
        </div>
      ) : (
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-800">
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <MapIcon className="h-4 w-4" />}
        </span>
      )}
      <div className="min-w-0 flex-1 space-y-0.5">
        {busy ? (
          <p>{t('stage.battleMapPainting', { place: painting.place })}</p>
        ) : shown ? (
          <>
            <p className="font-semibold text-slate-200">{t('stage.battleMapTitle', { place: shown.place })}</p>
            {shown.check.playable ? (
              <p className="text-slate-400">{t('stage.battleMapReady')}</p>
            ) : (
              <p className="flex items-center gap-1 text-amber-300" role="status">
                <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                {t('stage.battleMapUnplayable')}
              </p>
            )}
          </>
        ) : null}
        {error && !busy && <p role="alert" className="text-rose-300">{t('stage.battleMapFailed', { error })}</p>}
      </div>
      {shown && !busy && (
        <button
          type="button"
          onClick={() => void discard(sceneId)}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800"
          data-discard-map
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t('stage.battleMapDiscard')}
        </button>
      )}
    </div>
  );
};
