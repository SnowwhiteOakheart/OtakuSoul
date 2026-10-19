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
    assert!(has_column(&conn, "chat_sessions", "members_json").unwrap());
    assert!(has_column(&conn, "chat_messages", "speaker_id").unwrap());
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

    let jsonl = db
        .export_chat_jsonl(&session.id, "Ayu", "Hiroki", &Default::default())
        .unwrap();
    assert!(jsonl.contains("Reise nach Kyoto"));
    assert!(jsonl.contains("[Wetter ist sonnig]"));
    assert!(jsonl.contains("Kommst du mit zum Schrein?"));
    assert!(jsonl.contains("Sehr gern!"));
    assert!(jsonl.contains("Na klar doch!"));

    // Now import into new session
    let imported = db
        .import_chat_jsonl("ayu", &jsonl, None, &Default::default())
        .unwrap();
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
    assert_eq!(imp_msgs[1].swipes[0].thought.as_deref(), Some("Aufgeregt"));
    // Timestamps survive the round trip; SillyTavern finds the note and the reasoning.
    assert_eq!(imp_msgs[1].created_at, asst.created_at);
    assert!(jsonl.contains("\"note_prompt\":\"[Wetter ist sonnig]\""));
    assert!(jsonl.contains("\"reasoning\":\"Voller Energie\""));
}

#[test]
fn imports_a_sillytavern_chat() {
    let db = MemoryDb::new_in_memory().expect("in-memory db failed");
    // As SillyTavern writes it: text dates, reasoning per swipe, a hidden system line.
    let jsonl = [
        r#"{"user_name":"Kai","character_name":"Ayu","create_date":"2026-10-01@12h00m00s","chat_metadata":{"note_prompt":"Es regnet.","note_depth":4}}"#,
        r#"{"name":"Ayu","is_user":false,"send_date":"October 1, 2026 12:00pm","mes":"Hallo!"}"#,
        r#"{"name":"Kai","is_user":true,"send_date":"October 1, 2026 12:05pm","mes":"Hi"}"#,
        r#"{"name":"System","is_user":false,"is_system":true,"send_date":"October 1, 2026 12:06pm","mes":"(versteckt)"}"#,
        r#"{"name":"Ayu","is_user":false,"send_date":"October 1, 2026 12:07pm","mes":"B","swipe_id":1,"swipes":["A","B"],"swipe_info":[{"extra":{"reasoning":"erst"}},{"extra":{"reasoning":"dann"}}],"extra":{"reasoning":"dann"}}"#,
    ]
    .join("\n");
    let chat = db
        .import_chat_jsonl("ayu", &jsonl, Some("Aus ST"), &Default::default())
        .unwrap();
    assert_eq!(
        (chat.author_note.as_str(), chat.author_note_depth),
        ("Es regnet.", 4)
    );
    let messages = db.get_chat_messages(&chat.id).unwrap();
    let roles: Vec<&str> = messages.iter().map(|m| m.role.as_str()).collect();
    assert_eq!(roles, ["assistant", "user", "assistant"]);
    assert_eq!(messages[2].content, "B");
    assert_eq!(messages[2].thought.as_deref(), Some("dann"));
    assert_eq!(messages[2].swipes[0].thought.as_deref(), Some("erst"));
    assert_eq!(messages[1].created_at - messages[0].created_at, 5 * 60);
}

#[test]
fn send_dates_in_every_known_form() {
    use crate::modules::memory::chats::send_date_secs;
    use serde_json::json;
    assert_eq!(
        send_date_secs(&json!(1_760_000_000_000u64)),
        Some(1_760_000_000)
    );
    assert_eq!(
        send_date_secs(&json!(1_760_000_000u64)),
        Some(1_760_000_000)
    );
    assert_eq!(
        send_date_secs(&json!("2026-10-01T12:00:00Z")),
        Some(1_790_856_000)
    );
    assert!(send_date_secs(&json!("October 1, 2026 9:05am")).is_some());
    assert!(send_date_secs(&json!("2026-10-01@12h00m00s")).is_some());
    assert_eq!(send_date_secs(&json!("gestern")), None);
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
        .create_chat_session_with_greeting("ayu", "Neu", &["  Hallo!  ", " ", "Na du?"])
        .unwrap();
    assert_eq!(session.message_count, 1);
    let messages = db.get_chat_messages(&session.id).unwrap();
    assert_eq!(messages.len(), 1);
    assert_eq!(
        (messages[0].role.as_str(), messages[0].content.as_str()),
        ("assistant", "Hallo!")
    );
    // Alternative greetings are swipes of the first message; empty ones are skipped.
    let swipes: Vec<&str> = messages[0]
        .swipes
        .iter()
        .map(|s| s.content.as_str())
        .collect();
    assert_eq!(swipes, ["Hallo!", "Na du?"]);
    assert_eq!(messages[0].swipe_index, 0);
    // The greeting is a normal first message: the next one follows it.
    let next = db
        .add_chat_message(&session.id, "user", "Hi", None, &[])
        .unwrap();
    assert_eq!(next.order_index, 1);

    let (files, chats) = db.attachment_references().unwrap();
    assert!(files.is_empty());
    assert!(chats.contains(&session.id));

    let empty = db
        .create_chat_session_with_greeting("ayu", "Leer", &["   "])
        .unwrap();
    assert_eq!(empty.message_count, 0);
}

#[test]
fn a_failed_chat_import_leaves_no_partial_chat() {
    let db = MemoryDb::new_in_memory().expect("in-memory db failed");
    db.conn
        .lock()
        .execute_batch(
            "CREATE TRIGGER fail_import BEFORE INSERT ON chat_messages WHEN NEW.content = 'BOOM'
             BEGIN SELECT RAISE(ABORT, 'late import failure'); END;",
        )
        .unwrap();
    let jsonl = "{\"mes\":\"Hallo\",\"is_user\":true}\n{\"mes\":\"BOOM\",\"is_user\":false}";
    assert!(
        db.import_chat_jsonl("ayu", jsonl, Some("Kaputt"), &Default::default())
            .is_err()
    );
    assert!(db.list_chat_sessions("ayu").unwrap().is_empty());
}

#[test]
fn a_failed_reflection_write_changes_nothing() {
    let db = MemoryDb::new_in_memory().expect("in-memory db failed");
    let mut psych = db.get_or_create_psychology("ayu").unwrap();
    let before = psych.primary_emotion.clone();
    psych.primary_emotion = "Euphorisch".into();
    db.conn
        .lock()
        .execute_batch(
            "CREATE TRIGGER fail_diary BEFORE INSERT ON soul_diary
             BEGIN SELECT RAISE(ABORT, 'late reflection failure'); END;",
        )
        .unwrap();
    let topics = vec![TopicMemory {
        key: Some("kyoto".into()),
        text: "[Thema: Kyoto]\nReise geplant".to_string(),
    }];
    let healing = vec!["Widerspruch gelöst".to_string()];
    let result = db.apply_reflection(
        "ayu",
        &ReflectionChanges {
            psychology: Some(&psych),
            relationship: None,
            healing: &healing,
            topics: &topics,
            supersede: &[],
            intentions: None,
            source: MemorySource::auto(),
            diary: Some(("Innere Reflexion", "Heute war schön.", "Euphorisch")),
        },
    );
    assert!(result.is_err());
    assert_eq!(
        db.get_or_create_psychology("ayu").unwrap().primary_emotion,
        before
    );
    assert!(db.get_episodic_memories("ayu", 10).unwrap().is_empty());
    assert!(db.get_healing_logs("ayu", 10).unwrap().is_empty());

    db.conn
        .lock()
        .execute_batch("DROP TRIGGER fail_diary;")
        .unwrap();
    let diary = db
        .apply_reflection(
            "ayu",
            &ReflectionChanges {
                psychology: Some(&psych),
                relationship: None,
                healing: &healing,
                topics: &topics,
                supersede: &[],
                intentions: None,
                source: MemorySource::auto(),
                diary: Some(("Innere Reflexion", "Heute war schön.", "Euphorisch")),
            },
        )
        .unwrap();
    assert!(diary.diary.is_some());
    assert_eq!(
        db.get_or_create_psychology("ayu").unwrap().primary_emotion,
        "Euphorisch"
    );
    assert_eq!(db.get_episodic_memories("ayu", 10).unwrap().len(), 1);
}

#[test]
fn chat_style_is_stored_reset_and_kept_by_a_branch() {
    let db = MemoryDb::new_in_memory().expect("in-memory db failed");
    let chat = db
        .create_chat_session_with_greeting("ayu", "Kyoto", &["Hallo"])
        .unwrap();
    assert!(chat.style.is_none());
    let style = ChatStyle {
        background: Some("tempel.png".into()),
        background_dim: 40,
        text_size: "large".into(),
        bubbles: "subtle".into(),
        ambient: Some("regen.ogg".into()),
        ambient_volume: 30,
        reply_length: "short".into(),
    };
    db.update_chat_style(&chat.id, Some(&style)).unwrap();
    assert_eq!(
        db.get_chat_session(&chat.id).unwrap().unwrap().style,
        Some(style.clone())
    );
    assert_eq!(
        db.list_chat_sessions("ayu").unwrap()[0].style,
        Some(style.clone())
    );

    let first = db.get_chat_messages(&chat.id).unwrap()[0].id.clone();
    let branch = db.branch_chat(&chat.id, &first, "Abzweig").unwrap();
    assert_eq!(branch.style, Some(style));

    // Defaults are stored as "no style".
    db.update_chat_style(&chat.id, Some(&ChatStyle::default()))
        .unwrap();
    assert!(
        db.get_chat_session(&chat.id)
            .unwrap()
            .unwrap()
            .style
            .is_none()
    );
    assert!(db.update_chat_style("gibt-es-nicht", None).is_err());
}

#[test]
fn group_chats_keep_guests_and_speakers() {
    let db = MemoryDb::new_in_memory().expect("in-memory db failed");
    let chat = db
        .create_chat_session_with_greeting("ayu", "Gruppe", &["Hallo!"])
        .unwrap();
    // The chat's own character, duplicates and empty IDs are left out.
    let members = db
        .set_chat_members(
            &chat.id,
            &[
                "sora".into(),
                "ayu".into(),
                "sora".into(),
                " ".into(),
                "shiro".into(),
            ],
        )
        .unwrap();
    assert_eq!(members, ["sora", "shiro"]);
    assert_eq!(
        db.get_chat_session(&chat.id).unwrap().unwrap().members,
        members
    );
    assert_eq!(db.list_chat_sessions("ayu").unwrap()[0].members, members);
    let many: Vec<String> = (0..9).map(|i| format!("gast{i}")).collect();
    assert_eq!(
        db.set_chat_members(&chat.id, &many).unwrap().len(),
        MAX_CHAT_GUESTS
    );
    db.set_chat_members(&chat.id, &["sora".into()]).unwrap();

    db.add_chat_message(&chat.id, "user", "Sora, was meinst du?", None, &[])
        .unwrap();
    let reply = db
        .add_chat_message_by(&chat.id, "assistant", "Ich bin dabei.", None, &[], "sora")
        .unwrap();
    assert_eq!(reply.speaker_id, "sora");
    // A new variant or a switch keeps the speaker.
    assert_eq!(
        db.add_message_swipe(&reply.id, "Klar!", None)
            .unwrap()
            .speaker_id,
        "sora"
    );
    assert_eq!(
        db.switch_message_swipe(&reply.id, 0).unwrap().speaker_id,
        "sora"
    );
    assert_eq!(
        db.update_chat_message(&reply.id, "Bin dabei.", None)
            .unwrap()
            .speaker_id,
        "sora"
    );
    let messages = db.get_chat_messages(&chat.id).unwrap();
    assert_eq!(
        (
            messages[0].speaker_id.as_str(),
            messages[2].speaker_id.as_str()
        ),
        ("", "sora")
    );

    // A branch keeps guests and speakers.
    let branch = db.branch_chat(&chat.id, &reply.id, "Zweig").unwrap();
    assert_eq!(branch.members, ["sora"]);
    assert_eq!(
        db.get_chat_messages(&branch.id).unwrap()[2].speaker_id,
        "sora"
    );

    // Export names the speaker; the import finds guests by ID or by name (SillyTavern).
    let names = std::collections::HashMap::from([("sora".to_string(), "Sora".to_string())]);
    let jsonl = db
        .export_chat_jsonl(&chat.id, "Ayu", "Kai", &names)
        .unwrap();
    assert!(jsonl.contains("\"name\":\"Sora\""));
    let back = db
        .import_chat_jsonl("ayu", &jsonl, None, &Default::default())
        .unwrap();
    assert_eq!(back.members, ["sora"]);
    let st = [
        r#"{"user_name":"Kai","character_name":"Ayu","chat_metadata":{}}"#,
        r#"{"name":"Ayu","is_user":false,"mes":"Hallo!"}"#,
        r#"{"name":"Sora","is_user":false,"mes":"Hi!"}"#,
        r#"{"name":"Fremd","is_user":false,"mes":"Wer bin ich?"}"#,
    ]
    .join("\n");
    let known = std::collections::HashMap::from([
        ("sora".to_string(), "sora".to_string()),
        ("ayu".to_string(), "ayu".to_string()),
    ]);
    let imported = db.import_chat_jsonl("ayu", &st, None, &known).unwrap();
    assert_eq!(imported.members, ["sora"]);
    let speakers: Vec<String> = db
        .get_chat_messages(&imported.id)
        .unwrap()
        .into_iter()
        .map(|m| m.speaker_id)
        .collect();
    assert_eq!(speakers, ["", "sora", ""]);
}

#[test]
fn a_snapshot_keeps_every_memory() {
    let db = MemoryDb::new_in_memory().unwrap();
    let dir =
        std::env::temp_dir().join(format!("otakusoul_snapshot_all_{}", rand::random::<u32>()));
    std::fs::create_dir_all(&dir).unwrap();
    for i in 0..150 {
        db.add_episodic_memory("ayu", "fact", &format!("Erinnerung {i}"), 3)
            .unwrap();
    }
    let backup = db
        .backup_memory_state("ayu", Some("User"), Some(&dir))
        .unwrap();
    let json = std::fs::read_to_string(dir.join(&backup.filename)).unwrap();
    let snapshot: MemoryBackupSnapshot = serde_json::from_str(&json).unwrap();
    assert_eq!(snapshot.episodic_memories.len(), 150);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn fts_query_quotes_words_and_drops_filler() {
    use super::recall::fts_query;
    assert_eq!(
        fts_query("Welchen Tee magst du? Ich mag Tee!").as_deref(),
        Some("\"welchen\" OR \"tee\" OR \"magst\" OR \"mag\"")
    );
    // FTS syntax and quotes cannot break out of the query.
    assert_eq!(
        fts_query("\"NEAR(a b)\" OR * col:wert").as_deref(),
        Some("\"near\" OR \"col\" OR \"wert\"")
    );
    assert_eq!(fts_query("Где ты живёшь?").as_deref(), Some("\"живёшь\""));
    assert_eq!(fts_query("ja, ok 🙂"), None);
}

#[test]
fn recall_finds_an_old_memory_that_fits_before_newer_ones() {
    let db = MemoryDb::new_in_memory().unwrap();
    let old = db
        .add_episodic_memory("ayu", "fact", "Ihr Lieblingstee ist Jasmintee", 3)
        .unwrap();
    for i in 0..20 {
        db.add_episodic_memory(
            "ayu",
            "event",
            &format!("Spaziergang am Fluss Nummer {i}"),
            4,
        )
        .unwrap();
    }
    db.add_episodic_memory("sora", "fact", "Sora trinkt nur Tee", 3)
        .unwrap();

    // A part of a word is enough ("Tee" in "Lieblingstee"), other characters stay apart.
    let hits = db
        .search_episodic_memories("ayu", "Welchen Tee magst du?", 10)
        .unwrap();
    assert_eq!(hits.iter().map(|m| m.id).collect::<Vec<_>>(), [old]);

    let picked = db
        .select_prompt_memories("ayu", "Welchen Tee magst du?", PROMPT_MEMORY_BUDGET)
        .unwrap();
    assert_eq!(picked.relevant.first().map(|m| m.id), Some(old));
    assert!(!picked.core.iter().any(|m| m.id == old));
}

#[test]
fn recall_ignores_accents_and_cyrillic_case() {
    let db = MemoryDb::new_in_memory().unwrap();
    let cafe = db
        .add_episodic_memory("ayu", "fact", "Trifft sich gern im Café Mond", 3)
        .unwrap();
    let moscow = db
        .add_episodic_memory("ayu", "fact", "Выросла в Москве", 3)
        .unwrap();
    assert_eq!(
        db.search_episodic_memories("ayu", "cafe", 5).unwrap()[0].id,
        cafe
    );
    assert_eq!(
        db.search_episodic_memories("ayu", "москве", 5).unwrap()[0].id,
        moscow
    );
}

#[test]
fn recall_keeps_the_index_in_sync_with_edits_and_forgetting() {
    let db = MemoryDb::new_in_memory().unwrap();
    let id = db
        .add_episodic_memory("ayu", "fact", "Wohnt in München", 3)
        .unwrap();
    db.update_episodic_memory("ayu", id, "fact", "Wohnt in Hamburg", 3)
        .unwrap();
    assert!(
        db.search_episodic_memories("ayu", "München", 5)
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        db.search_episodic_memories("ayu", "Hamburg", 5).unwrap()[0].id,
        id
    );
    db.forget_episodic_memory("ayu", id).unwrap();
    assert!(
        db.search_episodic_memories("ayu", "Hamburg", 5)
            .unwrap()
            .is_empty()
    );
    db.conn
        .lock()
        .execute(
            "INSERT INTO soul_episodic_memory_fts(soul_episodic_memory_fts) VALUES ('integrity-check')",
            [],
        )
        .unwrap();
}

#[test]
fn prompt_memories_keep_pins_a_stable_core_and_the_budget() {
    let db = MemoryDb::new_in_memory().unwrap();
    let pinned = db
        .add_episodic_memory("ayu", "fact", "Angepinnt", 1)
        .unwrap();
    db.set_episodic_memory_pinned("ayu", pinned, true).unwrap();
    for i in 0..40 {
        db.add_episodic_memory(
            "ayu",
            "event",
            &format!("Ereignis {i} {}", "x".repeat(300)),
            3,
        )
        .unwrap();
    }
    let budget = MemoryBudget {
        tokens: 600,
        shown_chars: usize::MAX,
    };
    let a = db
        .select_prompt_memories("ayu", "Ereignis 7", budget)
        .unwrap();
    let b = db
        .select_prompt_memories("ayu", "etwas ganz anderes", budget)
        .unwrap();
    assert_eq!(a.core.first().map(|m| m.id), Some(pinned));
    assert_eq!(
        a.core.iter().map(|m| m.id).collect::<Vec<_>>(),
        b.core.iter().map(|m| m.id).collect::<Vec<_>>()
    );
    let tokens: usize = a
        .core
        .iter()
        .chain(&a.relevant)
        .map(|m| crate::modules::context_window::estimate_tokens(&m.content) + 4)
        .sum();
    assert!(tokens <= 600, "{tokens} tokens");
    assert!(!a.relevant.is_empty());
}

#[test]
fn memory_index_migration_skips_databases_without_memories() {
    let conn = Connection::open_in_memory().unwrap();
    super::schema::migrate_v7_memory_fts(&conn).unwrap();
    assert!(!has_column(&conn, "soul_episodic_memory_fts", "content").unwrap());
}

#[test]
fn memory_index_migration_indexes_existing_memories() {
    let conn = Connection::open_in_memory().unwrap();
    super::schema::migrate_v1_baseline(&conn).unwrap();
    conn.execute(
        "INSERT INTO soul_episodic_memory (character_id, content, created_at, last_accessed_at) VALUES ('ayu', 'Mag Erdbeeren', 1, 1)",
        [],
    )
    .unwrap();
    super::schema::migrate_v7_memory_fts(&conn).unwrap();
    let found: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM soul_episodic_memory_fts WHERE soul_episodic_memory_fts MATCH '\"erdbeer\"'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(found, 1);
}

fn reflect(db: &MemoryDb, topics: &[TopicMemory], supersede: &[MemorySupersede]) -> usize {
    db.apply_reflection(
        "ayu",
        &ReflectionChanges {
            psychology: None,
            relationship: None,
            healing: &[],
            topics,
            supersede,
            intentions: None,
            source: MemorySource::auto(),
            diary: None,
        },
    )
    .unwrap()
    .contradictions
}

fn topic(key: &str, text: &str) -> TopicMemory {
    TopicMemory {
        key: Some(key.into()),
        text: format!("[Thema: {key}]\n{text}"),
    }
}

#[test]
fn topic_keys_come_from_file_names_and_headers() {
    assert_eq!(
        normalize_topic_key(" Wohnort-Kai.md ").as_deref(),
        Some("wohnort_kai")
    );
    assert_eq!(normalize_topic_key("  .md"), None);
    assert_eq!(
        super::soul::topic_key_of_content("[Тема: Дом Кая]\nТекст").as_deref(),
        Some("дом_кая")
    );
    assert_eq!(
        topic_body("[Topic: home.md]\nLives in Hamburg"),
        "Lives in Hamburg"
    );
    assert_eq!(topic_body("No header"), "No header");
}

#[test]
fn a_new_topic_version_supersedes_the_old_one() {
    let db = MemoryDb::new_in_memory().unwrap();
    reflect(&db, &[topic("wohnort", "Kai wohnt in München")], &[]);
    let old = db.get_episodic_memories("ayu", 10).unwrap()[0].id;
    reflect(
        &db,
        &[topic("wohnort", "Kai ist nach Hamburg gezogen")],
        &[],
    );

    let active = db.get_episodic_memories("ayu", 10).unwrap();
    assert_eq!(active.len(), 1);
    assert!(active[0].content.contains("Hamburg"));
    assert_eq!(active[0].topic_key.as_deref(), Some("wohnort"));
    let outdated = db.get_superseded_memories("ayu", 10).unwrap();
    assert_eq!(outdated.len(), 1);
    assert_eq!(
        (outdated[0].id, outdated[0].superseded_by),
        (old, Some(active[0].id))
    );
    // Outdated memories are found neither by the prompt nor by the search.
    let picked = db
        .select_prompt_memories("ayu", "Wo wohnt Kai, München?", PROMPT_MEMORY_BUDGET)
        .unwrap();
    assert!(
        !picked
            .core
            .iter()
            .chain(&picked.relevant)
            .any(|m| m.id == old)
    );
    assert!(
        db.search_episodic_memories("ayu", "München", 5)
            .unwrap()
            .is_empty()
    );
    let history = db.get_memory_history("ayu", old).unwrap();
    assert_eq!(history.last().unwrap().action, "superseded");
}

#[test]
fn the_router_can_retire_a_memory_but_not_a_protected_or_foreign_one() {
    let db = MemoryDb::new_in_memory().unwrap();
    let auto = db
        .add_episodic_memory("ayu", "fact", "Kai hat einen Hund", 3)
        .unwrap();
    let manual = db
        .add_episodic_memory_from("ayu", "fact", "Kai mag Katzen", 3, &MemorySource::manual())
        .unwrap();
    let foreign = db
        .add_episodic_memory("sora", "fact", "Sora hat einen Hund", 3)
        .unwrap();
    let supersede = |id: i64| MemorySupersede {
        id,
        reason: "Der Hund ist gestorben".into(),
        replaced_by_topic: Some("Haustiere.md".into()),
    };
    reflect(
        &db,
        &[topic("haustiere", "Kai trauert um seinen Hund")],
        &[
            supersede(auto),
            supersede(manual),
            supersede(foreign),
            supersede(9999),
        ],
    );

    let outdated = db.get_superseded_memories("ayu", 10).unwrap();
    assert_eq!(outdated.iter().map(|m| m.id).collect::<Vec<_>>(), [auto]);
    assert_eq!(outdated[0].supersede_reason, "Der Hund ist gestorben");
    let successor = db.active_topic_memory("ayu", "haustiere").unwrap().unwrap();
    assert_eq!(outdated[0].superseded_by, Some(successor.id));
    let kept = db.get_episodic_memories("ayu", 10).unwrap();
    let manual_now = kept.iter().find(|m| m.id == manual).unwrap();
    assert!(manual_now.needs_review && manual_now.superseded_at.is_none());
    assert_eq!(manual_now.supersede_reason, "Der Hund ist gestorben");
    // Keeping it clears the hint and its reason.
    db.confirm_episodic_memory("ayu", manual).unwrap();
    let confirmed = db.get_episodic_memories("ayu", 10).unwrap();
    let confirmed = confirmed.iter().find(|m| m.id == manual).unwrap();
    assert!(!confirmed.needs_review && confirmed.supersede_reason.is_empty());
    assert!(db.get_superseded_memories("sora", 10).unwrap().is_empty());

    db.restore_superseded_memory("ayu", auto).unwrap();
    assert!(db.get_superseded_memories("ayu", 10).unwrap().is_empty());
    assert_eq!(
        db.get_memory_history("ayu", auto)
            .unwrap()
            .last()
            .unwrap()
            .action,
        "restored"
    );
}

#[test]
fn forgetting_a_successor_unlinks_the_outdated_version() {
    let db = MemoryDb::new_in_memory().unwrap();
    reflect(&db, &[topic("tee", "Mag Grüntee")], &[]);
    reflect(&db, &[topic("tee", "Mag Jasmintee")], &[]);
    let newest = db.active_topic_memory("ayu", "tee").unwrap().unwrap();
    db.forget_episodic_memory("ayu", newest.id).unwrap();
    let outdated = db.get_superseded_memories("ayu", 10).unwrap();
    assert_eq!(outdated.len(), 1);
    assert_eq!(outdated[0].superseded_by, None);
}

#[test]
fn migration_v8_keeps_only_the_newest_version_of_a_topic() {
    let conn = Connection::open_in_memory().unwrap();
    for step in &MIGRATIONS[..7] {
        step(&conn).unwrap();
    }
    conn.execute_batch(
        "INSERT INTO soul_episodic_memory (character_id, category, content, created_at, last_accessed_at, origin)
         VALUES ('ayu', 'topic', '[Thema: kyoto.md]\nalt', 1, 1, 'auto'),
                ('ayu', 'topic', '[Topic: Kyoto]\nneu', 2, 2, 'auto'),
                ('ayu', 'topic', '[Thema: kyoto]\nvom Nutzer', 3, 3, 'edited'),
                ('sora', 'topic', '[Thema: kyoto]\nSora', 4, 4, 'auto'),
                ('ayu', 'fact', 'Mag Kyoto', 5, 5, 'auto');",
    )
    .unwrap();
    super::schema::migrate_v8_memory_versions(&conn).unwrap();
    let rows: Vec<(i64, Option<String>, Option<i64>)> = conn
        .prepare("SELECT id, topic_key, superseded_by FROM soul_episodic_memory ORDER BY id")
        .unwrap()
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    // The newest (an edited one) stays, the edited one is never retired automatically.
    assert_eq!(
        rows,
        [
            (1, Some("kyoto".into()), Some(3)),
            (2, Some("kyoto".into()), Some(3)),
            (3, Some("kyoto".into()), None),
            (4, Some("kyoto".into()), None),
            (5, None, None),
        ]
    );
}

#[test]
fn a_snapshot_restores_outdated_memories_with_their_successor() {
    let db = MemoryDb::new_in_memory().unwrap();
    let dir = std::env::temp_dir().join(format!(
        "otakusoul_snapshot_versions_{}",
        rand::random::<u32>()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    reflect(&db, &[topic("wohnort", "München")], &[]);
    reflect(&db, &[topic("wohnort", "Hamburg")], &[]);
    let backup = db
        .backup_memory_state("ayu", Some("User"), Some(&dir))
        .unwrap();

    let fresh = MemoryDb::new_in_memory().unwrap();
    // Ids differ in the other database.
    fresh
        .add_episodic_memory("ayu", "fact", "Platzhalter", 1)
        .unwrap();
    fresh
        .restore_memory_backup(&dir.join(&backup.filename))
        .unwrap();
    let active = fresh
        .active_topic_memory("ayu", "wohnort")
        .unwrap()
        .unwrap();
    assert!(active.content.contains("Hamburg"));
    let outdated = fresh.get_superseded_memories("ayu", 10).unwrap();
    assert_eq!(outdated.len(), 1);
    assert!(outdated[0].content.contains("München"));
    assert_eq!(outdated[0].superseded_by, Some(active.id));
    // Restoring again changes nothing.
    fresh
        .restore_memory_backup(&dir.join(&backup.filename))
        .unwrap();
    assert_eq!(fresh.get_superseded_memories("ayu", 10).unwrap().len(), 1);
    assert_eq!(fresh.get_episodic_memories("ayu", 10).unwrap().len(), 2);
    let _ = std::fs::remove_dir_all(&dir);
}

fn local(y: i32, m: u32, d: u32, h: u32, min: u32) -> chrono::DateTime<chrono::Local> {
    use chrono::TimeZone;
    chrono::Local.with_ymd_and_hms(y, m, d, h, min, 0).unwrap()
}

fn plan(title: &str, basis: &str, due: Option<(u64, bool)>) -> IntentionDraft {
    IntentionDraft {
        title: title.into(),
        details: String::new(),
        initiator: "user".into(),
        time_basis: basis.into(),
        due_at: due.map(|(at, _)| at),
        due_has_time: due.is_some_and(|(_, t)| t),
    }
}

#[test]
fn due_dates_are_read_in_local_time_and_must_lie_ahead() {
    let now = local(2026, 10, 19, 14, 0);
    assert_eq!(
        parse_due("2026-10-20", now),
        Some((local(2026, 10, 20, 0, 0).timestamp() as u64, false))
    );
    assert_eq!(
        parse_due(" 2026-10-20T18:30 ", now),
        Some((local(2026, 10, 20, 18, 30).timestamp() as u64, true))
    );
    // Today counts as a day; a time earlier today has passed.
    assert!(parse_due("2026-10-19", now).is_some());
    assert_eq!(parse_due("2026-10-19 09:00", now), None);
    assert_eq!(parse_due("2026-10-18", now), None);
    assert_eq!(parse_due("nächsten Montag", now), None);
}

#[test]
fn due_labels_follow_the_clock() {
    use super::intentions::due_label;
    let now = local(2026, 10, 19, 14, 0); // a Monday
    let entry = |basis: &str, due: Option<chrono::DateTime<chrono::Local>>, has_time: bool| {
        IntentionEntry {
            id: 1,
            character_id: "ayu".into(),
            user_name: "Kai".into(),
            title: "Kochen".into(),
            details: String::new(),
            initiator: "user".into(),
            time_basis: basis.into(),
            status: "pending".into(),
            due_at: due.map(|d| d.timestamp() as u64),
            due_has_time: has_time,
            origin: "auto".into(),
            source_chat_id: None,
            created_at: 0,
            resolved_at: None,
            memory_id: None,
        }
    };
    let day = |d: u32| Some(local(2026, 10, d, 0, 0));
    assert_eq!(due_label(&entry("real", day(19), false), now), "due today");
    assert_eq!(
        due_label(&entry("real", Some(local(2026, 10, 19, 18, 0)), true), now),
        "due today at 18:00"
    );
    assert_eq!(
        due_label(&entry("real", Some(local(2026, 10, 19, 9, 0)), true), now),
        "overdue since today at 09:00"
    );
    assert_eq!(
        due_label(&entry("real", day(20), false), now),
        "due tomorrow"
    );
    assert_eq!(
        due_label(&entry("real", day(18), false), now),
        "overdue since yesterday"
    );
    assert_eq!(
        due_label(&entry("real", day(23), false), now),
        "due on Friday"
    );
    assert_eq!(
        due_label(&entry("real", day(30), false), now),
        "due on 2026-10-30"
    );
    assert_eq!(due_label(&entry("real", None, false), now), "open");
    assert_eq!(
        due_label(&entry("story", day(20), false), now),
        "open in the story"
    );
}

#[test]
fn an_intention_lives_until_it_becomes_a_memory() {
    let db = MemoryDb::new_in_memory().unwrap();
    let id = db
        .add_intention("ayu", "Kai", &plan("Zusammen kochen", "real", None))
        .unwrap()
        .unwrap();
    // The same open plan is not added twice; a story plan never keeps a date.
    assert_eq!(
        db.add_intention("ayu", "Kai", &plan(" zusammen KOCHEN ", "real", None))
            .unwrap(),
        Some(id)
    );
    let story = db
        .add_intention(
            "ayu",
            "Kai",
            &plan("Zur Burg reiten", "story", Some((1, false))),
        )
        .unwrap()
        .unwrap();
    let open = db.get_intentions("ayu", "Kai", false).unwrap();
    assert_eq!(open.len(), 2);
    assert_eq!(open.iter().find(|e| e.id == story).unwrap().due_at, None);
    assert!(db.get_intentions("ayu", "Mira", false).unwrap().is_empty());

    assert!(db.set_intention_status("ayu", id, "fulfilled").unwrap());
    assert!(
        !db.set_intention_status("ayu", id, "abandoned").unwrap(),
        "only open ones change"
    );
    assert!(
        !db.set_intention_status("ayu", story, "pending").unwrap(),
        "no such status"
    );
    let done = db
        .get_intentions("ayu", "Kai", true)
        .unwrap()
        .into_iter()
        .find(|e| e.id == id)
        .unwrap();
    assert_eq!(done.status, "fulfilled");
    let memory = db.get_episodic_memories("ayu", 10).unwrap();
    assert_eq!(memory.len(), 1);
    assert_eq!(done.memory_id, Some(memory[0].id));
    assert_eq!(memory[0].category, "promise");
    assert!(memory[0].content.contains("Zusammen kochen"));
}

#[test]
fn missed_real_intentions_expire_with_grace_but_story_ones_never() {
    let db = MemoryDb::new_in_memory().unwrap();
    let now = local(2026, 10, 19, 14, 0);
    let ts = |d: chrono::DateTime<chrono::Local>| d.timestamp() as u64;
    let yesterday = db
        .add_intention(
            "ayu",
            "Kai",
            &plan(
                "Gestern anrufen",
                "real",
                Some((ts(local(2026, 10, 18, 0, 0)), false)),
            ),
        )
        .unwrap()
        .unwrap();
    let two_days = db
        .add_intention(
            "ayu",
            "Kai",
            &plan(
                "Vorgestern einkaufen",
                "real",
                Some((ts(local(2026, 10, 17, 0, 0)), false)),
            ),
        )
        .unwrap()
        .unwrap();
    let this_morning = db
        .add_intention(
            "ayu",
            "Kai",
            &plan(
                "Arzt um acht",
                "real",
                Some((ts(local(2026, 10, 19, 8, 0)), true)),
            ),
        )
        .unwrap()
        .unwrap();
    let early = db
        .add_intention(
            "ayu",
            "Kai",
            &plan(
                "Frühstück um sechs",
                "real",
                Some((ts(local(2026, 10, 19, 6, 0)), true)),
            ),
        )
        .unwrap()
        .unwrap();
    db.add_intention("ayu", "Kai", &plan("Drachen besiegen", "story", None))
        .unwrap();

    let prompt = db.prompt_intentions("ayu", "Kai", now).unwrap();
    let titles: Vec<&str> = prompt.iter().map(|p| p.title.as_str()).collect();
    // Due soonest first, story plans after; missed ones are gone from the prompt.
    assert_eq!(
        titles,
        ["Gestern anrufen", "Arzt um acht", "Drachen besiegen"]
    );
    assert_eq!(prompt[0].label, "overdue since yesterday");
    // Read without `get_intentions`: it expires against the real clock, not `now`.
    let all = MemoryDb::list_intentions_on(&db.conn.lock(), "ayu", "Kai", true).unwrap();
    let status = |id: i64| all.iter().find(|e| e.id == id).unwrap().status.clone();
    assert_eq!(status(yesterday), "pending");
    assert_eq!(status(this_morning), "pending");
    assert_eq!(status(two_days), "expired");
    assert_eq!(status(early), "expired");
    assert_eq!(db.get_episodic_memories("ayu", 10).unwrap().len(), 2);
}

#[test]
fn a_reflection_adds_and_resolves_only_its_own_intentions() {
    let db = MemoryDb::new_in_memory().unwrap();
    let own = db
        .add_intention("ayu", "Kai", &plan("Buch mitbringen", "story", None))
        .unwrap()
        .unwrap();
    let other_user = db
        .add_intention("ayu", "Mira", &plan("Tanzen gehen", "story", None))
        .unwrap()
        .unwrap();
    let other_char = db
        .add_intention("sora", "Kai", &plan("Schwimmen", "story", None))
        .unwrap()
        .unwrap();
    let changes = IntentionChanges {
        user_name: "Kai",
        create: vec![
            plan("Morgen kochen", "real", None),
            plan("  ", "story", None),
        ],
        resolve: vec![
            (own, "fulfilled".into()),
            (other_user, "fulfilled".into()),
            (other_char, "fulfilled".into()),
        ],
        source_chat_id: Some("c1"),
        now: chrono::Local::now(),
    };
    db.apply_reflection(
        "ayu",
        &ReflectionChanges {
            psychology: None,
            relationship: None,
            healing: &[],
            topics: &[],
            supersede: &[],
            intentions: Some(&changes),
            source: MemorySource::auto(),
            diary: None,
        },
    )
    .unwrap();
    let kai = db.get_intentions("ayu", "Kai", true).unwrap();
    assert_eq!(kai.len(), 2);
    let created = kai.iter().find(|e| e.title == "Morgen kochen").unwrap();
    assert_eq!(
        (created.origin.as_str(), created.source_chat_id.as_deref()),
        ("auto", Some("c1"))
    );
    assert_eq!(
        kai.iter().find(|e| e.id == own).unwrap().status,
        "fulfilled"
    );
    assert_eq!(db.get_intentions("ayu", "Mira", false).unwrap().len(), 1);
    assert_eq!(db.get_intentions("sora", "Kai", false).unwrap().len(), 1);
}

#[test]
fn a_cleanup_merges_overlapping_memories_and_keeps_them_restorable() {
    let db = MemoryDb::new_in_memory().unwrap();
    let a = db
        .add_episodic_memory("ayu", "topic", "[Thema: tee]\nMag Grüntee", 3)
        .unwrap();
    let b = db
        .add_episodic_memory("ayu", "fact", "Trinkt abends Jasmintee", 4)
        .unwrap();
    let manual = db
        .add_episodic_memory_from(
            "ayu",
            "fact",
            "Mag keinen Kaffee",
            3,
            &MemorySource::manual(),
        )
        .unwrap();
    let c = db
        .add_episodic_memory("ayu", "fact", "Hat eine Katze", 3)
        .unwrap();
    let foreign = db
        .add_episodic_memory("sora", "fact", "Sora mag Tee", 3)
        .unwrap();

    // The model only sees memories it may merge.
    let candidates: Vec<i64> = db
        .cleanup_candidates("ayu", 10_000)
        .unwrap()
        .iter()
        .map(|m| m.id)
        .collect();
    assert!(candidates.contains(&a) && candidates.contains(&c) && !candidates.contains(&manual));

    let group = |ids: Vec<i64>, summary: &str| CleanupGroup {
        memory_ids: ids,
        category: "topic".into(),
        title: "Tee".into(),
        summary: summary.into(),
    };
    let merged = db
        .apply_memory_cleanup(
            "ayu",
            &[
                group(vec![a, b], "Trinkt gern Grüntee, abends Jasmintee"),
                // A protected or foreign memory leaves too few to merge.
                group(vec![c, manual], "Katze und Kaffee"),
                group(vec![c, foreign], "Katze"),
            ],
        )
        .unwrap();
    assert_eq!(merged, 1);
    let tea = db.active_topic_memory("ayu", "tee").unwrap().unwrap();
    assert!(
        tea.content
            .ends_with("Trinkt gern Grüntee, abends Jasmintee")
    );
    assert_eq!(tea.significance, 4);
    let outdated = db.get_superseded_memories("ayu", 10).unwrap();
    assert_eq!(outdated.len(), 2);
    assert!(outdated.iter().all(|m| m.superseded_by == Some(tea.id)));
    let active: Vec<i64> = db
        .get_episodic_memories("ayu", 10)
        .unwrap()
        .iter()
        .map(|m| m.id)
        .collect();
    assert!(active.contains(&c) && active.contains(&manual));
    db.restore_superseded_memory("ayu", a).unwrap();
    assert_eq!(db.get_superseded_memories("ayu", 10).unwrap().len(), 1);
}

#[test]
fn cleanup_groups_need_two_known_memories_each_once() {
    let group = |ids: Vec<i64>, summary: &str| CleanupGroup {
        memory_ids: ids,
        summary: summary.into(),
        ..Default::default()
    };
    let valid = valid_cleanup_groups(
        vec![
            group(vec![1, 2, 99], "A"),
            group(vec![2, 3], "B"), // 2 is taken: only one left
            group(vec![3, 3, 4], "C"),
            group(vec![5, 6], "  "),
        ],
        &[1, 2, 3, 4, 5, 6],
    );
    let ids: Vec<Vec<i64>> = valid.iter().map(|g| g.memory_ids.clone()).collect();
    assert_eq!(ids, [vec![1, 2], vec![3, 4]]);
}
