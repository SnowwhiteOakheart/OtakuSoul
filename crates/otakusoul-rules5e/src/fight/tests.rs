use super::*;
use crate::*;
use rand::{SeedableRng, rngs::StdRng};

fn hero(id: &str, name: &str, role: &str) -> Combatant {
    Combatant {
        id: id.into(),
        name: name.into(),
        role: role.into(),
        hp: 10,
        max_hp: 10,
        stress: 0,
        max_stress: 0,
        initiative: 0,
        conditions: Vec::new(),
        skills: std::collections::HashMap::new(),
        stats5e: None,
        position: None,
    }
}

pub(crate) fn table_with_party(map_id: Option<&str>) -> TableState {
    let mut state = TableState {
        rules: Some(SceneRules {
            ruleset: "5e".into(),
            map_id: map_id.map(str::to_string),
            ..Default::default()
        }),
        party: vec!["Lyra".into(), "Finn".into()],
        ..Default::default()
    };
    state.combat.combatants = vec![
        hero("player", "Hiroki", "player"),
        hero("companion_0", "Lyra", "companion"),
        hero("companion_1", "Finn", "companion"),
    ];
    ensure_party_stats(&mut state.table(), |_| None);
    state
}

fn goblins(count: u32) -> Vec<EnemyRequest> {
    vec![EnemyRequest {
        monster: "goblin".into(),
        count: Some(count),
    }]
}

fn class_of(state: &TableState, name: &str) -> String {
    state
        .combat
        .combatants
        .iter()
        .find(|c| c.name == name)
        .and_then(|c| c.stats5e.as_ref())
        .map(|s| s.class_id.clone())
        .unwrap()
}

#[test]
fn heroes_get_classes_from_the_scene_the_card_or_their_place() {
    let mut state = table_with_party(None);
    assert_eq!(class_of(&state, "Hiroki"), "fighter");
    assert_eq!(class_of(&state, "Lyra"), "cleric");
    assert_eq!(class_of(&state, "Finn"), "rogue");
    // A hero keeps the class they joined with; the scene's choice wins.
    state
        .rules
        .as_mut()
        .unwrap()
        .hero_classes
        .insert("finn".into(), "wizard".into());
    ensure_party_stats(&mut state.table(), |_| Some("fighter".into()));
    assert_eq!(class_of(&state, "Finn"), "wizard");
    assert_eq!(class_of(&state, "Lyra"), "cleric");
    // The card is asked only for a companion without a class.
    let mut fresh = table_with_party(None);
    fresh.combat.combatants[2].stats5e = None;
    ensure_party_stats(&mut fresh.table(), |name| {
        (name == "Finn").then(|| "wizard".to_string())
    });
    assert_eq!(class_of(&fresh, "Finn"), "wizard");
    assert_eq!(
        card_class(&serde_json::json!({"otakusoul_5e": {"class": "rogue"}})).as_deref(),
        Some("rogue")
    );
    assert_eq!(
        card_class(&serde_json::json!({"otakusoul_5e": {"class": "bard"}})),
        None
    );
}

#[test]
fn starting_reports_unknown_monsters_and_trims_made_up_groups() {
    let mut state = table_with_party(None);
    let mut rng = StdRng::seed_from_u64(1);
    let mut enemies = goblins(8);
    enemies.insert(
        0,
        EnemyRequest {
            monster: "dragon".into(),
            count: None,
        },
    );
    let report = start_encounter_at(
        &mut state.table(),
        &enemies,
        "de",
        "spawn",
        true,
        42,
        &mut rng,
    );
    assert!(report.started);
    assert_eq!(report.unknown, ["dragon"]);
    let (before, after) = report.trimmed.expect("eight goblins are far too many");
    assert_eq!(before, 8);
    let foes: Vec<_> = state
        .combat
        .combatants
        .iter()
        .filter(|c| is_enemy(c))
        .collect();
    assert_eq!(foes.len(), after);
    assert!(foes.iter().all(|c| c.id.starts_with("enemy_42_")));
    assert!(matches!(
        state.combat.events.as_slice(),
        [
            CombatEvent::Initiative { .. },
            CombatEvent::TurnStart { .. }
        ]
    ));
    let none = start_encounter_at(
        &mut state.table(),
        &[EnemyRequest {
            monster: "dragon".into(),
            count: None,
        }],
        "de",
        "spawn",
        true,
        43,
        &mut rng,
    );
    assert!(!none.started);
}

/// A fight without a board: the player attacks the first enemy, the engine plays the rest
/// (companions with their fallback) until the fight is decided.
fn fight_without_board(seed: u64) -> (Vec<CombatEvent>, TableState) {
    let mut state = table_with_party(None);
    let mut rng = StdRng::seed_from_u64(seed);
    assert!(
        start_encounter_at(
            &mut state.table(),
            &goblins(2),
            "en",
            "spawn",
            false,
            7,
            &mut rng
        )
        .started
    );
    let mut log = state.combat.events.clone();
    for _ in 0..200 {
        let mut t = state.table();
        let mut events = play_until_player(&mut t, &mut rng, |_, _| None);
        if combat_outcome(&t.combat.combatants).is_none() {
            let options = combat_options(t.combat, t.map.as_ref());
            let pick = options
                .actions
                .iter()
                .find(|a| a.id.starts_with("attack:"))
                .map_or("dodge".to_string(), |a| a.id.clone());
            let action = parse_player_action(t.combat, t.map.as_ref(), &pick)
                .expect("offered actions are valid");
            let (done, over) = apply_player_action(&mut t, action, &mut rng);
            events.extend(done);
            assert!(over, "without a board the action ends the turn");
            if combat_outcome(&t.combat.combatants).is_none() {
                events.extend(next_turn(&mut t, &mut rng));
            }
        }
        let outcome = record_round(t.combat, &mut events);
        log.extend(events);
        if outcome.is_some() {
            end_encounter(&mut t);
            break;
        }
    }
    (log, state)
}

#[test]
fn a_fight_plays_to_its_end_the_same_way_for_the_same_seed() {
    let (log, state) = fight_without_board(5);
    assert!(matches!(log.last(), Some(CombatEvent::CombatEnd { .. })));
    assert!(log.iter().any(|e| matches!(e, CombatEvent::Attack { .. })));
    assert!(!state.combat.is_active);
    assert!(state.combat.combatants.iter().all(is_party));
    let (again, _) = fight_without_board(5);
    assert_eq!(log, again);
}

#[test]
fn a_companion_choice_falls_back_to_the_engine() {
    let mut state = table_with_party(None);
    let mut rng = StdRng::seed_from_u64(3);
    start_encounter_at(
        &mut state.table(),
        &goblins(1),
        "en",
        "spawn",
        false,
        1,
        &mut rng,
    );
    state.combat.current_turn_index = state
        .combat
        .combatants
        .iter()
        .position(|c| c.name == "Finn")
        .unwrap();
    begin_turn(&mut state.table());
    let EnginePlan::Choice(choice) = engine_plan(&state.combat, state.map.as_ref()) else {
        panic!("a companion chooses");
    };
    let fallback = choice.fallback.clone();
    assert!(choice.options.iter().any(|o| o.id == "dodge"));
    assert_eq!(
        choice.clone().pick(Some("dodge")),
        PlannedTurn::InPlace(TurnDecision::Dodge)
    );
    assert_eq!(choice.clone().pick(Some("fly away")), fallback);
    assert_eq!(choice.pick(None), fallback);
    // Monsters never ask.
    let goblin = state.combat.combatants.iter().position(is_enemy).unwrap();
    state.combat.current_turn_index = goblin;
    assert!(matches!(
        engine_plan(&state.combat, state.map.as_ref()),
        EnginePlan::Decided(PlannedTurn::InPlace(_))
    ));
}

#[test]
fn on_a_board_fighters_are_placed_and_move() {
    let mut state = table_with_party(Some("crypt_hall"));
    let mut rng = StdRng::seed_from_u64(9);
    assert!(
        start_encounter_at(
            &mut state.table(),
            &goblins(2),
            "en",
            "spawn",
            false,
            1,
            &mut rng
        )
        .started
    );
    let map = state.map.clone().expect("the scene's map is loaded");
    for c in &state.combat.combatants {
        let zone = map.cell(c.position.unwrap()).unwrap().zone.clone();
        let wanted = if is_party(c) { "party" } else { "spawn" };
        assert_eq!(zone.as_deref(), Some(wanted), "{}", c.name);
    }
    let player = state
        .combat
        .combatants
        .iter()
        .position(|c| c.role == "player")
        .unwrap();
    state.combat.current_turn_index = player;
    begin_turn(&mut state.table());
    let options = combat_options(&state.combat, state.map.as_ref());
    let square = options.reachable.first().expect("room to move");
    let text = format!("move:{}:{}", square.x, square.y);
    let action = parse_player_action(&state.combat, state.map.as_ref(), &text).unwrap();
    let (events, over) = apply_player_action(&mut state.table(), action, &mut rng);
    assert!(!over && matches!(events.first(), Some(CombatEvent::Move { .. })));
    assert_eq!(
        state.combat.turn.movement_left_ft,
        options.movement_left_ft - square.feet
    );
    assert_eq!(
        parse_player_action(&state.combat, state.map.as_ref(), "end_turn"),
        Some(PlayerAction::EndTurn)
    );
}

#[test]
fn a_companion_choice_on_a_board_plays_the_chosen_attack() {
    let mut state = table_with_party(Some("crypt_hall"));
    let mut rng = StdRng::seed_from_u64(11);
    start_encounter_at(
        &mut state.table(),
        &goblins(1),
        "en",
        "spawn",
        false,
        1,
        &mut rng,
    );
    let finn = state
        .combat
        .combatants
        .iter()
        .position(|c| c.name == "Finn")
        .unwrap();
    let goblin = state.combat.combatants.iter().position(is_enemy).unwrap();
    // The goblin stands right next to Finn.
    let at = state.combat.combatants[finn].position.unwrap();
    let map = state.map.clone().unwrap();
    let taken: Vec<GridPos> = state
        .combat
        .combatants
        .iter()
        .filter_map(|c| c.position)
        .collect();
    let next = [
        (1, 0),
        (-1, 0),
        (0, 1),
        (0, -1),
        (1, 1),
        (-1, -1),
        (1, -1),
        (-1, 1),
    ]
    .into_iter()
    .map(|(dx, dy)| GridPos::new(at.x + dx, at.y + dy))
    .find(|p| map.walkable(*p) && !taken.contains(p))
    .expect("a free square next to Finn");
    state.combat.combatants[goblin].position = Some(next);
    state.combat.current_turn_index = finn;
    begin_turn(&mut state.table());
    let EnginePlan::Choice(choice) = engine_plan(&state.combat, state.map.as_ref()) else {
        panic!("Finn chooses how to attack");
    };
    let option = choice
        .options
        .iter()
        .find(|o| o.id.starts_with("attack:"))
        .expect("an attack on the goblin")
        .clone();
    let PlannedTurn::Board(plan) = choice.clone().pick(Some(&option.id)) else {
        panic!("a board plan");
    };
    assert_eq!(
        plan.action,
        TurnDecision::Attack {
            attack_id: option.attack_id.clone().unwrap(),
            target_id: option.target_id.clone().unwrap(),
        }
    );
    assert_eq!(choice.clone().pick(Some("nothing")), choice.fallback);
    let events = play_turn(&mut state.table(), PlannedTurn::Board(plan), &mut rng);
    assert!(
        events
            .iter()
            .any(|e| matches!(e, CombatEvent::Attack { .. }))
    );
}

#[test]
fn the_fight_log_keeps_the_newest_events() {
    let mut combat = EncounterState {
        events: (0..MAX_COMBAT_EVENTS)
            .map(|i| CombatEvent::Pass {
                actor_id: i.to_string(),
                actor_name: String::new(),
            })
            .collect(),
        ..Default::default()
    };
    let mut events = vec![CombatEvent::Pass {
        actor_id: "new".into(),
        actor_name: String::new(),
    }];
    // Nobody against the party any more: the fight is won and says so.
    assert_eq!(
        record_round(&mut combat, &mut events),
        Some(CombatOutcome::Victory)
    );
    assert_eq!(events.len(), 2);
    assert_eq!(combat.events.len(), MAX_COMBAT_EVENTS);
    assert!(matches!(&combat.events[0], CombatEvent::Pass { actor_id, .. } if actor_id == "2"));
    assert!(matches!(
        combat.events.last(),
        Some(CombatEvent::CombatEnd {
            outcome: CombatOutcome::Victory
        })
    ));
}
