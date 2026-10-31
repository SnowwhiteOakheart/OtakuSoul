import { useEffect, useState } from 'react';
import { Dice5, Globe, Library, MessageCircle, Plus, X } from 'lucide-react';
import { useAppStore, useStoreFields } from '../../store/useAppStore';
import { useTranslation } from '../../i18n';
import { useHubStore } from '../hub/hubStore';
import { charactersBoundTo, isBoundTo, isGlobalLorebook, scenesUsing } from '../../utils/lorebookUsage';
import { presentedAs } from '../../utils/groupChat';
import { reportFailure } from '../../store/reportFailure';
import type { Lorebook } from '../../types';

const chip =
  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] transition-colors outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400';

/**
 * Where a lorebook is read: in chats (global, or bound to characters) and in the stories that
 * name it. Without this it is not clear what "global" or a lorebook as such does.
 */
export const LorebookUsage = ({ lorebook }: { lorebook: Lorebook }) => {
  const { t } = useTranslation();
  const {
    globalLorebookIds, availableCharacters, bindLorebookToCharacter, stageScenes, fetchStageScenes,
    loadStageScene, setActiveTab, openSoulHubTab, replyLanguage,
  } = useStoreFields(
    'globalLorebookIds', 'availableCharacters', 'bindLorebookToCharacter', 'stageScenes', 'fetchStageScenes',
    'loadStageScene', 'setActiveTab', 'openSoulHubTab', 'replyLanguage',
  );
  const collections = useHubStore((s) => s.collections.items);
  const ensureLoaded = useHubStore((s) => s.ensureLoaded);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!useAppStore.getState().stageScenes?.length) void fetchStageScenes();
    ensureLoaded('collections');
  }, [fetchStageScenes, ensureLoaded]);

  const global = isGlobalLorebook(lorebook, globalLorebookIds);
  const bound = charactersBoundTo(lorebook, availableCharacters);
  const unbound = availableCharacters.filter((c) => !isBoundTo(lorebook, c));
  const stories = scenesUsing(lorebook, stageScenes ?? []);
  // A hub collection with this lorebook that has more stories than are installed.
  const collection = (collections ?? []).find((c) => c.lorebooks.some((name) => name.toLowerCase() === lorebook.name.toLowerCase()));
  const moreInHub = collection && collection.scenes.length > stories.length ? collection : undefined;
  const nameOf = (c: (typeof availableCharacters)[number]) => presentedAs(c, replyLanguage).name;
  const canBind = !!(lorebook.id || lorebook.file_path);

  const bind = (charId: string, on: boolean) =>
    bindLorebookToCharacter(charId, lorebook, on).catch((e) => reportFailure('Binding lorebook failed:', e));
  const openStory = async (sceneId: string) => {
    try {
      await loadStageScene(sceneId);
      setActiveTab('stage');
    } catch (e) {
      reportFailure('Opening story failed:', e);
    }
  };
  const openCollection = () => {
    if (!moreInHub) return;
    openSoulHubTab('scenes');
    useHubStore.getState().setOpenCollection(moreInHub.id);
  };

  return (
    <section aria-label={t('lore.usageTitle')} className="p-3 bg-app/70 border border-slate-800/80 rounded-xl space-y-2.5 text-xs" data-lore-usage>
      <div className="flex items-start gap-2 text-slate-300">
        <MessageCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-accent-400" aria-hidden="true" />
        <div className="flex-1 space-y-1.5">
          <p className="font-semibold text-slate-200">{t('lore.usageChat')}</p>
          {global ? (
            <p className="flex items-center gap-1.5 text-amber-300">
              <Globe className="w-3 h-3" aria-hidden="true" />
              {t('lore.usageGlobal')}
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {bound.length === 0 && <span className="text-slate-400">{t('lore.usageNoCharacters')}</span>}
              {bound.map((c) => (
                <span key={c.id} className={`${chip} border-accent-500/40 bg-accent-500/10 text-accent-200`}>
                  {nameOf(c)}
                  <button type="button" onClick={() => void bind(c.id, false)} aria-label={t('lore.unbind', { name: nameOf(c) })} title={t('lore.unbind', { name: nameOf(c) })} className="text-accent-300 hover:text-white">
                    <X className="w-3 h-3" aria-hidden="true" />
                  </button>
                </span>
              ))}
              {canBind && unbound.length > 0 && (picking ? (
                <select
                  autoFocus
                  aria-label={t('lore.bindCharacter')}
                  defaultValue=""
                  onBlur={() => setPicking(false)}
                  onChange={(e) => {
                    setPicking(false);
                    if (e.target.value) void bind(e.target.value, true);
                  }}
                  className="bg-app border border-slate-700 rounded-md px-1.5 py-0.5 text-[11px] text-slate-200"
                >
                  <option value="">{t('lore.bindCharacter')}</option>
                  {unbound.map((c) => <option key={c.id} value={c.id}>{nameOf(c)}</option>)}
                </select>
              ) : (
                <button type="button" onClick={() => setPicking(true)} className={`${chip} border-slate-700 text-slate-300 hover:bg-slate-800`}>
                  <Plus className="w-3 h-3" aria-hidden="true" />
                  {t('lore.bindCharacter')}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-start gap-2 text-slate-300">
        <Dice5 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-400" aria-hidden="true" />
        <div className="flex-1 space-y-1.5">
          <p className="font-semibold text-slate-200">{t('lore.usageStories')}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {stories.length === 0 && <span className="text-slate-400">{t('lore.usageNoStories')}</span>}
            {stories.map((s) => (
              <button key={s.id} type="button" onClick={() => void openStory(s.id)} title={t('lore.openStory', { name: s.title })} className={`${chip} border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20`}>
                {s.title}
              </button>
            ))}
            {moreInHub && (
              <button type="button" onClick={openCollection} className={`${chip} border-slate-700 text-slate-300 hover:bg-slate-800`} data-lore-collection={moreInHub.id}>
                <Library className="w-3 h-3" aria-hidden="true" />
                {t('lore.moreStoriesInHub', { name: moreInHub.title, count: moreInHub.scenes.length })}
              </button>
            )}
          </div>
          {global && <p className="text-[11px] text-slate-400">{t('lore.usageStoriesHint')}</p>}
        </div>
      </div>
    </section>
  );
};
