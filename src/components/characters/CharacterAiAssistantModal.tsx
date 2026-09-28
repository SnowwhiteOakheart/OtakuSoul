import React, { useState } from 'react';
import { useStoreFields } from '../../store/useAppStore';
import { api } from '../../services/api';
import { CharacterDraft, CharacterWizardInput } from '../../types';
import {
  Sparkles,
  X,
  ChevronRight,
  ChevronLeft,
  Wand2,
  Check,
  Save,
  Copy,
  AlertCircle,
  RefreshCw,
  User,
  Eye,
  Heart,
  Globe,
  MessageSquare,
} from 'lucide-react';
import { ModalOverlay } from '../ui/ModalOverlay';
import { translate, useTranslation, type TranslationKey } from '../../i18n';
import { errorMessage } from '../../utils/errors';

// The chosen archetype is written into the draft, so presets are offered in the UI language.
const ARCHETYPE_PRESETS: TranslationKey[] = [
  'wizard.arch.tsundere',
  'wizard.arch.kuudere',
  'wizard.arch.yandere',
  'wizard.arch.deredere',
  'wizard.arch.dandere',
  'wizard.arch.netrunner',
  'wizard.arch.detective',
  'wizard.arch.elfMage',
  'wizard.arch.android',
  'wizard.arch.kitsune',
  'wizard.arch.vampire',
  'wizard.arch.maid',
  'wizard.arch.rival',
  'wizard.arch.healer',
  'wizard.arch.bountyHunter',
];

export const CharacterAiAssistantModal: React.FC = () => {
  const { t } = useTranslation();
  const {
    characterWizardOpen,
    setCharacterWizardOpen,
    createCharacterFromDraft,
    selectedBackend,
    serverConfig,
    cloudEndpoint,
    cloudApiKey,
    cloudModel,
    cloudProvider,
    replyLanguage,
  } = useStoreFields(
    'characterWizardOpen', 'setCharacterWizardOpen', 'createCharacterFromDraft', 'selectedBackend',
    'serverConfig', 'cloudEndpoint', 'cloudApiKey', 'cloudModel', 'cloudProvider', 'replyLanguage',
  );

  const [step, setStep] = useState<number>(1);
  const [wizardInput, setWizardInput] = useState<CharacterWizardInput>({
    name: '',
    concept: '',
    archetype: '',
    visual_style: '',
    personality_traits: '',
    world_background: '',
    relationship_to_user: '',
    greeting_scenario: '',
    target_language: replyLanguage || 'Deutsch',
  });

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [generatedDraft, setGeneratedDraft] = useState<CharacterDraft | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);

  if (!characterWizardOpen) return null;

  const handleArchetypeClick = (arch: string) => {
    setWizardInput((prev) => ({
      ...prev,
      archetype: prev.archetype === arch ? '' : arch,
    }));
  };

  const handleGenerate = async () => {
    if (!wizardInput.name.trim()) {
      setErrorMsg(t('wizard.nameRequired'));
      return;
    }

    setIsGenerating(true);
    setErrorMsg(null);

    const endpointUrl =
      selectedBackend === 'local'
        ? `http://127.0.0.1:${serverConfig.port}/v1/chat/completions`
        : cloudEndpoint;
    const apiKey = selectedBackend === 'local' ? undefined : cloudApiKey;
    const model = selectedBackend === 'local' ? serverConfig.model_path : cloudModel;
    const provider = selectedBackend === 'local' ? undefined : cloudProvider;

    try {
      const draft = await api.generateCharacterDraftLlm(
        wizardInput,
        endpointUrl,
        apiKey,
        model,
        provider
      );
      setGeneratedDraft(draft);
      setStep(6); // Step 6 = Review & Fine-tune
    } catch (e) {
      console.warn('Direct LLM generation failed, providing fallback via prompt:', e);
      try {
        await api.buildCharacterWizardPrompt(wizardInput);
        setErrorMsg(translate('wizard.generationFailed', { error: errorMessage(e) }));
        // Fallback default draft so user can still edit
        setGeneratedDraft({
          name: wizardInput.name || translate('wizard.fallbackName'),
          description: `${wizardInput.archetype ? translate('wizard.fallbackArchetype', { archetype: wizardInput.archetype }) : ''}${wizardInput.visual_style}`,
          personality: wizardInput.personality_traits || translate('wizard.fallbackPersonality'),
          scenario: wizardInput.greeting_scenario || translate('wizard.fallbackScenario'),
          first_mes: translate('wizard.fallbackFirstMes'),
          mes_example: translate('wizard.fallbackExample', { name: wizardInput.name || translate('editor.defaultName') }),
          system_prompt: translate('wizard.fallbackSystem', { name: wizardInput.name || translate('wizard.fallbackCharacter') }),
          tags: [wizardInput.archetype, 'Original'].filter(Boolean) as string[],
        });
        setStep(6);
      } catch {
        setErrorMsg(t('wizard.promptFailed'));
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyPrompt = async () => {
    try {
      const prompt = await api.buildCharacterWizardPrompt(wizardInput);
      await navigator.clipboard.writeText(prompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2500);
    } catch (e) {
      console.error('Failed to copy prompt:', e);
    }
  };

  const handleSaveToLibrary = async () => {
    if (!generatedDraft) return;
    try {
      await createCharacterFromDraft(generatedDraft);
      setCharacterWizardOpen(false);
    } catch (e) {
      setErrorMsg(translate('wizard.saveFailed', { error: errorMessage(e) }));
    }
  };

  const updateDraftField = <K extends keyof CharacterDraft>(field: K, value: CharacterDraft[K]) => {
    if (!generatedDraft) return;
    setGeneratedDraft({
      ...generatedDraft,
      [field]: value,
    });
  };

  return (
    <ModalOverlay onClose={() => setCharacterWizardOpen(false)} aria-labelledby="wizard-title" className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-app/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-linear-to-tr from-indigo-600 to-accent-500 border border-indigo-400/40 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="wizard-title" className="text-base font-bold text-slate-100">{t('wizard.title')}</h2>
                <span className="text-[11px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {t('wizard.badge')}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {t('wizard.subtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={() => setCharacterWizardOpen(false)}
            title={t('common.close')}
            aria-label={t('common.close')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Progress Bar */}
        <div className="px-6 py-3 bg-app/40 border-b border-slate-800/80">
          <div className="flex items-center justify-between">
            {[
              { num: 1, label: t('wizard.step.concept'), icon: User },
              { num: 2, label: t('wizard.step.appearance'), icon: Eye },
              { num: 3, label: t('wizard.step.nature'), icon: Heart },
              { num: 4, label: t('wizard.step.world'), icon: Globe },
              { num: 5, label: t('wizard.step.scenario'), icon: MessageSquare },
              { num: 6, label: t('wizard.step.review'), icon: Wand2 },
            ].map((s) => {
              const Icon = s.icon;
              const isActive = step === s.num;
              const isDone = step > s.num;
              return (
                <button
                  type="button"
                  key={s.num}
                  onClick={() => setStep(s.num)}
                  disabled={isGenerating || (s.num > 5 && !generatedDraft)}
                  aria-current={isActive ? 'step' : undefined}
                  aria-label={s.label}
                  className={`flex items-center gap-1.5 cursor-pointer transition select-none rounded-md disabled:cursor-default ${
                    isActive
                      ? 'text-indigo-400 font-semibold'
                      : isDone
                      ? 'text-emerald-400 font-medium'
                      : 'text-slate-500 hover:text-slate-400'
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs border ${
                      isActive
                        ? 'bg-indigo-600 border-indigo-400 text-white shadow-md shadow-indigo-600/30'
                        : isDone
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    {isDone ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3 h-3" />}
                  </span>
                  <span className="hidden sm:inline text-xs">{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-sm">
          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <div className="text-xs leading-relaxed">{errorMsg}</div>
            </div>
          )}

          {/* STEP 1: Konzept & Name */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                  {t('wizard.name')} <span className="text-rose-400" aria-hidden>*</span>
                </label>
                <input
                  aria-label={t('wizard.name')}
                  required
                  data-autofocus
                  type="text"
                  value={wizardInput.name}
                  onChange={(e) => setWizardInput({ ...wizardInput, name: e.target.value })}
                  placeholder={t('wizard.namePlaceholder')}
                  className="w-full bg-app border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                  {t('wizard.concept')}
                </label>
                <input
                  type="text"
                  value={wizardInput.concept}
                  onChange={(e) => setWizardInput({ ...wizardInput, concept: e.target.value })}
                  placeholder={t('wizard.conceptPlaceholder')}
                  className="w-full bg-app border border-slate-700/80 rounded-xl px-3.5 py-2 text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                  {t('wizard.archetype')}
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {ARCHETYPE_PRESETS.map((archKey) => {
                    const arch = t(archKey);
                    const selected = wizardInput.archetype === arch;
                    return (
                      <button
                        key={arch}
                        type="button"
                        onClick={() => handleArchetypeClick(arch)}
                        aria-pressed={selected}
                        className={`px-2.5 py-1 rounded-lg text-xs transition border ${
                          selected
                            ? 'bg-indigo-600 text-white border-indigo-400 shadow-sm'
                            : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800 hover:border-slate-600'
                        }`}
                      >
                        {arch}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="text"
                  value={wizardInput.archetype}
                  onChange={(e) => setWizardInput({ ...wizardInput, archetype: e.target.value })}
                  placeholder={t('wizard.archetypePlaceholder')}
                  className="w-full bg-app border border-slate-700/80 rounded-xl px-3.5 py-2 text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 text-xs"
                />
              </div>
            </div>
          )}

          {/* STEP 2: Aussehen & Kleidung */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                  {t('wizard.appearance')}
                </label>
                <textarea
                  rows={4}
                  value={wizardInput.visual_style}
                  onChange={(e) => setWizardInput({ ...wizardInput, visual_style: e.target.value })}
                  placeholder={t('wizard.appearancePlaceholder')}
                  className="w-full bg-app border border-slate-700/80 rounded-xl p-3 text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 resize-none text-xs leading-relaxed"
                />
              </div>

              <div className="p-3 bg-app/60 border border-slate-800 rounded-xl">
                <span className="text-xs font-medium text-indigo-300 block mb-1">{t('wizard.tip')}</span>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {t('wizard.tipText')}
                </p>
              </div>
            </div>
          )}

          {/* STEP 3: Persönlichkeit & Macken */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                  {t('wizard.traits')}
                </label>
                <textarea
                  rows={4}
                  value={wizardInput.personality_traits}
                  onChange={(e) =>
                    setWizardInput({ ...wizardInput, personality_traits: e.target.value })
                  }
                  placeholder={t('wizard.traitsPlaceholder')}
                  className="w-full bg-app border border-slate-700/80 rounded-xl p-3 text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 resize-none text-xs leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* STEP 4: Welt & Beziehung zu {{user}} */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                  {t('wizard.world')}
                </label>
                <textarea
                  rows={3}
                  value={wizardInput.world_background}
                  onChange={(e) =>
                    setWizardInput({ ...wizardInput, world_background: e.target.value })
                  }
                  placeholder={t('wizard.worldPlaceholder')}
                  className="w-full bg-app border border-slate-700/80 rounded-xl p-3 text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 resize-none text-xs leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                  {t('wizard.relation')}
                </label>
                <input
                  type="text"
                  value={wizardInput.relationship_to_user}
                  onChange={(e) =>
                    setWizardInput({ ...wizardInput, relationship_to_user: e.target.value })
                  }
                  placeholder={t('wizard.relationPlaceholder')}
                  className="w-full bg-app border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 text-xs"
                />
              </div>
            </div>
          )}

          {/* STEP 5: Szenario & Begrüßung */}
          {step === 5 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                  {t('wizard.openingScene')}
                </label>
                <textarea
                  rows={3}
                  value={wizardInput.greeting_scenario}
                  onChange={(e) =>
                    setWizardInput({ ...wizardInput, greeting_scenario: e.target.value })
                  }
                  placeholder={t('wizard.openingScenePlaceholder')}
                  className="w-full bg-app border border-slate-700/80 rounded-xl p-3 text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 resize-none text-xs leading-relaxed"
                />
              </div>

              <div className="bg-indigo-950/30 border border-indigo-500/30 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-indigo-200">{t('wizard.ready')}</h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {t('wizard.readyText')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isGenerating || !wizardInput.name.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-linear-to-r from-indigo-600 to-accent-600 hover:from-indigo-500 hover:to-accent-500 text-white font-medium text-xs shadow-lg shadow-indigo-600/30 disabled:opacity-50 transition"
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{t('wizard.generating')}</span>
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4" />
                      <span>{t('wizard.generate')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 6: Review & Fine-Tuning */}
          {step === 6 && generatedDraft && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-100">{generatedDraft.name}</span>
                  <div className="flex items-center gap-1">
                    {generatedDraft.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[11px] border border-slate-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyPrompt}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700 transition"
                    title={t('wizard.copyPrompt')}
                  >
                    {copiedPrompt ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedPrompt ? t('wizard.copied') : t('wizard.prompt')}</span>
                  </button>
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700 transition"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                    <span>{t('wizard.regenerate')}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    {t('wizard.draftDescription')}
                  </label>
                  <textarea
                    rows={4}
                    value={generatedDraft.description}
                    onChange={(e) => updateDraftField('description', e.target.value)}
                    className="w-full bg-app border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500 resize-none leading-relaxed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    {t('wizard.draftPersonality')}
                  </label>
                  <textarea
                    rows={4}
                    value={generatedDraft.personality}
                    onChange={(e) => updateDraftField('personality', e.target.value)}
                    className="w-full bg-app border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500 resize-none leading-relaxed"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  {t('wizard.draftScenario')}
                </label>
                <textarea
                  rows={2}
                  value={generatedDraft.scenario}
                  onChange={(e) => updateDraftField('scenario', e.target.value)}
                  className="w-full bg-app border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500 resize-none leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  {t('wizard.draftFirstMessage')}
                </label>
                <textarea
                  rows={3}
                  value={generatedDraft.first_mes}
                  onChange={(e) => updateDraftField('first_mes', e.target.value)}
                  className="w-full bg-app border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500 resize-none leading-relaxed font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  {t('wizard.draftSystemPrompt')}
                </label>
                <textarea
                  rows={3}
                  value={generatedDraft.system_prompt}
                  onChange={(e) => updateDraftField('system_prompt', e.target.value)}
                  className="w-full bg-app border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500 resize-none leading-relaxed font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  {t('wizard.draftExamples')}
                </label>
                <textarea
                  rows={3}
                  value={generatedDraft.mes_example}
                  onChange={(e) => updateDraftField('mes_example', e.target.value)}
                  className="w-full bg-app border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500 resize-none leading-relaxed font-mono text-xs"
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-app/70 border-t border-slate-800 flex items-center justify-between">
          <div>
            {step > 1 && step <= 5 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700 transition"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>{t('wizard.back')}</span>
              </button>
            )}
            {step === 6 && (
              <button
                type="button"
                onClick={() => setStep(5)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700 transition"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>{t('wizard.adjust')}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {step < 5 && (
              <button
                type="button"
                onClick={() => {
                  if (step === 1 && !wizardInput.name.trim()) {
                    setErrorMsg(t('wizard.enterName'));
                    return;
                  }
                  setErrorMsg(null);
                  setStep(step + 1);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-md shadow-indigo-600/30 transition"
              >
                <span>{t('wizard.next')}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}

            {step === 5 && (
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating || !wizardInput.name.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-linear-to-r from-indigo-600 to-accent-600 hover:from-indigo-500 hover:to-accent-500 text-white font-medium text-xs shadow-lg shadow-indigo-600/30 disabled:opacity-50 transition"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{t('wizard.generatingDraft')}</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4" />
                    <span>{t('wizard.generate')}</span>
                  </>
                )}
              </button>
            )}

            {step === 6 && (
              <button
                type="button"
                onClick={handleSaveToLibrary}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-lg shadow-emerald-600/30 transition"
              >
                <Save className="w-4 h-4" />
                <span>{t('wizard.save')}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
};
