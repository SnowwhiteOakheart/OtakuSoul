//! Exploring the map of a 5e scene between fights (step 4 of the 5e plan): the party walks
//! as a group behind the player, sees by its light (fog of war), opens doors and chests,
//! picks or forces locks with skill checks, finds or springs traps, enters rooms whose
//! prepared encounter then starts, and leaves through exits to other maps. The engine
//! resolves everything; the game master narrates what is new.

use super::rules5e::{self, ExploreEvent};
pub(super) use super::rules5e::{ExploreAction, ExploreStop as Stop};
use super::*;
use rand::Rng;

/// The scene's map is explored (fog of war on), outside fights.
pub fn exploring(state: &SceneState) -> bool {
    rules5e::exploring(
        state.definition.rules.as_ref(),
        &state.combat,
        state.map.as_ref(),
    )
}

/// After fight moves: the fog lifts where the party now stands.
pub fn refresh_fog(state: &mut SceneState) {
    rules5e::refresh_fog(&mut state.table());
}

/// Starts exploring the scene's map when it has one (5e, no fight): fog on, the party on its
/// start zone. Returns whether the scene is now being explored.
pub fn ensure_exploring(state: &mut SceneState) -> bool {
    if !rules5e::prepare_exploring(&mut state.table()) {
        return false;
    }
    ensure_party_vitals(state);
    rules5e::begin_exploring(&mut state.table());
    true
}

/// Reads the player's exploration input (`move:x:y`, `use:x:y`, `pick:x:y`, `force:x:y`).
pub(super) fn parse_action(action: &str) -> Option<ExploreAction> {
    ExploreAction::parse(action)
}

/// Carries out one action ([`rules5e::apply_exploration`]). `None` = nothing happened
/// (unreachable, nothing there). Loot is named in `language_code`; `stamp` makes new inventory
/// ids unique.
pub(super) fn apply<R: Rng + ?Sized>(
    state: &mut SceneState,
    action: ExploreAction,
    rng: &mut R,
    language_code: &str,
    stamp: i64,
) -> Option<(Vec<ExploreEvent>, Option<Stop>)> {
    rules5e::apply_exploration(&mut state.table(), action, rng, language_code, stamp)
}

/// Checks off the act's goals of `kind` reaching `target` (an encounter won, a map reached);
/// once all are reached, the act is complete.
pub fn reach_goal(state: &mut SceneState, kind: &str, target: &str) -> Vec<ExploreEvent> {
    rules5e::reach_goal(&mut state.table(), kind, target)
}

/// A won fight: the prepared encounter it came from counts for the act's goals (the desktop
/// does this in [`rules5e::close_round`]; kept for tests).
#[cfg(test)]
pub(super) fn won_fight(state: &mut SceneState, language_code: &str, stamp: i64) {
    rules5e::won_fight(&mut state.table(), language_code, stamp);
}

pub(super) fn reply_code() -> String {
    crate::modules::content_lang::language_code(
        &crate::modules::content_lang::ContentLang::reply_language_name(),
    )
}

/// Puts SRD items into the party inventory (same items stack); returns what was added.
/// `stamp` makes the ids of new entries unique (the desktop passes the time in µs).
pub fn add_items(
    state: &mut SceneState,
    entries: &[String],
    language_code: &str,
    stamp: i64,
) -> Vec<rules5e::LootItem> {
    rules5e::add_items(&mut state.inventory, entries, language_code, stamp)
}

/// Why changing gear failed, as a translatable error.
fn gear_error(problem: rules5e::GearError) -> String {
    match problem {
        rules5e::GearError::InCombat => crate::err!("backend.stage.inCombat"),
        rules5e::GearError::ItemMissing => crate::err!("backend.stage.itemMissing"),
        rules5e::GearError::CannotEquip => crate::err!("backend.stage.cannotEquip"),
        rules5e::GearError::NotProficient => crate::err!("backend.stage.notProficient"),
    }
}

/// A party member puts on gear from the inventory; what comes off goes back into it.
pub fn equip_item(
    state: &mut SceneState,
    member_id: &str,
    inventory_id: &str,
) -> Result<(), String> {
    rules5e::equip_item(
        &mut state.table(),
        member_id,
        inventory_id,
        &reply_code(),
        Utc::now().timestamp_micros(),
    )
    .map_err(gear_error)
}

/// A party member takes gear off; it goes into the inventory.
pub fn unequip_item(state: &mut SceneState, member_id: &str, srd_id: &str) -> Result<(), String> {
    rules5e::unequip_item(
        &mut state.table(),
        member_id,
        srd_id,
        &reply_code(),
        Utc::now().timestamp_micros(),
    )
    .map_err(gear_error)
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
    super::combat5e::rest_party(&mut next, true, &mut rand::rng());
    next.definition.last_played = Some(Utc::now().to_rfc3339());
    engine.set_state(next.clone());
    save_scene_state(&next)?;
    Ok(next)
}

/// Moves the party to another map: its start zone, fog fresh.
pub fn change_map(state: &mut SceneState, map_id: &str) -> Option<ExploreEvent> {
    rules5e::change_map(&mut state.table(), map_id)
}

/// The prepared encounter of a room starts: its monsters on its zone.
pub(super) fn start_prepared<R: Rng + ?Sized>(
    state: &mut SceneState,
    encounter: &rules5e::MapEncounter,
    language_code: &str,
    stamp: i64,
    rng: &mut R,
) -> bool {
    rules5e::mark_prepared(&mut state.map, encounter);
    super::combat5e::start_requests(
        state,
        &rules5e::prepared_enemies(encounter),
        language_code,
        &encounter.zone,
        false,
        stamp,
        rng,
    )
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
    let here = rules5e::leader_index(&state.combat)
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
        rules5e::push_explore_events(&mut state.exploration, vec![event]);
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
        let started = start_prepared(
            state,
            &prepared,
            language_code,
            Utc::now().timestamp_millis(),
            &mut rand::rng(),
        );
        if started {
            rules5e::push_explore_events(
                &mut state.exploration,
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
        Utc::now().timestamp_millis(),
        &mut rand::rng(),
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
    let reply_language = crate::modules::content_lang::ContentLang::reply_language_name();
    let lang_code = crate::modules::content_lang::language_code(&reply_language);
    let before = state.clone();
    let (mut events, stop) = apply(
        &mut state,
        action,
        &mut rand::rng(),
        &lang_code,
        Utc::now().timestamp_micros(),
    )
    .ok_or_else(|| crate::err!("backend.stage.invalidAction"))?;
    engine.push_snapshot(&state.definition.id, before);

    let mut fight = false;
    match stop {
        Some(Stop::Exit(to)) => {
            events.extend(change_map(&mut state, &to));
            events.extend(reach_goal(&mut state, "exit", &to));
        }
        Some(Stop::Encounter(encounter)) => {
            if start_prepared(
                &mut state,
                &encounter,
                &lang_code,
                Utc::now().timestamp_millis(),
                &mut rand::rng(),
            ) {
                events.push(ExploreEvent::Encounter {
                    encounter_id: encounter.id.clone(),
                });
                fight = true;
            }
        }
        Some(Stop::Trap) | None => {}
    }
    let facts = report(&events, &state);
    rules5e::push_explore_events(&mut state.exploration, events);
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

    fn apply(
        state: &mut SceneState,
        action: ExploreAction,
    ) -> Option<(Vec<ExploreEvent>, Option<Stop>)> {
        super::apply(
            state,
            action,
            &mut rand::rng(),
            "en",
            Utc::now().timestamp_micros(),
        )
    }

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

    use rules5e::GridPos;

    fn seen(state: &SceneState, x: i32, y: i32) -> bool {
        rules5e::is_revealed(state.map.as_ref().unwrap(), GridPos::new(x, y))
    }

    fn leader(state: &SceneState) -> GridPos {
        state.combat.combatants[rules5e::leader_index(&state.combat).unwrap()]
            .position
            .unwrap()
    }

    #[test]
    fn the_party_starts_in_the_antechamber_and_sees_only_it() {
        let state = crypt();
        assert!(exploring(&state));
        let positions = rules5e::party_positions(&state.combat);
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
        let mut party_before = rules5e::party_positions(&state.combat);
        party_before.sort();
        assert!(start_prepared(
            &mut state,
            &encounter,
            "en",
            0,
            &mut rand::rng()
        ));
        assert!(state.combat.is_active);
        let mut party_after = rules5e::party_positions(&state.combat);
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
            rules5e::party_positions(&state.combat)
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
        assert!(
            rules5e::party_positions(&state.combat)
                .iter()
                .all(|p| map.walkable(*p))
        );
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
        assert!(start_prepared(
            &mut state,
            &encounter,
            "de",
            0,
            &mut rand::rng()
        ));
        // The fight is won: the goal is reached, the act not yet.
        for c in state
            .combat
            .combatants
            .iter_mut()
            .filter(|c| rules5e::is_enemy(c))
        {
            c.hp = 0;
        }
        won_fight(&mut state, "en", 0);
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
        assert!(start_prepared(
            &mut state,
            &encounter,
            "de",
            0,
            &mut rand::rng()
        ));
        assert!(
            equip_item(&mut state, &finn, "nothing").is_err(),
            "no changing gear mid-fight"
        );
        won_fight(&mut state, "en", 0);
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
