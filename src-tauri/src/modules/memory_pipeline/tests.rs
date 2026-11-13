use super::*;

#[test]
fn router_answers_of_local_models_are_read_leniently() {
    // As Qwen 3.6 and Mistral Nemo answer: a list where a text belongs, numbers as strings.
    let parsed = parse_router_json(
        r##"{
          "character_memory_patch": {"core_identity_add": "Ein einzelner Glaubenssatz",
            "internal_state": {"primary_emotion": ["Freude"], "intensity": "4", "emotion_active": "true"}},
          "user_memory_patch": {"user_identity_status": {"known_attributes": ["Zog nach Hamburg.", "Mag den Hafen."]},
            "preferences_habits_add": null},
          "memory_supersede": [{"id": "#27", "reason": ["umgezogen"]}],
          "intentions_patch": {"resolve": [{"id": "9", "status": "fulfilled"}]}
        }"##,
    )
    .unwrap();
    let cp = parsed.character_memory_patch.unwrap();
    assert_eq!(cp.core_identity_add, ["Ein einzelner Glaubenssatz"]);
    let ist = cp.internal_state.unwrap();
    assert_eq!(
        (
            ist.primary_emotion.as_deref(),
            ist.intensity,
            ist.emotion_active
        ),
        (Some("Freude"), Some(4), Some(true))
    );
    let up = parsed.user_memory_patch.unwrap();
    assert_eq!(
        up.user_identity_status.unwrap().known_attributes.as_deref(),
        Some("Zog nach Hamburg.; Mag den Hafen.")
    );
    assert!(up.preferences_habits_add.is_empty());
    assert_eq!(
        (
            parsed.memory_supersede[0].id,
            parsed.memory_supersede[0].reason.as_str()
        ),
        (27, "umgezogen")
    );
    assert_eq!(parsed.intentions_patch.unwrap().resolve[0].id, 9);
}

#[test]
fn long_habit_lists_are_merged_only_when_asked() {
    let habits = |n: usize| {
        (0..n)
            .map(|i| format!("Gewohnheit {i}"))
            .collect::<Vec<_>>()
    };
    assert!(consolidation_task(&habits(HABITS_SOFT_CAP)).is_none());
    assert!(
        consolidation_task(&habits(HABITS_SOFT_CAP + 1))
            .unwrap()
            .contains("has 13 entries")
    );
    let list = |items: &[&str]| items.iter().map(|s| s.to_string()).collect::<Vec<_>>();
    let merged = list(&["Liebt süße Snacks", "Trinkt Tee", " ", "Joggt"]);
    assert_eq!(accept_habits_replace(false, &merged), None);
    assert_eq!(
        accept_habits_replace(true, &merged),
        Some(list(&["Liebt süße Snacks", "Trinkt Tee", "Joggt"]))
    );
    assert_eq!(
        accept_habits_replace(true, &habits(HABITS_SOFT_CAP + 1)),
        None
    );
    assert_eq!(accept_habits_replace(true, &[]), None);
    // One paragraph that swallowed everything (seen with Cydonia 24B) is no pattern list.
    assert_eq!(
        accept_habits_replace(true, &list(&["Mag Dango", "Trinkt Tee"])),
        None
    );
    let paragraph = "Mag süße Snacks. ".repeat(12);
    assert_eq!(
        accept_habits_replace(true, &list(&[&paragraph, "Trinkt Tee", "Joggt"])),
        None
    );
    let parsed = parse_router_json(
        r#"{"user_memory_patch": {"preferences_habits_replace": ["Liebt Dango"]}}"#,
    )
    .unwrap();
    assert_eq!(
        parsed.user_memory_patch.unwrap().preferences_habits_replace,
        ["Liebt Dango"]
    );
}

#[test]
fn the_router_can_plan_and_resolve_intentions() {
    let parsed = parse_router_json(
        r#"{"intentions_patch": {"create": [{"title": "Kochen", "time_basis": "real", "due": "2026-10-20"}], "resolve": [{"id": 4, "status": "fulfilled"}]}}"#,
    )
    .unwrap();
    let patch = parsed.intentions_patch.unwrap();
    assert_eq!(patch.create[0].due.as_deref(), Some("2026-10-20"));
    assert_eq!(patch.create[0].initiator, "");
    assert_eq!(
        (patch.resolve[0].id, patch.resolve[0].status.as_str()),
        (4, "fulfilled")
    );
    assert!(parse_router_json("{}").unwrap().intentions_patch.is_none());
}

#[test]
fn the_router_can_name_outdated_memories() {
    let parsed = parse_router_json(
        r#"{"memory_supersede": [{"id": 12, "reason": "umgezogen", "replaced_by_topic": "wohnort.md"}, {"id": 3}]}"#,
    )
    .unwrap();
    assert_eq!(parsed.memory_supersede.len(), 2);
    assert_eq!(
        parsed.memory_supersede[0].replaced_by_topic.as_deref(),
        Some("wohnort.md")
    );
    assert_eq!(parsed.memory_supersede[1].reason, "");
    assert!(parse_router_json("{}").unwrap().memory_supersede.is_empty());
}

#[test]
fn the_router_sees_memory_ids_and_shortened_topics() {
    let mem = |id: i64, content: &str| crate::modules::memory::EpisodicMemory {
        id,
        category: "topic".into(),
        content: content.into(),
        significance: 4,
        created_at: 0,
        last_accessed_at: 0,
        source_chat_id: None,
        source_message_ids: Vec::new(),
        origin: "auto".into(),
        pinned: false,
        needs_review: false,
        topic_key: None,
        superseded_by: None,
        superseded_at: None,
        supersede_reason: String::new(),
    };
    assert_eq!(
        router_memory_line(&mem(7, "[Topic: tee]\nMag  Jasmintee")),
        "- #7 [topic] [Topic: tee] Mag Jasmintee\n"
    );
    let long = router_memory_line(&mem(8, &"ä".repeat(400)));
    assert!(long.ends_with("…\n"));
    assert_eq!(
        long.chars().filter(|c| *c == 'ä').count(),
        ROUTER_MEMORY_CHARS
    );
}

#[test]
fn a_group_chat_transcript_names_every_speaker() {
    let msg = |role: &str, speaker: &str| crate::modules::memory::StoredChatMessage {
        id: String::new(),
        chat_id: "c".into(),
        role: role.into(),
        content: String::new(),
        thought: None,
        order_index: 0,
        swipe_index: 0,
        swipes: Vec::new(),
        created_at: 0,
        attachments: Vec::new(),
        speaker_id: speaker.into(),
    };
    let names = std::collections::HashMap::from([
        (String::new(), "Ayu".to_string()),
        ("sora".to_string(), "Sora".to_string()),
    ]);
    assert_eq!(
        transcript_speaker(&msg("user", ""), "Kai", Some(&names)),
        "Kai"
    );
    assert_eq!(
        transcript_speaker(&msg("assistant", ""), "Kai", Some(&names)),
        "Ayu"
    );
    assert_eq!(
        transcript_speaker(&msg("assistant", "sora"), "Kai", Some(&names)),
        "Sora"
    );
    // A normal chat keeps the roles.
    assert_eq!(
        transcript_speaker(&msg("assistant", ""), "Kai", None),
        "assistant"
    );
}

#[test]
fn test_extract_json_object_variations() {
    let plain = r#"{"no_significant_change": true}"#;
    assert_eq!(extract_json_object(plain).unwrap(), plain);

    let with_markdown =
        "Here is the response:\n```json\n{\"no_significant_change\": false}\n```\nHope it helps!";
    assert_eq!(
        extract_json_object(with_markdown).unwrap(),
        "{\"no_significant_change\": false}"
    );

    let invalid = "There is no json here at all";
    assert!(extract_json_object(invalid).is_none());
}

#[test]
fn test_parse_router_json_noop() {
    let raw = "```json\n{\n  \"no_significant_change\": true\n}\n```";
    let parsed = parse_router_json(raw).unwrap();
    assert_eq!(parsed.no_significant_change, Some(true));
    assert!(parsed.character_memory_patch.is_none());
}

#[test]
fn test_parse_router_json_full_patch() {
    let raw = r#"{
      "no_significant_change": false,
      "character_memory_patch": {
        "core_identity_add": ["Vertraut Hiroki mehr als jedem anderen"],
        "core_identity_remove": ["Misstrauisch gegenüber Fremden"],
        "internal_state": {
          "primary_emotion": "Joyful",
          "intensity": 4,
          "psychological_tension": "Keine.",
          "emotion_active": true
        },
        "cognitive_drive": {
          "active_agenda": "Zusammen zum Festival gehen",
          "immediate_focus": "Den passenden Kimono finden"
        },
        "cognitive_dissonance": "Keine."
      },
      "user_memory_patch": {
        "user_identity_status": {
          "role_in_story": "Vertrauter Gefährte",
          "known_attributes": "Geduldig und aufmerksam"
        },
        "relationship_metadata": {
          "trust_level": "Deeply Bound",
          "dynamic_description": "Tiefe seelische Verbundenheit",
          "unspoken_tension": "Keine."
        },
        "preferences_habits_add": ["Mag Dango"],
        "preferences_habits_remove": [],
        "shared_milestones_promises_add": ["Festivalbesuch versprochen"],
        "shared_milestones_promises_remove": []
      },
      "healing_log_add": [
        "Misstrauen gegenüber Hiroki wurde durch tiefes Vertrauen ersetzt."
      ],
      "topic_plan": {
        "actions": [
          {"action": "create", "filename": "sommerfestival.md", "summary": "Festivalpläne"}
        ]
      }
    }"#;

    let parsed = parse_router_json(raw).unwrap();
    assert_eq!(parsed.no_significant_change, Some(false));
    let cp = parsed.character_memory_patch.unwrap();
    assert_eq!(
        cp.core_identity_add[0],
        "Vertraut Hiroki mehr als jedem anderen"
    );
    assert_eq!(cp.core_identity_remove[0], "Misstrauisch gegenüber Fremden");
    assert_eq!(
        cp.internal_state.unwrap().primary_emotion.unwrap(),
        "Joyful"
    );

    let up = parsed.user_memory_patch.unwrap();
    assert_eq!(
        up.relationship_metadata.unwrap().trust_level.unwrap(),
        "Deeply Bound"
    );
    assert_eq!(up.preferences_habits_add[0], "Mag Dango");
    assert_eq!(parsed.healing_log_add.len(), 1);
    let actions = parsed.topic_plan.unwrap().actions;
    assert_eq!(actions.len(), 1);
    assert_eq!(actions[0].significance, None);
    // Small models sometimes write the rating as text.
    let rated = parse_router_json(
        r#"{"topic_plan": {"actions": [{"action": "create", "filename": "a.md", "significance": "5"}]}}"#,
    )
    .unwrap();
    assert_eq!(rated.topic_plan.unwrap().actions[0].significance, Some(5));
}
