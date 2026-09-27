import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { UserPersona } from '../../types';
import { X, UserPlus, Check, Trash2, User } from 'lucide-react';
import { ModalOverlay } from '../ui/ModalOverlay';

interface PersonaManagerModalProps {
  onClose: () => void;
}

export const PersonaManagerModal = ({ onClose }: PersonaManagerModalProps) => {
  const { personas, activePersona, selectPersona, savePersona, deletePersona } = useAppStore();

  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCreatePersona = async () => {
    if (!name.trim()) {
      setErrorMsg('Bitte gib einen Persona-Namen ein.');
      return;
    }

    const newPersona: UserPersona = {
      id: `persona_${Date.now()}`,
      name: name.trim(),
      description: description.trim() || 'Ein aufmerksamer Gesprächspartner.',
      avatar_data_url: null,
    };

    try {
      await savePersona(newPersona);
      selectPersona(newPersona);
      setName('');
      setDescription('');
      setIsCreating(false);
      setErrorMsg(null);
    } catch (e) {
      console.error('Failed to create persona:', e);
      setErrorMsg('Fehler beim Erstellen der Persona.');
    }
  };

  return (
    <ModalOverlay onClose={onClose} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-app/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">User-Personas verwalten</h2>
              <p className="text-xs text-slate-400">
                Wähle deine Identität für das Rollenspiel (&#123;&#123;user&#125;&#125;-Makro)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300">
              {errorMsg}
            </div>
          )}

          {/* List of existing personas */}
          <div className="space-y-2">
            <label className="font-semibold text-slate-300 block mb-1">
              Verfügbare Personas ({personas.length})
            </label>
            {personas.map((persona) => {
              const isActive = activePersona.id === persona.id;
              return (
                <div
                  key={persona.id}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                    isActive
                      ? 'bg-accent-900/20 border-accent-500/50 shadow-sm'
                      : 'bg-app/70 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-linear-to-tr from-indigo-600 to-accent-600 flex items-center justify-center text-white font-bold text-xs">
                      {persona.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-slate-100 flex items-center gap-2">
                        <span>{persona.name}</span>
                        {isActive && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-accent-500/30 text-accent-300 border border-accent-500/40">
                            Aktiv
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 line-clamp-1">
                        {persona.description}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {!isActive && (
                      <button
                        onClick={() => selectPersona(persona)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                      >
                        Aktivieren
                      </button>
                    )}
                    {personas.length > 1 && (
                      <button
                        onClick={() => deletePersona(persona.id)}
                        className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                        title="Persona löschen"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Form to create a new persona */}
          {!isCreating ? (
            <button
              onClick={() => setIsCreating(true)}
              className="w-full py-2.5 rounded-xl border border-dashed border-slate-700 hover:border-accent-500 text-slate-400 hover:text-accent-300 flex items-center justify-center gap-2 transition-colors font-medium"
            >
              <UserPlus className="w-4 h-4" />
              <span>Neue Persona erstellen</span>
            </button>
          ) : (
            <div className="p-4 bg-app border border-slate-800 rounded-xl space-y-3">
              <div className="font-semibold text-slate-200">Neue Persona anlegen</div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="z. B. Hiroki Ogasawara"
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-accent-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Beschreibung (Wer bist du im Rollenspiel?)
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Fotograf, ruhige Art, mag Grüntee..."
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-accent-500 resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-3 py-1 text-slate-400 hover:text-slate-200 rounded"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={handleCreatePersona}
                  className="px-3.5 py-1 bg-accent-600 hover:bg-accent-500 text-white rounded-lg font-medium flex items-center gap-1.5 shadow-sm"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Erstellen</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-app/80 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
          >
            Fertig
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
};
