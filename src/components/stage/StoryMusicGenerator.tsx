import { useEffect, useState } from 'react';
import { Loader2, Square, Wand2 } from 'lucide-react';
import { api } from '../../services/api';
import { useTranslation } from '../../i18n';
import { errorCode, errorMessage } from '../../utils/errors';
import { toast } from '../ui/feedback';
import { MusicModelPicker, useMusicModels } from '../music/MusicModelPicker';
import type { MusicGenProgress, SceneDefinition, SceneMusicPlan } from '../../types';

/** Tracks still missing in the plan (each mood up to its `count`). */
export const missingTracks = (plan: SceneMusicPlan) =>
  plan.moods.reduce((sum, m) => sum + Math.max(0, m.count - m.installed), 0);

interface StoryMusicGeneratorProps {
  definition: SceneDefinition;
  plan: SceneMusicPlan;
  /** Reads the plan and the music folder again (after new tracks). */
  onGenerated: () => Promise<void>;
}

/**
 * Generates a story's music with ACE-Step before playing: runtime (acestep.cpp), a model set and
 * the missing tracks of the plan, with progress and cancel. The chat model makes room meanwhile.
 */
export const StoryMusicGenerator = ({ definition, plan, onGenerated }: StoryMusicGeneratorProps) => {
  const { t } = useTranslation();
  const music = useMusicModels();
  const { chosen } = music;
  const [progress, setProgress] = useState<MusicGenProgress | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    const stop = api.onMusicGenProgress((p) => {
      if (p.set !== '@song') setProgress(p);
    });
    return () => void stop.then((unlisten) => unlisten()).catch(() => {});
  }, []);

  const missing = missingTracks(plan);

  const generate = async () => {
    if (!chosen) return;
    setGenerating(true);
    setProgress(null);
    try {
      const count = await api.generateSceneMusic(definition, chosen.id);
      toast.success(t('musicGen.done', { count }));
    } catch (error) {
      // A cancel is the user's own choice, not an error.
      if (errorCode(error)?.code !== 'backend.music.cancelled') toast.error(t('musicGen.failed', { error: errorMessage(error) }));
    } finally {
      setGenerating(false);
      await onGenerated();
    }
  };

  if (music.loading) {
    return <Loader2 className="w-4 h-4 animate-spin text-slate-400" />;
  }

  const phase = progress && generating ? progress.phase : null;
  const phaseText = phase
    ? progress && progress.track > 0 && (phase === 'composing' || phase === 'rendering' || phase === 'saved')
      ? t('musicGen.track', {
          track: progress.track,
          total: progress.total,
          mood: t(`stageMusic.mood.${progress.mood}` as 'stageMusic.mood.calm'),
          phase: t(`musicGen.phase.${phase}` as 'musicGen.phase.composing'),
        })
      : t(`musicGen.phase.${phase}` as 'musicGen.phase.composing')
    : null;

  return (
    <div className="space-y-3 rounded-xl border border-accent-500/25 bg-accent-950/20 p-3" data-testid="music-generator">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-accent-200">
        <Wand2 className="w-3.5 h-3.5" /> {t('musicGen.title')}
      </p>
      <p className="text-xs text-slate-400">{t('musicGen.intro')}</p>

      <MusicModelPicker music={music} disabled={generating} />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="music-generate"
          disabled={!music.ready || missing === 0 || generating}
          onClick={() => void generate()}
          className="flex items-center gap-1.5 rounded-xl bg-accent-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-500 disabled:bg-slate-800 disabled:text-slate-400"
        >
          {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
          {missing === 0 ? t('musicGen.nothingMissing') : t('musicGen.generate', { count: missing })}
        </button>
        {generating && (
          <button
            type="button"
            onClick={() => void api.cancelMusicGeneration()}
            className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-semibold hover:bg-slate-700"
          >
            <Square className="w-3 h-3" /> {t('musicGen.stop')}
          </button>
        )}
      </div>
      {phaseText && (
        <p className="text-xs text-slate-300" role="status" aria-live="polite">
          {phaseText}
        </p>
      )}
      <p className="text-[11px] text-slate-500">{t('musicGen.hint')}</p>
    </div>
  );
};
