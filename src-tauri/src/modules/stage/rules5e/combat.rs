//! Combat without a board: initiative, turn order, attacks against AC, damage with
//! resistances, dodging, going down and the end of a fight. Every change is reported as a
//! [`CombatEvent`]; the events are the log, the UI animation and the narration input.

use super::*;
use crate::modules::stage::{CombatCondition, Combatant, EncounterState};
use rand::{Rng, RngExt};

/// Condition name of a combatant who took the Dodge action (until its next turn).
pub const DODGING: &str = "dodging";
/// Condition name of a combatant who left the fight; it takes no more turns.
pub const FLED: &str = "fled";

/// What the combatant whose turn it is has left (5e: move up to its speed, one action).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TurnBudget {
    pub movement_left_ft: u32,
    pub action_used: bool,
    #[serde(default)]
    pub bonus_action_used: bool,
    /// Disengage taken: leaving reach provokes no opportunity attacks this turn.
    pub disengaged: bool,
}

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
        /// Bless: the d4 added to the roll.
        #[serde(default)]
        #[ts(optional)]
        bonus_die: Option<u32>,
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
    /// Movement on the battle map.
    Move {
        actor_id: String,
        actor_name: String,
        path: Vec<GridPos>,
        feet: u32,
    },
    /// A reaction attack follows (someone left the attacker's reach).
    OpportunityAttack {
        attacker_id: String,
        attacker_name: String,
        target_name: String,
    },
    Dash {
        actor_id: String,
        actor_name: String,
    },
    Disengage {
        actor_id: String,
        actor_name: String,
    },
    SpellCast {
        caster_id: String,
        caster_name: String,
        spell_id: String,
        spell_name: LocalizedName,
        /// 0 for cantrips.
        slot_level: u8,
    },
    Save {
        target_id: String,
        target_name: String,
        ability: Ability,
        roll: D20Roll,
        bonus: i32,
        total: i32,
        dc: i32,
        success: bool,
    },
    Heal {
        target_id: String,
        target_name: String,
        amount: i32,
        hp_after: i32,
    },
    ConditionStart {
        target_id: String,
        target_name: String,
        condition: String,
    },
    ConditionEnd {
        target_id: String,
        target_name: String,
        condition: String,
    },
    DeathSave {
        actor_id: String,
        actor_name: String,
        /// The d20; 0 when a hit at 0 hit points counted as failure.
        roll: u32,
        successes: u8,
        failures: u8,
        outcome: DeathSaveOutcome,
    },
    ConcentrationLost {
        caster_id: String,
        caster_name: String,
        spell_id: String,
    },
    Teleport {
        actor_id: String,
        actor_name: String,
        to: GridPos,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum DeathSaveOutcome {
    Ongoing,
    Stable,
    /// Natural 20: back on their feet with 1 hit point.
    Revived,
    Dead,
    /// Three failures without heroic death: out of this fight, wakes afterwards.
    Out,
}

/// How an attack happens: disadvantage from the board, distance to the target (for prone and
/// paralyzed targets) and whether heroes can die in this scene.
#[derive(Debug, Clone, Copy, Default)]
pub struct AttackSituation {
    pub disadvantage: bool,
    pub distance_ft: Option<u32>,
    pub heroic_death: bool,
}

/// Damage details that matter at 0 hit points and for concentration.
#[derive(Debug, Clone, Copy, Default)]
pub struct DamageContext {
    pub critical: bool,
    pub heroic_death: bool,
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

/// A hero at 0 hit points who still rolls death saves.
pub fn is_dying(combatant: &Combatant) -> bool {
    is_party(combatant)
        && combatant.hp <= 0
        && combatant
            .stats5e
            .as_ref()
            .is_some_and(|s| !s.death_saves.stable && !s.death_saves.dead)
}

/// Gets a turn: up, or dying (to roll the death save).
pub fn takes_turn(combatant: &Combatant) -> bool {
    is_up(combatant) || is_dying(combatant)
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

/// Advantage/disadvantage of an attack from the conditions (no board: attacker counts as close).
pub fn attack_mode(attacker: &Combatant, target: &Combatant) -> RollMode {
    attack_conditions(attacker, target, None).0
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
    resolve_attack_with(attacker, attack, target, &AttackSituation::default(), rng)
}

/// Like [`resolve_attack`], in a situation: disadvantage from the board, distance (prone,
/// paralyzed and unconscious targets), heroic death. Conditions on both sides give advantage
/// or disadvantage; Bless adds a d4; a Guiding Bolt mark is used up.
pub fn resolve_attack_with<R: Rng + ?Sized>(
    attacker: &Combatant,
    attack: &Attack,
    target: &mut Combatant,
    situation: &AttackSituation,
    rng: &mut R,
) -> Vec<CombatEvent> {
    let (mode, auto_crit) = attack_conditions(attacker, target, situation.distance_ft);
    let mode = match (mode, situation.disadvantage) {
        (RollMode::Advantage, true) => RollMode::Normal,
        (_, true) => RollMode::Disadvantage,
        (mode, false) => mode,
    };
    remove_condition(target, GUIDED);
    let roll = roll_d20(rng, mode);
    let bonus_die = has_condition(attacker, BLESSED).then(|| rng.random_range(1..=4u32));
    let target_ac = armor_class(target);
    let total = roll.natural as i32 + attack.to_hit + bonus_die.map_or(0, |d| d as i32);
    let hit = roll.natural == 20 || (roll.natural != 1 && total >= target_ac);
    let critical = hit && (roll.natural == 20 || auto_crit);
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
        bonus_die,
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
        let context = DamageContext {
            critical,
            heroic_death: situation.heroic_death,
        };
        events.extend(apply_damage(
            target,
            damage,
            &attack.damage_type,
            scaling,
            &context,
            rng,
        ));
    }
    events
}

pub fn damage_scaling(target: &Combatant, damage_type: &str) -> DamageScaling {
    target
        .stats5e
        .as_ref()
        .map_or(DamageScaling::Normal, |s| scaling_for(s, damage_type))
}

/// Applies rolled damage after resistance/vulnerability/immunity. Damage wakes a sleeper,
/// tests the target's concentration (CON save, DC 10 or half the damage), and a hit on a
/// dying hero counts as a failed death save (two on a critical hit); damage beyond the hero's
/// hit point maximum kills outright.
pub fn apply_damage<R: Rng + ?Sized>(
    target: &mut Combatant,
    roll: DamageRoll,
    damage_type: &str,
    scaling: DamageScaling,
    context: &DamageContext,
    rng: &mut R,
) -> Vec<CombatEvent> {
    let amount = match scaling {
        DamageScaling::Normal => roll.total,
        DamageScaling::Resisted => roll.total / 2,
        DamageScaling::Vulnerable => roll.total * 2,
        DamageScaling::Immune => 0,
    };
    let was_up = target.hp > 0;
    let overflow = (amount - target.hp.max(0)).max(0);
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
    if amount == 0 {
        return events;
    }
    if remove_condition(target, ASLEEP) {
        events.push(condition_end(target, ASLEEP));
    }
    if was_up && target.hp == 0 {
        events.push(CombatEvent::Down {
            target_id: target.id.clone(),
            target_name: target.name.clone(),
        });
        if is_party(target) {
            add_condition(target, UNCONSCIOUS, 0);
            if overflow >= target.max_hp {
                events.extend(death_save_failures(target, 3, context.heroic_death));
            }
        }
    } else if !was_up && is_dying(target) {
        events.extend(death_save_failures(
            target,
            if context.critical { 2 } else { 1 },
            context.heroic_death,
        ));
    }
    events.extend(concentration_check(target, amount, rng));
    events
}

/// Concentration is lost on a failed CON save after damage, or when the caster goes down.
fn concentration_check<R: Rng + ?Sized>(
    target: &mut Combatant,
    amount: i32,
    rng: &mut R,
) -> Option<CombatEvent> {
    let stats = target.stats5e.as_ref()?;
    let spell = stats.concentration.clone()?;
    let keeps = target.hp > 0 && {
        let dc = (amount / 2).max(10);
        let roll = roll_d20(rng, RollMode::Normal).natural as i32;
        roll + stats.saving_throw_bonus(Ability::Con) >= dc
    };
    if keeps {
        return None;
    }
    target.stats5e.as_mut()?.concentration = None;
    Some(CombatEvent::ConcentrationLost {
        caster_id: target.id.clone(),
        caster_name: target.name.clone(),
        spell_id: spell,
    })
}

fn condition_end(target: &Combatant, condition: &str) -> CombatEvent {
    CombatEvent::ConditionEnd {
        target_id: target.id.clone(),
        target_name: target.name.clone(),
        condition: condition.to_string(),
    }
}

fn death_save_event(target: &Combatant, roll: u32, outcome: DeathSaveOutcome) -> CombatEvent {
    let saves = target
        .stats5e
        .as_ref()
        .map(|s| s.death_saves.clone())
        .unwrap_or_default();
    CombatEvent::DeathSave {
        actor_id: target.id.clone(),
        actor_name: target.name.clone(),
        roll,
        successes: saves.successes,
        failures: saves.failures,
        outcome,
    }
}

fn death_save_failures(target: &mut Combatant, count: u8, heroic_death: bool) -> Vec<CombatEvent> {
    let Some(stats) = target.stats5e.as_mut() else {
        return Vec::new();
    };
    let saves = &mut stats.death_saves;
    saves.failures = (saves.failures + count).min(3);
    let outcome = if saves.failures < 3 {
        DeathSaveOutcome::Ongoing
    } else if heroic_death {
        saves.dead = true;
        DeathSaveOutcome::Dead
    } else {
        saves.stable = true;
        DeathSaveOutcome::Out
    };
    vec![death_save_event(target, 0, outcome)]
}

/// A dying hero's death saving throw at the start of its turn: 10 or more succeeds, a natural
/// 1 counts twice, a natural 20 brings it back with 1 hit point.
pub fn death_save<R: Rng + ?Sized>(
    target: &mut Combatant,
    heroic_death: bool,
    rng: &mut R,
) -> CombatEvent {
    let roll = roll_d20(rng, RollMode::Normal).natural;
    if roll == 20 {
        target.hp = 1;
        if let Some(stats) = target.stats5e.as_mut() {
            stats.death_saves = DeathSaves::default();
        }
        remove_condition(target, UNCONSCIOUS);
        return death_save_event(target, roll, DeathSaveOutcome::Revived);
    }
    if roll < 10 {
        let mut events = death_save_failures(target, if roll == 1 { 2 } else { 1 }, heroic_death);
        if let Some(CombatEvent::DeathSave { roll: r, .. }) = events.first_mut() {
            *r = roll;
        }
        return events.remove(0);
    }
    let Some(stats) = target.stats5e.as_mut() else {
        return death_save_event(target, roll, DeathSaveOutcome::Ongoing);
    };
    stats.death_saves.successes += 1;
    let outcome = if stats.death_saves.successes >= 3 {
        stats.death_saves.stable = true;
        DeathSaveOutcome::Stable
    } else {
        DeathSaveOutcome::Ongoing
    };
    death_save_event(target, roll, outcome)
}

/// Regains hit points (not past the maximum, not with Chill Touch on it, not undead from
/// healing magic); a dying or stable hero comes back.
pub fn heal(target: &mut Combatant, amount: i32) -> Vec<CombatEvent> {
    if has_condition(target, NO_HEAL)
        || target
            .stats5e
            .as_ref()
            .is_some_and(|s| s.death_saves.dead || s.creature_type == "undead")
    {
        return Vec::new();
    }
    let before = target.hp.max(0);
    target.hp = (before + amount.max(0)).min(target.max_hp);
    let mut events = vec![CombatEvent::Heal {
        target_id: target.id.clone(),
        target_name: target.name.clone(),
        amount: target.hp - before,
        hp_after: target.hp,
    }];
    if before == 0 && target.hp > 0 {
        if let Some(stats) = target.stats5e.as_mut() {
            stats.death_saves = DeathSaves::default();
        }
        if remove_condition(target, UNCONSCIOUS) {
            events.push(condition_end(target, UNCONSCIOUS));
        }
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
    tick_conditions(actor);
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
        if takes_turn(&encounter.combatants[index]) {
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
    /// The attack would have disadvantage (long range, enemy next to the shooter).
    #[serde(default)]
    pub disadvantage: bool,
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
                    disadvantage: false,
                });
            }
        }
    }
    options.push(ActionOption {
        id: "dodge".to_string(),
        attack_id: None,
        target_id: None,
        disadvantage: false,
    });
    options
}

/// Average damage of an attack (to compare options).
pub fn expected_damage(attack: &Attack) -> i32 {
    DiceFormula::parse(&attack.damage).map_or(0, |f| f.average())
}
