import { useMemo, useState } from 'react';
import { UserPlus, Users, X } from 'lucide-react';
import { useStoreFields } from '../../store/useAppStore';
import { useTranslation } from '../../i18n';
import { ModalOverlay } from '../ui/ModalOverlay';
import { reportFailure } from '../../store/reportFailure';
import { MAX_CHAT_GUESTS, chatGuests, presentedAs } from '../../utils/groupChat';
import type { CharacterProfile } from '../../types';

/**
 * Who takes part in the open chat: its own character and invited guests (group chat). Guests
 * answer with their own card and memory; the user picks or addresses who speaks.
 */
export const ChatGuestsPanel = ({ chatId }: { chatId: string }) => {
  const { t } = useTranslation();
  const { activeCharacter, availableCharacters, chatSessions, setChatMembers, replyLanguage } = useStoreFields(
    'activeCharacter', 'availableCharacters', 'chatSessions', 'setChatMembers', 'replyLanguage',
  );
  const session = chatSessions.find((s) => s.id === chatId);
  const guests = chatGuests(session, availableCharacters);
  const [picking, setPicking] = useState(false);
  const save = (members: string[]) => setChatMembers(chatId, members).catch((e) => reportFailure('Saving chat guests failed:', e));
  if (!activeCharacter) return null;

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs" data-chat-guests>
      <p className="text-slate-400">{t('group.intro')}</p>
      <ul className="space-y-1.5">
        <GuestRow character={activeCharacter} replyLanguage={replyLanguage} note={t('group.host')} />
        {guests.map((guest) => (
          <GuestRow key={guest.id} character={guest} replyLanguage={replyLanguage}
            onRemove={() => void save(guests.filter((g) => g.id !== guest.id).map((g) => g.id))} />
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setPicking(true)}
        disabled={guests.length >= MAX_CHAT_GUESTS}
        className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-slate-200 hover:bg-slate-800 disabled:opacity-40"
      >
        <UserPlus className="w-3.5 h-3.5" />
        {t('group.invite')}
      </button>
      {guests.length >= MAX_CHAT_GUESTS && <p className="text-slate-500">{t('group.full', { count: MAX_CHAT_GUESTS })}</p>}
      {picking && (
        <GuestPicker
          exclude={[activeCharacter.id, ...guests.map((g) => g.id)]}
          onPick={(id) => {
            setPicking(false);
            void save([...guests.map((g) => g.id), id]);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
};

const GuestRow = ({ character, replyLanguage, note, onRemove }: {
  character: CharacterProfile; replyLanguage: string; note?: string; onRemove?: () => void;
}) => {
  const { t } = useTranslation();
  const name = presentedAs(character, replyLanguage).name;
  return (
    <li className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-2 py-1.5" data-guest={character.id}>
      {character.avatar_data_url
        ? <img src={character.avatar_data_url} alt="" className="w-6 h-6 rounded-full object-cover" />
        : <Users className="w-4 h-4 text-slate-500" aria-hidden="true" />}
      <span className="flex-1 truncate text-slate-200">{name}</span>
      {note && <span className="text-[10px] text-slate-500">{note}</span>}
      {onRemove && (
        <button type="button" onClick={onRemove} className="p-1 text-slate-400 hover:text-rose-400"
          aria-label={t('group.remove', { name })} title={t('group.remove', { name })}>
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </li>
  );
};

/** Choose a character from the library to invite. */
const GuestPicker = ({ exclude, onPick, onClose }: { exclude: string[]; onPick: (id: string) => void; onClose: () => void }) => {
  const { t } = useTranslation();
  const { availableCharacters, replyLanguage } = useStoreFields('availableCharacters', 'replyLanguage');
  const [query, setQuery] = useState('');
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return availableCharacters
      .filter((c) => !exclude.includes(c.id))
      .map((c) => ({ character: c, name: presentedAs(c, replyLanguage).name }))
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [availableCharacters, exclude, query, replyLanguage]);

  return (
    <ModalOverlay onClose={onClose} aria-labelledby="guest-picker-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-xl space-y-3" data-guest-picker>
        <h2 id="guest-picker-title" className="text-sm font-semibold text-slate-100">{t('group.pickTitle')}</h2>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('group.search')}
          aria-label={t('group.search')}
          autoFocus
          className="w-full rounded-lg border border-slate-700 bg-app px-3 py-1.5 text-sm text-slate-100"
        />
        <ul className="max-h-80 overflow-y-auto space-y-1">
          {candidates.map(({ character, name }) => (
            <li key={character.id}>
              <button type="button" onClick={() => onPick(character.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-slate-800">
                {character.avatar_data_url
                  ? <img src={character.avatar_data_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                  : <Users className="w-4 h-4 text-slate-500" aria-hidden="true" />}
                {name}
              </button>
            </li>
          ))}
          {candidates.length === 0 && <li className="px-2 py-1.5 text-xs text-slate-500">{t('group.noCandidates')}</li>}
        </ul>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700">
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
};
