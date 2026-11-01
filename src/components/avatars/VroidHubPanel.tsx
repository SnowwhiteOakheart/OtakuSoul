import { useCallback, useEffect, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Check, ExternalLink, Heart, Loader2, LogIn, LogOut, Plus, RefreshCw, Trash2, UserRound } from 'lucide-react';
import { api } from '../../services/api';
import { translate, useTranslation } from '../../i18n';
import { useStoreFields } from '../../store/useAppStore';
import { errorMessage } from '../../utils/errors';
import { toast } from '../ui/feedback';
import type { VroidCondition } from '../../types/generated/VroidCondition';
import type { VroidModel } from '../../types/generated/VroidModel';
import type { VroidStatus } from '../../types/generated/VroidStatus';

/**
 * Labels and values as VRoid's display guidelines prescribe them (kept in English on purpose:
 * the guidelines fix the wording; a translated hint explains them).
 */
const CONDITION_LABELS: Record<string, string> = {
  avatarUse: 'Avatar use',
  violentActs: 'Violent acts',
  sexualActs: 'Sexual acts',
  politicalReligious: 'Political/religious acts',
  antisocialHate: 'Antisocial/hateful acts',
  corporateUse: 'Corporate use',
  individualCommercial: 'Individual commercial use',
  redistribution: 'Redistribution',
  alterations: 'Alterations',
  redistributionAltered: 'Redistribution of altered model',
  attribution: 'Attribution',
};
const CONDITION_VALUES: Record<string, string> = {
  allow: 'Allow',
  disallow: 'Do not allow',
  notSet: 'Not set',
  nonprofit: 'Non-profit activities only',
  required: 'Required',
  notRequired: 'Not required',
};

/** "Model Data Conditions of Use" of one VRoid Hub model, with its author. */
export function VroidConditions({ model }: { model: VroidModel }) {
  const { t } = useTranslation();
  return (
    <section className="space-y-2 rounded-lg border border-slate-800 p-3 text-xs" data-vroid-conditions={model.id}>
      <p className="text-slate-300">
        {t('vroid.byAuthor', { author: model.author_name || '—' })}{' '}
        <button
          type="button"
          onClick={() => void openUrl(model.page_url)}
          className="inline-flex items-center gap-0.5 text-accent-300 hover:text-accent-200"
        >
          {t('vroid.openPage')}
          <ExternalLink className="h-3 w-3" aria-hidden />
        </button>
      </p>
      <h3 className="font-semibold text-slate-200">Model Data Conditions of Use</h3>
      <p className="text-[11px] text-slate-400">{t('vroid.conditionsHint')}</p>
      {model.conditions.length === 0 ? (
        <p className="text-slate-400">{t('vroid.conditionsUnknown')}</p>
      ) : (
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5">
          {model.conditions.map((c: VroidCondition) => (
            <div key={c.label} className="contents">
              <dt className="text-slate-400">{CONDITION_LABELS[c.label] ?? c.label}</dt>
              <dd className={c.value === 'disallow' ? 'text-rose-300' : c.value === 'allow' ? 'text-emerald-300' : 'text-slate-300'}>
                {CONDITION_VALUES[c.value] ?? c.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/** A model's portrait from VRoid Hub (shown only inside the app). */
function Portrait({ url }: { url: string | null }) {
  return url ? (
    <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover object-top" />
  ) : (
    <UserRound className="h-8 w-8 text-accent-300/60" aria-hidden />
  );
}

/**
 * Sign in with VRoid Hub and add the user's own or liked models to the 3D avatars. Shown only in
 * builds that carry the VRoid Hub client secret.
 */
export function VroidHubPanel({ onAdded }: { onAdded: (path: string) => void }) {
  const { t, currentLanguage } = useTranslation();
  const { refreshVrmModels } = useStoreFields('refreshVrmModels');
  const [status, setStatus] = useState<VroidStatus | null>(null);
  const [models, setModels] = useState<VroidModel[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const loadModels = useCallback(async () => {
    setLoading(true);
    try {
      setModels(await api.vroidModels());
      // Models no longer available were just taken out of the app.
      await refreshVrmModels();
    } catch (e) {
      toast.error(translate('vroid.listFailed', { error: errorMessage(e) }));
      setStatus(await api.vroidStatus().catch(() => null));
    } finally {
      setLoading(false);
    }
  }, [refreshVrmModels]);

  useEffect(() => {
    api.vroidStatus().then(setStatus).catch((e) => console.warn('VRoid-Hub-Status nicht lesbar:', e));
  }, []);

  if (!status?.configured) return null;

  const signIn = async () => {
    setSigningIn(true);
    try {
      const account = await api.vroidLogin(currentLanguage);
      toast.success(translate('vroid.signedIn', { name: account.name }));
      setStatus(await api.vroidStatus());
      await loadModels();
    } catch (e) {
      toast.error(translate('vroid.signInFailed', { error: errorMessage(e) }));
    } finally {
      setSigningIn(false);
    }
  };

  const signOut = async () => {
    await api.vroidLogout();
    setModels(null);
    setStatus(await api.vroidStatus());
    await refreshVrmModels();
    toast.success(translate('vroid.signedOut'));
  };

  const add = async (model: VroidModel) => {
    setBusy(model.id);
    try {
      const vrm = await api.vroidAddModel(model.id);
      setModels((list) => list?.map((m) => (m.id === model.id ? { ...m, added: true } : m)) ?? null);
      await refreshVrmModels();
      onAdded(vrm.path);
      toast.success(translate('vroid.added', { name: model.name }));
    } catch (e) {
      toast.error(translate('vroid.addFailed', { error: errorMessage(e) }));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (model: VroidModel) => {
    setBusy(model.id);
    try {
      await api.vroidRemoveModel(model.id);
      setModels((list) => list?.map((m) => (m.id === model.id ? { ...m, added: false } : m)) ?? null);
      await refreshVrmModels();
      toast.success(translate('vroid.removed', { name: model.name }));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const account = status.account;
  return (
    <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-3" data-vroid-panel aria-label="VRoid Hub">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-sm font-semibold text-slate-200">VRoid Hub</h2>
        {account ? (
          <>
            <span className="flex items-center gap-1.5 text-xs text-slate-300" data-vroid-account>
              {account.icon && <img src={account.icon} alt="" referrerPolicy="no-referrer" className="h-5 w-5 rounded-full" />}
              {account.name}
            </span>
            <button
              type="button"
              onClick={() => void loadModels()}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              data-vroid-load
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {t(models ? 'vroid.reload' : 'vroid.showModels')}
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
            >
              <LogOut className="h-3.5 w-3.5" />
              {t('vroid.signOut')}
            </button>
          </>
        ) : signingIn ? (
          <>
            <span className="flex items-center gap-1.5 text-xs text-slate-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('vroid.waitingForBrowser')}
            </span>
            <button
              type="button"
              onClick={() => void api.vroidLoginCancel()}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
            >
              {t('common.cancel')}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => void signIn()}
            className="flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-500"
            data-vroid-sign-in
          >
            <LogIn className="h-3.5 w-3.5" />
            {t('vroid.signIn')}
          </button>
        )}
      </div>
      <p className="text-xs text-slate-400">{t(account ? 'vroid.introSignedIn' : 'vroid.intro')}</p>
      {account && !status.cache_available && <p className="text-xs text-amber-200">{t('vroid.noCache')}</p>}

      {account && models && (
        models.length === 0 ? (
          <p className="text-xs text-slate-400">{t('vroid.noModels')}</p>
        ) : (
          <ul className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
            {models.map((model) => (
              <li key={model.id} className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2" data-vroid-model={model.id}>
                <div className="flex gap-2">
                  <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-md bg-slate-800">
                    <Portrait url={model.portrait_url} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-100">{model.name}</span>
                    <span className="flex items-center gap-1 truncate text-[11px] text-slate-400">
                      {model.own ? <UserRound className="h-3 w-3" aria-hidden /> : <Heart className="h-3 w-3" aria-hidden />}
                      {model.own ? t('vroid.own') : model.author_name}
                    </span>
                    <span className="block text-[11px] text-slate-500">VRM {model.vrm_version}{model.size_mb ? ` · ${model.size_mb} MB` : ''}</span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {model.added ? (
                    <>
                      <span className="flex items-center gap-1 text-xs text-emerald-300">
                        <Check className="h-3.5 w-3.5" aria-hidden />
                        {t('vroid.isAdded')}
                      </span>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void remove(model)}
                        className="flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                      >
                        <Trash2 className="h-3 w-3" aria-hidden />
                        {t('vroid.remove')}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void add(model)}
                      className="flex items-center gap-1 rounded-md bg-accent-600 px-2 py-1 text-xs font-medium text-white hover:bg-accent-500 disabled:opacity-50"
                      data-vroid-add={model.id}
                    >
                      {busy === model.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                      {t('vroid.add')}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-expanded={open === model.id}
                    onClick={() => setOpen((o) => (o === model.id ? null : model.id))}
                    className="text-xs text-accent-300 hover:text-accent-200"
                  >
                    {t('vroid.conditions')}
                  </button>
                </div>
                {open === model.id && <VroidConditions model={model} />}
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  );
}
