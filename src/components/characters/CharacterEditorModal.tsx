import { useState } from 'react';
import { CharacterProfile, CharacterCardV2 } from '../../types';
import { api } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import { open } from '@tauri-apps/plugin-dialog';
import { X, Save, Image, Plus, Trash2, Sparkles, User, FileText, Settings2, BookOpen } from 'lucide-react';
import {
  getPortraitExpressions,
  PORTRAIT_MOODS,
  PortraitMood,
  resolveCharacterImagePath,
  resolveCharacterImageSource,
} from '../../utils/characterPortraits';

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
  const { refreshCharacters, allLorebooks, scannedVrms, scannedLive2ds } = useAppStore();

  const [activeTab, setActiveTab] = useState<'basics' | 'expressions' | 'prompts' | 'greetings' | 'lorebooks' | 'raw'>('basics');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form State
  const [boundLorebooks, setBoundLorebooks] = useState<string[]>(character?.bound_lorebooks || []);
  const [vrmPath, setVrmPath] = useState<string>((character?.card.data.extensions?.sow_vrm as string) || '');
  const [live2dModel, setLive2dModel] = useState<string>(
    (character?.card.data.extensions?.sow_live2d as string) || ''
  );
  const [name, setName] = useState(character?.card.data.name || '');
  const [title, setTitle] = useState(
    (character?.card.data.extensions?.sow_title as string) || character?.card.data.tags?.[0] || ''
  );
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(character?.avatar_data_url || null);
  const [expressionImages, setExpressionImages] = useState<Record<string, string>>(
    () => ({ ...getPortraitExpressions(character) })
  );
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

  const fileToDataUrl = async (filePath: string): Promise<string> => {
    const bytes = await api.readFileBinary(filePath);
    let binaryString = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binaryString += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }

    const lowerPath = filePath.toLowerCase();
    const mime = lowerPath.endsWith('.png')
      ? 'image/png'
      : lowerPath.endsWith('.webp')
      ? 'image/webp'
      : lowerPath.endsWith('.gif')
      ? 'image/gif'
      : 'image/jpeg';
    return `data:${mime};base64,${btoa(binaryString)}`;
  };

  const pickImageAsDataUrl = async (): Promise<string | null> => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'Bilder (PNG, JPEG, WebP, GIF)',
            extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'],
          },
        ],
      });

      if (selected && typeof selected === 'string') {
        return await fileToDataUrl(selected);
      }
    } catch (e) {
      console.error('Failed to pick character image:', e);
    }

    return null;
  };

  const handlePickAvatar = async () => {
    const image = await pickImageAsDataUrl();
    if (image) setAvatarDataUrl(image);
  };

  const handlePickExpression = async (mood: PortraitMood) => {
    const image = await pickImageAsDataUrl();
    if (image) {
      setExpressionImages((current) => ({ ...current, [mood]: image }));
    }
  };

  const handleRemoveExpression = (mood: PortraitMood) => {
    setExpressionImages((current) => {
      const next = { ...current };
      delete next[mood];
      return next;
    });
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

    const cleanedExpressionImages = Object.fromEntries(
      Object.entries(expressionImages).filter(([, value]) => Boolean(value))
    );

    // Relative preset paths would break after saving the card into the user directory.
    // Embed those images so an edited/exported character remains self-contained.
    try {
      for (const [mood, imageSource] of Object.entries(cleanedExpressionImages)) {
        const filePath = resolveCharacterImagePath(imageSource, character?.source_path);
        if (filePath) cleanedExpressionImages[mood] = await fileToDataUrl(filePath);
      }
    } catch (e) {
      setErrorMsg(`Emotionsbild konnte nicht eingebettet werden: ${e instanceof Error ? e.message : String(e)}`);
      setIsSaving(false);
      return;
    }

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
          sow_live2d: live2dModel || undefined,
          expressions: Object.keys(cleanedExpressionImages).length > 0
            ? cleanedExpressionImages
            : undefined,
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
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-app/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent-600/20 border border-accent-500/30 flex items-center justify-center text-accent-400">
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
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-slate-800 bg-slate-900/50 overflow-x-auto">
          <button
            onClick={() => setActiveTab('basics')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs font-semibold transition-all ${
              activeTab === 'basics'
                ? 'border-accent-500 text-accent-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Stammdaten & Avatar</span>
          </button>
          <button
            onClick={() => setActiveTab('expressions')}
            className={`flex shrink-0 items-center gap-2 px-4 py-2 border-b-2 text-xs font-semibold transition-all ${
              activeTab === 'expressions'
                ? 'border-accent-500 text-accent-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Image className="w-3.5 h-3.5" />
            <span>Emotionen ({Object.keys(expressionImages).length})</span>
          </button>
          <button
            onClick={() => setActiveTab('prompts')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs font-semibold transition-all ${
              activeTab === 'prompts'
                ? 'border-accent-500 text-accent-300'
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
                ? 'border-accent-500 text-accent-300'
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
                ? 'border-accent-500 text-accent-300'
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
                ? 'border-accent-500 text-accent-300'
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
                <div className="w-44 h-44 rounded-2xl bg-app border-2 border-dashed border-slate-700/80 flex items-center justify-center overflow-hidden relative group">
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
                    className="w-full bg-app border border-slate-700/80 rounded-lg px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-accent-500 transition-colors"
                  >
                    <option value="">-- Standard (aus Einstellungen) --</option>
                    {scannedVrms.map((vrm) => (
                      <option key={vrm.path} value={vrm.path}>
                        {vrm.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="w-full mt-2 space-y-1.5 px-2">
                  <label className="text-[11px] font-semibold text-slate-400">Live2D-Modell (2D)</label>
                  <select
                    value={live2dModel}
                    onChange={(e) => setLive2dModel(e.target.value)}
                    className="w-full bg-app border border-slate-700/80 rounded-lg px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-accent-500 transition-colors"
                  >
                    <option value="">-- Kein Live2D-Modell --</option>
                    {scannedLive2ds.map((l2d) => (
                      <option key={l2d.id} value={l2d.id}>
                        {l2d.name} ({l2d.id})
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
                    className="w-full px-3 py-2 bg-app border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-accent-500"
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
                    className="w-full px-3 py-2 bg-app border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-accent-500"
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
                    className="w-full px-3 py-2 bg-app border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-accent-500"
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
                    className="w-full px-3 py-2 bg-app border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-accent-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Optional 2D expression portraits */}
          {activeTab === 'expressions' && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl border border-accent-500/30 bg-accent-500/10 text-xs text-accent-100">
                Hinterlege nur die Stimmungen, für die du eigene Bilder verwenden möchtest. Fehlt ein Bild,
                nutzt OtakuSoul automatisch „Neutral“ oder den normalen Avatar. Mit nur einem Avatar ändert
                sich die Darstellung nicht.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {PORTRAIT_MOODS.map((mood) => {
                  const storedImage = expressionImages[mood.key];
                  const previewImage = resolveCharacterImageSource(storedImage, character?.source_path);
                  const fallbackImage = mood.key === 'neutral' ? avatarDataUrl : null;

                  return (
                    <div
                      key={mood.key}
                      className="rounded-2xl border border-slate-800 bg-app/60 overflow-hidden"
                    >
                      <div className="relative aspect-[4/5] bg-slate-900 flex items-center justify-center overflow-hidden group">
                        {previewImage || fallbackImage ? (
                          <img
                            src={previewImage || fallbackImage || undefined}
                            alt={`${name || 'Charakter'} – ${mood.label}`}
                            className={`w-full h-full object-cover ${!previewImage ? 'opacity-60' : ''}`}
                          />
                        ) : (
                          <Image className="w-10 h-10 text-slate-600" />
                        )}
                        <button
                          type="button"
                          onClick={() => handlePickExpression(mood.key)}
                          className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs font-semibold text-white transition-opacity"
                        >
                          {storedImage ? 'Bild ändern' : 'Bild auswählen'}
                        </button>
                        {!previewImage && fallbackImage && (
                          <span className="absolute bottom-2 left-2 px-2 py-1 rounded-md bg-app/80 text-[10px] text-slate-300">
                            Standard-Avatar
                          </span>
                        )}
                      </div>
                      <div className="p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <h3 className="text-xs font-bold text-slate-100">{mood.label}</h3>
                            <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">
                              {mood.description}
                            </p>
                          </div>
                          {storedImage && (
                            <button
                              type="button"
                              onClick={() => handleRemoveExpression(mood.key)}
                              className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                              title={`${mood.label}-Bild entfernen`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: Prompts & Personality */}
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
                  className="w-full px-3 py-2 bg-app border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-accent-500 resize-y"
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
                  className="w-full px-3 py-2 bg-app border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-accent-500 resize-y"
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
                  className="w-full px-3 py-2 bg-app border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-accent-500 resize-y"
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
                  className="w-full px-3 py-2 bg-app border border-slate-800 rounded-xl text-slate-200 font-mono text-xs placeholder-slate-500 focus:outline-none focus:border-accent-500 resize-y"
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
                  className="w-full px-3 py-2 bg-app border border-slate-800 rounded-xl text-slate-200 font-mono text-xs placeholder-slate-500 focus:outline-none focus:border-accent-500 resize-y"
                />
              </div>
            </div>
          )}

          {/* TAB 4: Greetings */}
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
                  className="w-full px-3 py-2 bg-app border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-accent-500 resize-y"
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
                      className="p-3 bg-app border border-slate-800 rounded-xl flex items-start justify-between gap-3 text-xs"
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
                    className="flex-1 px-3 py-2 bg-app border border-slate-800 rounded-xl text-slate-200 text-xs placeholder-slate-500 focus:outline-none focus:border-accent-500 resize-y"
                  />
                  <button
                    type="button"
                    onClick={handleAddGreeting}
                    className="px-4 bg-accent-600/30 hover:bg-accent-600/50 text-accent-300 border border-accent-500/40 rounded-xl flex items-center gap-1.5 text-xs font-semibold transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Hinzufügen</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: Lorebooks Binding */}
          {activeTab === 'lorebooks' && (
            <div className="space-y-4">
              <div className="p-3 bg-accent-500/10 border border-accent-500/30 rounded-xl text-xs text-accent-200 flex items-center justify-between">
                <div>
                  <span className="font-bold">Multi-Lorebook Binding:</span> Wähle aus, welche Lorebooks aktiv mit diesem Charakter verknüpft sein sollen.
                </div>
                <span className="font-mono text-accent-300 font-bold">{boundLorebooks.length} gebunden</span>
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
                          ? 'bg-accent-600/15 border-accent-500/60 shadow-sm'
                          : 'bg-app/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isBound}
                            readOnly
                            className="rounded bg-slate-900 border-slate-700 text-accent-600 focus:ring-0 pointer-events-none"
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

          {/* TAB 6: Raw JSON Preview */}
          {activeTab === 'raw' && (
            <div>
              <pre className="p-4 bg-app border border-slate-800 rounded-xl font-mono text-xs text-accent-300 max-h-96 overflow-y-auto">
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
                      extensions: {
                        ...(character?.card.data.extensions || {}),
                        sow_title: title || undefined,
                        sow_vrm: vrmPath || undefined,
                        sow_live2d: live2dModel || undefined,
                        expressions: Object.keys(expressionImages).length > 0
                          ? expressionImages
                          : undefined,
                      },
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
        <div className="px-6 py-4 border-t border-slate-800 bg-app/80 flex items-center justify-between">
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
            className="px-5 py-2 rounded-xl bg-accent-600 hover:bg-accent-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-accent-900/30 transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Wird gespeichert...' : 'Charakter speichern'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
