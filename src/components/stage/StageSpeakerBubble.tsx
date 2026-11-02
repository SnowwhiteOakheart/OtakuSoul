import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { useStoreFields } from '../../store/useAppStore';
import { useTranslation } from '../../i18n';
import { useStageSpeech } from '../../services/stageSpeech';
import { findCharacterByName } from '../../utils/characterName';
import { selectCharacterPortrait } from '../../utils/characterPortraits';
import { bubbleText } from '../companion/petBehavior';

/**
 * While the Stage voice reads, the speaker's portrait with the feeling of the current sentence
 * and that sentence as a speech bubble, in time with the voice. Game master and NPCs speak
 * with the narrator's voice and get the book instead of a portrait.
 */
export const StageSpeakerBubble = () => {
  const { t } = useTranslation();
  const line = useStageSpeech((s) => s.line);
  const { availableCharacters } = useStoreFields('availableCharacters');
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  if (!line) return null;

  const character = line.role === 'companion' ? findCharacterByName(availableCharacters, line.speaker) : undefined;
  const emotion = line.emotion;
  const picked = character
    ? selectCharacterPortrait(character, emotion?.emotion ?? 'neutral', emotion?.vrm_expression ?? 'neutral', emotion?.portrait ?? undefined)
    : undefined;
  const src = picked && picked !== brokenSrc ? picked : (character?.avatar_data_url ?? undefined);
  const text = bubbleText(line.text);
  if (!text) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-4" data-testid="stage-speaker">
      <figure
        key={line.speaker}
        className="flex max-w-2xl items-end gap-3 stage-speaker-in"
        data-expression={emotion?.vrm_expression ?? 'neutral'}
      >
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border-2 border-accent-400/60 bg-slate-800 shadow-lg shadow-black/40">
          {src ? (
            <img src={src} alt={line.speaker} onError={() => setBrokenSrc(picked ?? null)} className="h-full w-full object-cover object-top" />
          ) : character ? (
            <span className="flex h-full items-center justify-center text-2xl font-bold text-accent-200">{line.speaker.charAt(0)}</span>
          ) : (
            <span className="flex h-full items-center justify-center text-amber-300" aria-hidden>
              <BookOpen className="h-7 w-7" />
            </span>
          )}
        </div>
        <figcaption className="relative rounded-2xl rounded-bl-sm border border-slate-700 bg-slate-900/95 px-4 py-2.5 shadow-xl shadow-black/40 backdrop-blur">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-accent-300">
            {line.speaker || t('stage.narratorVoice')}
          </span>
          <span key={line.id} role="status" aria-live="polite" className="block text-sm leading-snug text-slate-100 stage-sentence-in">
            {text}
          </span>
        </figcaption>
      </figure>
    </div>
  );
};
