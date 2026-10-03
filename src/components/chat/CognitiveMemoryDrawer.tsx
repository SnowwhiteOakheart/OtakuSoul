import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { PsychologyState, RelationshipState } from '../../types';
import { useStoreFields } from '../../store/useAppStore';
import { Brain, X, Heart, RefreshCw, BookHeart, Clock, Sparkles, Bookmark, FileCode, RotateCcw, Sliders } from 'lucide-react';
import { translate, useTranslation } from '../../i18n';
import { errorMessage } from '../../utils/errors';
import { toast } from '../ui/feedback';
import { ModalOverlay } from '../ui/ModalOverlay';
import { PsychologyTab } from './memory/PsychologyTab';
import { RelationshipTab } from './memory/RelationshipTab';
import { MarkdownTab } from './memory/MarkdownTab';
import { MemoriesTab } from './memory/MemoriesTab';
import { DiaryTab } from './memory/DiaryTab';
import { HealingTab } from './memory/HealingTab';
import { MemoryBackupsTab } from './memory/MemoryBackupsTab';

interface MemoryEditorDraft {
  psychology?: PsychologyState;
  relationship?: RelationshipState;
  psychSaving?: boolean;
  relSaving?: boolean;
  markdown?: Partial<Record<'character' | 'user', string>>;
  markdownPending?: 'save' | 'reload' | null;
}

interface CognitiveMemoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CognitiveMemoryDrawer: React.FC<CognitiveMemoryDrawerProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    activeCharacter, activePersona, cognitiveOverview, isMemoryLoading, isReflecting, lastReflectionResult,
    memoryBackups, autoReflectionEnabled, autoReflectionThreshold, setAutoReflectionEnabled,
    setAutoReflectionThreshold, fetchCognitiveOverview, triggerMemoryPipeline, fetchMemoryMarkdown,
    fetchMemoryBackups,
  } = useStoreFields(
    'activeCharacter', 'activePersona', 'cognitiveOverview', 'isMemoryLoading', 'isReflecting',
    'lastReflectionResult', 'memoryBackups', 'autoReflectionEnabled', 'autoReflectionThreshold',
    'setAutoReflectionEnabled', 'setAutoReflectionThreshold', 'fetchCognitiveOverview',
    'triggerMemoryPipeline', 'fetchMemoryMarkdown', 'fetchMemoryBackups',
  );
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<
    'psychology' | 'relationship' | 'markdown' | 'memories' | 'diary' | 'healing' | 'backups'
  >('psychology');

  // Keep edits through tab switches and closing; never reuse another character/persona's draft.
  const [drafts, setDrafts] = useState<Record<string, MemoryEditorDraft>>({});
  const draftKey = JSON.stringify([activeCharacter?.id, activePersona.name]);
  const draft = drafts[draftKey];
  const changeDraft = (changes: MemoryEditorDraft) =>
    setDrafts((previous) => ({ ...previous, [draftKey]: { ...previous[draftKey], ...changes } }));

  useEffect(() => {
    if (isOpen && activeCharacter) {
      fetchCognitiveOverview();
      fetchMemoryMarkdown().catch((e) => toast.error(translate('memory.loadFailed', { error: errorMessage(e) })));
      fetchMemoryBackups();
    }
  }, [isOpen, activeCharacter, activePersona.name, fetchCognitiveOverview, fetchMemoryMarkdown, fetchMemoryBackups]);

  if (!isOpen || !activeCharacter) return null;

  const charName = activeCharacter.card.data.name;

  const handleTriggerReflection = async () => {
    const res = await triggerMemoryPipeline();
    if (res) {
      if (res.no_change) {
        toast.success(translate('memory.reflectNoChange'));
      } else {
        toast.success(
          translate('memory.reflectDone', {
            topics: res.topics_processed.length,
            conflicts: res.healing_entries.length,
          })
        );
      }
    }
  };

  // The HUD uses backdrop-filter, which otherwise confines fixed descendants to its own bounds.
  return createPortal(
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
            <Sliders className="w-3.5 h-3.5 text-slate-400" />
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
          <div hidden={activeTab !== 'psychology'}>
            <PsychologyTab key={`${draftKey}:psychology`} value={draft?.psychology ?? cognitiveOverview?.psychology}
              isDirty={!!draft?.psychology} isSaving={!!draft?.psychSaving} onSavingChange={(psychSaving) => changeDraft({ psychSaving })} onChange={(psychology) => changeDraft({ psychology })}
              onDiscard={() => changeDraft({ psychology: undefined })} />
          </div>
          <div hidden={activeTab !== 'relationship'}>
            <RelationshipTab key={`${draftKey}:relationship`} value={draft?.relationship ?? cognitiveOverview?.relationship}
              isDirty={!!draft?.relationship} isSaving={!!draft?.relSaving} onSavingChange={(relSaving) => changeDraft({ relSaving })} onChange={(relationship) => changeDraft({ relationship })}
              onDiscard={() => changeDraft({ relationship: undefined })} />
          </div>
          <div hidden={activeTab !== 'markdown'}>
            <MarkdownTab key={draftKey} drafts={draft?.markdown ?? {}}
              pending={draft?.markdownPending ?? null}
              onDraftsChange={(markdown) => changeDraft({ markdown })}
              onPendingChange={(markdownPending) => changeDraft({ markdownPending })} />
          </div>
          {activeTab === 'memories' && <MemoriesTab />}
          {activeTab === 'diary' && <DiaryTab />}
          {activeTab === 'healing' && <HealingTab />}
          {activeTab === 'backups' && <MemoryBackupsTab />}
        </div>
      </div>
    </ModalOverlay>,
    document.body,
  );
};
