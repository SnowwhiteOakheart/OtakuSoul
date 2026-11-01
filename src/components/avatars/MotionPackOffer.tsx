import { useEffect, useState } from 'react';
import { Download, Footprints, Loader2 } from 'lucide-react';
import { api } from '../../services/api';
import { translate, useTranslation } from '../../i18n';
import { useStoreFields } from '../../store/useAppStore';
import { errorMessage } from '../../utils/errors';
import { lacksPetMotions, recommendedMotionPack } from '../../utils/motionPacks';
import { toast } from '../ui/feedback';
import type { MotionPackItem } from '../../types/generated/MotionPackItem';

/**
 * A banner while 3D figures have no walking or sitting motions: one click loads the recommended
 * motion pack from the hub (checked by SHA-256). Gone once the motions are there.
 */
export function MotionPackOffer() {
  const { t, currentLanguage } = useTranslation();
  const { avatarMotions, refreshAvatarMotions } = useStoreFields('avatarMotions', 'refreshAvatarMotions');
  const [pack, setPack] = useState<MotionPackItem | null>(null);
  const [loading, setLoading] = useState(false);
  const missing = lacksPetMotions(avatarMotions);

  useEffect(() => {
    if (!missing) return;
    let current = true;
    api
      .getMotionPacks(currentLanguage)
      .then((packs) => current && setPack(recommendedMotionPack(packs ?? [])))
      .catch((e) => console.warn('Bewegungspakete nicht lesbar:', e));
    return () => {
      current = false;
    };
  }, [missing, currentLanguage]);

  if (!missing || !pack) return null;

  const load = async () => {
    setLoading(true);
    try {
      await api.downloadMotionPack(pack.id);
      await refreshAvatarMotions();
      toast.success(translate('motions.packLoaded', { name: pack.name }));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section
      className="flex flex-wrap items-center gap-3 rounded-xl border border-accent-500/30 bg-accent-500/10 p-3"
      data-motion-pack-offer={pack.id}
      aria-label={t('motions.offerTitle')}
    >
      <Footprints className="h-5 w-5 shrink-0 text-accent-300" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-100">{t('motions.offerTitle')}</p>
        <p className="text-xs text-slate-300">
          {t('motions.offerText', { name: pack.name, author: pack.author, license: pack.license })}
        </p>
      </div>
      <button
        type="button"
        disabled={loading}
        onClick={() => void load()}
        className="flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-500 disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Download className="h-3.5 w-3.5" aria-hidden />}
        {t('motions.offerLoad', { size: Math.max(1, Math.round(pack.size_bytes / 1024)) })}
      </button>
    </section>
  );
}
