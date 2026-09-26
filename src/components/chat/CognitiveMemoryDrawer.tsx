import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import {
  Brain,
  X,
  Heart,
  Flame,
  Shield,
  Tag,
  Plus,
  RefreshCw,
  BookHeart,
  Clock,
  Sparkles,
  Bookmark,
  CheckCircle2,
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
    activePersona,
    cognitiveOverview,
    isMemoryLoading,
    fetchCognitiveOverview,
    updatePsychology,
    updateRelationship,
    addManualMemory,
    addManualDiary,
    triggerEmotionalDecay,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<'psychology' | 'relationship' | 'memories' | 'diary' | 'healing'>('psychology');

  // Form states for manual additions
  const [newMemCategory, setNewMemCategory] = useState<'fact' | 'secret' | 'promise' | 'event' | 'location'>('fact');
  const [newMemContent, setNewMemContent] = useState('');
  const [newMemSignificance, setNewMemSignificance] = useState(3);

  const [newDiaryTitle, setNewDiaryTitle] = useState('');
  const [newDiaryText, setNewDiaryText] = useState('');
  const [newDiaryMood, setNewDiaryMood] = useState('Reflective');

  const [newPrefInput, setNewPrefInput] = useState('');
  const [newMilestoneInput, setNewMilestoneInput] = useState('');

  if (!isOpen || !activeCharacter) return null;

  const charName = activeCharacter.card.data.name;
  const psych = cognitiveOverview?.psychology;
  const rel = cognitiveOverview?.relationship;

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemContent.trim()) return;
    await addManualMemory(newMemCategory, newMemContent.trim(), newMemSignificance);
    setNewMemContent('');
  };

  const handleAddDiary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDiaryTitle.trim() || !newDiaryText.trim()) return;
    await addManualDiary(newDiaryTitle.trim(), newDiaryText.trim(), newDiaryMood);
    setNewDiaryTitle('');
    setNewDiaryText('');
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

  const handleTrustChange = async (newTrust: string) => {
    if (!rel) return;
    await updateRelationship({ ...rel, trust_level: newTrust });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity">
      <div className="w-full max-w-2xl bg-slate-900 border-l border-slate-700/70 shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                Kognitiver Seelenspeicher (SQLite)
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-900/50 text-purple-300 font-normal border border-purple-500/30">
                  {charName}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Episodisches Gedächtnis, Psychologie, Beziehungsprofil & Tagebuch
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
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

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 px-4 bg-slate-950/30 text-xs font-medium">
          <button
            onClick={() => setActiveTab('psychology')}
            className={`py-3 px-3 border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'psychology'
                ? 'border-purple-500 text-purple-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Brain className="w-3.5 h-3.5" />
            Geist & Psyche
          </button>
          <button
            onClick={() => setActiveTab('relationship')}
            className={`py-3 px-3 border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'relationship'
                ? 'border-purple-500 text-purple-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Heart className="w-3.5 h-3.5" />
            Beziehung
          </button>
          <button
            onClick={() => setActiveTab('memories')}
            className={`py-3 px-3 border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'memories'
                ? 'border-purple-500 text-purple-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            Episoden ({cognitiveOverview?.recent_memories.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('diary')}
            className={`py-3 px-3 border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'diary'
                ? 'border-purple-500 text-purple-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookHeart className="w-3.5 h-3.5" />
            Tagebuch ({cognitiveOverview?.recent_diary.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('healing')}
            className={`py-3 px-3 border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'healing'
                ? 'border-purple-500 text-purple-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Heilung & Audit
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* TAB 1: PSYCHOLOGY */}
          {activeTab === 'psychology' && psych && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Primäre Emotion & Intensität
                  </span>
                  <button
                    onClick={() => triggerEmotionalDecay()}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-purple-600/20 text-purple-300 border border-purple-500/30 hover:bg-purple-600/30 transition"
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
                            ? 'bg-amber-500 text-slate-950 shadow-sm'
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
                  className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                  placeholder="Keine inneren Konflikte bekannt."
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
                  className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-purple-500"
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
                  className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                  placeholder="Worauf ist ihr Geist derzeit zentriert?"
                />
              </div>
            </div>
          )}

          {/* TAB 2: RELATIONSHIP */}
          {activeTab === 'relationship' && rel && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Beziehungsprofil mit {activePersona.name}
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    'Distrustful',
                    'Wary',
                    'Neutral',
                    'Developing Trust',
                    'Deeply Bound',
                    'Unstable',
                  ].map((tier) => (
                    <button
                      key={tier}
                      onClick={() => handleTrustChange(tier)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                        rel.trust_level === tier
                          ? 'bg-purple-600 text-white border-purple-400 shadow'
                          : 'bg-slate-900/80 text-slate-400 border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      {tier}
                    </button>
                  ))}
                </div>
              </div>

              {/* Unspoken Tension */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  Ungesagte Spannungen zwischen Euch
                </label>
                <input
                  type="text"
                  value={rel.unspoken_tension}
                  onChange={(e) =>
                    updateRelationship({ ...rel, unspoken_tension: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                  placeholder="Gibt es ungelöste Missverständnisse?"
                />
              </div>

              {/* Preferences & Habits */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Bekannte Vorlieben & Gewohnheiten von {activePersona.name}
                </div>
                <div className="flex flex-wrap gap-2">
                  {rel.preferences_habits.map((item, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-full bg-slate-900 border border-purple-500/30 text-purple-300 text-xs flex items-center gap-1.5"
                    >
                      <Tag className="w-3 h-3 text-purple-400" />
                      {item}
                    </span>
                  ))}
                  {rel.preferences_habits.length === 0 && (
                    <span className="text-xs text-slate-500 italic">Noch keine Vorlieben erfasst.</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newPrefInput}
                    onChange={(e) => setNewPrefInput(e.target.value)}
                    placeholder="Neue Vorliebe hinzufügen..."
                    className="flex-1 px-3 py-1.5 bg-slate-900/80 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                  />
                  <button
                    onClick={handleAddPref}
                    className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Hinzufügen
                  </button>
                </div>
              </div>

              {/* Shared Milestones */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Gemeinsame Meilensteine
                </div>
                <div className="space-y-1.5">
                  {rel.shared_milestones.map((milestone, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded bg-slate-900/60 border border-slate-800 text-xs text-slate-300 flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{milestone}</span>
                    </div>
                  ))}
                  {rel.shared_milestones.length === 0 && (
                    <div className="text-xs text-slate-500 italic">Noch keine Meilensteine verzeichnet.</div>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMilestoneInput}
                    onChange={(e) => setNewMilestoneInput(e.target.value)}
                    placeholder="Gemeinsamen Meilenstein festhalten..."
                    className="flex-1 px-3 py-1.5 bg-slate-900/80 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                  />
                  <button
                    onClick={handleAddMilestone}
                    className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Hinzufügen
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: EPISODIC MEMORIES */}
          {activeTab === 'memories' && (
            <div className="space-y-4">
              {/* Form to add memory */}
              <form
                onSubmit={handleAddMemory}
                className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/70 space-y-2.5"
              >
                <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Neues Wissen / Erinnerung manuell einspeisen
                </div>
                <div className="flex gap-2">
                  <select
                    value={newMemCategory}
                    onChange={(e) => setNewMemCategory(e.target.value as any)}
                    className="bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded px-2 py-1.5 focus:outline-none"
                  >
                    <option value="fact">Fakt (fact)</option>
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
                    className="flex-1 px-3 py-1.5 bg-slate-900/90 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold"
                  >
                    Speichern
                  </button>
                </div>
              </form>

              {/* Memory List */}
              <div className="space-y-2">
                {cognitiveOverview?.recent_memories.map((mem) => (
                  <div
                    key={mem.id}
                    className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 flex items-start justify-between gap-3 hover:border-slate-600 transition"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-purple-900/60 text-purple-300 border border-purple-500/30">
                          {mem.category}
                        </span>
                        <span className="text-amber-400 text-xs font-mono">
                          {'★'.repeat(mem.significance)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed">{mem.content}</p>
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

          {/* TAB 4: DIARY */}
          {activeTab === 'diary' && (
            <div className="space-y-4">
              {/* Form to add diary */}
              <form
                onSubmit={handleAddDiary}
                className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/70 space-y-2.5"
              >
                <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <BookHeart className="w-3.5 h-3.5 text-pink-400" />
                  Eintrag in {charName}s persönliches Tagebuch verfassen
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newDiaryTitle}
                    onChange={(e) => setNewDiaryTitle(e.target.value)}
                    placeholder="Titel des Eintrags..."
                    className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-purple-500"
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
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-pink-600 hover:bg-pink-500 text-white text-xs font-semibold"
                >
                  Tagebucheintrag speichern
                </button>
              </form>

              {/* Diary List */}
              <div className="space-y-3">
                {cognitiveOverview?.recent_diary.map((entry) => (
                  <div
                    key={entry.id}
                    className="p-3.5 rounded-xl bg-slate-800/30 border border-slate-700/60 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-200">{entry.title}</h4>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-900/40 text-pink-300 border border-pink-500/30">
                        {entry.mood}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 italic leading-relaxed">
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

          {/* TAB 5: HEALING & AUDIT */}
          {activeTab === 'healing' && (
            <div className="space-y-3">
              <div className="text-xs text-slate-400">
                Audit-Protokoll automatischer emotionaler Abkühlung (Decay) und Selbstheilung:
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
                      <div className="text-slate-400 text-[11px]">{log.details}</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">
                    {new Date(log.created_at * 1000).toLocaleTimeString()}
                  </span>
                </div>
              ))}

              {(!cognitiveOverview?.healing_logs ||
                cognitiveOverview.healing_logs.length === 0) && (
                <div className="p-8 text-center text-xs text-slate-500 italic">
                  Noch keine Heilungs- oder Decay-Ereignisse protokolliert.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
