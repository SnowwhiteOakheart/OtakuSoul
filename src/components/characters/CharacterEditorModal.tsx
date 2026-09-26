import { useState } from 'react';
import { CharacterProfile, CharacterCardV2 } from '../../types';
import { api } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import { open } from '@tauri-apps/plugin-dialog';
import { X, Save, Image, Plus, Trash2, Sparkles, User, FileText, Settings2, BookOpen } from 'lucide-react';

interface CharacterEditorModalProps {
  character: CharacterProfile | null; // null means create new
  onClose: () => void;
  onSaved: (savedProfile: CharacterProfile) => void;
}

export const CharacterEditorModal = ({
  character,
  onClose,
  onSaved,
}: CharacterEditorModalProps) => {
  const { refreshCharacters, allLorebooks, scannedVrms } = useAppStore();

  const [activeTab, setActiveTab] = useState<'basics' | 'prompts' | 'greetings' | 'lorebooks' | 'raw'>('basics');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form State
  const [boundLorebooks, setBoundLorebooks] = useState<string[]>(character?.bound_lorebooks || []);
  const [vrmPath, setVrmPath] = useState<string>((character?.card.data.extensions?.sow_vrm as string) || '');
  const [name, setName] = useState(character?.card.data.name || '');
  const [title, setTitle] = useState(
    (character?.card.data.extensions?.sow_title as string) || character?.card.data.tags?.[0] || ''
  );
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(character?.avatar_data_url || null);
  const [description, setDescription] = useState(character?.card.data.description || '');
  const [personality, setPersonality] = useState(character?.card.data.personality || '');
  const [scenario, setScenario] = useState(character?.card.data.scenario || '');
  const [firstMes, setFirstMes] = useState(character?.card.data.first_mes || '');
  const [mesExample, setMesExample] = useState(character?.card.data.mes_example || '');
  const [alternateGreetings, setAlternateGreetings] = useState<string[]>(
    character?.card.data.alternate_greetings || []
  );
  const [systemPrompt, setSystemPrompt] = useState(character?.card.data.system_prompt || '');
  const [creatorNotes, setCreatorNotes] = useState(character?.card.data.creator_notes || '');
  const [tagsStr, setTagsStr] = useState(character?.card.data.tags?.join(', ') || '');
  const [newGreeting, setNewGreeting] = useState('');

  const handlePickAvatar = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'Bilder (PNG, JPEG)',
            extensions: ['png', 'jpg', 'jpeg'],
          },
        ],
      });

      if (selected && typeof selected === 'string') {
        const bytes = await api.readFileBinary(selected);
        const binaryString = bytes.reduce((acc, byte) => acc + String.fromCharCode(byte), '');
        const base64 = btoa(binaryString);
        const mime = selected.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
        setAvatarDataUrl(`data:${mime};base64,${base64}`);
      }
    } catch (e) {
      console.error('Failed to pick avatar image:', e);
    }
  };

  const handleAddGreeting = () => {
    if (!newGreeting.trim()) return;
    setAlternateGreetings([...alternateGreetings, newGreeting.trim()]);
    setNewGreeting('');
  };

  const handleRemoveGreeting = (index: number) => {
    setAlternateGreetings(alternateGreetings.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setErrorMsg('Bitte gib dem Charakter einen Namen.');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);

    const tags = tagsStr
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const updatedCard: CharacterCardV2 = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: name.trim(),
        description: description.trim(),
        personality: personality.trim(),
        scenario: scenario.trim(),
        first_mes: firstMes.trim(),
        mes_example: mesExample.trim(),
        alternate_greetings: alternateGreetings,
        system_prompt: systemPrompt.trim() ? systemPrompt.trim() : undefined,
        creator_notes: creatorNotes.trim() ? creatorNotes.trim() : undefined,
        tags,
        extensions: {
          ...(character?.card.data.extensions || {}),
          sow_title: title.trim() || undefined,
          sow_vrm: vrmPath || undefined,
        },
      },
    };

    const profileToSave: CharacterProfile = {
      id: character?.id || name.trim().toLowerCase().replace(/\s+/g, '_'),
      card: updatedCard,
      avatar_data_url: avatarDataUrl || undefined,
      source_path: character?.source_path,
      bound_lorebooks: boundLorebooks,
    };

    try {
      const saved = await api.saveCharacterCard(profileToSave);
      await refreshCharacters();
      onSaved(saved);
      onClose();
    } catch (e) {
      console.error('Failed to save character card:', e);
      setErrorMsg(`Fehler beim Speichern: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                {character ? `Charakter bearbeiten: ${character.card.data.name}` : 'Neuen Charakter erstellen'}
              </h2>
              <p className="text-xs text-slate-400">SillyTavern V2 Standard-Konformität</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-slate-800 bg-slate-900/50">
          <button
            onClick={() => setActiveTab('basics')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs font-semibold transition-all ${
              activeTab === 'basics'
                ? 'border-purple-500 text-purple-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Stammdaten & Avatar</span>
          </button>
          <button
            onClick={() => setActiveTab('prompts')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs font-semibold transition-all ${
              activeTab === 'prompts'
                ? 'border-purple-500 text-purple-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Persönlichkeit & Prompts</span>
          </button>
          <button
            onClick={() => setActiveTab('greetings')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs font-semibold transition-all ${
              activeTab === 'greetings'
                ? 'border-purple-500 text-purple-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Begrüßungen ({alternateGreetings.length + 1})</span>
          </button>
          <button
            onClick={() => setActiveTab('lorebooks')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs font-semibold transition-all ${
              activeTab === 'lorebooks'
                ? 'border-purple-500 text-purple-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Lorebooks ({boundLorebooks.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('raw')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs font-semibold transition-all ${
              activeTab === 'raw'
                ? 'border-purple-500 text-purple-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>JSON-Vorschau</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-sm">
          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs">
              {errorMsg}
            </div>
          )}

          {/* TAB 1: Basics & Avatar */}
          {activeTab === 'basics' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Avatar Column */}
              <div className="flex flex-col items-center gap-3">
                <div className="w-44 h-44 rounded-2xl bg-slate-950 border-2 border-dashed border-slate-700/80 flex items-center justify-center overflow-hidden relative group">
                  {avatarDataUrl ? (
                    <img
                      src={avatarDataUrl}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center p-4">
                      <Image className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                      <span className="text-xs text-slate-400">Kein Avatar</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handlePickAvatar}
                    className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs font-medium text-white transition-opacity"
                  >
                    Bild ändern
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handlePickAvatar}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  <Image className="w-3.5 h-3.5" />
                  <span>Avatar auswählen...</span>
                </button>
                {avatarDataUrl && (
                  <button
                    type="button"
                    onClick={() => setAvatarDataUrl(null)}
                    className="text-[11px] text-rose-400 hover:underline"
                  >
                    Avatar entfernen
                  </button>
                )}
                
                <div className="w-full mt-2 space-y-1.5 px-2">
                  <label className="text-[11px] font-semibold text-slate-400">VRM-Modell (3D)</label>
                  <select
                    value={vrmPath}
                    onChange={(e) => setVrmPath(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-purple-500 transition-colors"
                  >
                    <option value="">-- Standard (aus Einstellungen) --</option>
                    {scannedVrms.map((vrm) => (
                      <option key={vrm.path} value={vrm.path}>
                        {vrm.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Basic Fields */}
              <div className="md:col-span-2 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Charakter-Name *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="z. B. Makise Kurisu"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Titel / Untertitel
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="z. B. Geniale Neurowissenschaftlerin"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Tags (kommagetrennt)
                  </label>
                  <input
                    type="text"
                    value={tagsStr}
                    onChange={(e) => setTagsStr(e.target.value)}
                    placeholder="Anime, Tsundere, Sci-Fi, Steins;Gate"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Creator Notes / Anmerkungen
                  </label>
                  <input
                    type="text"
                    value={creatorNotes}
                    onChange={(e) => setCreatorNotes(e.target.value)}
                    placeholder="Optionale Notizen des Autors"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Prompts & Personality */}
          {activeTab === 'prompts' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Beschreibung (Description / Hintergrund)
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Aussehen, Herkunft, Kleidung, Hintergrundgeschichte..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-y"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Persönlichkeit (Personality)
                </label>
                <textarea
                  rows={3}
                  value={personality}
                  onChange={(e) => setPersonality(e.target.value)}
                  placeholder="Charakterzüge, Manierismen, Stärken, Schwächen..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-y"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Szenario (Scenario)
                </label>
                <textarea
                  rows={2}
                  value={scenario}
                  onChange={(e) => setScenario(e.target.value)}
                  placeholder="Der aktuelle Ort und die Ausgangssituation des Rollenspiels..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-y"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Beispieldialoge (Example Messages)
                </label>
                <textarea
                  rows={4}
                  value={mesExample}
                  onChange={(e) => setMesExample(e.target.value)}
                  placeholder="<START>&#10;{{user}}: Hallo Kurisu!&#10;{{char}}: *sieht von ihren Papieren auf* Was gibt es denn schon wieder?"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 font-mono text-xs placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-y"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Benutzerdefinierter System-Prompt (Optional)
                </label>
                <textarea
                  rows={2}
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Überschreibt oder ergänzt die Standard-Verhaltensregeln für diese Figur..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 font-mono text-xs placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-y"
                />
              </div>
            </div>
          )}

          {/* TAB 3: Greetings */}
          {activeTab === 'greetings' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Haupt-Begrüßung (First Message) *
                </label>
                <textarea
                  rows={4}
                  value={firstMes}
                  onChange={(e) => setFirstMes(e.target.value)}
                  placeholder="*betritt den Raum und blickt dich neugierig an* Guten Tag..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-y"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Alternative Begrüßungen ({alternateGreetings.length})
                </label>
                <div className="space-y-2 mb-3">
                  {alternateGreetings.map((greeting, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-start justify-between gap-3 text-xs"
                    >
                      <span className="text-slate-300 flex-1 whitespace-pre-wrap">{greeting}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveGreeting(idx)}
                        className="text-slate-500 hover:text-rose-400 p-1 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <textarea
                    rows={2}
                    value={newGreeting}
                    onChange={(e) => setNewGreeting(e.target.value)}
                    placeholder="Neue alternative Begrüßung eingeben..."
                    className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-y"
                  />
                  <button
                    type="button"
                    onClick={handleAddGreeting}
                    className="px-4 bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 border border-purple-500/40 rounded-xl flex items-center gap-1.5 text-xs font-semibold transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Hinzufügen</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Lorebooks Binding */}
          {activeTab === 'lorebooks' && (
            <div className="space-y-4">
              <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl text-xs text-purple-200 flex items-center justify-between">
                <div>
                  <span className="font-bold">Multi-Lorebook Binding:</span> Wähle aus, welche Lorebooks aktiv mit diesem Charakter verknüpft sein sollen.
                </div>
                <span className="font-mono text-purple-300 font-bold">{boundLorebooks.length} gebunden</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {allLorebooks.map((lb) => {
                  const idOrPath = lb.id || lb.file_path || lb.name;
                  const isBound =
                    boundLorebooks.includes(idOrPath) ||
                    (lb.file_path ? boundLorebooks.includes(lb.file_path) : false) ||
                    (lb.id ? boundLorebooks.includes(lb.id) : false);

                  return (
                    <div
                      key={idOrPath}
                      onClick={() => {
                        if (isBound) {
                          setBoundLorebooks(
                            boundLorebooks.filter(
                              (x) => x !== lb.id && x !== lb.file_path && x !== idOrPath
                            )
                          );
                        } else {
                          setBoundLorebooks([...boundLorebooks, lb.id || idOrPath]);
                        }
                      }}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                        isBound
                          ? 'bg-purple-600/15 border-purple-500/60 shadow-sm'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isBound}
                            readOnly
                            className="rounded bg-slate-900 border-slate-700 text-purple-600 focus:ring-0 pointer-events-none"
                          />
                          <span className="text-xs font-bold text-slate-100">{lb.name}</span>
                        </div>
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 font-mono border border-slate-700">
                          {lb.entries.length} Einträge
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-2">
                        {lb.description || 'Keine Beschreibung.'}
                      </p>
                    </div>
                  );
                })}

                {allLorebooks.length === 0 && (
                  <div className="col-span-2 p-8 text-center text-xs text-slate-500">
                    Noch keine Lorebooks vorhanden. Erstelle oder importiere welche im Lorebook-Tab.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: Raw JSON Preview */}
          {activeTab === 'raw' && (
            <div>
              <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-purple-300 max-h-96 overflow-y-auto">
                {JSON.stringify(
                  {
                    spec: 'chara_card_v2',
                    spec_version: '2.0',
                    data: {
                      name,
                      description,
                      personality,
                      scenario,
                      first_mes: firstMes,
                      mes_example: mesExample,
                      alternate_greetings: alternateGreetings,
                      system_prompt: systemPrompt || undefined,
                      creator_notes: creatorNotes || undefined,
                      tags: tagsStr.split(',').map((t) => t.trim()),
                    },
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors text-xs font-medium"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-purple-900/30 transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Wird gespeichert...' : 'Charakter speichern'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
