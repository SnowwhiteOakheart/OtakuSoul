import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { HUD_PRESETS } from '../../constants/hudPresets';
import {
  Plus,
  MessageSquare,
  Trash2,
  Edit2,
  Check,
  X,
  FileDown,
  FileUp,
  Bookmark,
  Sliders,
  ChevronRight,
} from 'lucide-react';
import { translate } from '../../i18n';
import { confirmDialog } from '../ui/feedback';

interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({ isOpen, onClose }) => {
  const {
    activeCharacter,
    chatSessions,
    activeChatId,
    switchChatSession,
    createNewChat,
    renameChatSession,
    deleteChatSession,
    updateAuthorNote,
    applyHudPreset,
    exportCurrentChat,
    importChatJsonl,
  } = useAppStore();

  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [authorNoteInput, setAuthorNoteInput] = useState('');
  const [authorNoteDepthInput, setAuthorNoteDepthInput] = useState(2);
  const [activeTab, setActiveTab] = useState<'chats' | 'author_note' | 'presets'>('chats');
  const [isImporting, setIsImporting] = useState(false);

  // Sync author note inputs when active chat changes
  const activeSession = chatSessions.find((s) => s.id === activeChatId);
  React.useEffect(() => {
    if (activeSession) {
      setAuthorNoteInput(activeSession.author_note || '');
      setAuthorNoteDepthInput(activeSession.author_note_depth || 2);
    }
  }, [activeSession?.id, activeSession?.author_note, activeSession?.author_note_depth]);

  if (!isOpen) return null;

  const handleStartRename = (session: { id: string; title: string }) => {
    setEditingChatId(session.id);
    setEditTitle(session.title);
  };

  const handleSaveRename = async (chatId: string) => {
    if (editTitle.trim()) {
      await renameChatSession(chatId, editTitle.trim());
    }
    setEditingChatId(null);
  };

  const handleSaveAuthorNote = async () => {
    await updateAuthorNote(authorNoteInput, Number(authorNoteDepthInput) || 2);
  };

  const handleExport = async () => {
    const jsonl = await exportCurrentChat();
    if (!jsonl) return;

    const blob = new Blob([jsonl], { type: 'application/jsonl;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeCharacter?.card.data.name || 'chat'}_${new Date().toISOString().slice(0, 10)}.jsonl`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      await importChatJsonl(text, file.name.replace(/\.[^/.]+$/, ''));
    } catch (err) {
      console.error('Import failed:', err);
    } finally {
      setIsImporting(false);
      e.target.value = '';
    }
  };

  return (
    <div className="fixed inset-y-0 left-0 z-40 w-80 bg-slate-900/95 backdrop-blur-md border-r border-slate-800 shadow-2xl flex flex-col pt-14 text-slate-200">
      {/* Sidebar Header */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-accent-400" />
          <span className="font-semibold text-sm">Gesprächs-Manager</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          title="Schließen"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Sub Tabs */}
      <div className="grid grid-cols-3 p-1.5 gap-1 bg-app/60 border-b border-slate-800/80 text-xs">
        <button
          onClick={() => setActiveTab('chats')}
          className={`py-1.5 px-2 rounded-md font-medium transition-all ${
            activeTab === 'chats'
              ? 'bg-accent-600/30 text-accent-300 border border-accent-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          Chats
        </button>
        <button
          onClick={() => setActiveTab('author_note')}
          className={`py-1.5 px-2 rounded-md font-medium transition-all ${
            activeTab === 'author_note'
              ? 'bg-accent-600/30 text-accent-300 border border-accent-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          Author's Note
        </button>
        <button
          onClick={() => setActiveTab('presets')}
          className={`py-1.5 px-2 rounded-md font-medium transition-all ${
            activeTab === 'presets'
              ? 'bg-accent-600/30 text-accent-300 border border-accent-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          HUD Presets
        </button>
      </div>

      {/* Tab 1: Chats List */}
      {activeTab === 'chats' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">
              {chatSessions.length} {chatSessions.length === 1 ? 'Sitzung' : 'Sitzungen'}
            </span>
            <button
              onClick={() => createNewChat()}
              className="flex items-center gap-1.5 px-3 py-1 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-xs font-medium transition-all shadow-md"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Neuer Chat</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {chatSessions.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                Keine gespeicherten Chats vorhanden. Klicke auf "Neuer Chat".
              </div>
            ) : (
              chatSessions.map((session) => {
                const isActive = session.id === activeChatId;
                const isEditing = editingChatId === session.id;

                return (
                  <div
                    key={session.id}
                    className={`group relative rounded-xl p-2.5 transition-all border ${
                      isActive
                        ? 'bg-accent-950/40 border-accent-500/50 text-white shadow-sm'
                        : 'bg-app/40 border-slate-800/60 text-slate-300 hover:bg-slate-800/50 hover:border-slate-700'
                    }`}
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(session.id);
                            if (e.key === 'Escape') setEditingChatId(null);
                          }}
                          autoFocus
                          className="flex-1 bg-slate-900 border border-accent-500/60 rounded px-2 py-1 text-xs text-white focus:outline-none"
                        />
                        <button
                          onClick={() => handleSaveRename(session.id)}
                          className="p-1 text-green-400 hover:text-green-300"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingChatId(null)}
                          className="p-1 text-slate-400 hover:text-slate-300"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => switchChatSession(session.id)}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-xs truncate max-w-[170px]">
                            {session.title}
                          </span>
                          <span className="text-[10px] bg-slate-800/80 px-1.5 py-0.5 rounded text-slate-400">
                            {session.message_count} {session.message_count === 1 ? 'Nachricht' : 'Nachrichten'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center justify-between">
                          <span>{new Date(session.updated_at * 1000).toLocaleDateString()}</span>
                          {session.author_note && (
                            <span className="text-accent-400 flex items-center gap-0.5">
                              <Bookmark className="w-2.5 h-2.5" /> Note
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Actions on hover */}
                    {!isEditing && (
                      <div className="absolute right-2 top-2 hidden group-hover:flex items-center gap-1 bg-slate-900/90 rounded-md px-1 py-0.5 border border-slate-700/80">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartRename(session);
                          }}
                          className="p-1 text-slate-400 hover:text-accent-300 transition-colors"
                          title="Umbenennen"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const confirmed = await confirmDialog({
                              title: translate('confirm.deleteChatTitle', { title: session.title }),
                              message: translate('confirm.deleteChatText'),
                              confirmLabel: translate('common.delete'),
                              tone: 'danger',
                            });
                            if (confirmed) deleteChatSession(session.id);
                          }}
                          className="p-1 text-slate-400 hover:text-rose-400 transition-colors"
                          title="Löschen"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Import / Export Buttons */}
          <div className="p-3 border-t border-slate-800 bg-app/80 flex items-center gap-2">
            <button
              onClick={handleExport}
              disabled={!activeChatId}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-medium rounded-lg text-slate-200 transition-colors"
              title="Aktuellen Chat als SillyTavern JSONL exportieren"
            >
              <FileDown className="w-3.5 h-3.5 text-accent-400" />
              <span>Exportieren</span>
            </button>

            <label className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 bg-slate-800 hover:bg-slate-700 cursor-pointer text-xs font-medium rounded-lg text-slate-200 transition-colors">
              <FileUp className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isImporting ? 'Lade...' : 'Importieren'}</span>
              <input
                type="file"
                accept=".jsonl,.json"
                className="hidden"
                onChange={handleImportFile}
                disabled={isImporting}
              />
            </label>
          </div>
        </div>
      )}

      {/* Tab 2: Author's Note */}
      {activeTab === 'author_note' && (
        <div className="flex-1 flex flex-col p-4 overflow-y-auto space-y-4">
          <div>
            <div className="flex items-center gap-1.5 text-accent-400 mb-1">
              <Bookmark className="w-4 h-4" />
              <h3 className="text-xs font-semibold uppercase tracking-wider">Author's Note</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Direkte Regieanweisung an das Modell. Wird in den System-Prompt bzw. $N$ Nachrichten vor das Ende der Konversation injiziert.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-300">Regieanweisung (Author's Note)</label>
            <textarea
              value={authorNoteInput}
              onChange={(e) => setAuthorNoteInput(e.target.value)}
              placeholder="z. B. [Ayu wirkt besonders nachdenklich und spricht leiser...]"
              rows={5}
              className="w-full bg-app/80 border border-slate-700/80 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-accent-500 resize-none"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300">Injektionstiefe (Depth)</label>
              <span className="text-xs font-mono text-accent-400">{authorNoteDepthInput}</span>
            </div>
            <input
              type="range"
              min={0}
              max={6}
              value={authorNoteDepthInput}
              onChange={(e) => setAuthorNoteDepthInput(parseInt(e.target.value, 10))}
              className="w-full accent-accent-500 cursor-pointer"
            />
            <p className="text-[11px] text-slate-500">
              0 = direkt im System-Prompt. 2 = 2 Nachrichten vor Ende der Historie (SillyTavern Standard).
            </p>
          </div>

          <button
            onClick={handleSaveAuthorNote}
            className="w-full py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-xl text-xs font-medium transition-all shadow-md flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>Author's Note Speichern</span>
          </button>
        </div>
      )}

      {/* Tab 3: 11 HUD Presets */}
      {activeTab === 'presets' && (
        <div className="flex-1 flex flex-col p-3 overflow-y-auto space-y-2">
          <div className="mb-2">
            <div className="flex items-center gap-1.5 text-accent-400 mb-1">
              <Sliders className="w-4 h-4" />
              <h3 className="text-xs font-semibold uppercase tracking-wider">HUD Status-Presets</h3>
            </div>
            <p className="text-xs text-slate-400">
              Wähle ein Genre-Preset für die reaktive HUD-Statusleiste aus:
            </p>
          </div>

          <div className="space-y-1.5">
            {HUD_PRESETS.map((preset) => (
              <div
                key={preset.id}
                onClick={() => applyHudPreset(preset.id)}
                className="group p-2.5 rounded-xl border border-slate-800/80 bg-app/60 hover:bg-slate-800/50 hover:border-accent-500/40 cursor-pointer transition-all"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full bg-gradient-to-r ${preset.color}`} />
                    <span className="font-semibold text-xs text-white group-hover:text-accent-300 transition-colors">
                      {preset.name}
                    </span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-accent-400 transition-colors" />
                </div>
                <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed mb-1.5">
                  {preset.description}
                </p>
                <div className="flex flex-wrap gap-1">
                  {preset.defaultVariables.map((v) => (
                    <span
                      key={v.name}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400"
                    >
                      {v.name}: {v.value}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
