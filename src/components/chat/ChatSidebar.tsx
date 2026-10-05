import React, { useEffect, useRef, useState } from 'react';
import { readDraft, writeDraft } from '../../utils/drafts';
import { useAppStore, useStoreFields } from '../../store/useAppStore';
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

type SidebarDrafts = Record<string, { note?: { text: string; depth: number }; summary?: string }>;

const readSidebarDrafts = (): SidebarDrafts => {
  try {
    const parsed: unknown = JSON.parse(readDraft('sidebar') ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as SidebarDrafts) : {};
  } catch {
    return {};
  }
};

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
    updateChatSummary,
    isSummarizing,
  } = useStoreFields(
    'activeCharacter', 'chatSessions', 'activeChatId', 'switchChatSession', 'createNewChat',
    'renameChatSession', 'deleteChatSession', 'updateAuthorNote', 'applyHudPreset',
    'exportCurrentChat', 'importChatJsonl', 'updateChatSummary', 'isSummarizing',
  );
  const bookmarkedMessageIds = useAppStore((s) => s.bookmarkedMessageIds);
  const storedMessages = useAppStore((s) => s.storedMessages);
  const requestChatJump = useAppStore((s) => s.requestChatJump);
  const bookmarks = bookmarkedMessageIds
    .map((id) => storedMessages.find((m) => m.id === id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m));

  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  // Unsaved notes and summaries per chat; kept on this device across restarts.
  const [drafts, setDrafts] = useState<SidebarDrafts>(readSidebarDrafts);
  useEffect(() => writeDraft('sidebar', Object.keys(drafts).length > 0 ? JSON.stringify(drafts) : ''), [drafts]);
  const [activeTab, setActiveTab] = useState<'chats' | 'author_note' | 'presets'>('chats');
  const [isImporting, setIsImporting] = useState(false);
  const pending = useRef(new Set<string>());
  const [saving, setSaving] = useState<string[]>([]);
  const activeSession = chatSessions.find((s) => s.id === activeChatId);
  const draft = activeChatId ? drafts[activeChatId] : undefined;
  const authorNoteInput = draft?.note?.text ?? activeSession?.author_note ?? '';
  const authorNoteDepthInput = draft?.note?.depth ?? activeSession?.author_note_depth ?? 2;
  const summaryInput = draft?.summary ?? activeSession?.summary ?? '';
  const noteSaving = saving.includes(`note:${activeChatId}`);
  const summarySaving = saving.includes(`summary:${activeChatId}`);
  const renameSaving = saving.some((key) => key.startsWith('rename:'));

  const setNoteDraft = (text: string, depth: number) => {
    if (!activeChatId) return;
    setDrafts((all) => ({ ...all, [activeChatId]: { ...all[activeChatId], note: { text, depth } } }));
  };
  const setSummaryDraft = (summary: string) => {
    if (!activeChatId) return;
    setDrafts((all) => ({ ...all, [activeChatId]: { ...all[activeChatId], summary } }));
  };
  const clearDraft = (chatId: string, field: 'note' | 'summary') => {
    setDrafts((all) => {
      const next = { ...all[chatId] };
      delete next[field];
      return { ...all, [chatId]: next };
    });
  };
  const save = async (key: string, action: () => Promise<void>, errorKey: TranslationKey) => {
    if (pending.current.has(key)) return;
    pending.current.add(key);
    setSaving([...pending.current]);
    try {
      await action();
    } catch (error) {
      toast.error(translate(errorKey, { error: errorMessage(error) }));
    } finally {
      pending.current.delete(key);
      setSaving([...pending.current]);
    }
  };

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
    const title = editTitle.trim();
    if (!title) return;
    await save(`rename:${chatId}`, async () => {
      await renameChatSession(chatId, title);
      setEditingChatId((current) => current === chatId ? null : current);
    }, 'chatSidebar.renameFailed');
  };

  const handleSaveAuthorNote = async () => {
    if (!activeSession) return;
    const chatId = activeSession.id;
    await save(`note:${chatId}`, async () => {
      await updateAuthorNote(authorNoteInput, authorNoteDepthInput);
      clearDraft(chatId, 'note');
      toast.success(translate('chatSidebar.noteSaved'));
    }, 'chatSidebar.noteSaveFailed');
  };

  const handleSaveSummary = async (reset = false) => {
    if (!activeSession || isSummarizing) return;
    const chatId = activeSession.id;
    await save(`summary:${chatId}`, async () => {
      await updateChatSummary(reset ? '' : summaryInput.trim(), reset ? -1 : activeSession.summary_until);
      clearDraft(chatId, 'summary');
      toast.success(translate('chatSidebar.summarySaved'));
    }, 'chatSidebar.summarySaveFailed');
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
    // Anchored inside the chat view so it never covers the main navigation; z-45 keeps it above
    // the character bar (z-40), which comes later in the DOM.
    <aside
      aria-label={t('chatSidebar.title')}
      className="absolute inset-y-0 left-0 z-45 w-80 bg-slate-900/95 backdrop-blur-md border-r border-slate-800 shadow-2xl flex flex-col text-slate-200"
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
              <div className="p-6 text-center text-xs text-slate-400">
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
                          disabled={renameSaving}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(session.id);
                            if (e.key === 'Escape' && !renameSaving) { e.preventDefault(); setEditingChatId(null); }
                          }}
                          autoFocus
                          aria-label={t('chatSidebar.renameInput')}
                          className="flex-1 min-w-0 bg-slate-900 border border-accent-500/60 rounded px-2 py-1 text-xs text-white focus:outline-hidden"
                        />
                        <button
                          onClick={() => handleSaveRename(session.id)}
                          disabled={renameSaving || !editTitle.trim()}
                          className="p-1 text-green-400 hover:text-green-300"
                          title={t('chatSidebar.saveTitle')}
                          aria-label={t('chatSidebar.saveTitle')}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingChatId(null)}
                          disabled={renameSaving}
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
                        <div className="text-[11px] text-slate-400 flex items-center justify-between">
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
                          disabled={renameSaving}
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

          {/* Bookmarks of the open chat: jump to an important scene. */}
          {bookmarks.length > 0 && (
            <div className="border-t border-slate-800 p-2 max-h-48 overflow-y-auto">
              <h3 className="px-1 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Bookmark className="w-3.5 h-3.5 text-amber-300" />
                {t('chatSidebar.bookmarks')}
              </h3>
              <ul aria-label={t('chatSidebar.bookmarks')} className="space-y-0.5">
                {bookmarks.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => requestChatJump(m.id)}
                      className="w-full text-left px-2 py-1 rounded-md text-xs text-slate-300 hover:bg-slate-800 truncate outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
                    >
                      {m.content.replace(/\s+/g, ' ').slice(0, 80)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

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
              onChange={(e) => setNoteDraft(e.target.value, authorNoteDepthInput)}
              disabled={!activeSession || noteSaving}
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
              onChange={(e) => setNoteDraft(authorNoteInput, parseInt(e.target.value, 10))}
              disabled={!activeSession || noteSaving}
              className="w-full accent-accent-500 cursor-pointer"
            />
            <p className="text-xs text-slate-400">{t('chatSidebar.depthHint')}</p>
          </div>

          <button
            onClick={handleSaveAuthorNote}
            disabled={!activeSession || noteSaving}
            className="w-full py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-xl text-xs font-medium transition-all shadow-md flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>{noteSaving ? t('common.saving') : t('chatSidebar.saveNote')}</span>
          </button>

          <div className="space-y-2 pt-4 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <label htmlFor="chat-summary-input" className="text-xs font-medium text-slate-300">
                {t('chatSidebar.summaryLabel')}
              </label>
              {isSummarizing && (
                <span className="text-xs text-accent-400 animate-pulse">{t('chatSidebar.summarizing')}</span>
              )}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">{t('chatSidebar.summaryIntro')}</p>
            <textarea
              id="chat-summary-input"
              value={summaryInput}
              onChange={(e) => setSummaryDraft(e.target.value)}
              disabled={!activeSession || summarySaving || isSummarizing}
              placeholder={t('chatSidebar.summaryPlaceholder')}
              rows={8}
              className="w-full bg-app/80 border border-slate-700/80 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-accent-500 resize-y"
            />
            <div className="flex gap-2">
              <button
                onClick={() => handleSaveSummary()}
                disabled={!activeSession || isSummarizing || summarySaving}
                className="flex-1 py-2 bg-accent-600 hover:bg-accent-500 disabled:opacity-40 text-white rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>{summarySaving ? t('common.saving') : t('chatSidebar.saveSummary')}</span>
              </button>
              <button
                onClick={() => handleSaveSummary(true)}
                disabled={!activeSession || isSummarizing || summarySaving || !activeSession.summary}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 rounded-xl text-xs font-medium transition-all"
                title={t('chatSidebar.resetSummaryHint')}
              >
                {t('chatSidebar.resetSummary')}
              </button>
            </div>
          </div>
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
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-accent-400 transition-colors" />
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
