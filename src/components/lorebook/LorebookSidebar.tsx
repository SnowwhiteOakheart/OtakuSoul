import { useState } from 'react';
import { useStoreFields } from '../../store/useAppStore';
import type { Lorebook } from '../../types';
import {
  BookOpen,
  Plus,
  Upload,
  Search,
  Globe,
  RotateCcw,
  Compass,
} from 'lucide-react';
import { useTranslation } from '../../i18n';
import { pressable } from '../../utils/pressable';
import { isGlobalLorebook } from './isGlobalLorebook';

interface LorebookSidebarProps {
  onCreate: () => void;
  onImport: () => void;
}

/** Searchable list of all lorebooks; global ones are marked. */
export const LorebookSidebar = ({ onCreate, onImport }: LorebookSidebarProps) => {
  const { t } = useTranslation();
  const { allLorebooks, activeLorebook, selectLorebook, refreshLorebooks, globalLorebookIds, openSoulHubTab } = useStoreFields(
    'allLorebooks', 'activeLorebook', 'selectLorebook', 'refreshLorebooks', 'globalLorebookIds', 'openSoulHubTab',
  );
  const [searchQuery, setSearchQuery] = useState('');

  const query = searchQuery.toLowerCase();
  const filteredLorebooks = allLorebooks.filter(
    (lb) => lb.name.toLowerCase().includes(query) || lb.description.toLowerCase().includes(query)
  );

  const isGlobalBook = (lb: Lorebook) => isGlobalLorebook(lb, globalLorebookIds);

  return (
    <div className="w-80 border-r border-slate-800 bg-slate-900/50 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-100">{t('lore.title')}</h1>
              <p className="text-[11px] text-slate-400">{allLorebooks.length} Bücher verfügbar</p>
            </div>
          </div>
          <button
            onClick={refreshLorebooks}
            title={t('lore.refresh')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onCreate}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center justify-center gap-1.5 shadow transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('lore.new')}</span>
          </button>
          <button
            onClick={onImport}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 border border-slate-700 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{t('lore.import')}</span>
          </button>
        </div>

        <button
          onClick={() => openSoulHubTab('lorebooks')}
          className="w-full py-1.5 px-3 rounded-lg bg-accent-600/15 hover:bg-accent-600/25 text-accent-300 border border-accent-500/30 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors shadow-sm"
        >
          <Compass className="w-3.5 h-3.5 text-accent-400" />
          <span>{t('lore.hub')}</span>
        </button>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder={t('lore.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-app border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500/60"
          />
        </div>
      </div>

      {/* List of Lorebooks */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredLorebooks.map((lb) => {
          const isSelected = activeLorebook?.id === lb.id || activeLorebook?.name === lb.name;
          const global = isGlobalBook(lb);

          return (
            <div
              key={lb.id || lb.name}
              {...pressable(() => selectLorebook(lb))}
              className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                isSelected
                  ? 'bg-indigo-600/15 border-indigo-500/50 shadow-sm'
                  : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-800/50 hover:border-slate-700/80'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className={`text-xs font-semibold line-clamp-1 ${isSelected ? 'text-indigo-300' : 'text-slate-200'}`}>
                  {lb.name}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  {global && (
                    <span className="px-1.5 py-0.5 rounded text-[11px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-0.5">
                      <Globe className="w-2.5 h-2.5" />
                      <span>{t('lore.global')}</span>
                    </span>
                  )}
                  <span className="px-1.5 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
                    {lb.entries.length} Einträge
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-400 line-clamp-2">{lb.description || t('lore.noDescription')}</p>
            </div>
          );
        })}

        {filteredLorebooks.length === 0 && (
          <div className="p-8 text-center text-xs text-slate-400">{t('lore.noBooks')}</div>
        )}
      </div>
    </div>
  );
};
