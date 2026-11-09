//! Golden test of the deterministic 5e flow (fights and exploring): a scripted adventure with
//! a fixed seed runs through the desktop entry points and every result is compared with the
//! checked-in snapshot `golden5e_snapshot.json`. It guards moving the flow into the shared
//! crate `otakusoul-rules5e`: the snapshot must stay byte-identical.
//!
//! Renew the snapshot only on purpose (behavior change):
//! `OTAKUSOUL_BLESS_GOLDEN=1 cargo test --manifest-path src-tauri/Cargo.toml golden5e`.

use super::combat5e::{
    apply_player_action, combat_options, end_encounter, engine_turn, next_turn,
    parse_player_action, player_controls, rest_party, start_encounter_at,
};
use super::explore5e::{
    Stop, apply, change_map, ensure_exploring, parse_action, reach_goal, refresh_fog,
    start_prepared, won_fight,
};
use super::rules5e::{self, CombatOutcome, GridPos};
use super::*;
use rand::{SeedableRng, rngs::StdRng};
use serde_json::{Value, json};

const SNAPSHOT: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/src/modules/stage/golden5e_snapshot.json"
);
/// Fixed "clock" for new ids (enemies, inventory entries).
const STAMP: i64 = 1_700_000_000_000;

fn to_json<T: Serialize>(value: &T) -> Value {
    canonical(serde_json::to_value(value).expect("serializable"))
}

/// Sorted object keys: hash maps (`resources_used`, `skills`, `legend`) have no stable order.
fn canonical(value: Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut entries: Vec<(String, Value)> = map.into_iter().collect();
            entries.sort_by(|a, b| a.0.cmp(&b.0));
            Value::Object(
                entries
                    .into_iter()
                    .map(|(k, v)| (k, canonical(v)))
                    .collect(),
            )
        }
        Value::Array(items) => Value::Array(items.into_iter().map(canonical).collect()),
        other => other,
    }
}

/// The parts of the scene the 5e flow changes.
fn table_json(state: &SceneState) -> Value {
    json!({
        "combat": to_json(&state.combat),
        "map": to_json(&state.map),
        "inventory": to_json(&state.inventory),
        "exploration": to_json(&state.exploration),
        "objectives": to_json(&state.objectives),
    })
}

/// A 5e scene with the player (cleric) and two companions (wizard, rogue), all level 2.
fn scene(map_id: Option<&str>) -> SceneState {
    let mut state = StageEngine::new().get_state();
    state.definition.party = vec!["Lyra".into(), "Finn".into()];
    state.definition.rules = Some(SceneRules {
        ruleset: "5e".into(),
        hero_classes: HashMap::from([
            ("player".to_string(), "cleric".to_string()),
            ("Lyra".to_string(), "wizard".to_string()),
            ("Finn".to_string(), "rogue".to_string()),
        ]),
        control_companions: false,
        heroic_death: false,
        map_id: map_id.map(str::to_string),
        goals: vec![
            SceneGoal {
                id: "goal_hall".into(),
                title: rules5e::LocalizedName {
                    de: "Halle".into(),
                    en: "Hall".into(),
                    ru: "Зал".into(),
                },
                kind: "encounter".into(),
                target: "hall_goblins".into(),
            },
            SceneGoal {
                id: "goal_depths".into(),
                title: rules5e::LocalizedName {
                    de: "Tiefe".into(),
                    en: "Depths".into(),
                    ru: "Глубины".into(),
                },
                kind: "exit".into(),
                target: "shadow_sanctum".into(),
            },
        ],
        next_scene: Some("next_act".into()),
    });
    state.objectives = ["goal_hall", "goal_depths"]
        .iter()
        .map(|id| CampaignObjective {
            id: id.to_string(),
            title: id.to_string(),
            description: String::new(),
            current: 0,
            max: 1,
            status: "active".into(),
        })
        .collect();
    state.inventory.clear();
    state.exploration.clear();
    state.map = None;
    state.combat.combatants.retain(|c| c.role == "player");
    ensure_party_vitals(&mut state);
    for hero in state
        .combat
        .combatants
        .iter_mut()
        .filter(|c| rules5e::is_party(c))
    {
        rules5e::level_up(hero, 2);
    }
    state
}

/// The scripted player: heal when low, Turn Undead, Sacred Flame, attack, close in, Dodge,
/// end the turn – always picked from the offered options.
fn player_choice(state: &SceneState) -> String {
    let options = combat_options(state);
    let me = &state.combat.combatants[state.combat.current_turn_index];
    if !options.bonus_action_used
        && me.hp * 2 < me.max_hp
        && options
            .spells
            .iter()
            .any(|s| s.spell_id == "healing_word" && s.targets.contains(&me.id))
    {
        return format!("cast:healing_word:1:{}", me.id);
    }
    if !options.action_used {
        if options.features.iter().any(|f| f.id == "turn_undead") {
            return "feature:turn_undead".into();
        }
        if let Some(target) = options
            .spells
            .iter()
            .find(|s| s.spell_id == "sacred_flame")
            .and_then(|s| s.targets.first())
        {
            return format!("cast:sacred_flame:0:{target}");
        }
        if let Some(attack) = options.actions.iter().find(|a| a.id.starts_with("attack:")) {
            return attack.id.clone();
        }
    }
    if let Some(here) = me.position {
        let foes: Vec<GridPos> = state
            .combat
            .combatants
            .iter()
            .filter(|c| rules5e::is_enemy(c) && rules5e::is_up(c))
            .filter_map(|c| c.position)
            .collect();
        let distance = |p: GridPos| foes.iter().map(|f| p.squares_to(*f)).min();
        if let Some(best) = options
            .reachable
            .iter()
            .min_by_key(|s| (distance(GridPos::new(s.x, s.y)), s.feet))
            && distance(GridPos::new(best.x, best.y)) < distance(here)
        {
            return format!("move:{}:{}", best.x, best.y);
        }
    }
    if !options.action_used && options.actions.iter().any(|a| a.id == "dodge") {
        return "dodge".into();
    }
    "end_turn".into()
}

/// Plays a started fight to its end like `finish_round` (scripted player, engine and
/// companions without a language model), then closes it like the desktop does.
fn fight(state: &mut SceneState, rng: &mut StdRng, label: &str) -> Value {
    let inference = InferenceClient::new();
    // An aborted client makes companions take the engine's fallback without a model.
    inference.abort();
    let llm = StageLlm {
        endpoint_url: String::new(),
        api_key: None,
        model: None,
        provider: None,
    };
    let runtime = tokio::runtime::Builder::new_current_thread()
        .build()
        .expect("runtime");
    let mut log = vec![json!({ "start": to_json(&state.combat.events) })];
    let mut options_seen = false;
    for _ in 0..300 {
        if rules5e::combat_outcome(&state.combat.combatants).is_some() {
            break;
        }
        let actor = state.combat.combatants[state.combat.current_turn_index].clone();
        if player_controls(state, &actor) {
            if !options_seen {
                options_seen = true;
                log.push(json!({ "options": to_json(&combat_options(state)) }));
            }
            let choice = player_choice(state);
            let Some(action) = parse_player_action(state, &choice) else {
                log.push(json!({ "invalid": choice }));
                break;
            };
            let (events, over) = apply_player_action(state, action, rng);
            log.push(json!({
                "player": choice,
                "turn_over": over,
                "events": to_json(&events),
            }));
            if rules5e::combat_outcome(&state.combat.combatants).is_none() && over {
                log.push(json!({ "next": to_json(&next_turn(state, rng)) }));
            }
        } else {
            let events = runtime.block_on(engine_turn(state, &inference, &llm, rng));
            log.push(json!({ "engine": actor.id, "events": to_json(&events) }));
            if rules5e::combat_outcome(&state.combat.combatants).is_some() {
                break;
            }
            let next = next_turn(state, rng);
            log.push(json!({ "next": to_json(&next) }));
            if next.is_empty() {
                break;
            }
        }
    }
    let outcome = rules5e::combat_outcome(&state.combat.combatants);
    log.push(json!({ "outcome": to_json(&outcome) }));
    if outcome == Some(CombatOutcome::Victory) {
        won_fight(state, "en", STAMP + 1);
    }
    end_encounter(state, outcome);
    refresh_fog(state);
    json!({ "fight": label, "log": log, "after": to_json(&state.combat) })
}

/// One exploration action; a prepared encounter it runs into starts and is fought out.
fn explore(state: &mut SceneState, rng: &mut StdRng, action: &str, steps: &mut Vec<Value>) {
    let parsed = parse_action(action).expect("valid action text");
    let Some((events, stop)) = apply(state, parsed, rng, "en", STAMP + 2) else {
        steps.push(json!({ "explore": action, "result": null }));
        return;
    };
    let stop_text = match &stop {
        None => Value::Null,
        Some(Stop::Trap) => json!("trap"),
        Some(Stop::Exit(to)) => json!(format!("exit:{to}")),
        Some(Stop::Encounter(e)) => json!(format!("encounter:{}", e.id)),
    };
    steps.push(json!({
        "explore": action,
        "events": to_json(&events),
        "stop": stop_text,
    }));
    match stop {
        Some(Stop::Exit(to)) => {
            let event = change_map(state, &to);
            let goals = reach_goal(state, "exit", &to);
            steps.push(json!({ "map_change": to_json(&event), "goals": to_json(&goals) }));
        }
        Some(Stop::Encounter(encounter)) => {
            let started = start_prepared(state, &encounter, "en", STAMP + 3, rng);
            steps.push(json!({ "prepared": encounter.id, "started": started }));
            if started {
                steps.push(fight(state, rng, &encounter.id));
            }
        }
        Some(Stop::Trap) | None => {}
    }
}

/// Repeats a lock action until the lock is gone (or `tries` run out).
fn work_lock(
    state: &mut SceneState,
    rng: &mut StdRng,
    action: &str,
    at: GridPos,
    tries: usize,
    steps: &mut Vec<Value>,
) {
    for _ in 0..tries {
        if !state
            .map
            .as_ref()
            .is_some_and(|m| m.locks.iter().any(|l| l.at == at))
        {
            return;
        }
        explore(state, rng, action, steps);
    }
}

fn run() -> Value {
    let mut rng = StdRng::seed_from_u64(0x5e);
    let mut steps = Vec::new();

    // Exploring the crypt: locked door, the ossuary and its dead, chest, trap, the hall.
    let mut state = scene(Some("crypt_hall"));
    steps.push(json!({
        "ensure_exploring": ensure_exploring(&mut state),
        "exploration": to_json(&state.exploration),
        "party": to_json(&state.combat.combatants),
    }));
    explore(&mut state, &mut rng, "use:4:5", &mut steps);
    work_lock(
        &mut state,
        &mut rng,
        "force:4:5",
        GridPos::new(4, 5),
        3,
        &mut steps,
    );
    work_lock(
        &mut state,
        &mut rng,
        "pick:4:5",
        GridPos::new(4, 5),
        20,
        &mut steps,
    );
    explore(&mut state, &mut rng, "move:4:6", &mut steps);
    explore(&mut state, &mut rng, "move:4:7", &mut steps);
    explore(&mut state, &mut rng, "move:3:8", &mut steps);
    explore(&mut state, &mut rng, "use:1:10", &mut steps);
    work_lock(
        &mut state,
        &mut rng,
        "pick:1:10",
        GridPos::new(1, 10),
        20,
        &mut steps,
    );
    // A trap nobody notices springs under the leader.
    if let Some(map) = state.map.as_mut() {
        for trap in &mut map.traps {
            trap.spot_dc = 99;
            trap.spotted = false;
        }
    }
    explore(&mut state, &mut rng, "move:2:9", &mut steps);
    explore(&mut state, &mut rng, "move:7:2", &mut steps);
    explore(&mut state, &mut rng, "use:8:2", &mut steps);
    explore(&mut state, &mut rng, "move:10:2", &mut steps);
    explore(&mut state, &mut rng, "use:99:99", &mut steps);
    steps.push(json!({ "short_rest": rest_party(&mut state, false, &mut rng) }));
    steps.push(json!({ "long_rest": rest_party(&mut state, true, &mut rng) }));
    if let Some(map) = state.map.as_mut() {
        map.revealed.fill(true);
    }
    explore(&mut state, &mut rng, "move:14:10", &mut steps);
    steps.push(json!({ "crypt_end": table_json(&state) }));

    // A fight without a board: wolves the game master made up (XP limit applies).
    let mut open = scene(None);
    let wolves = PlanCombatant {
        name: String::new(),
        monster: Some("wolf".into()),
        count: Some(3),
        hp: 0,
        role: "enemy".into(),
    };
    let started = start_encounter_at(&mut open, &[wolves], "de", "spawn", true, STAMP, &mut rng);
    steps.push(json!({ "open_fight_started": started }));
    if started {
        steps.push(fight(&mut open, &mut rng, "wolves"));
    }
    steps.push(json!({ "open_end": table_json(&open) }));
    json!({ "steps": steps })
}

#[test]
fn golden5e_flow_matches_the_snapshot() {
    let actual = serde_json::to_string_pretty(&run()).expect("json") + "\n";
    // Deterministic within one process as well (same seed, same result).
    let again = serde_json::to_string_pretty(&run()).expect("json") + "\n";
    assert!(actual == again, "the 5e flow is not deterministic");
    if std::env::var_os("OTAKUSOUL_BLESS_GOLDEN").is_some() {
        std::fs::write(SNAPSHOT, &actual).expect("write snapshot");
        return;
    }
    let expected = std::fs::read_to_string(SNAPSHOT)
        .expect("snapshot exists (OTAKUSOUL_BLESS_GOLDEN=1 creates it)")
        .replace("\r\n", "\n");
    if actual != expected {
        let line = actual
            .lines()
            .zip(expected.lines())
            .position(|(a, e)| a != e)
            .unwrap_or(actual.lines().count().min(expected.lines().count()));
        panic!(
            "5e flow differs from the snapshot at line {}:\n  actual:   {:?}\n  expected: {:?}",
            line + 1,
            actual.lines().nth(line),
            expected.lines().nth(line)
        );
    }
}
