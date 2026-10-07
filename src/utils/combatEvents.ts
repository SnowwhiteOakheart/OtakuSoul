import { tOptional, translate, type TranslationKey } from '../i18n';
import { useAppStore } from '../store/useAppStore';
import type { CombatEvent } from '../types/generated/CombatEvent';
import type { D20Roll } from '../types/generated/D20Roll';
import type { HealthTier } from '../types/generated/HealthTier';
import type { LocalizedName } from '../types/generated/LocalizedName';
import { spellName } from './srdSpells';

type Language = 'de' | 'en' | 'ru';

export const localizedName = (name: LocalizedName, language: Language) => name[language] || name.en;

export const tierLabel = (tier: HealthTier) => translate(`fight.tier.${tier}` as TranslationKey);

/** Damage types are translated when known, otherwise shown as they come (e.g. from user data). */
export const damageTypeLabel = (type: string) =>
  tOptional(`fight.damageType.${type}`, type, useAppStore.getState().appLanguage || 'de');

/** Condition names: SRD conditions and spell effects are translated, others shown as they come. */
export const conditionLabel = (condition: string, language: Language) =>
  tOptional(`fight.condition.${condition}`, condition.replace(/_/g, ' '), language);

const signed = (value: number) => (value >= 0 ? `+${value}` : `${value}`);

/** "W20 14" or "W20 14/6 (Vorteil)". */
const rollText = (roll: D20Roll) => {
  const dice = roll.rolls.join('/');
  if (roll.mode === 'normal') return translate('fight.roll', { dice });
  return translate('fight.rollWithMode', { dice, mode: translate(`fight.${roll.mode}` as TranslationKey) });
};

/** One line of the fight log for an event, or null for events the log does not show. */
export function combatEventText(event: CombatEvent, language: Language): string | null {
  switch (event.type) {
    case 'initiative':
      return translate('fight.event.initiative', {
        order: event.order.map((entry) => `${entry.name} (${entry.total})`).join(', '),
      });
    case 'turn_start':
      return translate('fight.event.turn', { round: event.round, name: event.actor_name });
    case 'attack': {
      const params = {
        attacker: event.attacker_name,
        target: event.target_name,
        attack: localizedName(event.attack_name, language),
        roll: rollText(event.roll),
        bonus: signed(event.to_hit),
        total: event.total,
        ac: event.target_ac,
      };
      if (event.critical) return translate('fight.event.crit', params);
      return translate(event.hit ? 'fight.event.hit' : 'fight.event.miss', params);
    }
    case 'damage':
      if (event.scaling === 'immune') {
        return translate('fight.event.immune', { target: event.target_name, type: damageTypeLabel(event.damage_type) });
      }
      return translate('fight.event.damage', {
        target: event.target_name,
        amount: event.amount,
        type: damageTypeLabel(event.damage_type),
        tier: tierLabel(event.tier),
      });
    case 'down':
      return translate('fight.event.down', { name: event.target_name });
    case 'dodge':
      return translate('fight.event.dodge', { name: event.actor_name });
    case 'flee':
      return translate('fight.event.flee', { name: event.actor_name });
    case 'pass':
      return translate('fight.event.pass', { name: event.actor_name });
    case 'move':
      return translate('fight.event.move', { name: event.actor_name, feet: event.feet });
    case 'opportunity_attack':
      return translate('fight.event.opportunity', { attacker: event.attacker_name, target: event.target_name });
    case 'dash':
      return translate('fight.event.dash', { name: event.actor_name });
    case 'disengage':
      return translate('fight.event.disengage', { name: event.actor_name });
    case 'feature':
      return translate(`fight.event.feature.${event.feature}` as TranslationKey, { name: event.actor_name });
    case 'spell_cast': {
      const params = { caster: event.caster_name, spell: localizedName(event.spell_name, language), slot: event.slot_level };
      return translate(event.slot_level > 0 ? 'fight.event.spellSlot' : 'fight.event.spell', params);
    }
    case 'save':
      return translate(event.success ? 'fight.event.saveOk' : 'fight.event.saveFail', {
        target: event.target_name,
        ability: translate(`fight.ability.${event.ability}` as TranslationKey),
        roll: rollText(event.roll),
        bonus: signed(event.bonus),
        total: event.total,
        dc: event.dc,
      });
    case 'heal':
      return translate('fight.event.heal', { target: event.target_name, amount: event.amount, hp: event.hp_after });
    case 'condition_start':
    case 'condition_end':
      return translate(event.type === 'condition_start' ? 'fight.event.conditionStart' : 'fight.event.conditionEnd', {
        target: event.target_name,
        condition: conditionLabel(event.condition, language),
      });
    case 'death_save':
      return translate(`fight.event.deathSave.${event.outcome}` as TranslationKey, {
        name: event.actor_name,
        roll: event.roll,
        successes: event.successes,
        failures: event.failures,
      });
    case 'concentration_lost':
      return translate('fight.event.concentrationLost', { name: event.caster_name, spell: spellName(event.spell_id, language) });
    case 'teleport':
      return translate('fight.event.teleport', { name: event.actor_name, x: event.to.x + 1, y: event.to.y + 1 });
    case 'combat_end':
      return translate(event.outcome === 'victory' ? 'fight.event.victory' : 'fight.event.defeat');
    default:
      return null;
  }
}
