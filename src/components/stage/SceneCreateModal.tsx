import React, { useState } from 'react';
import { useStoreFields } from '../../store/useAppStore';
import { SceneDefinition, CharacterProfile } from '../../types';
import { X, Sparkles, MapPin, Sun, UserCheck } from 'lucide-react';
import { ModalOverlay } from '../ui/ModalOverlay';
import { translate, useTranslation } from '../../i18n';

interface SceneCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (scene: SceneDefinition) => void;
}

export const SceneCreateModal: React.FC<SceneCreateModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const { t } = useTranslation();
  const { availableCharacters, createStageScene } = useStoreFields('availableCharacters', 'createStageScene');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [worldContext, setWorldContext] = useState('');
  // Defaults become scene content for the game master, so they follow the UI language.
  const [startingLocation, setStartingLocation] = useState(() => translate('sceneNew.startLocationDefault'));
  const [timeOfDay, setTimeOfDay] = useState(() => translate('sceneNew.time.dusk'));
  const [openingNarration, setOpeningNarration] = useState('');
  const [selectedParty, setSelectedParty] = useState<string[]>([]);
  const [gmTone, setGmTone] = useState('Epic Fantasy');
  const [narratorStyle, setNarratorStyle] = useState(() => translate('sceneNew.narratorStyleDefault'));
  const [persona, setPersona] = useState(() => translate('sceneNew.personaDefault'));
  const [diceEnabled, setDiceEnabled] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const togglePartyMember = (name: string) => {
    setSelectedParty((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSubmitting) return;

    setIsSubmitting(true);
    const id = `scene_custom_${Date.now()}`;
    const def: SceneDefinition = {
      id,
      title: title.trim(),
      description: description.trim() || title.trim(),
      world_context: worldContext.trim(),
      starting_location: startingLocation.trim(),
      time_of_day: timeOfDay.trim(),
      opening_narration:
        openingNarration.trim() ||
        translate('sceneNew.defaultOpening', { location: startingLocation.trim() }),
      first_message: '',
      party: selectedParty,
      gm_tone: gmTone,
      narrator_style: narratorStyle.trim(),
      persona: persona.trim(),
      lorebook: [],
      solo_mode: selectedParty.length === 0,
      max_actor_depth: 3,
      dice_rolls_enabled: diceEnabled,
      starting_bg: '',
      starting_ambient: 'None',
      created_at: new Date().toISOString(),
      last_played: new Date().toISOString(),
    };

    try {
      const created = await createStageScene(def);
      if (created) {
        onCreated(created.definition);
        onClose();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose} aria-labelledby="scene-create-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-app/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-accent-500/10 border border-accent-500/20 text-accent-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 id="scene-create-title" className="text-base font-bold text-slate-100">{t('sceneNew.title')}</h3>
              <p className="text-xs text-slate-400">{t('sceneNew.intro')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
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
              {availableCharacters.map((char: CharacterProfile) => {
                const charName = char.card.data.name || char.id;
                const isSelected = selectedParty.includes(charName);
                return (
                  <button
                    type="button"
                    key={char.id}
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
              {availableCharacters.length === 0 && (
                <span className="text-slate-500 text-xs italic">
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

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title.trim()}
              className="px-5 py-2 rounded-xl bg-accent-600 hover:bg-accent-500 text-white font-semibold flex items-center gap-1.5 shadow-lg shadow-accent-950/50 transition disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isSubmitting ? t('sceneNew.creating') : t('sceneNew.start')}</span>
            </button>
          </div>
        </form>
      </div>
    </ModalOverlay>
  );
};
