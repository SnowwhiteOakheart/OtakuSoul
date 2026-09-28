import React, { useState } from 'react';
import { useStoreFields } from '../../store/useAppStore';
import { Lorebook, LorebookEntry } from '../../types';
import { open, save } from '@tauri-apps/plugin-dialog';
import {
  BookOpen,
  Plus,
  Trash2,
  Download,
  Search,
  Globe,
  Flame,
  Check,
} from 'lucide-react';
import { EntryEditorModal } from './EntryEditorModal';
import { EntryCard } from './EntryCard';
import { LorebookSidebar } from './LorebookSidebar';
import { isGlobalLorebook } from './isGlobalLorebook';
import { translate, useTranslation } from '../../i18n';
import { confirmDialog, toast } from '../ui/feedback';
import { errorMessage } from '../../utils/errors';

export const LorebookView: React.FC = () => {
  const { t } = useTranslation();
  const {
    activeLorebook,
    selectLorebook,
    saveLorebook,
    deleteLorebook,
    importLorebook,
    exportLorebook,
    toggleGlobalLorebook,
    globalLorebookIds,
    currentTension,
    adjustTension,
    resetTension,
    sceneTensionEnabled,
    setSceneTensionEnabled,
  } = useStoreFields(
    'activeLorebook', 'selectLorebook', 'saveLorebook', 'deleteLorebook',
    'importLorebook', 'exportLorebook', 'toggleGlobalLorebook', 'globalLorebookIds',
    'currentTension', 'adjustTension', 'resetTension', 'sceneTensionEnabled',
    'setSceneTensionEnabled', );

  const [entrySearchQuery, setEntrySearchQuery] = useState('');
  const [triggerFilter, setTriggerFilter] = useState<'all' | 'keyword' | 'regex' | 'always_on' | 'tension'>('all');
  const [editingEntry, setEditingEntry] = useState<{ entry: LorebookEntry; isNew: boolean } | null>(null);
  const [isSavingBook, setIsSavingBook] = useState(false);
  const showStatus = (text: string, type: 'success' | 'error' = 'success') =>
    type === 'success' ? toast.success(text) : toast.error(text);

  // Filtered entries of active lorebook
  const activeEntries = activeLorebook?.entries || [];
  const filteredEntries = activeEntries.filter((entry) => {
    const matchesSearch =
      entry.name.toLowerCase().includes(entrySearchQuery.toLowerCase()) ||
      entry.content.toLowerCase().includes(entrySearchQuery.toLowerCase()) ||
      entry.key.some((k) => k.toLowerCase().includes(entrySearchQuery.toLowerCase()));

    const matchesFilter =
      triggerFilter === 'all' || entry.trigger_type.toLowerCase() === triggerFilter;

    return matchesSearch && matchesFilter;
  });

  // Create brand new Lorebook
  const handleCreateNewLorebook = () => {
    const newBook: Lorebook = {
      id: `lorebook_${Date.now()}`,
      name: t('lore.newBookName'),
      description: t('lore.newBookDesc'),
      scan_depth: 5,
      is_global: false,
      entries: [
        {
          name: t('lore.firstEntry'),
          key: [t('lore.keywordExample')],
          secondary_keys: [],
          exclude_key: [],
          regex_keys: [],
          content: t('lore.firstEntryContent'),
          trigger_type: 'keyword',
          probability: 100,
          priority: 10,
          enabled: true,
          injection_behavior: 'passive',
          case_sensitive: false,
          match_whole_words: false,
          chain_requires: [],
          chain_activates: [],
          tension_threshold: undefined,
        },
      ],
    };
    selectLorebook(newBook);
  };

  // Import JSON Lorebook
  const handleImport = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Lorebook JSON', extensions: ['json'] }],
      });
      if (!selected || typeof selected !== 'string') return;

      const imported = await importLorebook(selected);
      showStatus(translate('lore.imported', { name: imported.name }));
    } catch (e) {
      showStatus(translate('lore.importFailed', { error: errorMessage(e) }), 'error');
    }
  };

  // Export JSON Lorebook
  const handleExport = async () => {
    if (!activeLorebook) return;
    try {
      const target = await save({
        defaultPath: `${activeLorebook.name.toLowerCase().replace(/\s+/g, '_')}.json`,
        filters: [{ name: 'Lorebook JSON', extensions: ['json'] }],
      });
      if (!target) return;

      await exportLorebook(activeLorebook, target);
      showStatus(translate('lore.exported'));
    } catch (e) {
      showStatus(translate('lore.exportFailed', { error: errorMessage(e) }), 'error');
    }
  };

  // Save current active lorebook
  const handleSaveActiveLorebook = async () => {
    if (!activeLorebook) return;
    setIsSavingBook(true);
    try {
      await saveLorebook(activeLorebook);
      showStatus(translate('lore.saved', { name: activeLorebook.name }));
    } catch (e) {
      showStatus(translate('lore.saveFailed', { error: errorMessage(e) }), 'error');
    } finally {
      setIsSavingBook(false);
    }
  };

  // Delete active lorebook
  const handleDeleteActiveLorebook = async () => {
    if (!activeLorebook || !activeLorebook.file_path) return;
    const confirmed = await confirmDialog({
      title: translate('confirm.deleteLorebookTitle', { name: activeLorebook.name }),
      message: translate('confirm.cannotUndo'),
      confirmLabel: translate('common.delete'),
      tone: 'danger',
    });
    if (!confirmed) return;

    try {
      await deleteLorebook(activeLorebook.file_path);
      showStatus(translate('lore.deleted'));
    } catch (e) {
      showStatus(translate('lore.deleteFailed', { error: errorMessage(e) }), 'error');
    }
  };

  // Toggle by identity: the list may be filtered, so its index does not match the lorebook.
  const handleToggleEntry = (target: LorebookEntry) => {
    if (!activeLorebook) return;
    selectLorebook({
      ...activeLorebook,
      entries: activeLorebook.entries.map((e) => (e === target ? { ...e, enabled: !e.enabled } : e)),
    });
  };

  // Save an entry from modal
  const handleSaveEntryModal = (savedEntry: LorebookEntry, isNew: boolean) => {
    if (!activeLorebook) return;
    let updatedEntries = [...activeLorebook.entries];
    if (isNew) {
      updatedEntries.push(savedEntry);
    } else {
      updatedEntries = updatedEntries.map((e) => (e.name === editingEntry?.entry.name ? savedEntry : e));
    }
    selectLorebook({
      ...activeLorebook,
      entries: updatedEntries,
    });
    setEditingEntry(null);
  };

  // Delete an entry
  const handleDeleteEntry = async (entryName: string) => {
    if (!activeLorebook) return;
    const confirmed = await confirmDialog({
      title: translate('confirm.deleteEntryTitle', { name: entryName }),
      message: translate('confirm.deleteEntryText'),
      confirmLabel: translate('common.delete'),
      tone: 'danger',
    });
    if (!confirmed) return;
    const updatedEntries = activeLorebook.entries.filter((e) => e.name !== entryName);
    selectLorebook({
      ...activeLorebook,
      entries: updatedEntries,
    });
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-app text-slate-100">
      <LorebookSidebar onCreate={handleCreateNewLorebook} onImport={() => void handleImport()} />

      {/* RIGHT MAIN PANEL: Lorebook Editor & Entries */}
      {activeLorebook ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top Bar: Lorebook Details & Global Actions */}
          <div className="p-5 border-b border-slate-800 bg-slate-900/40 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex-1 min-w-[280px]">
                <input
                  type="text"
                  value={activeLorebook.name}
                  onChange={(e) =>
                    selectLorebook({
                      ...activeLorebook,
                      name: e.target.value,
                    })
                  }
                  className="bg-transparent text-lg font-bold text-slate-100 hover:bg-slate-800/40 focus:bg-app focus:border-indigo-500/60 border border-transparent rounded-lg px-2 py-1 transition-all w-full"
                />
                <input
                  type="text"
                  value={activeLorebook.description}
                  placeholder={t('lore.descPlaceholder')}
                  onChange={(e) =>
                    selectLorebook({
                      ...activeLorebook,
                      description: e.target.value,
                    })
                  }
                  className="bg-transparent text-xs text-slate-400 hover:bg-slate-800/40 focus:bg-app focus:border-indigo-500/60 border border-transparent rounded-lg px-2 py-1 transition-all w-full mt-0.5"
                />
              </div>

              {/* Action Toolbar */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => activeLorebook.id && toggleGlobalLorebook(activeLorebook.id)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors ${
                    isGlobalLorebook(activeLorebook, globalLorebookIds)
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                      : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                  title={t('lore.globalHint')}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>{isGlobalLorebook(activeLorebook, globalLorebookIds) ? t('lore.globalActive') : t('lore.setGlobal')}</span>
                </button>

                <button
                  onClick={handleExport}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{t('lore.export')}</span>
                </button>

                <button
                  onClick={handleSaveActiveLorebook}
                  disabled={isSavingBook}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow transition-colors disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isSavingBook ? t('common.saving') : t('common.save')}</span>
                </button>

                {activeLorebook.file_path && (
                  <button
                    onClick={handleDeleteActiveLorebook}
                    className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 transition-colors"
                    title={t('lore.deleteBook')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Tension Accumulator HUD & Config */}
            <div className="p-3 bg-app/70 border border-slate-800/80 rounded-xl flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                  currentTension > 60
                    ? 'bg-rose-500/20 border-rose-500/40 text-rose-400 animate-pulse'
                    : currentTension > 30
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                    : 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400'
                }`}>
                  <Flame className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-200">{t('lore.tensionTitle')}</span>
                    <span className={`text-[11px] font-mono px-1.5 py-0.2 rounded font-bold ${
                      currentTension > 60 ? 'bg-rose-500/20 text-rose-300' : 'bg-slate-800 text-slate-300'
                    }`}>
                      {currentTension}%
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {t('lore.tensionIntro')}
                  </p>
                </div>
              </div>

              {/* Tension Controls */}
              <div className="flex items-center gap-2">
                <div className="w-32 bg-slate-900 rounded-full h-2 border border-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      currentTension > 60
                        ? 'bg-linear-to-r from-amber-500 to-rose-500'
                        : 'bg-linear-to-r from-cyan-500 to-indigo-500'
                    }`}
                    style={{ width: `${currentTension}%` }}
                  />
                </div>
                <button
                  onClick={() => adjustTension(10)}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] border border-slate-700"
                >
                  +10
                </button>
                <button
                  onClick={() => adjustTension(-10)}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] border border-slate-700"
                >
                  -10
                </button>
                <button
                  onClick={resetTension}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 text-[11px] border border-slate-700"
                  title={t('lore.tensionReset')}
                >
                  {t('lore.reset')}
                </button>
                <label className="flex items-center gap-1.5 ml-2 cursor-pointer text-xs text-slate-400 select-none">
                  <input
                    type="checkbox"
                    checked={sceneTensionEnabled}
                    onChange={(e) => setSceneTensionEnabled(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
                  />
                  <span>{t('lore.active')}</span>
                </label>
              </div>
            </div>
          </div>

          {/* Subheader: Filter & Entry Search */}
          <div className="px-5 py-3 border-b border-slate-800/80 bg-slate-900/20 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="relative w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder={t('lore.filterEntries')}
                  aria-label={t('lore.filterEntries')}
                  value={entrySearchQuery}
                  onChange={(e) => setEntrySearchQuery(e.target.value)}
                  className="w-full bg-app border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500/60"
                />
              </div>

              {/* Filter Pills */}
              <div role="group" aria-label={t('lore.filterLabel')} className="flex items-center gap-1">
                {(['all', 'keyword', 'regex', 'always_on', 'tension'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setTriggerFilter(filter)}
                    aria-pressed={triggerFilter === filter}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      triggerFilter === filter
                        ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    {t(
                      filter === 'all'
                        ? 'lore.filterAll'
                        : filter === 'keyword'
                          ? 'lore.filterKeyword'
                          : filter === 'regex'
                            ? 'lore.filterRegex'
                            : filter === 'always_on'
                              ? 'lore.filterAlways'
                              : 'lore.filterTension'
                    )}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() =>
                setEditingEntry({
                  entry: {
                    name: t('lore.newEntryName'),
                    key: [],
                    secondary_keys: [],
                    exclude_key: [],
                    regex_keys: [],
                    content: '',
                    trigger_type: 'keyword',
                    probability: 100,
                    priority: 10,
                    enabled: true,
                    injection_behavior: 'passive',
                    case_sensitive: false,
                    match_whole_words: false,
                    chain_requires: [],
                    chain_activates: [],
                    tension_threshold: undefined,
                  },
                  isNew: true,
                })
              }
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5 shadow transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('lore.addEntry')}</span>
            </button>
          </div>

          {/* Entries Grid */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {filteredEntries.map((entry, idx) => (
              <EntryCard
                key={entry.name + idx}
                entry={entry}
                onToggle={() => handleToggleEntry(entry)}
                onEdit={() => setEditingEntry({ entry: { ...entry }, isNew: false })}
                onDelete={() => void handleDeleteEntry(entry.name)}
              />
            ))}

            {filteredEntries.length === 0 && (
              <div className="p-12 text-center text-xs text-slate-500">
                {t('lore.noEntries')}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 space-y-3">
          <BookOpen className="w-12 h-12 text-slate-700" />
          <h2 className="text-base font-semibold text-slate-300">{t('lore.noneSelected')}</h2>
          <p className="text-xs text-slate-500 max-w-sm">
            {t('lore.noneSelectedText')}
          </p>
          <button
            onClick={handleCreateNewLorebook}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition-colors"
          >
            {t('lore.createBook')}
          </button>
        </div>
      )}

      {/* ENTRY EDITOR MODAL */}
      {editingEntry && (
        <EntryEditorModal
          initialEntry={editingEntry.entry}
          isNew={editingEntry.isNew}
          onSave={(saved) => handleSaveEntryModal(saved, editingEntry.isNew)}
          onClose={() => setEditingEntry(null)}
        />
      )}
    </div>
  );
};
