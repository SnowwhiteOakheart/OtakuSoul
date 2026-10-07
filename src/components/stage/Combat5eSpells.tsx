import React, { useState } from 'react';
import { Crosshair, Sparkles } from 'lucide-react';
import { useStoreFields } from '../../store/useAppStore';
import { useTranslation } from '../../i18n';
import { localizedName } from '../../utils/combatEvents';
import type { Combatant, SpellOption } from '../../types';

interface Props {
  actor: Combatant;
  spells: SpellOption[];
  combatants: Combatant[];
  disabled: boolean;
}

/**
 * The spellbook of the current combatant in a fight: every spell the engine allows right now,
 * the slot level to spend and the targets in range. Area spells are aimed on the board.
 */
export const Combat5eSpells: React.FC<Props> = ({ actor, spells, combatants, disabled }) => {
  const { t } = useTranslation();
  const { runStageCombat, appLanguage, stageAimedSpell, setStageAimedSpell } = useStoreFields(
    'runStageCombat', 'appLanguage', 'stageAimedSpell', 'setStageAimedSpell',
  );
  const [chosenSlots, setChosenSlots] = useState<Record<string, number>>({});
  const casting = actor.stats5e?.spellcasting;
  if (!casting) return null;
  const slots = casting.slots_max
    .map((max, index) => (max > 0 ? `${index + 1}: ${max - (casting.slots_used[index] ?? 0)}/${max}` : null))
    .filter(Boolean)
    .join(' · ');
  // Self-origin areas (range 0) reach as far as the area itself.
  const reachFt = (spell: SpellOption) => spell.range_ft || spell.area?.size_ft || 5;
  const aimedSpell = spells.find((s) => s.spell_id === stageAimedSpell?.spellId);
  const nameOf = (id: string) => combatants.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="space-y-1.5 rounded-lg border border-violet-500/30 bg-violet-950/20 p-2" data-testid="spellbook">
      <p className="flex items-center gap-1.5 font-semibold text-violet-200">
        <Sparkles className="w-3.5 h-3.5" /> {t('fight.spells')}
        {slots && <span className="font-normal text-violet-300/70">· {t('fight.slotsLeft', { slots })}</span>}
      </p>
      {spells.map((spell) => {
        const name = localizedName(spell.name, appLanguage);
        const slot = chosenSlots[spell.spell_id] ?? spell.slot_levels[0] ?? 0;
        const aiming = stageAimedSpell?.spellId === spell.spell_id;
        return (
          <div key={spell.spell_id} className="flex flex-wrap items-center gap-1.5" data-spell={spell.spell_id}>
            <span className="min-w-28 text-slate-200">
              {name}{' '}
              <span className="text-slate-500">
                ({spell.level === 0 ? t('fight.cantrip') : t('fight.slotLevel', { level: spell.level })}
                {spell.casting === 'bonus' && <> · {t('fight.bonusAction')}</>})
              </span>
            </span>
            {spell.slot_levels.length > 1 && (
              <select
                aria-label={t('fight.castSlot', { spell: name })}
                value={slot}
                disabled={disabled}
                onChange={(e) => setChosenSlots((all) => ({ ...all, [spell.spell_id]: Number(e.target.value) }))}
                className="rounded-md border border-slate-600 bg-slate-900 px-1 py-0.5 text-slate-100"
              >
                {spell.slot_levels.map((level) => (
                  <option key={level} value={level}>{t('fight.slotLevel', { level })}</option>
                ))}
              </select>
            )}
            {spell.needs_point ? (
              <button
                type="button"
                disabled={disabled}
                aria-pressed={aiming}
                onClick={() => setStageAimedSpell(aiming ? null : { spellId: spell.spell_id, slot })}
                title={t('fight.aimHint', { feet: reachFt(spell) })}
                className={`flex items-center gap-1 rounded-lg border px-2 py-1 font-semibold disabled:opacity-40 ${
                  aiming ? 'border-amber-400 bg-amber-500/20 text-amber-100' : 'border-violet-500/40 bg-violet-950/50 text-violet-100 hover:bg-violet-900'
                }`}
              >
                <Crosshair className="w-3.5 h-3.5" /> {aiming ? t('fight.aimCancel') : t('fight.aim')}
              </button>
            ) : (
              spell.targets.map((target) => (
                <button
                  key={target}
                  type="button"
                  disabled={disabled}
                  data-cast={`${spell.spell_id}:${target}`}
                  onClick={() => void runStageCombat(`cast:${spell.spell_id}:${slot}:${target}`)}
                  aria-label={t('fight.castOn', { spell: name, target: nameOf(target) })}
                  className="rounded-lg border border-violet-500/40 bg-violet-950/50 px-2 py-1 font-semibold text-violet-100 hover:bg-violet-900 disabled:opacity-40"
                >
                  {nameOf(target)}
                </button>
              ))
            )}
          </div>
        );
      })}
      {aimedSpell && <p className="text-amber-200/80">{t('fight.aimHint', { feet: reachFt(aimedSpell) })}</p>}
    </div>
  );
};
