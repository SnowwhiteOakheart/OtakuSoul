import { describe, expect, it } from 'vitest';
import { combatEventText } from '../utils/combatEvents';
import { combatAwaitsEngine } from '../store/slices/stageSlice';
import type { CombatEvent, SceneState } from '../types';

const longsword = { de: 'Langschwert', en: 'Longsword', ru: 'Длинный меч' };

describe('combat log lines', () => {
  it('formats attacks with dice, bonus and armor class', () => {
    const attack: CombatEvent = {
      type: 'attack', attacker_id: 'p', attacker_name: 'Thorin', target_id: 'g', target_name: 'Goblin 1',
      attack_id: 'longsword', attack_name: longsword, roll: { mode: 'disadvantage', rolls: [14, 6], natural: 6 },
      to_hit: 4, total: 10, target_ac: 15, hit: false, critical: false,
    };
    expect(combatEventText(attack, 'de')).toBe('Thorin verfehlt Goblin 1 mit Langschwert (W20 14/6 (Nachteil) +4 = 10 gegen RK 15)');
    expect(combatEventText({ ...attack, hit: true, critical: true, roll: { mode: 'normal', rolls: [20], natural: 20 } }, 'de'))
      .toBe('Thorin trifft Goblin 1 kritisch mit Langschwert (W20 20)');
  });

  it('formats damage with translated type and tier, unknown types stay as they are', () => {
    const damage: CombatEvent = {
      type: 'damage', target_id: 'g', target_name: 'Goblin 1', roll: { rolls: [5], modifier: 2, total: 7 },
      amount: 7, damage_type: 'slashing', scaling: 'normal', hp_after: 0, tier: 'down',
    };
    expect(combatEventText(damage, 'de')).toBe('Goblin 1: 7 Schaden (Hieb) – am Boden');
    expect(combatEventText({ ...damage, damage_type: 'sonic boom' }, 'de')).toContain('(sonic boom)');
    expect(combatEventText({ type: 'combat_end', outcome: 'victory' }, 'de')).toBe('Sieg – kein Gegner steht mehr');
  });

  it('formats standard actions with their checks', () => {
    const grapple: CombatEvent = {
      type: 'maneuver', actor_id: 'p', actor_name: 'Thorin', maneuver: 'grapple', target_id: 'g', target_name: 'Goblin 1',
      total: 17, against: 12, success: true,
    };
    expect(combatEventText(grapple, 'de')).toBe('Thorin packt Goblin 1 (Athletik 17 gegen 12)');
    expect(combatEventText({ ...grapple, success: false, total: undefined }, 'de')).toBe('Thorin bekommt Goblin 1 nicht zu fassen (– gegen 12)');
    const potion: CombatEvent = { type: 'maneuver', actor_id: 'p', actor_name: 'Thorin', maneuver: 'potion', target_id: 'p', target_name: 'Thorin', success: true };
    expect(combatEventText(potion, 'de')).toBe('Thorin trinkt einen Heiltrank');
    expect(combatEventText({ ...potion, target_id: 'l', target_name: 'Lyra' }, 'de')).toBe('Thorin gibt Lyra einen Heiltrank');
    expect(combatEventText({ type: 'maneuver', actor_id: 'p', actor_name: 'Thorin', maneuver: 'stand_up', success: true }, 'de')).toBe('Thorin steht auf');
  });
});

describe('combatAwaitsEngine', () => {
  const scene = (role: string, controlCompanions = false) =>
    ({
      definition: { rules: { ruleset: '5e', hero_classes: {}, control_companions: controlCompanions } },
      combat: { is_active: true, current_turn_index: 0, combatants: [{ role }] },
    }) as unknown as SceneState;

  it('lets the engine play enemies and companions unless the player commands them', () => {
    expect(combatAwaitsEngine(scene('enemy'))).toBe(true);
    expect(combatAwaitsEngine(scene('companion'))).toBe(true);
    expect(combatAwaitsEngine(scene('companion', true))).toBe(false);
    expect(combatAwaitsEngine(scene('player'))).toBe(false);
    const narrative = { ...scene('enemy'), definition: { rules: null } } as unknown as SceneState;
    expect(combatAwaitsEngine(narrative)).toBe(false);
  });
});
