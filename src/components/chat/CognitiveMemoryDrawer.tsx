import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
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
  CheckCircle2,
  Trash2,
  Sliders,
} from 'lucide-react';

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
  } = useAppStore();

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
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

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

  const showStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemContent.trim()) return;
    await addManualMemory(newMemCategory, newMemContent.trim(), newMemSignificance);
    setNewMemContent('');
    showStatus('Erinnerung gespeichert.');
  };

  const handleAddDiary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDiaryTitle.trim() || !newDiaryText.trim()) return;
    await addManualDiary(newDiaryTitle.trim(), newDiaryText.trim(), newDiaryMood);
    setNewDiaryTitle('');
    setNewDiaryText('');
    showStatus('Tagebucheintrag gespeichert.');
  };

  const handleGenerateDiary = async () => {
    const entry = await generateManualDiary();
    if (entry) {
      showStatus('Neuer Tagebucheintrag erfolgreich generiert!');
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
    showStatus('Kern-Glaubenssatz hinzugefügt.');
  };

  const handleRemoveBelief = async (index: number) => {
    if (!psych) return;
    const currentBeliefs = psych.core_identity || [];
    const updated = {
      ...psych,
      core_identity: currentBeliefs.filter((_, i) => i !== index),
    };
    await updatePsychology(updated);
    showStatus('Glaubenssatz entfernt.');
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
      showStatus('Markdown erfolgreich mit SQLite synchronisiert!');
    } catch (e) {
      showStatus(`Fehler beim Speichern: ${e}`);
    }
  };

  const handleReloadMarkdown = async () => {
    const res = await fetchMemoryMarkdown();
    if (mdMode === 'character') {
      setLocalMdContent(res.charMd);
    } else {
      setLocalMdContent(res.userMd);
    }
    showStatus('Markdown aus Datenbank neu geladen.');
  };

  const handleTriggerReflection = async () => {
    const res = await triggerMemoryPipeline();
    if (res) {
      if (res.no_change) {
        showStatus('Reflexion abgeschlossen: Keine signifikanten Änderungen.');
      } else {
        showStatus(`Reflexion erfolgreich: ${res.topics_processed.length} Themen & ${res.healing_entries.length} Widersprüche verarbeitet.`);
      }
    }
  };

  const handleImportSow = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Wähle den Soul of Waifu Memory-Ordner (.soul/.../memory)',
      });
      if (selected && typeof selected === 'string') {
        const count = await importSowFolder(selected);
        showStatus(`${count} Einträge aus Soul of Waifu importiert!`);
      }
    } catch (e) {
      showStatus(`Import fehlgeschlagen: ${e}`);
    }
  };

  const handleCreateBackup = async () => {
    const b = await createMemoryBackup();
    if (b) {
      showStatus(`Snapshot ${b.filename} erstellt.`);
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    if (!confirm(`Möchtest du den Snapshot '${filename}' wirklich wiederherstellen? Aktuelle Daten werden überschrieben.`)) {
      return;
    }
    try {
      const b = memoryBackups.find((m) => m.filename === filename);
      if (!b) return;
      // We pass the filename or character backup path
      await restoreMemoryBackup(filename);
      showStatus(`Snapshot ${filename} wiederhergestellt!`);
    } catch (e) {
      showStatus(`Fehler bei Wiederherstellung: ${e}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity">
      <div className="w-full max-w-3xl bg-slate-900 border-l border-slate-700/70 shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-app/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-accent-500/10 border border-accent-500/20 text-accent-400">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                Soul Memory 2.0
                <span className="text-xs px-2 py-0.5 rounded-full bg-accent-900/50 text-accent-300 font-normal border border-accent-500/30">
                  {charName}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Autonome Kognition, Router-Agent, Markdown-Sync & Lore-Archiv
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleTriggerReflection}
              disabled={isReflecting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-accent-600 to-indigo-600 hover:from-accent-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-accent-900/30 transition disabled:opacity-50"
              title="Autonome Seelen-Reflexion durchführen"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isReflecting ? 'animate-spin' : ''}`} />
              {isReflecting ? 'Reflektiert...' : 'Reflexion starten'}
            </button>
            <button
              onClick={() => fetchCognitiveOverview()}
              disabled={isMemoryLoading}
              title="Aktualisieren"
              className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition"
            >
              <RefreshCw className={`w-4 h-4 ${isMemoryLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Global Status / Notification Banner */}
        {statusMessage && (
          <div className="px-4 py-2 bg-accent-950/80 border-b border-accent-800/60 text-xs text-accent-200 flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-accent-400 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Automation Settings Bar */}
        <div className="px-4 py-2 bg-app/50 border-b border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Sliders className="w-3.5 h-3.5 text-slate-500" />
            <span>Automatische Reflexion:</span>
            <button
              onClick={() => setAutoReflectionEnabled(!autoReflectionEnabled)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                autoReflectionEnabled
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {autoReflectionEnabled ? 'Aktiviert' : 'Deaktiviert'}
            </button>
            {autoReflectionEnabled && (
              <span className="flex items-center gap-1 text-[11px] text-slate-400">
                alle
                <select
                  value={autoReflectionThreshold}
                  onChange={(e) => setAutoReflectionThreshold(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-slate-200 text-xs focus:outline-none"
                >
                  <option value={3}>3</option>
                  <option value={5}>5</option>
                  <option value={8}>8</option>
                  <option value={10}>10</option>
                </select>
                Nachrichten
              </span>
            )}
          </div>

          {lastReflectionResult && (
            <div className="text-[11px] text-slate-400 italic truncate max-w-xs">
              {lastReflectionResult.no_change
                ? 'Zuletzt: Keine Änderungen'
                : `Zuletzt: ${lastReflectionResult.psychology.primary_emotion}`}
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 px-4 bg-app/30 text-xs font-medium overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('psychology')}
            className={`py-3 px-3 border-b-2 transition flex items-center gap-1.5 shrink-0 ${
              activeTab === 'psychology'
                ? 'border-accent-500 text-accent-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Brain className="w-3.5 h-3.5" />
            Geist & Psyche
          </button>
          <button
            onClick={() => setActiveTab('relationship')}
            className={`py-3 px-3 border-b-2 transition flex items-center gap-1.5 shrink-0 ${
              activeTab === 'relationship'
                ? 'border-accent-500 text-accent-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Heart className="w-3.5 h-3.5" />
            Beziehung
          </button>
          <button
            onClick={() => setActiveTab('markdown')}
            className={`py-3 px-3 border-b-2 transition flex items-center gap-1.5 shrink-0 ${
              activeTab === 'markdown'
                ? 'border-accent-500 text-accent-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            Markdown Editor
          </button>
          <button
            onClick={() => setActiveTab('memories')}
            className={`py-3 px-3 border-b-2 transition flex items-center gap-1.5 shrink-0 ${
              activeTab === 'memories'
                ? 'border-accent-500 text-accent-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            Episoden & Topics ({cognitiveOverview?.recent_memories.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('diary')}
            className={`py-3 px-3 border-b-2 transition flex items-center gap-1.5 shrink-0 ${
              activeTab === 'diary'
                ? 'border-accent-500 text-accent-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookHeart className="w-3.5 h-3.5" />
            Tagebuch ({cognitiveOverview?.recent_diary.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('healing')}
            className={`py-3 px-3 border-b-2 transition flex items-center gap-1.5 shrink-0 ${
              activeTab === 'healing'
                ? 'border-accent-500 text-accent-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Heilungs-Log ({cognitiveOverview?.healing_logs.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('backups')}
            className={`py-3 px-3 border-b-2 transition flex items-center gap-1.5 shrink-0 ${
              activeTab === 'backups'
                ? 'border-accent-500 text-accent-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Snapshots & SoW ({memoryBackups.length})
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
                    Unumstößliche Glaubenssätze & Kernidentität
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {psych.core_identity?.length || 0} Leitsätze
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
                        title="Glaubenssatz entfernen"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {(!psych.core_identity || psych.core_identity.length === 0) && (
                    <div className="text-xs text-slate-500 italic p-2">
                      Noch keine unumstößlichen Glaubenssätze registriert.
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={newBeliefInput}
                    onChange={(e) => setNewBeliefInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddBelief()}
                    placeholder="Neuen Leitsatz eintragen (z.B. 'Ich lüge niemals meine Freunde an')..."
                    className="flex-1 px-3 py-1.5 bg-slate-900/90 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-accent-500"
                  />
                  <button
                    onClick={handleAddBelief}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Hinzufügen
                  </button>
                </div>
              </div>

              {/* Primary Emotion & Intensity */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Primäre Emotion & Intensität
                  </span>
                  <button
                    onClick={() => triggerEmotionalDecay()}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-accent-600/20 text-accent-300 border border-accent-500/30 hover:bg-accent-600/30 transition"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Emotional Decay auslösen
                  </button>
                </div>

                <div className="flex items-center justify-between bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <Flame className="w-5 h-5 text-amber-400" />
                    <div>
                      <div className="text-sm font-bold text-slate-100">{psych.primary_emotion}</div>
                      <div className="text-[11px] text-slate-400">
                        Decay-Zähler: {psych.emotional_decay_counter}/2 Runden
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <button
                        key={level}
                        onClick={() => updatePsychology({ ...psych, intensity: level })}
                        title={`Intensitätsstufe ${level}`}
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
                  Innere Anspannung & Konflikte
                </label>
                <input
                  type="text"
                  value={psych.psychological_tension}
                  onChange={(e) =>
                    updatePsychology({ ...psych, psychological_tension: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-accent-500"
                  placeholder="Keine inneren Konflikte bekannt."
                />
              </div>

              {/* Cognitive Dissonance */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  Kognitive Dissonanz (Aktive Widersprüche)
                </label>
                <textarea
                  rows={2}
                  value={psych.cognitive_dissonance || 'Keine.'}
                  onChange={(e) =>
                    updatePsychology({ ...psych, cognitive_dissonance: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-accent-500"
                  placeholder="Beschreibe ungelöste emotionale oder sachliche Widersprüche..."
                />
              </div>

              {/* Active Agenda */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  Aktive unbewusste Agenda
                </label>
                <input
                  type="text"
                  value={psych.active_agenda}
                  onChange={(e) =>
                    updatePsychology({ ...psych, active_agenda: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-accent-500"
                  placeholder="Was möchte die Figur derzeit unbewusst erreichen?"
                />
              </div>

              {/* Immediate Focus */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  Gedanklicher Hauptfokus
                </label>
                <input
                  type="text"
                  value={psych.immediate_focus}
                  onChange={(e) =>
                    updatePsychology({ ...psych, immediate_focus: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-accent-500"
                  placeholder="Worauf ist ihr Geist derzeit zentriert?"
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
                  Rolle & Attribute von {rel.user_name}
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Rolle in der Story</label>
                    <input
                      type="text"
                      value={rel.role_in_story || 'User'}
                      onChange={(e) =>
                        updateRelationship({ ...rel, role_in_story: e.target.value })
                      }
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-accent-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Bekannte Attribute</label>
                    <input
                      type="text"
                      value={rel.known_attributes || 'Keine.'}
                      onChange={(e) =>
                        updateRelationship({ ...rel, known_attributes: e.target.value })
                      }
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-accent-500"
                    />
                  </div>
                </div>
              </div>

              {/* Trust Level & Dynamic Description */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  Vertrauensstufe & Dynamik
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
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
                        rel.trust_level === lvl
                          ? 'bg-accent-600/30 text-accent-200 border-accent-500'
                          : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Beziehungsdynamik</label>
                  <input
                    type="text"
                    value={rel.dynamic_description || 'Keine.'}
                    onChange={(e) =>
                      updateRelationship({ ...rel, dynamic_description: e.target.value })
                    }
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-accent-500"
                    placeholder="Wie nimmt sie die Beziehung wahr?..."
                  />
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Ungesagte Spannungen</label>
                  <input
                    type="text"
                    value={rel.unspoken_tension}
                    onChange={(e) =>
                      updateRelationship({ ...rel, unspoken_tension: e.target.value })
                    }
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-accent-500"
                    placeholder="Was behält sie für sich?..."
                  />
                </div>
              </div>

              {/* Preferences & Habits */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  Vorlieben & Gewohnheiten ({rel.preferences_habits.length})
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
                    placeholder="Neue Vorliebe hinzufügen..."
                    className="flex-1 px-3 py-1.5 bg-slate-900/80 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-accent-500"
                  />
                  <button
                    onClick={handleAddPref}
                    className="px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-xs font-medium flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Hinzufügen
                  </button>
                </div>
              </div>

              {/* Shared Milestones */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  Gemeinsame Meilensteine & Versprechen ({rel.shared_milestones.length})
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
                    placeholder="Gemeinsamen Meilenstein festhalten..."
                    className="flex-1 px-3 py-1.5 bg-slate-900/80 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-accent-500"
                  />
                  <button
                    onClick={handleAddMilestone}
                    className="px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-xs font-medium flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Hinzufügen
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
                    USER.md ({rel?.user_name || 'User'})
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleReloadMarkdown}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
                    title="Aktualisieren aus SQLite"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Neu laden
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
                    {mdSaveSuccess ? 'Gespeichert!' : 'In SQLite synchronisieren'}
                  </button>
                </div>
              </div>

              <div className="text-[11px] text-slate-400">
                Änderungen am Markdown-Format werden beim Klick auf "In SQLite synchronisieren" geparst und aktualisieren die Tabellen.
              </div>

              <textarea
                value={localMdContent}
                onChange={(e) => setLocalMdContent(e.target.value)}
                rows={18}
                className="w-full flex-1 p-3 bg-app font-mono text-xs text-slate-200 border border-slate-800 rounded-xl focus:outline-none focus:border-accent-500 leading-relaxed resize-y"
                placeholder="# Lade Markdown..."
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
                  Neues Wissen / Notiz manuell einspeisen
                </div>
                <div className="flex gap-2">
                  <select
                    value={newMemCategory}
                    onChange={(e) => setNewMemCategory(e.target.value as any)}
                    className="bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded px-2 py-1.5 focus:outline-none"
                  >
                    <option value="fact">Fakt (fact)</option>
                    <option value="topic">Thema (topic)</option>
                    <option value="secret">Geheimnis (secret)</option>
                    <option value="promise">Versprechen (promise)</option>
                    <option value="event">Ereignis (event)</option>
                    <option value="location">Ort (location)</option>
                  </select>

                  <select
                    value={newMemSignificance}
                    onChange={(e) => setNewMemSignificance(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded px-2 py-1.5 focus:outline-none"
                  >
                    <option value={5}>★ 5 (Höchste Prio)</option>
                    <option value={4}>★ 4 (Sehr wichtig)</option>
                    <option value={3}>★ 3 (Normal)</option>
                    <option value={2}>★ 2 (Gering)</option>
                    <option value={1}>★ 1 (Flüchtig)</option>
                  </select>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMemContent}
                    onChange={(e) => setNewMemContent(e.target.value)}
                    placeholder="Z. B.: Hiroki hat versprochen, im Sommer ans Meer zu fahren."
                    className="flex-1 px-3 py-1.5 bg-slate-900/90 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-accent-500"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-xs font-semibold"
                  >
                    Speichern
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
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-accent-900/60 text-accent-300 border border-accent-500/30">
                          {mem.category}
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
                    Noch keine episodischen Erinnerungen in SQLite gespeichert.
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
                  Autonome Ich-Perspektiven Reflexion über den Chat
                </div>
                <button
                  onClick={handleGenerateDiary}
                  className="px-3 py-1 rounded-lg bg-accent2-600 hover:bg-accent2-500 text-white text-xs font-semibold transition"
                >
                  Neuen Tagebucheintrag generieren
                </button>
              </div>

              <form
                onSubmit={handleAddDiary}
                className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/70 space-y-2.5"
              >
                <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <BookHeart className="w-3.5 h-3.5 text-accent2-400" />
                  Eintrag manuell verfassen
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newDiaryTitle}
                    onChange={(e) => setNewDiaryTitle(e.target.value)}
                    placeholder="Titel des Eintrags..."
                    className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-accent-500"
                  />
                  <select
                    value={newDiaryMood}
                    onChange={(e) => setNewDiaryMood(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded px-2 py-1.5 focus:outline-none"
                  >
                    <option value="Reflective">Reflective</option>
                    <option value="Happy">Happy</option>
                    <option value="Melancholy">Melancholy</option>
                    <option value="Flustered">Flustered</option>
                    <option value="Excited">Excited</option>
                  </select>
                </div>
                <textarea
                  rows={2}
                  value={newDiaryText}
                  onChange={(e) => setNewDiaryText(e.target.value)}
                  placeholder="Was geht {charName} durch den Kopf?..."
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-accent-500"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-accent2-600 hover:bg-accent2-500 text-white text-xs font-semibold"
                >
                  Tagebucheintrag speichern
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
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent2-900/40 text-accent2-300 border border-accent2-500/30">
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
                    Das Tagebuch ist noch leer.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: HEALING LOG */}
          {activeTab === 'healing' && (
            <div className="space-y-3">
              <div className="text-xs text-slate-400">
                Audit-Protokoll automatischer emotionaler Abkühlung (Decay) und vom Router Agent aufgelöster Widersprüche:
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
                      <div className="text-slate-400 text-[11px] leading-relaxed">{log.details}</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 shrink-0">
                    {new Date(log.created_at * 1000).toLocaleTimeString()}
                  </span>
                </div>
              ))}

              {(!cognitiveOverview?.healing_logs ||
                cognitiveOverview.healing_logs.length === 0) && (
                <div className="p-8 text-center text-xs text-slate-500 italic">
                  Noch keine Heilungs- oder Widerspruchs-Ereignisse protokolliert.
                </div>
              )}
            </div>
          )}

          {/* TAB 7: BACKUPS & SOW IMPORT */}
          {activeTab === 'backups' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/60">
                <div>
                  <h3 className="text-xs font-bold text-slate-200">Soul of Waifu Gedächtnis-Import</h3>
                  <p className="text-[11px] text-slate-400">
                    Liest vorhandene MEMORY.md, USER.md und topics/*.md aus einem SoW-Ordner ein.
                  </p>
                </div>
                <button
                  onClick={handleImportSow}
                  className="px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <FolderDown className="w-3.5 h-3.5" />
                  SoW-Ordner wählen...
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Gespeicherte Snapshots ({memoryBackups.length})
                </span>
                <button
                  onClick={handleCreateBackup}
                  className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Snapshot jetzt anlegen
                </button>
              </div>

              <div className="space-y-2">
                {memoryBackups.map((b) => (
                  <div
                    key={b.filename}
                    className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-200 font-mono text-[11px]">
                        {b.filename}
                      </div>
                      <div className="text-slate-400 text-[10px]">
                        {b.date_formatted} • {Math.round(b.size_bytes / 1024)} KB
                      </div>
                    </div>
                    <button
                      onClick={() => handleRestoreBackup(b.filename)}
                      className="px-2.5 py-1 rounded bg-slate-700 hover:bg-accent-600 text-slate-200 text-xs font-medium transition flex items-center gap-1"
                      title="Diesen Snapshot wiederherstellen"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Wiederherstellen
                    </button>
                  </div>
                ))}

                {memoryBackups.length === 0 && !isLoadingBackups && (
                  <div className="p-8 text-center text-xs text-slate-500 italic">
                    Noch keine Snapshots gespeichert. Vor jeder autonomen Reflexion wird automatisch ein Backup angelegt.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
