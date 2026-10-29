import { Check, Download, Loader2, Package } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { translate, useTranslation, type TranslationKey } from '../../i18n';
import type { MotionPackItem } from '../../types/generated/MotionPackItem';
import { errorMessage } from '../../utils/errors';
import { toast } from '../ui/feedback';

/**
 * Ready-made motion sets (registry in the data repository): name, author, licence and what it
 * contains; one click loads the files (checked by SHA-256) and gives them their uses.
 */
export const MotionPacks = ({ onLoaded }: { onLoaded: () => Promise<void> | void }) => {
  const { t, currentLanguage } = useTranslation();
  const [packs, setPacks] = useState<MotionPackItem[]>([]);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    api.getMotionPacks(currentLanguage).then((list) => setPacks(list ?? [])).catch((e) => console.warn('Bewegungspakete nicht lesbar:', e));
  }, [currentLanguage]);

  const load = async (pack: MotionPackItem) => {
    setLoading(pack.id);
    try {
      await api.downloadMotionPack(pack.id);
      toast.success(translate('motions.packLoaded', { name: pack.name }));
      setPacks((await api.getMotionPacks(currentLanguage)) ?? []);
      await onLoaded();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(null);
    }
  };

  if (packs.length === 0) return null;
  return (
    <section className="space-y-2" aria-labelledby="motion-packs-title">
      <h4 id="motion-packs-title" className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
        <Package className="w-3.5 h-3.5 text-accent2-400" aria-hidden />
        {t('motions.packs')}
      </h4>
      <p className="text-xs text-slate-400">{t('motions.packsIntro')}</p>
      <ul className="space-y-2">
        {packs.map((pack) => (
          <li key={pack.id} className="rounded-lg border border-slate-800 bg-app p-3 text-xs space-y-1" data-motion-pack={pack.id}>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-100 flex-1">
                {pack.name} <span className="font-normal text-slate-500">· {pack.author}</span>
              </span>
              <button
                type="button"
                disabled={pack.installed || loading !== null}
                onClick={() => void load(pack)}
                className="px-3 py-1 rounded-lg bg-accent-600 hover:bg-accent-500 disabled:bg-slate-800 disabled:text-slate-400 text-white flex items-center gap-1.5"
              >
                {loading === pack.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                ) : pack.installed ? (
                  <Check className="w-3.5 h-3.5" aria-hidden />
                ) : (
                  <Download className="w-3.5 h-3.5" aria-hidden />
                )}
                {t(loading === pack.id ? 'motions.packLoading' : pack.installed ? 'motions.packInstalled' : 'motions.packLoad')}
              </button>
            </div>
            <p className="text-slate-400">{pack.description}</p>
            <p className="text-slate-500">
              {t('motions.packRoles', { roles: pack.roles.map((role) => t(`motions.role.${role}` as TranslationKey)).join(', ') })}
            </p>
            <p className="text-slate-500">
              {pack.license_url ? (
                <a href={pack.license_url} target="_blank" rel="noreferrer" className="underline hover:text-slate-300">
                  {t('motions.packLicense', { license: pack.license })}
                </a>
              ) : (
                t('motions.packLicense', { license: pack.license })
              )}
              {' · '}
              {t('motions.packSize', { size: Math.round(pack.size_bytes / 1024) })}
              {pack.source_url && (
                <>
                  {' · '}
                  <a href={pack.source_url} target="_blank" rel="noreferrer" className="underline hover:text-slate-300">
                    {pack.source_url.replace(/^https:\/\//, '')}
                  </a>
                </>
              )}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
};
