use super::*;
use crate::*;
use rand::{Rng, RngExt};

/// The player decides for this combatant (always for the player, for companions when the
/// scene says so).
pub fn player_controls(rules: Option<&SceneRules>, combatant: &Combatant) -> bool {
    combatant.role == "player"
        || (combatant.role == "companion" && rules.is_some_and(|r| r.control_companions))
}

/// What the current combatant may still spend on a spell.
pub fn cast_budget(combat: &EncounterState) -> CastBudget {
    CastBudget {
        action: !combat.turn.action_used,
        bonus_action: !combat.turn.bonus_action_used,
    }
}

/// Casts a spell for the current combatant if it is (still) valid; spends the action or the
/// bonus action it takes.
pub(super) fn cast<R: Rng + ?Sized>(
    t: &mut Table,
    request_id: &str,
    rng: &mut R,
) -> Vec<CombatEvent> {
    let index = t.combat.current_turn_index;
    let Some(request) = CastRequest::parse(request_id) else {
        return Vec::new();
    };
    let caster = t.combat.combatants[index].clone();
    let Ok(spell) = check_cast(
        t.map.as_ref(),
        &caster,
        &t.combat.combatants,
        &request,
        cast_budget(t.combat),
    ) else {
        return vec![CombatEvent::Pass {
            actor_id: caster.id,
            actor_name: caster.name,
        }];
    };
    match spell.casting {
        CastingTime::Action => t.combat.turn.action_used = true,
        CastingTime::Bonus => t.combat.turn.bonus_action_used = true,
        CastingTime::Reaction => {}
    }
    let heroic = t.heroic_death();
    let mut events = cast_spell(
        t.map.as_ref(),
        &mut t.combat.combatants,
        index,
        spell,
        &request,
        &mut t.combat.effects,
        heroic,
        rng,
    );
    events.extend(settle(t.combat));
    events
}

/// Undead enemies the current combatant could turn (within 30 ft on a board).
fn undead_in_reach(combat: &EncounterState) -> Vec<usize> {
    let actor = &combat.combatants[combat.current_turn_index];
    (0..combat.combatants.len())
        .filter(|&i| {
            let c = &combat.combatants[i];
            is_enemy(c) != is_enemy(actor)
                && is_up(c)
                && c.stats5e
                    .as_ref()
                    .is_some_and(|s| s.creature_type == "undead")
                && !has_condition(c, TURNED)
                && match (actor.position, c.position) {
                    (Some(a), Some(b)) => a.feet_to(b) <= TURN_UNDEAD_FT,
                    _ => true,
                }
        })
        .collect()
}

/// Class features the current combatant can use now.
pub fn feature_options(combat: &EncounterState, map: Option<&BattleMap>) -> Vec<FeatureOption> {
    let actor = &combat.combatants[combat.current_turn_index];
    let Some(stats) = actor.stats5e.as_ref() else {
        return Vec::new();
    };
    let turn = &combat.turn;
    let option = |id: &str, cost: &str, uses: Option<u32>| FeatureOption {
        id: id.to_string(),
        cost: cost.to_string(),
        uses_left: uses,
    };
    let mut options = Vec::new();
    let left = |feature: &str| uses_left(stats, feature);
    if left(SECOND_WIND) > 0 && !turn.bonus_action_used && actor.hp < actor.max_hp {
        options.push(option(SECOND_WIND, "bonus", Some(left(SECOND_WIND))));
    }
    if left(ACTION_SURGE) > 0 && turn.action_used {
        options.push(option(ACTION_SURGE, "free", Some(left(ACTION_SURGE))));
    }
    if left(TURN_UNDEAD) > 0 && !turn.action_used && !undead_in_reach(combat).is_empty() {
        options.push(option(TURN_UNDEAD, "action", Some(left(TURN_UNDEAD))));
    }
    if has_feature(stats, CUNNING_ACTION) && !turn.bonus_action_used && map.is_some() {
        options.push(option("cunning_dash", "bonus", None));
        options.push(option("cunning_disengage", "bonus", None));
    }
    options
}

/// Uses a class feature of the current combatant (checked against [`feature_options`]).
pub fn use_feature<R: Rng + ?Sized>(t: &mut Table, id: &str, rng: &mut R) -> Vec<CombatEvent> {
    if !feature_options(t.combat, t.map.as_ref())
        .iter()
        .any(|o| o.id == id)
    {
        return Vec::new();
    }
    let combat = &mut *t.combat;
    let index = combat.current_turn_index;
    let actor = &mut combat.combatants[index];
    let feature = |actor: &Combatant, feature: &str| CombatEvent::Feature {
        actor_id: actor.id.clone(),
        actor_name: actor.name.clone(),
        feature: feature.to_string(),
    };
    let mut events = vec![feature(actor, id)];
    let Some(stats) = actor.stats5e.as_mut() else {
        return Vec::new();
    };
    match id {
        SECOND_WIND => {
            spend(stats, id);
            let amount = rng.random_range(1..=10) + stats.level as i32;
            combat.turn.bonus_action_used = true;
            events.extend(heal(actor, amount));
        }
        ACTION_SURGE => {
            spend(stats, id);
            combat.turn.action_used = false;
        }
        "cunning_dash" => {
            let speed = speed_ft(actor);
            combat.turn.bonus_action_used = true;
            combat.turn.movement_left_ft += speed;
        }
        "cunning_disengage" => {
            combat.turn.bonus_action_used = true;
            combat.turn.disengaged = true;
        }
        TURN_UNDEAD => {
            spend(stats, id);
            let dc = spell_save_dc(stats);
            combat.turn.action_used = true;
            for target in undead_in_reach(combat) {
                let undead = &mut combat.combatants[target];
                let save = saving_throw(undead, Ability::Wis, dc, rng);
                let saved = matches!(save, CombatEvent::Save { success: true, .. });
                events.push(save);
                if !saved {
                    add_condition(undead, TURNED, ONE_MINUTE);
                    events.push(CombatEvent::ConditionStart {
                        target_id: undead.id.clone(),
                        target_name: undead.name.clone(),
                        condition: TURNED.to_string(),
                    });
                }
            }
        }
        _ => return Vec::new(),
    }
    events
}
