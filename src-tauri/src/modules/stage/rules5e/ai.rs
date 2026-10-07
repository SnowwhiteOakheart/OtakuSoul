//! Turn decisions the engine makes itself: monsters always, companions when the language
//! model gives no valid choice. Without a board there is no movement yet; the choice is
//! which target and which attack.

use super::*;
use crate::modules::stage::Combatant;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TurnDecision {
    Attack {
        attack_id: String,
        target_id: String,
    },
    Dodge,
    Flee,
    Pass,
    /// A spell, as `cast:…` request id (see [`CastRequest`]).
    Cast(String),
    /// A class feature by id (`second_wind`, `turn_undead` …).
    Feature(String),
}

fn best_attack(stats: &Stats5e) -> Option<&Attack> {
    stats.attacks.iter().max_by_key(|attack| {
        (
            expected_damage(attack) * 2 + attack.to_hit,
            attack.kind == AttackKind::Melee,
        )
    })
}

/// Monster turn: flee when below a quarter of its hit points (unless it never flees),
/// otherwise attack the easiest party member to hit (lowest AC, then fewest hit points)
/// with its strongest attack.
pub fn monster_decision(actor: &Combatant, combatants: &[Combatant]) -> TurnDecision {
    let Some(stats) = &actor.stats5e else {
        return TurnDecision::Pass;
    };
    if !stats.never_flees && actor.hp * 4 < actor.max_hp {
        return TurnDecision::Flee;
    }
    // Turned undead keep away and defend themselves.
    if has_condition(actor, TURNED) {
        return TurnDecision::Dodge;
    }
    let target = combatants
        .iter()
        .filter(|c| is_party(c) && is_up(c))
        .min_by_key(|c| (c.stats5e.as_ref().map_or(10, |s| s.armor_class), c.hp));
    match (target, best_attack(stats)) {
        (Some(target), Some(attack)) => TurnDecision::Attack {
            attack_id: attack.id.clone(),
            target_id: target.id.clone(),
        },
        _ => TurnDecision::Pass,
    }
}

/// Fallback for heroes: finish off the most hurt enemy with the strongest attack.
pub fn hero_fallback_decision(actor: &Combatant, combatants: &[Combatant]) -> TurnDecision {
    let Some(stats) = &actor.stats5e else {
        return TurnDecision::Dodge;
    };
    let target = combatants
        .iter()
        .filter(|c| is_enemy(c) && is_up(c))
        .min_by_key(|c| (c.hp, c.id.clone()));
    match (target, best_attack(stats)) {
        (Some(target), Some(attack)) => TurnDecision::Attack {
            attack_id: attack.id.clone(),
            target_id: target.id.clone(),
        },
        _ => TurnDecision::Dodge,
    }
}

/// Reads an action id (`attack:<attack>:<target>` or `dodge`) if it is one of the legal
/// options; anything else is `None`.
pub fn parse_action(id: &str, options: &[ActionOption]) -> Option<TurnDecision> {
    let id = id.trim();
    let option = options.iter().find(|option| option.id == id)?;
    Some(match (&option.attack_id, &option.target_id) {
        (Some(attack_id), Some(target_id)) => TurnDecision::Attack {
            attack_id: attack_id.clone(),
            target_id: target_id.clone(),
        },
        _ => TurnDecision::Dodge,
    })
}
