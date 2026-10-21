import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Clock,
  Compass,
  FolderCog,
  Flower2,
  Ghost,
  Heart,
  Laugh,
  MapPin,
  Play,
  Plus,
  RotateCcw,
  Rocket,
  Search,
  Sparkles,
  Swords,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAppStore, useStoreFields } from '../../store/useAppStore';
import { translate, useTranslation, type TranslationKey } from '../../i18n';
import type { ScenePreview } from '../../types';
import { ModalOverlay } from '../ui/ModalOverlay';
import { confirmDialog, toast } from '../ui/feedback';
import { errorMessage } from '../../utils/errors';
import { AdventurePartyModal } from './AdventurePartyModal';

/** Kinds of cards in the gallery; stories carry one of the first eight as genre. */
export type StoryKind =
  | 'fantasy' | 'adventure' | 'slice_of_life' | 'comedy' | 'romance' | 'mystery' | 'scifi' | 'horror' | 'adventure5e' | 'custom';
type Filter = 'all' | 'beginner' | StoryKind;

export const KINDS: Record<StoryKind, { icon: LucideIcon; cover: string; accent: string }> = {
  fantasy: { icon: Sparkles, cover: 'from-sky-800 via-indigo-900 to-slate-950', accent: 'text-sky-200' },
  adventure: { icon: Compass, cover: 'from-emerald-800 via-teal-900 to-slate-950', accent: 'text-emerald-200' },
  comedy: { icon: Laugh, cover: 'from-yellow-700 via-orange-900 to-slate-950', accent: 'text-yellow-200' },
  romance: { icon: Heart, cover: 'from-rose-700 via-fuchsia-900 to-slate-950', accent: 'text-rose-200' },
  slice_of_life: { icon: Flower2, cover: 'from-pink-700 via-rose-900 to-slate-950', accent: 'text-pink-200' },
  mystery: { icon: Search, cover: 'from-amber-800 via-stone-900 to-slate-950', accent: 'text-amber-200' },
  scifi: { icon: Rocket, cover: 'from-cyan-800 via-slate-900 to-slate-950', accent: 'text-cyan-200' },
  horror: { icon: Ghost, cover: 'from-violet-900 via-slate-900 to-slate-950', accent: 'text-violet-200' },
  adventure5e: { icon: Swords, cover: 'from-rose-800 via-red-950 to-slate-950', accent: 'text-rose-200' },
  custom: { icon: BookOpen, cover: 'from-slate-700 via-slate-800 to-slate-950', accent: 'text-slate-200' },
};

export const kindOf = (scene: ScenePreview): StoryKind => {
  if (scene.rules_5e) return 'adventure5e';
  const genre = scene.story?.genre;
  return genre && genre in KINDS ? (genre as StoryKind) : 'custom';
};

/** The 5e adventure as one card: the act played last, otherwise the first act. */
function adventureCard(scenes: ScenePreview[]): ScenePreview | undefined {
  const acts = scenes.filter((sc) => sc.adventure && sc.rules_5e).sort((a, b) => a.id.localeCompare(b.id));
  const lastPlayed = acts
    .filter((sc) => sc.has_progress)
    .sort((a, b) => (b.last_played ?? '').localeCompare(a.last_played ?? ''))[0];
  return lastPlayed ?? acts[0];
}

/** Cards of the gallery: bundled stories, the 5e adventure (one card) and the user's own scenes. */
export function galleryScenes(scenes: ScenePreview[]): ScenePreview[] {
  const adventure = adventureCard(scenes);
  const stories = scenes.filter((sc) => sc.story && !sc.rules_5e);
  const own = scenes.filter((sc) => !sc.story && !sc.rules_5e);
  // Recommended stories for a first round come first.
  stories.sort((a, b) => Number(!!b.story?.beginner) - Number(!!a.story?.beginner));
  return [...stories, ...(adventure ? [adventure] : []), ...own];
}

/** Scenes with progress, last played first. */
export function continueScenes(scenes: ScenePreview[], limit = 3): ScenePreview[] {
  return scenes
    .filter((sc) => sc.has_progress)
    .sort((a, b) => (b.last_played ?? '').localeCompare(a.last_played ?? ''))
    .slice(0, limit);
}

interface StoryGalleryProps {
  /** A story was started or continued. */
  onPlay: () => void;
  /** Opens the scene management (folders, import, editor). */
  onManage: () => void;
  /** Opens the dialog for an own story. */
  onCreate: () => void;
  /** Back to the running story (only when there is one). */
  onBack?: () => void;
}

/**
 * Entry into Stage: what is there to experience, with genre covers, length, difficulty and the
 * companions; stories with progress can be continued first. Management stays in the lobby.
 */
export const StoryGallery: React.FC<StoryGalleryProps> = ({ onPlay, onManage, onCreate, onBack }) => {
  const { t } = useTranslation();
  const { stageScenes, fetchStageScenes } = useStoreFields('stageScenes', 'fetchStageScenes');
  const [filter, setFilter] = useState<Filter>('all');
  const [preview, setPreview] = useState<ScenePreview | null>(null);

  useEffect(() => {
    void fetchStageScenes();
  }, [fetchStageScenes]);

  const cards = galleryScenes(stageScenes);
  const continuing = continueScenes(stageScenes);
  const counts = (f: Filter) =>
    f === 'all' ? cards.length : f === 'beginner' ? cards.filter((sc) => sc.story?.beginner).length : cards.filter((sc) => kindOf(sc) === f).length;
  const filters = (['all', 'beginner', 'fantasy', 'adventure', 'slice_of_life', 'comedy', 'romance', 'mystery', 'scifi', 'horror', 'adventure5e', 'custom'] as Filter[]).filter(
    (f) => f === 'all' || counts(f) > 0,
  );
  const shown = cards.filter((sc) =>
    filter === 'all' ? true : filter === 'beginner' ? sc.story?.beginner : kindOf(sc) === filter,
  );

  return (
    <div className="flex-1 overflow-y-auto" data-story-gallery>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="mb-2 inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                {t('gallery.back')}
              </button>
            )}
            <h1 className="text-2xl font-bold text-slate-100">{t('gallery.title')}</h1>
            <p className="text-sm text-slate-400 max-w-2xl">{t('gallery.intro')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onCreate}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent-600 hover:bg-accent-500 text-white text-sm font-semibold"
            >
              <Plus className="w-4 h-4" />
              {t('gallery.create')}
            </button>
            <button
              type="button"
              onClick={onManage}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm"
            >
              <FolderCog className="w-4 h-4" />
              {t('gallery.manage')}
            </button>
          </div>
        </header>

        {continuing.length > 0 && (
          <section aria-labelledby="gallery-continue" className="space-y-2">
            <h2 id="gallery-continue" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t('gallery.continue')}
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {continuing.map((scene) => {
                const kind = KINDS[kindOf(scene)];
                return (
                  <button
                    key={scene.id}
                    type="button"
                    data-continue-scene={scene.id}
                    onClick={() => setPreview(scene)}
                    className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-left hover:border-accent-500/50"
                  >
                    <span className={`shrink-0 rounded-lg bg-linear-to-br ${kind.cover} p-2.5`}>
                      <kind.icon className={`w-5 h-5 ${kind.accent}`} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-100">{scene.title}</span>
                      <span className="block text-xs text-slate-400">{t('gallery.turns', { count: Math.max(0, (scene.turn_count ?? 1) - 1) })}</span>
                    </span>
                    <Play className="ml-auto w-4 h-4 text-accent-300 shrink-0" />
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <div role="tablist" aria-label={t('gallery.filters')} className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                filter === f
                  ? 'bg-accent-600 border-accent-500 text-white'
                  : 'border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {t(`gallery.filter.${f}` as TranslationKey)}
            </button>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {shown.map((scene) => (
            <StoryCard key={scene.id} scene={scene} onOpen={() => setPreview(scene)} />
          ))}
          <button
            type="button"
            onClick={onCreate}
            className="min-h-64 rounded-2xl border-2 border-dashed border-slate-700 text-slate-400 hover:text-accent-200 hover:border-accent-500/60 flex flex-col items-center justify-center gap-2 p-6 text-center"
          >
            <Plus className="w-8 h-8" />
            <span className="text-sm font-semibold">{t('gallery.create')}</span>
            <span className="text-xs max-w-56">{t('gallery.createHint')}</span>
          </button>
        </div>
      </div>

      {preview && <StoryPreview scene={preview} onClose={() => setPreview(null)} onPlay={onPlay} />}
    </div>
  );
};

/** Party line of a card: names, or "solo" when the game master plays everyone. */
const partyText = (scene: ScenePreview) =>
  scene.party.length ? scene.party.join(', ') : translate('gallery.solo');

const StoryMeta = ({ scene }: { scene: ScenePreview }) => {
  const { t } = useTranslation();
  const story = scene.story;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
      {story && (
        <span className="inline-flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          {t('gallery.minutes', { minutes: story.minutes })}
        </span>
      )}
      {story && <span>{t(`gallery.difficulty.${story.difficulty}` as TranslationKey)}</span>}
      {scene.rules_5e && <span>{t('gallery.rules5e')}</span>}
      <span className="inline-flex items-center gap-1">
        <Users className="w-3.5 h-3.5" />
        {partyText(scene)}
      </span>
    </div>
  );
};

const StoryCard = ({ scene, onOpen }: { scene: ScenePreview; onOpen: () => void }) => {
  const { t } = useTranslation();
  const kindId = kindOf(scene);
  const kind = KINDS[kindId];
  return (
    <article
      data-story={scene.id}
      className="group rounded-2xl border border-slate-800 bg-slate-900/70 overflow-hidden flex flex-col hover:border-accent-500/50 transition"
    >
      <button type="button" onClick={onOpen} className="text-left flex-1 flex flex-col">
        <div className={`relative h-28 bg-linear-to-br ${kind.cover} flex items-center justify-center`}>
          <kind.icon className={`w-12 h-12 ${kind.accent} opacity-80 group-hover:scale-110 transition-transform`} />
          <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">
            {t(`gallery.filter.${kindId}` as TranslationKey)}
          </span>
          {scene.story?.beginner && (
            <span className="absolute right-3 top-3 rounded-full bg-emerald-700 px-2 py-0.5 text-[11px] font-semibold text-white">
              {t('gallery.beginner')}
            </span>
          )}
          {scene.has_progress && (
            <span className="absolute right-3 bottom-3 rounded-full bg-accent-600/90 px-2 py-0.5 text-[11px] font-semibold text-white">
              {t('gallery.inProgress')}
            </span>
          )}
        </div>
        <div className="p-4 space-y-2 flex-1">
          {scene.rules_5e && <p className="text-[11px] uppercase tracking-wide text-rose-300">{scene.folder}</p>}
          <h3 className="text-base font-bold text-slate-100">{scene.title}</h3>
          <p className="text-sm text-slate-400 line-clamp-3">{scene.description}</p>
          <StoryMeta scene={scene} />
        </div>
      </button>
      <div className="px-4 pb-4">
        <button
          type="button"
          onClick={onOpen}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 hover:bg-accent-600 text-slate-100 text-sm font-semibold py-2 transition"
        >
          <Play className="w-4 h-4" />
          {scene.has_progress ? t('gallery.continueButton') : t('gallery.look')}
        </button>
      </div>
    </article>
  );
};

/** Details of a story before it starts: situation, place, companions and first ideas. */
const StoryPreview = ({ scene, onClose, onPlay }: { scene: ScenePreview; onClose: () => void; onPlay: () => void }) => {
  const { t } = useTranslation();
  const { loadStageScene, resetStageScene, updateStageSceneDefinition, appLanguage, stageState } = useStoreFields(
    'loadStageScene', 'resetStageScene', 'updateStageSceneDefinition', 'appLanguage', 'stageState',
  );
  const [busy, setBusy] = useState(false);
  const [choosingParty, setChoosingParty] = useState(false);
  const kindId = kindOf(scene);
  const kind = KINDS[kindId];
  const story = scene.story;
  const ideas = story ? (story.choices[appLanguage] ?? story.choices.en ?? story.choices.de ?? []) : [];
  const isActive = stageState?.definition.id === scene.id;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      onClose();
      onPlay();
    } catch (e) {
      toast.error(translate('common.actionFailed', { error: errorMessage(e) }));
    } finally {
      setBusy(false);
    }
  };

  const start = () => {
    // A fresh 5e adventure first asks who comes along.
    if (scene.rules_5e && !scene.has_progress && scene.party.length > 0 && !isActive) {
      setChoosingParty(true);
      return;
    }
    void run(() => loadStageScene(scene.id));
  };

  const restart = async () => {
    const confirmed = await confirmDialog({
      title: translate('gallery.restartTitle', { title: scene.title }),
      message: translate('gallery.restartMessage'),
      confirmLabel: translate('gallery.restart'),
      tone: 'danger',
    });
    if (!confirmed) return;
    void run(async () => {
      await resetStageScene(scene.id);
      await loadStageScene(scene.id);
    });
  };

  const startWithParty = (party: string[], heroClasses: Record<string, string>) =>
    void run(async () => {
      await loadStageScene(scene.id);
      const definition = useAppStore.getState().stageState?.definition;
      if (definition?.id === scene.id) {
        const rules = definition.rules;
        await updateStageSceneDefinition({
          ...definition,
          party,
          rules: rules ? { ...rules, hero_classes: { ...rules.hero_classes, ...heroClasses } } : rules,
        });
      }
    });

  if (choosingParty) {
    return <AdventurePartyModal scene={scene} onStart={startWithParty} onClose={() => setChoosingParty(false)} />;
  }

  return (
    <ModalOverlay
      onClose={onClose}
      aria-labelledby="story-preview-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl" data-story-preview={scene.id}>
        <div className={`relative h-32 bg-linear-to-br ${kind.cover} flex items-center justify-center`}>
          <kind.icon className={`w-14 h-14 ${kind.accent} opacity-80`} />
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="absolute right-3 top-3 rounded-lg bg-black/30 p-1.5 text-slate-200 hover:bg-black/50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-1">
            <p className={`text-xs font-semibold uppercase tracking-wider ${kind.accent}`}>
              {t(`gallery.filter.${kindId}` as TranslationKey)}
              {story?.beginner ? ` · ${t('gallery.beginner')}` : ''}
            </p>
            <h2 id="story-preview-title" className="text-xl font-bold text-slate-100">{scene.title}</h2>
            <StoryMeta scene={scene} />
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">{scene.description}</p>
          {(scene.location || scene.time_of_day) && (
            <p className="text-xs text-slate-400 inline-flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              {[scene.location, scene.time_of_day].filter(Boolean).join(' · ')}
            </p>
          )}
          {story && story.notes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {story.notes.map((note) => (
                <span key={note} className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">
                  {t(`gallery.note.${note}` as TranslationKey)}
                </span>
              ))}
            </div>
          )}
          {ideas.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-300">{t('gallery.ideas')}</p>
              <ul className="space-y-1 text-sm text-slate-300 list-disc pl-5">
                {ideas.map((idea) => (
                  <li key={idea.text}>{idea.text}</li>
                ))}
              </ul>
              <p className="text-xs text-slate-500">{t('gallery.howToPlay')}</p>
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            {scene.has_progress && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void restart()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                {t('gallery.restart')}
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={start}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent-600 hover:bg-accent-500 text-white text-sm font-semibold disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              {scene.has_progress ? t('gallery.continueButton') : t('gallery.start')}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
};
