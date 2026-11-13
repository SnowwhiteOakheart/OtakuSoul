use super::actions::extra_decision;
use super::*;
use crate::*;
use rand::Rng;

/// A planned engine turn: a decision where the combatant stands (fights without a board) or
/// a board plan (move, then act).
#[derive(Debug, Clone, PartialEq)]
pub enum PlannedTurn {
    InPlace(TurnDecision),
    Board(BoardPlan),
}

/// A companion's choice among legal options (the desktop asks the language model). What
/// [`CompanionChoice::pick`] returns for an unknown id or `None` is the engine's fallback.
#[derive(Debug, Clone, PartialEq)]
pub struct CompanionChoice {
    /// Option ids with what they mean (attacks, casts, Turn Undead, Dodge).
    pub options: Vec<ActionOption>,
    /// On a board: the plan behind each option (same order).
    plans: Option<Vec<BoardPlan>>,
    /// What the engine does without a (valid) choice.
    pub fallback: PlannedTurn,
}

impl CompanionChoice {
    /// The turn behind the chosen option id; the fallback for `None` or an unknown id.
    pub fn pick(self, id: Option<&str>) -> PlannedTurn {
        let chosen = id.and_then(|id| match self.plans {
            Some(plans) => self
                .options
                .iter()
                .zip(plans)
                .find(|(o, _)| o.id == id)
                .map(|(_, plan)| PlannedTurn::Board(plan)),
            None => if id.starts_with("cast:") || id.starts_with("feature:") {
                self.options
                    .iter()
                    .any(|o| o.id == id)
                    .then(|| extra_decision(id))
            } else {
                parse_action(id, &self.options)
            }
            .map(PlannedTurn::InPlace),
        });
        chosen.unwrap_or(self.fallback)
    }
}

/// How the engine plays the current combatant's turn.
#[derive(Debug, Clone, PartialEq)]
pub enum EnginePlan {
    /// No choice to make: monsters (engine AI), urgent healing, nothing to attack.
    Decided(PlannedTurn),
    /// A companion chooses among legal options.
    Choice(CompanionChoice),
}

/// Plans the turn of a monster or a companion (call after [`engine_turn_prelude`]). Monsters
/// follow the engine's AI; a companion heals the dying without asking, otherwise chooses among
/// the attacks it can set up this turn (moving there first), up to three casts and Dodge.
pub fn engine_plan(combat: &EncounterState, map: Option<&BattleMap>) -> EnginePlan {
    let actor = &combat.combatants[combat.current_turn_index];
    let combatants = &combat.combatants;
    let budget = combat.turn.movement_left_ft;
    let Some(map) = map else {
        return if is_enemy(actor) {
            EnginePlan::Decided(PlannedTurn::InPlace(monster_decision(actor, combatants)))
        } else if let Some(id) = urgent_cast(combat, None, actor) {
            EnginePlan::Decided(PlannedTurn::InPlace(TurnDecision::Cast(id)))
        } else {
            let mut options = legal_actions(actor, combatants);
            options.extend(cast_options(combat, None, actor));
            EnginePlan::Choice(CompanionChoice {
                options,
                plans: None,
                fallback: PlannedTurn::InPlace(hero_fallback_decision(actor, combatants)),
            })
        };
    };
    if is_enemy(actor) {
        return EnginePlan::Decided(PlannedTurn::Board(monster_board_plan(
            map, actor, combatants, budget,
        )));
    }
    if let Some(id) = urgent_cast(combat, Some(map), actor) {
        return EnginePlan::Decided(PlannedTurn::Board(BoardPlan {
            move_to: None,
            action: TurnDecision::Cast(id),
        }));
    }
    let mut plans: Vec<(ActionOption, BoardPlan)> = Vec::new();
    for (plan, disadvantage) in attack_plans(map, actor, combatants, budget, |c| c.hp) {
        if let TurnDecision::Attack {
            attack_id,
            target_id,
        } = &plan.action
        {
            let id = format!("attack:{attack_id}:{target_id}");
            if !plans.iter().any(|(o, _)| o.id == id) {
                let option = ActionOption {
                    id,
                    attack_id: Some(attack_id.clone()),
                    target_id: Some(target_id.clone()),
                    disadvantage,
                };
                plans.push((option, plan));
            }
        }
    }
    // Casts happen from where the companion stands.
    for option in cast_options(combat, Some(map), actor) {
        let action = extra_decision(&option.id);
        plans.push((
            option,
            BoardPlan {
                move_to: None,
                action,
            },
        ));
    }
    let fallback = || hero_board_plan(map, actor, combatants, budget);
    if plans.is_empty() {
        // Nothing to attack this turn: no choice to make, the companion closes in.
        return EnginePlan::Decided(PlannedTurn::Board(fallback()));
    }
    plans.push((
        ActionOption {
            id: "dodge".into(),
            attack_id: None,
            target_id: None,
            disadvantage: false,
        },
        BoardPlan {
            move_to: None,
            action: TurnDecision::Dodge,
        },
    ));
    let (options, plans) = plans.into_iter().unzip();
    EnginePlan::Choice(CompanionChoice {
        options,
        plans: Some(plans),
        fallback: PlannedTurn::Board(fallback()),
    })
}

/// Before an engine turn is planned: a badly hurt hero catches their Second Wind (bonus
/// action).
pub fn engine_turn_prelude<R: Rng + ?Sized>(t: &mut Table, rng: &mut R) -> Vec<CombatEvent> {
    let actor = &t.combat.combatants[t.combat.current_turn_index];
    if !is_enemy(actor)
        && actor.hp * 2 < actor.max_hp
        && feature_options(t.combat, t.map.as_ref())
            .iter()
            .any(|o| o.id == SECOND_WIND)
    {
        return use_feature(t, SECOND_WIND, rng);
    }
    Vec::new()
}

/// Carries out a planned engine turn.
pub fn play_turn<R: Rng + ?Sized>(
    t: &mut Table,
    turn: PlannedTurn,
    rng: &mut R,
) -> Vec<CombatEvent> {
    match turn {
        PlannedTurn::InPlace(decision) => act(t, decision, rng),
        PlannedTurn::Board(plan) => play_board_plan(t, plan, rng),
    }
}

/// The whole turn of a monster or a companion; `choose` answers a companion's choice with an
/// option id (`None` = the engine's fallback).
pub fn engine_turn<R: Rng + ?Sized>(
    t: &mut Table,
    rng: &mut R,
    choose: impl FnOnce(&Combatant, &CompanionChoice) -> Option<String>,
) -> Vec<CombatEvent> {
    let mut events = engine_turn_prelude(t, rng);
    let turn = match engine_plan(t.combat, t.map.as_ref()) {
        EnginePlan::Decided(turn) => turn,
        EnginePlan::Choice(choice) => {
            let actor = &t.combat.combatants[t.combat.current_turn_index];
            let id = choose(actor, &choice);
            choice.pick(id.as_deref())
        }
    };
    events.extend(play_turn(t, turn, rng));
    events
}

/// Plays monsters and companions until the player is to act or the fight is decided (at most
/// [`MAX_TURNS_PER_CALL`] turns), like the desktop after the player's turn.
pub fn play_until_player<R: Rng + ?Sized>(
    t: &mut Table,
    rng: &mut R,
    mut choose: impl FnMut(&Combatant, &CompanionChoice) -> Option<String>,
) -> Vec<CombatEvent> {
    let mut events = Vec::new();
    let mut turns = 0;
    while combat_outcome(&t.combat.combatants).is_none() && turns < MAX_TURNS_PER_CALL {
        let actor = &t.combat.combatants[t.combat.current_turn_index];
        if player_controls(t.rules, actor) {
            break;
        }
        events.extend(engine_turn(t, rng, &mut choose));
        turns += 1;
        if combat_outcome(&t.combat.combatants).is_some() {
            break;
        }
        let next = next_turn(t, rng);
        if next.is_empty() {
            break;
        }
        events.extend(next);
    }
    events
}

/// After a round: adds the end of a decided fight to `events` and keeps them in the fight log
/// (at most [`MAX_COMBAT_EVENTS`]). Returns the outcome; the app then ends the fight with
/// [`end_encounter`] (after a victory over a prepared encounter first counting it).
pub fn record_round(
    combat: &mut EncounterState,
    events: &mut Vec<CombatEvent>,
) -> Option<CombatOutcome> {
    let outcome = combat_outcome(&combat.combatants);
    if let Some(outcome) = outcome {
        events.push(CombatEvent::CombatEnd { outcome });
    }
    combat.events.extend(events.iter().cloned());
    let overflow = combat.events.len().saturating_sub(MAX_COMBAT_EVENTS);
    combat.events.drain(..overflow);
    outcome
}
