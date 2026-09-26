import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../services/api';
import {
  GatewayCharacterEntry,
  GatewayLorebookEntry,
  GatewaySceneEntry,
  ChubSearchItem,
  ChubCharacterDetail,
} from '../../types';
import {
  Compass,
  Globe,
  Users,
  BookOpen,
  Dice5,
  Search,
  Download,
  ExternalLink,
  Sparkles,
  Flame,
  Star,
  Clock,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Link as LinkIcon,
  X,
  MessageSquare,
  RotateCcw,
} from 'lucide-react';

const HUB_TAGS = [
  { id: '', label: 'Alle Tags' },
  { id: 'anime', label: 'Anime' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'romance', label: 'Romance' },
  { id: 'adventure', label: 'Adventure' },
  { id: 'sci-fi', label: 'Sci-Fi' },
  { id: 'cyberpunk', label: 'Cyberpunk' },
  { id: 'wholesome', label: 'Wholesome' },
  { id: 'slice of life', label: 'Slice of Life' },
  { id: 'supernatural', label: 'Supernatural' },
  { id: 'yandere', label: 'Yandere' },
  { id: 'tsundere', label: 'Tsundere' },
  { id: 'comedy', label: 'Comedy' },
  { id: 'rpg', label: 'RPG' },
  { id: 'female', label: 'Female' },
  { id: 'male', label: 'Male' },
];

export const SoulHubView = () => {
  const {
    hubSubTab,
    setHubSubTab,
    setActiveTab,
    refreshCharacters,
    refreshLorebooks,
    fetchStageScenes,
    selectCharacter,
    loadStageScene,
  } = useAppStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusNotice, setStatusNotice] = useState<{
    text: string;
    type: 'success' | 'error' | 'info';
    actionText?: string;
    onAction?: () => void;
  } | null>(null);

  // --- Subtab 1: Soul Gateway ---
  const [gatewayCharacters, setGatewayCharacters] = useState<GatewayCharacterEntry[]>([]);
  const [isGatewayLoading, setIsGatewayLoading] = useState(false);
  const [gatewayError, setGatewayError] = useState<string | null>(null);

  // --- Subtab 2: Chub AI ---
  const [chubItems, setChubItems] = useState<ChubSearchItem[]>([]);
  const [chubPage, setChubPage] = useState(1);
  const [chubHasMore, setChubHasMore] = useState(false);
  const [chubSort, setChubSort] = useState<'trending' | 'popular' | 'favorites' | 'recent'>('trending');
  const [chubTag, setChubTag] = useState('');
  const [chubNsfw, setChubNsfw] = useState(false);
  const [isChubLoading, setIsChubLoading] = useState(false);
  const [chubError, setChubError] = useState<string | null>(null);

  // --- Subtab 3: Welt-Lorebooks ---
  const [gatewayLorebooks, setGatewayLorebooks] = useState<GatewayLorebookEntry[]>([]);
  const [isLorebooksLoading, setIsLorebooksLoading] = useState(false);
  const [lorebooksError, setLorebooksError] = useState<string | null>(null);

  // --- Subtab 4: Soul-Stage-Szenarien ---
  const [gatewayScenes, setGatewayScenes] = useState<GatewaySceneEntry[]>([]);
  const [isScenesLoading, setIsScenesLoading] = useState(false);
  const [scenesError, setScenesError] = useState<string | null>(null);

  // --- Active Importing States ---
  const [importingId, setImportingId] = useState<string | null>(null);

  // --- Modals ---
  const [selectedChubDetail, setSelectedChubDetail] = useState<{
    item: ChubSearchItem;
    detail: ChubCharacterDetail | null;
    isLoading: boolean;
  } | null>(null);

  const [isUrlModalOpen, setIsUrlModalOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [isUrlImporting, setIsUrlImporting] = useState(false);

  // Load Soul Gateway Registry
  const loadSoulGateway = async () => {
    setIsGatewayLoading(true);
    setGatewayError(null);
    try {
      const list = await api.fetchSoulGatewayRegistry();
      setGatewayCharacters(list);
    } catch (e) {
      console.error('Failed to load Soul Gateway registry:', e);
      setGatewayError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsGatewayLoading(false);
    }
  };

  // Load Chub AI Characters
  const loadChubCharacters = async (page: number = 1, append: boolean = false) => {
    setIsChubLoading(true);
    setChubError(null);
    try {
      const topics = chubTag ? [chubTag] : undefined;
      const res = await api.searchChubCharacters(searchQuery, page, 24, chubSort, topics, chubNsfw);
      if (append) {
        setChubItems((prev) => [...prev, ...res.items]);
      } else {
        setChubItems(res.items);
      }
      setChubPage(page);
      setChubHasMore(res.has_more);
    } catch (e) {
      console.error('Failed to search Chub AI:', e);
      setChubError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsChubLoading(false);
    }
  };

  // Load World Lorebooks Registry
  const loadLorebooks = async () => {
    setIsLorebooksLoading(true);
    setLorebooksError(null);
    try {
      const list = await api.fetchLorebooksGatewayRegistry();
      setGatewayLorebooks(list);
    } catch (e) {
      console.error('Failed to load Lorebooks registry:', e);
      setLorebooksError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLorebooksLoading(false);
    }
  };

  // Load Stage Scenarios Registry
  const loadScenes = async () => {
    setIsScenesLoading(true);
    setScenesError(null);
    try {
      const list = await api.fetchStagesGatewayRegistry();
      setGatewayScenes(list);
    } catch (e) {
      console.error('Failed to load Stage registry:', e);
      setScenesError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsScenesLoading(false);
    }
  };

  // Tab activation effect
  useEffect(() => {
    if (hubSubTab === 'soul_gateway' && gatewayCharacters.length === 0) {
      loadSoulGateway();
    } else if (hubSubTab === 'chub_ai' && chubItems.length === 0) {
      loadChubCharacters(1, false);
    } else if (hubSubTab === 'lorebooks' && gatewayLorebooks.length === 0) {
      loadLorebooks();
    } else if (hubSubTab === 'scenes' && gatewayScenes.length === 0) {
      loadScenes();
    }
  }, [hubSubTab]);

  // Trigger Chub reload on filter changes
  useEffect(() => {
    if (hubSubTab === 'chub_ai') {
      const timer = setTimeout(() => {
        loadChubCharacters(1, false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [chubSort, chubTag, chubNsfw, searchQuery]);

  // Handlers for Imports
  const handleImportSoulGateway = async (char: GatewayCharacterEntry) => {
    setImportingId(char.name);
    try {
      const res = await api.importSoulGatewayCharacter(char.name, char.author, char.download_url);
      await refreshCharacters();
      if (res.imported_lorebook) {
        await refreshLorebooks();
      }

      setStatusNotice({
        type: 'success',
        text: `"${res.profile.card.data.name}" wurde importiert!${
          res.imported_lorebook ? ` Eingebettetes Lorebook "${res.imported_lorebook}" verknüpft.` : ''
        }`,
        actionText: 'Im Chat öffnen',
        onAction: async () => {
          await selectCharacter(res.profile);
          setActiveTab('chat');
        },
      });
    } catch (e) {
      console.error('Soul Gateway import failed:', e);
      setStatusNotice({
        type: 'error',
        text: `Import fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setImportingId(null);
    }
  };

  const handleOpenChubDetail = async (item: ChubSearchItem) => {
    setSelectedChubDetail({
      item,
      detail: null,
      isLoading: true,
    });
    try {
      const detail = await api.getChubCharacterDetails(item.full_path);
      setSelectedChubDetail({
        item,
        detail,
        isLoading: false,
      });
    } catch (e) {
      console.error('Failed to load Chub character details:', e);
      setSelectedChubDetail((prev) => (prev ? { ...prev, isLoading: false } : null));
    }
  };

  const handleImportChub = async (fullPath: string) => {
    setImportingId(fullPath);
    try {
      const res = await api.importChubCharacter(fullPath);
      await refreshCharacters();
      if (res.imported_lorebook) {
        await refreshLorebooks();
      }

      setSelectedChubDetail(null);
      setStatusNotice({
        type: 'success',
        text: `"${res.profile.card.data.name}" erfolgreich aus Chub AI importiert!${
          res.imported_lorebook ? ` Eingebettetes Lorebook "${res.imported_lorebook}" wurde integriert.` : ''
        }`,
        actionText: 'Jetzt chatten',
        onAction: async () => {
          await selectCharacter(res.profile);
          setActiveTab('chat');
        },
      });
    } catch (e) {
      console.error('Chub AI import failed:', e);
      setStatusNotice({
        type: 'error',
        text: `Chub AI Import fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setImportingId(null);
    }
  };

  const handleImportUrl = async () => {
    if (!urlInput.trim()) return;
    setIsUrlImporting(true);
    try {
      const res = await api.importCharacterFromUrl(urlInput.trim());
      await refreshCharacters();
      if (res.imported_lorebook) {
        await refreshLorebooks();
      }
      setIsUrlModalOpen(false);
      setUrlInput('');
      setStatusNotice({
        type: 'success',
        text: `Charakter "${res.profile.card.data.name}" wurde importiert!${
          res.imported_lorebook ? ` Lorebook "${res.imported_lorebook}" verknüpft.` : ''
        }`,
        actionText: 'Im Chat öffnen',
        onAction: async () => {
          await selectCharacter(res.profile);
          setActiveTab('chat');
        },
      });
    } catch (e) {
      console.error('URL import failed:', e);
      setStatusNotice({
        type: 'error',
        text: `Import fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setIsUrlImporting(false);
    }
  };

  const handleImportLorebook = async (lb: GatewayLorebookEntry) => {
    setImportingId(lb.name);
    try {
      const res = await api.importLorebookFromGateway(lb.download_url, lb.name);
      await refreshLorebooks();
      setStatusNotice({
        type: 'success',
        text: `Welt-Lorebook "${res.name}" mit ${res.entries.length} Einträgen importiert!`,
        actionText: 'In Lorebooks ansehen',
        onAction: () => setActiveTab('lorebooks'),
      });
    } catch (e) {
      console.error('Lorebook import failed:', e);
      setStatusNotice({
        type: 'error',
        text: `Lorebook-Import fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setImportingId(null);
    }
  };

  const handleImportScene = async (scene: GatewaySceneEntry) => {
    setImportingId(scene.title);
    try {
      const res = await api.importSceneFromGateway(scene.download_url, scene.title);
      await fetchStageScenes();
      setStatusNotice({
        type: 'success',
        text: `Soul-Stage-Szenario "${res.definition.title}" wurde hinzugefügt!`,
        actionText: 'In Soul Stage starten',
        onAction: async () => {
          await loadStageScene(res.definition.id);
          setActiveTab('stage');
        },
      });
    } catch (e) {
      console.error('Scene import failed:', e);
      setStatusNotice({
        type: 'error',
        text: `Szenario-Import fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setImportingId(null);
    }
  };

  // Filtered entries for local filtering tabs
  const filteredGatewayCharacters = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return gatewayCharacters;
    return gatewayCharacters.filter(
      (c) => c.name.toLowerCase().includes(q) || c.author.toLowerCase().includes(q)
    );
  }, [gatewayCharacters, searchQuery]);

  const filteredLorebooks = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return gatewayLorebooks;
    return gatewayLorebooks.filter(
      (lb) =>
        lb.name.toLowerCase().includes(q) ||
        lb.description.toLowerCase().includes(q) ||
        lb.author.toLowerCase().includes(q)
    );
  }, [gatewayLorebooks, searchQuery]);

  const filteredScenes = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return gatewayScenes;
    return gatewayScenes.filter(
      (sc) =>
        sc.title.toLowerCase().includes(q) ||
        sc.description.toLowerCase().includes(q) ||
        sc.author.toLowerCase().includes(q) ||
        sc.starting_location.toLowerCase().includes(q)
    );
  }, [gatewayScenes, searchQuery]);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden select-none">
      {/* Top Banner Notice */}
      {statusNotice && (
        <div
          className={`px-6 py-2.5 flex items-center justify-between text-xs font-medium border-b animate-in fade-in slide-in-from-top-1 ${
            statusNotice.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-800/60 text-emerald-300'
              : statusNotice.type === 'error'
              ? 'bg-rose-950/70 border-rose-800/60 text-rose-300'
              : 'bg-indigo-950/70 border-indigo-800/60 text-indigo-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusNotice.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            {statusNotice.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400" />}
            {statusNotice.type === 'info' && <Sparkles className="w-4 h-4 text-indigo-400" />}
            <span>{statusNotice.text}</span>
          </div>
          <div className="flex items-center gap-3">
            {statusNotice.onAction && statusNotice.actionText && (
              <button
                onClick={statusNotice.onAction}
                className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-white font-semibold transition-colors"
              >
                {statusNotice.actionText} →
              </button>
            )}
            <button
              onClick={() => setStatusNotice(null)}
              className="text-slate-400 hover:text-slate-200 transition-colors p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Header */}
      <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/60 backdrop-blur flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shadow-sm">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-100">Soul Hub</h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono">
                Gateway & Community
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Kuratierte Waifus, Chub AI Kartenarchiv, Welt-Lorebooks & Soul-Stage-Szenarien.
            </p>
          </div>
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-3">
          <div className="relative w-64 md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={
                hubSubTab === 'chub_ai'
                  ? 'Chub AI durchsuchen...'
                  : hubSubTab === 'soul_gateway'
                  ? 'Kuratierte Waifus filtern...'
                  : hubSubTab === 'lorebooks'
                  ? 'Lorebooks suchen...'
                  : 'Szenarien suchen...'
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500/50 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={() => setIsUrlModalOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 border border-slate-700 transition-colors shadow-sm"
            title="Direkten Chub AI Link oder PNG-URL importieren"
          >
            <LinkIcon className="w-3.5 h-3.5 text-cyan-400" />
            <span>URL importieren</span>
          </button>

          <button
            onClick={() => {
              if (hubSubTab === 'soul_gateway') loadSoulGateway();
              else if (hubSubTab === 'chub_ai') loadChubCharacters(1, false);
              else if (hubSubTab === 'lorebooks') loadLorebooks();
              else if (hubSubTab === 'scenes') loadScenes();
            }}
            title="Neu laden"
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="px-6 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
        <div className="flex items-center gap-1 -mb-px">
          <button
            onClick={() => setHubSubTab('soul_gateway')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all ${
              hubSubTab === 'soul_gateway'
                ? 'border-purple-500 text-purple-300'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>Soul Gateway</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-slate-400 font-mono">
              {gatewayCharacters.length > 0 ? gatewayCharacters.length : '✦'}
            </span>
          </button>

          <button
            onClick={() => setHubSubTab('chub_ai')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all ${
              hubSubTab === 'chub_ai'
                ? 'border-purple-500 text-purple-300'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            <span>Chub AI</span>
            <span className="px-1.5 py-0.2 rounded-full bg-cyan-950/60 text-cyan-400 border border-cyan-800/40 text-[10px] font-mono">
              Online
            </span>
          </button>

          <button
            onClick={() => setHubSubTab('lorebooks')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all ${
              hubSubTab === 'lorebooks'
                ? 'border-purple-500 text-purple-300'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
            <span>Welt-Lorebooks</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-slate-400 font-mono">
              {gatewayLorebooks.length > 0 ? gatewayLorebooks.length : '✦'}
            </span>
          </button>

          <button
            onClick={() => setHubSubTab('scenes')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all ${
              hubSubTab === 'scenes'
                ? 'border-purple-500 text-purple-300'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <Dice5 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Soul-Stage-Szenarien</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-slate-400 font-mono">
              {gatewayScenes.length > 0 ? gatewayScenes.length : '✦'}
            </span>
          </button>
        </div>

        {/* Chub AI Controls (Sort, Tag & NSFW Toggle) */}
        {hubSubTab === 'chub_ai' && (
          <div className="flex items-center gap-3 py-2">
            {/* Sort Buttons */}
            <div className="flex items-center gap-1 bg-slate-950/70 p-1 rounded-xl border border-slate-800 text-[11px]">
              <button
                onClick={() => setChubSort('trending')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors ${
                  chubSort === 'trending'
                    ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Flame className="w-3 h-3 text-amber-400" />
                <span>Trending</span>
              </button>
              <button
                onClick={() => setChubSort('popular')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors ${
                  chubSort === 'popular'
                    ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Download className="w-3 h-3 text-cyan-400" />
                <span>Beliebt</span>
              </button>
              <button
                onClick={() => setChubSort('favorites')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors ${
                  chubSort === 'favorites'
                    ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Star className="w-3 h-3 text-yellow-400" />
                <span>Favoriten</span>
              </button>
              <button
                onClick={() => setChubSort('recent')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors ${
                  chubSort === 'recent'
                    ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Clock className="w-3 h-3 text-emerald-400" />
                <span>Neueste</span>
              </button>
            </div>

            {/* Tag Selector */}
            <select
              value={chubTag}
              onChange={(e) => setChubTag(e.target.value)}
              className="bg-slate-950/80 border border-slate-800 rounded-xl px-2.5 py-1 text-xs text-slate-300 focus:outline-none focus:border-purple-500"
            >
              {HUB_TAGS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>

            {/* NSFW Toggle */}
            <label className="flex items-center gap-1.5 cursor-pointer bg-slate-950/80 px-2.5 py-1 rounded-xl border border-slate-800 text-xs">
              <input
                type="checkbox"
                checked={chubNsfw}
                onChange={(e) => setChubNsfw(e.target.checked)}
                className="rounded border-slate-700 text-rose-500 focus:ring-0 focus:ring-offset-0 bg-slate-900"
              />
              <span className={`text-[11px] font-medium ${chubNsfw ? 'text-rose-400 font-bold' : 'text-slate-400'}`}>
                NSFW
              </span>
            </label>
          </div>
        )}
      </div>

      {/* Main Tab Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* ========================================================================= */}
        {/* TAB 1: SOUL GATEWAY */}
        {/* ========================================================================= */}
        {hubSubTab === 'soul_gateway' && (
          <div>
            {isGatewayLoading ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
                <p className="text-sm">Kuratierte Soul Gateway Karten werden geladen…</p>
              </div>
            ) : gatewayError ? (
              <div className="flex flex-col items-center justify-center py-20 text-rose-300 gap-3">
                <AlertCircle className="w-8 h-8 text-rose-400" />
                <p className="text-sm">Fehler beim Laden: {gatewayError}</p>
                <button
                  onClick={loadSoulGateway}
                  className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700"
                >
                  Erneut versuchen
                </button>
              </div>
            ) : filteredGatewayCharacters.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-2">
                <Users className="w-8 h-8" />
                <p className="text-sm">Keine Charaktere für diese Suche gefunden.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {filteredGatewayCharacters.map((char) => (
                  <div
                    key={char.name}
                    className="group relative rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-purple-500/50 transition-all p-3 flex flex-col justify-between overflow-hidden shadow-sm hover:shadow-purple-950/20"
                  >
                    <div>
                      {/* Avatar preview */}
                      <div className="aspect-[3/4] w-full rounded-xl bg-slate-950 overflow-hidden relative mb-2.5 border border-slate-800">
                        <img
                          src={char.download_url}
                          alt={char.name}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur text-[10px] text-purple-300 font-mono border border-white/10">
                          {char.author}
                        </div>
                      </div>

                      <h3 className="font-bold text-xs text-slate-100 truncate" title={char.name}>
                        {char.name}
                      </h3>
                      <p className="text-[11px] text-slate-400 truncate">
                        Ersteller: <span className="text-purple-300">{char.author}</span>
                      </p>
                    </div>

                    <button
                      onClick={() => handleImportSoulGateway(char)}
                      disabled={importingId === char.name}
                      className="mt-3 w-full py-1.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-purple-900/50 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                    >
                      {importingId === char.name ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Importiere…</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5" />
                          <span>Importieren</span>
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: CHUB AI */}
        {/* ========================================================================= */}
        {hubSubTab === 'chub_ai' && (
          <div>
            {isChubLoading && chubItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                <p className="text-sm">Chub AI Charakterbibliothek wird geladen…</p>
              </div>
            ) : chubError && chubItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-rose-300 gap-3">
                <AlertCircle className="w-8 h-8 text-rose-400" />
                <p className="text-sm">Fehler beim Laden von Chub AI: {chubError}</p>
                <button
                  onClick={() => loadChubCharacters(1, false)}
                  className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700"
                >
                  Erneut versuchen
                </button>
              </div>
            ) : chubItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-2">
                <Globe className="w-8 h-8" />
                <p className="text-sm">Keine Charaktere gefunden.</p>
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {chubItems.map((item) => (
                    <div
                      key={item.full_path}
                      onClick={() => handleOpenChubDetail(item)}
                      className="group cursor-pointer rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-cyan-500/50 transition-all p-3 flex flex-col justify-between overflow-hidden shadow-sm hover:shadow-cyan-950/20"
                    >
                      <div>
                        {/* Avatar */}
                        <div className="aspect-[3/4] w-full rounded-xl bg-slate-950 overflow-hidden relative mb-2.5 border border-slate-800">
                          {item.avatar_url ? (
                            <img
                              src={item.avatar_url}
                              alt={item.name}
                              loading="lazy"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-600">
                              <Users className="w-8 h-8" />
                            </div>
                          )}

                          {/* Tokens & Stars badges */}
                          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] text-white/90">
                            {item.star_count > 0 && (
                              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur font-mono border border-white/10">
                                <Star className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />
                                {item.star_count}
                              </span>
                            )}
                            {item.n_tokens > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-black/60 backdrop-blur font-mono border border-white/10 ml-auto">
                                {Math.round(item.n_tokens / 100) / 10}k tok
                              </span>
                            )}
                          </div>

                          {item.nsfw_image && (
                            <div className="absolute top-2 left-2 px-1 py-0.5 rounded bg-rose-600/80 text-[9px] text-white font-bold uppercase tracking-wider">
                              NSFW
                            </div>
                          )}
                        </div>

                        <h3 className="font-bold text-xs text-slate-100 truncate group-hover:text-cyan-300 transition-colors" title={item.name}>
                          {item.name}
                        </h3>
                        <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">
                          {item.tagline || item.description || 'Keine Beschreibung verfügbar.'}
                        </p>
                      </div>

                      <div className="mt-3 flex items-center gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleImportChub(item.full_path);
                          }}
                          disabled={importingId === item.full_path}
                          className="flex-1 py-1 px-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-900/50 text-slate-950 font-bold text-[11px] flex items-center justify-center gap-1 transition-colors shadow-sm"
                        >
                          {importingId === item.full_path ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Importiere…</span>
                            </>
                          ) : (
                            <>
                              <Download className="w-3 h-3" />
                              <span>Import</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenChubDetail(item);
                          }}
                          className="p-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                          title="Details ansehen"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination / Load More */}
                {chubHasMore && (
                  <div className="mt-8 flex justify-center">
                    <button
                      onClick={() => loadChubCharacters(chubPage + 1, true)}
                      disabled={isChubLoading}
                      className="px-6 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 text-slate-200 text-xs font-semibold flex items-center gap-2 border border-slate-700 transition-colors shadow-sm"
                    >
                      {isChubLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                          <span>Lade weitere Karten…</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4 text-cyan-400" />
                          <span>Mehr Karten laden (Seite {chubPage + 1})</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: WELT-LOREBOOKS */}
        {/* ========================================================================= */}
        {hubSubTab === 'lorebooks' && (
          <div>
            {isLorebooksLoading ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
                <p className="text-sm">Welt-Lorebooks werden geladen…</p>
              </div>
            ) : lorebooksError ? (
              <div className="flex flex-col items-center justify-center py-20 text-rose-300 gap-3">
                <AlertCircle className="w-8 h-8 text-rose-400" />
                <p className="text-sm">Fehler beim Laden: {lorebooksError}</p>
                <button
                  onClick={loadLorebooks}
                  className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700"
                >
                  Erneut versuchen
                </button>
              </div>
            ) : filteredLorebooks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-2">
                <BookOpen className="w-8 h-8" />
                <p className="text-sm">Keine Welt-Lorebooks gefunden.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredLorebooks.map((lb) => (
                  <div
                    key={lb.name}
                    className="group rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-amber-500/50 transition-all p-5 flex flex-col justify-between shadow-sm"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                            <BookOpen className="w-4 h-4" />
                          </div>
                          <h3 className="font-bold text-sm text-slate-100 group-hover:text-amber-300 transition-colors">
                            {lb.name}
                          </h3>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-medium shrink-0">
                          {lb.entry_count} Einträge
                        </span>
                      </div>

                      <p className="text-xs text-slate-400 leading-relaxed mb-3">
                        {lb.description || 'Keine Beschreibung verfügbar.'}
                      </p>

                      <div className="text-[11px] text-slate-500">
                        Autor: <span className="text-slate-300">{lb.author}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleImportLorebook(lb)}
                      disabled={importingId === lb.name}
                      className="mt-4 w-full py-2 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:bg-amber-900/50 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm"
                    >
                      {importingId === lb.name ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Importiere Lorebook…</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5" />
                          <span>Lorebook importieren</span>
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: SOUL-STAGE-SZENARIEN */}
        {/* ========================================================================= */}
        {hubSubTab === 'scenes' && (
          <div>
            {isScenesLoading ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                <p className="text-sm">Soul-Stage-Szenarien werden geladen…</p>
              </div>
            ) : scenesError ? (
              <div className="flex flex-col items-center justify-center py-20 text-rose-300 gap-3">
                <AlertCircle className="w-8 h-8 text-rose-400" />
                <p className="text-sm">Fehler beim Laden: {scenesError}</p>
                <button
                  onClick={loadScenes}
                  className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700"
                >
                  Erneut versuchen
                </button>
              </div>
            ) : filteredScenes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-2">
                <Dice5 className="w-8 h-8" />
                <p className="text-sm">Keine Szenarien gefunden.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredScenes.map((scene) => (
                  <div
                    key={scene.title}
                    className="group rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-emerald-500/50 transition-all p-5 flex flex-col justify-between shadow-sm"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                            <Dice5 className="w-4 h-4" />
                          </div>
                          <h3 className="font-bold text-sm text-slate-100 group-hover:text-emerald-300 transition-colors">
                            {scene.title}
                          </h3>
                        </div>
                      </div>

                      <p className="text-xs text-slate-400 leading-relaxed mb-3">
                        {scene.description || 'Keine Beschreibung verfügbar.'}
                      </p>

                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>
                          Start: <span className="text-slate-300">{scene.starting_location}</span>
                        </span>
                        <span>
                          Autor: <span className="text-slate-300">{scene.author}</span>
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleImportScene(scene)}
                      disabled={importingId === scene.title}
                      className="mt-4 w-full py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-900/50 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm"
                    >
                      {importingId === scene.title ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Importiere Szenario…</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5" />
                          <span>Szenario importieren</span>
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL: CHUB AI DETAIL & INSPECTION */}
      {/* ========================================================================= */}
      {selectedChubDetail && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[85vh] rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Globe className="w-5 h-5 text-cyan-400" />
                <h2 className="font-bold text-base text-slate-100">
                  {selectedChubDetail.item.name}
                </h2>
              </div>
              <button
                onClick={() => setSelectedChubDetail(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              <div className="flex flex-col sm:flex-row gap-5">
                {/* Avatar */}
                <div className="w-36 h-48 shrink-0 rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden relative">
                  {selectedChubDetail.item.avatar_url ? (
                    <img
                      src={selectedChubDetail.item.avatar_url}
                      alt={selectedChubDetail.item.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-600">
                      <Users className="w-10 h-10" />
                    </div>
                  )}
                </div>

                {/* Summary Info */}
                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono text-[10px]">
                      {selectedChubDetail.item.full_path.split('/')[0]}
                    </span>
                    {selectedChubDetail.item.star_count > 0 && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 text-[10px]">
                        <Star className="w-3 h-3 fill-yellow-400" />
                        {selectedChubDetail.item.star_count} Sterne
                      </span>
                    )}
                    {selectedChubDetail.item.n_tokens > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono">
                        {selectedChubDetail.item.n_tokens} Tokens
                      </span>
                    )}
                    {selectedChubDetail.detail?.has_embedded_lorebook && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px]">
                        <BookOpen className="w-3 h-3" />
                        Eingebettetes Lorebook
                      </span>
                    )}
                  </div>

                  <p className="text-slate-300 italic">
                    {selectedChubDetail.detail?.tagline || selectedChubDetail.item.tagline || ''}
                  </p>

                  <div className="text-slate-400 leading-relaxed">
                    {selectedChubDetail.item.description}
                  </div>
                </div>
              </div>

              {/* Detailed Attributes */}
              {selectedChubDetail.isLoading ? (
                <div className="py-8 flex items-center justify-center gap-2 text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>Vollständige Kartendetails werden geladen…</span>
                </div>
              ) : selectedChubDetail.detail ? (
                <div className="space-y-4 pt-2">
                  {selectedChubDetail.detail.first_message && (
                    <div className="rounded-xl bg-slate-950/70 border border-slate-800/80 p-3 space-y-1">
                      <div className="font-semibold text-slate-300 flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
                        Erste Nachricht (Greeting):
                      </div>
                      <p className="text-slate-400 whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto">
                        {selectedChubDetail.detail.first_message}
                      </p>
                    </div>
                  )}

                  {selectedChubDetail.detail.personality && (
                    <div className="rounded-xl bg-slate-950/70 border border-slate-800/80 p-3 space-y-1">
                      <div className="font-semibold text-slate-300">Persönlichkeit:</div>
                      <p className="text-slate-400 whitespace-pre-wrap leading-relaxed max-h-28 overflow-y-auto">
                        {selectedChubDetail.detail.personality}
                      </p>
                    </div>
                  )}

                  {selectedChubDetail.detail.scenario && (
                    <div className="rounded-xl bg-slate-950/70 border border-slate-800/80 p-3 space-y-1">
                      <div className="font-semibold text-slate-300">Szenario:</div>
                      <p className="text-slate-400 whitespace-pre-wrap leading-relaxed max-h-24 overflow-y-auto">
                        {selectedChubDetail.detail.scenario}
                      </p>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/50 flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-mono">
                {selectedChubDetail.item.full_path}
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectedChubDetail(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
                >
                  Schließen
                </button>
                <button
                  onClick={() => handleImportChub(selectedChubDetail.item.full_path)}
                  disabled={importingId === selectedChubDetail.item.full_path}
                  className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:bg-cyan-900/50 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  {importingId === selectedChubDetail.item.full_path ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Importiere…</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      <span>In Bibliothek importieren</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: URL IMPORT */}
      {/* ========================================================================= */}
      {isUrlModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <LinkIcon className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-sm text-slate-100">Karte aus Link importieren</h3>
              </div>
              <button
                onClick={() => setIsUrlModalOpen(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Füge einen Link zu einem Chub AI Charakter (z. B. <code>https://chub.ai/characters/author/name</code>) oder einen direkten Link zu einer V2-PNG-Karte ein.
            </p>

            <div className="space-y-1.5">
              <input
                type="text"
                placeholder="https://chub.ai/characters/... oder https://.../card.png"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsUrlModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleImportUrl}
                disabled={isUrlImporting || !urlInput.trim()}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:bg-cyan-900/50 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors"
              >
                {isUrlImporting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Importiere…</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>Jetzt importieren</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default SoulHubView;
