import { useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { CharacterProfile } from '../../types';
import { api } from '../../services/api';
import { open, save } from '@tauri-apps/plugin-dialog';
import {
  Search,
  Plus,
  Upload,
  MessageSquare,
  Edit,
  Download,
  Trash2,
  Users,
  Sparkles,
  Tag,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';
import { CharacterEditorModal } from './CharacterEditorModal';
import { PersonaManagerModal } from './PersonaManagerModal';

export const CharacterLibraryView = () => {
  const {
    availableCharacters,
    activeCharacter,
    selectCharacter,
    refreshCharacters,
    deleteCharacter,
    restoreHiddenCharacters,
    setActiveTab,
    activePersona,
  } = useAppStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('Alle');
  const [editingCharacter, setEditingCharacter] = useState<CharacterProfile | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isPersonaModalOpen, setIsPersonaModalOpen] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Extract all unique tags
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const char of availableCharacters) {
      if (char.card.data.tags) {
        for (const t of char.card.data.tags) {
          if (t.trim()) set.add(t.trim());
        }
      }
    }
    return ['Alle', ...Array.from(set).slice(0, 12)];
  }, [availableCharacters]);

  // Filtered characters
  const filteredCharacters = useMemo(() => {
    return availableCharacters.filter((char) => {
      const { data } = char.card;
      const matchesSearch =
        data.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        data.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        data.personality.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (data.tags && data.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase())));

      const matchesTag =
        selectedTag === 'Alle' || (data.tags && data.tags.includes(selectedTag));

      return matchesSearch && matchesTag;
    });
  }, [availableCharacters, searchQuery, selectedTag]);

  const handleImportCard = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'SillyTavern V2 Charakterkarten',
            extensions: ['png', 'json'],
          },
        ],
      });

      if (selected && typeof selected === 'string') {
        const loaded = await api.loadCharacterCard(selected);
        // Persist to user characters directory
        const saved = await api.saveCharacterCard(loaded);
        await refreshCharacters();
        await selectCharacter(saved);
        setStatusNotice(`Charakter "${saved.card.data.name}" erfolgreich importiert!`);
        setTimeout(() => setStatusNotice(null), 4000);
      }
    } catch (e) {
      console.error('Failed to import character card:', e);
      setStatusNotice(`Fehler beim Import: ${e instanceof Error ? e.message : String(e)}`);
      setTimeout(() => setStatusNotice(null), 5000);
    }
  };

  const handleExportCard = async (char: CharacterProfile, format: 'png' | 'json') => {
    try {
      const defaultFileName = `${char.card.data.name.replace(/[^a-zA-Z0-9_\-]/g, '_')}.${format}`;
      const targetPath = await save({
        defaultPath: defaultFileName,
        filters: [
          {
            name: format === 'png' ? 'SillyTavern V2 PNG Karte' : 'SillyTavern V2 JSON',
            extensions: [format],
          },
        ],
      });

      if (targetPath) {
        await api.exportCharacterCard(char, targetPath, format === 'png');
        setStatusNotice(`"${char.card.data.name}" exportiert nach ${targetPath}`);
        setTimeout(() => setStatusNotice(null), 4000);
      }
    } catch (e) {
      console.error('Failed to export character card:', e);
      setStatusNotice(`Export fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
      setTimeout(() => setStatusNotice(null), 5000);
    }
  };

  const handleDeleteCard = async (char: CharacterProfile) => {
    if (!window.confirm(`Möchtest du den Charakter "${char.card.data.name}" wirklich in den Papierkorb verschieben?`)) {
      return;
    }

    try {
      await deleteCharacter(char.id);
      setStatusNotice(`"${char.card.data.name}" wurde in den Papierkorb verschoben.`);
      setTimeout(() => setStatusNotice(null), 4000);
    } catch (e) {
      setStatusNotice(`Löschen nicht möglich: ${e instanceof Error ? e.message : String(e)}`);
      setTimeout(() => setStatusNotice(null), 5000);
    }
  };

  const handleSelectAndChat = async (char: CharacterProfile) => {
    await selectCharacter(char);
    setActiveTab('chat');
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden">
      {/* Top Header Bar */}
      <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/60 backdrop-blur flex items-center justify-between gap-4 select-none">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shadow-sm">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-100">Charakterbibliothek</h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono">
                {availableCharacters.length} Karten
              </span>
            </div>
            <p className="text-xs text-slate-400">
              SillyTavern V2 kompatibel · Aktive Persona:{' '}
              <span className="text-purple-300 font-medium">{activePersona.name}</span>
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPersonaModalOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 border border-slate-700 transition-colors shadow-sm"
          >
            <Users className="w-3.5 h-3.5 text-indigo-400" />
            <span>Personas</span>
          </button>

          <button
            onClick={handleImportCard}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 border border-slate-700 transition-colors shadow-sm"
          >
            <Upload className="w-3.5 h-3.5 text-cyan-400" />
            <span>Karte importieren...</span>
          </button>

          <button
            onClick={async () => {
              try {
                await restoreHiddenCharacters();
                setStatusNotice('Alle ausgeblendeten Presets wurden wiederhergestellt.');
                setTimeout(() => setStatusNotice(null), 4000);
              } catch (e) {
                setStatusNotice(`Fehler beim Wiederherstellen: ${e instanceof Error ? e.message : String(e)}`);
                setTimeout(() => setStatusNotice(null), 5000);
              }
            }}
            title="Ausgeblendete Standard-Charaktere wiederherstellen"
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 border border-slate-700 transition-colors shadow-sm"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>Presets wiederherstellen</span>
          </button>

          <button
            onClick={() => {
              setEditingCharacter(null);
              setIsEditorOpen(true);
            }}
            className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-purple-900/30 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Neuer Charakter</span>
          </button>
        </div>
      </div>

      {/* Notice Banner */}
      {statusNotice && (
        <div className="px-6 py-2 bg-purple-950/70 border-b border-purple-500/40 text-purple-200 text-xs flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span>{statusNotice}</span>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="px-6 py-3 border-b border-slate-800/80 bg-slate-900/30 flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Charaktere, Tags oder Eigenschaften suchen..."
            className="w-full pl-9 pr-4 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
          />
        </div>

        {/* Tag Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          <Tag className="w-3.5 h-3.5 text-slate-500 ml-1 mr-0.5 shrink-0" />
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                selectedTag === tag
                  ? 'bg-purple-600/30 text-purple-300 border border-purple-500/50 shadow-sm'
                  : 'bg-slate-900/70 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800/60'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Character Cards Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredCharacters.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center text-slate-500 text-xs">
            <Users className="w-12 h-12 text-slate-700 mb-3" />
            <p className="font-semibold text-slate-400">Keine Charaktere gefunden</p>
            <p className="text-[11px] mt-1">
              Passe deine Suche an oder importiere eine neue Charakterkarte (.png / .json).
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
            {filteredCharacters.map((char) => {
              const { data } = char.card;
              const isActive = activeCharacter?.id === char.id;
              const title =
                (data.extensions?.sow_title as string) || data.tags?.[0] || 'AI Companion';

              return (
                <div
                  key={char.id}
                  className={`group rounded-2xl border flex flex-col overflow-hidden bg-slate-900/70 transition-all duration-200 hover:border-purple-500/60 hover:shadow-xl hover:shadow-purple-950/20 ${
                    isActive
                      ? 'border-purple-500/80 shadow-md shadow-purple-950/40 ring-1 ring-purple-500/50'
                      : 'border-slate-800'
                  }`}
                >
                  {/* Avatar Image Header */}
                  <div className="aspect-[4/5] w-full bg-slate-950 relative overflow-hidden flex items-center justify-center">
                    {char.avatar_data_url ? (
                      <img
                        src={char.avatar_data_url}
                        alt={data.name}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white font-bold text-2xl shadow-inner">
                        {data.name.charAt(0)}
                      </div>
                    )}

                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />

                    {/* Active Pill Badge */}
                    {isActive && (
                      <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full bg-emerald-500/90 text-slate-950 text-[10px] font-bold flex items-center gap-1 shadow-md">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Aktiv</span>
                      </div>
                    )}

                    {/* Overlay Action Buttons on Hover */}
                    <div className="absolute top-2.5 right-2.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => {
                          setEditingCharacter(char);
                          setIsEditorOpen(true);
                        }}
                        className="p-1.5 rounded-lg bg-slate-900/80 hover:bg-purple-600 text-slate-200 hover:text-white backdrop-blur shadow-sm transition-colors"
                        title="Charakter bearbeiten"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleExportCard(char, 'png')}
                        className="p-1.5 rounded-lg bg-slate-900/80 hover:bg-cyan-600 text-slate-200 hover:text-white backdrop-blur shadow-sm transition-colors"
                        title="Als V2 PNG exportieren"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteCard(char)}
                        className="p-1.5 rounded-lg bg-slate-900/80 hover:bg-rose-600 text-slate-200 hover:text-white backdrop-blur shadow-sm transition-colors"
                        title="Löschen"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Bottom Info on Image */}
                    <div className="absolute bottom-2.5 left-3 right-3">
                      <div className="text-sm font-bold text-slate-100 line-clamp-1 group-hover:text-purple-300 transition-colors">
                        {data.name}
                      </div>
                      <div className="text-[11px] text-slate-400 line-clamp-1">{title}</div>
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="p-3.5 flex-1 flex flex-col justify-between gap-3 text-xs">
                    <p className="text-slate-400 text-[11px] line-clamp-2">
                      {data.description || data.personality || 'Keine Beschreibung angegeben.'}
                    </p>

                    {/* Tags */}
                    {data.tags && data.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {data.tags.slice(0, 3).map((t, idx) => (
                          <span
                            key={idx}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/60"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Primary Action Button */}
                    <button
                      onClick={() => handleSelectAndChat(char)}
                      className={`w-full py-1.5 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm ${
                        isActive
                          ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-900/40'
                          : 'bg-slate-800 hover:bg-purple-600/30 text-slate-300 hover:text-purple-200 border border-slate-700/80 hover:border-purple-500/50'
                      }`}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>{isActive ? 'Im Chat öffnen' : 'Auswählen & Chatten'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Editor Modal */}
      {isEditorOpen && (
        <CharacterEditorModal
          character={editingCharacter}
          onClose={() => setIsEditorOpen(false)}
          onSaved={(savedProfile) => {
            selectCharacter(savedProfile);
          }}
        />
      )}

      {/* Persona Manager Modal */}
      {isPersonaModalOpen && (
        <PersonaManagerModal onClose={() => setIsPersonaModalOpen(false)} />
      )}
    </div>
  );
};
