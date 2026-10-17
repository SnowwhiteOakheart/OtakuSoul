import { useEffect, useMemo, useRef, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { Box, Check, Search, Sparkles, Star, Upload, UserRound, Wand2 } from 'lucide-react';
import { translate, useTranslation, type TranslationKey } from '../../i18n';
import { useStoreFields } from '../../store/useAppStore';
import { loadDisplayableImage } from '../../utils/characterPortraits';
import { localizeCard } from '../../utils/cardI18n';
import { errorMessage } from '../../utils/errors';
import { radioGroupKeyDown, radioTabIndex } from '../../utils/radioGroup';
import { AvatarActions } from '../settings/AvatarActions';
import { toast } from '../ui/feedback';
import { AvatarPreview } from './AvatarPreview';
import { importLive2dFromDialog, importVrmFromDialog } from './avatarImport';
import { usesLive2d, usesVrm } from './avatarMatch';
import type { CharacterProfile } from '../../types';

type Filter = 'all' | 'vrm' | 'live2d';
const FILTERS: readonly Filter[] = ['all', 'vrm', 'live2d'];
const FILTER_LABELS: Record<Filter, TranslationKey> = { all: 'avatars.filterAll', vrm: 'avatars.filter3d', live2d: 'avatars.filterLive2d' };

/** One model of either kind, as the manager lists it. */
interface ManagedAvatar {
  kind: 'vrm' | 'live2d';
  /** Model file (3D) or model JSON (Live2D); also the list key. */
  path: string;
  name: string;
  /** Format and size, shown under the name. */
  detail: string;
  removable: boolean;
  /** What a character card stores for this model: the path (3D) or the folder id (Live2D). */
  cardValue: string;
  previewImage: string | null;
  uses: (character: CharacterProfile) => boolean;
}

const FORMAT_LABELS: Record<string, string> = { vrm: 'VRM', gltf: 'glTF', mmd: 'MMD' };
const LIVE2D_VERSIONS: Record<string, string> = { cubism3_4: 'Cubism 3/4', cubism2: 'Cubism 2' };

/** Live2D models bring a preview picture; 3D models get an icon (their preview is live on the right). */
function Thumbnail({ avatar }: { avatar: ManagedAvatar }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!avatar.previewImage) return;
    let cancelled = false;
    loadDisplayableImage(convertFileSrc(avatar.previewImage))
      .then((url) => !cancelled && setSrc(url))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [avatar.previewImage]);
  if (src) return <img src={src} alt="" className="h-full w-full object-cover object-top" />;
  const Icon = avatar.kind === 'vrm' ? Box : Sparkles;
  return <Icon className="h-10 w-10 text-accent-300/70" aria-hidden />;
}

function CharacterFace({ character, language }: { character: CharacterProfile; language: string }) {
  const name = localizeCard(character.card.data, language).name;
  return character.avatar_data_url ? (
    <img src={character.avatar_data_url} alt="" title={name} className="h-6 w-6 rounded-full border border-slate-900 object-cover" />
  ) : (
    <span title={name} className="grid h-6 w-6 place-items-center rounded-full border border-slate-900 bg-slate-700 text-[10px] text-slate-200">
      {name.slice(0, 1)}
    </span>
  );
}

/**
 * All 3D and Live2D models in one place: look at them, rename or remove them, make one the default
 * and give it to characters with a tick.
 */
export function AvatarManagerView() {
  const { t, currentLanguage } = useTranslation();
  const {
    scannedVrms, scannedLive2ds, activeVrmPath, setActiveVrmPath, activeLive2dPath, setActiveLive2dPath,
    refreshVrmModels, refreshLive2dModels, availableCharacters, assignCharacterAvatar, avatarMode, setAvatarMode,
    openSettingsSection,
  } = useStoreFields(
    'scannedVrms', 'scannedLive2ds', 'activeVrmPath', 'setActiveVrmPath', 'activeLive2dPath', 'setActiveLive2dPath',
    'refreshVrmModels', 'refreshLive2dModels', 'availableCharacters', 'assignCharacterAvatar', 'avatarMode', 'setAvatarMode',
    'openSettingsSection',
  );
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  // Removed a moment ago (undo still possible): left out of the list.
  const [hidden, setHidden] = useState<string[]>([]);
  const [justImported, setJustImported] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  // Removed models that were the default: undo makes them the default again.
  const wasDefault = useRef(new Set<string>());

  useEffect(() => {
    void refreshVrmModels();
    void refreshLive2dModels();
  }, [refreshVrmModels, refreshLive2dModels]);

  const avatars = useMemo<ManagedAvatar[]>(() => [
    ...scannedVrms.map((vrm) => ({
      kind: 'vrm' as const,
      path: vrm.path,
      name: vrm.name,
      detail: `${FORMAT_LABELS[vrm.format] ?? vrm.format.toUpperCase()} · ${vrm.size_mb.toFixed(0)} MB`,
      removable: vrm.removable,
      cardValue: vrm.path,
      previewImage: null,
      uses: (c: CharacterProfile) => usesVrm(c, vrm),
    })),
    ...scannedLive2ds.map((model) => ({
      kind: 'live2d' as const,
      path: model.model_path,
      name: model.name,
      detail: `Live2D${model.version ? ` · ${LIVE2D_VERSIONS[model.version] ?? model.version}` : ''}`,
      removable: model.removable,
      cardValue: model.id,
      previewImage: model.preview_image ?? null,
      uses: (c: CharacterProfile) => usesLive2d(c, model),
    })),
  ], [scannedVrms, scannedLive2ds]);

  const needle = query.trim().toLowerCase();
  const shown = avatars.filter(
    (a) => !hidden.includes(a.path) && (filter === 'all' || a.kind === filter) && (!needle || a.name.toLowerCase().includes(needle)),
  );
  const selected = avatars.find((a) => a.path === selectedPath && !hidden.includes(a.path)) ?? shown[0];
  const isDefault = (a: ManagedAvatar) => (a.kind === 'vrm' ? activeVrmPath === a.path : activeLive2dPath === a.path);
  const makeDefault = (a: ManagedAvatar) => (a.kind === 'vrm' ? setActiveVrmPath(a.path) : setActiveLive2dPath(a.path));
  const charName = (c: CharacterProfile) => localizeCard(c.card.data, currentLanguage).name;

  const importModel = async (kind: 'vrm' | 'live2d') => {
    const path = kind === 'vrm' ? await importVrmFromDialog() : await importLive2dFromDialog();
    if (!path) return;
    setFilter((f) => (f === 'all' || f === kind ? f : kind));
    setQuery('');
    setSelectedPath(path);
    setJustImported(path);
  };

  const hide = (a: ManagedAvatar) => {
    setHidden((list) => [...list, a.path]);
    if (isDefault(a)) wasDefault.current.add(a.path);
    // The default goes to another model of the same kind; undo brings it back.
    if (isDefault(a)) {
      const next = avatars.find((o) => o.kind === a.kind && o.path !== a.path && !hidden.includes(o.path));
      if (a.kind === 'vrm') setActiveVrmPath(next?.path ?? null);
      else setActiveLive2dPath(next?.path ?? null);
    }
  };
  const unhide = (a: ManagedAvatar) => {
    setHidden((list) => list.filter((p) => p !== a.path));
    if (wasDefault.current.delete(a.path)) makeDefault(a);
    setSelectedPath(a.path);
  };

  const toggleCharacter = async (a: ManagedAvatar, character: CharacterProfile, on: boolean) => {
    setSaving(character.id);
    try {
      await assignCharacterAvatar(character.id, a.kind, on ? a.cardValue : null);
      toast.success(translate(on ? 'avatars.assigned' : 'avatars.unassigned', { character: charName(character), name: a.name }));
    } catch (e) {
      toast.error(translate('avatars.assignFailed', { error: errorMessage(e) }));
    } finally {
      setSaving(null);
    }
  };

  /** The model a character uses now, when it is another one than `a`. */
  const otherModel = (a: ManagedAvatar, character: CharacterProfile) =>
    avatars.find((o) => o.kind === a.kind && o.path !== a.path && o.uses(character));

  const modeFor = selected?.kind === 'vrm' ? '3d' : 'live2d';

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4 md:p-6" data-avatar-manager>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-slate-100">{t('avatars.title')}</h1>
          <p className="max-w-2xl text-sm text-slate-400">{t('avatars.intro')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void importModel('vrm')}
            className="flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-2 text-sm font-medium text-white hover:bg-accent-500"
            title={t('avatars.import3dHint')}
          >
            <Upload className="h-4 w-4" />
            {t('avatars.import3d')}
          </button>
          <button
            type="button"
            onClick={() => void importModel('live2d')}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
            title={t('settings.importLive2dHint')}
          >
            <Upload className="h-4 w-4" />
            {t('avatars.importLive2d')}
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div
          role="radiogroup"
          tabIndex={-1}
          aria-label={t('avatars.filterLabel')}
          className="flex rounded-lg border border-slate-800 bg-slate-900/60 p-0.5"
          onKeyDown={(e) => radioGroupKeyDown(e, FILTERS, filter, setFilter)}
        >
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={filter === f}
              tabIndex={radioTabIndex(f, FILTERS, filter)}
              data-radio-value={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${filter === f ? 'bg-accent-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              {t(FILTER_LABELS[f])}
              <span className="ml-1 opacity-70">
                {avatars.filter((a) => !hidden.includes(a.path) && (f === 'all' || a.kind === f)).length}
              </span>
            </button>
          ))}
        </div>
        <label className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('avatars.search')}
            aria-label={t('avatars.search')}
            className="w-full rounded-lg border border-slate-800 bg-app py-1.5 pl-8 pr-3 text-sm text-slate-200 focus:border-accent-500 focus:outline-hidden"
          />
        </label>
      </div>

      {avatars.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center" data-avatar-empty>
          <UserRound className="mx-auto mb-2 h-10 w-10 text-accent-400/60" />
          <p className="text-sm font-semibold text-slate-200">{t('avatars.emptyTitle')}</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-400">{t('avatars.emptyText')}</p>
        </div>
      ) : (
        <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
          <ul className="grid content-start gap-3 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]" aria-label={t('avatars.listLabel')}>
            {shown.length === 0 && <li className="col-span-full text-sm text-slate-400">{t('avatars.noMatch')}</li>}
            {shown.map((a) => {
              const users = availableCharacters.filter(a.uses);
              const active = selected?.path === a.path;
              return (
                <li key={a.path}>
                  <button
                    type="button"
                    onClick={() => setSelectedPath(a.path)}
                    aria-pressed={active}
                    data-avatar-card={a.kind}
                    data-avatar-name={a.name}
                    className={`flex w-full flex-col overflow-hidden rounded-xl border text-left transition-colors ${active ? 'border-accent-400 bg-accent-500/10' : 'border-slate-800 bg-slate-900/50 hover:border-slate-600'}`}
                  >
                    <span className="grid aspect-[4/3] w-full place-items-center overflow-hidden bg-linear-to-b from-slate-800/60 to-slate-900">
                      <Thumbnail avatar={a} />
                    </span>
                    <span className="space-y-1 p-2.5">
                      <span className="block truncate text-sm font-medium text-slate-100">{a.name}</span>
                      <span className="block truncate text-[11px] text-slate-400">{a.detail}</span>
                      <span className="flex min-h-6 items-center justify-between gap-1">
                        <span className="flex -space-x-1.5">
                          {users.slice(0, 4).map((c) => <CharacterFace key={c.id} character={c} language={currentLanguage} />)}
                          {users.length > 4 && <span className="pl-2.5 text-[11px] text-slate-400">+{users.length - 4}</span>}
                        </span>
                        {isDefault(a) && (
                          <span className="inline-flex items-center gap-0.5 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-200">
                            <Star className="h-2.5 w-2.5" aria-hidden />
                            {t('avatars.default')}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {selected && (
            <aside className="flex min-h-0 flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 lg:sticky lg:top-0 lg:self-start" data-avatar-detail={selected.kind} aria-label={selected.name}>
              <div className="h-80 overflow-hidden rounded-lg border border-slate-800 bg-app">
                <AvatarPreview key={selected.path} kind={selected.kind} path={selected.path} />
              </div>

              <div className="space-y-2">
                <div>
                  <h2 className="truncate text-base font-semibold text-slate-100">{selected.name}</h2>
                  <p className="text-xs text-slate-400">{selected.detail}</p>
                </div>
                <AvatarActions
                  key={`${selected.path}:${justImported === selected.path}`}
                  kind={selected.kind}
                  entry={selected}
                  startEditing={justImported === selected.path}
                  refresh={selected.kind === 'vrm' ? refreshVrmModels : refreshLive2dModels}
                  hide={() => hide(selected)}
                  unhide={() => unhide(selected)}
                />
              </div>

              <div className="space-y-1.5 rounded-lg border border-slate-800 p-3">
                {isDefault(selected) ? (
                  <p className="flex items-center gap-1.5 text-sm text-amber-200" data-avatar-is-default>
                    <Star className="h-4 w-4" aria-hidden />
                    {t('avatars.isDefault')}
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => makeDefault(selected)}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
                    data-avatar-make-default
                  >
                    <Star className="h-4 w-4" aria-hidden />
                    {t('avatars.makeDefault')}
                  </button>
                )}
                <p className="text-xs text-slate-400">{t('avatars.defaultHint')}</p>
                {avatarMode !== modeFor && (
                  <p className="text-xs text-slate-400">
                    {t(modeFor === '3d' ? 'avatars.modeHint3d' : 'avatars.modeHintLive2d')}{' '}
                    <button type="button" onClick={() => setAvatarMode(modeFor)} className="text-accent-300 underline hover:text-accent-200">
                      {t(modeFor === '3d' ? 'avatars.switchTo3d' : 'avatars.switchToLive2d')}
                    </button>
                  </p>
                )}
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold text-slate-200">{t('avatars.characters')}</legend>
                <p className="text-xs text-slate-400">{t('avatars.charactersHint')}</p>
                <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
                  {availableCharacters.map((c) => {
                    const on = selected.uses(c);
                    const other = on ? undefined : otherModel(selected, c);
                    return (
                      <li key={c.id}>
                        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-800/60" data-avatar-character={c.id}>
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={saving !== null}
                            onChange={(e) => void toggleCharacter(selected, c, e.target.checked)}
                            className="h-4 w-4 accent-accent-500"
                          />
                          <CharacterFace character={c} language={currentLanguage} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-slate-200">{charName(c)}</span>
                            <span className="block truncate text-[11px] text-slate-400">
                              {on ? t('avatars.usesThis') : other ? t('avatars.usesOther', { name: other.name }) : t('avatars.usesDefault')}
                            </span>
                          </span>
                          {on && <Check className="h-4 w-4 text-emerald-300" aria-hidden />}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>

              {selected.kind === 'vrm' && (
                <button
                  type="button"
                  onClick={() => openSettingsSection('general')}
                  className="flex items-center gap-1.5 self-start text-xs text-accent-300 hover:text-accent-200"
                >
                  <Wand2 className="h-3.5 w-3.5" aria-hidden />
                  {t('avatars.motionsAndFace')}
                </button>
              )}
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
