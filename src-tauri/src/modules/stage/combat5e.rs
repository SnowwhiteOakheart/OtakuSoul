//! Fights in 5e scenes (`SceneRules::ruleset == "5e"`): the rules engine (`rules5e`) resolves
//! every turn – monsters by its own AI, companions by the language model choosing one legal
//! action (or the engine's fallback), the player through the UI. Afterwards the game master
//! narrates the resulting events without changing them.

use super::rules5e::{self, CombatEvent, CombatOutcome, TurnDecision};
use super::*;

/// Fight events kept in the scene (log in the UI).
const MAX_EVENTS: usize = 300;
/// Enemies per fight; the language model cannot flood the scene.
const MAX_ENEMIES: usize = 12;
/// Engine turns per call before it stops (safety net; a fight never needs that many).
const MAX_TURNS_PER_CALL: usize = 60;

/// Class template when the scene names none: the player fights, companions take the other
/// roles in turn.
fn default_class(role: &str, companion_index: usize) -> &'static str {
    if role == "player" {
        "fighter"
    } else {
        ["cleric", "rogue", "wizard", "fighter"][companion_index % 4]
    }
}

/// Gives player and companions their rules values from the class templates (5e scenes only).
/// A changed class rebuilds the values; otherwise hit points stay as they are.
pub fn ensure_party_stats(state: &mut SceneState) {
    if !state.definition.is_5e() {
        return;
    }
    let rules = state.definition.rules.clone().unwrap_or_default();
    let class_for = |key: &str| {
        rules
            .hero_classes
            .iter()
            .find(|(name, _)| name.eq_ignore_ascii_case(key))
            .map(|(_, class)| class.clone())
    };
    let party = state.definition.party.clone();
    for combatant in state
        .combat
        .combatants
        .iter_mut()
        .filter(|c| rules5e::is_party(c))
    {
        let key = if combatant.role == "player" {
            "player"
        } else {
            combatant.name.as_str()
        };
        // Without a choice the place in the scene's party decides (stable across saves).
        let companion_index = party
            .iter()
            .position(|name| name.eq_ignore_ascii_case(&combatant.name))
            .unwrap_or(party.len());
        let wanted = class_for(key)
            .filter(|id| rules5e::class(id).is_some())
            .unwrap_or_else(|| default_class(&combatant.role, companion_index).to_string());
        if combatant
            .stats5e
            .as_ref()
            .is_some_and(|s| s.class_id == wanted)
        {
            combatant.hp = combatant.hp.min(combatant.max_hp);
            continue;
        }
        let Some(template) = rules5e::class(&wanted) else {
            continue;
        };
        let (stats, max_hp) = rules5e::hero_stats(template);
        combatant.stats5e = Some(stats);
        combatant.max_hp = max_hp;
        combatant.hp = max_hp;
    }
}

/// The planner's rule for encounters in 5e scenes, with the monsters it may use.
pub fn planner_encounter_rule() -> String {
    let ids = rules5e::monsters()
        .iter()
        .map(|m| format!("{} (CR {})", m.id, m.cr))
        .collect::<Vec<_>>()
        .join(", ");
    format!(
        r#"- encounter: only to start or end a fight. Start: {{"action":"start", "enemies":[{{"monster":"goblin", "count":2}}]}} with monster ids from: {ids}. End without a winner (surrender, escape, truce): {{"action":"end"}}. A rules engine resolves every attack, hit and wound – never put damage, hit points or hp_updates into the plan."#
    )
}

/// Sets up a fight with the SRD monsters the game master asked for. Unknown monsters are
/// skipped; returns false when none is left.
pub fn start_encounter(
    state: &mut SceneState,
    enemies: &[PlanCombatant],
    language_code: &str,
) -> bool {
    ensure_party_vitals(state);
    let mut fresh = Vec::new();
    for request in enemies {
        let id = request.monster.as_deref().unwrap_or(&request.name);
        let Some(data) = rules5e::monster(id) else {
            tracing::warn!("Unknown 5e monster '{id}' ignored");
            continue;
        };
        let count = request.count.unwrap_or(1).clamp(1, 8) as usize;
        for _ in 0..count {
            if fresh.len() >= MAX_ENEMIES {
                break;
            }
            fresh.push(data);
        }
    }
    if fresh.is_empty() {
        return false;
    }
    super::remove_enemies(state);
    let stamp = Utc::now().timestamp_millis();
    for (index, data) in fresh.iter().enumerate() {
        let base = data.name.get(language_code).to_string();
        let same_kind = fresh.iter().filter(|other| other.id == data.id).count();
        let number = fresh[..=index]
            .iter()
            .filter(|other| other.id == data.id)
            .count();
        let (stats, hp) = rules5e::monster_stats(data);
        state.combat.combatants.push(Combatant {
            id: format!("enemy_{stamp}_{index}"),
            name: if same_kind > 1 {
                format!("{base} {number}")
            } else {
                base
            },
            role: "enemy".to_string(),
            hp,
            max_hp: hp,
            stress: 0,
            max_stress: 0,
            initiative: 0,
            conditions: Vec::new(),
            skills: HashMap::new(),
            stats5e: Some(stats),
            position: None,
        });
    }
    for combatant in &mut state.combat.combatants {
        combatant
            .conditions
            .retain(|c| c.name != rules5e::DODGING && c.name != rules5e::FLED);
    }
    place_on_map(state);
    let mut rng = rand::rng();
    let initiative = rules5e::roll_initiative(&mut state.combat.combatants, &mut rng);
    state.combat.is_active = true;
    state.combat.round = 1;
    state.combat.current_turn_index = 0;
    state.combat.reactions_used.clear();
    state.combat.events = vec![initiative];
    // The first in the order may be down already (a hero from an earlier fight).
    if !rules5e::is_up(&state.combat.combatants[0]) {
        rules5e::advance_turn(&mut state.combat);
    }
    let start = begin_turn(state);
    state.combat.events.push(start);
    true
}

/// Loads the scene's battle map (if it has one) and places the party on the start zone and
/// the enemies on the spawn zone. Without a map nobody has a position.
fn place_on_map(state: &mut SceneState) {
    state.map = state
        .definition
        .rules
        .as_ref()
        .and_then(|r| r.map_id.as_deref())
        .and_then(rules5e::battle_map)
        .cloned();
    let Some(map) = state.map.clone() else {
        for combatant in &mut state.combat.combatants {
            combatant.position = None;
        }
        return;
    };
    let mut taken = Vec::new();
    for (zone, party) in [("party", true), ("spawn", false)] {
        let indices: Vec<usize> = (0..state.combat.combatants.len())
            .filter(|&i| rules5e::is_party(&state.combat.combatants[i]) == party)
            .collect();
        let spots = map.placements(zone, indices.len(), &taken);
        for (slot, index) in indices.into_iter().enumerate() {
            let spot = spots.get(slot).copied();
            state.combat.combatants[index].position = spot;
            taken.extend(spot);
        }
    }
}

/// Starts the current combatant's turn: effects "until your next turn" end, its reaction
/// comes back, and it gets its movement (on a board) and one action.
fn begin_turn(state: &mut SceneState) -> CombatEvent {
    let index = state.combat.current_turn_index;
    let round = state.combat.round;
    let actor = &mut state.combat.combatants[index];
    let speed = actor.stats5e.as_ref().map_or(30, |s| s.speed_ft);
    let actor_id = actor.id.clone();
    let event = rules5e::start_turn(actor, round);
    state.combat.reactions_used.retain(|id| *id != actor_id);
    state.combat.turn = rules5e::TurnBudget {
        movement_left_ft: if state.map.is_some() { speed } else { 0 },
        action_used: false,
        disengaged: false,
    };
    event
}

/// Ends the fight: enemies leave, fight-only effects end (Dodge, Bless, Sleep, Hold …);
/// heroes who went down wake with 1 hit point – except the dead (only with heroic death).
pub fn end_encounter(state: &mut SceneState, _outcome: Option<CombatOutcome>) {
    state.combat.is_active = false;
    state.combat.effects.clear();
    for combatant in state
        .combat
        .combatants
        .iter_mut()
        .filter(|c| rules5e::is_party(c))
    {
        let dead = combatant
            .stats5e
            .as_ref()
            .is_some_and(|s| s.death_saves.dead);
        if let Some(stats) = combatant.stats5e.as_mut() {
            stats.concentration = None;
            if !dead {
                stats.death_saves = rules5e::DeathSaves::default();
            }
        }
        if !dead {
            combatant.hp = combatant.hp.max(1);
            rules5e::remove_condition(combatant, rules5e::UNCONSCIOUS);
        }
    }
    // Conditions that only make sense within a fight; long-lasting buffs (Mage Armor, Aid)
    // and narrative conditions stay.
    const FIGHT_ONLY: [&str; 10] = [
        rules5e::DODGING,
        rules5e::FLED,
        rules5e::BLESSED,
        rules5e::SHIELD_OF_FAITH,
        rules5e::ASLEEP,
        rules5e::PARALYZED,
        rules5e::SLOWED,
        rules5e::GUIDED,
        rules5e::NO_HEAL,
        rules5e::PRONE,
    ];
    for combatant in &mut state.combat.combatants {
        combatant
            .conditions
            .retain(|c| !FIGHT_ONLY.contains(&c.name.as_str()));
    }
    super::remove_enemies(state);
}

/// The player decides for this combatant (always for the player, for companions when the
/// scene says so).
fn player_controls(state: &SceneState, combatant: &Combatant) -> bool {
    combatant.role == "player"
        || (combatant.role == "companion"
            && state
                .definition
                .rules
                .as_ref()
                .is_some_and(|r| r.control_companions))
}

/// Heroes die after three failed death saves (scene setting, off by default).
fn heroic_death(state: &SceneState) -> bool {
    state
        .definition
        .rules
        .as_ref()
        .is_some_and(|r| r.heroic_death)
}

/// Carries out a decision of the current combatant (uses its action).
fn act(state: &mut SceneState, decision: TurnDecision) -> Vec<CombatEvent> {
    state.combat.turn.action_used = true;
    let heroic_death = heroic_death(state);
    let index = state.combat.current_turn_index;
    let mut rng = rand::rng();
    match decision {
        TurnDecision::Attack {
            attack_id,
            target_id,
        } => {
            let actor = state.combat.combatants[index].clone();
            let attack = actor
                .stats5e
                .as_ref()
                .and_then(|s| s.attack(&attack_id))
                .cloned();
            let disadvantage = match (&state.map, &attack, actor.position) {
                (Some(map), Some(attack), Some(from)) => state
                    .combat
                    .combatants
                    .iter()
                    .find(|c| c.id == target_id)
                    .and_then(|target| {
                        rules5e::attack_setup(
                            map,
                            &actor,
                            attack,
                            from,
                            target,
                            &state.combat.combatants,
                        )
                    })
                    .unwrap_or(false),
                _ => false,
            };
            let target = state
                .combat
                .combatants
                .iter_mut()
                .find(|c| c.id == target_id);
            match (attack, target) {
                (Some(attack), Some(target)) => {
                    let situation = rules5e::AttackSituation {
                        disadvantage,
                        distance_ft: actor
                            .position
                            .zip(target.position)
                            .map(|(a, b)| a.feet_to(b)),
                        heroic_death,
                    };
                    rules5e::resolve_attack_with(&actor, &attack, target, &situation, &mut rng)
                }
                _ => vec![CombatEvent::Pass {
                    actor_id: actor.id.clone(),
                    actor_name: actor.name.clone(),
                }],
            }
        }
        TurnDecision::Dodge => vec![rules5e::take_dodge(&mut state.combat.combatants[index])],
        TurnDecision::Flee => vec![rules5e::flee(&mut state.combat.combatants[index])],
        TurnDecision::Pass => {
            let actor = &state.combat.combatants[index];
            vec![CombatEvent::Pass {
                actor_id: actor.id.clone(),
                actor_name: actor.name.clone(),
            }]
        }
    }
}

/// Next combatant's turn (or `None` when nobody can act).
/// Ends the current combatant's turn (short spell riders end, repeated saves) and starts
/// the next one. Dying heroes roll their death save, incapacitated creatures lose their turn,
/// both without waiting for anyone. Empty when nobody can act.
fn next_turn(state: &mut SceneState) -> Vec<CombatEvent> {
    let mut events = Vec::new();
    let mut rng = rand::rng();
    let heroic = heroic_death(state);
    for _ in 0..state.combat.combatants.len() * 2 + 2 {
        let index = state.combat.current_turn_index;
        rules5e::end_of_turn_conditions(&mut state.combat.combatants[index]);
        events.extend(rules5e::repeat_saves(
            &mut state.combat.combatants,
            index,
            &mut state.combat.effects,
            &mut rng,
        ));
        events.extend(settle(state));
        if rules5e::combat_outcome(&state.combat.combatants).is_some()
            || !rules5e::advance_turn(&mut state.combat)
        {
            break;
        }
        events.push(begin_turn(state));
        let index = state.combat.current_turn_index;
        let actor = &mut state.combat.combatants[index];
        if rules5e::is_dying(actor) {
            events.push(rules5e::death_save(actor, heroic, &mut rng));
            continue;
        }
        if rules5e::incapacitated(actor) {
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
fn settle(state: &mut SceneState) -> Vec<CombatEvent> {
    rules5e::sync_concentration(&mut state.combat.combatants, &mut state.combat.effects)
}

/// Moves the current combatant along the path to `target` (opportunity attacks included)
/// and spends the movement.
fn move_current(state: &mut SceneState, target: rules5e::GridPos) -> Vec<CombatEvent> {
    let Some(map) = state.map.clone() else {
        return Vec::new();
    };
    let index = state.combat.current_turn_index;
    let actor = state.combat.combatants[index].clone();
    let Some(start) = actor.position else {
        return Vec::new();
    };
    let reach = rules5e::reachable(
        &map,
        start,
        state.combat.turn.movement_left_ft,
        &rules5e::occupancy(&actor, &state.combat.combatants),
    );
    let Some(cost) = reach.cost(target) else {
        return Vec::new();
    };
    let path = reach.path(target);
    state.combat.turn.movement_left_ft -= cost;
    let disengaged = state.combat.turn.disengaged;
    rules5e::walk(
        &mut state.combat.combatants,
        index,
        &path,
        disengaged,
        &mut state.combat.reactions_used,
        &mut rand::rng(),
    )
}

/// What the current combatant may do now, for the UI (and to check the player's action).
pub fn combat_options(state: &SceneState) -> rules5e::CombatOptions {
    if !state.combat.is_active {
        return rules5e::CombatOptions::default();
    }
    let actor = &state.combat.combatants[state.combat.current_turn_index];
    let combatants = &state.combat.combatants;
    let turn = &state.combat.turn;
    let (reachable, mut actions) = match (&state.map, actor.position) {
        (Some(map), Some(start)) => {
            let reach = rules5e::reachable(
                map,
                start,
                turn.movement_left_ft,
                &rules5e::occupancy(actor, combatants),
            );
            let squares = reach
                .ends()
                .into_iter()
                .filter(|(pos, _)| *pos != start)
                .map(|(pos, feet)| rules5e::ReachSquare {
                    x: pos.x,
                    y: pos.y,
                    feet,
                })
                .collect();
            (squares, rules5e::actions_in_place(map, actor, combatants))
        }
        _ => (Vec::new(), rules5e::legal_actions(actor, combatants)),
    };
    if turn.action_used {
        actions.clear();
    }
    rules5e::CombatOptions {
        actor_id: actor.id.clone(),
        reachable,
        actions,
        movement_left_ft: turn.movement_left_ft,
        action_used: turn.action_used,
    }
}

/// The player's input for the current combatant.
enum PlayerAction {
    Move(rules5e::GridPos),
    Act(TurnDecision),
    Dash,
    Disengage,
    EndTurn,
}

fn parse_player_action(state: &SceneState, action: &str) -> Option<PlayerAction> {
    let options = combat_options(state);
    let on_board = state.map.is_some();
    let action = action.trim();
    if action == "end_turn" {
        return on_board.then_some(PlayerAction::EndTurn);
    }
    if let Some(rest) = action.strip_prefix("move:") {
        let (x, y) = rest.split_once(':')?;
        let target = rules5e::GridPos::new(x.parse().ok()?, y.parse().ok()?);
        return options
            .reachable
            .iter()
            .any(|s| s.x == target.x && s.y == target.y)
            .then_some(PlayerAction::Move(target));
    }
    if !on_board || options.action_used {
        return rules5e::parse_action(action, &options.actions).map(PlayerAction::Act);
    }
    match action {
        "dash" => Some(PlayerAction::Dash),
        "disengage" => Some(PlayerAction::Disengage),
        _ => rules5e::parse_action(action, &options.actions).map(PlayerAction::Act),
    }
}

/// Carries out the player's input; returns the events and whether the turn is over.
fn apply_player_action(state: &mut SceneState, action: PlayerAction) -> (Vec<CombatEvent>, bool) {
    let index = state.combat.current_turn_index;
    let events = match action {
        PlayerAction::Move(target) => move_current(state, target),
        PlayerAction::Act(decision) => act(state, decision),
        PlayerAction::Dash => {
            let actor = &state.combat.combatants[index];
            state.combat.turn.movement_left_ft += actor.stats5e.as_ref().map_or(30, |s| s.speed_ft);
            state.combat.turn.action_used = true;
            vec![CombatEvent::Dash {
                actor_id: actor.id.clone(),
                actor_name: actor.name.clone(),
            }]
        }
        PlayerAction::Disengage => {
            let actor = &state.combat.combatants[index];
            state.combat.turn.disengaged = true;
            state.combat.turn.action_used = true;
            vec![CombatEvent::Disengage {
                actor_id: actor.id.clone(),
                actor_name: actor.name.clone(),
            }]
        }
        PlayerAction::EndTurn => return (Vec::new(), true),
    };
    let turn = &state.combat.turn;
    let over = state.map.is_none()
        || !rules5e::is_up(&state.combat.combatants[index])
        || (turn.action_used && turn.movement_left_ft == 0);
    (events, over)
}

/// A whole engine turn on the board: move to the planned square, then act.
fn play_board_plan(state: &mut SceneState, plan: rules5e::BoardPlan) -> Vec<CombatEvent> {
    let mut events = Vec::new();
    if let Some(target) = plan.move_to {
        events.extend(move_current(state, target));
    }
    if rules5e::is_up(&state.combat.combatants[state.combat.current_turn_index]) {
        events.extend(act(state, plan.action));
    }
    events
}

/// One line per legal action for the language model: id and what it means.
fn describe_options(
    actor: &Combatant,
    combatants: &[Combatant],
    options: &[rules5e::ActionOption],
) -> String {
    options
        .iter()
        .map(|option| match (&option.attack_id, &option.target_id) {
            (Some(attack_id), Some(target_id)) => {
                let attack = actor.stats5e.as_ref().and_then(|s| s.attack(attack_id));
                let target = combatants.iter().find(|c| &c.id == target_id);
                format!(
                    "{} — {} ({:+} to hit, {}) against {} ({})",
                    option.id,
                    attack.map_or(attack_id.as_str(), |a| a.name.en.as_str()),
                    attack.map_or(0, |a| a.to_hit),
                    attack.map_or("", |a| a.damage.as_str()),
                    target.map_or(target_id.as_str(), |t| t.name.as_str()),
                    target.map_or("", |t| tier_text(rules5e::health_tier(t.hp, t.max_hp))),
                )
            }
            _ => format!(
                "{} — take cover and defend (attacks against you have disadvantage)",
                option.id
            ),
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn tier_text(tier: rules5e::HealthTier) -> &'static str {
    match tier {
        rules5e::HealthTier::Unhurt => "unhurt",
        rules5e::HealthTier::Wounded => "wounded",
        rules5e::HealthTier::BadlyWounded => "badly wounded",
        rules5e::HealthTier::Down => "down",
    }
}

/// A companion's choice among `options`: the language model answers with one id. `None` when
/// the answer names none, the call fails or the turn was stopped (the caller falls back).
async fn companion_choice(
    state: &SceneState,
    inference: &InferenceClient,
    llm: &StageLlm,
    options: &[rules5e::ActionOption],
) -> Option<String> {
    if inference.is_aborted() || options.is_empty() {
        return None;
    }
    let actor = &state.combat.combatants[state.combat.current_turn_index];
    let combatants = &state.combat.combatants;
    let class = actor
        .stats5e
        .as_ref()
        .and_then(|s| rules5e::class(&s.class_id))
        .map_or("adventurer", |c| c.name.en.as_str());
    let situation = combatants
        .iter()
        .filter(|c| rules5e::is_up(c))
        .map(|c| {
            format!(
                "- {} ({}, {})",
                c.name,
                c.role,
                tier_text(rules5e::health_tier(c.hp, c.max_hp))
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let prompt = format!(
        "[STAGE — COMBAT ACTION]\nYou decide the next action of {name}, a {class}, in a fight.\nStill fighting:\n{situation}\n\nOptions (id — meaning):\n{options}\n\nAnswer with the id of exactly one option and nothing else.",
        name = actor.name,
        options = describe_options(actor, combatants, options),
    );
    let answer = inference
        .with_abort(inference.generate_direct(llm.request(prompt, 40)))
        .await?
        .ok()?;
    // The longest id the answer contains (so "dodge" inside other words does not win).
    let mut by_length: Vec<&rules5e::ActionOption> = options.iter().collect();
    by_length.sort_by_key(|o| std::cmp::Reverse(o.id.len()));
    by_length
        .into_iter()
        .find(|option| answer.contains(&option.id))
        .map(|option| option.id.clone())
}

/// The turn of a monster or a companion, decided by the engine (monsters) or the language
/// model among legal options (companions), on the board including movement.
async fn engine_turn(
    state: &mut SceneState,
    inference: &InferenceClient,
    llm: &StageLlm,
) -> Vec<CombatEvent> {
    let actor = state.combat.combatants[state.combat.current_turn_index].clone();
    let budget = state.combat.turn.movement_left_ft;
    let Some(map) = state.map.clone() else {
        let decision = if rules5e::is_enemy(&actor) {
            rules5e::monster_decision(&actor, &state.combat.combatants)
        } else {
            let options = rules5e::legal_actions(&actor, &state.combat.combatants);
            companion_choice(state, inference, llm, &options)
                .await
                .and_then(|id| rules5e::parse_action(&id, &options))
                .unwrap_or_else(|| {
                    rules5e::hero_fallback_decision(&actor, &state.combat.combatants)
                })
        };
        return act(state, decision);
    };
    let plan = if rules5e::is_enemy(&actor) {
        rules5e::monster_board_plan(&map, &actor, &state.combat.combatants, budget)
    } else {
        // The model chooses among the attacks the companion can set up this turn (moving
        // there first) and Dodge.
        let mut plans: Vec<(rules5e::ActionOption, rules5e::BoardPlan)> = Vec::new();
        for (plan, disadvantage) in
            rules5e::attack_plans(&map, &actor, &state.combat.combatants, budget, |c| c.hp)
        {
            if let TurnDecision::Attack {
                attack_id,
                target_id,
            } = &plan.action
            {
                let id = format!("attack:{attack_id}:{target_id}");
                if !plans.iter().any(|(o, _)| o.id == id) {
                    let option = rules5e::ActionOption {
                        id,
                        attack_id: Some(attack_id.clone()),
                        target_id: Some(target_id.clone()),
                        disadvantage,
                    };
                    plans.push((option, plan));
                }
            }
        }
        if plans.is_empty() {
            // Nothing to attack this turn: no choice to make, the companion closes in.
            rules5e::hero_board_plan(&map, &actor, &state.combat.combatants, budget)
        } else {
            plans.push((
                rules5e::ActionOption {
                    id: "dodge".into(),
                    attack_id: None,
                    target_id: None,
                    disadvantage: false,
                },
                rules5e::BoardPlan {
                    move_to: None,
                    action: TurnDecision::Dodge,
                },
            ));
            let options: Vec<rules5e::ActionOption> =
                plans.iter().map(|(o, _)| o.clone()).collect();
            companion_choice(state, inference, llm, &options)
                .await
                .and_then(|id| {
                    plans
                        .into_iter()
                        .find(|(o, _)| o.id == id)
                        .map(|(_, plan)| plan)
                })
                .unwrap_or_else(|| {
                    rules5e::hero_board_plan(&map, &actor, &state.combat.combatants, budget)
                })
        }
    };
    play_board_plan(state, plan)
}

/// Plain facts of the events for the narrator (English; it narrates in the reply language).
fn report(events: &[CombatEvent]) -> String {
    events
        .iter()
        .filter_map(|event| match event {
            CombatEvent::Attack {
                attacker_name,
                target_name,
                attack_name,
                hit,
                critical,
                ..
            } => Some(format!(
                "{attacker_name} attacks {target_name} with {}: {}.",
                attack_name.en,
                if *critical {
                    "a critical hit"
                } else if *hit {
                    "hit"
                } else {
                    "miss"
                }
            )),
            CombatEvent::Damage {
                target_name,
                amount,
                damage_type,
                tier,
                ..
            } => Some(format!(
                "{target_name} takes {amount} {damage_type} damage and is now {}.",
                tier_text(*tier)
            )),
            CombatEvent::Down { target_name, .. } => Some(format!("{target_name} goes down.")),
            CombatEvent::Dodge { actor_name, .. } => {
                Some(format!("{actor_name} takes cover and defends."))
            }
            CombatEvent::Flee { actor_name, .. } => {
                Some(format!("{actor_name} flees from the fight."))
            }
            CombatEvent::Move {
                actor_name, feet, ..
            } => Some(format!("{actor_name} moves {feet} feet.")),
            CombatEvent::OpportunityAttack {
                attacker_name,
                target_name,
                ..
            } => Some(format!(
                "{attacker_name} strikes at {target_name}, who is leaving its reach:"
            )),
            CombatEvent::Dash { actor_name, .. } => Some(format!("{actor_name} dashes.")),
            CombatEvent::Disengage { actor_name, .. } => {
                Some(format!("{actor_name} carefully disengages."))
            }
            CombatEvent::CombatEnd { outcome } => Some(match outcome {
                CombatOutcome::Victory => {
                    "The fight is won: no enemy is left standing.".to_string()
                }
                CombatOutcome::Defeat => {
                    "The party is defeated: everyone has gone down.".to_string()
                }
            }),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// The game master narrates what happened; nothing is changed. A failed or stopped call
/// leaves only the log (the UI shows the events anyway).
async fn narrate(
    state: &mut SceneState,
    events: &[CombatEvent],
    inference: &InferenceClient,
    llm: &StageLlm,
    on_stream: StageStream<'_>,
) {
    let facts = report(events);
    if facts.is_empty() || inference.is_aborted() {
        return;
    }
    let reply_language = crate::modules::content_lang::ContentLang::reply_language_name();
    let lang_code = crate::modules::content_lang::language_code(&reply_language);
    let definition = state.definition.localized(&lang_code);
    let recent = state
        .chat_log
        .iter()
        .rev()
        .take(4)
        .rev()
        .map(|m| line_for(m, Audience::Narrator))
        .collect::<Vec<_>>()
        .join("\n");
    let prompt = format!(
        "[STAGE — COMBAT REPORT]\nYou are the game master of a tabletop fantasy adventure (tone: {tone}). Narrator style: {style}\nRecent story:\n{recent}\n\nThese things just happened in the fight, in this order; they are final:\n{facts}\n\nNarrate them in {reply_language} in 2 to 5 vivid sentences. Keep every outcome exactly as given: no extra hits, wounds or enemies, nobody acts who is not listed. Do not mention dice, numbers or armor class.",
        tone = definition.gm_tone,
        style = definition.narrator_style,
    );
    let mut request = llm.request(prompt, 400);
    if let Some(sampling) = request.sampling.as_mut() {
        sampling.temperature = Some(0.8);
    }
    let message_id = format!("msg_{}", Utc::now().timestamp_millis());
    let text = super::turn::stream_message(
        inference,
        request,
        on_stream,
        &message_id,
        "Game Master",
        "gm",
        None,
    )
    .await
    .ok()
    .filter(|text| !text.trim().is_empty());
    if let Some(content) = text {
        state.chat_log.push(SceneTurnMessage {
            id: message_id,
            sender_id: "gm".to_string(),
            sender_name: "Game Master".to_string(),
            sender_role: "gm".to_string(),
            avatar_url: None,
            content,
            turn_mode: "do".to_string(),
            whisper_target: None,
            event_card: None,
            timestamp: Utc::now().timestamp() as u64,
        });
    }
}

/// Plays a fight on: the player's action (if given) for the current combatant, then every
/// turn the engine or the companions decide until the player is up again or the fight ends,
/// then the narration. Without an action it only continues (e.g. right after the start).
pub async fn execute_combat_turn(
    engine: &StageEngine,
    inference: &InferenceClient,
    scene_id: &str,
    action: Option<String>,
    on_stream: StageStream<'_>,
) -> Result<SceneState, String> {
    inference.reset_abort();
    let mut state = engine.get_state();
    if state.definition.id != scene_id {
        state = load_scene_by_id(scene_id)?;
    }
    if !state.definition.is_5e() || !state.combat.is_active {
        return Err(crate::err!("backend.stage.noCombat"));
    }
    let mut events = Vec::new();
    let current = &state.combat.combatants[state.combat.current_turn_index];
    if let Some(action) = action.as_deref() {
        if !player_controls(&state, current) {
            return Err(crate::err!("backend.stage.notYourTurn"));
        }
        let action = parse_player_action(&state, action)
            .ok_or_else(|| crate::err!("backend.stage.invalidAction"))?;
        engine.push_snapshot(&state.definition.id, state.clone());
        let (done, turn_over) = apply_player_action(&mut state, action);
        events.extend(done);
        if rules5e::combat_outcome(&state.combat.combatants).is_none() {
            if !turn_over {
                // Still the player's turn on the board: keep the events, no narration yet.
                state.combat.events.extend(events);
                engine.set_state(state.clone());
                save_scene_state(&state)?;
                return Ok(state);
            }
            events.extend(next_turn(&mut state));
        }
    } else if player_controls(&state, current) {
        // Nothing to continue: it is the player's turn.
        return Ok(state);
    } else {
        engine.push_snapshot(&state.definition.id, state.clone());
    }

    let llm = StageLlm::from_settings();
    let mut turns = 0;
    while rules5e::combat_outcome(&state.combat.combatants).is_none() && turns < MAX_TURNS_PER_CALL
    {
        let actor = state.combat.combatants[state.combat.current_turn_index].clone();
        if player_controls(&state, &actor) {
            break;
        }
        events.extend(engine_turn(&mut state, inference, &llm).await);
        turns += 1;
        if rules5e::combat_outcome(&state.combat.combatants).is_some() {
            break;
        }
        let next = next_turn(&mut state);
        if next.is_empty() {
            break;
        }
        events.extend(next);
    }

    let outcome = rules5e::combat_outcome(&state.combat.combatants);
    if let Some(outcome) = outcome {
        events.push(CombatEvent::CombatEnd { outcome });
    }
    state.combat.events.extend(events.iter().cloned());
    let overflow = state.combat.events.len().saturating_sub(MAX_EVENTS);
    state.combat.events.drain(..overflow);
    narrate(&mut state, &events, inference, &llm, on_stream).await;
    if let Some(outcome) = outcome {
        end_encounter(&mut state, Some(outcome));
    }
    state.current_turn_actor = "PLAYER".to_string();
    state.definition.last_played = Some(Utc::now().to_rfc3339());
    engine.set_state(state.clone());
    save_scene_state(&state)?;
    Ok(state)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn five_e_scene(classes: &[(&str, &str)]) -> SceneState {
        let mut state = StageEngine::new().get_state();
        state.definition.party = vec!["Lyra".into(), "Finn".into()];
        state.definition.rules = Some(SceneRules {
            ruleset: "5e".into(),
            hero_classes: classes
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
            control_companions: false,
            heroic_death: false,
            map_id: None,
        });
        state.combat.combatants.retain(|c| c.role == "player");
        ensure_party_vitals(&mut state);
        state
    }

    fn party_class(state: &SceneState, name: &str) -> String {
        let c = state
            .combat
            .combatants
            .iter()
            .find(|c| c.name == name || c.role == name)
            .unwrap();
        c.stats5e.as_ref().unwrap().class_id.clone()
    }

    #[test]
    fn party_gets_class_values_and_keeps_hit_points() {
        let mut state = five_e_scene(&[("lyra", "wizard")]);
        assert_eq!(party_class(&state, "player"), "fighter");
        assert_eq!(party_class(&state, "Lyra"), "wizard");
        // Finn is the second companion without a choice: rogue.
        assert_eq!(party_class(&state, "Finn"), "rogue");
        let lyra = state
            .combat
            .combatants
            .iter_mut()
            .find(|c| c.name == "Lyra")
            .unwrap();
        assert_eq!(lyra.max_hp, 7); // d6 + CON 13 (+1)
        lyra.hp = 3;
        ensure_party_stats(&mut state);
        assert_eq!(
            state
                .combat
                .combatants
                .iter()
                .find(|c| c.name == "Lyra")
                .unwrap()
                .hp,
            3
        );
        // Narrative scenes stay without rules values.
        let mut plain = StageEngine::new().get_state();
        ensure_party_vitals(&mut plain);
        assert!(plain.combat.combatants.iter().all(|c| c.stats5e.is_none()));
    }

    #[test]
    fn encounter_starts_with_srd_monsters_only() {
        let mut state = five_e_scene(&[]);
        let request = |monster: &str, count| PlanCombatant {
            name: String::new(),
            monster: Some(monster.into()),
            count: Some(count),
            hp: 99,
            role: "enemy".into(),
        };
        assert!(!start_encounter(&mut state, &[request("dragon", 1)], "de"));
        assert!(!state.combat.is_active);
        assert!(start_encounter(
            &mut state,
            &[request("goblin", 2), request("dragon", 1)],
            "de"
        ));
        let enemies: Vec<_> = state
            .combat
            .combatants
            .iter()
            .filter(|c| rules5e::is_enemy(c))
            .collect();
        assert_eq!(enemies.len(), 2);
        // SRD hit points, not the 99 from the plan; numbered German names.
        assert!(enemies.iter().all(|e| e.hp == 7 && e.stats5e.is_some()));
        assert_eq!(
            enemies
                .iter()
                .map(|e| e.name.as_str())
                .collect::<std::collections::BTreeSet<_>>(),
            ["Goblin 1", "Goblin 2"].into()
        );
        assert!(matches!(
            state.combat.events[0],
            CombatEvent::Initiative { .. }
        ));
        assert!(matches!(
            state.combat.events[1],
            CombatEvent::TurnStart { .. }
        ));
        assert_eq!(state.combat.combatants.len(), 5);
    }

    #[test]
    fn downed_heroes_wake_with_one_hit_point_after_any_end() {
        let mut state = five_e_scene(&[]);
        start_encounter(
            &mut state,
            &[PlanCombatant {
                name: "Orc".into(),
                monster: None,
                count: None,
                hp: 1,
                role: "enemy".into(),
            }],
            "en",
        );
        for c in state
            .combat
            .combatants
            .iter_mut()
            .filter(|c| rules5e::is_party(c))
        {
            c.hp = 0;
        }
        assert_eq!(
            rules5e::combat_outcome(&state.combat.combatants),
            Some(CombatOutcome::Defeat)
        );
        end_encounter(&mut state, Some(CombatOutcome::Defeat));
        assert!(!state.combat.is_active);
        assert!(
            state
                .combat
                .combatants
                .iter()
                .all(|c| rules5e::is_party(c) && c.hp == 1)
        );
        // After a victory too: someone who went down does not stay at 0.
        let goblin = PlanCombatant {
            name: "Goblin".into(),
            monster: None,
            count: None,
            hp: 1,
            role: "enemy".into(),
        };
        start_encounter(&mut state, &[goblin], "en");
        let player = |state: &mut SceneState| {
            state
                .combat
                .combatants
                .iter_mut()
                .find(|c| c.role == "player")
                .unwrap()
                .hp
        };
        state
            .combat
            .combatants
            .iter_mut()
            .find(|c| c.role == "player")
            .unwrap()
            .hp = 0;
        end_encounter(&mut state, Some(CombatOutcome::Victory));
        assert_eq!(player(&mut state), 1);
    }

    #[test]
    fn report_and_options_read_as_plain_facts() {
        let events = vec![
            CombatEvent::Down {
                target_id: "g".into(),
                target_name: "Goblin 1".into(),
            },
            CombatEvent::CombatEnd {
                outcome: CombatOutcome::Victory,
            },
            CombatEvent::Pass {
                actor_id: "x".into(),
                actor_name: "X".into(),
            },
        ];
        assert_eq!(
            report(&events),
            "Goblin 1 goes down.\nThe fight is won: no enemy is left standing."
        );
        let mut state = five_e_scene(&[]);
        start_encounter(
            &mut state,
            &[PlanCombatant {
                name: String::new(),
                monster: Some("wolf".into()),
                count: Some(1),
                hp: 0,
                role: "enemy".into(),
            }],
            "en",
        );
        let lyra = state
            .combat
            .combatants
            .iter()
            .find(|c| c.name == "Lyra")
            .unwrap();
        let options = rules5e::legal_actions(lyra, &state.combat.combatants);
        let text = describe_options(lyra, &state.combat.combatants, &options);
        assert!(text.contains("against Wolf (unhurt)"), "{text}");
        assert!(text.lines().last().unwrap().starts_with("dodge — "));
    }
}

#[cfg(test)]
mod board_tests {
    use super::*;

    fn crypt_scene() -> SceneState {
        let mut state = StageEngine::new().get_state();
        state.definition.party = vec!["Lyra".into()];
        state.definition.rules = Some(SceneRules {
            ruleset: "5e".into(),
            hero_classes: HashMap::new(),
            control_companions: false,
            heroic_death: false,
            map_id: Some("crypt_hall".into()),
        });
        state.combat.combatants.retain(|c| c.role == "player");
        ensure_party_vitals(&mut state);
        let goblins = PlanCombatant {
            name: String::new(),
            monster: Some("goblin".into()),
            count: Some(2),
            hp: 0,
            role: "enemy".into(),
        };
        assert!(start_encounter(&mut state, &[goblins], "de"));
        state
    }

    #[test]
    fn fighters_are_placed_on_their_zones() {
        let state = crypt_scene();
        let map = state.map.as_ref().expect("map loaded");
        for c in &state.combat.combatants {
            let pos = c.position.expect("placed");
            let zone = map.cell(pos).and_then(|cell| cell.zone.clone());
            assert_eq!(
                zone.as_deref(),
                Some(if rules5e::is_party(c) {
                    "party"
                } else {
                    "spawn"
                }),
                "{}",
                c.name
            );
        }
    }

    #[test]
    fn the_player_moves_within_its_speed_and_ends_the_turn() {
        let mut state = crypt_scene();
        let player = state
            .combat
            .combatants
            .iter()
            .position(|c| c.role == "player")
            .unwrap();
        state.combat.current_turn_index = player;
        begin_turn(&mut state);
        assert_eq!(state.combat.turn.movement_left_ft, 30);
        let options = combat_options(&state);
        let step = options
            .reachable
            .iter()
            .find(|s| s.feet == 5)
            .expect("a neighbour square");
        let action = parse_player_action(&state, &format!("move:{}:{}", step.x, step.y))
            .expect("valid move");
        let (_, over) = apply_player_action(&mut state, action);
        assert!(!over);
        assert_eq!(state.combat.turn.movement_left_ft, 25);
        assert_eq!(
            state.combat.combatants[player].position,
            Some(rules5e::GridPos::new(step.x, step.y))
        );
        // Too far, into a wall, or not a move at all.
        assert!(parse_player_action(&state, "move:14:10").is_none());
        assert!(parse_player_action(&state, "move:0:0").is_none());
        assert!(parse_player_action(&state, "fly").is_none());
        // Dash doubles the movement but uses the action; then the turn ends on request.
        let (_, over) = {
            let action = parse_player_action(&state, "dash").unwrap();
            apply_player_action(&mut state, action)
        };
        assert!(!over && state.combat.turn.action_used);
        assert_eq!(state.combat.turn.movement_left_ft, 55);
        assert!(combat_options(&state).actions.is_empty());
        let (_, over) = {
            let action = parse_player_action(&state, "end_turn").unwrap();
            apply_player_action(&mut state, action)
        };
        assert!(over);
    }
}
