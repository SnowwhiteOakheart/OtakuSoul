import React, { useState } from 'react';
import { Swords, Users } from 'lucide-react';
import { ModalOverlay } from '../ui/ModalOverlay';
import { useStoreFields } from '../../store/useAppStore';
import { useTranslation } from '../../i18n';
import type { ScenePreview } from '../../types';

/** Companions at most (plus the player). */
const MAX_COMPANIONS = 5;
const CLASSES = ['fighter', 'wizard', 'rogue', 'cleric'] as const;

/** The 5e class a character card brings (`extensions.otakusoul_5e.class`). */
export const cardClass = (extensions: Record<string, unknown> | undefined) => {
  const value = (extensions?.otakusoul_5e as Record<string, unknown> | undefined)?.class;
  return typeof value === 'string' ? value : '';
};

interface Props {
  scene: ScenePreview;
  onStart: (party: string[], heroClasses: Record<string, string>) => void;
  onClose: () => void;
}

/**
 * Who goes on a 5e adventure: the scene's classic heroes, your own companions, or a mix.
 * Own companions bring the class from their card or get one chosen here.
 */
export const AdventurePartyModal: React.FC<Props> = ({ scene, onStart, onClose }) => {
  const { t } = useTranslation();
  const { availableCharacters } = useStoreFields('availableCharacters');
  const classic = scene.party;
  const own = availableCharacters
    .map((c) => ({ name: c.card.data.name, cardClass: cardClass(c.card.data.extensions as Record<string, unknown>) }))
    .filter((c) => !classic.some((name) => name.toLowerCase() === c.name.toLowerCase()));
  const [selected, setSelected] = useState<string[]>(classic);
  const [classes, setClasses] = useState<Record<string, string>>({});
  const toggle = (name: string) =>
    setSelected((current) => (current.includes(name) ? current.filter((n) => n !== name) : current.length < MAX_COMPANIONS ? [...current, name] : current));
  const start = () => {
    const chosen = Object.fromEntries(Object.entries(classes).filter(([name, id]) => id && selected.includes(name)));
    onStart(selected, chosen);
  };

  const row = (name: string, label: string, ownClass?: string) => (
    <li key={name} className="flex items-center gap-2">
      <label className="flex flex-1 items-center gap-2 text-slate-200">
        <input type="checkbox" data-member={name} checked={selected.includes(name)} onChange={() => toggle(name)} />
        <span className="truncate">{name}</span>
        <span className="text-[11px] text-slate-500">{label}</span>
      </label>
      {ownClass !== undefined && selected.includes(name) && (
        <select
          aria-label={t('adventureParty.classFor', { name })}
          value={classes[name] ?? ownClass}
          onChange={(e) => setClasses((all) => ({ ...all, [name]: e.target.value }))}
          className="p-1 bg-app border border-slate-700 rounded-lg text-xs"
        >
          <option value="">{t('sceneRules.classAuto')}</option>
          {CLASSES.map((id) => (
            <option key={id} value={id}>{t(`sceneRules.class.${id}`)}</option>
          ))}
        </select>
      )}
    </li>
  );

  return (
    <ModalOverlay onClose={onClose} closeOnBackdrop aria-labelledby="adventure-party-title" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div data-testid="adventure-party" className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4 text-sm text-slate-200 shadow-2xl">
        <h2 id="adventure-party-title" className="flex items-center gap-2 text-lg font-bold text-slate-100">
          <Users className="w-5 h-5 text-accent-400" /> {t('adventureParty.title')}
        </h2>
        <p className="text-slate-400">{t('adventureParty.hint', { scene: scene.title })}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setSelected(classic)} className="rounded-lg border border-slate-600 px-2 py-1 text-xs font-semibold hover:bg-slate-800">
            {t('adventureParty.classic')}
          </button>
          <button type="button" onClick={() => setSelected([])} className="rounded-lg border border-slate-600 px-2 py-1 text-xs font-semibold hover:bg-slate-800">
            {t('adventureParty.ownOnly')}
          </button>
        </div>
        {classic.length > 0 && (
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase text-slate-400">{t('adventureParty.classicHeroes')}</h3>
            <ul className="space-y-1">{classic.map((name) => row(name, t('adventureParty.classicLabel')))}</ul>
          </section>
        )}
        {own.length > 0 && (
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase text-slate-400">{t('adventureParty.ownCompanions')}</h3>
            <ul className="space-y-1 max-h-56 overflow-y-auto pr-1">
              {own.map((c) => row(c.name, c.cardClass ? t(`sceneRules.class.${c.cardClass}` as 'sceneRules.class.fighter') : '', c.cardClass))}
            </ul>
          </section>
        )}
        <p className="text-xs text-slate-500">{t('adventureParty.limit', { count: selected.length, max: MAX_COMPANIONS })}</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-800 px-4 py-2 font-semibold hover:bg-slate-700">
            {t('common.cancel')}
          </button>
          <button
            type="button"
            data-testid="adventure-start"
            onClick={start}
            className="flex items-center gap-1.5 rounded-xl bg-accent-600 px-4 py-2 font-semibold text-white hover:bg-accent-500"
          >
            <Swords className="w-4 h-4" /> {t('adventureParty.start')}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
};
