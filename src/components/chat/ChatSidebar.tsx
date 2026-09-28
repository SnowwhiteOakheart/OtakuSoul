import React, { useEffect, useState } from 'react';
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
import { translate, useTranslation, type TranslationKey } from '../../i18n';
import { confirmDialog, toast } from '../ui/feedback';
import { errorMessage } from '../../utils/errors';

interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({ isOpen, onClose }) => {
  const { t, tPlural } = useTranslation();
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

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !editingChatId) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, editingChatId]);

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
    toast.success(translate('chatSidebar.noteSaved'));
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
      const title = file.name.replace(/\.[^/.]+$/, '');
      await importChatJsonl(text, title);
      toast.success(translate('chatSidebar.imported', { title }));
    } catch (err) {
      console.error('Import failed:', err);
      toast.error(translate('chatSidebar.importFailed', { error: errorMessage(err) }));
    } finally {
      setIsImporting(false);
      e.target.value = '';
    }
  };

  return (
    // Anchored inside the chat view so it never covers the main navigation.
    <aside
      aria-label={t('chatSidebar.title')}
      className="absolute inset-y-0 left-0 z-40 w-80 bg-slate-900/95 backdrop-blur-md border-r border-slate-800 shadow-2xl flex flex-col text-slate-200"
    >
      {/* Sidebar Header */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-accent-400" />
          <h2 className="font-semibold text-sm">{t('chatSidebar.title')}</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
          title={t('common.close')}
          aria-label={t('common.close')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Sub Tabs */}
      <div role="tablist" aria-label={t('chatSidebar.tabs')} className="grid grid-cols-3 p-1.5 gap-1 bg-app/60 border-b border-slate-800/80 text-xs">
        <button
          role="tab"
          aria-selected={activeTab === 'chats'}
          onClick={() => setActiveTab('chats')}
          className={`py-1.5 px-2 rounded-md font-medium transition-all whitespace-nowrap outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
            activeTab === 'chats'
              ? 'bg-accent-600/30 text-accent-300 border border-accent-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          {t('chatSidebar.tabChats')}
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'author_note'}
          onClick={() => setActiveTab('author_note')}
          className={`py-1.5 px-2 rounded-md font-medium transition-all whitespace-nowrap outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
            activeTab === 'author_note'
              ? 'bg-accent-600/30 text-accent-300 border border-accent-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          {t('chatSidebar.tabAuthorNote')}
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'presets'}
          onClick={() => setActiveTab('presets')}
          className={`py-1.5 px-2 rounded-md font-medium transition-all whitespace-nowrap outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
            activeTab === 'presets'
              ? 'bg-accent-600/30 text-accent-300 border border-accent-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          {t('chatSidebar.tabPresets')}
        </button>
      </div>

      {/* Tab 1: Chats List */}
      {activeTab === 'chats' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">
              {tPlural('chat.sessionCount', chatSessions.length)}
            </span>
            <button
              onClick={() => createNewChat()}
              className="flex items-center gap-1.5 px-3 py-1 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-xs font-medium transition-all shadow-md"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('chatSidebar.newChat')}</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {chatSessions.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                {t('chatSidebar.empty')}
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
                          aria-label={t('chatSidebar.renameInput')}
                          className="flex-1 bg-slate-900 border border-accent-500/60 rounded px-2 py-1 text-xs text-white focus:outline-hidden"
                        />
                        <button
                          onClick={() => handleSaveRename(session.id)}
                          className="p-1 text-green-400 hover:text-green-300"
                          title={t('chatSidebar.saveTitle')}
                          aria-label={t('chatSidebar.saveTitle')}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingChatId(null)}
                          className="p-1 text-slate-400 hover:text-slate-300"
                          title={t('chatSidebar.cancelRename')}
                          aria-label={t('chatSidebar.cancelRename')}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => switchChatSession(session.id)}
                        aria-current={isActive ? 'true' : undefined}
                        className="w-full text-left cursor-pointer rounded outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-xs truncate max-w-[170px]">
                            {session.title}
                          </span>
                          <span className="text-[11px] bg-slate-800/80 px-1.5 py-0.5 rounded text-slate-400">
                            {tPlural('chat.messageCount', session.message_count)}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center justify-between">
                          <span>{new Date(session.updated_at * 1000).toLocaleDateString()}</span>
                          {session.author_note && (
                            <span className="text-accent-400 flex items-center gap-0.5">
                              <Bookmark className="w-2.5 h-2.5" /> {t('chatSidebar.hasNote')}
                            </span>
                          )}
                        </div>
                      </button>
                    )}

                    {/* Actions on hover */}
                    {!isEditing && (
                      <div className="absolute right-2 top-2 hidden group-hover:flex group-focus-within:flex items-center gap-1 bg-slate-900/90 rounded-md px-1 py-0.5 border border-slate-700/80">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartRename(session);
                          }}
                          className="p-1 text-slate-400 hover:text-accent-300 transition-colors"
                          title={t('chatSidebar.rename')}
                          aria-label={t('chatSidebar.rename')}
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
                          title={t('common.delete')}
                          aria-label={t('common.delete')}
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
              title={t('chatSidebar.exportHint')}
            >
              <FileDown className="w-3.5 h-3.5 text-accent-400" />
              <span>{t('chatSidebar.export')}</span>
            </button>

            <label className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 bg-slate-800 hover:bg-slate-700 cursor-pointer text-xs font-medium rounded-lg text-slate-200 transition-colors focus-within:ring-2 focus-within:ring-accent-400">
              <FileUp className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isImporting ? t('chatSidebar.importing') : t('chatSidebar.import')}</span>
              <input
                type="file"
                accept=".jsonl,.json"
                className="sr-only"
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
              <h3 className="text-xs font-semibold uppercase tracking-wider">{t('chatSidebar.tabAuthorNote')}</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">{t('chatSidebar.noteIntro')}</p>
          </div>

          <div className="space-y-2">
            <label htmlFor="author-note-input" className="text-xs font-medium text-slate-300">
              {t('chatSidebar.noteLabel')}
            </label>
            <textarea
              id="author-note-input"
              value={authorNoteInput}
              onChange={(e) => setAuthorNoteInput(e.target.value)}
              placeholder={t('chatSidebar.notePlaceholder')}
              rows={5}
              className="w-full bg-app/80 border border-slate-700/80 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-accent-500 resize-none"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="author-note-depth" className="text-xs font-medium text-slate-300">
                {t('chatSidebar.depth')}
              </label>
              <span className="text-xs font-mono text-accent-400">{authorNoteDepthInput}</span>
            </div>
            <input
              id="author-note-depth"
              type="range"
              min={0}
              max={6}
              value={authorNoteDepthInput}
              onChange={(e) => setAuthorNoteDepthInput(parseInt(e.target.value, 10))}
              className="w-full accent-accent-500 cursor-pointer"
            />
            <p className="text-xs text-slate-400">{t('chatSidebar.depthHint')}</p>
          </div>

          <button
            onClick={handleSaveAuthorNote}
            className="w-full py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-xl text-xs font-medium transition-all shadow-md flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>{t('chatSidebar.saveNote')}</span>
          </button>
        </div>
      )}

      {/* Tab 3: 11 HUD Presets */}
      {activeTab === 'presets' && (
        <div className="flex-1 flex flex-col p-3 overflow-y-auto space-y-2">
          <div className="mb-2">
            <div className="flex items-center gap-1.5 text-accent-400 mb-1">
              <Sliders className="w-4 h-4" />
              <h3 className="text-xs font-semibold uppercase tracking-wider">{t('chatSidebar.tabPresets')}</h3>
            </div>
            <p className="text-xs text-slate-400">{t('chatSidebar.presetsIntro')}</p>
          </div>

          <div className="space-y-1.5">
            {HUD_PRESETS.map((preset) => (
              <button
                type="button"
                key={preset.id}
                onClick={() => {
                  applyHudPreset(preset.id);
                  toast.success(translate('chatSidebar.presetApplied', { name: t(`hudPreset.${preset.id}` as TranslationKey) }));
                }}
                className="group w-full text-left p-2.5 rounded-xl border border-slate-800/80 bg-app/60 hover:bg-slate-800/50 hover:border-accent-500/40 cursor-pointer transition-all outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full bg-linear-to-r ${preset.color}`} />
                    <span className="font-semibold text-xs text-white group-hover:text-accent-300 transition-colors">
                      {t(`hudPreset.${preset.id}` as TranslationKey)}
                    </span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-accent-400 transition-colors" />
                </div>
                <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-1.5">
                  {t(`hudPreset.${preset.id}Desc` as TranslationKey)}
                </p>
                <div className="flex flex-wrap gap-1">
                  {preset.defaultVariables.map((v) => (
                    <span
                      key={v.name}
                      className="text-[11px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400"
                    >
                      {v.name}: {v.value}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
};
