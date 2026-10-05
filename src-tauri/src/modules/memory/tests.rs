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
fn v1_database_gets_chat_summary_and_attachment_columns() {
    let mut conn = Connection::open_in_memory().unwrap();
    // v1 as shipped: without summary/attachment columns.
    conn.execute_batch(
        "CREATE TABLE chat_sessions (id TEXT PRIMARY KEY, character_id TEXT NOT NULL,
            title TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
         CREATE TABLE chat_messages (id TEXT PRIMARY KEY, chat_id TEXT NOT NULL,
            role TEXT NOT NULL, content TEXT NOT NULL, order_index INTEGER NOT NULL,
            created_at INTEGER NOT NULL);
         PRAGMA user_version = 1;",
    )
    .unwrap();

    migrate(&mut conn).unwrap();

    assert_eq!(schema_version(&conn), MIGRATIONS.len() as i64);
    assert!(has_column(&conn, "chat_sessions", "summary").unwrap());
    assert!(has_column(&conn, "chat_sessions", "summary_until").unwrap());
    assert!(has_column(&conn, "chat_messages", "attachments_json").unwrap());
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
        .add_chat_message(&session.id, "user", "Hallo Ayu!", None, &[])
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
            &[],
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

    db.add_chat_message(&session.id, "user", "Kommst du mit zum Schrein?", None, &[])
        .unwrap();
    let asst = db
        .add_chat_message(
            &session.id,
            "assistant",
            "*nickt* Sehr gern!",
            Some("Aufgeregt"),
            &[],
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
fn test_backup_listing_distinguishes_missing_directory_and_read_error() {
    let db = MemoryDb::new_in_memory().unwrap();
    let path = std::env::temp_dir().join(format!(
        "otakusoul_backup_listing_{}",
        rand::random::<u32>()
    ));
    assert!(
        db.list_memory_backups("ayu", Some(&path))
            .unwrap()
            .is_empty()
    );
    std::fs::write(&path, "not a directory").unwrap();
    assert!(db.list_memory_backups("ayu", Some(&path)).is_err());
    std::fs::remove_file(&path).unwrap();
}

#[cfg(unix)]
#[test]
fn test_backup_listing_does_not_hide_unreadable_snapshot_metadata() {
    let db = MemoryDb::new_in_memory().unwrap();
    let path = std::env::temp_dir().join(format!(
        "otakusoul_backup_metadata_{}",
        rand::random::<u32>()
    ));
    std::fs::create_dir_all(&path).unwrap();
    let broken = path.join("backup_ayu_123.json");
    std::os::unix::fs::symlink(path.join("missing.json"), &broken).unwrap();
    assert!(db.list_memory_backups("ayu", Some(&path)).is_err());
    std::fs::remove_file(broken).unwrap();
    assert!(
        db.list_memory_backups("ayu", Some(&path))
            .unwrap()
            .is_empty()
    );
    std::fs::remove_dir(path).unwrap();
}

#[test]
fn test_restore_rolls_back_all_changes_on_late_failure_and_retries() {
    let db = MemoryDb::new_in_memory().unwrap();
    let dir = std::env::temp_dir().join(format!(
        "otakusoul_restore_atomic_{}",
        rand::random::<u32>()
    ));
    let mut psych = db.get_or_create_psychology("ayu").unwrap();
    psych.psychological_tension = "Snapshot tension".into();
    db.update_psychology("ayu", &psych).unwrap();
    db.add_episodic_memory("ayu", "fact", "Lake", 3).unwrap();
    db.add_diary_entry("ayu", "Day", "Lake diary", "Calm")
        .unwrap();
    let snapshot = db
        .backup_memory_state("ayu", Some("User"), Some(&dir))
        .unwrap();
    psych.psychological_tension = "Current tension".into();
    db.update_psychology("ayu", &psych).unwrap();
    let before = serde_json::to_value(db.get_cognitive_overview("ayu", "User").unwrap()).unwrap();
    db.conn.lock().execute_batch("CREATE TRIGGER fail_restore BEFORE INSERT ON soul_healing_log BEGIN SELECT RAISE(ABORT, 'late restore failure'); END;").unwrap();
    let path = dir.join(snapshot.filename);
    assert!(
        db.restore_memory_backup(&path)
            .unwrap_err()
            .contains("late restore failure")
    );
    assert_eq!(
        serde_json::to_value(db.get_cognitive_overview("ayu", "User").unwrap()).unwrap(),
        before
    );
    db.conn
        .lock()
        .execute_batch("DROP TRIGGER fail_restore;")
        .unwrap();
    db.restore_memory_backup(&path).unwrap();
    assert_eq!(
        db.get_or_create_psychology("ayu")
            .unwrap()
            .psychological_tension,
        "Snapshot tension"
    );
    assert_eq!(db.get_diary_entries("ayu", 10).unwrap().len(), 2);
    assert_eq!(db.get_episodic_memories("ayu", 10).unwrap().len(), 1);
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn test_snapshot_does_not_write_partial_data_when_a_read_fails() {
    let db = MemoryDb::new_in_memory().unwrap();
    let dir =
        std::env::temp_dir().join(format!("otakusoul_snapshot_read_{}", rand::random::<u32>()));
    db.conn
        .lock()
        .execute_batch("DROP TABLE soul_diary;")
        .unwrap();
    assert!(
        db.backup_memory_state("ayu", Some("User"), Some(&dir))
            .is_err()
    );
    assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 0);
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn changing_a_summarized_message_drops_the_summary() {
    let db = MemoryDb::new_in_memory().unwrap();
    let chat = db.create_chat_session("ayu", "Test").unwrap();
    let msgs: Vec<_> = (0..6)
        .map(|i| {
            db.add_chat_message(
                &chat.id,
                if i % 2 == 0 { "user" } else { "assistant" },
                &format!("m{i}"),
                None,
                &[],
            )
            .unwrap()
        })
        .collect();
    let summarized = |until: i64| {
        db.update_chat_summary(&chat.id, "Bisher: m0 bis m3", until)
            .unwrap();
    };
    let summary = || {
        let s = db.get_chat_session(&chat.id).unwrap().unwrap();
        (s.summary, s.summary_until)
    };
    let until = i64::from(msgs[3].order_index);

    // Changes after the summarized part keep it.
    summarized(until);
    db.update_chat_message(&msgs[5].id, "m5 neu", None).unwrap();
    db.add_message_swipe(&msgs[5].id, "m5 Variante", None)
        .unwrap();
    db.switch_message_swipe(&msgs[5].id, 0).unwrap();
    db.delete_chat_message(&msgs[4].id).unwrap();
    assert_eq!(summary(), ("Bisher: m0 bis m3".to_string(), until));

    // Edit, new variant, switching variants and deleting inside it drop it.
    type Change<'a> = Box<dyn Fn() -> Result<(), rusqlite::Error> + 'a>;
    let changes: Vec<Change> = vec![
        Box::new(|| {
            db.update_chat_message(&msgs[1].id, "m1 korrigiert", None)
                .map(|_| ())
        }),
        Box::new(|| {
            db.add_message_swipe(&msgs[3].id, "m3 Variante", None)
                .map(|_| ())
        }),
        Box::new(|| db.switch_message_swipe(&msgs[3].id, 0).map(|_| ())),
        Box::new(|| db.delete_chat_message(&msgs[2].id)),
        Box::new(|| db.delete_messages_after(&chat.id, msgs[3].order_index)),
    ];
    for change in changes {
        summarized(until);
        change().unwrap();
        assert_eq!(summary(), (String::new(), -1));
    }
}

#[test]
fn bookmarks_follow_messages_and_chats() {
    let db = MemoryDb::new_in_memory().unwrap();
    let chat = db.create_chat_session("ayu", "Test").unwrap();
    let a = db
        .add_chat_message(&chat.id, "user", "eins", None, &[])
        .unwrap();
    let b = db
        .add_chat_message(&chat.id, "assistant", "zwei", None, &[])
        .unwrap();
    db.set_chat_bookmark(&chat.id, &b.id, true).unwrap();
    db.set_chat_bookmark(&chat.id, &a.id, true).unwrap();
    db.set_chat_bookmark(&chat.id, &a.id, true).unwrap();
    assert_eq!(
        db.list_chat_bookmarks(&chat.id).unwrap(),
        [a.id.clone(), b.id.clone()],
        "story order, no duplicates"
    );

    db.set_chat_bookmark(&chat.id, &a.id, false).unwrap();
    db.delete_chat_message(&b.id).unwrap();
    assert!(
        db.list_chat_bookmarks(&chat.id).unwrap().is_empty(),
        "removed and deleted messages are gone"
    );

    let c = db
        .add_chat_message(&chat.id, "user", "drei", None, &[])
        .unwrap();
    db.set_chat_bookmark(&chat.id, &c.id, true).unwrap();
    db.delete_chat_session(&chat.id).unwrap();
    let left: i64 = db
        .conn
        .lock()
        .query_row("SELECT COUNT(*) FROM chat_bookmarks", [], |r| r.get(0))
        .unwrap();
    assert_eq!(left, 0);
}

#[test]
fn branching_copies_the_history_up_to_a_message() {
    let db = MemoryDb::new_in_memory().unwrap();
    let chat = db.create_chat_session("ayu", "Original").unwrap();
    db.update_chat_author_note(&chat.id, "Bleib freundlich.", 3)
        .unwrap();
    let msgs: Vec<_> = (0..4)
        .map(|i| {
            db.add_chat_message(
                &chat.id,
                if i % 2 == 0 { "user" } else { "assistant" },
                &format!("m{i}"),
                None,
                &[],
            )
            .unwrap()
        })
        .collect();
    db.add_message_swipe(&msgs[1].id, "m1 Variante", None)
        .unwrap();
    db.set_chat_bookmark(&chat.id, &msgs[1].id, true).unwrap();
    db.set_chat_bookmark(&chat.id, &msgs[3].id, true).unwrap();
    db.update_chat_summary(&chat.id, "Bisher: m0", i64::from(msgs[0].order_index))
        .unwrap();

    let branch = db.branch_chat(&chat.id, &msgs[1].id, "Abzweig").unwrap();
    assert_eq!(
        (
            branch.title.as_str(),
            branch.character_id.as_str(),
            branch.author_note.as_str()
        ),
        ("Abzweig", "ayu", "Bleib freundlich.")
    );
    let copied = db.get_chat_messages(&branch.id).unwrap();
    assert_eq!(
        copied
            .iter()
            .map(|m| m.content.as_str())
            .collect::<Vec<_>>(),
        ["m0", "m1 Variante"]
    );
    assert_eq!(copied[1].swipes.len(), 2, "variants come along");
    assert_eq!(
        db.list_chat_bookmarks(&branch.id).unwrap(),
        [copied[1].id.clone()]
    );
    assert_eq!(
        (branch.summary.as_str(), branch.summary_until),
        ("Bisher: m0", 0)
    );
    assert_eq!(
        db.get_chat_messages(&chat.id).unwrap().len(),
        4,
        "the original stays"
    );

    // A summary reaching past the branch point would tell events the branch doesn't have.
    db.update_chat_summary(
        &chat.id,
        "Bisher: m0 bis m3",
        i64::from(msgs[3].order_index),
    )
    .unwrap();
    let early = db.branch_chat(&chat.id, &msgs[0].id, "Früh").unwrap();
    assert_eq!((early.summary.as_str(), early.summary_until), ("", -1));
}

#[test]
fn memories_keep_their_source_history_and_review_flag() {
    let db = MemoryDb::new_in_memory().unwrap();
    let chat = db.create_chat_session("ayu", "Test").unwrap();
    let m1 = db
        .add_chat_message(&chat.id, "user", "Ich heiße Hiroki.", None, &[])
        .unwrap();
    let m2 = db
        .add_chat_message(&chat.id, "assistant", "Schön!", None, &[])
        .unwrap();
    let ids = vec![m1.id.clone(), m2.id.clone()];
    let learned = db
        .add_episodic_memory_from(
            "ayu",
            "fact",
            "Der Nutzer heißt Hiroki",
            3,
            &MemorySource {
                origin: "auto",
                chat_id: Some(&chat.id),
                message_ids: &ids,
            },
        )
        .unwrap();
    let manual = db
        .add_episodic_memory_from(
            "ayu",
            "secret",
            "Mag Gewitter nicht",
            2,
            &MemorySource::manual(),
        )
        .unwrap();

    let find = |id: i64| {
        db.get_episodic_memories("ayu", 10)
            .unwrap()
            .into_iter()
            .find(|m| m.id == id)
            .unwrap()
    };
    let auto = find(learned);
    assert_eq!(
        (auto.origin.as_str(), auto.source_chat_id.as_deref()),
        ("auto", Some(chat.id.as_str()))
    );
    assert_eq!(auto.source_message_ids, ids);
    assert_eq!(find(manual).origin, "manual");
    assert_eq!(db.count_memories_from_message(&chat.id, &m1.id).unwrap(), 1);

    // Pinned memories come first, even with low significance.
    db.set_episodic_memory_pinned("ayu", manual, true).unwrap();
    assert_eq!(db.get_episodic_memories("ayu", 10).unwrap()[0].id, manual);

    // Editing the source message flags the memory for review.
    db.update_chat_message(&m1.id, "Ich heiße Kenji.", None)
        .unwrap();
    assert!(find(learned).needs_review);

    // The user corrects it: confirmed, flag gone.
    db.update_episodic_memory("ayu", learned, "fact", "Der Nutzer heißt Kenji", 4)
        .unwrap();
    let edited = find(learned);
    assert_eq!(
        (
            edited.origin.as_str(),
            edited.needs_review,
            edited.content.as_str()
        ),
        ("edited", false, "Der Nutzer heißt Kenji")
    );

    // Forgetting removes it; the history tells the whole story.
    db.forget_episodic_memory("ayu", learned).unwrap();
    assert!(
        db.get_episodic_memories("ayu", 10)
            .unwrap()
            .iter()
            .all(|m| m.id != learned)
    );
    let actions: Vec<_> = db
        .get_memory_history("ayu", learned)
        .unwrap()
        .into_iter()
        .map(|c| c.action)
        .collect();
    assert_eq!(
        actions,
        ["created", "source_changed", "edited", "forgotten"]
    );
}

#[test]
fn restoring_a_snapshot_keeps_memory_origin_sources_and_pins() {
    let db = MemoryDb::new_in_memory().unwrap();
    let dir = std::env::temp_dir().join(format!(
        "otakusoul_restore_sources_{}",
        rand::random::<u32>()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    let ids = vec!["m1".to_string()];
    let id = db
        .add_episodic_memory_from(
            "ayu",
            "fact",
            "Der Nutzer heißt Hiroki",
            3,
            &MemorySource {
                origin: "auto",
                chat_id: Some("c1"),
                message_ids: &ids,
            },
        )
        .unwrap();
    db.set_episodic_memory_pinned("ayu", id, true).unwrap();
    let backup = db
        .backup_memory_state("ayu", Some("Hiroki"), Some(&dir))
        .unwrap();

    db.forget_episodic_memory("ayu", id).unwrap();
    db.restore_memory_backup(&dir.join(&backup.filename))
        .unwrap();

    let restored = &db.get_episodic_memories("ayu", 10).unwrap()[0];
    assert_eq!(restored.content, "Der Nutzer heißt Hiroki");
    assert_eq!(
        (
            restored.origin.as_str(),
            restored.source_chat_id.as_deref(),
            restored.pinned
        ),
        ("auto", Some("c1"), true)
    );
    assert_eq!(restored.source_message_ids, ids);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn new_chat_and_greeting_are_stored_together() {
    let db = MemoryDb::new_in_memory().expect("in-memory db failed");
    let session = db
        .create_chat_session_with_greeting("ayu", "Neu", Some("  Hallo!  "))
        .unwrap();
    assert_eq!(session.message_count, 1);
    let messages = db.get_chat_messages(&session.id).unwrap();
    assert_eq!(messages.len(), 1);
    assert_eq!(
        (messages[0].role.as_str(), messages[0].content.as_str()),
        ("assistant", "Hallo!")
    );
    // The greeting is a normal first message: the next one follows it.
    let next = db
        .add_chat_message(&session.id, "user", "Hi", None, &[])
        .unwrap();
    assert_eq!(next.order_index, 1);

    let (files, chats) = db.attachment_references().unwrap();
    assert!(files.is_empty());
    assert!(chats.contains(&session.id));

    let empty = db
        .create_chat_session_with_greeting("ayu", "Leer", Some("   "))
        .unwrap();
    assert_eq!(empty.message_count, 0);
}
