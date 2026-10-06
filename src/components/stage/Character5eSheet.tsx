import React from 'react';
import { ModalOverlay } from '../ui/ModalOverlay';
import { useStoreFields } from '../../store/useAppStore';
import { useTranslation, type TranslationKey } from '../../i18n';
import { damageTypeLabel, localizedName } from '../../utils/combatEvents';
import type { Combatant } from '../../types';

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
const modifier = (score: number) => Math.floor((score - 10) / 2);
const signed = (value: number) => (value >= 0 ? `+${value}` : `${value}`);

/** Compact 5e character sheet: abilities, armor class, hit points, attacks. */
export const Character5eSheet: React.FC<{ member: Combatant; onClose: () => void }> = ({ member, onClose }) => {
  const { t } = useTranslation();
  const { appLanguage } = useStoreFields('appLanguage');
  const stats = member.stats5e;
  if (!stats) return null;
  const proficiency = 2 + Math.floor((Math.max(1, stats.level) - 1) / 4);
  const perception =
    10 + modifier(stats.abilities[4] ?? 10) + (stats.skill_proficiencies.includes('perception') ? proficiency : 0);
  return (
    <ModalOverlay onClose={onClose} closeOnBackdrop aria-labelledby="sheet-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4 text-sm text-slate-200 shadow-2xl">
        <h2 id="sheet-title" className="text-lg font-bold text-slate-100">
          {member.name}
          <span className="ml-2 text-sm font-normal text-slate-400">
            {stats.class_id ? t(`sceneRules.class.${stats.class_id}` as TranslationKey) : ''} · {t('fight.sheet.level', { level: stats.level })}
          </span>
        </h2>
        <div className="grid grid-cols-6 gap-1.5 text-center">
          {ABILITIES.map((ability, index) => (
            <div key={ability} className="rounded-lg border border-slate-700 bg-app/60 py-1.5">
              <div className="text-[10px] uppercase text-slate-400">{t(`fight.ability.${ability}` as TranslationKey)}</div>
              <div className="text-base font-bold">{signed(modifier(stats.abilities[index] ?? 10))}</div>
              <div className="text-[11px] text-slate-500">{stats.abilities[index]}</div>
            </div>
          ))}
        </div>
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <div><dt className="text-slate-400">{t('fight.sheet.ac')}</dt><dd className="text-base font-bold">{stats.armor_class}</dd></div>
          <div><dt className="text-slate-400">{t('fight.sheet.hp')}</dt><dd className="text-base font-bold">{member.hp}/{member.max_hp}</dd></div>
          <div><dt className="text-slate-400">{t('fight.sheet.speed')}</dt><dd>{t('fight.sheet.feet', { feet: stats.speed_ft })}</dd></div>
          <div><dt className="text-slate-400">{t('fight.sheet.perception')}</dt><dd>{perception}</dd></div>
          <div><dt className="text-slate-400">{t('fight.sheet.proficiency')}</dt><dd>{signed(proficiency)}</dd></div>
          <div><dt className="text-slate-400">{t('fight.sheet.hitDice')}</dt><dd>{stats.hit_dice_left}× W{stats.hit_die}</dd></div>
        </dl>
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase text-slate-400">{t('fight.sheet.attacks')}</h3>
          <ul className="space-y-1 text-xs">
            {stats.attacks.map((attack) => (
              <li key={attack.id} className="flex justify-between rounded-lg bg-app/60 px-2 py-1">
                <span>{localizedName(attack.name, appLanguage)}</span>
                <span className="text-slate-400">
                  {signed(attack.to_hit)} · {attack.damage} {damageTypeLabel(attack.damage_type)}
                  {attack.range_ft > 0 ? ` · ${t('fight.sheet.feet', { feet: attack.range_ft })}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-800 px-4 py-2 font-semibold hover:bg-slate-700">
            {t('common.close')}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
};
