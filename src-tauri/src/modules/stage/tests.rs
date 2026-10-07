use super::*;

#[test]
fn test_dice_parser_simple() {
    let res = roll_dice("1d20", None, None).unwrap();
    assert_eq!(res.dice_count, 1);
    assert_eq!(res.die_faces, 20);
    assert_eq!(res.modifier, 0);
    assert_eq!(res.individual_rolls.len(), 1);
    assert!(res.sum >= 1 && res.sum <= 20);
}

#[test]
fn test_dice_parser_with_modifier() {
    let res = roll_dice("2d6+4", None, None).unwrap();
    assert_eq!(res.dice_count, 2);
    assert_eq!(res.die_faces, 6);
    assert_eq!(res.modifier, 4);
    assert!(res.sum >= 6 && res.sum <= 16);
}

#[test]
fn test_dice_parser_with_negative_modifier() {
    let res = roll_dice("3d8-2", None, None).unwrap();
    assert_eq!(res.dice_count, 3);
    assert_eq!(res.die_faces, 8);
    assert_eq!(res.modifier, -2);
    assert!(res.sum >= 1 && res.sum <= 22);
}

#[test]
fn test_dc_check() {
    let res = roll_dice("1d20+5", Some(15), None).unwrap();
    assert!(res.dc_check.is_some());
    let dc = res.dc_check.unwrap();
    assert_eq!(dc.target_dc, 15);
    assert_eq!(dc.passed, res.sum >= 15 || res.is_critical_success);
}

#[test]
fn test_json_repair_valid() {
    let json = r#"{"narration_plan": "The corridor opens into a hall.", "next_actor": "PLAYER"}"#;
    let plan = repair_and_parse_gm_plan(json);
    assert_eq!(plan.narration_plan, "The corridor opens into a hall.");
    assert_eq!(plan.next_actor.as_deref(), Some("PLAYER"));
}

#[test]
fn test_json_repair_fences_and_trailing_commas() {
    let raw =
        "```json\n{\n  \"narration_plan\": \"Test Beat\",\n  \"next_actor\": \"Ayu\",\n}\n```";
    let plan = repair_and_parse_gm_plan(raw);
    assert_eq!(plan.narration_plan, "Test Beat");
    assert_eq!(plan.next_actor.as_deref(), Some("Ayu"));
}

#[test]
fn test_json_repair_unbalanced_braces() {
    let raw = "{\n  \"narration_plan\": \"Truncated plan without closing brace\"";
    let plan = repair_and_parse_gm_plan(raw);
    assert_eq!(plan.narration_plan, "Truncated plan without closing brace");
}

#[test]
fn test_stage_turn_request_accepts_frontend_and_legacy_fields() {
    let frontend: StageTurnRequest = serde_json::from_str(
        r#"{
        "scene_id":"scene", "user_input":"Hallo", "turn_mode":"whisper",
        "whisper_target":"Ayu", "force_next_actor":"Ayu"
    }"#,
    )
    .unwrap();
    assert_eq!(frontend.user_input, "Hallo");
    assert_eq!(frontend.whisper_target.as_deref(), Some("Ayu"));
    assert_eq!(frontend.force_next_actor.as_deref(), Some("Ayu"));

    let legacy: StageTurnRequest = serde_json::from_str(
        r#"{
        "scene_id":"scene", "player_input":"Alt", "target_actor":"NPC"
    }"#,
    )
    .unwrap();
    assert_eq!(legacy.user_input, "Alt");
    assert_eq!(legacy.whisper_target.as_deref(), Some("NPC"));
}

#[test]
fn test_stage_engine_clocks_and_combat() {
    let engine = StageEngine::new();
    let state = engine.get_state();
    assert_eq!(state.clocks.len(), 2);
    assert_eq!(state.combat.combatants.len(), 3);

    // Advance clock
    engine.set_clock_progress("clock_1", 4);
    let updated = engine.get_state();
    let clock = updated.clocks.iter().find(|c| c.id == "clock_1").unwrap();
    assert_eq!(clock.current, 4);

    // Start encounter
    engine.start_encounter();
    let combat_st = engine.get_state();
    assert!(combat_st.combat.is_active);
    // Ayu has highest initiative (19), so she should be first
    assert_eq!(combat_st.combat.combatants[0].name, "Ayu Ikue");

    // Next turn
    engine.next_turn();
    let turn2 = engine.get_state();
    assert_eq!(turn2.combat.current_turn_index, 1);
    assert_eq!(turn2.combat.combatants[1].name, "Hiroki");

    let delayed = engine.delay_turn().unwrap();
    assert_eq!(delayed.combat.combatants[1].name, "Shadow stalker");
    assert_eq!(delayed.combat.combatants[2].name, "Hiroki");

    // Damage calculation
    engine.apply_combatant_delta("comb_enemy_1", -10, 5);
    let dmg_st = engine.get_state();
    let enemy = dmg_st
        .combat
        .combatants
        .iter()
        .find(|c| c.id == "comb_enemy_1")
        .unwrap();
    assert_eq!(enemy.hp, 18);
    assert_eq!(enemy.stress, 5);
}

#[test]
fn test_undo_snapshot() {
    let engine = StageEngine::new();
    let initial_st = engine.get_state();
    engine.push_snapshot(&initial_st.definition.id, initial_st.clone());

    // Modify world location
    let mut modified = initial_st.clone();
    modified.world.location = "Tiefster Dungeon".to_string();
    engine.set_state(modified);
    assert_eq!(engine.get_state().world.location, "Tiefster Dungeon");

    // Undo
    let reverted = engine.undo_turn(&initial_st.definition.id).unwrap();
    assert_eq!(reverted.world.location, "The order's old library");
}

#[test]
fn test_folders_and_adventure_default_presence() {
    let folders = list_stage_folders().unwrap();
    assert!(folders.contains(&ADVENTURE_FOLDER.to_string()));
    assert!(folders.contains(&"Eigene Szenen".to_string()));

    let scenes = scan_available_scenes();
    let acts: Vec<_> = scenes
        .iter()
        .filter(|s| s.folder == ADVENTURE_FOLDER)
        .collect();
    assert_eq!(acts.len(), 3, "Das Startabenteuer hat drei Akte");
}

#[test]
fn test_edit_and_delete_stage_message() {
    let engine = StageEngine::new();
    let st = engine.get_state();
    let scene_id = &st.definition.id;

    // Edit message
    let edited = edit_stage_turn_message_with_saver(
        &engine,
        scene_id,
        "msg_init",
        "Neuer Text für Begrüßung",
        |_| Ok(()),
    )
    .unwrap();
    assert_eq!(edited.chat_log[0].content, "Neuer Text für Begrüßung");

    // Delete message
    let deleted =
        delete_stage_turn_message_with_saver(&engine, scene_id, "msg_init", |_| Ok(())).unwrap();
    assert!(deleted.chat_log.is_empty());
}

#[test]
fn test_get_stage_background_image() {
    // Release builds bring no backgrounds; a picture in a searched folder is enough.
    let dir = std::path::PathBuf::from("assets/backgrounds");
    let created_dir = !dir.exists();
    std::fs::create_dir_all(&dir).unwrap();
    let name = "Stage Test Background.png";
    let png = base64::prelude::BASE64_STANDARD
        .decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==")
        .unwrap();
    std::fs::write(dir.join(name), png).unwrap();
    let bg = get_stage_background_image(name);
    let _ = std::fs::remove_file(dir.join(name));
    if created_dir {
        let _ = std::fs::remove_dir("assets/backgrounds");
        let _ = std::fs::remove_dir("assets");
    }
    assert!(bg.is_ok(), "Should find the background image");
    assert!(bg.unwrap().starts_with("data:image/"));
    assert!(get_stage_background_image("Gibt es nicht.png").is_err());
}

#[test]
fn scene_editor_preserves_progress_and_original_metadata() {
    let mut state = StageEngine::new().get_state();
    state.definition.folder = "Kampagne".into();
    state.definition.created_at = "original".into();
    state.current_bg = Some("current.png".into());
    state.world.location = "Reached location".into();
    state.npcs.push(StageNpc {
        id: "npc-test".into(),
        extensions: serde_json::Value::Null,
        name: "Liora".into(),
        archetype: "merchant".into(),
        personality: String::new(),
        active: true,
        turn_count: 2,
        memories: vec![StageNpcMemory {
            message_id: "source".into(),
            text: "Remember me".into(),
        }],
        promoted_character_id: None,
    });
    ensure_party_vitals(&mut state);
    let before = serde_json::to_value(&state).unwrap();
    let mut definition = state.definition.clone();
    definition.id = "foreign".into();
    definition.folder = "foreign".into();
    definition.created_at = "foreign".into();
    definition.title = "New title".into();
    definition.starting_location = "New start".into();
    definition.starting_bg = "start.png".into();
    definition.starting_ambient = "wind.ogg".into();
    definition.max_actor_depth = 99;
    update_scene_definition(&mut state, definition);
    assert_eq!(state.definition.max_actor_depth, 6);
    assert_eq!(state.definition.id, before["definition"]["id"]);
    assert_eq!(state.definition.folder, "Kampagne");
    assert_eq!(state.definition.created_at, "original");
    let after = serde_json::to_value(&state).unwrap();
    for key in [
        "chat_log",
        "combat",
        "world",
        "current_bg",
        "npcs",
        "clocks",
        "arcs",
        "inventory",
        "objectives",
        "relationships",
        "private_knowledge",
        "consequence_ledger",
    ] {
        assert_eq!(before[key], after[key], "Editor changed progress: {key}");
    }
    let reset = build_initial_scene_state(&state.definition);
    assert_eq!(reset.world.location, "New start");
    assert_eq!(reset.current_bg.as_deref(), Some("start.png"));
    assert_eq!(reset.definition.starting_ambient, "wind.ogg");
}

#[test]
fn scene_asset_import_rejects_non_media_and_unknown_kind() {
    assert!(import_stage_asset("Cargo.toml", "ambient").is_err());
    assert!(import_stage_asset("Cargo.toml", "../config").is_err());
}

#[test]
fn ambient_follows_the_editor_until_the_planner_switches_it() {
    assert_eq!(ambient_name("None"), None);
    assert_eq!(ambient_name("  "), None);
    assert_eq!(ambient_name("wind.ogg").as_deref(), Some("wind.ogg"));

    let mut state = StageEngine::new().get_state();
    state.definition.starting_ambient = "None".into();
    state.current_ambient = None;
    let mut definition = state.definition.clone();
    definition.starting_ambient = "wind.ogg".into();
    update_scene_definition(&mut state, definition);
    assert_eq!(state.current_ambient.as_deref(), Some("wind.ogg"));

    // The planner picked another sound: an editor change no longer overrides it.
    state.current_ambient = Some("battle.mp3".into());
    let mut definition = state.definition.clone();
    definition.starting_ambient = "rain.ogg".into();
    update_scene_definition(&mut state, definition);
    assert_eq!(state.current_ambient.as_deref(), Some("battle.mp3"));
}

#[test]
fn ambient_lookup_rejects_paths_and_other_files() {
    assert!(stage_ambient_data_url("../secret.wav").is_err());
    assert!(stage_ambient_data_url("notes.txt").is_err());
    assert!(stage_ambient_data_url("missing-file.ogg").is_err());
}

#[test]
fn test_dice_errors_are_translatable_codes() {
    for formula in ["1d20+Schleichen", "xd6", "2dx", ""] {
        let error = roll_dice(formula, None, None).unwrap_err();
        assert!(error.contains("backend.stage.dice"), "{formula}: {error}");
    }
}
