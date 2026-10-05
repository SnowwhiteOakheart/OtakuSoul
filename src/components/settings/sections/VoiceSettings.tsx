import { useState } from 'react';
import { useStoreFields } from '../../../store/useAppStore';
import { useTranslation } from '../../../i18n';
import { CharacterVoiceModal } from '../../voice/CharacterVoiceModal';
import { STAGE_NARRATOR_VOICE_ID } from '../../../services/stageVoice';

/**
 * Speech in one place: voice output, speech recognition and RVC per character and for the
 * Soul Stage narrator, including the local speech models (downloaded with the local engine).
 */
export const VoiceSettings = () => {
  const { t } = useTranslation();
  const { availableCharacters, activeCharacter } = useStoreFields('availableCharacters', 'activeCharacter');
  const [targetId, setTargetId] = useState(activeCharacter?.id ?? STAGE_NARRATOR_VOICE_ID);

  const narrator = { id: STAGE_NARRATOR_VOICE_ID, name: t('stage.narratorVoice') };
  const characters = availableCharacters.map((c) => ({ id: c.id, name: c.card.data.name }));
  const target = [...characters, narrator].find((entry) => entry.id === targetId) ?? narrator;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
        <p className="text-xs text-slate-400">{t('settings.voiceIntro')}</p>
        <label className="block max-w-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-300">{t('settings.voiceFor')}</span>
          <select
            id="setting-voice-target"
            value={target.id}
            onChange={(event) => setTargetId(event.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-app px-3 py-2 text-sm text-slate-100"
          >
            {characters.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
                {entry.id === activeCharacter?.id ? ` (${t('settings.voiceActive')})` : ''}
              </option>
            ))}
            <option value={narrator.id}>{narrator.name}</option>
          </select>
        </label>
      </div>
      {/* Remounts per target so a draft never carries over to another voice. */}
      <CharacterVoiceModal key={target.id} target={target} embedded />
    </div>
  );
};
