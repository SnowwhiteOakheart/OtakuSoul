import { useCallback, useEffect, useState } from 'react';
import { Box, Check, Download, ExternalLink, Feather, Loader2, Smile, UserRound, type LucideIcon } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { api } from '../../../services/api';
import { translate, useTranslation, type TranslationKey } from '../../../i18n';
import { useAppStore } from '../../../store/useAppStore';
import { errorMessage } from '../../../utils/errors';
import { toast } from '../../ui/feedback';
import { matchesQuery, useHubStore } from '../hubStore';
import { NsfwBadge } from '../hubParts';
import type { HubAvatar } from '../../../types/generated/HubAvatar';

type Kind = 'vrm' | 'live2d' | 'inochi2d';
const KINDS: Kind[] = ['vrm', 'live2d', 'inochi2d'];
const KIND_ICONS: Record<Kind, LucideIcon> = { vrm: Box, live2d: Smile, inochi2d: Feather };

/** One card: hub avatars (VRM, Live2D) and the Inochi2D example puppets in one list. */
interface AvatarCard {
  id: string;
  kind: Kind;
  name: string;
  author: string;
  license: string;
  licenseUrl: string;
  licenseNote: string;
  sourceUrl: string;
  pageUrl: string;
  description: string;
  sizeMb: number;
  downloadable: boolean;
  installed: boolean;
  nsfw: boolean;
}

const fromHub = (a: HubAvatar): AvatarCard => ({
  id: a.id,
  kind: a.kind === 'live2d' ? 'live2d' : 'vrm',
  name: a.name,
  author: a.author,
  license: a.license,
  licenseUrl: a.license_url,
  licenseNote: a.license_note,
  sourceUrl: a.source_url,
  pageUrl: a.page_url,
  description: a.description,
  sizeMb: a.size_bytes / 1024 / 1024,
  downloadable: a.downloadable,
  installed: a.installed,
  nsfw: a.nsfw,
});

/**
 * Hub category "Avatare": free 3D (VRM), Live2D and Inochi2D figures to load straight into the
 * avatar library (checked by SHA-256), and models that may only be downloaded on their own page.
 */
export const HubAvatarsTab = () => {
  const { t, currentLanguage } = useTranslation();
  const query = useHubStore((s) => s.query);
  const [cards, setCards] = useState<AvatarCard[] | null>(null);
  const [kind, setKind] = useState<Kind | 'all'>('all');
  const [busy, setBusy] = useState<string | null>(null);

  const fetchCards = useCallback(async (): Promise<AvatarCard[]> => {
    const [hub, puppets] = await Promise.all([
      api.getHubAvatars(currentLanguage).catch(() => [] as HubAvatar[]),
      api.getInochi2dCatalog(currentLanguage).catch(() => []),
    ]);
    return [
      ...(hub ?? []).map(fromHub),
      ...(puppets ?? []).map((p): AvatarCard => ({
        id: `inochi2d:${p.id}`,
        kind: 'inochi2d',
        name: p.name,
        author: p.author,
        license: p.license,
        licenseUrl: '',
        licenseNote: '',
        sourceUrl: p.url,
        pageUrl: '',
        description: p.description,
        sizeMb: p.size_mb,
        downloadable: true,
        installed: p.is_installed,
        nsfw: false,
      })),
    ];
  }, [currentLanguage]);
  const load = useCallback(async () => setCards(await fetchCards()), [fetchCards]);

  // A list for an earlier language that arrives late does not replace the current one.
  useEffect(() => {
    let current = true;
    void fetchCards().then((loaded) => {
      if (current) setCards(loaded);
    });
    return () => {
      current = false;
    };
  }, [fetchCards]);

  /** Loads the figure (again a no-op when it is there) and returns what to select. */
  const fetchFigure = async (card: AvatarCard): Promise<{ kind: Kind; path: string }> => {
    if (card.kind === 'inochi2d') {
      const puppet = await api.downloadInochi2dModel(card.id.slice('inochi2d:'.length));
      await useAppStore.getState().refreshInochi2dModels();
      return { kind: 'inochi2d', path: puppet.model_path };
    }
    const installed = await api.downloadHubAvatar(card.id);
    const store = useAppStore.getState();
    await (card.kind === 'live2d' ? store.refreshLive2dModels() : store.refreshVrmModels());
    return { kind: card.kind, path: installed.path };
  };

  const download = async (card: AvatarCard) => {
    setBusy(card.id);
    try {
      await fetchFigure(card);
      toast.success(translate('hub.avatarLoaded', { name: card.name }));
      await load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const use = async (card: AvatarCard) => {
    setBusy(card.id);
    try {
      const { kind: figure, path } = await fetchFigure(card);
      const store = useAppStore.getState();
      if (figure === 'live2d') store.setActiveLive2dPath(path);
      else if (figure === 'inochi2d') store.setActiveInochi2dPath(path);
      else store.setActiveVrmPath(path);
      store.setAvatarMode(figure === 'vrm' ? '3d' : figure);
      toast.success(translate('hub.avatarUsed', { name: card.name }));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const open = (url: string) => void openUrl(url).catch((e) => toast.error(errorMessage(e)));

  const visible = (cards ?? []).filter(
    (card) => (kind === 'all' || card.kind === kind) && matchesQuery(query, card.name, card.author, card.description, card.license),
  );
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs transition ${
      active ? 'border-accent-400 bg-accent-600 text-white' : 'border-slate-700 text-slate-300 hover:bg-slate-800'
    }`;

  return (
    <div className="space-y-4" data-hub-avatars>
      <p className="text-xs text-slate-400 max-w-3xl">{t('hub.avatarsIntro')}</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('hub.tabAvatars')}>
        <button type="button" aria-pressed={kind === 'all'} onClick={() => setKind('all')} className={chip(kind === 'all')}>
          {t('hub.avatarsAll')}
        </button>
        {KINDS.map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={chip(kind === k)}>
            {t(`hub.avatarsKind.${k}` as TranslationKey)}
          </button>
        ))}
      </div>

      {cards === null ? (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
        </div>
      ) : visible.length === 0 ? (
        <p className="text-xs text-slate-500">{t('hub.avatarsEmpty')}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((card) => {
            const Icon = KIND_ICONS[card.kind];
            const working = busy === card.id;
            return (
              <div
                key={card.id}
                data-hub-avatar={card.id}
                className="group rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-accent-500/50 transition-all p-5 flex flex-col justify-between gap-3 shadow-sm"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-accent-500/10 border border-accent-500/20 flex items-center justify-center text-accent-300">
                      <Icon className="w-4 h-4" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm text-slate-100 truncate">{card.name}</h3>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1">
                        <UserRound className="w-3 h-3" aria-hidden />
                        {t('hub.avatarBy', { author: card.author })} · {t(`hub.avatarsKind.${card.kind}` as TranslationKey)}
                      </p>
                    </div>
                  </div>
                  <NsfwBadge nsfw={card.nsfw} />
                  <p className="text-xs text-slate-400 leading-relaxed">{card.description || t('hub.noDescription')}</p>
                  <p className="text-[11px] text-slate-500">
                    {card.licenseUrl ? (
                      <button type="button" onClick={() => open(card.licenseUrl)} className="underline hover:text-slate-300">
                        {t('hub.avatarLicense', { license: card.license })}
                      </button>
                    ) : (
                      t('hub.avatarLicense', { license: card.license })
                    )}
                    {card.downloadable && ` · ${t('hub.avatarSize', { size: card.sizeMb.toFixed(1) })}`}
                    {card.sourceUrl && (
                      <>
                        {' · '}
                        <button type="button" onClick={() => open(card.sourceUrl)} className="underline hover:text-slate-300">
                          {new URL(card.sourceUrl).hostname}
                        </button>
                      </>
                    )}
                  </p>
                  {card.licenseNote && <p className="text-[10px] italic text-slate-500">{card.licenseNote}</p>}
                </div>
                {card.downloadable ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={working || card.installed || busy !== null}
                      onClick={() => void download(card)}
                      className="flex-1 py-2 px-3 rounded-xl bg-accent-600 hover:bg-accent-500 disabled:bg-slate-800 disabled:text-slate-400 text-white font-bold text-xs flex items-center justify-center gap-2"
                    >
                      {working ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                      ) : card.installed ? (
                        <Check className="w-3.5 h-3.5" aria-hidden />
                      ) : (
                        <Download className="w-3.5 h-3.5" aria-hidden />
                      )}
                      {t(working ? 'hub.avatarLoading' : card.installed ? 'hub.avatarInstalled' : 'hub.avatarLoad')}
                    </button>
                    {card.installed && (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void use(card)}
                        className="py-2 px-3 rounded-xl border border-accent-500/50 text-accent-200 hover:bg-accent-900/40 disabled:opacity-50 text-xs font-bold"
                      >
                        {t('hub.avatarUse')}
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => open(card.pageUrl)}
                    className="w-full py-2 px-3 rounded-xl border border-slate-700 text-slate-200 hover:bg-slate-800 text-xs font-bold flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden />
                    {t('hub.avatarOpenPage')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
