use super::spells_features::cast;
use super::*;
use crate::*;
use rand::Rng;

/// Sneak Attack (once per turn, not with disadvantage): with advantage on the attack, or an
/// ally standing next to the target. Without a board an ally still standing is enough.
fn sneak_attack_allowed(
    actor: &Combatant,
    target: &Combatant,
    allies: &[(Option<GridPos>, bool)],
    distance_ft: Option<u32>,
    disadvantage: bool,
    used: bool,
) -> bool {
    if used
        || disadvantage
        || actor
            .stats5e
            .as_ref()
            .is_none_or(|s| sneak_attack_dice(s) == 0)
    {
        return false;
    }
    let (mode, _) = attack_conditions(actor, target, distance_ft);
    if mode == RollMode::Disadvantage {
        return false;
    }
    mode == RollMode::Advantage
        || allies.iter().any(|(pos, ready)| {
            *ready
                && match (pos, target.position) {
                    (Some(a), Some(t)) => a.squares_to(t) == 1,
                    _ => true,
                }
        })
}

/// Carries out a decision of the current combatant (uses its action; spells may use the
/// bonus action instead).
pub fn act<R: Rng + ?Sized>(
    t: &mut Table,
    decision: TurnDecision,
    rng: &mut R,
) -> Vec<CombatEvent> {
    if let TurnDecision::Cast(request) = &decision {
        return cast(t, request, rng);
    }
    if let TurnDecision::Feature(id) = &decision {
        return use_feature(t, id, rng);
    }
    t.combat.turn.action_used = true;
    let heroic_death = t.heroic_death();
    let map = t.map.as_ref();
    let combat = &mut *t.combat;
    let index = combat.current_turn_index;
    match decision {
        TurnDecision::Cast(_) | TurnDecision::Feature(_) => unreachable!("handled above"),
        TurnDecision::Attack {
            attack_id,
            target_id,
        } => {
            let actor = combat.combatants[index].clone();
            let attack = actor
                .stats5e
                .as_ref()
                .and_then(|s| s.attack(&attack_id))
                .cloned();
            let disadvantage = match (map, &attack, actor.position) {
                (Some(map), Some(attack), Some(from)) => combat
                    .combatants
                    .iter()
                    .find(|c| c.id == target_id)
                    .and_then(|target| {
                        attack_setup(map, &actor, attack, from, target, &combat.combatants)
                    })
                    .unwrap_or(false),
                _ => false,
            };
            // Allies of the attacker who stand ready (for Sneak Attack).
            let allies: Vec<(Option<GridPos>, bool)> = combat
                .combatants
                .iter()
                .filter(|c| c.id != actor.id && is_enemy(c) == is_enemy(&actor))
                .map(|c| (c.position, is_up(c) && !incapacitated(c)))
                .collect();
            let sneak_used = combat.turn.sneak_used;
            let target_can_react = !combat.reactions_used.contains(&target_id);
            let target = combat.combatants.iter_mut().find(|c| c.id == target_id);
            match (attack, target) {
                (Some(attack), Some(target)) => {
                    let distance_ft = actor
                        .position
                        .zip(target.position)
                        .map(|(a, b)| a.feet_to(b));
                    let stats = actor.stats5e.as_ref();
                    let sneak_dice = if sneak_attack_allowed(
                        &actor,
                        target,
                        &allies,
                        distance_ft,
                        disadvantage,
                        sneak_used,
                    ) {
                        stats.map_or(0, sneak_attack_dice)
                    } else {
                        0
                    };
                    let situation = AttackSituation {
                        disadvantage,
                        distance_ft,
                        heroic_death,
                        sneak_dice,
                        critical_from: stats.map_or(20, critical_from),
                        target_can_react,
                    };
                    let events = resolve_attack_with(&actor, &attack, target, &situation, rng);
                    if events.iter().any(|e| matches!(e, CombatEvent::Feature { feature, .. } if feature == SNEAK_ATTACK)) {
                        combat.turn.sneak_used = true;
                    }
                    if events.iter().any(|e| matches!(e, CombatEvent::Feature { feature, actor_id, .. } if feature == "shield" && *actor_id == target_id)) {
                        combat.reactions_used.push(target_id.clone());
                    }
                    events
                }
                _ => vec![CombatEvent::Pass {
                    actor_id: actor.id.clone(),
                    actor_name: actor.name.clone(),
                }],
            }
        }
        TurnDecision::Dodge => vec![take_dodge(&mut combat.combatants[index])],
        TurnDecision::Flee => vec![flee(&mut combat.combatants[index])],
        TurnDecision::Pass => {
            let actor = &combat.combatants[index];
            vec![CombatEvent::Pass {
                actor_id: actor.id.clone(),
                actor_name: actor.name.clone(),
            }]
        }
    }
}

/// Ends the current combatant's turn (short spell riders end, repeated saves) and starts
/// the next one. Dying heroes roll their death save, incapacitated creatures lose their turn,
/// both without waiting for anyone. Empty when nobody can act.
pub fn next_turn<R: Rng + ?Sized>(t: &mut Table, rng: &mut R) -> Vec<CombatEvent> {
    let mut events = Vec::new();
    let heroic = t.heroic_death();
    for _ in 0..t.combat.combatants.len() * 2 + 2 {
        let index = t.combat.current_turn_index;
        end_of_turn_conditions(&mut t.combat.combatants[index]);
        events.extend(repeat_saves(
            &mut t.combat.combatants,
            index,
            &mut t.combat.effects,
            rng,
        ));
        events.extend(settle(t.combat));
        if combat_outcome(&t.combat.combatants).is_some() || !advance_turn(t.combat) {
            break;
        }
        events.push(begin_turn(t));
        let index = t.combat.current_turn_index;
        let actor = &mut t.combat.combatants[index];
        if is_dying(actor) {
            events.push(death_save(actor, heroic, rng));
            continue;
        }
        if incapacitated(actor) {
            events.push(CombatEvent::Pass {
                actor_id: actor.id.clone(),
                actor_name: actor.name.clone(),
            });
            continue;
        }
        break;
    }
    events
}

/// After anything that can hurt: effects whose caster lost concentration end.
pub fn settle(combat: &mut EncounterState) -> Vec<CombatEvent> {
    sync_concentration(&mut combat.combatants, &mut combat.effects)
}

/// Moves the current combatant along the path to `target` (opportunity attacks included)
/// and spends the movement.
pub fn move_current<R: Rng + ?Sized>(
    t: &mut Table,
    target: GridPos,
    rng: &mut R,
) -> Vec<CombatEvent> {
    let Some(map) = t.map.as_ref() else {
        return Vec::new();
    };
    let combat = &mut *t.combat;
    let index = combat.current_turn_index;
    let actor = &combat.combatants[index];
    let Some(start) = actor.position else {
        return Vec::new();
    };
    let reach = reachable(
        map,
        start,
        combat.turn.movement_left_ft,
        &occupancy(actor, &combat.combatants),
    );
    let Some(cost) = reach.cost(target) else {
        return Vec::new();
    };
    let path = reach.path(target);
    combat.turn.movement_left_ft -= cost;
    let disengaged = combat.turn.disengaged;
    let events = walk(
        &mut combat.combatants,
        index,
        &path,
        disengaged,
        &mut combat.reactions_used,
        rng,
    );
    // Doors on the way open as the mover passes (up to where it stopped).
    let end = combat.combatants[index].position;
    let walked = end
        .and_then(|e| path.iter().position(|p| *p == e))
        .map_or(0, |i| i + 1);
    if let Some(map) = t.map.as_mut() {
        map.open_doors_on(&path[..walked]);
    }
    events
}

/// What the current combatant may do now, for the UI (and to check the player's action).
pub fn combat_options(combat: &EncounterState, map: Option<&BattleMap>) -> CombatOptions {
    if !combat.is_active {
        return CombatOptions::default();
    }
    let actor = &combat.combatants[combat.current_turn_index];
    let combatants = &combat.combatants;
    let turn = &combat.turn;
    let (reachable, mut actions) = match (map, actor.position) {
        (Some(map), Some(start)) => {
            let reach = reachable(
                map,
                start,
                turn.movement_left_ft,
                &occupancy(actor, combatants),
            );
            let squares = reach
                .ends()
                .into_iter()
                .filter(|(pos, _)| *pos != start)
                .map(|(pos, feet)| ReachSquare {
                    x: pos.x,
                    y: pos.y,
                    feet,
                    path: reach.path(pos),
                })
                .collect();
            (squares, actions_in_place(map, actor, combatants))
        }
        _ => (Vec::new(), legal_actions(actor, combatants)),
    };
    if turn.action_used {
        actions.clear();
    }
    CombatOptions {
        actor_id: actor.id.clone(),
        reachable,
        actions,
        movement_left_ft: turn.movement_left_ft,
        action_used: turn.action_used,
        bonus_action_used: turn.bonus_action_used,
        spells: spell_options(map, actor, combatants, cast_budget(combat)),
        features: feature_options(combat, map),
    }
}

/// The player's input for the current combatant.
#[derive(Debug, Clone, PartialEq)]
pub enum PlayerAction {
    Move(GridPos),
    Act(TurnDecision),
    Dash,
    Disengage,
    EndTurn,
}

/// Reads the player's action text (`move:x:y`, `attack:…`, `cast:…`, `feature:…`, `dodge`,
/// `dash`, `disengage`, `end_turn`) and checks it against [`combat_options`]; `None` when it
/// is not allowed now.
pub fn parse_player_action(
    combat: &EncounterState,
    map: Option<&BattleMap>,
    action: &str,
) -> Option<PlayerAction> {
    let options = combat_options(combat, map);
    let on_board = map.is_some();
    let action = action.trim();
    if action == "end_turn" {
        return on_board.then_some(PlayerAction::EndTurn);
    }
    if let Some(rest) = action.strip_prefix("move:") {
        let (x, y) = rest.split_once(':')?;
        let target = GridPos::new(x.parse().ok()?, y.parse().ok()?);
        return options
            .reachable
            .iter()
            .any(|s| s.x == target.x && s.y == target.y)
            .then_some(PlayerAction::Move(target));
    }
    if let Some(id) = action.strip_prefix("feature:") {
        return options
            .features
            .iter()
            .any(|o| o.id == id)
            .then(|| PlayerAction::Act(TurnDecision::Feature(id.to_string())));
    }
    if action.starts_with("cast:") {
        let request = CastRequest::parse(action)?;
        let caster = &combat.combatants[combat.current_turn_index];
        return check_cast(
            map,
            caster,
            &combat.combatants,
            &request,
            cast_budget(combat),
        )
        .ok()
        .map(|_| PlayerAction::Act(TurnDecision::Cast(action.to_string())));
    }
    if !on_board || options.action_used {
        return parse_action(action, &options.actions).map(PlayerAction::Act);
    }
    match action {
        "dash" => Some(PlayerAction::Dash),
        "disengage" => Some(PlayerAction::Disengage),
        _ => parse_action(action, &options.actions).map(PlayerAction::Act),
    }
}

/// Carries out the player's input; returns the events and whether the turn is over.
pub fn apply_player_action<R: Rng + ?Sized>(
    t: &mut Table,
    action: PlayerAction,
    rng: &mut R,
) -> (Vec<CombatEvent>, bool) {
    let index = t.combat.current_turn_index;
    let events = match action {
        PlayerAction::Move(target) => move_current(t, target, rng),
        PlayerAction::Act(decision) => act(t, decision, rng),
        PlayerAction::Dash => {
            let actor = &t.combat.combatants[index];
            t.combat.turn.movement_left_ft += speed_ft(actor);
            t.combat.turn.action_used = true;
            vec![CombatEvent::Dash {
                actor_id: actor.id.clone(),
                actor_name: actor.name.clone(),
            }]
        }
        PlayerAction::Disengage => {
            let actor = &t.combat.combatants[index];
            t.combat.turn.disengaged = true;
            t.combat.turn.action_used = true;
            vec![CombatEvent::Disengage {
                actor_id: actor.id.clone(),
                actor_name: actor.name.clone(),
            }]
        }
        PlayerAction::EndTurn => return (Vec::new(), true),
    };
    let turn = &t.combat.turn;
    // A bonus-action spell leaves the action (and without a board the turn) open.
    let over = !is_up(&t.combat.combatants[index])
        || (turn.action_used && (t.map.is_none() || turn.movement_left_ft == 0));
    (events, over)
}

/// A whole engine turn on the board: move to the planned square, then act.
pub fn play_board_plan<R: Rng + ?Sized>(
    t: &mut Table,
    plan: BoardPlan,
    rng: &mut R,
) -> Vec<CombatEvent> {
    let mut events = Vec::new();
    if let Some(target) = plan.move_to {
        events.extend(move_current(t, target, rng));
    }
    if is_up(&t.combat.combatants[t.combat.current_turn_index]) {
        events.extend(act(t, plan.action, rng));
    }
    events
}

/// Up to three sensible casts (and Turn Undead) as options for a companion's choice.
pub fn cast_options(
    combat: &EncounterState,
    map: Option<&BattleMap>,
    actor: &Combatant,
) -> Vec<ActionOption> {
    let mut plans = spell_plans(map, actor, &combat.combatants, cast_budget(combat));
    plans.sort_by_key(|(_, score)| -score);
    plans
        .into_iter()
        .filter(|(_, score)| *score > 0)
        .take(3)
        .map(|(request, _)| ActionOption {
            id: request.id(),
            attack_id: None,
            target_id: None,
            disadvantage: false,
        })
        .chain(
            // Channel Divinity against undead is an action the model may pick.
            feature_options(combat, map)
                .into_iter()
                .filter(|o| o.id == TURN_UNDEAD)
                .map(|o| ActionOption {
                    id: format!("feature:{}", o.id),
                    attack_id: None,
                    target_id: None,
                    disadvantage: false,
                }),
        )
        .collect()
}

/// The decision behind a companion's option id that is not an attack.
pub(super) fn extra_decision(id: &str) -> TurnDecision {
    match id.strip_prefix("feature:") {
        Some(feature) => TurnDecision::Feature(feature.to_string()),
        None => TurnDecision::Cast(id.to_string()),
    }
}

/// A companion with someone dying in reach of a healing spell casts it without asking.
pub fn urgent_cast(
    combat: &EncounterState,
    map: Option<&BattleMap>,
    actor: &Combatant,
) -> Option<String> {
    spell_plans(map, actor, &combat.combatants, cast_budget(combat))
        .into_iter()
        .filter(|(_, score)| *score >= URGENT_CAST)
        .max_by_key(|(_, score)| *score)
        .map(|(request, _)| request.id())
}
