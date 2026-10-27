import { useEffect, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { api } from '../../services/api';
import { translate, useTranslation } from '../../i18n';
import { useAppStore } from '../../store/useAppStore';
import { errorMessage } from '../../utils/errors';
import { toast } from '../ui/feedback';
import type { Inochi2dCatalogItem } from '../../types';

/**
 * A character card names an Inochi2D puppet (`custom_inochi2d`) that is not here yet but can be
 * loaded from the registry: offers to load it (meanwhile the default puppet is shown).
 */
export function MissingPuppetHint({ puppet }: { puppet: string }) {
  const { t, currentLanguage } = useTranslation();
  const [item, setItem] = useState<Inochi2dCatalogItem | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const wanted = puppet.replace(/\\/g, '/').split('/').pop()!.toLowerCase();
    api
      .getInochi2dCatalog(currentLanguage)
      .then((items) => {
        if (!cancelled) setItem(items.find((i) => i.id.toLowerCase() === wanted && !i.is_installed) ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [puppet, currentLanguage]);

  if (!item) return null;

  const load = async () => {
    setBusy(true);
    try {
      const model = await api.downloadInochi2dModel(item.id);
      await useAppStore.getState().refreshInochi2dModels();
      toast.success(translate('avatars.inochi2dDownloaded', { name: model.name }));
      setItem(null);
    } catch (e) {
      toast.error(translate('avatars.inochi2dDownloadFailed', { error: errorMessage(e) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="absolute bottom-14 inset-x-3 z-30 flex items-center gap-2 rounded-xl border border-accent-500/40 bg-slate-900/90 p-2.5 text-xs text-slate-200 shadow-lg backdrop-blur"
      data-missing-puppet={item.id}
    >
      <p className="min-w-0 flex-1">{t('avatar.inochi2dMissing', { name: item.name })}</p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void load()}
        title={`${item.author} · ${item.license}`}
        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent-600 px-2.5 py-1.5 font-medium text-white hover:bg-accent-500 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        {t('avatars.inochi2dDownload', { name: item.name, size: item.size_mb.toFixed(0) })}
      </button>
    </div>
  );
}
