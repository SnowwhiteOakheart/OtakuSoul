import { BookOpen, Download, Globe, Loader2, MessageSquare, Star, Users, X } from 'lucide-react';
import { useTranslation } from '../../../i18n';
import { ModalOverlay } from '../../ui/ModalOverlay';
import { Skeleton } from '../../ui';
import type { ChubCharacterDetail, ChubSearchItem } from '../../../types';

export interface ChubDetailState {
  item: ChubSearchItem;
  detail: ChubCharacterDetail | null;
  isLoading: boolean;
}

interface Props {
  state: ChubDetailState;
  importing: boolean;
  onImport: () => void;
  onClose: () => void;
}

/** Full card preview (greeting, personality, scenario) before importing from Chub. */
export const ChubDetailModal = ({ state, importing, onImport, onClose }: Props) => {
  const { t } = useTranslation();
  return (
    <ModalOverlay onClose={onClose} aria-labelledby="chub-detail-title" className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl max-h-[85vh] rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Globe className="w-5 h-5 text-cyan-400" />
            <h2 id="chub-detail-title" className="font-bold text-base text-slate-100">
              {state.item.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          <div className="flex flex-col sm:flex-row gap-5">
            {/* Avatar */}
            <div className="w-36 h-48 shrink-0 rounded-2xl bg-app border border-slate-800 overflow-hidden relative">
              {state.item.avatar_url ? (
                <img
                  src={state.item.avatar_url}
                  alt={state.item.name}
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
                <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono text-[11px]">
                  {state.item.full_path.split('/')[0]}
                </span>
                {state.item.star_count > 0 && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 text-[11px]">
                    <Star className="w-3 h-3 fill-yellow-400" />
                    {t('hub.stars', { count: state.item.star_count })}
                  </span>
                )}
                {state.item.n_tokens > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[11px] font-mono">
                    {t('hub.tokens', { count: state.item.n_tokens })}
                  </span>
                )}
                {state.detail?.has_embedded_lorebook && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px]">
                    <BookOpen className="w-3 h-3" />
                    {t('hub.embeddedLorebook')}
                  </span>
                )}
              </div>

              <p className="text-slate-300 italic">
                {state.detail?.tagline || state.item.tagline || ''}
              </p>

              <div className="text-slate-400 leading-relaxed">
                {state.item.description}
              </div>
            </div>
          </div>

          {/* Detailed Attributes */}
          {state.isLoading ? (
            <div role="status" aria-label={t('hub.loadingDetails')} aria-busy="true" className="space-y-4 py-2">
              <span className="sr-only">{t('hub.loadingDetails')}</span>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : state.detail ? (
            <div className="space-y-4 pt-2">
              {state.detail.first_message && (
                <div className="rounded-xl bg-app/70 border border-slate-800/80 p-3 space-y-1">
                  <div className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
                    {t('hub.firstMessage')}
                  </div>
                  <p className="text-slate-400 whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto">
                    {state.detail.first_message}
                  </p>
                </div>
              )}

              {state.detail.personality && (
                <div className="rounded-xl bg-app/70 border border-slate-800/80 p-3 space-y-1">
                  <div className="font-semibold text-slate-300">{t('hub.personality')}</div>
                  <p className="text-slate-400 whitespace-pre-wrap leading-relaxed max-h-28 overflow-y-auto">
                    {state.detail.personality}
                  </p>
                </div>
              )}

              {state.detail.scenario && (
                <div className="rounded-xl bg-app/70 border border-slate-800/80 p-3 space-y-1">
                  <div className="font-semibold text-slate-300">{t('hub.scenario')}</div>
                  <p className="text-slate-400 whitespace-pre-wrap leading-relaxed max-h-24 overflow-y-auto">
                    {state.detail.scenario}
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-app/50 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-mono">
            {state.item.full_path}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
            >
              {t('common.close')}
            </button>
            <button
              onClick={onImport}
              disabled={importing}
              className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:bg-cyan-900/50 text-app font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
            >
              {importing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{t('hub.importing')}</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>{t('hub.importToLibrary')}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
};
