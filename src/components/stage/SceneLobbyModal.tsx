import React, { useEffect, useState } from 'react';
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
} from 'lucide-react';

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
    stageState,
    loadStageScene,
    deleteStageScene,
    exportStageMarkdown,
  } = useAppStore();

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'presets' | 'custom'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchStageScenes();
    }
  }, [isOpen, fetchStageScenes]);

  if (!isOpen) return null;

  const currentSceneId = stageState?.definition.id;

  const filteredScenes = stageScenes.filter((sc) => {
    const matchesSearch =
      sc.title.toLowerCase().includes(search.toLowerCase()) ||
      sc.description.toLowerCase().includes(search.toLowerCase()) ||
      sc.location.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;
    if (filterType === 'presets') return sc.is_preset;
    if (filterType === 'custom') return !sc.is_preset;
    return true;
  });

  const handleLoadScene = async (scene: ScenePreview) => {
    try {
      await loadStageScene(scene.id);
      onClose();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (e: React.MouseEvent, sceneId: string) => {
    e.stopPropagation();
    if (confirm('Möchtest du diese eigene Szene wirklich löschen?')) {
      await deleteStageScene(sceneId);
    }
  };

  const handleExport = async (e: React.MouseEvent, sceneId: string, title: string) => {
    e.stopPropagation();
    const md = await exportStageMarkdown(sceneId);
    if (md) {
      // Trigger download
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title.toLowerCase().replace(/\s+/g, '_')}_abenteuer.md`;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
        <div className="w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden my-6 flex flex-col max-h-[85vh]">
          {/* Header */}
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-slate-950/70">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                <Compass className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  Szenen-Bibliothek (Soul Stage)
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-900/60 border border-purple-500/30 text-purple-300 font-mono">
                    {stageScenes.length} Abenteuer
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  Wähle ein vorgefertigtes RPG-Szenario oder starte dein eigenes Abenteuer
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md shadow-purple-950/40 transition"
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

          {/* Filters & Search */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-800 bg-slate-950/30">
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs">
              <button
                onClick={() => setFilterType('all')}
                className={`px-3 py-1 rounded-lg font-medium transition ${
                  filterType === 'all'
                    ? 'bg-purple-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Alle ({stageScenes.length})
              </button>
              <button
                onClick={() => setFilterType('presets')}
                className={`px-3 py-1 rounded-lg font-medium transition ${
                  filterType === 'presets'
                    ? 'bg-purple-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Presets ({stageScenes.filter((s) => s.is_preset).length})
              </button>
              <button
                onClick={() => setFilterType('custom')}
                className={`px-3 py-1 rounded-lg font-medium transition ${
                  filterType === 'custom'
                    ? 'bg-purple-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Eigene Szenen ({stageScenes.filter((s) => !s.is_preset).length})
              </button>
            </div>

            <div className="relative flex-1 max-w-xs">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Szene oder Ort durchsuchen..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {/* Scenes Grid */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredScenes.map((sc) => {
              const isCurrent = currentSceneId === sc.id;

              return (
                <div
                  key={sc.id}
                  onClick={() => handleLoadScene(sc)}
                  className={`group relative flex flex-col justify-between p-4 rounded-2xl border transition-all cursor-pointer ${
                    isCurrent
                      ? 'bg-purple-950/20 border-purple-500/60 shadow-lg shadow-purple-950/30 ring-1 ring-purple-500/40'
                      : 'bg-slate-950/50 border-slate-800/80 hover:bg-slate-800/40 hover:border-slate-700'
                  }`}
                >
                  <div>
                    {/* Top Row: Badges */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-purple-300 font-semibold flex items-center gap-1">
                          <Film className="w-3 h-3" />
                          {sc.is_preset ? 'Offizielles Preset' : 'Eigene Szene'}
                        </span>
                        {sc.gm_tone && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-950/60 border border-purple-500/30 text-purple-300 font-mono">
                            {sc.gm_tone}
                          </span>
                        )}
                      </div>

                      {isCurrent && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold">
                          <Check className="w-3 h-3" /> Aktiv
                        </span>
                      )}
                    </div>

                    {/* Title & Description */}
                    <h4 className="text-sm font-bold text-slate-100 group-hover:text-purple-300 transition-colors mb-1">
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
                      onClick={() => handleLoadScene(sc)}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition ${
                        isCurrent
                          ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40'
                          : 'bg-purple-600 hover:bg-purple-500 text-white'
                      }`}
                    >
                      <Play className="w-3 h-3" />
                      <span>{isCurrent ? 'Aktives Abenteuer' : 'Szene Betreten'}</span>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => handleExport(e, sc.id, sc.title)}
                        title="Als Markdown-Protokoll exportieren"
                        className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>

                      {!sc.is_preset && (
                        <button
                          onClick={(e) => handleDelete(e, sc.id)}
                          title="Szene löschen"
                          className="p-1.5 rounded-lg bg-rose-950/30 hover:bg-rose-950/60 text-rose-400 border border-rose-500/30 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredScenes.length === 0 && (
              <div className="col-span-full p-12 text-center text-xs text-slate-500 space-y-2">
                <BookOpen className="w-8 h-8 text-slate-600 mx-auto" />
                <p>Keine Rollenspiel-Szenen gefunden.</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-3 py-1.5 rounded-xl bg-purple-600 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Neue Szene erstellen
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

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
