//! Exploring the map of a 5e scene between fights on a [`Table`]: the party walks as a group
//! behind its leader, sees by its light (fog of war), opens doors and chests, picks or forces
//! locks with skill checks, finds or springs traps, enters rooms whose prepared encounter then
//! starts, and leaves through exits to other maps. Deterministic like [`crate::fight`]:
//! randomness, the language of item names and the stamp for new ids come from the caller.
//!
//! A step as the desktop plays it: [`ensure_exploring`], then [`ExploreAction::parse`] →
//! [`apply_exploration`]; on [`ExploreStop::Exit`] [`change_map`] and [`reach_goal`] (`"exit"`),
//! on [`ExploreStop::Encounter`] [`start_prepared`] (then the fight flow), finally
//! [`push_explore_events`].

use super::*;
use rand::Rng;

/// Exploration events kept in the scene (log in the UI).
pub const MAX_EXPLORE_EVENTS: usize = 60;

/// The scene's map is explored (fog of war on), outside fights.
pub fn exploring(
    rules: Option<&SceneRules>,
    combat: &EncounterState,
    map: Option<&BattleMap>,
) -> bool {
    rules.is_some_and(SceneRules::is_5e)
        && !combat.is_active
        && map.is_some_and(|m| !m.revealed.is_empty())
}

fn party_indices(combat: &EncounterState) -> Vec<usize> {
    (0..combat.combatants.len())
        .filter(|&i| is_party(&combat.combatants[i]))
        .collect()
}

/// Who leads the walk: the player, or the first party member still standing.
pub fn leader_index(combat: &EncounterState) -> Option<usize> {
    let party = party_indices(combat);
    party
        .iter()
        .copied()
        .find(|&i| combat.combatants[i].role == "player" && is_up(&combat.combatants[i]))
        .or_else(|| party.into_iter().find(|&i| is_up(&combat.combatants[i])))
}

/// Squares of the party members that have one.
pub fn party_positions(combat: &EncounterState) -> Vec<GridPos> {
    party_indices(combat)
        .into_iter()
        .filter_map(|i| combat.combatants[i].position)
        .collect()
}

/// Reveals what the party sees now and notices traps; returns the finds.
pub fn look_around(t: &mut Table) -> Vec<ExploreEvent> {
    let viewers: Vec<(GridPos, i32, String)> = party_indices(t.combat)
        .into_iter()
        .map(|i| &t.combat.combatants[i])
        .filter(|c| is_up(c))
        .filter_map(|c| {
            let passive = c.stats5e.as_ref().map_or(10, |s| s.passive_perception());
            c.position.map(|p| (p, passive, c.name.clone()))
        })
        .collect();
    let Some(map) = t.map.as_mut() else {
        return Vec::new();
    };
    let positions: Vec<GridPos> = viewers.iter().map(|(p, _, _)| *p).collect();
    reveal(map, &positions);
    spot_traps(map, &viewers)
        .into_iter()
        .map(|(at, by_name)| ExploreEvent::TrapSpotted { at, by_name })
        .collect()
}

/// After fight moves: the fog lifts where the party now stands.
pub fn refresh_fog(t: &mut Table) {
    if t.map.as_ref().is_some_and(|m| !m.revealed.is_empty()) {
        look_around(t);
    }
}

/// Places party members without a square around the leader (or on the start zone).
fn gather_party(t: &mut Table) {
    let Some(map) = t.map.as_ref() else { return };
    let combat = &mut *t.combat;
    let party = party_indices(combat);
    let leader = leader_index(combat).unwrap_or(party[0]);
    if combat.combatants[leader]
        .position
        .is_none_or(|p| !map.walkable(p))
    {
        let start = map.placements("party", 1, &[]);
        combat.combatants[leader].position = start.first().copied();
    }
    let Some(lead) = combat.combatants[leader].position else {
        return;
    };
    let others: Vec<usize> = party.into_iter().filter(|&i| i != leader).collect();
    let spots = follow_squares(map, lead, others.len());
    for (slot, index) in others.into_iter().enumerate() {
        combat.combatants[index].position = spots.get(slot).copied().or(Some(lead));
    }
}

/// First half of [`ensure_exploring`]: whether the scene can be explored (5e, no fight, a map –
/// the scene's map is loaded if there is none yet, positions cleared). The app sets up its
/// party in between, then calls [`begin_exploring`].
pub fn prepare_exploring(t: &mut Table) -> bool {
    if !t.is_5e() || t.combat.is_active {
        return false;
    }
    let map_id = t.rules.and_then(|r| r.map_id.clone());
    if t.map.is_none() {
        let Some(map) = map_id.as_deref().and_then(battle_map) else {
            return false;
        };
        *t.map = Some(map.clone());
        for c in &mut t.combat.combatants {
            c.position = None;
        }
    }
    true
}

/// Second half of [`ensure_exploring`]: fog on, the party gathered on its start zone (or
/// around its leader), the first room entered.
pub fn begin_exploring(t: &mut Table) {
    let fresh = t.map.as_ref().is_some_and(|m| m.revealed.is_empty());
    if let Some(map) = t.map.as_mut() {
        start_exploring(map);
    }
    if fresh || party_positions(t.combat).len() < party_indices(t.combat).len() {
        gather_party(t);
    }
    look_around(t);
    if fresh && let Some(event) = enter_room(t) {
        push_explore_events(t.exploration, vec![event]);
    }
}

/// Starts exploring the scene's map when it has one (5e, no fight): fog on, the party on its
/// start zone. `prepare_party` sets up player and companions (heroes with [`Stats5e`]) once
/// the map is there. Returns whether the scene is now being explored.
pub fn ensure_exploring(t: &mut Table, prepare_party: impl FnOnce(&mut Table)) -> bool {
    if !prepare_exploring(t) {
        return false;
    }
    prepare_party(t);
    begin_exploring(t);
    true
}

/// Adds events to the exploration log (at most [`MAX_EXPLORE_EVENTS`]).
pub fn push_explore_events(exploration: &mut Vec<ExploreEvent>, events: Vec<ExploreEvent>) {
    exploration.extend(events);
    let overflow = exploration.len().saturating_sub(MAX_EXPLORE_EVENTS);
    exploration.drain(..overflow);
}

/// The room the leader stands in, the first time the party comes there.
fn enter_room(t: &mut Table) -> Option<ExploreEvent> {
    let leader = t.combat.combatants[leader_index(t.combat)?].position?;
    let map = t.map.as_mut()?;
    let room = room_at(map, leader)?.clone();
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
#[derive(Debug, Clone, PartialEq)]
pub enum ExploreStop {
    /// A hidden trap sprang.
    Trap,
    /// The party entered the room of a prepared encounter (not started yet).
    Encounter(MapEncounter),
    /// The leader stands on an exit to the map with this id.
    Exit(String),
}

/// Walks the leader along `path` square by square; the others follow. Stops on a sprung
/// trap, in the room of a prepared encounter, or on an exit.
fn walk_party<R: Rng + ?Sized>(
    t: &mut Table,
    path: &[GridPos],
    rng: &mut R,
) -> (Vec<ExploreEvent>, Option<ExploreStop>) {
    let mut events = Vec::new();
    let Some(leader) = leader_index(t.combat) else {
        return (events, None);
    };
    let mut feet = 0;
    let mut stop = None;
    for &step in path {
        t.combat.combatants[leader].position = Some(step);
        feet += SQUARE_FT;
        let map = t.map.as_mut().expect("exploring has a map");
        for at in map.open_doors_on(&[step]) {
            events.push(ExploreEvent::Door { at, opened: true });
        }
        reveal(map, &[step]);
        if let Some(trap) = hidden_trap_at(map, step) {
            map.traps[trap].sprung = true;
            let trap = map.traps[trap].clone();
            set_object(map, step, "trap_plate");
            events.push(spring_trap(t, leader, &trap, rng));
            stop = Some(ExploreStop::Trap);
            break;
        }
        let map = t.map.as_ref().expect("exploring has a map");
        if let Some(exit) = exit_at(map, step) {
            stop = Some(ExploreStop::Exit(exit.to.clone()));
            break;
        }
        if let Some(encounter) = pending_encounter(map, &[step]) {
            stop = Some(ExploreStop::Encounter(encounter));
            break;
        }
    }
    if feet > 0 {
        let actor = &t.combat.combatants[leader];
        events.insert(
            0,
            ExploreEvent::Move {
                actor_name: actor.name.clone(),
                feet,
            },
        );
        gather_party(t);
        events.extend(look_around(t));
        events.extend(enter_room(t));
    }
    (events, stop)
}

/// A hidden trap springs under a party member: Dexterity save, half damage on a success.
fn spring_trap<R: Rng + ?Sized>(
    t: &mut Table,
    index: usize,
    trap: &MapTrap,
    rng: &mut R,
) -> ExploreEvent {
    let heroic_death = t.heroic_death();
    let target = &mut t.combat.combatants[index];
    let save = saving_throw(target, Ability::Dex, trap.save_dc, rng);
    let success = matches!(save, CombatEvent::Save { success: true, .. });
    let formula = DiceFormula::parse(&trap.damage).unwrap_or(DiceFormula {
        count: 1,
        sides: 6,
        modifier: 0,
    });
    let mut roll = roll_damage(rng, &formula, false);
    if success {
        roll.total /= 2;
    }
    let before = target.hp;
    let scaling = damage_scaling(target, &trap.damage_type);
    apply_damage(
        target,
        roll,
        &trap.damage_type,
        scaling,
        &DamageContext {
            critical: false,
            heroic_death,
        },
        rng,
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
fn party_check<R: Rng + ?Sized>(
    combat: &EncounterState,
    skill: &str,
    dc: i32,
    rng: &mut R,
) -> ExploreEvent {
    let best = party_indices(combat)
        .into_iter()
        .map(|i| &combat.combatants[i])
        .filter(|c| is_up(c))
        .filter_map(|c| {
            let bonus = c.stats5e.as_ref().and_then(|s| check_bonus(s, skill))?;
            Some((c, bonus))
        })
        .max_by_key(|(_, bonus)| *bonus);
    let (name, bonus) = best.map_or(("?".to_string(), 0), |(c, b)| (c.name.clone(), b));
    let roll = roll_d20(rng, RollMode::Normal);
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
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExploreAction {
    Move(GridPos),
    Use(GridPos),
    Pick(GridPos),
    Force(GridPos),
}

impl ExploreAction {
    /// `move:x:y`, `use:x:y`, `pick:x:y` or `force:x:y`.
    pub fn parse(action: &str) -> Option<Self> {
        let (kind, rest) = action.trim().split_once(':')?;
        let (x, y) = rest.split_once(':')?;
        let pos = GridPos::new(x.parse().ok()?, y.parse().ok()?);
        Some(match kind {
            "move" => Self::Move(pos),
            "use" => Self::Use(pos),
            "pick" => Self::Pick(pos),
            "force" => Self::Force(pos),
            _ => return None,
        })
    }
}

/// Carries out one exploration action of the party (call [`ensure_exploring`] first). `None`
/// = nothing happened (unreachable, unseen, nothing there). Loot is named in
/// `language_code`; `stamp` makes new inventory ids unique.
pub fn apply_exploration<R: Rng + ?Sized>(
    t: &mut Table,
    action: ExploreAction,
    rng: &mut R,
    language_code: &str,
    stamp: i64,
) -> Option<(Vec<ExploreEvent>, Option<ExploreStop>)> {
    let leader = leader_index(t.combat)?;
    let from = t.combat.combatants[leader].position?;
    let others: Vec<GridPos> = party_positions(t.combat)
        .into_iter()
        .filter(|p| *p != from)
        .collect();
    let map = t.map.as_ref()?;
    match action {
        ExploreAction::Move(target) => {
            if !is_revealed(map, target) {
                return None;
            }
            let path = explore_path(map, from, target, &others)?;
            if path.is_empty() {
                return None;
            }
            Some(walk_party(t, &path, rng))
        }
        ExploreAction::Use(target) | ExploreAction::Pick(target) | ExploreAction::Force(target) => {
            if !is_revealed(map, target) {
                return None;
            }
            let interaction = interaction_at(map, target)?;
            let path = approach_object(map, from, target, &others)?;
            let (mut events, stop) = walk_party(t, &path, rng);
            if stop.is_some() {
                return Some((events, stop));
            }
            let map = t.map.as_mut().expect("exploring has a map");
            match (interaction, &action) {
                (Interaction::OpenDoor, _) => {
                    set_object(map, target, "door_open");
                    events.push(ExploreEvent::Door {
                        at: target,
                        opened: true,
                    });
                }
                (Interaction::CloseDoor, _) => {
                    if others.contains(&target) {
                        return None;
                    }
                    set_object(map, target, "door_closed");
                    events.push(ExploreEvent::Door {
                        at: target,
                        opened: false,
                    });
                }
                (Interaction::OpenChest, _) => {
                    set_object(map, target, "chest_open");
                    events.push(ExploreEvent::Chest { at: target });
                    events.extend(take_chest_loot(t, target, language_code, stamp));
                }
                (Interaction::LockedDoor | Interaction::LockedChest, ExploreAction::Use(_)) => {
                    for lock in map.locks.iter_mut().filter(|l| l.at == target) {
                        lock.known = true;
                    }
                    if map.cell(target).and_then(|c| c.object.as_deref()) == Some("door_closed") {
                        set_object(map, target, "door_locked");
                    }
                    events.push(ExploreEvent::Locked { at: target });
                }
                (locked, _) => {
                    let dc = lock_dc(map, target).unwrap_or(15);
                    let skill = if matches!(action, ExploreAction::Pick(_)) {
                        "sleight_of_hand"
                    } else {
                        "athletics"
                    };
                    let check = party_check(t.combat, skill, dc, rng);
                    let success = matches!(check, ExploreEvent::Check { success: true, .. });
                    events.push(check);
                    if success {
                        let map = t.map.as_mut().expect("exploring has a map");
                        unlock(map, target);
                        if locked == Interaction::LockedChest {
                            set_object(map, target, "chest_open");
                            events.push(ExploreEvent::Chest { at: target });
                            events.extend(take_chest_loot(t, target, language_code, stamp));
                        } else {
                            set_object(map, target, "door_open");
                            events.push(ExploreEvent::Door {
                                at: target,
                                opened: true,
                            });
                        }
                    }
                }
            }
            events.extend(look_around(t));
            Some((events, None))
        }
    }
}

/// Checks off the act's goals of `kind` reaching `target` (an encounter won, a map reached);
/// once all are reached, the act is complete.
pub fn reach_goal(t: &mut Table, kind: &str, target: &str) -> Vec<ExploreEvent> {
    let goals = t.rules.map(|r| r.goals.clone()).unwrap_or_default();
    let mut events = Vec::new();
    for goal in goals
        .iter()
        .filter(|g| g.kind == kind && g.target == target)
    {
        if let Some(objective) = t
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
            t.objectives
                .iter()
                .any(|o| o.id == g.id && o.status == "completed")
        });
    if !events.is_empty() && all_done {
        events.push(ExploreEvent::ActComplete {
            next_scene: t.rules.and_then(|r| r.next_scene.clone()),
        });
    }
    events
}

/// A won fight: the prepared encounter it came from counts for the act's goals and its loot
/// (named in `language_code`) goes into the inventory.
pub fn won_fight(t: &mut Table, language_code: &str, stamp: i64) {
    let Some(id) = t.map.as_mut().and_then(|m| m.active_encounter.take()) else {
        return;
    };
    let mut events = reach_goal(t, "encounter", &id);
    let loot = t
        .map
        .as_ref()
        .and_then(|m| m.encounters.iter().find(|e| e.id == id))
        .map(|e| e.loot.clone())
        .unwrap_or_default();
    if !loot.is_empty() {
        let items = add_items(t.inventory, &loot, language_code, stamp);
        events.insert(0, ExploreEvent::Loot { items });
    }
    push_explore_events(t.exploration, events);
}

/// Parses `id` or `id*count` into an SRD item and a count.
fn loot_entry(entry: &str) -> Option<(&'static ItemData, u32)> {
    let (id, count) = match entry.split_once('*') {
        Some((id, count)) => (id.trim(), count.trim().parse().ok()?),
        None => (entry.trim(), 1),
    };
    item(id).map(|item| (item, count))
}

/// Puts SRD items (`id` or `id*count`) into the party inventory (same items stack); returns
/// what was added. New entries are named in `language_code`; `stamp` makes their ids unique
/// (the desktop passes the time in µs).
pub fn add_items(
    inventory: &mut Vec<InventoryItem>,
    entries: &[String],
    language_code: &str,
    stamp: i64,
) -> Vec<LootItem> {
    let mut added = Vec::new();
    for (data, count) in entries.iter().filter_map(|e| loot_entry(e)) {
        if let Some(existing) = inventory
            .iter_mut()
            .find(|i| i.srd_id.as_deref() == Some(data.id.as_str()))
        {
            existing.quantity = existing.quantity.saturating_add(count);
        } else {
            let heal = data
                .heal
                .as_deref()
                .and_then(DiceFormula::parse)
                .map_or(0, |f| f.average());
            inventory.push(InventoryItem {
                id: format!("item_{}_{stamp}", data.id),
                name: data.name.get(language_code).to_string(),
                description: String::new(),
                quantity: count,
                item_type: match data.kind {
                    ItemKind::Potion => "consumable",
                    ItemKind::Treasure => "treasure",
                    _ => "equipment",
                }
                .to_string(),
                hp_restore: heal,
                stress_restore: 0,
                clears_condition: None,
                srd_id: Some(data.id.clone()),
            });
        }
        added.push(LootItem {
            srd_id: data.id.clone(),
            name: data.name.clone(),
            quantity: count,
        });
    }
    added
}

/// What lies in the chest at `at` goes to the party (once).
fn take_chest_loot(
    t: &mut Table,
    at: GridPos,
    language_code: &str,
    stamp: i64,
) -> Option<ExploreEvent> {
    let map = t.map.as_mut()?;
    let index = map.loot.iter().position(|l| l.at == at)?;
    let entries = map.loot.remove(index).items;
    let items = add_items(t.inventory, &entries, language_code, stamp);
    (!items.is_empty()).then_some(ExploreEvent::Loot { items })
}

/// Why gear could not be put on or taken off.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GearError {
    /// Not during a fight.
    InCombat,
    /// No such inventory entry or worn item.
    ItemMissing,
    /// Not SRD gear, not a party member, or not wearable.
    CannotEquip,
    /// The hero's class lacks the proficiency.
    NotProficient,
}

/// A party member puts on gear from the inventory; what comes off goes back into it (named in
/// `language_code`, new ids with `stamp`).
pub fn equip_item(
    t: &mut Table,
    member_id: &str,
    inventory_id: &str,
    language_code: &str,
    stamp: i64,
) -> Result<(), GearError> {
    if t.combat.is_active {
        return Err(GearError::InCombat);
    }
    let position = t
        .inventory
        .iter()
        .position(|i| i.id == inventory_id)
        .ok_or(GearError::ItemMissing)?;
    let srd_id = t.inventory[position]
        .srd_id
        .clone()
        .ok_or(GearError::CannotEquip)?;
    let hero = t
        .combat
        .combatants
        .iter_mut()
        .find(|c| c.id == member_id && is_party(c))
        .ok_or(GearError::CannotEquip)?;
    let stats = hero.stats5e.as_mut().ok_or(GearError::CannotEquip)?;
    let removed = equip(stats, &srd_id).map_err(|problem| match problem {
        EquipProblem::NotProficient => GearError::NotProficient,
        EquipProblem::Unknown | EquipProblem::NotWearable => GearError::CannotEquip,
    })?;
    let item = &mut t.inventory[position];
    item.quantity = item.quantity.saturating_sub(1);
    if item.quantity == 0 {
        t.inventory.remove(position);
    }
    add_items(t.inventory, &removed, language_code, stamp);
    Ok(())
}

/// A party member takes gear off; it goes into the inventory.
pub fn unequip_item(
    t: &mut Table,
    member_id: &str,
    srd_id: &str,
    language_code: &str,
    stamp: i64,
) -> Result<(), GearError> {
    if t.combat.is_active {
        return Err(GearError::InCombat);
    }
    let hero = t
        .combat
        .combatants
        .iter_mut()
        .find(|c| c.id == member_id && is_party(c))
        .and_then(|c| c.stats5e.as_mut())
        .ok_or(GearError::CannotEquip)?;
    if !unequip(hero, srd_id) {
        return Err(GearError::ItemMissing);
    }
    add_items(t.inventory, &[srd_id.to_string()], language_code, stamp);
    Ok(())
}

/// Moves the party to another map: its start zone, fog fresh.
pub fn change_map(t: &mut Table, map_id: &str) -> Option<ExploreEvent> {
    let map = battle_map(map_id)?.clone();
    let name = map.name.clone();
    *t.map = Some(map);
    for index in party_indices(t.combat) {
        t.combat.combatants[index].position = None;
    }
    if let Some(map) = t.map.as_mut() {
        start_exploring(map);
    }
    gather_party(t);
    look_around(t);
    Some(ExploreEvent::MapChange {
        map_id: map_id.to_string(),
        name,
    })
}

/// Marks a prepared encounter as met and as the running fight (for [`won_fight`]).
pub fn mark_prepared(map: &mut Option<BattleMap>, encounter: &MapEncounter) {
    if let Some(map) = map.as_mut() {
        map.triggered.push(encounter.id.clone());
        map.active_encounter = Some(encounter.id.clone());
    }
}

/// The monsters of a prepared encounter.
pub fn prepared_enemies(encounter: &MapEncounter) -> Vec<EnemyRequest> {
    encounter
        .monsters
        .iter()
        .map(|m| EnemyRequest {
            monster: m.monster.clone(),
            count: Some(m.count),
        })
        .collect()
}

/// The prepared encounter of a room starts: its monsters on its zone (as written, no XP
/// limit). The party must be set up already, as for [`start_encounter_at`].
pub fn start_prepared<R: Rng + ?Sized>(
    t: &mut Table,
    encounter: &MapEncounter,
    language_code: &str,
    stamp: i64,
    rng: &mut R,
) -> bool {
    mark_prepared(t.map, encounter);
    start_encounter_at(
        t,
        &prepared_enemies(encounter),
        language_code,
        &encounter.zone,
        false,
        stamp,
        rng,
    )
    .started
}

/// After a round has been told ([`record_round`]): a victory over a prepared encounter counts
/// (goals, loot named in `language_code`, ids with `stamp`), a decided fight ends, the fog
/// lifts where the fighters now stand.
pub fn close_round(t: &mut Table, outcome: Option<CombatOutcome>, language_code: &str, stamp: i64) {
    if outcome == Some(CombatOutcome::Victory) {
        won_fight(t, language_code, stamp);
    }
    if outcome.is_some() {
        end_encounter(t);
    }
    refresh_fog(t);
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::{SeedableRng, rngs::StdRng};

    /// The party (fighter, rogue Lyra) on the crypt map, with goals for the hall and the depths.
    fn crypt() -> TableState {
        let mut state = TableState {
            rules: Some(SceneRules {
                ruleset: "5e".into(),
                hero_classes: [("Lyra".to_string(), "rogue".to_string())].into(),
                map_id: Some("crypt_hall".into()),
                goals: vec![
                    SceneGoal {
                        id: "hall".into(),
                        kind: "encounter".into(),
                        target: "hall_goblins".into(),
                        ..Default::default()
                    },
                    SceneGoal {
                        id: "depths".into(),
                        kind: "exit".into(),
                        target: "shadow_sanctum".into(),
                        ..Default::default()
                    },
                ],
                next_scene: Some("act2".into()),
                ..Default::default()
            }),
            party: vec!["Lyra".into()],
            objectives: ["hall", "depths"]
                .iter()
                .map(|id| CampaignObjective {
                    id: id.to_string(),
                    title: id.to_string(),
                    description: String::new(),
                    current: 0,
                    max: default_objective_max(),
                    status: default_objective_status(),
                })
                .collect(),
            ..Default::default()
        };
        let started = ensure_exploring(&mut state.table(), |t| {
            for (id, name, role) in [
                ("player", "Hiroki", "player"),
                ("companion_0", "Lyra", "companion"),
            ] {
                t.combat.combatants.push(Combatant {
                    id: id.into(),
                    name: name.into(),
                    role: role.into(),
                    hp: 10,
                    max_hp: 10,
                    stress: 0,
                    max_stress: 0,
                    initiative: 0,
                    conditions: Vec::new(),
                    skills: Default::default(),
                    stats5e: None,
                    position: None,
                });
            }
            ensure_party_stats(t, |_| None);
        });
        assert!(started);
        state
    }

    fn act(
        state: &mut TableState,
        rng: &mut StdRng,
        action: &str,
    ) -> Option<(Vec<ExploreEvent>, Option<ExploreStop>)> {
        let action = ExploreAction::parse(action).expect("valid action");
        apply_exploration(&mut state.table(), action, rng, "en", 77)
    }

    #[test]
    fn exploring_starts_in_the_first_room_under_fog() {
        let state = crypt();
        assert!(exploring(
            state.rules.as_ref(),
            &state.combat,
            state.map.as_ref()
        ));
        assert_eq!(party_positions(&state.combat).len(), 2);
        assert!(matches!(
            state.exploration.as_slice(),
            [ExploreEvent::Room { room_id, .. }] if room_id == "antechamber"
        ));
        let map = state.map.as_ref().unwrap();
        assert!(is_revealed(map, GridPos::new(7, 4)));
        assert!(!is_revealed(map, GridPos::new(10, 2)));
        assert_eq!(ExploreAction::parse("fly:1:2"), None);
        // Without a map or outside 5e nothing is explored.
        let mut plain = TableState::default();
        assert!(!ensure_exploring(&mut plain.table(), |_| {
            panic!("no party setup without a map")
        }));
    }

    #[test]
    fn locks_chests_and_gear_change_the_inventory() {
        let mut state = crypt();
        let mut rng = StdRng::seed_from_u64(4);
        let door = GridPos::new(4, 5);
        let (events, _) = act(&mut state, &mut rng, "use:4:5").unwrap();
        assert!(matches!(events.last(), Some(ExploreEvent::Locked { .. })));
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
            act(&mut state, &mut rng, "pick:4:5").unwrap();
        }
        // The chest in the ossuary (encounter and trap out of the way).
        let map = state.map.as_mut().unwrap();
        map.revealed.fill(true);
        map.locks.clear();
        map.traps.clear();
        map.triggered.push("ossuary_dead".into());
        let (events, stop) = act(&mut state, &mut rng, "use:1:10").unwrap();
        assert!(stop.is_none());
        assert!(
            events
                .iter()
                .any(|e| matches!(e, ExploreEvent::Loot { items } if items.len() == 3))
        );
        assert!(state.inventory.iter().all(|i| i.id.ends_with("_77")));
        let armor = state
            .inventory
            .iter()
            .find(|i| i.srd_id.as_deref() == Some("studded_leather"))
            .unwrap()
            .id
            .clone();
        assert_eq!(
            equip_item(&mut state.table(), "companion_0", &armor, "en", 78),
            Ok(())
        );
        assert!(
            state
                .inventory
                .iter()
                .any(|i| i.srd_id.as_deref() == Some("leather") && i.id.ends_with("_78"))
        );
        assert_eq!(
            equip_item(&mut state.table(), "companion_0", "nothing", "en", 79),
            Err(GearError::ItemMissing)
        );
        assert_eq!(
            unequip_item(
                &mut state.table(),
                "companion_0",
                "studded_leather",
                "en",
                80
            ),
            Ok(())
        );
        state.combat.is_active = true;
        assert_eq!(
            unequip_item(&mut state.table(), "companion_0", "shortsword", "en", 81),
            Err(GearError::InCombat)
        );
    }

    #[test]
    fn a_won_prepared_fight_and_the_exit_complete_the_act() {
        let mut state = crypt();
        let mut rng = StdRng::seed_from_u64(8);
        act(&mut state, &mut rng, "move:7:2").unwrap();
        act(&mut state, &mut rng, "use:8:2").unwrap();
        let (_, stop) = act(&mut state, &mut rng, "move:10:2").unwrap();
        let Some(ExploreStop::Encounter(encounter)) = stop else {
            panic!("the hall's goblins wait");
        };
        assert!(start_prepared(
            &mut state.table(),
            &encounter,
            "en",
            5,
            &mut rng
        ));
        assert!(state.combat.is_active);
        for c in state.combat.combatants.iter_mut().filter(|c| is_enemy(c)) {
            c.hp = 0;
        }
        let mut events = Vec::new();
        let outcome = record_round(&mut state.combat, &mut events);
        close_round(&mut state.table(), outcome, "en", 6);
        assert!(!state.combat.is_active);
        assert!(
            state
                .exploration
                .iter()
                .any(|e| matches!(e, ExploreEvent::Goal { goal_id, .. } if goal_id == "hall"))
        );
        assert!(
            state
                .inventory
                .iter()
                .any(|i| i.srd_id.as_deref() == Some("gold_piece") && i.quantity == 8)
        );
        // Down the stairs: the act is complete.
        state.map.as_mut().unwrap().revealed.fill(true);
        let (_, stop) = act(&mut state, &mut rng, "move:14:10").unwrap();
        let Some(ExploreStop::Exit(to)) = stop else {
            panic!("the stairs lead down");
        };
        assert!(matches!(
            change_map(&mut state.table(), &to),
            Some(ExploreEvent::MapChange { .. })
        ));
        let goals = reach_goal(&mut state.table(), "exit", &to);
        assert!(matches!(
            goals.last(),
            Some(ExploreEvent::ActComplete { next_scene: Some(n) }) if n == "act2"
        ));
        assert!(state.objectives.iter().all(|o| o.status == "completed"));
        assert_eq!(state.map.as_ref().unwrap().id, "shadow_sanctum");
    }

    #[test]
    fn the_exploration_log_keeps_the_newest_events() {
        let mut log = Vec::new();
        let events: Vec<ExploreEvent> = (0..MAX_EXPLORE_EVENTS as u32 + 5)
            .map(|level| ExploreEvent::LevelUp { level })
            .collect();
        push_explore_events(&mut log, events);
        assert_eq!(log.len(), MAX_EXPLORE_EVENTS);
        assert!(matches!(log[0], ExploreEvent::LevelUp { level: 5 }));
    }
}
