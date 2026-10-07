import React from 'react';
import { ModalOverlay } from '../ui/ModalOverlay';
import { useStoreFields } from '../../store/useAppStore';
import { useTranslation, type TranslationKey } from '../../i18n';
import { conditionLabel, damageTypeLabel, localizedName } from '../../utils/combatEvents';
import { useSrdSpells } from '../../utils/srdSpells';
import type { Combatant } from '../../types';

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
type AbilityId = (typeof ABILITIES)[number];
/** The 18 SRD skills with their ability (same table as `rules5e/skills.rs`). */
const SKILLS: [string, AbilityId][] = [
  ['acrobatics', 'dex'], ['animal_handling', 'wis'], ['arcana', 'int'], ['athletics', 'str'], ['deception', 'cha'],
  ['history', 'int'], ['insight', 'wis'], ['intimidation', 'cha'], ['investigation', 'int'], ['medicine', 'wis'],
  ['nature', 'int'], ['perception', 'wis'], ['performance', 'cha'], ['persuasion', 'cha'], ['religion', 'int'],
  ['sleight_of_hand', 'dex'], ['stealth', 'dex'], ['survival', 'wis'],
];
const modifier = (score: number) => Math.floor((score - 10) / 2);
const signed = (value: number) => (value >= 0 ? `+${value}` : `${value}`);

/** 5e character sheet: abilities, saves, skills, armor class, hit points, attacks, spells, death saves. */
export const Character5eSheet: React.FC<{ member: Combatant; onClose: () => void }> = ({ member, onClose }) => {
  const { t } = useTranslation();
  const { appLanguage } = useStoreFields('appLanguage');
  const spellData = useSrdSpells();
  const stats = member.stats5e;
  if (!stats) return null;
  const proficiency = 2 + Math.floor((Math.max(1, stats.level) - 1) / 4);
  const mod = (ability: AbilityId) => modifier(stats.abilities[ABILITIES.indexOf(ability)] ?? 10);
  const perception = 10 + mod('wis') + (stats.skill_proficiencies.includes('perception') ? proficiency : 0);
  const casting = stats.spellcasting;
  const spellName = (id: string) => {
    const spell = spellData.get(id);
    return spell ? localizedName(spell.name, appLanguage) : id.replace(/_/g, ' ');
  };
  const spellLevel = (id: string) => spellData.get(id)?.level ?? 0;
  const deathSaves = stats.death_saves;
  const heading = 'mb-1 text-xs font-semibold uppercase text-slate-400';
  return (
    <ModalOverlay onClose={onClose} closeOnBackdrop aria-labelledby="sheet-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4 text-sm text-slate-200 shadow-2xl">
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
          <h3 className={heading}>{t('fight.sheet.saves')}</h3>
          <ul className="grid grid-cols-6 gap-1.5 text-center text-xs" data-testid="sheet-saves">
            {ABILITIES.map((ability) => {
              const trained = stats.save_proficiencies.includes(ability);
              return (
                <li key={ability} className={`rounded-lg px-1 py-1 ${trained ? 'bg-accent-950/50 text-accent-100 font-semibold' : 'bg-app/60'}`}>
                  {t(`fight.ability.${ability}` as TranslationKey)} {signed(mod(ability) + (trained ? proficiency : 0))}
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <h3 className={heading}>{t('fight.sheet.skills')}</h3>
          <ul className="grid grid-cols-2 gap-x-3 text-xs" data-testid="sheet-skills">
            {SKILLS.map(([skill, ability]) => {
              const trained = stats.skill_proficiencies.includes(skill);
              return (
                <li key={skill} className={`flex justify-between ${trained ? 'text-accent-100 font-semibold' : 'text-slate-300'}`}>
                  <span>
                    {t(`fight.skill.${skill}` as TranslationKey)}{' '}
                    <span className="text-slate-500">({t(`fight.ability.${ability}` as TranslationKey)})</span>
                  </span>
                  <span>{signed(mod(ability) + (trained ? proficiency : 0))}</span>
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <h3 className={heading}>{t('fight.sheet.attacks')}</h3>
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
        {casting && (
          <div data-testid="sheet-spells">
            <h3 className={heading}>{t('fight.sheet.spells')}</h3>
            <p className="mb-1 text-xs text-slate-400">
              {t('fight.sheet.spellDc', { dc: 8 + proficiency + mod(casting.ability), bonus: signed(proficiency + mod(casting.ability)) })}
            </p>
            <p className="mb-1 text-xs">
              {t('fight.sheet.slots')}:{' '}
              {casting.slots_max
                .map((max, index) => (max > 0 ? `${t('fight.slotLevel', { level: index + 1 })} ${max - (casting.slots_used[index] ?? 0)}/${max}` : null))
                .filter(Boolean)
                .join(' · ')}
            </p>
            <ul className="flex flex-wrap gap-1 text-xs">
              {[...casting.spells]
                .sort((a, b) => spellLevel(a) - spellLevel(b))
                .map((id) => (
                  <li key={id} className="rounded-md bg-violet-950/40 px-1.5 py-0.5 text-violet-100">
                    {spellName(id)}{' '}
                    <span className="text-violet-300/60">
                      {spellLevel(id) === 0 ? t('fight.cantrip') : t('fight.slotLevel', { level: spellLevel(id) })}
                    </span>
                  </li>
                ))}
            </ul>
            {stats.concentration && <p className="mt-1 text-xs text-amber-200">{t('fight.sheet.concentration', { spell: spellName(stats.concentration) })}</p>}
          </div>
        )}
        {member.conditions.length > 0 && (
          <p className="text-xs text-slate-300">
            {member.conditions.map((condition) => conditionLabel(condition.name, appLanguage)).join(' · ')}
          </p>
        )}
        {member.hp <= 0 && (
          <div data-testid="sheet-death-saves">
            <h3 className={heading}>{t('fight.sheet.deathSaves')}</h3>
            <p className="text-xs">{t('fight.sheet.deathSaveState', { successes: deathSaves.successes, failures: deathSaves.failures })}</p>
          </div>
        )}
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-800 px-4 py-2 font-semibold hover:bg-slate-700">
            {t('common.close')}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
};
