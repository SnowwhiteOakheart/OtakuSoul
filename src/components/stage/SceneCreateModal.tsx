import React, { startTransition, useActionState, useEffect, useState } from 'react';
import { useStoreFields } from '../../store/useAppStore';
import type { BattleMap, SceneDefinition, SceneRules } from '../../types';
import { X, Sparkles, MapPin, Sun, UserCheck } from 'lucide-react';
import { ModalOverlay } from '../ui/ModalOverlay';
import { translate, useTranslation } from '../../i18n';
import { open } from '@tauri-apps/plugin-dialog';
import { api } from '../../services/api';
import { errorMessage } from '../../utils/errors';

const FIVE_E_CLASSES = ['fighter', 'wizard', 'rogue', 'cleric'] as const;

/** Rules of the scene: narrative or the 5e engine with a class per party member. */
const SceneRulesFields: React.FC<{ rules: SceneRules | null; party: string[]; onChange: (rules: SceneRules | null) => void }> = ({ rules, party, onChange }) => {
  const { t } = useTranslation();
  const fiveE = rules?.ruleset === '5e';
  const classes = rules?.hero_classes ?? {};
  const { appLanguage } = useStoreFields('appLanguage');
  const [maps, setMaps] = useState<BattleMap[]>([]);
  useEffect(() => {
    if (!fiveE) return;
    api.listBattleMaps().then(setMaps).catch((e) => console.error('Failed to list battle maps:', e));
  }, [fiveE]);
  const setClass = (member: string, classId: string) =>
    rules && onChange({ ...rules, hero_classes: { ...rules.hero_classes, [member]: classId } });
  return (
    <fieldset className="space-y-2 p-3 bg-app/60 border border-slate-800 rounded-xl text-xs">
      <legend className="px-1 font-semibold text-slate-300">{t('sceneRules.title')}</legend>
      <label htmlFor="scene-ruleset" className="block text-slate-400">{t('sceneRules.ruleset')}</label>
      <select
        id="scene-ruleset"
        value={fiveE ? '5e' : 'standard'}
        onChange={(e) =>
          onChange(e.target.value === '5e' ? { ruleset: '5e', hero_classes: rules?.hero_classes ?? {}, control_companions: rules?.control_companions ?? false, heroic_death: rules?.heroic_death ?? false, goals: rules?.goals ?? [] } : null)
        }
        className="w-full p-2 bg-app border border-slate-700 rounded-xl"
      >
        <option value="standard">{t('sceneRules.standard')}</option>
        <option value="5e">{t('sceneRules.fiveE')}</option>
      </select>
      {fiveE && (
        <>
          <p className="text-slate-400">{t('sceneRules.fiveEHint')}</p>
          {['player', ...party].map((member) => (
            <div key={member} className="flex items-center gap-2">
              <label htmlFor={`scene-class-${member}`} className="w-32 truncate text-slate-300">
                {member === 'player' ? t('sceneRules.you') : member}
              </label>
              <select
                id={`scene-class-${member}`}
                value={classes[member] ?? ''}
                onChange={(e) => setClass(member, e.target.value)}
                className="flex-1 p-1.5 bg-app border border-slate-700 rounded-lg"
              >
                <option value="">{t('sceneRules.classAuto')}</option>
                {FIVE_E_CLASSES.map((id) => (
                  <option key={id} value={id}>{t(`sceneRules.class.${id}`)}</option>
                ))}
              </select>
            </div>
          ))}
          <label htmlFor="scene-map" className="block text-slate-400">{t('sceneRules.map')}</label>
          <select
            id="scene-map"
            value={rules?.map_id ?? ''}
            onChange={(e) => rules && onChange({ ...rules, map_id: e.target.value || undefined })}
            className="w-full p-1.5 bg-app border border-slate-700 rounded-lg"
          >
            <option value="">{t('sceneRules.noMap')}</option>
            {maps.map((map) => (
              <option key={map.id} value={map.id}>{map.name[appLanguage] || map.name.en}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-slate-300">
            <input
              type="checkbox"
              checked={rules?.control_companions ?? false}
              onChange={(e) => rules && onChange({ ...rules, control_companions: e.target.checked })}
              className="w-4 h-4 accent-accent-600"
            />
            {t('sceneRules.controlCompanions')}
          </label>
          <label className="flex items-center gap-2 text-slate-300">
            <input
              type="checkbox"
              checked={rules?.heroic_death ?? false}
              onChange={(e) => rules && onChange({ ...rules, heroic_death: e.target.checked })}
              className="w-4 h-4 accent-accent-600"
            />
            {t('sceneRules.heroicDeath')}
          </label>
          <p className="text-slate-500">{t('sceneRules.heroicDeathHint')}</p>
        </>
      )}
    </fieldset>
  );
};

interface SceneCreateModalProps {
  isOpen: boolean;
  definition?: SceneDefinition;
  onClose: () => void;
  onCreated: (scene: SceneDefinition) => void;
}

export const SceneCreateModal: React.FC<SceneCreateModalProps> = ({
  isOpen,
  onClose,
  onCreated,
  definition,
}) => {
  const { t } = useTranslation();
  const { availableCharacters, createStageScene, updateStageSceneDefinition, allLorebooks, refreshLorebooks, isProcessingStageTurn } = useStoreFields('availableCharacters', 'createStageScene', 'updateStageSceneDefinition', 'allLorebooks', 'refreshLorebooks', 'isProcessingStageTurn');

  const [title, setTitle] = useState(definition?.title ?? '');
  const [description, setDescription] = useState(definition?.description ?? '');
  const [worldContext, setWorldContext] = useState(definition?.world_context ?? '');
  // Defaults become scene content for the game master, so they follow the UI language.
  const [startingLocation, setStartingLocation] = useState(() => definition?.starting_location ?? translate('sceneNew.startLocationDefault'));
  const [timeOfDay, setTimeOfDay] = useState(() => definition?.time_of_day ?? translate('sceneNew.time.dusk'));
  const [openingNarration, setOpeningNarration] = useState(definition?.opening_narration ?? '');
  const [selectedParty, setSelectedParty] = useState<string[]>(definition?.party ?? []);
  const [gmTone, setGmTone] = useState(definition?.gm_tone ?? 'Epic Fantasy');
  const [narratorStyle, setNarratorStyle] = useState(() => definition?.narrator_style ?? translate('sceneNew.narratorStyleDefault'));
  const [persona, setPersona] = useState(() => definition?.persona ?? translate('sceneNew.personaDefault'));
  const [diceEnabled, setDiceEnabled] = useState(definition?.dice_rolls_enabled ?? true);
  const [rules, setRules] = useState<SceneRules | null>(definition?.rules ?? null);

  const [lorebooks, setLorebooks] = useState<string[]>(definition?.lorebook ?? []);
  const [actorDepth, setActorDepth] = useState(definition?.max_actor_depth ?? 3);
  const [background, setBackground] = useState(definition?.starting_bg ?? '');
  const [ambient, setAmbient] = useState(definition?.starting_ambient ?? 'None');
  const [lockBg, setLockBg] = useState(definition?.lock_bg ?? false);
  const [disableAmbient, setDisableAmbient] = useState(definition?.disable_ambient ?? false);
  const [assets, setAssets] = useState<{ backgrounds: string[]; ambient: string[] }>({ backgrounds: [], ambient: [] });
  const [backgroundPreview, setBackgroundPreview] = useState<{ name: string; url: string } | null>(null);
  const [assetError, setAssetError] = useState('');
  const [importing, setImporting] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    let subscribed = true;
    void refreshLorebooks();
    void api.listStageAssets().then((data) => { if (subscribed) setAssets(data); }).catch((err: unknown) => { if (subscribed) setAssetError(errorMessage(err)); });
    return () => { subscribed = false; };
  }, [isOpen, refreshLorebooks]);
  useEffect(() => {
    let subscribed = true;
    if (background) void api.getStageBackgroundImage(background).then((url) => { if (subscribed) setBackgroundPreview({ name: background, url }); }).catch(() => {});
    return () => { subscribed = false; };
  }, [background]);
  const importAsset = async (kind: 'backgrounds' | 'ambient') => {
    setImporting(true);
    setAssetError('');
    try {
      const file = await open({ multiple: false, filters: [{ name: kind, extensions: kind === 'backgrounds' ? ['png', 'jpg', 'jpeg', 'webp'] : ['mp3', 'wav', 'ogg'] }] });
      if (typeof file !== 'string') return;
      const name = await api.importStageAsset(file, kind);
      setAssets(await api.listStageAssets());
      if (kind === 'backgrounds') setBackground(name); else setAmbient(name);
    } catch (err) { setAssetError(errorMessage(err)); }
    finally { setImporting(false); }
  };
  const loreOptions = [...allLorebooks.map((book) => ({ id: book.id || book.name, name: book.name })),
    ...lorebooks.filter((id) => !allLorebooks.some((book) => book.id === id || book.name === id)).map((id) => ({ id, name: id }))];
  const partyOptions = [...new Set([...availableCharacters.map((char) => char.card.data.name || char.id), ...selectedParty])];

  const togglePartyMember = (name: string) => {
    setSelectedParty((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  // Pending and error state come from the action; the error is shown above the buttons.
  const [submitError, createScene, isSubmitting] = useActionState(async (): Promise<string | null> => {
    if (!title.trim()) return null;
    const id = `scene_custom_${Date.now()}`;
    const def: SceneDefinition = {
      ...definition,
      id: definition?.id ?? id,
      title: title.trim(),
      description: definition ? description.trim() : description.trim() || title.trim(),
      world_context: worldContext.trim(),
      starting_location: startingLocation.trim(),
      time_of_day: timeOfDay.trim(),
      opening_narration:
        definition ? openingNarration.trim() : openingNarration.trim() ||
        translate('sceneNew.defaultOpening', { location: startingLocation.trim() }),
      first_message: definition?.first_message ?? '',
      party: selectedParty,
      gm_tone: gmTone,
      narrator_style: narratorStyle.trim(),
      persona: persona.trim(),
      lorebook: lorebooks,
      solo_mode: selectedParty.length === 0,
      max_actor_depth: actorDepth,
      dice_rolls_enabled: diceEnabled,
      starting_bg: background,
      starting_ambient: ambient,
      lock_bg: lockBg,
      disable_ambient: disableAmbient,
      rules,
      created_at: definition?.created_at ?? new Date().toISOString(),
      last_played: definition?.last_played ?? new Date().toISOString(),
    };

    try {
      const created = definition ? await updateStageSceneDefinition(def) : await createStageScene(def);
      onCreated(created.definition);
      onClose();
      return null;
    } catch (err) {
      return translate(definition ? 'sceneEdit.saveFailed' : 'sceneNew.createFailed', { error: errorMessage(err) });
    }
  }, null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || importing || isProcessingStageTurn) return;
    // Not `<form action>`: that resets the form, which would blank these controlled fields on errors.
    startTransition(createScene);
  };

  if (!isOpen) return null;

  return (
    <ModalOverlay onClose={isSubmitting || importing ? undefined : onClose} aria-labelledby="scene-create-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-app/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-accent-500/10 border border-accent-500/20 text-accent-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 id="scene-create-title" className="text-base font-bold text-slate-100">{t(definition ? 'sceneEdit.title' : 'sceneNew.title')}</h3>
              <p className="text-xs text-slate-400">{t(definition ? 'sceneEdit.intro' : 'sceneNew.intro')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting || importing}
            title={t('common.close')}
            aria-label={t('common.close')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
          {/* Title & Location */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="scene-title" className="font-semibold text-slate-300 block mb-1">
                {t('sceneNew.sceneTitle')}{' '}
                <span className="text-rose-400" title={t('sceneNew.required')} aria-hidden>
                  *
                </span>
              </label>
              <input
                id="scene-title"
                data-autofocus
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('sceneNew.titlePlaceholder')}
                className="w-full px-3 py-2 bg-app border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-accent-500"
              />
            </div>

            <div>
              <label htmlFor="scene-location" className="font-semibold text-slate-300 block mb-1">{t('sceneNew.startLocation')}</label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" aria-hidden />
                <input
                  id="scene-location"
                  type="text"
                  value={startingLocation}
                  onChange={(e) => setStartingLocation(e.target.value)}
                  placeholder={t('sceneNew.locationPlaceholder')}
                  className="w-full pl-9 pr-3 py-2 bg-app border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-accent-500"
                />
              </div>
            </div>
          </div>

          {/* Description & Time */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="scene-description" className="font-semibold text-slate-300 block mb-1">{t('sceneNew.description')}</label>
              <input
                id="scene-description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('sceneNew.descriptionPlaceholder')}
                className="w-full px-3 py-2 bg-app border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-accent-500"
              />
            </div>

            <div>
              <label htmlFor="scene-time" className="font-semibold text-slate-300 block mb-1">{t('sceneNew.timeOfDay')}</label>
              <div className="relative">
                <Sun className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" aria-hidden />
                <select
                  id="scene-time"
                  value={timeOfDay}
                  onChange={(e) => setTimeOfDay(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-app border border-slate-700 rounded-xl text-slate-100 focus:outline-hidden focus:border-accent-500"
                >
                  {!(['morning', 'noon', 'dusk', 'evening', 'midnight'] as const).some((time) => t(`sceneNew.time.${time}`) === timeOfDay) && <option value={timeOfDay}>{timeOfDay}</option>}
                  {(['morning', 'noon', 'dusk', 'evening', 'midnight'] as const).map((time) => (
                    <option key={time} value={t(`sceneNew.time.${time}`)}>
                      {t(`sceneNew.time.${time}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* World Context */}
          <div>
            <label htmlFor="scene-world" className="font-semibold text-slate-300 block mb-1">
              {t('sceneNew.worldContext')}
            </label>
            <textarea
              id="scene-world"
              rows={2}
              value={worldContext}
              onChange={(e) => setWorldContext(e.target.value)}
              placeholder={t('sceneNew.worldContextPlaceholder')}
              className="w-full px-3 py-2 bg-app border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-accent-500 resize-none"
            />
          </div>

          {/* Opening Narration */}
          <div>
            <label htmlFor="scene-opening" className="font-semibold text-slate-300 block mb-1">
              {t('sceneNew.opening')}
            </label>
            <textarea
              id="scene-opening"
              rows={3}
              value={openingNarration}
              onChange={(e) => setOpeningNarration(e.target.value)}
              placeholder={t('sceneNew.openingPlaceholder')}
              className="w-full px-3 py-2 bg-app border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-accent-500 resize-none"
            />
          </div>

          {/* Party Members selection */}
          <div>
            <div className="font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
              <span id="scene-party-label">{t('sceneNew.party')}</span>
              <span className="text-xs text-accent-400 font-normal">
                {t('sceneNew.selectedCount', { count: selectedParty.length })}
              </span>
            </div>
            <div role="group" aria-labelledby="scene-party-label" className="flex flex-wrap gap-2 p-3 bg-app/60 border border-slate-800 rounded-xl max-h-32 overflow-y-auto">
              {partyOptions.map((charName) => {
                const isSelected = selectedParty.includes(charName);
                return (
                  <button
                    type="button"
                    key={charName}
                    onClick={() => togglePartyMember(charName)}
                    aria-pressed={isSelected}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition ${
                      isSelected
                        ? 'bg-accent-600/30 border-accent-500 text-accent-200 font-semibold'
                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <UserCheck className={`w-3.5 h-3.5 ${isSelected ? 'text-accent-400' : 'opacity-0'}`} />
                    <span>{charName}</span>
                  </button>
                );
              })}
              {partyOptions.length === 0 && (
                <span className="text-slate-400 text-xs italic">
                  {t('sceneNew.noCharacters')}
                </span>
              )}
            </div>
          </div>

          {/* GM Tone & Narrator Style */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="scene-tone" className="font-semibold text-slate-300 block mb-1">{t('sceneNew.gmTone')}</label>
              <select
                id="scene-tone"
                value={gmTone}
                onChange={(e) => setGmTone(e.target.value)}
                className="w-full px-3 py-2 bg-app border border-slate-700 rounded-xl text-slate-100 focus:outline-hidden focus:border-accent-500"
              >
                {!['Epic Fantasy', 'Dark Fantasy', 'Sci-Fi Cyberpunk', 'Anime Comedy', 'Eldritch Mystery', 'Isekai Adventure'].includes(gmTone) && <option value={gmTone}>{gmTone}</option>}
                <option value="Epic Fantasy">{t('sceneNew.tone.epic')}</option>
                <option value="Dark Fantasy">{t('sceneNew.tone.dark')}</option>
                <option value="Sci-Fi Cyberpunk">{t('sceneNew.tone.scifi')}</option>
                <option value="Anime Comedy">{t('sceneNew.tone.comedy')}</option>
                <option value="Eldritch Mystery">{t('sceneNew.tone.eldritch')}</option>
                <option value="Isekai Adventure">{t('sceneNew.tone.isekai')}</option>
              </select>
            </div>

            <div>
              <label htmlFor="scene-style" className="font-semibold text-slate-300 block mb-1">{t('sceneNew.narratorStyle')}</label>
              <input
                id="scene-style"
                type="text"
                value={narratorStyle}
                onChange={(e) => setNarratorStyle(e.target.value)}
                placeholder={t('sceneNew.narratorStylePlaceholder')}
                className="w-full px-3 py-2 bg-app border border-slate-700 rounded-xl text-slate-100 focus:outline-hidden focus:border-accent-500"
              />
            </div>

            <div>
              <label htmlFor="scene-persona" className="font-semibold text-slate-300 block mb-1">{t('sceneNew.persona')}</label>
              <input
                id="scene-persona"
                type="text"
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                placeholder={t('sceneNew.personaPlaceholder')}
                className="w-full px-3 py-2 bg-app border border-slate-700 rounded-xl text-slate-100 focus:outline-hidden focus:border-accent-500"
              />
            </div>
          </div>

          <fieldset className="p-3 border border-slate-700 rounded-xl space-y-2">
            <legend className="text-slate-300 px-1">{t('sceneEdit.lorebooks')}</legend>
            {loreOptions.map((book) => {
              const bound = lorebooks.includes(book.id) || lorebooks.includes(book.name);
              return <label key={book.id} className="flex items-center gap-2">
                <input type="checkbox" checked={bound} onChange={() => setLorebooks((old) => bound ? old.filter((id) => id !== book.id && id !== book.name) : [...old, book.id])} />{book.name}
              </label>;
            })}
            {loreOptions.length === 0 && <p className="text-slate-400">{t('sceneEdit.noLorebooks')}</p>}
          </fieldset>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="scene-background" className="block mb-1 text-slate-300">{t('sceneEdit.background')}</label>
              <select id="scene-background" value={background} onChange={(e) => setBackground(e.target.value)} className="w-full p-2 bg-app border border-slate-700 rounded-xl">
                <option value="">{t('sceneEdit.none')}</option>
                {[...new Set([...assets.backgrounds, ...(background ? [background] : [])])].map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
              <button type="button" disabled={importing || isSubmitting} onClick={() => void importAsset('backgrounds')} className="mt-2 text-accent-300">{t('sceneEdit.importImage')}</button>
            </div>
            <div>
              <label htmlFor="scene-ambient" className="block mb-1 text-slate-300">{t('sceneEdit.ambient')}</label>
              <select id="scene-ambient" value={ambient} onChange={(e) => setAmbient(e.target.value)} className="w-full p-2 bg-app border border-slate-700 rounded-xl">
                <option value="None">{t('sceneEdit.none')}</option>
                {[...new Set([...assets.ambient, ...(ambient && ambient !== 'None' ? [ambient] : [])])].map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
              <button type="button" disabled={importing || isSubmitting} onClick={() => void importAsset('ambient')} className="mt-2 text-accent-300">{t('sceneEdit.importAudio')}</button>
            </div>
          </div>
          {backgroundPreview?.name === background && <img src={backgroundPreview.url} alt={t('sceneEdit.background')} className="w-full max-h-40 rounded-xl object-cover" />}
          <p className="text-slate-400">{t('sceneEdit.ambientHint')}</p>
          <div className="space-y-2">
            <label className="flex gap-2"><input type="checkbox" checked={lockBg} onChange={(e) => setLockBg(e.target.checked)} />{t('sceneEdit.lockBg')}</label>
            <label className="flex gap-2"><input type="checkbox" checked={disableAmbient} onChange={(e) => setDisableAmbient(e.target.checked)} />{t('sceneEdit.disableAmbient')}</label>
            <label htmlFor="scene-actors" className="block">{t('sceneEdit.actors')}</label>
            <input id="scene-actors" type="number" min={1} max={6} required value={actorDepth} onChange={(e) => setActorDepth(Number(e.target.value))} className="w-24 p-2 bg-app border border-slate-700 rounded-xl" />
          </div>
          {assetError && <p role="alert" className="text-rose-300">{assetError}</p>}

          {/* Dice toggle */}
          <div className="flex items-center gap-3 p-3 bg-app/60 border border-slate-800 rounded-xl">
            <input
              type="checkbox"
              id="diceToggle"
              checked={diceEnabled}
              onChange={(e) => setDiceEnabled(e.target.checked)}
              className="w-4 h-4 accent-accent-600 rounded"
            />
            <label htmlFor="diceToggle" className="cursor-pointer text-xs text-slate-300 font-medium">
              {t('sceneNew.dice')}
            </label>
          </div>

          <SceneRulesFields rules={rules} party={selectedParty} onChange={setRules} />

          {submitError && (
            <p role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {submitError}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting || importing}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || importing || isProcessingStageTurn || !title.trim()}
              className="px-5 py-2 rounded-xl bg-accent-600 hover:bg-accent-500 text-white font-semibold flex items-center gap-1.5 shadow-lg shadow-accent-950/50 transition disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isSubmitting ? t('sceneNew.creating') : t(definition ? 'sceneEdit.save' : 'sceneNew.start')}</span>
            </button>
          </div>
        </form>
      </div>
    </ModalOverlay>
  );
};
