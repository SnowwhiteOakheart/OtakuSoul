//! Combat without a board: initiative, turn order, attacks against AC, damage with
//! resistances, dodging, going down and the end of a fight. Every change is reported as a
//! [`CombatEvent`]; the events are the log, the UI animation and the narration input.

use super::*;
use crate::modules::stage::{CombatCondition, Combatant, EncounterState};
use rand::Rng;

/// Condition name of a combatant who took the Dodge action (until its next turn).
pub const DODGING: &str = "dodging";
/// Condition name of a combatant who left the fight; it takes no more turns.
pub const FLED: &str = "fled";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct InitiativeEntry {
    pub id: String,
    pub name: String,
    pub roll: u32,
    pub total: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum DamageScaling {
    Normal,
    Resisted,
    Vulnerable,
    Immune,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum CombatOutcome {
    Victory,
    Defeat,
}

/// One thing that happened in a fight.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(export)]
pub enum CombatEvent {
    Initiative {
        order: Vec<InitiativeEntry>,
    },
    TurnStart {
        round: u32,
        actor_id: String,
        actor_name: String,
    },
    Attack {
        attacker_id: String,
        attacker_name: String,
        target_id: String,
        target_name: String,
        attack_id: String,
        attack_name: LocalizedName,
        roll: D20Roll,
        to_hit: i32,
        total: i32,
        target_ac: i32,
        hit: bool,
        critical: bool,
    },
    Damage {
        target_id: String,
        target_name: String,
        roll: DamageRoll,
        amount: i32,
        damage_type: String,
        scaling: DamageScaling,
        hp_after: i32,
        tier: HealthTier,
    },
    Down {
        target_id: String,
        target_name: String,
    },
    Dodge {
        actor_id: String,
        actor_name: String,
    },
    Flee {
        actor_id: String,
        actor_name: String,
    },
    Pass {
        actor_id: String,
        actor_name: String,
    },
    CombatEnd {
        outcome: CombatOutcome,
    },
}

pub fn is_party(combatant: &Combatant) -> bool {
    combatant.role == "player" || combatant.role == "companion"
}

pub fn is_enemy(combatant: &Combatant) -> bool {
    combatant.role == "enemy" || combatant.role == "boss"
}

/// Still in the fight: hit points left and not fled.
pub fn is_up(combatant: &Combatant) -> bool {
    combatant.hp > 0 && !has_condition(combatant, FLED)
}

pub fn has_condition(combatant: &Combatant, name: &str) -> bool {
    combatant.conditions.iter().any(|c| c.name == name)
}

/// Rolls initiative (d20 + DEX) for everyone and sorts the order: highest first, ties by
/// DEX score, then by roll order.
pub fn roll_initiative<R: Rng + ?Sized>(combatants: &mut [Combatant], rng: &mut R) -> CombatEvent {
    let mut rolls = Vec::with_capacity(combatants.len());
    for combatant in combatants.iter_mut() {
        let roll = roll_d20(rng, RollMode::Normal).natural;
        let bonus = combatant
            .stats5e
            .as_ref()
            .map_or(0, Stats5e::initiative_bonus);
        combatant.initiative = roll as i32 + bonus;
        rolls.push((combatant.id.clone(), roll));
    }
    let dex = |c: &Combatant| c.stats5e.as_ref().map_or(10, |s| s.score(Ability::Dex));
    combatants.sort_by(|a, b| b.initiative.cmp(&a.initiative).then(dex(b).cmp(&dex(a))));
    CombatEvent::Initiative {
        order: combatants
            .iter()
            .map(|c| InitiativeEntry {
                id: c.id.clone(),
                name: c.name.clone(),
                roll: rolls
                    .iter()
                    .find(|(id, _)| *id == c.id)
                    .map_or(0, |(_, r)| *r),
                total: c.initiative,
            })
            .collect(),
    }
}

/// Advantage/disadvantage of an attack from the situation (so far: the target is dodging).
pub fn attack_mode(_attacker: &Combatant, target: &Combatant) -> RollMode {
    RollMode::combine(false, has_condition(target, DODGING))
}

fn scaling_for(target: &Stats5e, damage_type: &str) -> DamageScaling {
    let listed = |list: &[String]| list.iter().any(|t| t == damage_type);
    if listed(&target.immunities) {
        DamageScaling::Immune
    } else if listed(&target.resistances) && !listed(&target.vulnerabilities) {
        DamageScaling::Resisted
    } else if listed(&target.vulnerabilities) && !listed(&target.resistances) {
        DamageScaling::Vulnerable
    } else {
        DamageScaling::Normal
    }
}

/// Attack roll against the target's AC; on a hit the damage is rolled (dice doubled on a
/// natural 20) and applied. A natural 1 always misses, a natural 20 always hits.
pub fn resolve_attack<R: Rng + ?Sized>(
    attacker: &Combatant,
    attack: &Attack,
    target: &mut Combatant,
    rng: &mut R,
) -> Vec<CombatEvent> {
    let mode = attack_mode(attacker, target);
    let roll = roll_d20(rng, mode);
    let target_ac = target.stats5e.as_ref().map_or(10, |s| s.armor_class);
    let total = roll.natural as i32 + attack.to_hit;
    let critical = roll.natural == 20;
    let hit = critical || (roll.natural != 1 && total >= target_ac);
    let mut events = vec![CombatEvent::Attack {
        attacker_id: attacker.id.clone(),
        attacker_name: attacker.name.clone(),
        target_id: target.id.clone(),
        target_name: target.name.clone(),
        attack_id: attack.id.clone(),
        attack_name: attack.name.clone(),
        roll,
        to_hit: attack.to_hit,
        total,
        target_ac,
        hit,
        critical,
    }];
    if hit {
        let formula = DiceFormula::parse(&attack.damage).unwrap_or(DiceFormula {
            count: 1,
            sides: 4,
            modifier: 0,
        });
        let damage = roll_damage(rng, &formula, critical);
        let scaling = target.stats5e.as_ref().map_or(DamageScaling::Normal, |s| {
            scaling_for(s, &attack.damage_type)
        });
        events.extend(apply_damage(target, damage, &attack.damage_type, scaling));
    }
    events
}

/// Applies rolled damage after resistance/vulnerability/immunity.
pub fn apply_damage(
    target: &mut Combatant,
    roll: DamageRoll,
    damage_type: &str,
    scaling: DamageScaling,
) -> Vec<CombatEvent> {
    let amount = match scaling {
        DamageScaling::Normal => roll.total,
        DamageScaling::Resisted => roll.total / 2,
        DamageScaling::Vulnerable => roll.total * 2,
        DamageScaling::Immune => 0,
    };
    let was_up = target.hp > 0;
    target.hp = (target.hp - amount).max(0);
    let mut events = vec![CombatEvent::Damage {
        target_id: target.id.clone(),
        target_name: target.name.clone(),
        roll,
        amount,
        damage_type: damage_type.to_string(),
        scaling,
        hp_after: target.hp,
        tier: health_tier(target.hp, target.max_hp),
    }];
    if was_up && target.hp == 0 {
        events.push(CombatEvent::Down {
            target_id: target.id.clone(),
            target_name: target.name.clone(),
        });
    }
    events
}

/// The Dodge action: attacks against the actor have disadvantage until its next turn.
pub fn take_dodge(actor: &mut Combatant) -> CombatEvent {
    if !has_condition(actor, DODGING) {
        actor.conditions.push(CombatCondition {
            name: DODGING.to_string(),
            rounds_remaining: 1,
        });
    }
    CombatEvent::Dodge {
        actor_id: actor.id.clone(),
        actor_name: actor.name.clone(),
    }
}

/// The combatant leaves the fight.
pub fn flee(actor: &mut Combatant) -> CombatEvent {
    if !has_condition(actor, FLED) {
        actor.conditions.push(CombatCondition {
            name: FLED.to_string(),
            rounds_remaining: 0,
        });
    }
    CombatEvent::Flee {
        actor_id: actor.id.clone(),
        actor_name: actor.name.clone(),
    }
}

/// Start of a combatant's turn: effects that last "until your next turn" end.
pub fn start_turn(actor: &mut Combatant, round: u32) -> CombatEvent {
    actor.conditions.retain(|c| c.name != DODGING);
    CombatEvent::TurnStart {
        round,
        actor_id: actor.id.clone(),
        actor_name: actor.name.clone(),
    }
}

/// Victory when no enemy is left standing, defeat when the whole party is down.
pub fn combat_outcome(combatants: &[Combatant]) -> Option<CombatOutcome> {
    if !combatants.iter().any(|c| is_enemy(c) && is_up(c)) {
        Some(CombatOutcome::Victory)
    } else if !combatants.iter().any(|c| is_party(c) && is_up(c)) {
        Some(CombatOutcome::Defeat)
    } else {
        None
    }
}

/// Moves to the next combatant who is still up; a new round starts after the last one.
/// Returns false when nobody can act.
pub fn advance_turn(encounter: &mut EncounterState) -> bool {
    let count = encounter.combatants.len();
    for step in 1..=count {
        let position = encounter.current_turn_index + step;
        let index = position % count;
        if is_up(&encounter.combatants[index]) {
            // Past the end of the order: a new round begins.
            if position >= count {
                encounter.round += 1;
            }
            encounter.current_turn_index = index;
            return true;
        }
    }
    false
}

/// What a hero may do on its turn: every attack against every enemy still standing, and
/// Dodge. The ids are what the UI and the companion model send back.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ActionOption {
    /// `attack:<attack id>:<target id>` or `dodge`.
    pub id: String,
    pub attack_id: Option<String>,
    pub target_id: Option<String>,
}

pub fn legal_actions(actor: &Combatant, combatants: &[Combatant]) -> Vec<ActionOption> {
    let mut options = Vec::new();
    if let Some(stats) = &actor.stats5e {
        let opposing =
            |c: &&Combatant| is_up(c) && (is_enemy(actor) != is_enemy(c)) && c.id != actor.id;
        for target in combatants.iter().filter(opposing) {
            for attack in &stats.attacks {
                options.push(ActionOption {
                    id: format!("attack:{}:{}", attack.id, target.id),
                    attack_id: Some(attack.id.clone()),
                    target_id: Some(target.id.clone()),
                });
            }
        }
    }
    options.push(ActionOption {
        id: "dodge".to_string(),
        attack_id: None,
        target_id: None,
    });
    options
}

/// Average damage of an attack (to compare options).
pub fn expected_damage(attack: &Attack) -> i32 {
    DiceFormula::parse(&attack.damage).map_or(0, |f| f.average())
}
