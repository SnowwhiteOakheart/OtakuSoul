import { translate, type TranslationKey } from '../i18n';
import type { ExploreEvent } from '../types';
import { localizedName } from './combatEvents';

type Language = 'de' | 'en' | 'ru';

const signed = (value: number) => (value >= 0 ? `+${value}` : `${value}`);

/** One line of the exploration log. */
export function exploreEventText(event: ExploreEvent, language: Language): string {
  switch (event.type) {
    case 'move':
      return translate('explore.event.move', { name: event.actor_name, feet: event.feet });
    case 'room':
      return translate('explore.event.room', { room: localizedName(event.name, language) });
    case 'door':
      return translate(event.opened ? 'explore.event.doorOpen' : 'explore.event.doorClose');
    case 'chest':
      return translate('explore.event.chest');
    case 'locked':
      return translate('explore.event.locked');
    case 'check':
      return translate(event.success ? 'explore.event.checkOk' : 'explore.event.checkFail', {
        name: event.actor_name,
        skill: translate(`fight.skill.${event.skill}` as TranslationKey),
        roll: translate('fight.roll', { dice: event.roll.rolls.join('/') }),
        bonus: signed(event.bonus),
        total: event.total,
        dc: event.dc,
      });
    case 'trap_spotted':
      return translate('explore.event.trapSpotted', { name: event.by_name });
    case 'trap':
      return translate(event.down ? 'explore.event.trapDown' : event.saved ? 'explore.event.trapSaved' : 'explore.event.trap', {
        name: event.target_name,
        damage: event.damage,
      });
    case 'encounter':
      return translate('explore.event.encounter');
    case 'goal':
      return translate('explore.event.goal', { goal: localizedName(event.title, language) });
    case 'loot':
      return translate('explore.event.loot', {
        items: event.items.map((item) => `${item.quantity}× ${localizedName(item.name, language)}`).join(', '),
      });
    case 'level_up':
      return translate('explore.event.levelUp', { level: event.level });
    case 'act_complete':
      return translate('explore.event.actComplete');
    case 'map_change':
      return translate('explore.event.mapChange', { map: localizedName(event.name, language) });
  }
}
