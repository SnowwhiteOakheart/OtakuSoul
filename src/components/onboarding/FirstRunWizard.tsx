import React, { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Cloud,
  Cpu,
  Download,
  Import,
  Languages,
  Palette,
  Sparkles,
  UserRound,
  Wand2,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useTranslation, type SupportedLanguage, type TranslationKey } from '../../i18n';
import { ModalOverlay } from '../ui/ModalOverlay';
import { APP_LANGUAGES, APP_THEMES } from '../settings/themes';
import type { LlmProviderType } from '../../types';

const STEPS = ['welcome', 'model', 'character', 'done'] as const;
type Step = (typeof STEPS)[number];

const STEP_LABEL_KEYS = {
  welcome: 'onboarding.stepWelcome',
  model: 'onboarding.stepModel',
  character: 'onboarding.stepCharacter',
  done: 'onboarding.stepDone',
} as const;

const CLOUD_PROVIDERS: { id: LlmProviderType; labelKey: TranslationKey }[] = [
  { id: 'open_router', labelKey: 'settings.providerOpenRouter' },
  { id: 'anthropic', labelKey: 'settings.providerAnthropic' },
  { id: 'open_ai', labelKey: 'settings.providerOpenAi' },
  { id: 'deep_seek', labelKey: 'settings.providerDeepSeek' },
  { id: 'gemini', labelKey: 'settings.providerGemini' },
  { id: 'mistral', labelKey: 'settings.providerMistral' },
];

const CHOICE_CARD =
  'flex gap-3 rounded-xl border text-left transition-all outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400';
const choiceState = (selected: boolean) =>
  selected
    ? 'border-accent-500/80 bg-accent-500/10 text-slate-100'
    : 'border-slate-800 bg-app/60 text-slate-300 hover:border-slate-700 hover:bg-slate-900/60';
const INPUT =
  'w-full bg-app border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-hidden focus:border-accent-500';
const PRIMARY_BUTTON =
  'inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent-600 hover:bg-accent-500 text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed outline-hidden focus-visible:ring-2 focus-visible:ring-accent-300';
const SECONDARY_BUTTON =
  'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-slate-200 text-sm transition-colors outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400';

/** Shown once on a fresh install: language → model source → first character. */
export const FirstRunWizard: React.FC = () => {
  const { t } = useTranslation();
  const store = useAppStore(
    useShallow((s) => ({
      appLanguage: s.appLanguage,
      setAppLanguage: s.setAppLanguage,
      theme: s.theme,
      setTheme: s.setTheme,
      scannedModels: s.scannedModels,
      serverConfig: s.serverConfig,
      selectLocalModel: s.selectLocalModel,
      selectedBackend: s.selectedBackend,
      setSelectedBackend: s.setSelectedBackend,
      cloudProvider: s.cloudProvider,
      setCloudProvider: s.setCloudProvider,
      cloudApiKey: s.cloudApiKey,
      setCloudApiKey: s.setCloudApiKey,
      cloudModel: s.cloudModel,
      setCloudModel: s.setCloudModel,
      availableCharacters: s.availableCharacters,
      activeCharacter: s.activeCharacter,
      selectCharacter: s.selectCharacter,
      setCharacterWizardOpen: s.setCharacterWizardOpen,
      setActiveTab: s.setActiveTab,
      openSettingsSection: s.openSettingsSection,
      startServer: s.startServer,
      completeOnboarding: s.completeOnboarding,
    }))
  );

  const [step, setStep] = useState<Step>('welcome');
  const [apiKeyDraft, setApiKeyDraft] = useState(store.cloudApiKey);
  const [modelDraft, setModelDraft] = useState(store.cloudModel);
  const [startServerNow, setStartServerNow] = useState(true);
  const [modelSelectionPending, setModelSelectionPending] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const stepIndex = STEPS.indexOf(step);
  const isCloud = store.selectedBackend === 'cloud';
  const hasLocalModel = store.scannedModels.length > 0;
  const localModel = store.scannedModels.find((m) => m.path === store.serverConfig.model_path);
  const cloudProviderLabel = t(CLOUD_PROVIDERS.find((p) => p.id === store.cloudProvider)?.labelKey ?? 'settings.providerCustom');

  // Move focus to the new step's heading so screen readers announce it.
  useEffect(() => {
    if (step !== 'welcome') headingRef.current?.focus();
  }, [step]);

  const commitCloudDrafts = () => {
    if (!isCloud) return;
    if (apiKeyDraft !== store.cloudApiKey) store.setCloudApiKey(apiKeyDraft.trim());
    if (modelDraft !== store.cloudModel) store.setCloudModel(modelDraft.trim());
  };

  const goTo = (target: Step) => {
    if (step === 'model') commitCloudDrafts();
    setStep(target);
  };

  const finish = (after?: () => void) => {
    commitCloudDrafts();
    store.completeOnboarding();
    after?.();
  };

  const handleProviderChange = (provider: LlmProviderType) => {
    store.setCloudProvider(provider);
    // The store fills in the provider's default endpoint and model.
    setModelDraft(useAppStore.getState().cloudModel);
  };

  const canContinue = !modelSelectionPending && (step !== 'model' || !isCloud || apiKeyDraft.trim().length > 0);

  const heading = (key: TranslationKey) => (
    <h2 ref={headingRef} tabIndex={-1} id="onboarding-title" className="text-lg font-semibold text-slate-100 outline-hidden">
      {t(key)}
    </h2>
  );

  return (
    <ModalOverlay
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl max-h-full shadow-2xl flex flex-col overflow-hidden">
        {/* Progress */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-800 flex items-center justify-between gap-4">
          <ol className="flex items-center gap-2 text-xs" aria-label={t('onboarding.stepProgress', { current: stepIndex + 1, total: STEPS.length })}>
            {STEPS.map((s, index) => {
              const done = index < stepIndex;
              const active = index === stepIndex;
              return (
                <li key={s} className="flex items-center gap-2" aria-current={active ? 'step' : undefined}>
                  {index > 0 && <span aria-hidden className={`h-px w-5 ${done || active ? 'bg-accent-500/60' : 'bg-slate-700'}`} />}
                  <span
                    className={`grid h-6 w-6 place-items-center rounded-full border text-xs ${
                      active
                        ? 'border-accent-400 bg-accent-600 text-white'
                        : done
                          ? 'border-accent-500/40 bg-accent-500/15 text-accent-300'
                          : 'border-slate-700 bg-slate-800 text-slate-400'
                    }`}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                  </span>
                  <span className={`hidden sm:inline ${active ? 'text-slate-100 font-medium' : 'text-slate-400'}`}>
                    {t(STEP_LABEL_KEYS[s])}
                  </span>
                </li>
              );
            })}
          </ol>
          {step !== 'done' && (
            <button
              type="button"
              onClick={() => finish()}
              className="text-xs text-slate-400 hover:text-slate-200 rounded px-1.5 py-1 outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
            >
              {t('onboarding.skip')}
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {step === 'welcome' && (
            <>
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent-500/15 text-accent-300">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div className="space-y-1.5">
                  {heading('onboarding.welcomeTitle')}
                  <p className="text-sm text-slate-400">{t('onboarding.welcomeText')}</p>
                </div>
              </div>

              <fieldset className="space-y-2">
                <legend className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <Languages className="h-3.5 w-3.5" />
                  {t('onboarding.languageLabel')}
                </legend>
                <div className="grid grid-cols-3 gap-2">
                  {APP_LANGUAGES.map((lang) => (
                    <button
                      key={lang.id}
                      type="button"
                      lang={lang.id}
                      aria-pressed={store.appLanguage === lang.id}
                      onClick={() => store.setAppLanguage(lang.id as SupportedLanguage)}
                      className={`${CHOICE_CARD} ${choiceState(store.appLanguage === lang.id)} justify-center p-3.5 text-sm font-medium`}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <Palette className="h-3.5 w-3.5" />
                  {t('onboarding.themeLabel')}
                </legend>
                <div className="flex flex-wrap gap-2">
                  {APP_THEMES.map((theme) => {
                    const selected = store.theme === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        aria-pressed={selected}
                        title={t(`settings.theme.${theme.id}`)}
                        onClick={() => store.setTheme(theme.id)}
                        className={`${CHOICE_CARD} ${choiceState(selected)} items-center px-3 py-2 text-xs`}
                      >
                        <span className="flex -space-x-1" aria-hidden>
                          <span className="h-4 w-4 rounded-full border border-white/10" style={{ backgroundColor: theme.bg }} />
                          <span className="h-4 w-4 rounded-full border border-white/10" style={{ backgroundColor: theme.primary }} />
                          <span className="h-4 w-4 rounded-full border border-white/10" style={{ backgroundColor: theme.accent }} />
                        </span>
                        {theme.name}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </>
          )}

          {step === 'model' && (
            <>
              <div className="space-y-1.5">
                {heading('onboarding.modelTitle')}
                <p className="text-sm text-slate-400">{t('onboarding.modelText')}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  aria-pressed={!isCloud}
                  onClick={() => store.setSelectedBackend('local')}
                  className={`${CHOICE_CARD} ${choiceState(!isCloud)} items-start p-3.5`}
                >
                  <Cpu className="mt-0.5 h-5 w-5 shrink-0 text-accent-300" />
                  <span>
                    <span className="block text-sm font-semibold">{t('onboarding.localTitle')}</span>
                    <span className="block text-xs text-slate-400">{t('onboarding.localHint')}</span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-pressed={isCloud}
                  onClick={() => store.setSelectedBackend('cloud')}
                  className={`${CHOICE_CARD} ${choiceState(isCloud)} items-start p-3.5`}
                >
                  <Cloud className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                  <span>
                    <span className="block text-sm font-semibold">{t('onboarding.cloudTitle')}</span>
                    <span className="block text-xs text-slate-400">{t('onboarding.cloudHint')}</span>
                  </span>
                </button>
              </div>

              {!isCloud &&
                (hasLocalModel ? (
                  <fieldset className="space-y-2">
                    <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      {t('onboarding.installedModels')}
                    </legend>
                    {store.scannedModels.map((model) => (
                      <label
                        key={model.path}
                        className={`${CHOICE_CARD} ${choiceState(store.serverConfig.model_path === model.path)} items-center p-3.5 cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-400`}
                      >
                        <input
                          type="radio"
                          name="onboarding-model"
                          checked={store.serverConfig.model_path === model.path}
                          onChange={() => {
                            setModelSelectionPending(true);
                            void store.selectLocalModel(model.path).finally(() => setModelSelectionPending(false));
                          }}
                          className="accent-accent-500"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm">{model.name}</span>
                        <span className="shrink-0 text-xs text-slate-400">{(model.size_mb / 1024).toFixed(1)} GB</span>
                      </label>
                    ))}
                  </fieldset>
                ) : (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-amber-200">{t('onboarding.noModelTitle')}</p>
                      <p className="mt-1 text-xs text-slate-400">{t('onboarding.noModelText')}</p>
                    </div>
                    <button type="button" onClick={() => finish(() => store.openSettingsSection('hub'))} className={SECONDARY_BUTTON}>
                      <Download className="h-4 w-4" />
                      {t('onboarding.openModelHub')}
                    </button>
                  </div>
                ))}

              {isCloud && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="onboarding-provider" className="text-xs font-medium text-slate-300">
                      {t('onboarding.providerLabel')}
                    </label>
                    <select
                      id="onboarding-provider"
                      value={store.cloudProvider}
                      onChange={(e) => handleProviderChange(e.target.value as LlmProviderType)}
                      className={INPUT}
                    >
                      {CLOUD_PROVIDERS.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {t(provider.labelKey)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="onboarding-model-id" className="text-xs font-medium text-slate-300">
                      {t('onboarding.modelIdLabel')}
                    </label>
                    <input
                      id="onboarding-model-id"
                      type="text"
                      value={modelDraft}
                      onChange={(e) => setModelDraft(e.target.value)}
                      className={`${INPUT} font-mono`}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <label htmlFor="onboarding-api-key" className="text-xs font-medium text-slate-300">
                      {t('onboarding.apiKeyLabel')}
                    </label>
                    <input
                      id="onboarding-api-key"
                      type="password"
                      autoComplete="off"
                      value={apiKeyDraft}
                      onChange={(e) => setApiKeyDraft(e.target.value)}
                      aria-describedby="onboarding-api-key-hint"
                      className={`${INPUT} font-mono`}
                    />
                    <p id="onboarding-api-key-hint" className="text-xs text-slate-500">
                      {apiKeyDraft.trim() ? t('onboarding.apiKeyHint') : t('onboarding.apiKeyMissing')}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {step === 'character' && (
            <>
              <div className="space-y-1.5">
                {heading('onboarding.characterTitle')}
                <p className="text-sm text-slate-400">{t('onboarding.characterText')}</p>
              </div>

              {store.availableCharacters.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {store.availableCharacters.map((character) => {
                    const selected = store.activeCharacter?.id === character.id;
                    return (
                      <button
                        key={character.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => void store.selectCharacter(character)}
                        className={`${CHOICE_CARD} ${choiceState(selected)} items-center p-2.5`}
                      >
                        {character.avatar_data_url ? (
                          <img src={character.avatar_data_url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-800 text-slate-400">
                            <UserRound className="h-5 w-5" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{character.card.data.name}</span>
                        {selected && <Check className="h-4 w-4 shrink-0 text-accent-300" />}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-xl border border-slate-800 bg-app/60 p-4 text-sm text-slate-400">{t('onboarding.noCharacters')}</p>
              )}

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => finish(() => store.setCharacterWizardOpen(true))} className={SECONDARY_BUTTON}>
                  <Wand2 className="h-4 w-4" />
                  {t('onboarding.createWithAi')}
                </button>
                <button type="button" onClick={() => finish(() => store.setActiveTab('characters'))} className={SECONDARY_BUTTON}>
                  <Import className="h-4 w-4" />
                  {t('onboarding.importCharacter')}
                </button>
              </div>
            </>
          )}

          {step === 'done' && (
            <>
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-300">
                  <Check className="h-6 w-6" />
                </div>
                <div className="space-y-1.5">
                  {heading('onboarding.doneTitle')}
                  <p className="text-sm text-slate-400">{t('onboarding.doneText')}</p>
                </div>
              </div>

              <dl className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-app/60 text-sm">
                {[
                  { label: t('onboarding.summaryLanguage'), value: APP_LANGUAGES.find((l) => l.id === store.appLanguage)?.label },
                  {
                    label: t('onboarding.summaryModel'),
                    value: isCloud ? `${cloudProviderLabel} · ${store.cloudModel}` : localModel?.name,
                  },
                  { label: t('onboarding.summaryCharacter'), value: store.activeCharacter?.card.data.name },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-4 px-4 py-2.5">
                    <dt className="text-slate-400">{row.label}</dt>
                    <dd className={`truncate ${row.value ? 'text-slate-100' : 'text-slate-500 italic'}`}>
                      {row.value || t('onboarding.summaryNone')}
                    </dd>
                  </div>
                ))}
              </dl>

              {!isCloud && localModel && (
                <label className="flex items-center gap-2.5 text-sm text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={startServerNow}
                    onChange={(e) => setStartServerNow(e.target.checked)}
                    className="accent-accent-500"
                  />
                  {t('onboarding.startServer')}
                </label>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-app/70 flex items-center justify-between gap-3">
          {stepIndex > 0 ? (
            <button type="button" onClick={() => goTo(STEPS[stepIndex - 1]!)} className={SECONDARY_BUTTON}>
              <ArrowLeft className="h-4 w-4" />
              {t('onboarding.back')}
            </button>
          ) : (
            <span />
          )}
          {step === 'done' ? (
            <button
              type="button"
              onClick={() =>
                finish(() => {
                  store.setActiveTab('chat');
                  if (!isCloud && localModel && startServerNow) void store.startServer();
                })
              }
              className={PRIMARY_BUTTON}
            >
              {t('onboarding.finish')}
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button type="button" disabled={!canContinue} onClick={() => goTo(STEPS[stepIndex + 1]!)} className={PRIMARY_BUTTON}>
              {t('onboarding.next')}
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
};
