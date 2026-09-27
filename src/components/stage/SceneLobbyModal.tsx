import React, { useEffect, useState, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { ScenePreview } from '../../types';
import { SceneCreateModal } from './SceneCreateModal';
import {
  Compass,
  Plus,
  Play,
  Download,
  Trash2,
  X,
  Search,
  Users,
  MapPin,
  Check,
  Film,
  BookOpen,
  Folder,
  FolderPlus,
  RotateCcw,
  Upload,
  MoreVertical,
  Layers,
  History,
} from 'lucide-react';
import { translate } from '../../i18n';
import { confirmDialog, toast } from '../ui/feedback';
import { ModalOverlay } from '../ui/ModalOverlay';

interface SceneLobbyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SceneLobbyModal: React.FC<SceneLobbyModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    stageScenes,
    fetchStageScenes,
    stageFolders,
    fetchStageFolders,
    selectedStageFolder,
    setSelectedStageFolder,
    createStageFolder,
    moveStageSceneToFolder,
    deleteStageFolder,
    importStageSceneJson,
    exportStageSceneJson,
    resetStageScene,
    stageState,
    loadStageScene,
    deleteStageScene,
    exportStageMarkdown,
    openSoulHubTab,
  } = useAppStore();

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'presets' | 'custom'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [sceneToResume, setSceneToResume] = useState<ScenePreview | null>(null);
  const [movingScene, setMovingScene] = useState<ScenePreview | null>(null);
  const [activeMenuSceneId, setActiveMenuSceneId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      fetchStageScenes();
      fetchStageFolders();
    }
  }, [isOpen, fetchStageScenes, fetchStageFolders]);

  if (!isOpen) return null;

  const currentSceneId = stageState?.definition.id;

  // Group scenes by folder
  const scenesInFolder = (folderName: string) => {
    if (folderName === 'Alle') return stageScenes;
    return stageScenes.filter((sc) => (sc.folder || 'Eigene Szenen').toLowerCase() === folderName.toLowerCase());
  };

  const filteredScenes = stageScenes.filter((sc) => {
    const matchesSearch =
      sc.title.toLowerCase().includes(search.toLowerCase()) ||
      sc.description.toLowerCase().includes(search.toLowerCase()) ||
      sc.location.toLowerCase().includes(search.toLowerCase()) ||
      sc.folder.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;

    if (selectedStageFolder !== 'Alle') {
      const folderMatch = (sc.folder || 'Eigene Szenen').toLowerCase() === selectedStageFolder.toLowerCase();
      if (!folderMatch) return false;
    }

    if (filterType === 'presets') return sc.is_preset;
    if (filterType === 'custom') return !sc.is_preset;
    return true;
  });

  const handleSceneClick = async (scene: ScenePreview) => {
    if (scene.has_progress && scene.id !== currentSceneId) {
      setSceneToResume(scene);
    } else {
      await handleLoadSceneDirect(scene.id);
    }
  };

  const handleLoadSceneDirect = async (sceneId: string) => {
    try {
      await loadStageScene(sceneId);
      onClose();
    } catch (err) {
      console.error(err);
    }
  };

  const handleResumeConfirmed = async () => {
    if (!sceneToResume) return;
    await handleLoadSceneDirect(sceneToResume.id);
    setSceneToResume(null);
  };

  const handleRestartConfirmed = async () => {
    if (!sceneToResume) return;
    try {
      await resetStageScene(sceneToResume.id);
      await loadStageScene(sceneToResume.id);
      setSceneToResume(null);
      onClose();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (e: React.MouseEvent, sceneId: string) => {
    e.stopPropagation();
    setActiveMenuSceneId(null);
    const confirmed = await confirmDialog({
      title: translate('confirm.deleteSceneTitle'),
      message: translate('confirm.deleteSceneText'),
      confirmLabel: translate('common.delete'),
      tone: 'danger',
    });
    if (confirmed) await deleteStageScene(sceneId);
  };

  const handleResetScene = async (e: React.MouseEvent, sceneId: string) => {
    e.stopPropagation();
    setActiveMenuSceneId(null);
    const confirmed = await confirmDialog({
      title: translate('confirm.resetSceneTitle'),
      message: translate('confirm.resetSceneText'),
      confirmLabel: translate('confirm.reset'),
      tone: 'danger',
    });
    if (confirmed) {
      await resetStageScene(sceneId);
      if (currentSceneId === sceneId) {
        await loadStageScene(sceneId);
      }
    }
  };

  const handleExportMarkdown = async (e: React.MouseEvent, sceneId: string, title: string) => {
    e.stopPropagation();
    setActiveMenuSceneId(null);
    const md = await exportStageMarkdown(sceneId);
    if (md) {
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title.toLowerCase().replace(/\s+/g, '_')}_protokoll.md`;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleExportJson = async (e: React.MouseEvent, sceneId: string, title: string) => {
    e.stopPropagation();
    setActiveMenuSceneId(null);
    const json = await exportStageSceneJson(sceneId);
    if (json) {
      const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title.toLowerCase().replace(/\s+/g, '_')}_szene.json`;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleCreateFolder = async () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    try {
      await createStageFolder(trimmed);
      setNewFolderName('');
      setShowNewFolderModal(false);
      setSelectedStageFolder(trimmed);
    } catch (err: any) {
      toast.error(translate('toast.folderCreateFailed', { error: String(err) }));
    }
  };

  const handleDeleteCurrentFolder = async () => {
    if (selectedStageFolder === 'Alle' || selectedStageFolder === 'No Game No Life' || selectedStageFolder === 'Eigene Szenen') {
      return;
    }
    const confirmed = await confirmDialog({
      title: translate('confirm.deleteFolderTitle', { name: selectedStageFolder }),
      message: translate('confirm.deleteFolderText'),
      confirmLabel: translate('common.delete'),
      tone: 'danger',
    });
    if (confirmed) {
      try {
        await deleteStageFolder(selectedStageFolder);
        setSelectedStageFolder('Alle');
      } catch (err: any) {
        toast.error(translate('toast.folderDeleteFailed', { error: String(err) }));
      }
    }
  };

  const handleImportJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const targetFolder = selectedStageFolder === 'Alle' ? 'Eigene Szenen' : selectedStageFolder;
      await importStageSceneJson(text, targetFolder);
      toast.success(translate('toast.sceneImported', { folder: targetFolder }));
    } catch (err: any) {
      toast.error(translate('toast.sceneImportFailed', { error: String(err) }));
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleConfirmMove = async (targetFolder: string) => {
    if (!movingScene) return;
    try {
      await moveStageSceneToFolder(movingScene.id, targetFolder);
      setMovingScene(null);
    } catch (err: any) {
      toast.error(translate('toast.sceneMoveFailed', { error: String(err) }));
    }
  };

  // Build folder list with counts
  const allFolders = ['Alle', ...stageFolders.filter((f) => f !== 'Alle')];

  return (
    <>
      <ModalOverlay onClose={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
        <div className="w-full max-w-5xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden my-6 flex flex-col max-h-[88vh]">
          {/* Header */}
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-app/80">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-accent-500/10 border border-accent-500/20 text-accent-400">
                <Compass className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  Soul Stage — Szenen & Ordner
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-900/60 border border-accent-500/30 text-accent-300 font-mono">
                    {stageScenes.length} Abenteuer
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  Wähle ein RPG-Szenario, verwalte deine Szenenordner oder starte No Game No Life
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                accept=".json"
                className="hidden"
                onChange={handleImportJsonFile}
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                title="Szenen-JSON importieren"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition"
              >
                <Upload className="w-3.5 h-3.5 text-accent-400" />
                <span>JSON Importieren</span>
              </button>

              <button
                onClick={() => {
                  onClose();
                  openSoulHubTab('scenes');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold shadow-sm transition"
              >
                <Compass className="w-3.5 h-3.5 text-emerald-400" />
                <span>Im Soul Hub stöbern</span>
              </button>

              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent-600 hover:bg-accent-500 text-white text-xs font-semibold shadow-md shadow-accent-950/40 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Neue Szene</span>
              </button>

              <button
                onClick={onClose}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Folder Pills Bar */}
          <div className="px-4 py-2.5 bg-app/90 border-b border-slate-800/90 flex items-center justify-between gap-2 overflow-x-auto">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1 mr-1 flex-shrink-0">
                <Folder className="w-3.5 h-3.5 text-accent-400" /> Ordner:
              </span>
              {allFolders.map((fName) => {
                const count = scenesInFolder(fName).length;
                const isSelected = selectedStageFolder.toLowerCase() === fName.toLowerCase();
                const isNgnl = fName.toLowerCase() === 'no game no life';

                return (
                  <button
                    key={fName}
                    onClick={() => setSelectedStageFolder(fName)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-medium whitespace-nowrap transition ${
                      isSelected
                        ? isNgnl
                          ? 'bg-amber-600 text-white shadow-sm shadow-amber-900/40'
                          : 'bg-accent-600 text-white shadow-sm shadow-accent-900/40'
                        : isNgnl
                        ? 'bg-amber-950/30 text-amber-300 hover:bg-amber-900/40 border border-amber-500/30'
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                    }`}
                  >
                    <span>{fName}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        isSelected
                          ? 'bg-black/30 text-white font-bold'
                          : 'bg-slate-800 text-slate-400 font-mono'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}

              <button
                onClick={() => setShowNewFolderModal(true)}
                title="Neuen Szenenordner erstellen"
                className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-900/80 hover:bg-accent-900/40 text-accent-300 border border-accent-500/30 text-xs font-semibold transition flex-shrink-0"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>+ Ordner</span>
              </button>
            </div>

            {selectedStageFolder !== 'Alle' &&
              selectedStageFolder !== 'No Game No Life' &&
              selectedStageFolder !== 'Eigene Szenen' && (
                <button
                  onClick={handleDeleteCurrentFolder}
                  title="Aktuellen Ordner löschen"
                  className="px-2 py-1 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-500/30 text-xs flex items-center gap-1 transition flex-shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Ordner löschen</span>
                </button>
              )}
          </div>

          {/* Filters & Search */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 border-b border-slate-800 bg-app/40">
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-app border border-slate-800 text-xs">
              <button
                onClick={() => setFilterType('all')}
                className={`px-3 py-1 rounded-lg font-medium transition ${
                  filterType === 'all'
                    ? 'bg-accent-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Alle Filter ({filteredScenes.length})
              </button>
              <button
                onClick={() => setFilterType('presets')}
                className={`px-3 py-1 rounded-lg font-medium transition ${
                  filterType === 'presets'
                    ? 'bg-accent-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Presets ({filteredScenes.filter((s) => s.is_preset).length})
              </button>
              <button
                onClick={() => setFilterType('custom')}
                className={`px-3 py-1 rounded-lg font-medium transition ${
                  filterType === 'custom'
                    ? 'bg-accent-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Eigene ({filteredScenes.filter((s) => !s.is_preset).length})
              </button>
            </div>

            <div className="relative flex-1 max-w-xs">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Szene, Kapitel oder Ort durchsuchen..."
                className="w-full pl-8 pr-3 py-1.5 bg-app border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-accent-500"
              />
            </div>
          </div>

          {/* Scenes Grid */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredScenes.map((sc) => {
              const isCurrent = currentSceneId === sc.id;
              const hasProgress = sc.has_progress || (sc.turn_count && sc.turn_count > 1);
              const isMenuOpen = activeMenuSceneId === sc.id;

              return (
                <div
                  key={sc.id}
                  onClick={() => handleSceneClick(sc)}
                  className={`group relative flex flex-col justify-between p-4 rounded-2xl border transition-all cursor-pointer ${
                    isCurrent
                      ? 'bg-accent-950/20 border-accent-500/60 shadow-lg shadow-accent-950/30 ring-1 ring-accent-500/40'
                      : 'bg-app/50 border-slate-800/80 hover:bg-slate-800/40 hover:border-slate-700'
                  }`}
                >
                  <div>
                    {/* Top Row: Badges */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-accent-300 font-semibold flex items-center gap-1">
                          <Film className="w-3 h-3" />
                          {sc.is_preset ? 'Offizielles Preset' : 'Eigene Szene'}
                        </span>
                        {sc.folder && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900 border border-accent-900/60 text-amber-300 font-medium flex items-center gap-1">
                            <Folder className="w-2.5 h-2.5" />
                            {sc.folder}
                          </span>
                        )}
                        {sc.gm_tone && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-950/60 border border-accent-500/30 text-accent-300 font-mono">
                            {sc.gm_tone}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {hasProgress && (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-950/70 border border-blue-500/40 text-blue-300 text-[10px] font-semibold">
                            <History className="w-2.5 h-2.5" />
                            {sc.turn_count || 1} Züge
                          </span>
                        )}
                        {isCurrent && (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold">
                            <Check className="w-3 h-3" /> Aktiv
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Title & Description */}
                    <h4 className="text-sm font-bold text-slate-100 group-hover:text-accent-300 transition-colors mb-1">
                      {sc.title}
                    </h4>
                    <p className="text-xs text-slate-400 line-clamp-2 mb-3">
                      {sc.description}
                    </p>

                    {/* Details: Location & Party */}
                    <div className="space-y-1 text-[11px] text-slate-400">
                      {sc.location && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                          <span className="truncate">{sc.location}</span>
                        </div>
                      )}
                      {sc.party && sc.party.length > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                          <span className="truncate">Gruppe: {sc.party.join(', ')}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions footer */}
                  <div className="flex items-center justify-between gap-2 pt-3 mt-3 border-t border-slate-800/80">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSceneClick(sc);
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition ${
                        isCurrent
                          ? 'bg-accent-600/30 text-accent-300 border border-accent-500/40'
                          : 'bg-accent-600 hover:bg-accent-500 text-white'
                      }`}
                    >
                      <Play className="w-3 h-3" />
                      <span>{isCurrent ? 'Aktives Abenteuer' : hasProgress ? 'Fortsetzen / Öffnen' : 'Szene Betreten'}</span>
                    </button>

                    <div className="relative flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMovingScene(sc);
                        }}
                        title="In Ordner verschieben"
                        className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition"
                      >
                        <Layers className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuSceneId(isMenuOpen ? null : sc.id);
                        }}
                        title="Weitere Aktionen"
                        className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>

                      {/* Dropdown Menu */}
                      {isMenuOpen && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 bottom-full mb-2 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1.5 z-30 space-y-1"
                        >
                          <button
                            onClick={(e) => handleExportJson(e, sc.id, sc.title)}
                            className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-slate-300 text-xs transition"
                          >
                            <Download className="w-3.5 h-3.5 text-accent-400" />
                            <span>JSON exportieren</span>
                          </button>

                          <button
                            onClick={(e) => handleExportMarkdown(e, sc.id, sc.title)}
                            className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-slate-300 text-xs transition"
                          >
                            <Download className="w-3.5 h-3.5 text-accent-400" />
                            <span>Markdown exportieren</span>
                          </button>

                          <button
                            onClick={(e) => handleResetScene(e, sc.id)}
                            className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-amber-300 text-xs transition"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                            <span>Auf Anfang zurücksetzen</span>
                          </button>

                          {!sc.is_preset && (
                            <button
                              onClick={(e) => handleDelete(e, sc.id)}
                              className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-950/60 text-rose-300 text-xs transition"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                              <span>Szene löschen</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredScenes.length === 0 && (
              <div className="col-span-full p-12 text-center text-xs text-slate-500 space-y-2">
                <BookOpen className="w-8 h-8 text-slate-600 mx-auto" />
                <p>Keine Rollenspiel-Szenen in diesem Ordner gefunden.</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-3 py-1.5 rounded-xl bg-accent-600 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Neue Szene erstellen
                </button>
              </div>
            )}
          </div>
        </div>
      </ModalOverlay>

      {/* Fortsetzen vs. Neu starten Modal */}
      {sceneToResume && (
        <ModalOverlay onClose={() => setSceneToResume(null)} className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="w-full max-w-md bg-slate-900 border border-accent-500/50 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-accent-600/20 text-accent-400">
                <History className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-100">{sceneToResume.title}</h4>
                <p className="text-xs text-slate-400">
                  Gespeicherter Fortschritt ({sceneToResume.turn_count || 1} Züge vorhanden)
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Möchtest du dieses Abenteuer an der zuletzt gespielten Stelle <strong>fortsetzen</strong> oder von vorne <strong>neu starten</strong>? Ein automatisches Backup deiner bisherigen Züge wird immer aufbewahrt.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setSceneToResume(null)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
              >
                Abbrechen
              </button>

              <button
                onClick={handleRestartConfirmed}
                className="px-3 py-1.5 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span>Neu starten</span>
              </button>

              <button
                onClick={handleResumeConfirmed}
                className="px-4 py-1.5 rounded-xl bg-accent-600 hover:bg-accent-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-accent-950/40 transition"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Fortsetzen</span>
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Neuer Ordner Dialog */}
      {showNewFolderModal && (
        <ModalOverlay onClose={() => setShowNewFolderModal(false)} className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-accent-400" />
              <h4 className="text-sm font-bold text-slate-100">Neuen Szenenordner erstellen</h4>
            </div>

            <input
              type="text"
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
              placeholder="z.B. No Game No Life, Fantasy Kampagne..."
              className="w-full px-3 py-2 bg-app border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-accent-500"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setShowNewFolderModal(false);
                  setNewFolderName('');
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
              >
                Abbrechen
              </button>
              <button
                onClick={handleCreateFolder}
                className="px-3.5 py-1.5 rounded-xl bg-accent-600 hover:bg-accent-500 text-white text-xs font-semibold transition"
              >
                Ordner anlegen
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* In Ordner verschieben Dialog */}
      {movingScene && (
        <ModalOverlay onClose={() => setMovingScene(null)} className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-accent-400" />
              <div>
                <h4 className="text-sm font-bold text-slate-100">In Ordner verschieben</h4>
                <p className="text-[11px] text-slate-400 line-clamp-1">{movingScene.title}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300">Wähle den Zielordner für dieses Abenteuer:</p>

            <div className="max-h-48 overflow-y-auto space-y-1.5">
              {stageFolders.filter((f) => f !== 'Alle').map((f) => (
                <button
                  key={f}
                  onClick={() => handleConfirmMove(f)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between border transition ${
                    (movingScene.folder || 'Eigene Szenen').toLowerCase() === f.toLowerCase()
                      ? 'bg-accent-950/40 border-accent-500/50 text-accent-300 font-semibold'
                      : 'bg-app hover:bg-slate-800/80 border-slate-800 text-slate-200'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Folder className="w-3.5 h-3.5 text-accent-400" />
                    <span>{f}</span>
                  </span>
                  {(movingScene.folder || 'Eigene Szenen').toLowerCase() === f.toLowerCase() && (
                    <Check className="w-3.5 h-3.5 text-accent-400" />
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setMovingScene(null)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Creation Modal */}
      <SceneCreateModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={(newDef) => {
          fetchStageScenes();
          loadStageScene(newDef.id);
          onClose();
        }}
      />
    </>
  );
};
