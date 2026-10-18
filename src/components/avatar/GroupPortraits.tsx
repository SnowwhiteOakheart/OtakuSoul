import { useAppStore } from '../../store/useAppStore';
import { useTranslation } from '../../i18n';
import { NEUTRAL_EMOTION } from '../../store/slices/avatarSlice';
import { selectCharacterPortrait } from '../../utils/characterPortraits';
import { presentedAs } from '../../utils/groupChat';
import { breathSeconds } from '../../utils/portraitMotion';
import { MorphingPortrait } from './AvatarCanvas';
import type { CharacterProfile } from '../../types';

/**
 * Group chat, "show everyone": all characters present as 2D portraits with their own last
 * expression; the one speaking (or whose turn it was last) is highlighted. 3D/Live2D stays for
 * the single view, several live models at once would cost too much.
 */
export const GroupPortraits = ({ speakers, speakerId, isSpeaking }: {
  speakers: { id: string; character: CharacterProfile }[];
  speakerId: string;
  isSpeaking: boolean;
}) => {
  const { t } = useTranslation();
  const emotions = useAppStore((s) => s.speakerEmotions);
  const replyLanguage = useAppStore((s) => s.replyLanguage);
  return (
    <div className="w-full h-full overflow-y-auto grid grid-cols-2 content-center gap-3 p-3 bg-linear-to-b from-slate-900/60 via-accent-950/30 to-app"
      role="list" aria-label={t('group.everyone')} data-group-portraits>
      {speakers.map(({ id, character }) => {
        const emotion = emotions[id] ?? NEUTRAL_EMOTION;
        const src = selectCharacterPortrait(character, emotion.emotion, emotion.vrm_expression, emotion.portrait) || character.avatar_data_url;
        const name = presentedAs(character, replyLanguage).name;
        const active = id === speakerId;
        return (
          <figure key={id || 'host'} role="listitem" aria-current={active || undefined} data-portrait-speaker={id || 'host'}
            className={`flex flex-col items-center gap-1.5 rounded-2xl p-1.5 transition-opacity ${active ? 'bg-accent-500/10 ring-2 ring-accent-400/70' : 'opacity-75'}`}>
            {src ? (
              <MorphingPortrait src={src} fallbackSrc={character.avatar_data_url} alt={name} isSpeaking={active && isSpeaking} breath={breathSeconds(emotion)} />
            ) : (
              <div className="w-full aspect-[4/5] rounded-3xl bg-linear-to-tr from-accent-600 to-accent2-600 flex items-center justify-center text-white text-4xl font-bold">
                {name.charAt(0)}
              </div>
            )}
            <figcaption className={`text-xs font-semibold ${active ? 'text-accent-200' : 'text-slate-300'}`}>{name}</figcaption>
          </figure>
        );
      })}
    </div>
  );
};
