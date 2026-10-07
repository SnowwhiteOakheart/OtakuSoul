import { tOptional, translate, type TranslationKey } from '../i18n';
import { useAppStore } from '../store/useAppStore';
import type { CombatEvent } from '../types/generated/CombatEvent';
import type { D20Roll } from '../types/generated/D20Roll';
import type { HealthTier } from '../types/generated/HealthTier';
import type { LocalizedName } from '../types/generated/LocalizedName';

type Language = 'de' | 'en' | 'ru';

export const localizedName = (name: LocalizedName, language: Language) => name[language] || name.en;

export const tierLabel = (tier: HealthTier) => translate(`fight.tier.${tier}` as TranslationKey);

/** Damage types are translated when known, otherwise shown as they come (e.g. from user data). */
export const damageTypeLabel = (type: string) =>
  tOptional(`fight.damageType.${type}`, type, useAppStore.getState().appLanguage || 'de');

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
    case 'combat_end':
      return translate(event.outcome === 'victory' ? 'fight.event.victory' : 'fight.event.defeat');
    default:
      return null;
  }
}
