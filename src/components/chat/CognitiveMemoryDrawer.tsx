import React, { useState, useEffect } from 'react';
import { useStoreFields } from '../../store/useAppStore';
import { open } from '@tauri-apps/plugin-dialog';
import {
  Brain,
  X,
  Heart,
  Flame,
  Shield,
  Plus,
  RefreshCw,
  BookHeart,
  Clock,
  Sparkles,
  Bookmark,
  FileCode,
  Save,
  FolderDown,
  RotateCcw,
  Trash2,
  Sliders,
} from 'lucide-react';
import { translate, useTranslation, type TranslationKey } from '../../i18n';
import { confirmDialog, toast } from '../ui/feedback';
import { errorMessage } from '../../utils/errors';
import { ModalOverlay } from '../ui/ModalOverlay';

interface CognitiveMemoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CognitiveMemoryDrawer: React.FC<CognitiveMemoryDrawerProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    activeCharacter,
    cognitiveOverview,
    isMemoryLoading,
    isReflecting,
    lastReflectionResult,
    characterMarkdown,
    userMarkdown,
    memoryBackups,
    isLoadingBackups,
    autoReflectionEnabled,
    autoReflectionThreshold,
    setAutoReflectionEnabled,
    setAutoReflectionThreshold,
    fetchCognitiveOverview,
    updatePsychology,
    updateRelationship,
    addManualMemory,
    addManualDiary,
    triggerEmotionalDecay,
    triggerMemoryPipeline,
    fetchMemoryMarkdown,
    saveCharacterMarkdown,
    saveUserMarkdown,
    generateManualDiary,
    fetchMemoryBackups,
    createMemoryBackup,
    restoreMemoryBackup,
    importSowFolder,
  } = useStoreFields(
    'activeCharacter', 'cognitiveOverview', 'isMemoryLoading', 'isReflecting',
    'lastReflectionResult', 'characterMarkdown', 'userMarkdown', 'memoryBackups',
    'isLoadingBackups', 'autoReflectionEnabled', 'autoReflectionThreshold',
    'setAutoReflectionEnabled', 'setAutoReflectionThreshold', 'fetchCognitiveOverview',
    'updatePsychology', 'updateRelationship', 'addManualMemory', 'addManualDiary',
    'triggerEmotionalDecay', 'triggerMemoryPipeline', 'fetchMemoryMarkdown',
    'saveCharacterMarkdown', 'saveUserMarkdown', 'generateManualDiary', 'fetchMemoryBackups',
    'createMemoryBackup', 'restoreMemoryBackup', 'importSowFolder',
  );
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<
    'psychology' | 'relationship' | 'markdown' | 'memories' | 'diary' | 'healing' | 'backups'
  >('psychology');

  // Form states for manual additions
  const [newMemCategory, setNewMemCategory] = useState<'fact' | 'secret' | 'promise' | 'event' | 'location'>('fact');
  const [newMemContent, setNewMemContent] = useState('');
  const [newMemSignificance, setNewMemSignificance] = useState(3);

  const [newDiaryTitle, setNewDiaryTitle] = useState('');
  const [newDiaryText, setNewDiaryText] = useState('');
  const [newDiaryMood, setNewDiaryMood] = useState('Reflective');

  const [newPrefInput, setNewPrefInput] = useState('');
  const [newMilestoneInput, setNewMilestoneInput] = useState('');
  const [newBeliefInput, setNewBeliefInput] = useState('');

  // Markdown editor states
  const [mdMode, setMdMode] = useState<'character' | 'user'>('character');
  const [localMdContent, setLocalMdContent] = useState('');
  const [mdSaveSuccess, setMdSaveSuccess] = useState(false);

  useEffect(() => {
    if (isOpen && activeCharacter) {
      fetchCognitiveOverview();
      fetchMemoryMarkdown();
      fetchMemoryBackups();
    }
  }, [isOpen, activeCharacter]);

  useEffect(() => {
    if (mdMode === 'character') {
      setLocalMdContent(characterMarkdown);
    } else {
      setLocalMdContent(userMarkdown);
    }
  }, [mdMode, characterMarkdown, userMarkdown]);

  if (!isOpen || !activeCharacter) return null;

  const charName = activeCharacter.card.data.name;
  const psych = cognitiveOverview?.psychology;
  const rel = cognitiveOverview?.relationship;

  const showStatus = (msg: string) => toast.success(msg);
  const showError = (msg: string) => toast.error(msg);

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemContent.trim()) return;
    await addManualMemory(newMemCategory, newMemContent.trim(), newMemSignificance);
    setNewMemContent('');
    showStatus(translate('memory.memorySaved'));
  };

  const handleAddDiary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDiaryTitle.trim() || !newDiaryText.trim()) return;
    await addManualDiary(newDiaryTitle.trim(), newDiaryText.trim(), newDiaryMood);
    setNewDiaryTitle('');
    setNewDiaryText('');
    showStatus(translate('memory.diarySaved'));
  };

  const handleGenerateDiary = async () => {
    const entry = await generateManualDiary();
    if (entry) {
      showStatus(translate('memory.diaryGenerated'));
    }
  };

  const handleAddBelief = async () => {
    if (!newBeliefInput.trim() || !psych) return;
    const currentBeliefs = psych.core_identity || [];
    const updated = {
      ...psych,
      core_identity: [...currentBeliefs, newBeliefInput.trim()],
    };
    await updatePsychology(updated);
    setNewBeliefInput('');
    showStatus(translate('memory.beliefAdded'));
  };

  const handleRemoveBelief = async (index: number) => {
    if (!psych) return;
    const currentBeliefs = psych.core_identity || [];
    const updated = {
      ...psych,
      core_identity: currentBeliefs.filter((_, i) => i !== index),
    };
    await updatePsychology(updated);
    showStatus(translate('memory.beliefRemoved'));
  };

  const handleAddPref = async () => {
    if (!newPrefInput.trim() || !rel) return;
    const updated = {
      ...rel,
      preferences_habits: [...rel.preferences_habits, newPrefInput.trim()],
    };
    await updateRelationship(updated);
    setNewPrefInput('');
  };

  const handleAddMilestone = async () => {
    if (!newMilestoneInput.trim() || !rel) return;
    const updated = {
      ...rel,
      shared_milestones: [...rel.shared_milestones, newMilestoneInput.trim()],
    };
    await updateRelationship(updated);
    setNewMilestoneInput('');
  };

  const handleSaveMarkdown = async () => {
    try {
      if (mdMode === 'character') {
        await saveCharacterMarkdown(localMdContent);
      } else {
        await saveUserMarkdown(localMdContent);
      }
      setMdSaveSuccess(true);
      setTimeout(() => setMdSaveSuccess(false), 3000);
      showStatus(translate('memory.mdSyncedStatus'));
    } catch (e) {
      showError(translate('memory.saveFailed', { error: errorMessage(e) }));
    }
  };

  const handleReloadMarkdown = async () => {
    const res = await fetchMemoryMarkdown();
    if (mdMode === 'character') {
      setLocalMdContent(res.charMd);
    } else {
      setLocalMdContent(res.userMd);
    }
    showStatus(translate('memory.mdReloadedStatus'));
  };

  const handleTriggerReflection = async () => {
    const res = await triggerMemoryPipeline();
    if (res) {
      if (res.no_change) {
        showStatus(translate('memory.reflectNoChange'));
      } else {
        showStatus(
          translate('memory.reflectDone', {
            topics: res.topics_processed.length,
            conflicts: res.healing_entries.length,
          })
        );
      }
    }
  };

  const handleImportSow = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: translate('memory.sowDialogTitle'),
      });
      if (selected && typeof selected === 'string') {
        const count = await importSowFolder(selected);
        showStatus(translate('memory.sowImported', { count }));
      }
    } catch (e) {
      showError(translate('memory.importFailed', { error: errorMessage(e) }));
    }
  };

  const handleCreateBackup = async () => {
    const b = await createMemoryBackup();
    if (b) {
      showStatus(translate('memory.snapshotCreated', { name: b.filename }));
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    const confirmed = await confirmDialog({
      title: translate('confirm.restoreSnapshotTitle', { name: filename }),
      message: translate('confirm.restoreSnapshotText'),
      confirmLabel: translate('confirm.restore'),
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      const b = memoryBackups.find((m) => m.filename === filename);
      if (!b) return;
      // We pass the filename or character backup path
      await restoreMemoryBackup(filename);
      showStatus(translate('memory.snapshotRestored', { name: filename }));
    } catch (e) {
      showError(translate('memory.restoreFailed', { error: errorMessage(e) }));
    }
  };

  return (
    <ModalOverlay onClose={onClose} aria-labelledby="memory-drawer-title" className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity">
      <div className="w-full max-w-3xl bg-slate-900 border-l border-slate-700/70 shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-app/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-accent-500/10 border border-accent-500/20 text-accent-400">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h2 id="memory-drawer-title" className="text-base font-bold text-slate-100 flex items-center gap-2">
                Soul Memory 2.0
                <span className="text-xs px-2 py-0.5 rounded-full bg-accent-900/50 text-accent-300 font-normal border border-accent-500/30">
                  {charName}
                </span>
              </h2>
              <p className="text-xs text-slate-400">{t('memory.subtitle')}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleTriggerReflection}
              disabled={isReflecting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-linear-to-r from-accent-600 to-indigo-600 hover:from-accent-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-accent-900/30 transition disabled:opacity-50"
              title={t('memory.reflectHint')}
            >
              <Sparkles className={`w-3.5 h-3.5 ${isReflecting ? 'animate-spin' : ''}`} />
              {isReflecting ? t('memory.reflecting') : t('memory.reflect')}
            </button>
            <button
              onClick={() => fetchCognitiveOverview()}
              disabled={isMemoryLoading}
              title={t('memory.refresh')}
              aria-label={t('memory.refresh')}
              className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition"
            >
              <RefreshCw className={`w-4 h-4 ${isMemoryLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              title={t('common.close')}
              aria-label={t('common.close')}
              className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Automation Settings Bar */}
        <div className="px-4 py-2 bg-app/50 border-b border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Sliders className="w-3.5 h-3.5 text-slate-500" />
            <span>{t('memory.autoReflection')}</span>
            <button
              onClick={() => setAutoReflectionEnabled(!autoReflectionEnabled)}
              aria-pressed={autoReflectionEnabled}
              className={`px-2 py-0.5 rounded text-xs font-medium transition ${
                autoReflectionEnabled
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {autoReflectionEnabled ? t('memory.enabled') : t('memory.disabled')}
            </button>
            {autoReflectionEnabled && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                {t('memory.every')}
                <select
                  aria-label={t('memory.thresholdLabel')}
                  value={autoReflectionThreshold}
                  onChange={(e) => setAutoReflectionThreshold(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-slate-200 text-xs focus:outline-hidden"
                >
                  <option value={3}>3</option>
                  <option value={5}>5</option>
                  <option value={8}>8</option>
                  <option value={10}>10</option>
                </select>
                {t('memory.messages')}
              </span>
            )}
          </div>

          {lastReflectionResult && (
            <div className="text-xs text-slate-400 italic truncate max-w-xs">
              {lastReflectionResult.no_change
                ? t('memory.lastNoChange')
                : t('memory.lastEmotion', { emotion: lastReflectionResult.psychology.primary_emotion })}
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div role="tablist" aria-label={t('memory.tabs')} className="flex border-b border-slate-800 px-4 bg-app/30 text-xs font-medium overflow-x-auto scrollbar-none">
          <button
            role="tab"
            aria-selected={activeTab === 'psychology'}
            onClick={() => setActiveTab('psychology')}
            className={`py-3 px-3 border-b-2 transition flex items-center gap-1.5 shrink-0 whitespace-nowrap outline-hidden focus-visible:bg-slate-800/60 ${
              activeTab === 'psychology'
                ? 'border-accent-500 text-accent-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Brain className="w-3.5 h-3.5" />
            {t('memory.tabPsychology')}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'relationship'}
            onClick={() => setActiveTab('relationship')}
            className={`py-3 px-3 border-b-2 transition flex items-center gap-1.5 shrink-0 whitespace-nowrap outline-hidden focus-visible:bg-slate-800/60 ${
              activeTab === 'relationship'
                ? 'border-accent-500 text-accent-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Heart className="w-3.5 h-3.5" />
            {t('memory.tabRelationship')}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'markdown'}
            onClick={() => setActiveTab('markdown')}
            className={`py-3 px-3 border-b-2 transition flex items-center gap-1.5 shrink-0 whitespace-nowrap outline-hidden focus-visible:bg-slate-800/60 ${
              activeTab === 'markdown'
                ? 'border-accent-500 text-accent-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            {t('memory.tabMarkdown')}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'memories'}
            onClick={() => setActiveTab('memories')}
            className={`py-3 px-3 border-b-2 transition flex items-center gap-1.5 shrink-0 whitespace-nowrap outline-hidden focus-visible:bg-slate-800/60 ${
              activeTab === 'memories'
                ? 'border-accent-500 text-accent-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            {t('memory.tabMemories', { count: cognitiveOverview?.recent_memories.length || 0 })}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'diary'}
            onClick={() => setActiveTab('diary')}
            className={`py-3 px-3 border-b-2 transition flex items-center gap-1.5 shrink-0 whitespace-nowrap outline-hidden focus-visible:bg-slate-800/60 ${
              activeTab === 'diary'
                ? 'border-accent-500 text-accent-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookHeart className="w-3.5 h-3.5" />
            {t('memory.tabDiary', { count: cognitiveOverview?.recent_diary.length || 0 })}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'healing'}
            onClick={() => setActiveTab('healing')}
            className={`py-3 px-3 border-b-2 transition flex items-center gap-1.5 shrink-0 whitespace-nowrap outline-hidden focus-visible:bg-slate-800/60 ${
              activeTab === 'healing'
                ? 'border-accent-500 text-accent-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            {t('memory.tabHealing', { count: cognitiveOverview?.healing_logs.length || 0 })}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'backups'}
            onClick={() => setActiveTab('backups')}
            className={`py-3 px-3 border-b-2 transition flex items-center gap-1.5 shrink-0 whitespace-nowrap outline-hidden focus-visible:bg-slate-800/60 ${
              activeTab === 'backups'
                ? 'border-accent-500 text-accent-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {t('memory.tabBackups', { count: memoryBackups.length })}
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* TAB 1: PSYCHOLOGY */}
          {activeTab === 'psychology' && psych && (
            <div className="space-y-4">
              {/* Core Identity & Unbreakable Beliefs */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-indigo-400" />
                    {t('memory.beliefsTitle')}
                  </span>
                  <span className="text-xs text-slate-400">
                    {t('memory.beliefCount', { count: psych.core_identity?.length || 0 })}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {(psych.core_identity || []).map((belief, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-900/70 border border-slate-800 text-xs text-slate-200"
                    >
                      <span className="flex-1 pr-2 leading-relaxed">• {belief}</span>
                      <button
                        onClick={() => handleRemoveBelief(idx)}
                        className="text-slate-500 hover:text-rose-400 transition p-1"
                        title={t('memory.removeBelief')}
                        aria-label={t('memory.removeBelief')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {(!psych.core_identity || psych.core_identity.length === 0) && (
                    <div className="text-xs text-slate-500 italic p-2">
                      {t('memory.noBeliefs')}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={newBeliefInput}
                    onChange={(e) => setNewBeliefInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddBelief()}
                    placeholder={t('memory.beliefPlaceholder')}
                    aria-label={t('memory.beliefPlaceholder')}
                    className="flex-1 px-3 py-1.5 bg-slate-900/90 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
                  />
                  <button
                    onClick={handleAddBelief}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t('memory.add')}
                  </button>
                </div>
              </div>

              {/* Primary Emotion & Intensity */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {t('memory.emotionTitle')}
                  </span>
                  <button
                    onClick={() => triggerEmotionalDecay()}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-accent-600/20 text-accent-300 border border-accent-500/30 hover:bg-accent-600/30 transition"
                  >
                    <RefreshCw className="w-3 h-3" />
                    {t('memory.triggerDecay')}
                  </button>
                </div>

                <div className="flex items-center justify-between bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <Flame className="w-5 h-5 text-amber-400" />
                    <div>
                      <div className="text-sm font-bold text-slate-100">{psych.primary_emotion}</div>
                      <div className="text-xs text-slate-400">
                        {t('memory.decayCounter', { count: psych.emotional_decay_counter })}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <button
                        key={level}
                        onClick={() => updatePsychology({ ...psych, intensity: level })}
                        title={t('memory.intensity', { level })}
                        aria-label={t('memory.intensity', { level })}
                        aria-pressed={level <= psych.intensity}
                        className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold transition ${
                          level <= psych.intensity
                            ? 'bg-amber-500 text-app shadow-sm'
                            : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
                        }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Psychological Tension */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  {t('memory.tension')}
                </label>
                <input
                  aria-label={t('memory.tension')}
                  type="text"
                  value={psych.psychological_tension}
                  onChange={(e) =>
                    updatePsychology({ ...psych, psychological_tension: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-hidden focus:border-accent-500"
                  placeholder={t('memory.tensionPlaceholder')}
                />
              </div>

              {/* Cognitive Dissonance */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  {t('memory.dissonance')}
                </label>
                <textarea
                  aria-label={t('memory.dissonance')}
                  rows={2}
                  value={psych.cognitive_dissonance ?? ''}
                  onChange={(e) =>
                    updatePsychology({ ...psych, cognitive_dissonance: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
                  placeholder={t('memory.dissonancePlaceholder')}
                />
              </div>

              {/* Active Agenda */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  {t('memory.agenda')}
                </label>
                <input
                  aria-label={t('memory.agenda')}
                  type="text"
                  value={psych.active_agenda}
                  onChange={(e) =>
                    updatePsychology({ ...psych, active_agenda: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-hidden focus:border-accent-500"
                  placeholder={t('memory.agendaPlaceholder')}
                />
              </div>

              {/* Immediate Focus */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  {t('memory.focus')}
                </label>
                <input
                  aria-label={t('memory.focus')}
                  type="text"
                  value={psych.immediate_focus}
                  onChange={(e) =>
                    updatePsychology({ ...psych, immediate_focus: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-hidden focus:border-accent-500"
                  placeholder={t('memory.focusPlaceholder')}
                />
              </div>
            </div>
          )}

          {/* TAB 2: RELATIONSHIP */}
          {activeTab === 'relationship' && rel && (
            <div className="space-y-4">
              {/* User Identity & Role in Story */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  {t('memory.roleTitle', { name: rel.user_name })}
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="mem-role" className="text-xs text-slate-400 block mb-1">{t('memory.roleInStory')}</label>
                    <input
                      id="mem-role"
                      type="text"
                      value={rel.role_in_story ?? ''}
                      onChange={(e) =>
                        updateRelationship({ ...rel, role_in_story: e.target.value })
                      }
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="mem-attributes" className="text-xs text-slate-400 block mb-1">{t('memory.knownAttributes')}</label>
                    <input
                      id="mem-attributes"
                      type="text"
                      placeholder={t('memory.none')}
                      value={rel.known_attributes ?? ''}
                      onChange={(e) =>
                        updateRelationship({ ...rel, known_attributes: e.target.value })
                      }
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
                    />
                  </div>
                </div>
              </div>

              {/* Trust Level & Dynamic Description */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  {t('memory.trustTitle')}
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    'Distrustful',
                    'Wary',
                    'Neutral',
                    'Developing Trust',
                    'Deeply Bound',
                    'Unstable',
                  ].map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => updateRelationship({ ...rel, trust_level: lvl })}
                      aria-pressed={rel.trust_level === lvl}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
                        rel.trust_level === lvl
                          ? 'bg-accent-600/30 text-accent-200 border-accent-500'
                          : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {t(`memory.trust.${lvl}` as TranslationKey)}
                    </button>
                  ))}
                </div>

                <div>
                  <label htmlFor="mem-dynamic" className="text-xs text-slate-400 block mb-1">{t('memory.dynamic')}</label>
                  <input
                    id="mem-dynamic"
                    type="text"
                    value={rel.dynamic_description ?? ''}
                    onChange={(e) =>
                      updateRelationship({ ...rel, dynamic_description: e.target.value })
                    }
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
                    placeholder={t('memory.dynamicPlaceholder')}
                  />
                </div>

                <div>
                  <label htmlFor="mem-unspoken" className="text-xs text-slate-400 block mb-1">{t('memory.unspoken')}</label>
                  <input
                    id="mem-unspoken"
                    type="text"
                    value={rel.unspoken_tension}
                    onChange={(e) =>
                      updateRelationship({ ...rel, unspoken_tension: e.target.value })
                    }
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
                    placeholder={t('memory.unspokenPlaceholder')}
                  />
                </div>
              </div>

              {/* Preferences & Habits */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  {t('memory.preferences', { count: rel.preferences_habits.length })}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {rel.preferences_habits.map((pref, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded-full bg-slate-900 text-xs text-slate-300 border border-slate-700/80 flex items-center gap-1.5"
                    >
                      {pref}
                      <button
                        onClick={() =>
                          updateRelationship({
                            ...rel,
                            preferences_habits: rel.preferences_habits.filter((_, idx) => idx !== i),
                          })
                        }
                        aria-label={t('memory.removeItem', { item: pref })}
                        className="text-slate-500 hover:text-rose-400 transition"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newPrefInput}
                    onChange={(e) => setNewPrefInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddPref()}
                    placeholder={t('memory.preferencePlaceholder')}
                    aria-label={t('memory.preferencePlaceholder')}
                    className="flex-1 px-3 py-1.5 bg-slate-900/80 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
                  />
                  <button
                    onClick={handleAddPref}
                    className="px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-xs font-medium flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t('memory.add')}
                  </button>
                </div>
              </div>

              {/* Shared Milestones */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  {t('memory.milestones', { count: rel.shared_milestones.length })}
                </span>
                <div className="space-y-1.5">
                  {rel.shared_milestones.map((m, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-slate-300"
                    >
                      <span>✓ {m}</span>
                      <button
                        onClick={() =>
                          updateRelationship({
                            ...rel,
                            shared_milestones: rel.shared_milestones.filter((_, idx) => idx !== i),
                          })
                        }
                        aria-label={t('memory.removeItem', { item: m })}
                        className="text-slate-500 hover:text-rose-400 transition"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMilestoneInput}
                    onChange={(e) => setNewMilestoneInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddMilestone()}
                    placeholder={t('memory.milestonePlaceholder')}
                    aria-label={t('memory.milestonePlaceholder')}
                    className="flex-1 px-3 py-1.5 bg-slate-900/80 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
                  />
                  <button
                    onClick={handleAddMilestone}
                    className="px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-xs font-medium flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t('memory.add')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: MARKDOWN EDITOR */}
          {activeTab === 'markdown' && (
            <div className="space-y-3 flex flex-col h-full">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setMdMode('character')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                      mdMode === 'character'
                        ? 'bg-accent-600 text-white border-accent-500'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    MEMORY.md ({charName})
                  </button>
                  <button
                    onClick={() => setMdMode('user')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                      mdMode === 'user'
                        ? 'bg-accent-600 text-white border-accent-500'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    USER.md ({rel?.user_name || t('memory.mdUser')})
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleReloadMarkdown}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
                    title={t('memory.mdReloadHint')}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    {t('memory.mdReload')}
                  </button>
                  <button
                    onClick={handleSaveMarkdown}
                    className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-semibold transition ${
                      mdSaveSuccess
                        ? 'bg-emerald-600 text-white'
                        : 'bg-accent-600 hover:bg-accent-500 text-white'
                    }`}
                  >
                    <Save className="w-3.5 h-3.5" />
                    {mdSaveSuccess ? t('memory.mdSaved') : t('memory.mdSync')}
                  </button>
                </div>
              </div>

              <div className="text-xs text-slate-400">
                {t('memory.mdHint')}
              </div>

              <textarea
                value={localMdContent}
                onChange={(e) => setLocalMdContent(e.target.value)}
                rows={18}
                className="w-full flex-1 p-3 bg-app font-mono text-xs text-slate-200 border border-slate-800 rounded-xl focus:outline-hidden focus:border-accent-500 leading-relaxed resize-y"
                placeholder={t('memory.mdLoading')}
                aria-label={t('memory.tabMarkdown')}
              />
            </div>
          )}

          {/* TAB 4: EPISODIC MEMORIES */}
          {activeTab === 'memories' && (
            <div className="space-y-4">
              <form
                onSubmit={handleAddMemory}
                className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/70 space-y-2.5"
              >
                <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  {t('memory.addKnowledge')}
                </div>
                <div className="flex gap-2">
                  <select
                    aria-label={t('memory.category')}
                    value={newMemCategory}
                    onChange={(e) => setNewMemCategory(e.target.value as any)}
                    className="bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded px-2 py-1.5 focus:outline-hidden"
                  >
                    {(['fact', 'topic', 'secret', 'promise', 'event', 'location'] as const).map((cat) => (
                      <option key={cat} value={cat}>
                        {t(`memory.cat.${cat}`)}
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label={t('memory.significance')}
                    value={newMemSignificance}
                    onChange={(e) => setNewMemSignificance(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded px-2 py-1.5 focus:outline-hidden"
                  >
                    {([5, 4, 3, 2, 1] as const).map((level) => (
                      <option key={level} value={level}>
                        {t(`memory.sig${level}`)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMemContent}
                    onChange={(e) => setNewMemContent(e.target.value)}
                    placeholder={t('memory.memoryPlaceholder')}
                    aria-label={t('memory.addKnowledge')}
                    className="flex-1 px-3 py-1.5 bg-slate-900/90 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-xs font-semibold"
                  >
                    {t('memory.save')}
                  </button>
                </div>
              </form>

              <div className="space-y-2">
                {cognitiveOverview?.recent_memories.map((mem) => (
                  <div
                    key={mem.id}
                    className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 flex items-start justify-between gap-3 hover:border-slate-600 transition"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] uppercase font-bold px-2 py-0.5 rounded bg-accent-900/60 text-accent-300 border border-accent-500/30">
                          {(['fact', 'topic', 'secret', 'promise', 'event', 'location'] as string[]).includes(mem.category)
                            ? t(`memory.cat.${mem.category}` as TranslationKey)
                            : mem.category}
                        </span>
                        <span className="text-amber-400 text-xs font-mono">
                          {'★'.repeat(mem.significance)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">{mem.content}</p>
                    </div>
                  </div>
                ))}

                {(!cognitiveOverview?.recent_memories ||
                  cognitiveOverview.recent_memories.length === 0) && (
                  <div className="p-8 text-center text-xs text-slate-500 italic">
                    {t('memory.noMemories')}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: DIARY */}
          {activeTab === 'diary' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-xl bg-accent2-950/20 border border-accent2-900/40">
                <div className="text-xs text-accent2-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-accent2-400" />
                  {t('memory.diaryIntro')}
                </div>
                <button
                  onClick={handleGenerateDiary}
                  className="px-3 py-1 rounded-lg bg-accent2-600 hover:bg-accent2-500 text-white text-xs font-semibold transition"
                >
                  {t('memory.generateDiary')}
                </button>
              </div>

              <form
                onSubmit={handleAddDiary}
                className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/70 space-y-2.5"
              >
                <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <BookHeart className="w-3.5 h-3.5 text-accent2-400" />
                  {t('memory.writeDiary')}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newDiaryTitle}
                    onChange={(e) => setNewDiaryTitle(e.target.value)}
                    placeholder={t('memory.diaryTitlePlaceholder')}
                    aria-label={t('memory.diaryTitlePlaceholder')}
                    className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
                  />
                  <select
                    aria-label={t('memory.mood')}
                    value={newDiaryMood}
                    onChange={(e) => setNewDiaryMood(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded px-2 py-1.5 focus:outline-hidden"
                  >
                    {(['Reflective', 'Happy', 'Melancholy', 'Flustered', 'Excited'] as const).map((mood) => (
                      <option key={mood} value={mood}>
                        {t(`memory.mood.${mood}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  rows={2}
                  value={newDiaryText}
                  onChange={(e) => setNewDiaryText(e.target.value)}
                  placeholder={t('memory.diaryTextPlaceholder', { name: charName })}
                  aria-label={t('memory.writeDiary')}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-accent2-600 hover:bg-accent2-500 text-white text-xs font-semibold"
                >
                  {t('memory.saveDiary')}
                </button>
              </form>

              <div className="space-y-3">
                {cognitiveOverview?.recent_diary.map((entry) => (
                  <div
                    key={entry.id}
                    className="p-3.5 rounded-xl bg-slate-800/30 border border-slate-700/60 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-200">{entry.title}</h4>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent2-900/40 text-accent2-300 border border-accent2-500/30">
                        {entry.mood}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 italic leading-relaxed whitespace-pre-wrap">
                      "{entry.entry_text}"
                    </p>
                  </div>
                ))}

                {(!cognitiveOverview?.recent_diary ||
                  cognitiveOverview.recent_diary.length === 0) && (
                  <div className="p-8 text-center text-xs text-slate-500 italic">
                    {t('memory.diaryEmpty')}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: HEALING LOG */}
          {activeTab === 'healing' && (
            <div className="space-y-3">
              <div className="text-xs text-slate-400">
                {t('memory.healingIntro')}
              </div>

              {cognitiveOverview?.healing_logs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 rounded-lg bg-slate-800/40 border border-slate-800 text-xs flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <div>
                      <div className="font-semibold text-slate-200">{log.action}</div>
                      <div className="text-slate-400 text-xs leading-relaxed">{log.details}</div>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500 shrink-0">
                    {new Date(log.created_at * 1000).toLocaleTimeString()}
                  </span>
                </div>
              ))}

              {(!cognitiveOverview?.healing_logs ||
                cognitiveOverview.healing_logs.length === 0) && (
                <div className="p-8 text-center text-xs text-slate-500 italic">
                  {t('memory.healingEmpty')}
                </div>
              )}
            </div>
          )}

          {/* TAB 7: BACKUPS & SOW IMPORT */}
          {activeTab === 'backups' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/60">
                <div>
                  <h3 className="text-xs font-bold text-slate-200">{t('memory.sowTitle')}</h3>
                  <p className="text-xs text-slate-400">{t('memory.sowText')}</p>
                </div>
                <button
                  onClick={handleImportSow}
                  className="px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <FolderDown className="w-3.5 h-3.5" />
                  {t('memory.sowPick')}
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  {t('memory.snapshots', { count: memoryBackups.length })}
                </span>
                <button
                  onClick={handleCreateBackup}
                  className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('memory.createSnapshot')}
                </button>
              </div>

              <div className="space-y-2">
                {memoryBackups.map((b) => (
                  <div
                    key={b.filename}
                    className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-200 font-mono text-xs">
                        {b.filename}
                      </div>
                      <div className="text-slate-400 text-[11px]">
                        {b.date_formatted} • {Math.round(b.size_bytes / 1024)} KB
                      </div>
                    </div>
                    <button
                      onClick={() => handleRestoreBackup(b.filename)}
                      className="px-2.5 py-1 rounded bg-slate-700 hover:bg-accent-600 text-slate-200 text-xs font-medium transition flex items-center gap-1"
                      title={t('memory.restoreSnapshot')}
                    >
                      <RotateCcw className="w-3 h-3" />
                      {t('memory.restore')}
                    </button>
                  </div>
                ))}

                {memoryBackups.length === 0 && !isLoadingBackups && (
                  <div className="p-8 text-center text-xs text-slate-500 italic">
                    {t('memory.noSnapshots')}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
};
