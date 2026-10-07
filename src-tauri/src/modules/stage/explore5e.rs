//! Exploring the map of a 5e scene between fights (`Roadmap_DND.md`, step 4): the party walks
//! as a group behind the player, sees by its light (fog of war), opens doors and chests,
//! picks or forces locks with skill checks, finds or springs traps, enters rooms whose
//! prepared encounter then starts, and leaves through exits to other maps. The engine
//! resolves everything; the game master narrates what is new.

use super::rules5e::{self, ExploreEvent, GridPos};
use super::*;

/// Exploration events kept in the scene (log in the UI).
const MAX_EVENTS: usize = 60;

/// The scene's map is explored (fog of war on), outside fights.
pub fn exploring(state: &SceneState) -> bool {
    state.definition.is_5e()
        && !state.combat.is_active
        && state.map.as_ref().is_some_and(|m| !m.revealed.is_empty())
}

fn party_indices(state: &SceneState) -> Vec<usize> {
    (0..state.combat.combatants.len())
        .filter(|&i| rules5e::is_party(&state.combat.combatants[i]))
        .collect()
}

/// Who leads the walk: the player, or the first party member still standing.
fn leader_index(state: &SceneState) -> Option<usize> {
    let party = party_indices(state);
    party
        .iter()
        .copied()
        .find(|&i| {
            state.combat.combatants[i].role == "player"
                && rules5e::is_up(&state.combat.combatants[i])
        })
        .or_else(|| {
            party
                .into_iter()
                .find(|&i| rules5e::is_up(&state.combat.combatants[i]))
        })
}

fn party_positions(state: &SceneState) -> Vec<GridPos> {
    party_indices(state)
        .into_iter()
        .filter_map(|i| state.combat.combatants[i].position)
        .collect()
}

/// Reveals what the party sees now and notices traps; returns the finds.
fn look_around(state: &mut SceneState) -> Vec<ExploreEvent> {
    let viewers: Vec<(GridPos, i32, String)> = party_indices(state)
        .into_iter()
        .map(|i| &state.combat.combatants[i])
        .filter(|c| rules5e::is_up(c))
        .filter_map(|c| {
            let passive = c.stats5e.as_ref().map_or(10, |s| s.passive_perception());
            c.position.map(|p| (p, passive, c.name.clone()))
        })
        .collect();
    let Some(map) = state.map.as_mut() else {
        return Vec::new();
    };
    let positions: Vec<GridPos> = viewers.iter().map(|(p, _, _)| *p).collect();
    rules5e::reveal(map, &positions);
    rules5e::spot_traps(map, &viewers)
        .into_iter()
        .map(|(at, by_name)| ExploreEvent::TrapSpotted { at, by_name })
        .collect()
}

/// After fight moves: the fog lifts where the party now stands.
pub fn refresh_fog(state: &mut SceneState) {
    if state.map.as_ref().is_some_and(|m| !m.revealed.is_empty()) {
        look_around(state);
    }
}

/// Places party members without a square around the leader (or on the start zone).
fn gather_party(state: &mut SceneState) {
    let Some(map) = state.map.clone() else { return };
    let party = party_indices(state);
    let leader = leader_index(state).unwrap_or(party[0]);
    if state.combat.combatants[leader]
        .position
        .is_none_or(|p| !map.walkable(p))
    {
        let start = map.placements("party", 1, &[]);
        state.combat.combatants[leader].position = start.first().copied();
    }
    let Some(lead) = state.combat.combatants[leader].position else {
        return;
    };
    let others: Vec<usize> = party.into_iter().filter(|&i| i != leader).collect();
    let spots = rules5e::follow_squares(&map, lead, others.len());
    for (slot, index) in others.into_iter().enumerate() {
        state.combat.combatants[index].position = spots.get(slot).copied().or(Some(lead));
    }
}

/// Starts exploring the scene's map when it has one (5e, no fight): fog on, the party on its
/// start zone. Returns whether the scene is now being explored.
pub fn ensure_exploring(state: &mut SceneState) -> bool {
    if !state.definition.is_5e() || state.combat.is_active {
        return false;
    }
    let map_id = state
        .definition
        .rules
        .as_ref()
        .and_then(|r| r.map_id.clone());
    if state.map.is_none() {
        let Some(map) = map_id.as_deref().and_then(rules5e::battle_map) else {
            return false;
        };
        state.map = Some(map.clone());
        for c in &mut state.combat.combatants {
            c.position = None;
        }
    }
    ensure_party_vitals(state);
    let fresh = state.map.as_ref().is_some_and(|m| m.revealed.is_empty());
    if let Some(map) = state.map.as_mut() {
        rules5e::start_exploring(map);
    }
    if fresh || party_positions(state).len() < party_indices(state).len() {
        gather_party(state);
    }
    look_around(state);
    if fresh && let Some(event) = enter_room(state) {
        push_events(state, vec![event]);
    }
    true
}

fn push_events(state: &mut SceneState, events: Vec<ExploreEvent>) {
    state.exploration.extend(events);
    let overflow = state.exploration.len().saturating_sub(MAX_EVENTS);
    state.exploration.drain(..overflow);
}

/// The room the leader stands in, the first time the party comes there.
fn enter_room(state: &mut SceneState) -> Option<ExploreEvent> {
    let leader = state.combat.combatants[leader_index(state)?].position?;
    let map = state.map.as_mut()?;
    let room = rules5e::room_at(map, leader)?.clone();
    let key = format!("room:{}", room.id);
    if map.triggered.contains(&key) {
        return None;
    }
    map.triggered.push(key);
    Some(ExploreEvent::Room {
        room_id: room.id,
        name: room.name,
        description: room.description,
    })
}

/// What stopped a walk early.
enum Stop {
    Trap,
    Encounter(rules5e::MapEncounter),
    Exit(String),
}

/// Walks the leader along `path` square by square; the others follow. Stops on a sprung
/// trap, in the room of a prepared encounter, or on an exit.
fn walk(state: &mut SceneState, path: &[GridPos]) -> (Vec<ExploreEvent>, Option<Stop>) {
    let mut events = Vec::new();
    let Some(leader) = leader_index(state) else {
        return (events, None);
    };
    let mut feet = 0;
    let mut stop = None;
    for &step in path {
        state.combat.combatants[leader].position = Some(step);
        feet += rules5e::SQUARE_FT;
        let map = state.map.as_mut().expect("exploring has a map");
        for at in map.open_doors_on(&[step]) {
            events.push(ExploreEvent::Door { at, opened: true });
        }
        rules5e::reveal(map, &[step]);
        if let Some(trap) = rules5e::hidden_trap_at(map, step) {
            map.traps[trap].sprung = true;
            let trap = map.traps[trap].clone();
            rules5e::set_object(map, step, "trap_plate");
            events.push(spring_trap(state, leader, &trap));
            stop = Some(Stop::Trap);
            break;
        }
        let map = state.map.as_ref().expect("exploring has a map");
        if let Some(exit) = rules5e::exit_at(map, step) {
            stop = Some(Stop::Exit(exit.to.clone()));
            break;
        }
        if let Some(encounter) = rules5e::pending_encounter(map, &[step]) {
            stop = Some(Stop::Encounter(encounter));
            break;
        }
    }
    if feet > 0 {
        let actor = &state.combat.combatants[leader];
        events.insert(
            0,
            ExploreEvent::Move {
                actor_name: actor.name.clone(),
                feet,
            },
        );
        gather_party(state);
        events.extend(look_around(state));
        events.extend(enter_room(state));
    }
    (events, stop)
}

/// A hidden trap springs under a party member: Dexterity save, half damage on a success.
fn spring_trap(state: &mut SceneState, index: usize, trap: &rules5e::MapTrap) -> ExploreEvent {
    let mut rng = rand::rng();
    let heroic_death = state
        .definition
        .rules
        .as_ref()
        .is_some_and(|r| r.heroic_death);
    let target = &mut state.combat.combatants[index];
    let save = rules5e::saving_throw(target, rules5e::Ability::Dex, trap.save_dc, &mut rng);
    let success = matches!(save, rules5e::CombatEvent::Save { success: true, .. });
    let formula = rules5e::DiceFormula::parse(&trap.damage).unwrap_or(rules5e::DiceFormula {
        count: 1,
        sides: 6,
        modifier: 0,
    });
    let mut roll = rules5e::roll_damage(&mut rng, &formula, false);
    if success {
        roll.total /= 2;
    }
    let before = target.hp;
    let scaling = rules5e::damage_scaling(target, &trap.damage_type);
    rules5e::apply_damage(
        target,
        roll,
        &trap.damage_type,
        scaling,
        &rules5e::DamageContext {
            critical: false,
            heroic_death,
        },
        &mut rng,
    );
    ExploreEvent::Trap {
        at: trap.at,
        target_name: target.name.clone(),
        saved: success,
        damage: before - target.hp,
        down: target.hp <= 0,
    }
}

/// A skill check of the party member best at it (picking or forcing a lock).
fn party_check(state: &SceneState, skill: &str, dc: i32) -> ExploreEvent {
    let mut rng = rand::rng();
    let best = party_indices(state)
        .into_iter()
        .map(|i| &state.combat.combatants[i])
        .filter(|c| rules5e::is_up(c))
        .filter_map(|c| {
            let bonus = c
                .stats5e
                .as_ref()
                .and_then(|s| rules5e::check_bonus(s, skill))?;
            Some((c, bonus))
        })
        .max_by_key(|(_, bonus)| *bonus);
    let (name, bonus) = best.map_or(("?".to_string(), 0), |(c, b)| (c.name.clone(), b));
    let roll = rules5e::roll_d20(&mut rng, rules5e::RollMode::Normal);
    let total = roll.natural as i32 + bonus;
    ExploreEvent::Check {
        actor_name: name,
        skill: skill.to_string(),
        roll,
        bonus,
        total,
        dc,
        success: total >= dc,
    }
}

/// The player's exploration input.
enum ExploreAction {
    Move(GridPos),
    Use(GridPos),
    Pick(GridPos),
    Force(GridPos),
}

fn parse_action(action: &str) -> Option<ExploreAction> {
    let (kind, rest) = action.trim().split_once(':')?;
    let (x, y) = rest.split_once(':')?;
    let pos = GridPos::new(x.parse().ok()?, y.parse().ok()?);
    Some(match kind {
        "move" => ExploreAction::Move(pos),
        "use" => ExploreAction::Use(pos),
        "pick" => ExploreAction::Pick(pos),
        "force" => ExploreAction::Force(pos),
        _ => return None,
    })
}

/// Carries out one action. `Ok(None)` = nothing happened (unreachable, nothing there).
fn apply(
    state: &mut SceneState,
    action: ExploreAction,
) -> Option<(Vec<ExploreEvent>, Option<Stop>)> {
    let leader = leader_index(state)?;
    let from = state.combat.combatants[leader].position?;
    let others: Vec<GridPos> = party_positions(state)
        .into_iter()
        .filter(|p| *p != from)
        .collect();
    let map = state.map.clone()?;
    match action {
        ExploreAction::Move(target) => {
            if !rules5e::is_revealed(&map, target) {
                return None;
            }
            let path = rules5e::explore_path(&map, from, target, &others)?;
            if path.is_empty() {
                return None;
            }
            Some(walk(state, &path))
        }
        ExploreAction::Use(target) | ExploreAction::Pick(target) | ExploreAction::Force(target) => {
            if !rules5e::is_revealed(&map, target) {
                return None;
            }
            let interaction = rules5e::interaction_at(&map, target)?;
            let path = rules5e::approach_object(&map, from, target, &others)?;
            let (mut events, stop) = walk(state, &path);
            if stop.is_some() {
                return Some((events, stop));
            }
            let map = state.map.as_mut().expect("exploring has a map");
            match (interaction, &action) {
                (rules5e::Interaction::OpenDoor, _) => {
                    rules5e::set_object(map, target, "door_open");
                    events.push(ExploreEvent::Door {
                        at: target,
                        opened: true,
                    });
                }
                (rules5e::Interaction::CloseDoor, _) => {
                    if others.contains(&target) {
                        return None;
                    }
                    rules5e::set_object(map, target, "door_closed");
                    events.push(ExploreEvent::Door {
                        at: target,
                        opened: false,
                    });
                }
                (rules5e::Interaction::OpenChest, _) => {
                    rules5e::set_object(map, target, "chest_open");
                    events.push(ExploreEvent::Chest { at: target });
                    events.extend(take_chest_loot(state, target));
                }
                (
                    rules5e::Interaction::LockedDoor | rules5e::Interaction::LockedChest,
                    ExploreAction::Use(_),
                ) => {
                    for lock in map.locks.iter_mut().filter(|l| l.at == target) {
                        lock.known = true;
                    }
                    if map.cell(target).and_then(|c| c.object.as_deref()) == Some("door_closed") {
                        rules5e::set_object(map, target, "door_locked");
                    }
                    events.push(ExploreEvent::Locked { at: target });
                }
                (locked, _) => {
                    let dc = rules5e::lock_dc(map, target).unwrap_or(15);
                    let skill = if matches!(action, ExploreAction::Pick(_)) {
                        "sleight_of_hand"
                    } else {
                        "athletics"
                    };
                    let check = party_check(state, skill, dc);
                    let success = matches!(check, ExploreEvent::Check { success: true, .. });
                    events.push(check);
                    if success {
                        let map = state.map.as_mut().expect("exploring has a map");
                        rules5e::unlock(map, target);
                        if locked == rules5e::Interaction::LockedChest {
                            rules5e::set_object(map, target, "chest_open");
                            events.push(ExploreEvent::Chest { at: target });
                            events.extend(take_chest_loot(state, target));
                        } else {
                            rules5e::set_object(map, target, "door_open");
                            events.push(ExploreEvent::Door {
                                at: target,
                                opened: true,
                            });
                        }
                    }
                }
            }
            events.extend(look_around(state));
            Some((events, None))
        }
    }
}

/// Checks off the act's goals of `kind` reaching `target` (an encounter won, a map reached);
/// once all are reached, the act is complete.
pub fn reach_goal(state: &mut SceneState, kind: &str, target: &str) -> Vec<ExploreEvent> {
    let goals = state
        .definition
        .rules
        .as_ref()
        .map(|r| r.goals.clone())
        .unwrap_or_default();
    let mut events = Vec::new();
    for goal in goals
        .iter()
        .filter(|g| g.kind == kind && g.target == target)
    {
        if let Some(objective) = state
            .objectives
            .iter_mut()
            .find(|o| o.id == goal.id && o.status != "completed")
        {
            objective.current = objective.max;
            objective.status = "completed".to_string();
            events.push(ExploreEvent::Goal {
                goal_id: goal.id.clone(),
                title: goal.title.clone(),
            });
        }
    }
    let all_done = !goals.is_empty()
        && goals.iter().all(|g| {
            state
                .objectives
                .iter()
                .any(|o| o.id == g.id && o.status == "completed")
        });
    if !events.is_empty() && all_done {
        events.push(ExploreEvent::ActComplete {
            next_scene: state
                .definition
                .rules
                .as_ref()
                .and_then(|r| r.next_scene.clone()),
        });
    }
    events
}

/// A won fight: the prepared encounter it came from counts for the act's goals.
pub fn won_fight(state: &mut SceneState) {
    let Some(id) = state.map.as_mut().and_then(|m| m.active_encounter.take()) else {
        return;
    };
    let mut events = reach_goal(state, "encounter", &id);
    let loot = state
        .map
        .as_ref()
        .and_then(|m| m.encounters.iter().find(|e| e.id == id))
        .map(|e| e.loot.clone())
        .unwrap_or_default();
    if !loot.is_empty() {
        let items = add_items(state, &loot, &reply_code());
        events.insert(0, ExploreEvent::Loot { items });
    }
    push_events(state, events);
}

fn reply_code() -> String {
    crate::modules::content_lang::language_code(
        &crate::modules::content_lang::ContentLang::reply_language_name(),
    )
}

/// Parses `id` or `id*count` into an SRD item and a count.
fn loot_entry(entry: &str) -> Option<(&'static rules5e::ItemData, u32)> {
    let (id, count) = match entry.split_once('*') {
        Some((id, count)) => (id.trim(), count.trim().parse().ok()?),
        None => (entry.trim(), 1),
    };
    rules5e::item(id).map(|item| (item, count))
}

/// Puts SRD items into the party inventory (same items stack); returns what was added.
pub fn add_items(
    state: &mut SceneState,
    entries: &[String],
    language_code: &str,
) -> Vec<rules5e::LootItem> {
    let mut added = Vec::new();
    for (data, count) in entries.iter().filter_map(|e| loot_entry(e)) {
        if let Some(existing) = state
            .inventory
            .iter_mut()
            .find(|i| i.srd_id.as_deref() == Some(data.id.as_str()))
        {
            existing.quantity = existing.quantity.saturating_add(count);
        } else {
            let heal = data
                .heal
                .as_deref()
                .and_then(rules5e::DiceFormula::parse)
                .map_or(0, |f| f.average());
            state.inventory.push(InventoryItem {
                id: format!("item_{}_{}", data.id, Utc::now().timestamp_micros()),
                name: data.name.get(language_code).to_string(),
                description: String::new(),
                quantity: count,
                item_type: match data.kind {
                    rules5e::ItemKind::Potion => "consumable",
                    rules5e::ItemKind::Treasure => "treasure",
                    _ => "equipment",
                }
                .to_string(),
                hp_restore: heal,
                stress_restore: 0,
                clears_condition: None,
                srd_id: Some(data.id.clone()),
            });
        }
        added.push(rules5e::LootItem {
            srd_id: data.id.clone(),
            name: data.name.clone(),
            quantity: count,
        });
    }
    added
}

/// What lies in the chest at `at` goes to the party (once).
fn take_chest_loot(state: &mut SceneState, at: GridPos) -> Option<ExploreEvent> {
    let map = state.map.as_mut()?;
    let index = map.loot.iter().position(|l| l.at == at)?;
    let entries = map.loot.remove(index).items;
    let items = add_items(state, &entries, &reply_code());
    (!items.is_empty()).then_some(ExploreEvent::Loot { items })
}

/// Why equipping failed, as a translatable error.
fn equip_error(problem: rules5e::EquipProblem) -> String {
    match problem {
        rules5e::EquipProblem::NotProficient => crate::err!("backend.stage.notProficient"),
        rules5e::EquipProblem::Unknown | rules5e::EquipProblem::NotWearable => {
            crate::err!("backend.stage.cannotEquip")
        }
    }
}

/// A party member puts on gear from the inventory; what comes off goes back into it.
pub fn equip_item(
    state: &mut SceneState,
    member_id: &str,
    inventory_id: &str,
) -> Result<(), String> {
    if state.combat.is_active {
        return Err(crate::err!("backend.stage.inCombat"));
    }
    let position = state
        .inventory
        .iter()
        .position(|i| i.id == inventory_id)
        .ok_or_else(|| crate::err!("backend.stage.itemMissing"))?;
    let srd_id = state.inventory[position]
        .srd_id
        .clone()
        .ok_or_else(|| crate::err!("backend.stage.cannotEquip"))?;
    let hero = state
        .combat
        .combatants
        .iter_mut()
        .find(|c| c.id == member_id && rules5e::is_party(c))
        .ok_or_else(|| crate::err!("backend.stage.cannotEquip"))?;
    let stats = hero
        .stats5e
        .as_mut()
        .ok_or_else(|| crate::err!("backend.stage.cannotEquip"))?;
    let removed = rules5e::equip(stats, &srd_id).map_err(equip_error)?;
    let item = &mut state.inventory[position];
    item.quantity = item.quantity.saturating_sub(1);
    if item.quantity == 0 {
        state.inventory.remove(position);
    }
    add_items(state, &removed, &reply_code());
    Ok(())
}

/// A party member takes gear off; it goes into the inventory.
pub fn unequip_item(state: &mut SceneState, member_id: &str, srd_id: &str) -> Result<(), String> {
    if state.combat.is_active {
        return Err(crate::err!("backend.stage.inCombat"));
    }
    let hero = state
        .combat
        .combatants
        .iter_mut()
        .find(|c| c.id == member_id && rules5e::is_party(c))
        .and_then(|c| c.stats5e.as_mut())
        .ok_or_else(|| crate::err!("backend.stage.cannotEquip"))?;
    if !rules5e::unequip(hero, srd_id) {
        return Err(crate::err!("backend.stage.itemMissing"));
    }
    add_items(state, &[srd_id.to_string()], &reply_code());
    Ok(())
}

/// Goes on with the next act: the party (classes, hit points after a long rest, spells),
/// the chosen companions and the inventory come along; the act starts fresh otherwise.
pub fn continue_adventure(engine: &StageEngine, scene_id: &str) -> Result<SceneState, String> {
    let mut current = engine.get_state();
    if current.definition.id != scene_id {
        current = load_scene_by_id(scene_id)?;
    }
    let next_id = current
        .definition
        .rules
        .as_ref()
        .and_then(|r| r.next_scene.clone())
        .ok_or_else(|| crate::err!("backend.stage.noNextAct"))?;
    let mut next = load_scene_by_id(&next_id)?;
    next.definition.party = current.definition.party.clone();
    next.definition.persona = current.definition.persona.clone();
    if let (Some(from), Some(to)) = (
        current.definition.rules.as_ref(),
        next.definition.rules.as_mut(),
    ) {
        to.hero_classes = from.hero_classes.clone();
        to.control_companions = from.control_companions;
        to.heroic_death = from.heroic_death;
    }
    next.combat = EncounterState::default();
    next.combat.combatants = current
        .combat
        .combatants
        .iter()
        .filter(|c| rules5e::is_party(c))
        .cloned()
        .map(|mut c| {
            c.position = None;
            c
        })
        .collect();
    next.inventory = current.inventory.clone();
    next.map = None;
    next.exploration = Vec::new();
    ensure_party_vitals(&mut next);
    // Milestone: every finished act brings the party one level further (up to level 3).
    let mut reached = 0;
    for hero in next
        .combat
        .combatants
        .iter_mut()
        .filter(|c| rules5e::is_party(c))
    {
        let level = hero.stats5e.as_ref().map_or(1, |s| s.level) + 1;
        if rules5e::level_up(hero, level) {
            reached = reached.max(level.min(rules5e::MAX_LEVEL));
        }
    }
    if reached > 0 {
        next.exploration
            .push(ExploreEvent::LevelUp { level: reached });
    }
    super::combat5e::rest_party(&mut next, true);
    next.definition.last_played = Some(Utc::now().to_rfc3339());
    engine.set_state(next.clone());
    save_scene_state(&next)?;
    Ok(next)
}

/// Moves the party to another map: its start zone, fog fresh.
pub fn change_map(state: &mut SceneState, map_id: &str) -> Option<ExploreEvent> {
    let map = rules5e::battle_map(map_id)?.clone();
    let name = map.name.clone();
    state.map = Some(map);
    for index in party_indices(state) {
        state.combat.combatants[index].position = None;
    }
    if let Some(map) = state.map.as_mut() {
        rules5e::start_exploring(map);
    }
    gather_party(state);
    look_around(state);
    Some(ExploreEvent::MapChange {
        map_id: map_id.to_string(),
        name,
    })
}

/// The prepared encounter of a room starts: its monsters on its zone.
fn start_prepared(
    state: &mut SceneState,
    encounter: &rules5e::MapEncounter,
    language_code: &str,
) -> bool {
    if let Some(map) = state.map.as_mut() {
        map.triggered.push(encounter.id.clone());
        map.active_encounter = Some(encounter.id.clone());
    }
    let enemies: Vec<PlanCombatant> = encounter
        .monsters
        .iter()
        .map(|m| PlanCombatant {
            name: String::new(),
            monster: Some(m.monster.clone()),
            count: Some(m.count),
            hp: 0,
            role: "enemy".into(),
        })
        .collect();
    super::combat5e::start_encounter_at(state, &enemies, language_code, &encounter.zone, false)
}

/// Facts for the game master: rooms entered (with their description), doors, locks, traps,
/// enemies and travel. Plain walking and doors alone need no narration.
fn report(events: &[ExploreEvent], state: &SceneState) -> String {
    let worth_telling = events.iter().any(|e| {
        !matches!(
            e,
            ExploreEvent::Move { .. } | ExploreEvent::Door { .. } | ExploreEvent::Locked { .. }
        )
    });
    if !worth_telling {
        return String::new();
    }
    events
        .iter()
        .map(|event| match event {
            ExploreEvent::Move { actor_name, feet } => {
                format!("{actor_name} leads the party {feet} feet on.")
            }
            ExploreEvent::Room {
                name, description, ..
            } => format!("The party enters {}: {description}", name.en),
            ExploreEvent::Door { opened, .. } => if *opened {
                "A door opens."
            } else {
                "A door is closed."
            }
            .to_string(),
            ExploreEvent::Chest { .. } => "A chest is opened.".to_string(),
            ExploreEvent::Locked { .. } => "It is locked.".to_string(),
            ExploreEvent::Check {
                actor_name,
                skill,
                success,
                ..
            } => format!(
                "{actor_name} tries {}: {}.",
                if skill == "athletics" {
                    "to force the lock"
                } else {
                    "to pick the lock"
                },
                if *success { "success" } else { "failure" }
            ),
            ExploreEvent::TrapSpotted { by_name, .. } => {
                format!("{by_name} notices a hidden pressure plate trap.")
            }
            ExploreEvent::Trap {
                target_name,
                saved,
                damage,
                down,
                ..
            } => format!(
                "{target_name} steps on a hidden trap, {} and takes {damage} damage{}.",
                if *saved { "partly dodges" } else { "is caught" },
                if *down { " and goes down" } else { "" }
            ),
            ExploreEvent::Encounter { .. } => {
                let foes: Vec<String> = state
                    .combat
                    .combatants
                    .iter()
                    .filter(|c| rules5e::is_enemy(c))
                    .map(|c| c.name.clone())
                    .collect();
                format!("Enemies appear and a fight begins: {}.", foes.join(", "))
            }
            ExploreEvent::Goal { title, .. } => format!("The party reaches a goal: {}.", title.en),
            ExploreEvent::Loot { items } => format!(
                "The party finds: {}.",
                items
                    .iter()
                    .map(|i| format!("{}× {}", i.quantity, i.name.en))
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            ExploreEvent::LevelUp { level } => {
                format!("The party has grown stronger: level {level}.")
            }
            ExploreEvent::ActComplete { .. } => {
                "This chapter of the adventure is complete; close it with a fitting image."
                    .to_string()
            }
            ExploreEvent::MapChange { name, .. } => {
                format!("The party travels on and arrives at {}.", name.en)
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// The map part of the planner's rules: where the party is, the rooms (with the party's
/// knowledge), prepared encounters, zones and maps to choose from. Empty without a map.
pub fn planner_map_rule(state: &SceneState) -> String {
    let Some(map) = state.map.as_ref() else {
        return String::new();
    };
    let here = leader_index(state)
        .and_then(|i| state.combat.combatants[i].position)
        .and_then(|p| rules5e::room_at(map, p))
        .map_or("between rooms".to_string(), |r| r.name.en.clone());
    let rooms = map
        .rooms
        .iter()
        .map(|room| {
            let seen =
                map.triggered.contains(&format!("room:{}", room.id)) || map.revealed.is_empty();
            format!(
                "  * {} ({}): {}",
                room.name.en,
                if seen {
                    "explored"
                } else {
                    "not yet seen by the party – keep it secret"
                },
                room.description
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let encounters = map
        .encounters
        .iter()
        .filter(|e| !map.triggered.contains(&e.id))
        .map(|e| {
            let foes = e
                .monsters
                .iter()
                .map(|m| format!("{}×{}", m.count, m.monster))
                .collect::<Vec<_>>()
                .join(", ");
            format!("{} (room {}, {foes})", e.id, e.room)
        })
        .collect::<Vec<_>>();
    let mut zones: Vec<String> = map
        .cells
        .iter()
        .filter_map(|c| c.zone.clone())
        .filter(|z| z != "party" && !z.starts_with("exit"))
        .collect();
    zones.sort();
    zones.dedup();
    let maps = rules5e::battle_maps()
        .iter()
        .filter(|m| m.id != map.id)
        .map(|m| m.id.clone())
        .collect::<Vec<_>>()
        .join(", ");
    format!(
        "\n- Map \"{name}\" (the engine moves the party; the player explores by clicking it). The party is in: {here}. Rooms:\n{rooms}\n- Prepared encounters not yet met: {encounters}. They start by themselves when the party enters their room; to start one earlier use {{\"action\":\"start\", \"encounter\":\"<id>\"}}. Other enemies need \"zone\" from: {zones}.\n- map_change: only when the party really travels to another place outside a fight, one of: {maps}; otherwise leave it out.",
        name = map.name.en,
        encounters = if encounters.is_empty() {
            "none".to_string()
        } else {
            encounters.join("; ")
        },
        zones = zones.join(", "),
    )
}

/// The planner's choices on the map: a prepared encounter or enemies on a listed zone, and
/// travel to a listed map. Returns whether a fight started.
pub fn apply_planner_map(
    state: &mut SceneState,
    encounter: Option<&PlanEncounterUpdate>,
    map_change: Option<&str>,
    language_code: &str,
) -> Option<bool> {
    if let Some(to) = map_change
        && !state.combat.is_active
        && state.map.as_ref().is_some_and(|m| m.id != to)
        && let Some(event) = change_map(state, to)
    {
        push_events(state, vec![event]);
    }
    let encounter = encounter.filter(|e| e.action == "start" && !state.combat.is_active)?;
    let map = state.map.as_ref()?;
    if let Some(prepared) = encounter
        .encounter
        .as_deref()
        .and_then(|id| {
            map.encounters
                .iter()
                .find(|e| e.id == id && !map.triggered.contains(&e.id))
        })
        .cloned()
    {
        let started = start_prepared(state, &prepared, language_code);
        if started {
            push_events(
                state,
                vec![ExploreEvent::Encounter {
                    encounter_id: prepared.id,
                }],
            );
        }
        return Some(started);
    }
    let zone = encounter
        .zone
        .as_deref()
        .filter(|z| !z.starts_with("exit") && *z != "party" && !map.zone_cells(z).is_empty())
        .unwrap_or("spawn")
        .to_string();
    Some(super::combat5e::start_encounter_at(
        state,
        &encounter.enemies,
        language_code,
        &zone,
        true,
    ))
}

/// Runs one exploration action of the player (`move:x:y`, `use:x:y`, `pick:x:y`,
/// `force:x:y`) or, without one, starts exploring. Undo restores the state before it.
pub async fn execute_exploration(
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
    if state.combat.is_active {
        return Err(crate::err!("backend.stage.inCombat"));
    }
    let Some(action) = action else {
        if !exploring(&state) {
            if !ensure_exploring(&mut state) {
                return Err(crate::err!("backend.stage.noMap"));
            }
            engine.set_state(state.clone());
            save_scene_state(&state)?;
        }
        return Ok(state);
    };
    if !ensure_exploring(&mut state) {
        return Err(crate::err!("backend.stage.noMap"));
    }
    let action = parse_action(&action).ok_or_else(|| crate::err!("backend.stage.invalidAction"))?;
    let before = state.clone();
    let (mut events, stop) =
        apply(&mut state, action).ok_or_else(|| crate::err!("backend.stage.invalidAction"))?;
    engine.push_snapshot(&state.definition.id, before);

    let reply_language = crate::modules::content_lang::ContentLang::reply_language_name();
    let lang_code = crate::modules::content_lang::language_code(&reply_language);
    let mut fight = false;
    match stop {
        Some(Stop::Exit(to)) => {
            events.extend(change_map(&mut state, &to));
            events.extend(reach_goal(&mut state, "exit", &to));
        }
        Some(Stop::Encounter(encounter)) => {
            if start_prepared(&mut state, &encounter, &lang_code) {
                events.push(ExploreEvent::Encounter {
                    encounter_id: encounter.id.clone(),
                });
                fight = true;
            }
        }
        Some(Stop::Trap) | None => {}
    }
    let facts = report(&events, &state);
    push_events(&mut state, events);
    let llm = StageLlm::from_settings();
    super::combat5e::narrate_facts(
        &mut state,
        "[STAGE — EXPLORATION REPORT]",
        "The party explores; these things just happened, in this order, and are final",
        &facts,
        inference,
        &llm,
        on_stream,
    )
    .await;
    if fight {
        // Monsters that win the initiative act right away, then the player.
        return super::combat5e::finish_round(engine, inference, state, Vec::new(), on_stream)
            .await;
    }
    state.definition.last_played = Some(Utc::now().to_rfc3339());
    engine.set_state(state.clone());
    save_scene_state(&state)?;
    Ok(state)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn crypt() -> SceneState {
        let mut state = StageEngine::new().get_state();
        state.definition.party = vec!["Lyra".into()];
        state.definition.rules = Some(SceneRules {
            ruleset: "5e".into(),
            hero_classes: HashMap::from([("Lyra".to_string(), "rogue".to_string())]),
            control_companions: false,
            heroic_death: false,
            map_id: Some("crypt_hall".into()),
            ..Default::default()
        });
        state.combat.combatants.retain(|c| c.role == "player");
        assert!(ensure_exploring(&mut state));
        state
    }

    fn seen(state: &SceneState, x: i32, y: i32) -> bool {
        rules5e::is_revealed(state.map.as_ref().unwrap(), GridPos::new(x, y))
    }

    fn leader(state: &SceneState) -> GridPos {
        state.combat.combatants[leader_index(state).unwrap()]
            .position
            .unwrap()
    }

    #[test]
    fn the_party_starts_in_the_antechamber_and_sees_only_it() {
        let state = crypt();
        assert!(exploring(&state));
        let positions = party_positions(&state);
        assert_eq!(positions.len(), 2);
        let map = state.map.as_ref().unwrap();
        assert!(
            positions
                .iter()
                .all(|p| rules5e::room_at(map, *p).is_some_and(|r| r.id == "antechamber"))
        );
        // The antechamber and its walls, but nothing behind the closed doors.
        assert!(seen(&state, 7, 4) && seen(&state, 8, 1) && seen(&state, 8, 2));
        assert!(!seen(&state, 10, 2) && !seen(&state, 4, 7));
        assert!(
            matches!(state.exploration.last(), Some(ExploreEvent::Room { room_id, .. }) if room_id == "antechamber")
        );
    }

    #[test]
    fn walking_through_a_door_opens_it_and_starts_the_hall_encounter() {
        let mut state = crypt();
        let (events, stop) = apply(&mut state, ExploreAction::Move(GridPos::new(7, 2))).unwrap();
        assert!(stop.is_none() && matches!(events[0], ExploreEvent::Move { .. }));
        // The door square is seen, the hall behind it not yet: open it.
        let (events, _) = apply(&mut state, ExploreAction::Use(GridPos::new(8, 2))).unwrap();
        assert!(
            events
                .iter()
                .any(|e| matches!(e, ExploreEvent::Door { opened: true, .. }))
        );
        assert!(seen(&state, 12, 2), "the hall shows through the open door");
        let (events, stop) = apply(&mut state, ExploreAction::Move(GridPos::new(10, 2))).unwrap();
        let Some(Stop::Encounter(encounter)) = stop else {
            panic!("{events:?}")
        };
        assert_eq!(encounter.id, "hall_goblins");
        assert_eq!(
            leader(&state),
            GridPos::new(9, 2),
            "stops on the first square of the room"
        );
        let mut party_before = party_positions(&state);
        party_before.sort();
        assert!(start_prepared(&mut state, &encounter, "en"));
        assert!(state.combat.is_active);
        let mut party_after = party_positions(&state);
        party_after.sort();
        assert_eq!(party_after, party_before, "the party keeps its squares");
        let map = state.map.as_ref().unwrap();
        for goblin in state
            .combat
            .combatants
            .iter()
            .filter(|c| rules5e::is_enemy(c))
        {
            let pos = goblin.position.unwrap();
            assert_eq!(map.cell(pos).unwrap().zone.as_deref(), Some("spawn"));
        }
        assert!(map.triggered.contains(&"hall_goblins".to_string()));
        assert!(
            rules5e::pending_encounter(map, &[GridPos::new(10, 3)]).is_none(),
            "only once"
        );
    }

    #[test]
    fn locks_need_a_check_and_hidden_traps_spring() {
        let mut state = crypt();
        let door = GridPos::new(4, 5);
        let (events, _) = apply(&mut state, ExploreAction::Use(door)).unwrap();
        assert!(matches!(events.last(), Some(ExploreEvent::Locked { .. })));
        let map = state.map.as_ref().unwrap();
        assert_eq!(
            map.cell(door).unwrap().object.as_deref(),
            Some("door_locked")
        );
        assert!(map.locks.iter().any(|l| l.at == door && l.known));
        assert!(
            apply(&mut state, ExploreAction::Move(GridPos::new(4, 6))).is_none(),
            "locked doors block"
        );
        // The rogue picks it sooner or later.
        let mut tries = 0;
        while state
            .map
            .as_ref()
            .unwrap()
            .locks
            .iter()
            .any(|l| l.at == door)
        {
            tries += 1;
            assert!(tries < 60);
            let (events, _) = apply(&mut state, ExploreAction::Pick(door)).unwrap();
            assert!(events.iter().any(
                |e| matches!(e, ExploreEvent::Check { skill, .. } if skill == "sleight_of_hand")
            ));
        }
        assert_eq!(
            state
                .map
                .as_ref()
                .unwrap()
                .cell(door)
                .unwrap()
                .object
                .as_deref(),
            Some("door_open")
        );

        // A trap nobody notices springs under the leader.
        let map = state.map.as_mut().unwrap();
        map.triggered.push("ossuary_dead".into());
        map.traps[0].spot_dc = 99;
        map.traps[0].spotted = false;
        map.revealed.fill(true);
        let trap = map.traps[0].at;
        map.cell_mut(trap).unwrap().object = None;
        let (events, stop) = apply(&mut state, ExploreAction::Move(trap)).unwrap();
        assert!(matches!(stop, Some(Stop::Trap)));
        assert!(
            events
                .iter()
                .any(|e| matches!(e, ExploreEvent::Trap { .. }))
        );
        let map = state.map.as_ref().unwrap();
        assert!(map.traps[0].sprung);
        assert_eq!(
            map.cell(trap).unwrap().object.as_deref(),
            Some("trap_plate")
        );
        assert!(!report(&events, &state).is_empty());
    }

    #[test]
    fn passive_perception_finds_traps_and_paths_avoid_them() {
        let mut state = crypt();
        let map = state.map.as_mut().unwrap();
        map.traps[0].spot_dc = 1;
        map.locks.retain(|l| l.at != GridPos::new(4, 5));
        map.triggered.push("ossuary_dead".into());
        map.revealed.fill(true);
        let (events, _) = apply(&mut state, ExploreAction::Move(GridPos::new(3, 8))).unwrap();
        assert!(
            events
                .iter()
                .any(|e| matches!(e, ExploreEvent::TrapSpotted { .. })),
            "{events:?}"
        );
        let (_, stop) = apply(&mut state, ExploreAction::Move(GridPos::new(1, 9))).unwrap();
        assert!(stop.is_none());
        assert!(!state.map.as_ref().unwrap().traps[0].sprung);
        assert!(
            party_positions(&state)
                .iter()
                .all(|p| *p != GridPos::new(2, 9))
        );
    }

    #[test]
    fn stairs_lead_down_to_the_sanctum() {
        let mut state = crypt();
        let map = state.map.as_mut().unwrap();
        map.triggered.push("hall_goblins".into());
        let (_, stop) = apply(&mut state, ExploreAction::Use(GridPos::new(8, 2))).unwrap();
        assert!(stop.is_none());
        state.map.as_mut().unwrap().revealed.fill(true);
        let (_, stop) = apply(&mut state, ExploreAction::Move(GridPos::new(14, 10))).unwrap();
        let Some(Stop::Exit(to)) = stop else {
            panic!("no exit")
        };
        let event = change_map(&mut state, &to).unwrap();
        assert!(
            matches!(event, ExploreEvent::MapChange { ref map_id, .. } if map_id == "shadow_sanctum")
        );
        let map = state.map.as_ref().unwrap();
        assert_eq!(map.id, "shadow_sanctum");
        assert!(party_positions(&state).iter().all(|p| map.walkable(*p)));
        assert!(map.revealed.iter().any(|r| *r) && !map.revealed.iter().all(|r| *r));
    }

    #[test]
    fn the_planner_chooses_from_the_map_lists() {
        let mut state = crypt();
        let rule = planner_map_rule(&state);
        assert!(rule.contains("The party is in: Antechamber"));
        assert!(rule.contains("Burial hall (not yet seen by the party"));
        assert!(rule.contains("hall_goblins (room hall, 2×goblin)"));
        assert!(rule.contains("spawn_ossuary") && !rule.contains("exit_depths"));
        assert!(rule.contains("forest_road"));
        let plan = |json: &str| serde_json::from_str::<PlanEncounterUpdate>(json).unwrap();
        // Unknown ids and zones fall back; a prepared encounter starts once.
        let started = apply_planner_map(
            &mut state,
            Some(&plan(r#"{"action":"start","encounter":"ossuary_dead"}"#)),
            None,
            "en",
        );
        assert_eq!(started, Some(true));
        let map = state.map.as_ref().unwrap();
        assert!(
            state
                .combat
                .combatants
                .iter()
                .filter(|c| rules5e::is_enemy(c))
                .all(|c| map.cell(c.position.unwrap()).unwrap().zone.as_deref()
                    == Some("spawn_ossuary"))
        );
        super::super::combat5e::end_encounter(&mut state, None);
        let started = apply_planner_map(
            &mut state,
            Some(&plan(
                r#"{"action":"start","enemies":[{"monster":"wolf"}],"zone":"exit_depths"}"#,
            )),
            None,
            "en",
        );
        assert_eq!(started, Some(true));
        let wolf = state
            .combat
            .combatants
            .iter()
            .find(|c| rules5e::is_enemy(c))
            .unwrap();
        let map = state.map.as_ref().unwrap();
        assert_eq!(
            map.cell(wolf.position.unwrap()).unwrap().zone.as_deref(),
            Some("spawn")
        );
        super::super::combat5e::end_encounter(&mut state, None);
        // Travel only to a listed map, never during a fight.
        apply_planner_map(&mut state, None, Some("nowhere"), "en");
        assert_eq!(state.map.as_ref().unwrap().id, "crypt_hall");
        apply_planner_map(&mut state, None, Some("forest_road"), "en");
        assert_eq!(state.map.as_ref().unwrap().id, "forest_road");
        assert!(matches!(
            state.exploration.last(),
            Some(ExploreEvent::MapChange { .. })
        ));
    }

    fn act(file: &str) -> SceneState {
        let json = match file {
            "akt1" => {
                include_str!("../../../../presets/crypt-of-shadows/scenes/akt1_waldstrasse.json")
            }
            "akt2" => include_str!("../../../../presets/crypt-of-shadows/scenes/akt2_gruft.json"),
            _ => include_str!("../../../../presets/crypt-of-shadows/scenes/akt3_heiligtum.json"),
        };
        let mut def: SceneDefinition = serde_json::from_str(json).unwrap();
        def.id = file.to_string();
        build_initial_scene_state(&def)
    }

    #[test]
    fn the_adventure_acts_fit_their_maps() {
        for (file, next) in [
            ("akt1", Some("akt2_gruft")),
            ("akt2", Some("akt3_heiligtum")),
            ("akt3", None),
        ] {
            let state = act(file);
            let rules = state.definition.rules.clone().unwrap();
            assert_eq!(rules.next_scene.as_deref(), next);
            let map = rules5e::battle_map(rules.map_id.as_deref().unwrap()).unwrap();
            assert_eq!(state.objectives.len(), rules.goals.len());
            for goal in &rules.goals {
                match goal.kind.as_str() {
                    "encounter" => assert!(
                        map.encounters.iter().any(|e| e.id == goal.target),
                        "{}",
                        goal.target
                    ),
                    "exit" => assert!(
                        map.exits.iter().any(|e| e.to == goal.target),
                        "{}",
                        goal.target
                    ),
                    other => panic!("unknown goal kind {other}"),
                }
                assert!(
                    !goal.title.de.is_empty()
                        && !goal.title.en.is_empty()
                        && !goal.title.ru.is_empty()
                );
            }
            assert_eq!(state.definition.party.len(), 4);
        }
    }

    #[test]
    fn act_one_ends_after_the_ambush_and_the_road_west() {
        let mut state = act("akt1");
        assert!(ensure_exploring(&mut state));
        // The classic heroes bring their class from their cards.
        let class_of = |name: &str| {
            state
                .combat
                .combatants
                .iter()
                .find(|c| c.name.starts_with(name))
                .unwrap()
                .stats5e
                .as_ref()
                .unwrap()
                .class_id
                .clone()
        };
        assert_eq!(
            [
                class_of("Thorin"),
                class_of("Lyra"),
                class_of("Finn"),
                class_of("Althea")
            ],
            ["fighter", "wizard", "rogue", "cleric"]
        );
        // The ambush starts with the first step on the road.
        let (_, stop) = apply(&mut state, ExploreAction::Move(GridPos::new(12, 4))).unwrap();
        let Some(Stop::Encounter(encounter)) = stop else {
            panic!("no ambush")
        };
        assert_eq!(encounter.id, "road_bandits");
        assert!(start_prepared(&mut state, &encounter, "de"));
        // The fight is won: the goal is reached, the act not yet.
        for c in state
            .combat
            .combatants
            .iter_mut()
            .filter(|c| rules5e::is_enemy(c))
        {
            c.hp = 0;
        }
        won_fight(&mut state);
        super::super::combat5e::end_encounter(&mut state, Some(rules5e::CombatOutcome::Victory));
        assert!(
            matches!(state.exploration.last(), Some(ExploreEvent::Goal { goal_id, .. }) if goal_id == "hinterhalt")
        );
        assert!(
            !state
                .exploration
                .iter()
                .any(|e| matches!(e, ExploreEvent::ActComplete { .. }))
        );
        // West along the road to the crypt: the act is complete.
        state.map.as_mut().unwrap().revealed.fill(true);
        state
            .map
            .as_mut()
            .unwrap()
            .triggered
            .push("stream_wolves".into());
        let (_, stop) = apply(&mut state, ExploreAction::Move(GridPos::new(0, 4))).unwrap();
        let Some(Stop::Exit(to)) = stop else {
            panic!("no exit")
        };
        change_map(&mut state, &to);
        let events = reach_goal(&mut state, "exit", &to);
        assert!(
            matches!(events.last(), Some(ExploreEvent::ActComplete { next_scene: Some(n) }) if n == "akt2_gruft")
        );
        assert!(state.objectives.iter().all(|o| o.status == "completed"));
    }

    #[test]
    fn chests_and_won_fights_fill_the_inventory_and_gear_can_be_worn() {
        let mut state = crypt();
        let map = state.map.as_mut().unwrap();
        map.revealed.fill(true);
        map.locks.clear();
        map.triggered.push("ossuary_dead".into());
        map.traps.clear();
        let before = state.inventory.len();
        let (events, _) = apply(&mut state, ExploreAction::Use(GridPos::new(1, 10))).unwrap();
        assert!(
            events
                .iter()
                .any(|e| matches!(e, ExploreEvent::Loot { items } if items.len() == 3))
        );
        assert_eq!(state.inventory.len(), before + 3);
        let gold = state
            .inventory
            .iter()
            .find(|i| i.srd_id.as_deref() == Some("gold_piece"))
            .unwrap();
        assert_eq!((gold.quantity, gold.item_type.as_str()), (25, "treasure"));
        let potion = state
            .inventory
            .iter()
            .find(|i| i.srd_id.as_deref() == Some("potion_of_healing"))
            .unwrap();
        assert_eq!(
            (potion.hp_restore, potion.item_type.as_str()),
            (7, "consumable")
        );
        assert!(
            state.map.as_ref().unwrap().loot.is_empty(),
            "a chest is emptied once"
        );

        // Lyra (a rogue in this test scene) puts on the studded leather; the old leather goes into the pack.
        let finn = state
            .combat
            .combatants
            .iter()
            .find(|c| c.name == "Lyra")
            .map(|c| c.id.clone())
            .unwrap();
        let armor = state
            .inventory
            .iter()
            .find(|i| i.srd_id.as_deref() == Some("studded_leather"))
            .unwrap()
            .id
            .clone();
        equip_item(&mut state, &finn, &armor).unwrap();
        let lyra = state
            .combat
            .combatants
            .iter()
            .find(|c| c.id == finn)
            .unwrap();
        assert_eq!(lyra.stats5e.as_ref().unwrap().armor_class, 14);
        assert!(
            state
                .inventory
                .iter()
                .any(|i| i.srd_id.as_deref() == Some("leather"))
        );
        assert!(
            !state
                .inventory
                .iter()
                .any(|i| i.srd_id.as_deref() == Some("studded_leather"))
        );
        unequip_item(&mut state, &finn, "shortsword").unwrap();
        assert!(
            state
                .inventory
                .iter()
                .any(|i| i.srd_id.as_deref() == Some("shortsword"))
        );
        assert!(unequip_item(&mut state, &finn, "shortsword").is_err());

        // Spoils of a prepared fight.
        let encounter = state
            .map
            .as_ref()
            .unwrap()
            .encounters
            .iter()
            .find(|e| e.id == "hall_goblins")
            .cloned()
            .unwrap();
        assert!(start_prepared(&mut state, &encounter, "de"));
        assert!(
            equip_item(&mut state, &finn, "nothing").is_err(),
            "no changing gear mid-fight"
        );
        won_fight(&mut state);
        assert!(state.exploration.iter().any(|e| matches!(e, ExploreEvent::Loot { items } if items.iter().any(|i| i.srd_id == "shortsword"))));
        let swords = state
            .inventory
            .iter()
            .find(|i| i.srd_id.as_deref() == Some("shortsword"))
            .unwrap();
        assert_eq!(swords.quantity, 2, "same items stack");
    }

    #[test]
    fn actions_are_parsed_strictly() {
        assert!(
            matches!(parse_action("move:3:4"), Some(ExploreAction::Move(p)) if p == GridPos::new(3, 4))
        );
        assert!(matches!(
            parse_action("force:1:2"),
            Some(ExploreAction::Force(_))
        ));
        assert!(parse_action("jump:1:2").is_none());
        assert!(parse_action("move:a:2").is_none());
    }
}
