import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Lorebook, LorebookEntry } from '../../types';
import { open, save } from '@tauri-apps/plugin-dialog';
import {
  BookOpen,
  Plus,
  Trash2,
  Download,
  Upload,
  Search,
  Globe,
  Flame,
  Check,
  X,
  Edit3,
  Sliders,
  Layers,
  Sparkles,
  AlertTriangle,
  RotateCcw,
  Zap,
  Compass,
} from 'lucide-react';
import { translate } from '../../i18n';
import { confirmDialog } from '../ui/feedback';
import { ModalOverlay } from '../ui/ModalOverlay';

export const LorebookView: React.FC = () => {
  const {
    allLorebooks,
    activeLorebook,
    selectLorebook,
    saveLorebook,
    deleteLorebook,
    importLorebook,
    exportLorebook,
    refreshLorebooks,
    toggleGlobalLorebook,
    globalLorebookIds,
    currentTension,
    adjustTension,
    resetTension,
    sceneTensionEnabled,
    setSceneTensionEnabled,
    openSoulHubTab,
  } = useAppStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [entrySearchQuery, setEntrySearchQuery] = useState('');
  const [triggerFilter, setTriggerFilter] = useState<'all' | 'keyword' | 'regex' | 'always_on' | 'tension'>('all');
  const [editingEntry, setEditingEntry] = useState<{ entry: LorebookEntry; isNew: boolean } | null>(null);
  const [isSavingBook, setIsSavingBook] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showStatus = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 3500);
  };

  // Filtered lorebooks for left sidebar
  const filteredLorebooks = allLorebooks.filter((lb) =>
    lb.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    lb.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

  const isGlobalBook = (lb: Lorebook) => {
    if (lb.is_global) return true;
    if (lb.id && globalLorebookIds.includes(lb.id)) return true;
    if (lb.file_path && globalLorebookIds.includes(lb.file_path)) return true;
    return false;
  };

  // Create brand new Lorebook
  const handleCreateNewLorebook = () => {
    const newBook: Lorebook = {
      id: `lorebook_${Date.now()}`,
      name: 'Neues Lorebook',
      description: 'Beschreibung des Universums oder der Schauplätze...',
      scan_depth: 5,
      is_global: false,
      entries: [
        {
          name: 'Erster Eintrag',
          key: ['Schlüsselwort'],
          secondary_keys: [],
          exclude_key: [],
          regex_keys: [],
          content: 'Details über dieses Thema...',
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
      showStatus(`Lorebook "${imported.name}" erfolgreich importiert!`);
    } catch (e) {
      showStatus(`Import fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`, 'error');
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
      showStatus(`Lorebook erfolgreich exportiert!`);
    } catch (e) {
      showStatus(`Export fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };

  // Save current active lorebook
  const handleSaveActiveLorebook = async () => {
    if (!activeLorebook) return;
    setIsSavingBook(true);
    try {
      await saveLorebook(activeLorebook);
      showStatus(`Lorebook "${activeLorebook.name}" gespeichert!`);
    } catch (e) {
      showStatus(`Speichern fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`, 'error');
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
      showStatus(`Lorebook gelöscht.`);
    } catch (e) {
      showStatus(`Löschen fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };

  // Toggle entry enabled inline
  const handleToggleEntryEnabled = (idxInActive: number) => {
    if (!activeLorebook) return;
    const target = activeLorebook.entries[idxInActive];
    if (!target) return;
    const updatedEntries = [...activeLorebook.entries];
    updatedEntries[idxInActive] = { ...target, enabled: !target.enabled };
    selectLorebook({
      ...activeLorebook,
      entries: updatedEntries,
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
  const handleDeleteEntry = (entryName: string) => {
    if (!activeLorebook) return;
    const updatedEntries = activeLorebook.entries.filter((e) => e.name !== entryName);
    selectLorebook({
      ...activeLorebook,
      entries: updatedEntries,
    });
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-app text-slate-100">
      {/* Toast Notification */}
      {statusMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl border text-xs shadow-2xl flex items-center gap-2 backdrop-blur animate-in fade-in slide-in-from-bottom-2 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200'
              : 'bg-rose-950/80 border-rose-500/50 text-rose-200'
          }`}
        >
          {statusMessage.type === 'success' ? <Check className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* LEFT SIDEBAR: Lorebooks List */}
      <div className="w-80 border-r border-slate-800 bg-slate-900/50 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <BookOpen className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-slate-100">Lorebook 2.0</h1>
                <p className="text-[10px] text-slate-400">{allLorebooks.length} Bücher verfügbar</p>
              </div>
            </div>
            <button
              onClick={refreshLorebooks}
              title="Aktualisieren"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleCreateNewLorebook}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center justify-center gap-1.5 shadow transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Neu</span>
            </button>
            <button
              onClick={handleImport}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 border border-slate-700 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import</span>
            </button>
          </div>

          <button
            onClick={() => openSoulHubTab('lorebooks')}
            className="w-full py-1.5 px-3 rounded-lg bg-accent-600/15 hover:bg-accent-600/25 text-accent-300 border border-accent-500/30 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors shadow-sm"
          >
            <Compass className="w-3.5 h-3.5 text-accent-400" />
            <span>Welt-Lorebooks im Soul Hub</span>
          </button>

          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Lorebooks suchen..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-app border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500/60"
            />
          </div>
        </div>

        {/* List of Lorebooks */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredLorebooks.map((lb) => {
            const isSelected = activeLorebook?.id === lb.id || activeLorebook?.name === lb.name;
            const global = isGlobalBook(lb);

            return (
              <div
                key={lb.id || lb.name}
                onClick={() => selectLorebook(lb)}
                className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-indigo-600/15 border-indigo-500/50 shadow-sm'
                    : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-800/50 hover:border-slate-700/80'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className={`text-xs font-semibold line-clamp-1 ${isSelected ? 'text-indigo-300' : 'text-slate-200'}`}>
                    {lb.name}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {global && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-0.5">
                        <Globe className="w-2.5 h-2.5" />
                        <span>Global</span>
                      </span>
                    )}
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
                      {lb.entries.length} Einträge
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 line-clamp-2">{lb.description || 'Keine Beschreibung.'}</p>
              </div>
            );
          })}

          {filteredLorebooks.length === 0 && (
            <div className="p-8 text-center text-xs text-slate-500">Keine Lorebooks gefunden.</div>
          )}
        </div>
      </div>

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
                  placeholder="Thema oder Beschreibung hinzufügen..."
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
                    isGlobalBook(activeLorebook)
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                      : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                  title="Wenn aktiv, wird dieses Lorebook in jedem Chat für alle Charaktere geladen."
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>{isGlobalBook(activeLorebook) ? 'Global aktiv' : 'Als Global setzen'}</span>
                </button>

                <button
                  onClick={handleExport}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export</span>
                </button>

                <button
                  onClick={handleSaveActiveLorebook}
                  disabled={isSavingBook}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow transition-colors disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isSavingBook ? 'Speichert...' : 'Speichern'}</span>
                </button>

                {activeLorebook.file_path && (
                  <button
                    onClick={handleDeleteActiveLorebook}
                    className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 transition-colors"
                    title="Lorebook löschen"
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
                    <span className="text-xs font-bold text-slate-200">Scene Tension Accumulator</span>
                    <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold ${
                      currentTension > 60 ? 'bg-rose-500/20 text-rose-300' : 'bg-slate-800 text-slate-300'
                    }`}>
                      {currentTension}%
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Spannung steigt bei Gefahr/Konflikt und triggert dramatische Spannungs-Events.
                  </p>
                </div>
              </div>

              {/* Tension Controls */}
              <div className="flex items-center gap-2">
                <div className="w-32 bg-slate-900 rounded-full h-2 border border-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      currentTension > 60
                        ? 'bg-gradient-to-r from-amber-500 to-rose-500'
                        : 'bg-gradient-to-r from-cyan-500 to-indigo-500'
                    }`}
                    style={{ width: `${currentTension}%` }}
                  />
                </div>
                <button
                  onClick={() => adjustTension(10)}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] border border-slate-700"
                >
                  +10
                </button>
                <button
                  onClick={() => adjustTension(-10)}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] border border-slate-700"
                >
                  -10
                </button>
                <button
                  onClick={resetTension}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 text-[10px] border border-slate-700"
                  title="Auf 0 zurücksetzen"
                >
                  Reset
                </button>
                <label className="flex items-center gap-1.5 ml-2 cursor-pointer text-[11px] text-slate-400 select-none">
                  <input
                    type="checkbox"
                    checked={sceneTensionEnabled}
                    onChange={(e) => setSceneTensionEnabled(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
                  />
                  <span>Aktiv</span>
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
                  placeholder="Einträge filtern..."
                  value={entrySearchQuery}
                  onChange={(e) => setEntrySearchQuery(e.target.value)}
                  className="w-full bg-app border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500/60"
                />
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-1">
                {(['all', 'keyword', 'regex', 'always_on', 'tension'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setTriggerFilter(filter)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                      triggerFilter === filter
                        ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    {filter === 'all'
                      ? 'Alle'
                      : filter === 'keyword'
                      ? 'Keywords'
                      : filter === 'regex'
                      ? 'Regex'
                      : filter === 'always_on'
                      ? 'Immer aktiv'
                      : 'Tension'}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() =>
                setEditingEntry({
                  entry: {
                    name: 'Neuer Lore-Eintrag',
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
              <span>Eintrag hinzufügen</span>
            </button>
          </div>

          {/* Entries Grid */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {filteredEntries.map((entry, idx) => (
              <div
                key={entry.name + idx}
                className={`p-4 rounded-xl border transition-all ${
                  entry.enabled
                    ? 'bg-slate-900/60 border-slate-800 hover:border-slate-700/90'
                    : 'bg-app/40 border-slate-900 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={entry.enabled}
                      onChange={() => handleToggleEntryEnabled(idx)}
                      className="rounded bg-app border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                      title={entry.enabled ? 'Aktiv (klicken zum Deaktivieren)' : 'Deaktiviert'}
                    />
                    <h3 className="text-sm font-bold text-slate-100">{entry.name}</h3>

                    {/* Trigger Badge */}
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                      {entry.trigger_type}
                    </span>

                    {/* Behavior Badge */}
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                        entry.injection_behavior === 'active' || entry.injection_behavior === 'directive'
                          ? 'bg-accent-500/20 border-accent-500/40 text-accent-300'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {entry.injection_behavior === 'active' || entry.injection_behavior === 'directive'
                        ? '⚡ Aktiv: Regie-Direktive'
                        : 'Passiv: Weltwissen'}
                    </span>

                    {/* Priority & Probability */}
                    <span className="text-[10px] text-slate-400">
                      Prio: {entry.priority ?? 10} | {entry.probability ?? 100}%
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditingEntry({ entry: { ...entry }, isNew: false })}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-slate-800 transition-colors"
                      title="Bearbeiten"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteEntry(entry.name)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Löschen"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Keys & Filters Tags */}
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  {entry.key.map((k) => (
                    <span key={k} className="px-2 py-0.5 rounded text-[10px] bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                      {k}
                    </span>
                  ))}
                  {entry.secondary_keys && entry.secondary_keys.length > 0 && (
                    <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-500/15 text-cyan-300 border border-cyan-500/30" title="Sekundär (UND-Bedingung)">
                      + {entry.secondary_keys.join(', ')}
                    </span>
                  )}
                  {entry.exclude_key && entry.exclude_key.length > 0 && (
                    <span className="px-2 py-0.5 rounded text-[10px] bg-rose-500/15 text-rose-300 border border-rose-500/30" title="Ausschluss">
                      NOT {entry.exclude_key.join(', ')}
                    </span>
                  )}
                  {entry.tension_threshold && (
                    <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                      <Flame className="w-2.5 h-2.5" /> ab {entry.tension_threshold}%
                    </span>
                  )}
                  {entry.chain_activates && entry.chain_activates.length > 0 && (
                    <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                      <Zap className="w-2.5 h-2.5" /> aktiviert: {entry.chain_activates.join(', ')}
                    </span>
                  )}
                </div>

                {/* Content preview */}
                <p className="text-xs text-slate-300/90 whitespace-pre-wrap line-clamp-3 bg-app/40 p-2.5 rounded-lg border border-slate-800/60 font-sans">
                  {entry.content}
                </p>
              </div>
            ))}

            {filteredEntries.length === 0 && (
              <div className="p-12 text-center text-xs text-slate-500">
                Keine Einträge für diese Filterkriterien gefunden.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 space-y-3">
          <BookOpen className="w-12 h-12 text-slate-700" />
          <h2 className="text-base font-semibold text-slate-300">Kein Lorebook ausgewählt</h2>
          <p className="text-xs text-slate-500 max-w-sm">
            Wähle ein Lorebook aus der Seitenleiste oder erstelle ein neues Universum, um Weltwissen und Regie-Anweisungen zu verwalten.
          </p>
          <button
            onClick={handleCreateNewLorebook}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition-colors"
          >
            Neues Lorebook anlegen
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

interface EntryEditorModalProps {
  initialEntry: LorebookEntry;
  isNew: boolean;
  onSave: (entry: LorebookEntry) => void;
  onClose: () => void;
}

const EntryEditorModal: React.FC<EntryEditorModalProps> = ({ initialEntry, isNew, onSave, onClose }) => {
  const [entry, setEntry] = useState<LorebookEntry>({ ...initialEntry });
  const [primaryKeyInput, setPrimaryKeyInput] = useState((initialEntry.key || []).join(', '));
  const [secondaryKeyInput, setSecondaryKeyInput] = useState((initialEntry.secondary_keys || []).join(', '));
  const [excludeKeyInput, setExcludeKeyInput] = useState((initialEntry.exclude_key || []).join(', '));
  const [regexKeyInput, setRegexKeyInput] = useState((initialEntry.regex_keys || []).join(', '));
  const [chainActivatesInput, setChainActivatesInput] = useState((initialEntry.chain_activates || []).join(', '));
  const [chainRequiresInput, setChainRequiresInput] = useState((initialEntry.chain_requires || []).join(', '));

  const handleSave = () => {
    const parseList = (str: string) =>
      str
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

    const updated: LorebookEntry = {
      ...entry,
      key: parseList(primaryKeyInput),
      secondary_keys: parseList(secondaryKeyInput),
      exclude_key: parseList(excludeKeyInput),
      regex_keys: parseList(regexKeyInput),
      chain_activates: parseList(chainActivatesInput),
      chain_requires: parseList(chainRequiresInput),
    };
    onSave(updated);
  };

  return (
    <ModalOverlay onClose={onClose} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-app/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">
                {isNew ? 'Neuen Lorebook-Eintrag anlegen' : `Eintrag bearbeiten: ${entry.name}`}
              </h2>
              <p className="text-[10px] text-slate-400">Konfiguriere Trigger, Injektions-Modus und Logik</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs text-slate-300">
          {/* Row 1: Name & Enabled */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-1">
              <label className="text-[11px] font-semibold text-slate-300">Name des Eintrags</label>
              <input
                type="text"
                value={entry.name}
                onChange={(e) => setEntry({ ...entry, name: e.target.value })}
                className="w-full bg-app border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="space-y-1 flex flex-col justify-end">
              <label className="flex items-center gap-2 p-2 bg-app border border-slate-800 rounded-lg cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={entry.enabled}
                  onChange={(e) => setEntry({ ...entry, enabled: e.target.checked })}
                  className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
                />
                <span className="font-semibold text-slate-200">Eintrag aktiv</span>
              </label>
            </div>
          </div>

          {/* Row 2: Injection Mode & Trigger Type */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3.5 bg-app/60 rounded-xl border border-slate-800/80">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-200 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                <span>Injektions-Verhalten</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEntry({ ...entry, injection_behavior: 'passive' })}
                  className={`px-3 py-2 rounded-lg border text-left transition-all ${
                    entry.injection_behavior === 'passive'
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200 font-semibold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="font-medium text-xs">Passiv: Weltwissen</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Als Kontext-Wissen</div>
                </button>
                <button
                  type="button"
                  onClick={() => setEntry({ ...entry, injection_behavior: 'active' })}
                  className={`px-3 py-2 rounded-lg border text-left transition-all ${
                    entry.injection_behavior === 'active' || entry.injection_behavior === 'directive'
                      ? 'bg-accent-600/20 border-accent-500 text-accent-200 font-semibold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="font-medium text-xs">Aktiv: Regie-Direktive</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Strikte Handlungsregel</div>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-200 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Trigger-Typ</span>
              </label>
              <select
                value={entry.trigger_type}
                onChange={(e) => setEntry({ ...entry, trigger_type: e.target.value })}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="keyword">Schlüsselwörter (Keyword)</option>
                <option value="regex">Regulärer Ausdruck (Regex)</option>
                <option value="always_on">Immer aktiv (Always-On)</option>
                <option value="tension">Spannungs-Event (Scene Tension)</option>
              </select>
            </div>
          </div>

          {/* Row 3: Keywords & Trigger Inputs */}
          {entry.trigger_type === 'keyword' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300">
                  Primäre Schlüsselwörter (Komma-getrennt)
                </label>
                <input
                  type="text"
                  value={primaryKeyInput}
                  onChange={(e) => setPrimaryKeyInput(e.target.value)}
                  placeholder="z. B. Schloss, Portal, König"
                  className="w-full bg-app border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-cyan-300">
                    Sekundäre Schlüsselwörter (UND-Bedingung)
                  </label>
                  <input
                    type="text"
                    value={secondaryKeyInput}
                    onChange={(e) => setSecondaryKeyInput(e.target.value)}
                    placeholder="Mindestens eines muss vorhanden sein..."
                    className="w-full bg-app border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-rose-300">
                    Ausschluss-Wörter (NOT-Bedingung)
                  </label>
                  <input
                    type="text"
                    value={excludeKeyInput}
                    onChange={(e) => setExcludeKeyInput(e.target.value)}
                    placeholder="Wird ignoriert falls vorhanden..."
                    className="w-full bg-app border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}

          {entry.trigger_type === 'regex' && (
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-300">Reguläre Ausdrücke (Regex-Patterns)</label>
              <input
                type="text"
                value={regexKeyInput}
                onChange={(e) => setRegexKeyInput(e.target.value)}
                placeholder="z. B. \b(Drache|Wyrm|Lindwurm)\b"
                className="w-full bg-app border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          {entry.trigger_type === 'tension' && (
            <div className="space-y-1 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
              <label className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5" />
                <span>Spannungs-Schwellenwert (0 - 100%)</span>
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={entry.tension_threshold || 60}
                onChange={(e) => setEntry({ ...entry, tension_threshold: parseInt(e.target.value) || 60 })}
                className="w-full bg-app border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              />
              <p className="text-[10px] text-amber-400/80">
                Dieser Eintrag löst automatisch aus, sobald die aktuelle Szenenspannung diesen Wert erreicht oder überschreitet.
              </p>
            </div>
          )}

          {/* Row 4: Priority, Probability, Boundary Check */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-300">Priorität (Zahl)</label>
              <input
                type="number"
                value={entry.priority ?? 10}
                onChange={(e) => setEntry({ ...entry, priority: parseInt(e.target.value) || 10 })}
                className="w-full bg-app border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-300">Wahrscheinlichkeit %</label>
              <input
                type="number"
                min={1}
                max={100}
                value={entry.probability ?? 100}
                onChange={(e) => setEntry({ ...entry, probability: parseInt(e.target.value) || 100 })}
                className="w-full bg-app border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100"
              />
            </div>

            <div className="flex items-center gap-1.5 pt-5 cursor-pointer">
              <input
                type="checkbox"
                id="wholeWords"
                checked={entry.match_whole_words || false}
                onChange={(e) => setEntry({ ...entry, match_whole_words: e.target.checked })}
                className="rounded bg-app border-slate-700 text-indigo-600 focus:ring-0"
              />
              <label htmlFor="wholeWords" className="text-[11px] text-slate-300 cursor-pointer">
                Ganze Wörter (\b)
              </label>
            </div>

            <div className="flex items-center gap-1.5 pt-5 cursor-pointer">
              <input
                type="checkbox"
                id="caseSens"
                checked={entry.case_sensitive || false}
                onChange={(e) => setEntry({ ...entry, case_sensitive: e.target.checked })}
                className="rounded bg-app border-slate-700 text-indigo-600 focus:ring-0"
              />
              <label htmlFor="caseSens" className="text-[11px] text-slate-300 cursor-pointer">
                Groß/Klein beachten
              </label>
            </div>
          </div>

          {/* Row 5: Chain Dependencies */}
          <div className="p-3 bg-app/60 rounded-xl border border-slate-800 space-y-2">
            <h4 className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>Ketten-Abhängigkeiten (Chain Dependencies)</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400">Voraussetzung (Erfordert diese Einträge):</label>
                <input
                  type="text"
                  value={chainRequiresInput}
                  onChange={(e) => setChainRequiresInput(e.target.value)}
                  placeholder="Namen oder UIDs..."
                  className="w-full bg-app border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400">Folge-Aktivierung (Aktiviert diese Einträge mit):</label>
                <input
                  type="text"
                  value={chainActivatesInput}
                  onChange={(e) => setChainActivatesInput(e.target.value)}
                  placeholder="Namen oder UIDs..."
                  className="w-full bg-app border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200"
                />
              </div>
            </div>
          </div>

          {/* Row 6: Lore Content Area */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-slate-200">
                Inhalt des Lorebook-Eintrags (Markdown)
              </label>
              <span className="text-[10px] text-slate-400 font-mono">
                Unterstützt {'{{char}}'} & {'{{user}}'}
              </span>
            </div>
            <textarea
              rows={6}
              value={entry.content}
              onChange={(e) => setEntry({ ...entry, content: e.target.value })}
              placeholder="Fließtext, Geschichte, Geografie, Verhaltensregeln oder Anweisungen..."
              className="w-full bg-app border border-slate-800 rounded-xl p-3 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500 leading-relaxed"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-app/60 flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 text-xs font-medium transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={!entry.name.trim()}
            className="px-5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition-colors disabled:opacity-50"
          >
            Eintrag übernehmen
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
};
