import React, { useState } from 'react';
import { radioGroupKeyDown, radioTabIndex } from '../../utils/radioGroup';
import { ArrowLeft, ArrowRight, Check, Dices, Loader2, Play, Settings2, User, Users, X } from 'lucide-react';
import { useStoreFields } from '../../store/useAppStore';
import { translate, useTranslation, type TranslationKey } from '../../i18n';
import type { SceneDefinition } from '../../types';
import { ModalOverlay } from '../ui/ModalOverlay';
import { errorMessage } from '../../utils/errors';
import { KINDS, type StoryKind } from './StoryGallery';

/** Genres the wizard offers (the gallery kinds without the 5e adventure and own scenes). */
export const WIZARD_GENRES = ['fantasy', 'adventure', 'slice_of_life', 'comedy', 'romance', 'mystery', 'scifi', 'horror'] as const;
export type WizardGenre = (typeof WIZARD_GENRES)[number];
/** Number of ready-made situations per genre (`storyWizard.premise.<genre>.<n>.*`). */
export const PREMISES_PER_GENRE = 2;
const MAX_COMPANIONS = 4;
const STEPS = ['genre', 'you', 'companions', 'start'] as const;

const premiseKey = (genre: WizardGenre, index: number, field: 'title' | 'hook' | 'location' | 'opening') =>
  `storyWizard.premise.${genre}.${index}.${field}` as TranslationKey;

interface StoryDraft {
  genre: WizardGenre;
  playerName: string;
  playerDescription: string;
  party: string[];
  /** Ready-made situation, or `null` for the own idea. */
  premise: number | null;
  ownIdea: string;
  ownLocation: string;
}

/** The scene the wizard creates (story texts in the interface language, which is the player's). */
export function buildStoryDefinition(draft: StoryDraft): SceneDefinition {
  const t = translate;
  const premise = draft.premise;
  const title =
    premise !== null ? t(premiseKey(draft.genre, premise, 'title')) : t('storyWizard.ownTitle', { genre: t(`gallery.filter.${draft.genre}` as TranslationKey) });
  const location = premise !== null ? t(premiseKey(draft.genre, premise, 'location')) : draft.ownLocation.trim() || t('sceneNew.startLocationDefault');
  const situation = premise !== null ? t(premiseKey(draft.genre, premise, 'hook')) : draft.ownIdea.trim();
  const player = draft.playerName.trim() || t('sceneNew.personaDefault');
  const who = draft.playerDescription.trim();
  return {
    id: `story_own_${Date.now()}`,
    title,
    description: situation,
    world_context: [situation, who ? t('storyWizard.playerContext', { name: player, description: who }) : ''].filter(Boolean).join('\n\n'),
    starting_location: location,
    time_of_day: '',
    opening_narration: premise !== null ? t(premiseKey(draft.genre, premise, 'opening')) : t('sceneNew.defaultOpening', { location }),
    first_message: '',
    party: draft.party,
    gm_tone: t(`gallery.filter.${draft.genre}` as TranslationKey),
    narrator_style: t(`storyWizard.style.${draft.genre}` as TranslationKey),
    persona: player,
    lorebook: [],
    solo_mode: draft.party.length === 0,
    max_actor_depth: 2,
    dice_rolls_enabled: true,
    starting_bg: '',
    starting_ambient: '',
    lock_bg: false,
    disable_ambient: false,
    folder: '',
    created_at: '',
    last_played: null,
    extensions: { otakusoul_story: { genre: draft.genre, minutes: 30, difficulty: 'easy', notes: [], beginner: false, choices: {} } },
    rules: null,
  } as SceneDefinition;
}

interface StoryWizardProps {
  onClose: () => void;
  /** The story was created and loaded. */
  onCreated: () => void;
  /** Opens the full scene editor instead. */
  onAdvanced: () => void;
}

/**
 * Own story in four steps for beginners: genre, who you are, who comes along, how it starts
 * (ready-made situation, dice or an own idea). Rules and technical options stay in the editor.
 */
export const StoryWizard: React.FC<StoryWizardProps> = ({ onClose, onCreated, onAdvanced }) => {
  const { t } = useTranslation();
  const { availableCharacters, activePersona, createStageScene } = useStoreFields('availableCharacters', 'activePersona', 'createStageScene');
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<StoryDraft>(() => ({
    genre: 'fantasy',
    playerName: activePersona?.name && activePersona.name !== 'User' ? activePersona.name : '',
    playerDescription: '',
    party: [],
    premise: 0,
    ownIdea: '',
    ownLocation: '',
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = (patch: Partial<StoryDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const stepId = STEPS[step]!;
  const canContinue = stepId !== 'start' || draft.premise !== null || draft.ownIdea.trim().length > 0;

  const toggleCompanion = (name: string) =>
    update({
      party: draft.party.includes(name)
        ? draft.party.filter((n) => n !== name)
        : draft.party.length < MAX_COMPANIONS
          ? [...draft.party, name]
          : draft.party,
    });

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await createStageScene(buildStoryDefinition(draft));
      onCreated();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalOverlay
      onClose={onClose}
      aria-labelledby="story-wizard-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl" data-story-wizard={stepId}>
        <header className="flex items-start justify-between gap-4 border-b border-slate-800 px-6 py-4">
          <div>
            <h2 id="story-wizard-title" className="text-lg font-bold text-slate-100">{t('storyWizard.title')}</h2>
            <ol className="mt-2 flex flex-wrap gap-2 text-xs" aria-label={t('storyWizard.steps')}>
              {STEPS.map((id, index) => (
                <li
                  key={id}
                  aria-current={index === step ? 'step' : undefined}
                  className={`rounded-full px-2.5 py-0.5 border ${
                    index === step
                      ? 'border-accent-500 bg-accent-600/20 text-accent-200'
                      : index < step
                        ? 'border-emerald-600/50 text-emerald-300'
                        : 'border-slate-700 text-slate-500'
                  }`}
                >
                  {index + 1}. {t(`storyWizard.step.${id}` as TranslationKey)}
                </li>
              ))}
            </ol>
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {stepId === 'genre' && (
            <>
              <p className="text-sm text-slate-300">{t('storyWizard.genreQuestion')}</p>
              <div
                role="radiogroup"
                aria-label={t('storyWizard.step.genre')}
                tabIndex={-1}
                className="grid grid-cols-2 sm:grid-cols-4 gap-3"
                onKeyDown={(event) =>
                  radioGroupKeyDown(event, WIZARD_GENRES, draft.genre, (genre) => update({ genre, premise: draft.premise === null ? null : 0 }))
                }
              >
                {WIZARD_GENRES.map((genre) => {
                  const kind = KINDS[genre as StoryKind];
                  const selected = draft.genre === genre;
                  return (
                    <button
                      key={genre}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      tabIndex={radioTabIndex(genre, WIZARD_GENRES, draft.genre)}
                      data-genre={genre}
                      data-radio-value={genre}
                      aria-label={t(`gallery.filter.${genre}` as TranslationKey)}
                      onClick={() => update({ genre, premise: draft.premise === null ? null : 0 })}
                      className={`rounded-xl overflow-hidden border text-left transition ${selected ? 'border-accent-400 ring-2 ring-accent-500/40' : 'border-slate-700 hover:border-slate-500'}`}
                    >
                      <span className={`flex h-16 items-center justify-center bg-linear-to-br ${kind.cover}`}>
                        <kind.icon className={`w-7 h-7 ${kind.accent}`} />
                      </span>
                      <span className="block px-3 py-2">
                        <span className="block text-sm font-semibold text-slate-100">{t(`gallery.filter.${genre}` as TranslationKey)}</span>
                        <span className="block text-[11px] text-slate-400">{t(`storyWizard.genreHint.${genre}` as TranslationKey)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {stepId === 'you' && (
            <>
              <p className="text-sm text-slate-300">{t('storyWizard.youQuestion')}</p>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-slate-300">{t('storyWizard.playerName')}</span>
                <input
                  value={draft.playerName}
                  onChange={(e) => update({ playerName: e.target.value })}
                  placeholder={t('sceneNew.personaDefault')}
                  className="w-full rounded-lg border border-slate-700 bg-app px-3 py-2 text-sm text-slate-100"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-slate-300">{t('storyWizard.playerDescription')}</span>
                <input
                  value={draft.playerDescription}
                  onChange={(e) => update({ playerDescription: e.target.value })}
                  placeholder={t('storyWizard.playerDescriptionPlaceholder')}
                  className="w-full rounded-lg border border-slate-700 bg-app px-3 py-2 text-sm text-slate-100"
                />
              </label>
              <p className="text-xs text-slate-500 inline-flex items-center gap-1.5"><User className="w-3.5 h-3.5" />{t('storyWizard.youHint')}</p>
            </>
          )}

          {stepId === 'companions' && (
            <>
              <p className="text-sm text-slate-300">{t('storyWizard.companionsQuestion', { max: MAX_COMPANIONS })}</p>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                {availableCharacters.map((char) => {
                  const name = char.card.data.name || char.id;
                  const selected = draft.party.includes(name);
                  return (
                    <button
                      key={char.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleCompanion(name)}
                      className={`relative rounded-xl overflow-hidden border text-left ${selected ? 'border-accent-400 ring-2 ring-accent-500/40' : 'border-slate-700 hover:border-slate-500'}`}
                    >
                      <span className="block aspect-3/4 bg-slate-800">
                        {char.avatar_data_url ? (
                          <img src={char.avatar_data_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full items-center justify-center text-2xl font-bold text-slate-500">{name.slice(0, 1)}</span>
                        )}
                      </span>
                      <span className="block truncate px-2 py-1.5 text-xs font-medium text-slate-100">{name}</span>
                      {selected && (
                        <span className="absolute right-1.5 top-1.5 rounded-full bg-accent-600 p-0.5 text-white">
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-slate-500 inline-flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                {draft.party.length ? draft.party.join(', ') : t('gallery.solo')}
              </p>
            </>
          )}

          {stepId === 'start' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-300">{t('storyWizard.startQuestion')}</p>
                <button
                  type="button"
                  onClick={() => update({ premise: Math.floor(Math.random() * PREMISES_PER_GENRE) })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                >
                  <Dices className="w-3.5 h-3.5" />
                  {t('storyWizard.roll')}
                </button>
              </div>
              <div role="radiogroup" aria-label={t('storyWizard.step.start')} className="space-y-2">
                {Array.from({ length: PREMISES_PER_GENRE }, (_, index) => (
                  <button
                    key={index}
                    type="button"
                    role="radio"
                    aria-checked={draft.premise === index}
                    onClick={() => update({ premise: index })}
                    className={`w-full rounded-xl border p-3 text-left ${draft.premise === index ? 'border-accent-400 bg-accent-600/10' : 'border-slate-700 hover:border-slate-500'}`}
                  >
                    <span className="block text-sm font-semibold text-slate-100">{t(premiseKey(draft.genre, index, 'title'))}</span>
                    <span className="block text-xs text-slate-400">{t(premiseKey(draft.genre, index, 'hook'))}</span>
                  </button>
                ))}
                <button
                  type="button"
                  role="radio"
                  aria-checked={draft.premise === null}
                  onClick={() => update({ premise: null })}
                  className={`w-full rounded-xl border p-3 text-left ${draft.premise === null ? 'border-accent-400 bg-accent-600/10' : 'border-slate-700 hover:border-slate-500'}`}
                >
                  <span className="block text-sm font-semibold text-slate-100">{t('storyWizard.ownIdea')}</span>
                  <span className="block text-xs text-slate-400">{t('storyWizard.ownIdeaHint')}</span>
                </button>
              </div>
              {draft.premise === null && (
                <div className="space-y-3">
                  <textarea
                    value={draft.ownIdea}
                    onChange={(e) => update({ ownIdea: e.target.value })}
                    aria-label={t('storyWizard.ownIdea')}
                    placeholder={t('storyWizard.ownIdeaPlaceholder')}
                    className="w-full min-h-20 rounded-lg border border-slate-700 bg-app px-3 py-2 text-sm text-slate-100"
                  />
                  <input
                    value={draft.ownLocation}
                    onChange={(e) => update({ ownLocation: e.target.value })}
                    aria-label={t('storyWizard.ownLocation')}
                    placeholder={t('storyWizard.ownLocation')}
                    className="w-full rounded-lg border border-slate-700 bg-app px-3 py-2 text-sm text-slate-100"
                  />
                </div>
              )}
            </>
          )}
          {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-6 py-4">
          <button type="button" onClick={onAdvanced} className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200">
            <Settings2 className="w-3.5 h-3.5" />
            {t('storyWizard.advanced')}
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                <ArrowLeft className="w-4 h-4" />
                {t('storyWizard.back')}
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-500"
              >
                {t('storyWizard.next')}
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={!canContinue || busy}
                onClick={() => void create()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-500 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {t('storyWizard.create')}
              </button>
            )}
          </div>
        </footer>
      </div>
    </ModalOverlay>
  );
};
