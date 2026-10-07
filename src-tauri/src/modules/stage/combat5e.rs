//! Fights in 5e scenes (`SceneRules::ruleset == "5e"`): the rules engine (`rules5e`) resolves
//! every turn – monsters by its own AI, companions by the language model choosing one legal
//! action (or the engine's fallback), the player through the UI. Afterwards the game master
//! narrates the resulting events without changing them.

use super::rules5e::{self, CombatEvent, CombatOutcome, DeathSaveOutcome, TurnDecision};
use super::*;
use rand::RngExt;

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
/// A changed class rebuilds the values; otherwise hit points stay as they are. Order: the
/// scene's choice, the class on the character card (`extensions.otakusoul_5e.class`, read
/// once when the hero joins), the default by place in the party.
pub fn ensure_party_stats(state: &mut SceneState) {
    if !state.definition.is_5e() {
        return;
    }
    let needs_cards = state
        .combat
        .combatants
        .iter()
        .any(|c| c.role == "companion" && c.stats5e.is_none());
    let cards = if needs_cards {
        crate::modules::paths::scan_available_characters()
    } else {
        Vec::new()
    };
    ensure_party_stats_with(state, |name| {
        cards
            .iter()
            .find(|c| c.card.data.name.eq_ignore_ascii_case(name))
            .and_then(|c| card_class(&c.card.data.extensions))
    });
}

/// The 5e class a character card names (`extensions.otakusoul_5e.class`).
pub fn card_class(extensions: &serde_json::Value) -> Option<String> {
    extensions
        .get("otakusoul_5e")?
        .get("class")?
        .as_str()
        .filter(|id| rules5e::class(id).is_some())
        .map(str::to_string)
}

fn ensure_party_stats_with(state: &mut SceneState, card_class_of: impl Fn(&str) -> Option<String>) {
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
        let chosen = class_for(key).filter(|id| rules5e::class(id).is_some());
        let wanted = match (chosen, &combatant.stats5e) {
            (Some(id), _) => id,
            // No choice in the scene: a hero keeps the class they joined with.
            (None, Some(stats)) if rules5e::class(&stats.class_id).is_some() => {
                stats.class_id.clone()
            }
            (None, _) => (combatant.role == "companion")
                .then(|| card_class_of(&combatant.name))
                .flatten()
                .unwrap_or_else(|| default_class(&combatant.role, companion_index).to_string()),
        };
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
pub fn planner_encounter_rule(state: &SceneState) -> String {
    let map_rule = super::explore5e::planner_map_rule(state);
    let ids = rules5e::monsters()
        .iter()
        .map(|m| format!("{} (CR {})", m.id, m.cr))
        .collect::<Vec<_>>()
        .join(", ");
    format!(
        r#"- encounter: only to start or end a fight. Start: {{"action":"start", "enemies":[{{"monster":"goblin", "count":2}}]}} with monster ids from: {ids}. End without a winner (surrender, escape, truce): {{"action":"end"}}. A rules engine resolves every attack, hit and wound – never put damage, hit points or hp_updates into the plan.
- dice_check (5e): skill_name must be one of {skills}; the engine adds the character's own bonus, so the formula is ignored.{map_rule}"#,
        skills = rules5e::skill_ids().join(", "),
    )
}

/// A 5e rest for the party. Short: each hero spends hit dice (d + CON) while below three
/// quarters of their hit points. Long: full hit points, all spell slots, half the hit dice
/// back, death saves and fight conditions cleared, Aid ends. Returns one line per hero for
/// the chronicle (English; the narrator retells it).
pub fn rest_party(state: &mut SceneState, long: bool) -> Vec<String> {
    let mut rng = rand::rng();
    let mut lines = Vec::new();
    for c in state
        .combat
        .combatants
        .iter_mut()
        .filter(|c| rules5e::is_party(c))
    {
        let Some(stats) = c.stats5e.as_mut() else {
            continue;
        };
        if stats.death_saves.dead {
            continue;
        }
        let before = c.hp;
        if long {
            if c.conditions.iter().any(|x| x.name == rules5e::AID) {
                c.max_hp = (c.max_hp - 5).max(1);
            }
            c.hp = c.max_hp;
            stats.hit_dice_left = (stats.hit_dice_left + (stats.level / 2).max(1)).min(stats.level);
            if let Some(casting) = stats.spellcasting.as_mut() {
                casting.slots_used = [0; 9];
            }
            stats.death_saves = rules5e::DeathSaves::default();
            stats.concentration = None;
            c.conditions.clear();
        } else {
            let con = stats.modifier(rules5e::Ability::Con);
            while stats.hit_dice_left > 0 && c.hp * 4 < c.max_hp * 3 {
                stats.hit_dice_left -= 1;
                let roll = rng.random_range(1..=stats.hit_die) as i32;
                c.hp = (c.hp + (roll + con).max(1)).min(c.max_hp);
            }
            if c.hp > 0 {
                stats.death_saves = rules5e::DeathSaves::default();
                c.conditions.retain(|x| x.name != rules5e::UNCONSCIOUS);
            }
        }
        lines.push(format!("{}: {} → {} HP", c.name, before, c.hp));
    }
    lines
}

/// Sets up a fight with the SRD monsters the game master asked for. Unknown monsters are
/// skipped; returns false when none is left.
pub fn start_encounter(
    state: &mut SceneState,
    enemies: &[PlanCombatant],
    language_code: &str,
) -> bool {
    start_encounter_at(state, enemies, language_code, "spawn")
}

/// Like [`start_encounter`], with the monsters placed on `zone` of the map.
pub fn start_encounter_at(
    state: &mut SceneState,
    enemies: &[PlanCombatant],
    language_code: &str,
    zone: &str,
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
    place_on_map(state, zone);
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
/// Places the fighters. While the party explores a map they keep their squares (and the map
/// its fog, doors and traps) and only the enemies arrive on `zone`; otherwise the scene's
/// map is set up fresh with the party on its start zone.
fn place_on_map(state: &mut SceneState, zone: &str) {
    let exploring = state.map.as_ref().is_some_and(|m| !m.revealed.is_empty())
        && state
            .combat
            .combatants
            .iter()
            .filter(|c| rules5e::is_party(c))
            .all(|c| c.position.is_some());
    if exploring {
        let map = state.map.clone().expect("checked above");
        let mut taken: Vec<rules5e::GridPos> = state
            .combat
            .combatants
            .iter()
            .filter(|c| rules5e::is_party(c))
            .filter_map(|c| c.position)
            .collect();
        let enemies: Vec<usize> = (0..state.combat.combatants.len())
            .filter(|&i| !rules5e::is_party(&state.combat.combatants[i]))
            .collect();
        let zone = if map.zone_cells(zone).is_empty() {
            "spawn"
        } else {
            zone
        };
        let spots = map.placements(zone, enemies.len(), &taken);
        for (slot, index) in enemies.into_iter().enumerate() {
            let spot = spots.get(slot).copied();
            state.combat.combatants[index].position = spot;
            taken.extend(spot);
        }
        return;
    }
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
    for (zone, party) in [("party", true), (zone, false)] {
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
    let actor_id = actor.id.clone();
    let event = rules5e::start_turn(actor, round);
    // Speed after conditions (grappled, restrained, slowed …).
    let speed = rules5e::speed_ft(actor);
    state.combat.reactions_used.retain(|id| *id != actor_id);
    state.combat.turn = rules5e::TurnBudget {
        movement_left_ft: if state.map.is_some() { speed } else { 0 },
        action_used: false,
        bonus_action_used: false,
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

/// What the current combatant may still spend on a spell.
fn cast_budget(state: &SceneState) -> rules5e::CastBudget {
    rules5e::CastBudget {
        action: !state.combat.turn.action_used,
        bonus_action: !state.combat.turn.bonus_action_used,
    }
}

/// Casts a spell for the current combatant if it is (still) valid; spends the action or the
/// bonus action it takes.
fn cast(state: &mut SceneState, request_id: &str) -> Vec<CombatEvent> {
    let index = state.combat.current_turn_index;
    let Some(request) = rules5e::CastRequest::parse(request_id) else {
        return Vec::new();
    };
    let caster = state.combat.combatants[index].clone();
    let Ok(spell) = rules5e::check_cast(
        state.map.as_ref(),
        &caster,
        &state.combat.combatants,
        &request,
        cast_budget(state),
    ) else {
        return vec![CombatEvent::Pass {
            actor_id: caster.id,
            actor_name: caster.name,
        }];
    };
    match spell.casting {
        rules5e::CastingTime::Action => state.combat.turn.action_used = true,
        rules5e::CastingTime::Bonus => state.combat.turn.bonus_action_used = true,
    }
    let heroic = heroic_death(state);
    let mut events = rules5e::cast_spell(
        state.map.as_ref(),
        &mut state.combat.combatants,
        index,
        spell,
        &request,
        &mut state.combat.effects,
        heroic,
        &mut rand::rng(),
    );
    events.extend(settle(state));
    events
}

/// Carries out a decision of the current combatant (uses its action; spells may use the
/// bonus action instead).
fn act(state: &mut SceneState, decision: TurnDecision) -> Vec<CombatEvent> {
    if let TurnDecision::Cast(request) = &decision {
        return cast(state, request);
    }
    state.combat.turn.action_used = true;
    let heroic_death = heroic_death(state);
    let index = state.combat.current_turn_index;
    let mut rng = rand::rng();
    match decision {
        TurnDecision::Cast(_) => unreachable!("handled above"),
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
    let events = rules5e::walk(
        &mut state.combat.combatants,
        index,
        &path,
        disengaged,
        &mut state.combat.reactions_used,
        &mut rand::rng(),
    );
    // Doors on the way open as the mover passes (up to where it stopped).
    let end = state.combat.combatants[index].position;
    let walked = end
        .and_then(|e| path.iter().position(|p| *p == e))
        .map_or(0, |i| i + 1);
    if let Some(map) = state.map.as_mut() {
        map.open_doors_on(&path[..walked]);
    }
    events
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
        bonus_action_used: turn.bonus_action_used,
        spells: rules5e::spell_options(state.map.as_ref(), actor, combatants, cast_budget(state)),
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
    if action.starts_with("cast:") {
        let request = rules5e::CastRequest::parse(action)?;
        let caster = &state.combat.combatants[state.combat.current_turn_index];
        return rules5e::check_cast(
            state.map.as_ref(),
            caster,
            &state.combat.combatants,
            &request,
            cast_budget(state),
        )
        .ok()
        .map(|_| PlayerAction::Act(TurnDecision::Cast(action.to_string())));
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
            state.combat.turn.movement_left_ft += rules5e::speed_ft(actor);
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
    // A bonus-action spell leaves the action (and without a board the turn) open.
    let over = !rules5e::is_up(&state.combat.combatants[index])
        || (turn.action_used && (state.map.is_none() || turn.movement_left_ft == 0));
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
            _ if option.id.starts_with("cast:") => describe_cast(&option.id, combatants),
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

fn describe_cast(id: &str, combatants: &[Combatant]) -> String {
    let Some(request) = rules5e::CastRequest::parse(id) else {
        return id.to_string();
    };
    let Some(spell) = rules5e::spell(&request.spell_id) else {
        return id.to_string();
    };
    let slot = if request.slot_level == 0 {
        "cantrip".to_string()
    } else {
        format!("level {} slot", request.slot_level)
    };
    let target = match &request.target {
        rules5e::CastTarget::Creature(target_id) => combatants
            .iter()
            .find(|c| &c.id == target_id)
            .map_or(target_id.clone(), |t| {
                if rules5e::is_enemy(t) {
                    format!(
                        "{} ({})",
                        t.name,
                        tier_text(rules5e::health_tier(t.hp, t.max_hp))
                    )
                } else {
                    format!("{} ({}/{} HP)", t.name, t.hp, t.max_hp)
                }
            }),
        rules5e::CastTarget::Point(p) => format!("the area around square {}:{}", p.x, p.y),
    };
    format!("{id} — cast {} ({slot}) on {target}", spell.name.en)
}

/// Up to three sensible casts as options for the language model.
fn cast_options(state: &SceneState, actor: &Combatant) -> Vec<rules5e::ActionOption> {
    let mut plans = rules5e::spell_plans(
        state.map.as_ref(),
        actor,
        &state.combat.combatants,
        cast_budget(state),
    );
    plans.sort_by_key(|(_, score)| -score);
    plans
        .into_iter()
        .filter(|(_, score)| *score > 0)
        .take(3)
        .map(|(request, _)| rules5e::ActionOption {
            id: request.id(),
            attack_id: None,
            target_id: None,
            disadvantage: false,
        })
        .collect()
}

/// A companion with someone dying in reach of a healing spell casts it without asking.
fn urgent_cast(state: &SceneState, actor: &Combatant) -> Option<String> {
    rules5e::spell_plans(
        state.map.as_ref(),
        actor,
        &state.combat.combatants,
        cast_budget(state),
    )
    .into_iter()
    .filter(|(_, score)| *score >= URGENT_CAST)
    .max_by_key(|(_, score)| *score)
    .map(|(request, _)| request.id())
}

/// Score from which a cast (stabilizing or healing the dying) is done without asking.
const URGENT_CAST: i32 = 45;

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
        } else if let Some(id) = urgent_cast(state, &actor) {
            TurnDecision::Cast(id)
        } else {
            let mut options = rules5e::legal_actions(&actor, &state.combat.combatants);
            options.extend(cast_options(state, &actor));
            companion_choice(state, inference, llm, &options)
                .await
                .and_then(|id| {
                    if id.starts_with("cast:") {
                        options
                            .iter()
                            .any(|o| o.id == id)
                            .then_some(TurnDecision::Cast(id))
                    } else {
                        rules5e::parse_action(&id, &options)
                    }
                })
                .unwrap_or_else(|| {
                    rules5e::hero_fallback_decision(&actor, &state.combat.combatants)
                })
        };
        return act(state, decision);
    };
    let plan = if rules5e::is_enemy(&actor) {
        rules5e::monster_board_plan(&map, &actor, &state.combat.combatants, budget)
    } else if let Some(id) = urgent_cast(state, &actor) {
        rules5e::BoardPlan {
            move_to: None,
            action: TurnDecision::Cast(id),
        }
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
        // Casts happen from where the companion stands.
        for option in cast_options(state, &actor) {
            let action = TurnDecision::Cast(option.id.clone());
            plans.push((
                option,
                rules5e::BoardPlan {
                    move_to: None,
                    action,
                },
            ));
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
            CombatEvent::SpellCast {
                caster_name,
                spell_name,
                ..
            } => Some(format!("{caster_name} casts {}.", spell_name.en)),
            CombatEvent::Save {
                target_name,
                ability,
                success,
                ..
            } => Some(format!(
                "{target_name} {} the {ability:?} saving throw.",
                if *success { "succeeds on" } else { "fails" }
            )),
            CombatEvent::Heal {
                target_name,
                amount,
                ..
            } => Some(format!("{target_name} regains {amount} hit points.")),
            CombatEvent::ConditionStart {
                target_name,
                condition,
                ..
            } => Some(format!(
                "{target_name} is now {}.",
                condition.replace('_', " ")
            )),
            CombatEvent::ConditionEnd {
                target_name,
                condition,
                ..
            } => Some(format!(
                "{target_name} is no longer {}.",
                condition.replace('_', " ")
            )),
            CombatEvent::DeathSave {
                actor_name,
                outcome,
                ..
            } => Some(match outcome {
                DeathSaveOutcome::Ongoing => format!("{actor_name} fights for life."),
                DeathSaveOutcome::Stable => format!("{actor_name} is stable, but unconscious."),
                DeathSaveOutcome::Revived => format!("{actor_name} gets back up!"),
                DeathSaveOutcome::Dead => format!("{actor_name} dies."),
                DeathSaveOutcome::Out => format!("{actor_name} is out of the fight."),
            }),
            CombatEvent::ConcentrationLost { caster_name, .. } => {
                Some(format!("{caster_name} loses concentration on the spell."))
            }
            CombatEvent::Teleport { actor_name, .. } => {
                Some(format!("{actor_name} vanishes and reappears nearby."))
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
    narrate_facts(
        state,
        "[STAGE — COMBAT REPORT]",
        "These things just happened in the fight, in this order; they are final",
        &facts,
        inference,
        llm,
        on_stream,
    )
    .await;
}

/// The game master narrates engine facts (fight or exploration) without changing them.
pub(super) async fn narrate_facts(
    state: &mut SceneState,
    marker: &str,
    intro: &str,
    facts: &str,
    inference: &InferenceClient,
    llm: &StageLlm,
    on_stream: StageStream<'_>,
) {
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
        "{marker}\nYou are the game master of a tabletop fantasy adventure (tone: {tone}). Narrator style: {style}\nRecent story:\n{recent}\n\n{intro}:\n{facts}\n\nNarrate them in {reply_language} in 2 to 5 vivid sentences. Keep every outcome exactly as given: no extra hits, wounds or enemies, nobody acts who is not listed. Do not mention dice, numbers or armor class.",
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
                super::explore5e::refresh_fog(&mut state);
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

    finish_round(engine, inference, state, events, on_stream).await
}

/// Plays monsters and companions until the player is to act (or the fight ends), lets the
/// game master narrate `events` plus what happened, and saves the scene.
pub(super) async fn finish_round(
    engine: &StageEngine,
    inference: &InferenceClient,
    mut state: SceneState,
    mut events: Vec<CombatEvent>,
    on_stream: StageStream<'_>,
) -> Result<SceneState, String> {
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
    if outcome == Some(CombatOutcome::Victory) {
        super::explore5e::won_fight(&mut state);
    }
    if let Some(outcome) = outcome {
        end_encounter(&mut state, Some(outcome));
    }
    if let Some(map) = state.map.as_mut() {
        map.active_encounter = None;
    }
    super::explore5e::refresh_fog(&mut state);
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
            ..Default::default()
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

    fn wolf_fight(classes: &[(&str, &str)]) -> SceneState {
        let mut state = five_e_scene(classes);
        assert!(start_encounter(
            &mut state,
            &[PlanCombatant {
                name: String::new(),
                monster: Some("wolf".into()),
                count: Some(1),
                hp: 0,
                role: "enemy".into(),
            }],
            "en",
        ));
        state
    }

    fn index_of(state: &SceneState, name: &str) -> usize {
        state
            .combat
            .combatants
            .iter()
            .position(|c| c.name == name || c.role == name)
            .unwrap()
    }

    #[test]
    fn a_cleric_companion_brings_a_dying_hero_back() {
        let mut state = wolf_fight(&[("lyra", "cleric")]);
        let player = index_of(&state, "player");
        state.combat.combatants[player].hp = 0;
        rules5e::add_condition(
            &mut state.combat.combatants[player],
            rules5e::UNCONSCIOUS,
            0,
        );
        assert!(rules5e::is_dying(&state.combat.combatants[player]));
        state.combat.current_turn_index = index_of(&state, "Lyra");
        begin_turn(&mut state);
        let lyra = state.combat.combatants[state.combat.current_turn_index].clone();
        let id = urgent_cast(&state, &lyra).expect("healing the dying is urgent");
        assert!(
            id.ends_with(&format!(":{}", state.combat.combatants[player].id)),
            "{id}"
        );
        let events = act(&mut state, TurnDecision::Cast(id));
        assert!(
            events
                .iter()
                .any(|e| matches!(e, CombatEvent::SpellCast { .. }))
        );
        let hero = &state.combat.combatants[player];
        assert!(hero.hp > 0, "{events:?}");
        assert!(!rules5e::has_condition(hero, rules5e::UNCONSCIOUS));
        assert!(report(&events).contains("regains"));
    }

    #[test]
    fn the_player_casts_and_a_bonus_spell_keeps_the_turn_open() {
        let mut state = wolf_fight(&[("player", "cleric")]);
        let player = index_of(&state, "player");
        let wolf = state
            .combat
            .combatants
            .iter()
            .find(|c| c.role == "enemy")
            .unwrap()
            .id
            .clone();
        let player_id = state.combat.combatants[player].id.clone();
        state.combat.current_turn_index = player;
        begin_turn(&mut state);
        let options = combat_options(&state);
        assert!(
            options
                .spells
                .iter()
                .any(|o| o.spell_id == "sacred_flame" && o.targets.contains(&wolf))
        );
        // Healing Word is a bonus action: the action stays.
        state.combat.combatants[player].hp -= 3;
        let action = parse_player_action(&state, &format!("cast:healing_word:1:{player_id}"))
            .expect("valid cast");
        let (_, over) = apply_player_action(&mut state, action);
        assert!(!over && !state.combat.turn.action_used && state.combat.turn.bonus_action_used);
        let slots = state.combat.combatants[player]
            .stats5e
            .as_ref()
            .unwrap()
            .spellcasting
            .as_ref()
            .unwrap()
            .slots_used;
        assert_eq!(slots.first().copied(), Some(1));
        // No second bonus action, but the cantrip still works and ends the turn.
        assert!(parse_player_action(&state, &format!("cast:healing_word:1:{player_id}")).is_none());
        let action =
            parse_player_action(&state, &format!("cast:sacred_flame:0:{wolf}")).expect("cantrip");
        let (events, over) = apply_player_action(&mut state, action);
        assert!(over);
        assert!(events.iter().any(|e| matches!(e, CombatEvent::Save { .. })));
        assert!(parse_player_action(&state, "cast:fireball:3:x").is_none());
    }

    #[test]
    fn rests_restore_hit_points_and_slots() {
        let mut state = five_e_scene(&[("lyra", "cleric")]);
        let lyra = index_of(&state, "Lyra");
        let player = index_of(&state, "player");
        {
            let c = &mut state.combat.combatants[lyra];
            c.hp = 1;
            c.stats5e
                .as_mut()
                .unwrap()
                .spellcasting
                .as_mut()
                .unwrap()
                .slots_used[0] = 2;
        }
        rest_party(&mut state, false);
        let c = &state.combat.combatants[lyra];
        let stats = c.stats5e.as_ref().unwrap();
        // A level-1 hero has one hit die: spent, and some hit points back; slots stay used.
        assert!(c.hp > 1 && stats.hit_dice_left == 0);
        assert_eq!(stats.spellcasting.as_ref().unwrap().slots_used[0], 2);
        state.combat.combatants[player].hp = 0;
        rules5e::add_condition(
            &mut state.combat.combatants[player],
            rules5e::UNCONSCIOUS,
            0,
        );
        let lines = rest_party(&mut state, true);
        assert_eq!(lines.len(), 3);
        for c in state
            .combat
            .combatants
            .iter()
            .filter(|c| rules5e::is_party(c))
        {
            assert_eq!(c.hp, c.max_hp, "{}", c.name);
            assert!(c.conditions.is_empty());
        }
        let stats = state.combat.combatants[lyra].stats5e.as_ref().unwrap();
        assert_eq!(stats.spellcasting.as_ref().unwrap().slots_used, [0; 9]);
        assert_eq!(stats.hit_dice_left, 1);
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
            ..Default::default()
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
