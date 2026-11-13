use super::*;
use std::fs;
use std::path::Path;

#[test]
fn scene_names_find_cards_with_a_bracketed_full_name() {
    let profile = |name: &str| {
        CharacterProfile {
        id: name.to_lowercase(),
        card: serde_json::from_value(serde_json::json!({
            "spec": "chara_card_v2", "spec_version": "2.0",
            "data": {"name": name, "description": "", "personality": "", "scenario": "", "first_mes": ""}
        }))
        .unwrap(),
        avatar_data_url: None,
        avatar_path: None,
        source_path: None,
        bound_lorebooks: Vec::new(),
    }
    };
    let cards = vec![
        profile("Klein (Ryoutarou Tsuboi)"),
        profile("Kirito"),
        profile("Kirito (Kazuto Kirigaya)"),
    ];
    let id = |name: &str| super::find_by_name(&cards, name).map(|c| c.id.clone());
    assert_eq!(id("klein").as_deref(), Some("klein (ryoutarou tsuboi)"));
    assert_eq!(
        id("Klein (Ryoutarou Tsuboi)").as_deref(),
        Some("klein (ryoutarou tsuboi)")
    );
    // The exact name wins over a short one.
    assert_eq!(id("Kirito").as_deref(), Some("kirito"));
    assert_eq!(id("Asuna"), None);
}

#[test]
fn exported_cards_name_their_avatar_without_user_folders_or_vroid_models() {
    let card: CharacterCardV2 = serde_json::from_value(serde_json::json!({
        "spec": "chara_card_v2", "spec_version": "2.0",
        "data": {"name": "Export", "description": "", "personality": "", "scenario": "", "first_mes": "",
            "extensions": {
                "custom_vrm": "C:\\Users\\Someone\\AppData\\Roaming\\otakusoul\\avatars\\Lirwen.vrm",
                "sow_vrm": "vroid:5225889348359061944",
                "custom_live2d": "/home/someone/.local/share/otakusoul/live2d/hiyori/hiyori.model3.json",
                "custom_inochi2d": "Aka.inx",
                "custom_title": "C:\\keep\\me",
                "otakusoul_model_links": [{"kind": "live2d", "page_url": "https://www.live2d.com/en/learn/sample/"}]
            }}
    }))
    .unwrap();
    let clean = super::without_local_picture_paths(&card);
    let ext = &clean.data.extensions;
    assert_eq!(ext["custom_vrm"], "avatars/Lirwen.vrm");
    assert!(
        ext.get("sow_vrm").is_none(),
        "VRoid Hub models stay with their account"
    );
    assert_eq!(ext["custom_live2d"], "hiyori/hiyori.model3.json");
    assert_eq!(ext["custom_inochi2d"], "Aka.inx");
    assert_eq!(
        ext["custom_title"], "C:\\keep\\me",
        "other keys are untouched"
    );
    assert_eq!(
        ext["otakusoul_model_links"][0]["page_url"], "https://www.live2d.com/en/learn/sample/",
        "download pages travel with the card"
    );
    let text = serde_json::to_string(&clean).unwrap();
    assert!(!text.contains("Someone") && !text.contains("someone"));
}

#[test]
fn model_links_must_be_https_pages_of_a_known_kind() {
    let ext = serde_json::json!({"otakusoul_model_links": [
        {"kind": "live2d", "page_url": "https://www.live2d.com/en/learn/sample/hatsune-miku/"},
        {"kind": "vrm", "page_url": "http://example.com/model"},
        {"kind": "vrm", "page_url": "javascript:alert(1)"},
        {"kind": "pmx", "page_url": "https://example.com/"},
        {"kind": "inochi2d", "page_url": "https:///etc/passwd"},
        {"kind": "vrm"}
    ]});
    assert_eq!(
        super::invalid_model_links(&ext),
        [
            "http://example.com/model",
            "javascript:alert(1)",
            "https://example.com/",
            "https:///etc/passwd",
            "vrm"
        ]
    );
    assert!(super::invalid_model_links(&serde_json::json!({})).is_empty());
    assert_eq!(
        super::invalid_model_links(&serde_json::json!({"otakusoul_model_links": "https://x.y"})),
        ["otakusoul_model_links"]
    );
}

#[test]
fn exported_cards_carry_no_local_picture_paths() {
    let card: CharacterCardV2 = serde_json::from_value(serde_json::json!({
        "spec": "chara_card_v2", "spec_version": "2.0",
        "data": {"name": "Export", "description": "", "personality": "", "scenario": "", "first_mes": "",
            "extensions": {"expressions": {
                "happy": "/home/someone/presets/expressions/happy.webp",
                "sad": "https://example.org/sad.webp",
                "angry": "data:image/webp;base64,abc"
            }}
        }
    })).unwrap();
    let target = std::env::temp_dir().join(format!("otakusoul-export-{}.json", std::process::id()));
    let profile = CharacterProfile {
        id: "export".into(),
        card,
        avatar_data_url: None,
        avatar_path: None,
        source_path: None,
        bound_lorebooks: Vec::new(),
    };
    export_character_card(&profile, &target, false).unwrap();
    let written = std::fs::read_to_string(&target).unwrap();
    let _ = std::fs::remove_file(&target);
    assert!(!written.contains("/home/someone"));
    assert!(
        written.contains("https://example.org/sad.webp") && written.contains("data:image/webp")
    );
    // The card in the app keeps its pictures.
    assert!(profile.card.data.extensions["expressions"]["happy"].is_string());
}

#[test]
fn portrait_paths_survive_moving_a_card_to_the_user_folder() {
    let mut card: CharacterCardV2 = serde_json::from_value(serde_json::json!({
        "spec": "chara_card_v2", "spec_version": "2.0",
        "data": {"name": "Portrait", "description": "", "personality": "", "scenario": "", "first_mes": "",
            "extensions": {
                "expressions": {"happy": "expressions/happy.webp", "sad": "https://example.org/sad.webp"},
                "custom_expressions": {"angry": "custom/angry.png"},
                "sow_expressions": {"neutral": "data:image/png;base64,abc"}
            }
        }
    })).unwrap();
    let root = std::env::temp_dir().join("otakusoul-portrait-paths");
    resolve_profile_expression_paths(&mut card, &root.join("presets/card.json"));
    // Joined like the code does, so Windows separators match.
    let expected = root
        .join("presets")
        .join("expressions/happy.webp")
        .to_string_lossy()
        .to_string();
    assert_eq!(card.data.extensions["expressions"]["happy"], expected);
    // Resolving again after a save must retain the original directory.
    resolve_profile_expression_paths(&mut card, &root.join("user/card.png"));
    let (restored, _) =
        parse_character_png(&inject_character_metadata_png(&get_placeholder_png(), &card).unwrap())
            .unwrap();
    assert_eq!(restored.data.extensions["expressions"]["happy"], expected);
    assert_eq!(
        restored.data.extensions["expressions"]["sad"],
        "https://example.org/sad.webp"
    );
    assert_eq!(
        restored.data.extensions["custom_expressions"]["angry"],
        root.join("presets")
            .join("custom/angry.png")
            .to_string_lossy()
            .as_ref()
    );
    assert_eq!(
        restored.data.extensions["sow_expressions"]["neutral"],
        "data:image/png;base64,abc"
    );
}

#[test]
fn replacing_a_character_trashes_its_other_copies() {
    let root = std::env::temp_dir().join(format!("otakusoul-copies-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    let (dir, trash) = (root.join("characters"), root.join("trash"));
    fs::create_dir_all(&dir).unwrap();
    let card = |name: &str| {
        format!(
            r#"{{"spec":"chara_card_v2","spec_version":"2.0","data":{{"name":"{name}","description":"","personality":"","scenario":"","first_mes":"Hi","mes_example":""}}}}"#
        )
    };
    fs::write(dir.join("Ayu Ikue.png"), b"new").unwrap();
    fs::write(dir.join("Ayu Ikue.json"), card("Ayu Ikue")).unwrap();
    fs::write(dir.join("Ayu Ikue_1.json"), card("ayu ikue")).unwrap();
    fs::write(dir.join("Rin.json"), card("Rin")).unwrap();

    trash_other_copies(&dir, &trash, "Ayu Ikue", &dir.join("Ayu Ikue.png"));

    let mut left: Vec<_> = fs::read_dir(&dir)
        .unwrap()
        .flatten()
        .map(|e| e.file_name().into_string().unwrap())
        .collect();
    left.sort();
    assert_eq!(left, ["Ayu Ikue.png", "Rin.json"]);
    assert_eq!(
        fs::read_dir(&trash).unwrap().count(),
        2,
        "copies go to the trash, not away"
    );
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn missing_translations_fall_back_to_english_not_to_the_source() {
    let i18n = serde_json::json!({
        "source_language": "de",
        "translations": { "en": { "name": "Bell" }, "ru": { "name": "Колокол" } }
    });
    let pick = |lang| i18n_translation(Some(&i18n), lang).and_then(|t| t["name"].as_str());
    assert_eq!(pick("ru"), Some("Колокол"));
    // Japanese has none: English rather than the German base.
    assert_eq!(pick("ja"), Some("Bell"));
    // German is the source: its base text.
    assert_eq!(pick("de"), None);
    // Without a declared source the base stays (it may be the language asked for).
    let unknown = serde_json::json!({ "translations": { "en": { "name": "Bell" } } });
    assert!(i18n_translation(Some(&unknown), "ja").is_none());
}

#[test]
fn localizes_cards_and_falls_back_to_base_fields() {
    let card: CharacterData = serde_json::from_value(serde_json::json!({
        "name": "Ayu",
        "description": "Ein Idol.",
        "personality": "stolz",
        "scenario": "Tokio",
        "first_mes": "Hallo!",
        "tags": ["Idol"],
        "extensions": {
            "sow_title": "Top-Idol",
            "otakusoul_i18n": {
                "source_language": "de",
                "translations": {
                    "en": {"description": "An idol.", "first_mes": "", "tags": ["Idol", "English"], "sow_title": "Top idol"}
                }
            }
        }
    }))
    .unwrap();

    let en = card.localized("en");
    assert_eq!(en.description, "An idol.");
    // Empty or missing translated fields keep the base text.
    assert_eq!(en.first_mes, "Hallo!");
    assert_eq!(en.personality, "stolz");
    assert_eq!(en.tags, vec!["Idol", "English"]);
    assert_eq!(en.extensions["sow_title"], "Top idol");
    assert_eq!(en.extensions["custom_title"], "Top idol");
    // A language without a translation gets the English one, not the German base.
    assert_eq!(card.localized("ru").description, "An idol.");
    assert_eq!(card.localized("de").description, "Ein Idol.");
    // Plain imported cards are unchanged.
    let plain = CharacterData {
        description: "Plain".into(),
        ..Default::default()
    };
    assert_eq!(plain.localized("en").description, "Plain");
}

#[test]
fn test_png_metadata_injection_and_roundtrip() {
    let dummy_png = get_placeholder_png();
    let card = CharacterCardV2 {
        spec: "chara_card_v2".to_string(),
        spec_version: "2.0".to_string(),
        data: CharacterData {
            name: "Test Character".to_string(),
            description: "A test description".to_string(),
            personality: "Cheerful".to_string(),
            ..Default::default()
        },
    };

    let enriched =
        inject_character_metadata_png(&dummy_png, &card).expect("Injection into PNG failed");
    let (extracted_card, _) =
        parse_character_png(&enriched).expect("Extraction from enriched PNG failed");

    assert_eq!(extracted_card.data.name, "Test Character");
    assert_eq!(extracted_card.data.personality, "Cheerful");
}

#[test]
fn test_load_character_relative_paths() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
    let root = Path::new(&manifest_dir).parent().unwrap_or(Path::new("."));

    let json_path = root.join("presets/characters/shiori_amane.json");
    if json_path.exists() {
        let profile =
            load_character_from_file(&json_path).expect("Failed to load shiori_amane.json");
        assert_eq!(profile.card.data.name, "Shiori Amane");
        // Das Porträt liegt als relativer Pfad neben der JSON-Karte.
        assert!(profile.avatar_path.is_some());
    }
}

#[test]
fn test_starter_characters_load_with_expressions() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
    let dir = Path::new(&manifest_dir)
        .parent()
        .unwrap()
        .join("presets/characters");
    for (slug, name) in [
        ("shiori_amane", "Shiori Amane"),
        ("sota_minase", "Sota Minase"),
        ("lirwen", "Lirwen"),
        ("faelion", "Faelion"),
    ] {
        let profile = load_character_from_file(&dir.join(format!("{slug}.json")))
            .unwrap_or_else(|e| panic!("{slug}: {e}"));
        assert_eq!(profile.card.data.name, name);
        assert!(profile.avatar_path.is_some(), "{slug}: Avatar fehlt");
        let expressions = profile.card.data.extensions["expressions"]
            .as_object()
            .unwrap();
        assert_eq!(expressions.len(), 11, "{slug}");
        for path in expressions.values().filter_map(|p| p.as_str()) {
            assert!(dir.join(path).is_file(), "{slug}: {path} fehlt");
        }
        let voice_desc = profile.card.data.extensions["otakusoul_voice"]["description"]
            .as_str()
            .unwrap_or_default();
        assert!(
            !voice_desc.trim().is_empty(),
            "{slug}: otakusoul_voice description fehlt"
        );
    }
}

#[test]
fn test_crypt_characters_load_with_voice() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
    let dir = Path::new(&manifest_dir)
        .parent()
        .unwrap()
        .join("presets/crypt-of-shadows");
    for (slug, name) in [
        ("thorin", "Thorin Eisenbart"),
        ("lyra", "Lyra Sternenhain"),
        ("finn", "Finn Flinkfuß"),
        ("althea", "Althea Sonnwind"),
    ] {
        let profile = load_character_from_file(&dir.join(format!("{slug}.json")))
            .unwrap_or_else(|e| panic!("{slug}: {e}"));
        assert_eq!(profile.card.data.name, name);
        assert!(profile.avatar_path.is_some(), "{slug}: Avatar fehlt");
        let voice_desc = profile.card.data.extensions["otakusoul_voice"]["description"]
            .as_str()
            .unwrap_or_default();
        assert!(
            !voice_desc.trim().is_empty(),
            "{slug}: otakusoul_voice description fehlt"
        );
    }
}

#[test]
fn test_personas_lifecycle() {
    let test_dir = std::env::temp_dir().join(format!(
        "otakusoul-persona-test-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let path = test_dir.join("personas.json");
    let test_persona = UserPersona {
        id: "test_persona_unit".to_string(),
        name: "Tester".to_string(),
        description: "A unit test persona".to_string(),
        avatar_data_url: None,
    };

    let mut saved = load_personas_from_path(&path);
    saved.push(test_persona.clone());
    save_personas_list_to_path(&saved, &path).expect("Failed to save persona");
    let saved = load_personas_from_path(&path);
    assert!(saved.iter().any(|p| p.id == "test_persona_unit"));

    let mut deleted = saved;
    deleted.retain(|p| p.id != "test_persona_unit");
    save_personas_list_to_path(&deleted, &path).expect("Failed to delete persona");
    let deleted = load_personas_from_path(&path);
    assert!(!deleted.iter().any(|p| p.id == "test_persona_unit"));
    let _ = fs::remove_dir_all(test_dir);
}

#[test]
fn test_delete_and_restore_character() {
    let mut settings = crate::modules::settings::AppSettings {
        active_character_id: Some("ayu_ikue".to_string()),
        ..Default::default()
    };
    hide_character_in_settings(&mut settings, "ayu_ikue");
    assert_eq!(settings.hidden_character_ids, vec!["ayu_ikue"]);
    assert!(settings.active_character_id.is_none());

    // Repeated hiding is idempotent and restoration is a simple clear.
    hide_character_in_settings(&mut settings, "Ayu Ikue");
    assert_eq!(settings.hidden_character_ids.len(), 1);
    settings.hidden_character_ids.clear();
    assert!(settings.hidden_character_ids.is_empty());
}
