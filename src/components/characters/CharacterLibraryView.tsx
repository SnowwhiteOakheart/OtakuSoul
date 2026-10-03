import { useState, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
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
  Compass,
  MoreHorizontal,
  SearchX,
  UserPlus,
} from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useGridCols } from '../../hooks/useGridCols';
import { CharacterEditorModal } from './CharacterEditorModal';
import { translate, useTranslation } from '../../i18n';
import { confirmDialog, toast } from '../ui/feedback';
import { DropdownMenu } from '../ui/DropdownMenu';
import { EmptyState } from '../ui/EmptyState';
import { errorMessage } from '../../utils/errors';
import { fillCardMacros, localizeCard } from '../../utils/cardI18n';

const SECONDARY_BUTTON =
  'px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 border border-slate-700 transition-colors whitespace-nowrap outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400';
const PRIMARY_BUTTON =
  'px-3.5 py-1.5 rounded-xl bg-accent-600 hover:bg-accent-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-accent-900/30 transition-all whitespace-nowrap outline-hidden focus-visible:ring-2 focus-visible:ring-accent-300';
const CARD_ACTION_BUTTON =
  'p-1.5 rounded-lg bg-slate-900/80 text-slate-200 hover:text-white backdrop-blur shadow-sm transition-colors outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400';

export const CharacterLibraryView = () => {
  const { t, currentLanguage } = useTranslation();

  const {
    availableCharacters,
    activeCharacter,
    selectCharacter,
    refreshCharacters,
    deleteCharacter,
    restoreHiddenCharacters,
    setActiveTab,
    activePersona,
    setCharacterWizardOpen,
    setIsPersonaManagerOpen,
  } = useAppStore(
    useShallow((s) => ({
      availableCharacters: s.availableCharacters,
      activeCharacter: s.activeCharacter,
      selectCharacter: s.selectCharacter,
      refreshCharacters: s.refreshCharacters,
      deleteCharacter: s.deleteCharacter,
      restoreHiddenCharacters: s.restoreHiddenCharacters,
      setActiveTab: s.setActiveTab,
      activePersona: s.activePersona,
      setCharacterWizardOpen: s.setCharacterWizardOpen,
      setIsPersonaManagerOpen: s.setIsPersonaManagerOpen,
    }))
  );

  const [searchQuery, setSearchQuery] = useState('');
  // null = no tag filter
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [editingCharacter, setEditingCharacter] = useState<CharacterProfile | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const char of availableCharacters) {
      for (const tag of localizeCard(char.card.data, currentLanguage).tags ?? []) {
        if (tag.trim()) set.add(tag.trim());
      }
    }
    return Array.from(set).slice(0, 12);
  }, [availableCharacters, currentLanguage]);

  const filteredCharacters = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return availableCharacters.filter((char) => {
      const data = localizeCard(char.card.data, currentLanguage);
      const matchesSearch =
        data.name.toLowerCase().includes(query) ||
        data.description.toLowerCase().includes(query) ||
        data.personality.toLowerCase().includes(query) ||
        (data.tags ?? []).some((tag) => tag.toLowerCase().includes(query));
      const matchesTag = selectedTag === null || (data.tags ?? []).includes(selectedTag);
      return matchesSearch && matchesTag;
    });
  }, [availableCharacters, searchQuery, selectedTag, currentLanguage]);

  const { ref: parentRef, cols } = useGridCols({ 640: 2, 768: 3, 1024: 4, 1280: 5 }, 1);
  // oxlint-disable-next-line react/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(filteredCharacters.length / cols),
    getScrollElement: () => parentRef.current,
    estimateSize: () => 380, // rough height of a card + gap
    overscan: 2,
  });


  const openEditor = (character: CharacterProfile | null) => {
    setEditingCharacter(character);
    setIsEditorOpen(true);
  };

  const handleImportCard = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: translate('library.fileFilterCards'), extensions: ['png', 'json'] }],
      });
      if (selected && typeof selected === 'string') {
        const loaded = await api.loadCharacterCard(selected);
        const saved = await api.saveCharacterCard(loaded);
        await refreshCharacters();
        await selectCharacter(saved);
        toast.success(translate('library.imported', { name: saved.card.data.name }));
      }
    } catch (e) {
      console.error('Failed to import character card:', e);
      toast.error(translate('library.importFailed', { error: errorMessage(e) }));
    }
  };

  const handleExportCard = async (char: CharacterProfile, format: 'png' | 'json') => {
    try {
      const defaultFileName = `${char.card.data.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.${format}`;
      const targetPath = await save({
        defaultPath: defaultFileName,
        filters: [
          {
            name: translate(format === 'png' ? 'library.fileFilterPng' : 'library.fileFilterJson'),
            extensions: [format],
          },
        ],
      });
      if (targetPath) {
        await api.exportCharacterCard(char, targetPath, format === 'png');
        toast.success(translate('library.exported', { name: char.card.data.name, path: targetPath }));
      }
    } catch (e) {
      console.error('Failed to export character card:', e);
      toast.error(translate('library.exportFailed', { error: errorMessage(e) }));
    }
  };

  const handleDeleteCard = async (char: CharacterProfile) => {
    const confirmed = await confirmDialog({
      title: translate('confirm.trashCharacterTitle', { name: char.card.data.name }),
      message: translate('confirm.trashCharacterText'),
      confirmLabel: translate('confirm.moveToTrash'),
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteCharacter(char.id);
      toast.success(translate('library.trashed', { name: char.card.data.name }));
    } catch (e) {
      toast.error(translate('toast.deleteFailed', { error: errorMessage(e) }));
    }
  };

  const handleRestorePresets = async () => {
    try {
      await restoreHiddenCharacters();
      toast.success(translate('library.presetsRestored'));
    } catch (e) {
      toast.error(translate('library.restoreFailed', { error: errorMessage(e) }));
    }
  };

  const handleSelectAndChat = async (char: CharacterProfile) => {
    await selectCharacter(char);
    setActiveTab('chat');
  };

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedTag(null);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-app overflow-hidden">
      {/* Top Header Bar */}
      <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/60 backdrop-blur flex items-center justify-between gap-4 select-none">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-accent-600/20 border border-accent-500/30 flex items-center justify-center text-accent-400 shadow-sm">
            <Users className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-100 whitespace-nowrap">{t('library.title')}</h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent-500/20 text-accent-300 font-mono whitespace-nowrap">
                {t('library.cardCount', { count: availableCharacters.length })}
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate">
              {t('library.subtitle')} <span className="text-accent-300 font-medium">{activePersona.name}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button onClick={handleImportCard} title={t('library.importHint')} className={SECONDARY_BUTTON}>
            <Upload className="w-3.5 h-3.5 text-cyan-400" />
            <span>{t('library.import')}</span>
          </button>
          <button
            onClick={() => setCharacterWizardOpen(true)}
            title={t('library.aiAssistantHint')}
            className={SECONDARY_BUTTON}
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>{t('library.aiAssistant')}</span>
          </button>
          <DropdownMenu
            triggerLabel={t('library.more')}
            trigger={<MoreHorizontal className="w-4 h-4" />}
            triggerClassName={`${SECONDARY_BUTTON} px-2`}
            items={[
              { label: t('library.personas'), icon: Users, onSelect: () => setIsPersonaManagerOpen(true) },
              { label: t('library.browseHub'), icon: Compass, onSelect: () => setActiveTab('hub') },
              { label: t('library.restorePresets'), icon: RotateCcw, onSelect: handleRestorePresets },
            ]}
          />
          <button onClick={() => openEditor(null)} className={PRIMARY_BUTTON}>
            <Plus className="w-4 h-4" />
            <span>{t('library.newCharacter')}</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="px-6 py-3 border-b border-slate-800/80 bg-slate-900/30 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label={t('library.searchLabel')}
            placeholder={t('library.searchPlaceholder')}
            className="w-full pl-9 pr-4 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-accent-500 transition-colors"
          />
        </div>

        <div
          role="group"
          aria-label={t('library.tagFilter')}
          className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0"
        >
          <Tag className="w-3.5 h-3.5 text-slate-500 ml-1 mr-0.5 shrink-0" aria-hidden />
          {[null, ...allTags].map((tag) => (
            <button
              key={tag ?? '__all__'}
              onClick={() => setSelectedTag(tag)}
              aria-pressed={selectedTag === tag}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
                selectedTag === tag
                  ? 'bg-accent-600/30 text-accent-300 border border-accent-500/50 shadow-sm'
                  : 'bg-slate-900/70 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800/60'
              }`}
            >
              {tag ?? t('library.allTags')}
            </button>
          ))}
        </div>
      </div>

      {/* Character Cards Grid */}
      <div className="flex-1 overflow-y-auto p-6" ref={parentRef}>
        {availableCharacters.length === 0 ? (
          <EmptyState
            icon={UserPlus}
            title={t('library.emptyTitle')}
            description={t('library.emptyText')}
            actions={
              <>
                <button onClick={() => openEditor(null)} className={PRIMARY_BUTTON}>
                  <Plus className="w-4 h-4" />
                  <span>{t('library.newCharacter')}</span>
                </button>
                <button onClick={handleImportCard} className={SECONDARY_BUTTON}>
                  <Upload className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{t('library.import')}</span>
                </button>
                <button onClick={() => setActiveTab('hub')} className={SECONDARY_BUTTON}>
                  <Compass className="w-3.5 h-3.5 text-accent-400" />
                  <span>{t('library.browseHub')}</span>
                </button>
              </>
            }
          />
        ) : filteredCharacters.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title={t('library.noMatchesTitle')}
            description={t('library.noMatchesText')}
            actions={
              <button onClick={resetFilters} className={SECONDARY_BUTTON}>
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t('library.resetFilters')}</span>
              </button>
            }
          />
        ) : (
          <div
            style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const startIndex = virtualRow.index * cols;
              const rowItems = filteredCharacters.slice(startIndex, startIndex + cols);

              return (
                <div
                  key={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                    paddingBottom: '20px', // gap substitute since grid parent doesn't handle vertical gap between virtual rows
                  }}
                >
                  {rowItems.map((char) => {

              // Cards are shown in the interface language; {{char}}/{{user}} become real names.
              const data = localizeCard(char.card.data, currentLanguage);
              const isActive = activeCharacter?.id === char.id;
              const title = (data.extensions?.sow_title as string) || data.tags?.[0] || t('library.defaultTitle');

              return (
                <div
                  key={char.id}
                  className={`group rounded-2xl border flex flex-col overflow-hidden bg-slate-900/70 transition-all duration-200 hover:border-accent-500/60 hover:shadow-xl hover:shadow-accent-950/20 ${
                    isActive
                      ? 'border-accent-500/80 shadow-md shadow-accent-950/40 ring-1 ring-accent-500/50'
                      : 'border-slate-800'
                  }`}
                >
                  {/* Avatar Image Header */}
                  <div className="aspect-[4/5] w-full bg-app relative overflow-hidden flex items-center justify-center">
                    {char.avatar_data_url ? (
                      <img
                        src={char.avatar_data_url}
                        alt={data.name}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-linear-to-tr from-accent-600 to-indigo-600 flex items-center justify-center text-white font-bold text-2xl shadow-inner">
                        {data.name.charAt(0)}
                      </div>
                    )}

                    <div className="absolute inset-0 bg-linear-to-t from-app via-app/20 to-transparent" />

                    {isActive && (
                      <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full bg-emerald-500/90 text-app text-xs font-bold flex items-center gap-1 shadow-md">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{t('library.active')}</span>
                      </div>
                    )}

                    {/* Card actions: shown on hover and on keyboard focus */}
                    <div className="absolute top-2.5 right-2.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                      <button
                        onClick={() => openEditor(char)}
                        className={`${CARD_ACTION_BUTTON} hover:bg-accent-600`}
                        title={t('library.edit', { name: data.name })}
                        aria-label={t('library.edit', { name: data.name })}
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleExportCard(char, 'png')}
                        className={`${CARD_ACTION_BUTTON} hover:bg-cyan-600`}
                        title={t('library.exportPng', { name: data.name })}
                        aria-label={t('library.exportPng', { name: data.name })}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteCard(char)}
                        className={`${CARD_ACTION_BUTTON} hover:bg-rose-600`}
                        title={t('library.delete', { name: data.name })}
                        aria-label={t('library.delete', { name: data.name })}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="absolute bottom-2.5 left-3 right-3">
                      <div className="text-sm font-bold text-slate-100 line-clamp-1 group-hover:text-accent-300 transition-colors">
                        {data.name}
                      </div>
                      <div className="text-xs text-slate-400 line-clamp-1">{title}</div>
                    </div>
                  </div>

                  <div className="p-3.5 flex-1 flex flex-col justify-between gap-3 text-xs">
                    <p className="text-slate-400 text-xs line-clamp-2">
                      {fillCardMacros(data.description || data.personality, data.name, activePersona.name) ||
                        t('library.noDescription')}
                    </p>

                    {data.tags && data.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {data.tags.slice(0, 3).map((tag, idx) => (
                          <span
                            key={idx}
                            className="text-[11px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/60"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <button
                      onClick={() => handleSelectAndChat(char)}
                      className={`w-full py-1.5 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
                        isActive
                          ? 'bg-accent-600 hover:bg-accent-500 text-white shadow-accent-900/40'
                          : 'bg-slate-800 hover:bg-accent-600/30 text-slate-300 hover:text-accent-200 border border-slate-700/80 hover:border-accent-500/50'
                      }`}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>{isActive ? t('library.openChat') : t('library.selectAndChat')}</span>
                    </button>
                  </div>
                </div>
              );
            
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isEditorOpen && (
        <CharacterEditorModal
          character={editingCharacter}
          onClose={() => setIsEditorOpen(false)}
          onSaved={(savedProfile) => {
            selectCharacter(savedProfile);
          }}
        />
      )}

    </div>
  );
};
