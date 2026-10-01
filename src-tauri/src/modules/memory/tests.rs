use super::schema::{MIGRATIONS, has_column};
fn schema_version(conn: &Connection) -> i64 {
    conn.query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap()
}

#[test]
fn fresh_database_gets_latest_schema() {
    let mut conn = Connection::open_in_memory().unwrap();
    migrate(&mut conn).unwrap();
    assert_eq!(schema_version(&conn), MIGRATIONS.len() as i64);
    assert!(has_column(&conn, "soul_relationship", "dynamic_description").unwrap());

    // Running again (next start) is a no-op.
    migrate(&mut conn).unwrap();
    assert_eq!(schema_version(&conn), MIGRATIONS.len() as i64);
}

#[test]
fn legacy_database_is_upgraded_without_losing_data() {
    let mut conn = Connection::open_in_memory().unwrap();
    // A database from before versioning: v0 and without the later columns.
    conn.execute_batch(
        "CREATE TABLE soul_psychology (
            character_id TEXT PRIMARY KEY,
            primary_emotion TEXT NOT NULL DEFAULT 'Calm',
            intensity INTEGER NOT NULL DEFAULT 3,
            psychological_tension TEXT NOT NULL DEFAULT 'Keine.',
            emotional_decay_counter INTEGER NOT NULL DEFAULT 0,
            active_agenda TEXT NOT NULL DEFAULT '',
            immediate_focus TEXT NOT NULL DEFAULT '',
            updated_at INTEGER NOT NULL
        );
        INSERT INTO soul_psychology (character_id, primary_emotion, updated_at) VALUES ('ayu', 'Joy', 1);",
    )
    .unwrap();

    migrate(&mut conn).unwrap();

    assert_eq!(schema_version(&conn), MIGRATIONS.len() as i64);
    assert!(has_column(&conn, "soul_psychology", "core_identity").unwrap());
    let (emotion, identity): (String, String) = conn
        .query_row(
            "SELECT primary_emotion, core_identity FROM soul_psychology WHERE character_id = 'ayu'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(emotion, "Joy");
    assert_eq!(identity, "[]");
    assert!(has_column(&conn, "chat_messages", "swipes_json").unwrap());
}

#[test]
fn database_from_newer_version_is_left_alone() {
    let mut conn = Connection::open_in_memory().unwrap();
    conn.pragma_update(None, "user_version", 999).unwrap();
    migrate(&mut conn).unwrap();
    assert_eq!(schema_version(&conn), 999);
    assert!(!has_column(&conn, "soul_psychology", "core_identity").unwrap());
}

use super::*;

#[test]
fn test_psychology_crud() {
    let db = MemoryDb::new_in_memory().expect("in-memory db failed");
    let mut psych = db.get_or_create_psychology("ayu").unwrap();
    assert_eq!(psych.primary_emotion, "Calm");
    assert_eq!(psych.intensity, 3);

    psych.primary_emotion = "Excited".to_string();
    psych.intensity = 5;
    psych.psychological_tension = "Will Hiroki beeindrucken.".to_string();
    db.update_psychology("ayu", &psych).unwrap();

    let loaded = db.get_or_create_psychology("ayu").unwrap();
    assert_eq!(loaded.primary_emotion, "Excited");
    assert_eq!(loaded.intensity, 5);
    assert_eq!(loaded.psychological_tension, "Will Hiroki beeindrucken.");
}

#[test]
fn test_relationship_crud() {
    let db = MemoryDb::new_in_memory().expect("in-memory db failed");
    let mut rel = db.get_or_create_relationship("ayu", "Hiroki").unwrap();
    assert_eq!(rel.trust_level, "Neutral");
    assert!(rel.preferences_habits.is_empty());

    rel.trust_level = "Deeply Bound".to_string();
    rel.preferences_habits
        .push("Trinkt gerne Grüntee".to_string());
    rel.shared_milestones
        .push("Gemeinsames Picknick im Park".to_string());
    db.update_relationship("ayu", &rel).unwrap();

    let loaded = db.get_or_create_relationship("ayu", "Hiroki").unwrap();
    assert_eq!(loaded.trust_level, "Deeply Bound");
    assert_eq!(loaded.preferences_habits.len(), 1);
    assert_eq!(loaded.preferences_habits[0], "Trinkt gerne Grüntee");
    assert_eq!(loaded.shared_milestones[0], "Gemeinsames Picknick im Park");
}

#[test]
fn test_episodic_memory_deduplication_and_priority() {
    let db = MemoryDb::new_in_memory().expect("in-memory db failed");
    let id1 = db
        .add_episodic_memory("ayu", "fact", "Hiroki mag Matcha Latte", 2)
        .unwrap();
    let id2 = db
        .add_episodic_memory("ayu", "fact", "Hiroki mag Matcha Latte", 4)
        .unwrap();
    // Duplicates should reuse id and elevate significance
    assert_eq!(id1, id2);

    let id3 = db
        .add_episodic_memory("ayu", "secret", "Hat Angst vor Gewitter", 5)
        .unwrap();
    assert_ne!(id1, id3);

    let memories = db.get_episodic_memories("ayu", 10).unwrap();
    assert_eq!(memories.len(), 2);
    // Sorted by significance DESC: 5 first, then 4
    assert_eq!(memories[0].significance, 5);
    assert_eq!(memories[0].content, "Hat Angst vor Gewitter");
    assert_eq!(memories[1].significance, 4);
}

#[test]
fn test_diary_entries() {
    let db = MemoryDb::new_in_memory().expect("in-memory db failed");
    db.add_diary_entry(
        "ayu",
        "Erster Tag",
        "Heute habe ich Hiroki getroffen...",
        "Happy",
    )
    .unwrap();
    db.add_diary_entry(
        "ayu",
        "Später Abend",
        "Ich konnte kaum schlafen.",
        "Thoughtful",
    )
    .unwrap();

    let entries = db.get_diary_entries("ayu", 10).unwrap();
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0].title, "Später Abend"); // LIFO
    assert_eq!(entries[1].title, "Erster Tag");
}

#[test]
fn test_emotional_decay() {
    let db = MemoryDb::new_in_memory().expect("in-memory db failed");
    let mut psych = db.get_or_create_psychology("ayu").unwrap();
    psych.intensity = 5;
    db.update_psychology("ayu", &psych).unwrap();

    // Turn 1: decay counter 0 -> 1, intensity stays 5
    let decay1 = db.apply_emotional_decay("ayu").unwrap();
    assert!(decay1.is_none());
    let p1 = db.get_or_create_psychology("ayu").unwrap();
    assert_eq!(p1.intensity, 5);
    assert_eq!(p1.emotional_decay_counter, 1);

    // Turn 2: decay counter reaches 2 -> intensity drops to 4, counter resets
    let decay2 = db.apply_emotional_decay("ayu").unwrap();
    assert!(decay2.is_some());
    let p2 = db.get_or_create_psychology("ayu").unwrap();
    assert_eq!(p2.intensity, 4);
    assert_eq!(p2.emotional_decay_counter, 0);

    // Healing log check
    let logs = db.get_healing_logs("ayu", 5).unwrap();
    assert_eq!(logs.len(), 1);
    assert_eq!(logs[0].action, "decay_applied");
}

#[test]
fn test_cognitive_overview() {
    let db = MemoryDb::new_in_memory().expect("in-memory db failed");
    db.add_episodic_memory("ayu", "fact", "Hiroki mag Matcha Latte", 3)
        .unwrap();
    db.add_diary_entry("ayu", "Tagebucheintrag", "Ein schöner Tag.", "Calm")
        .unwrap();

    let overview = db.get_cognitive_overview("ayu", "Hiroki").unwrap();
    assert_eq!(overview.psychology.primary_emotion, "Calm");
    assert_eq!(overview.relationship.user_name, "Hiroki");
    assert_eq!(overview.recent_memories.len(), 1);
    assert_eq!(overview.recent_diary.len(), 1);
}

#[test]
fn test_chat_sessions_crud() {
    let db = MemoryDb::new_in_memory().expect("in-memory db failed");
    let session = db.create_chat_session("ayu", "Erstes Treffen").unwrap();
    assert_eq!(session.title, "Erstes Treffen");
    assert_eq!(session.character_id, "ayu");
    assert_eq!(session.message_count, 0);

    let list = db.list_chat_sessions("ayu").unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].id, session.id);

    db.rename_chat_session(&session.id, "Umbenannter Chat")
        .unwrap();
    let loaded = db.get_chat_session(&session.id).unwrap().unwrap();
    assert_eq!(loaded.title, "Umbenannter Chat");

    db.update_chat_author_note(&session.id, "[Ayu ist schüchtern]", 3)
        .unwrap();
    let loaded2 = db.get_chat_session(&session.id).unwrap().unwrap();
    assert_eq!(loaded2.author_note, "[Ayu ist schüchtern]");
    assert_eq!(loaded2.author_note_depth, 3);

    assert_eq!((loaded2.summary.as_str(), loaded2.summary_until), ("", -1));
    db.update_chat_summary(&session.id, "Ayu und Kai trafen sich am Bahnhof.", 12)
        .unwrap();
    let loaded3 = db.get_chat_session(&session.id).unwrap().unwrap();
    assert_eq!(loaded3.summary, "Ayu und Kai trafen sich am Bahnhof.");
    assert_eq!(loaded3.summary_until, 12);

    db.delete_chat_session(&session.id).unwrap();
    let list_empty = db.list_chat_sessions("ayu").unwrap();
    assert_eq!(list_empty.len(), 0);
}

#[test]
fn test_chat_messages_and_swipes() {
    let db = MemoryDb::new_in_memory().expect("in-memory db failed");
    let session = db.create_chat_session("ayu", "Test Chat").unwrap();

    // 1. Add user message
    let user_msg = db
        .add_chat_message(&session.id, "user", "Hallo Ayu!", None)
        .unwrap();
    assert_eq!(user_msg.role, "user");
    assert_eq!(user_msg.content, "Hallo Ayu!");
    assert_eq!(user_msg.order_index, 0);
    assert_eq!(user_msg.swipes.len(), 1);

    // 2. Add assistant response
    let asst_msg = db
        .add_chat_message(
            &session.id,
            "assistant",
            "*lächelt* Hallo Hiroki!",
            Some("Erfreut über die Begrüßung"),
        )
        .unwrap();
    assert_eq!(asst_msg.role, "assistant");
    assert_eq!(asst_msg.order_index, 1);
    assert_eq!(asst_msg.swipe_index, 0);
    assert_eq!(asst_msg.swipes.len(), 1);

    // 3. Add swipe variant to assistant message
    let swiped = db
        .add_message_swipe(
            &asst_msg.id,
            "*winkt fröhlich* Hey Hiroki, schön dich zu sehen!",
            Some("Sehr enthusiastisch"),
        )
        .unwrap();
    assert_eq!(swiped.swipes.len(), 2);
    assert_eq!(swiped.swipe_index, 1);
    assert_eq!(
        swiped.content,
        "*winkt fröhlich* Hey Hiroki, schön dich zu sehen!"
    );
    assert_eq!(swiped.thought.as_deref(), Some("Sehr enthusiastisch"));

    // 4. Switch back to swipe 0
    let switched = db.switch_message_swipe(&asst_msg.id, 0).unwrap();
    assert_eq!(switched.swipe_index, 0);
    assert_eq!(switched.content, "*lächelt* Hallo Hiroki!");

    // 5. Update active swipe inline
    let updated = db
        .update_chat_message(&asst_msg.id, "*lächelt sanft* Hallo Hiroki!", None)
        .unwrap();
    assert_eq!(updated.content, "*lächelt sanft* Hallo Hiroki!");
    assert_eq!(updated.swipes[0].content, "*lächelt sanft* Hallo Hiroki!");
    assert_eq!(updated.swipes.len(), 2);

    // 6. Check messages list
    let msgs = db.get_chat_messages(&session.id).unwrap();
    assert_eq!(msgs.len(), 2);

    // 7. Check message count in session
    let updated_sess = db.get_chat_session(&session.id).unwrap().unwrap();
    assert_eq!(updated_sess.message_count, 2);

    // 8. Delete message
    db.delete_chat_message(&asst_msg.id).unwrap();
    let msgs_after = db.get_chat_messages(&session.id).unwrap();
    assert_eq!(msgs_after.len(), 1);
}

#[test]
fn test_chat_jsonl_export_and_import() {
    let db = MemoryDb::new_in_memory().expect("in-memory db failed");
    let session = db.create_chat_session("ayu", "Reise nach Kyoto").unwrap();
    db.update_chat_author_note(&session.id, "[Wetter ist sonnig]", 2)
        .unwrap();

    db.add_chat_message(&session.id, "user", "Kommst du mit zum Schrein?", None)
        .unwrap();
    let asst = db
        .add_chat_message(
            &session.id,
            "assistant",
            "*nickt* Sehr gern!",
            Some("Aufgeregt"),
        )
        .unwrap();
    db.add_message_swipe(
        &asst.id,
        "*hüpft auf* Na klar doch!",
        Some("Voller Energie"),
    )
    .unwrap();

    let jsonl = db.export_chat_jsonl(&session.id, "Ayu", "Hiroki").unwrap();
    assert!(jsonl.contains("Reise nach Kyoto"));
    assert!(jsonl.contains("[Wetter ist sonnig]"));
    assert!(jsonl.contains("Kommst du mit zum Schrein?"));
    assert!(jsonl.contains("Sehr gern!"));
    assert!(jsonl.contains("Na klar doch!"));

    // Now import into new session
    let imported = db.import_chat_jsonl("ayu", &jsonl, None).unwrap();
    assert_eq!(imported.title, "Reise nach Kyoto");
    assert_eq!(imported.author_note, "[Wetter ist sonnig]");
    assert_eq!(imported.message_count, 2);

    let imp_msgs = db.get_chat_messages(&imported.id).unwrap();
    assert_eq!(imp_msgs.len(), 2);
    assert_eq!(imp_msgs[0].role, "user");
    assert_eq!(imp_msgs[1].role, "assistant");
    assert_eq!(imp_msgs[1].swipes.len(), 2);
    assert_eq!(imp_msgs[1].swipe_index, 1);
    assert_eq!(imp_msgs[1].content, "*hüpft auf* Na klar doch!");
}

#[test]
fn test_markdown_roundtrip() {
    let db = MemoryDb::new_in_memory().expect("in-memory db failed");
    let mut psych = db.get_or_create_psychology("vivy").unwrap();
    psych.core_identity = vec![
        "Meine Mission ist es, den Menschen Freude mit meinem Gesang zu bringen.".to_string(),
        "Ich werde mich niemals selbst aufgeben.".to_string(),
    ];
    psych.primary_emotion = "Determined".to_string();
    psych.intensity = 4;
    psych.psychological_tension = "Ungewissheit über die Zukunft der KI.".to_string();
    psych.active_agenda = "Matsumoto von ihrem Plan überzeugen.".to_string();
    psych.immediate_focus = "Das nächste Lied einstudieren.".to_string();
    psych.cognitive_dissonance = "Fühlt sich mehr menschlich als synthetisch.".to_string();
    db.update_psychology("vivy", &psych).unwrap();

    let char_md = db.render_character_markdown("vivy").unwrap();
    assert!(char_md.contains("# SOUL CACHE: VIVY"));
    assert!(char_md.contains("## CORE IDENTITY & UNBREAKABLE BELIEFS"));
    assert!(
        char_md.contains("Meine Mission ist es, den Menschen Freude mit meinem Gesang zu bringen.")
    );
    assert!(char_md.contains("- **Primary Emotion**: Determined (Intensity: 4/5)"));

    // Parse modified markdown back
    let modified_md = r#"# SOUL CACHE: VIVY

## CORE IDENTITY & UNBREAKABLE BELIEFS
- Gesang ist die größte Kraft des Universums.

## INTERNAL STATE & PSYCHOLOGICAL MOMENTUM
- **Primary Emotion**: Euphoric (Intensity: 5/5)
- **Psychological Tension**: Vollständige Gelassenheit.
- **Emotional Decay Counter**: 1/3

## COGNITIVE DRIVE & ACTIVE AGENDA
- **Active Agenda**: Welt-Konzert vorbereiten.
- **Immediate Focus**: Das große Finale.

## UNRESOLVED COGNITIVE DISSONANCE
Keine Dissonanz mehr.
"#;
    db.parse_and_sync_character_markdown("vivy", modified_md)
        .unwrap();
    let updated_psych = db.get_or_create_psychology("vivy").unwrap();
    assert_eq!(updated_psych.primary_emotion, "Euphoric");
    assert_eq!(updated_psych.intensity, 5);
    assert_eq!(
        updated_psych.psychological_tension,
        "Vollständige Gelassenheit."
    );
    assert_eq!(updated_psych.active_agenda, "Welt-Konzert vorbereiten.");
    assert_eq!(updated_psych.immediate_focus, "Das große Finale.");
    assert_eq!(updated_psych.core_identity.len(), 1);
    assert_eq!(
        updated_psych.core_identity[0],
        "Gesang ist die größte Kraft des Universums."
    );
    assert_eq!(updated_psych.cognitive_dissonance, "Keine Dissonanz mehr.");

    // User Markdown test
    let mut rel = db.get_or_create_relationship("vivy", "Matsumoto").unwrap();
    rel.role_in_story = "Partner aus der Zukunft".to_string();
    rel.known_attributes = "Ein weißer KI-Teddybär".to_string();
    rel.trust_level = "Developing Trust".to_string();
    rel.dynamic_description = "Zweckgemeinschaft mit wachsender Verbundenheit".to_string();
    rel.preferences_habits = vec!["Erklärt Dinge gerne überhastet".to_string()];
    rel.shared_milestones = vec!["Erste Zeitlinien-Korrektur erfolgreich".to_string()];
    db.update_relationship("vivy", &rel).unwrap();

    let user_md = db.render_user_markdown("vivy", "Matsumoto").unwrap();
    assert!(user_md.contains("# USER PROFILE & RELATIONSHIP MEMORY: MATSUMOTO"));
    assert!(user_md.contains("- **Role in Story**: Partner aus der Zukunft"));
    assert!(user_md.contains("- **Trust Level**: Developing Trust"));

    let mod_user_md = r#"# USER PROFILE & RELATIONSHIP MEMORY: MATSUMOTO

## USER IDENTITY & STATUS
- **Role in Story**: Beschützer und Freund
- **Known Attributes**: Extrem scharfsinnig

## RELATIONSHIP METADATA
- **Trust Level**: Deeply Bound
- **Dynamic Description**: Blindes Vertrauen
- **Unspoken Tension**: Keine Geheimnisse

## PREFERENCES & HABITS
- Verliert sich in langen Berechnungen

## SHARED MILESTONES & PROMISES
- Die Zukunft gemeinsam gerettet
"#;
    db.parse_and_sync_user_markdown("vivy", "Matsumoto", mod_user_md)
        .unwrap();
    let updated_rel = db.get_or_create_relationship("vivy", "Matsumoto").unwrap();
    assert_eq!(updated_rel.role_in_story, "Beschützer und Freund");
    assert_eq!(updated_rel.trust_level, "Deeply Bound");
    assert_eq!(
        updated_rel.preferences_habits[0],
        "Verliert sich in langen Berechnungen"
    );
    assert_eq!(
        updated_rel.shared_milestones[0],
        "Die Zukunft gemeinsam gerettet"
    );
}

#[test]
fn test_backup_and_restore() {
    let db = MemoryDb::new_in_memory().expect("in-memory db failed");
    let temp_dir =
        std::env::temp_dir().join(format!("otakusoul_test_backup_{}", rand::random::<u32>()));
    std::fs::create_dir_all(&temp_dir).unwrap();

    let mut psych = db.get_or_create_psychology("akane").unwrap();
    psych.primary_emotion = "Confident".to_string();
    psych.core_identity = vec!["Gerechtigkeit ist unantastbar.".to_string()];
    db.update_psychology("akane", &psych).unwrap();

    let backup = db
        .backup_memory_state("akane", Some("Kogami"), Some(&temp_dir))
        .unwrap();
    assert!(backup.filename.starts_with("backup_akane_"));

    let backups = db.list_memory_backups("akane", Some(&temp_dir)).unwrap();
    assert_eq!(backups.len(), 1);

    // Modify state in DB
    psych.primary_emotion = "Broken".to_string();
    psych.core_identity = vec![];
    db.update_psychology("akane", &psych).unwrap();
    assert_eq!(
        db.get_or_create_psychology("akane")
            .unwrap()
            .primary_emotion,
        "Broken"
    );

    // Restore
    let backup_path = temp_dir.join(&backup.filename);
    db.restore_memory_backup(&backup_path).unwrap();

    let restored = db.get_or_create_psychology("akane").unwrap();
    assert_eq!(restored.primary_emotion, "Confident");
    assert_eq!(restored.core_identity[0], "Gerechtigkeit ist unantastbar.");

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_sow_import() {
    let db = MemoryDb::new_in_memory().expect("in-memory db failed");
    let temp_dir =
        std::env::temp_dir().join(format!("otakusoul_test_sow_{}", rand::random::<u32>()));
    let topics_dir = temp_dir.join("topics");
    std::fs::create_dir_all(&topics_dir).unwrap();

    let mem_content = r#"# SOUL CACHE: ASUNA

## CORE IDENTITY & UNBREAKABLE BELIEFS
- Ich beschütze meine Freunde mit meinem Leben.

## INTERNAL STATE & PSYCHOLOGICAL MOMENTUM
- **Primary Emotion**: Loving (Intensity: 5/5)
- **Psychological Tension**: Sorge um die reale Welt.
- **Emotional Decay Counter**: 0/3

## COGNITIVE DRIVE & ACTIVE AGENDA
- **Active Agenda**: Ein gemütliches Abendessen kochen.
- **Immediate Focus**: Zutaten sammeln.

## UNRESOLVED COGNITIVE DISSONANCE
Keine.
"#;
    std::fs::write(temp_dir.join("MEMORY.md"), mem_content).unwrap();

    let user_content = r#"# USER PROFILE & RELATIONSHIP MEMORY: KIRITO

## USER IDENTITY & STATUS
- **Role in Story**: Schwarzer Schwertkämpfer
- **Known Attributes**: Schnelle Reflexe, introvertiert

## RELATIONSHIP METADATA
- **Trust Level**: Deeply Bound
- **Dynamic Description**: Unzertrennliches Paar
- **Unspoken Tension**: Keine.

## PREFERENCES & HABITS
- Liebt Ragout-Kaninchen

## SHARED MILESTONES & PROMISES
- Haus auf Ebene 22 gekauft
"#;
    std::fs::write(temp_dir.join("USER.md"), user_content).unwrap();

    let topic_content = "# Sword Art Online\nEin tödliches VRMMO, aus dem es kein Entkommen gab.";
    std::fs::write(topics_dir.join("sao_world.md"), topic_content).unwrap();

    let diary_content = "Heute war ein ruhiger Tag. Kirito und ich haben am See gesessen.";
    std::fs::write(temp_dir.join("DIARY.md"), diary_content).unwrap();

    let count = db
        .import_sow_memory_folder("asuna", &temp_dir, "Kirito")
        .unwrap();
    assert_eq!(count, 4);

    let psych = db.get_or_create_psychology("asuna").unwrap();
    assert_eq!(psych.primary_emotion, "Loving");
    assert_eq!(
        psych.core_identity[0],
        "Ich beschütze meine Freunde mit meinem Leben."
    );

    let rel = db.get_or_create_relationship("asuna", "Kirito").unwrap();
    assert_eq!(rel.role_in_story, "Schwarzer Schwertkämpfer");
    assert_eq!(rel.trust_level, "Deeply Bound");
    assert_eq!(rel.preferences_habits[0], "Liebt Ragout-Kaninchen");

    let memories = db.get_episodic_memories("asuna", 10).unwrap();
    assert_eq!(memories.len(), 1);
    assert!(memories[0].content.contains("Sword Art Online"));

    let diaries = db.get_diary_entries("asuna", 10).unwrap();
    assert_eq!(diaries.len(), 1);
    assert!(diaries[0].entry_text.contains("Heute war ein ruhiger Tag"));

    let _ = std::fs::remove_dir_all(&temp_dir);
}
