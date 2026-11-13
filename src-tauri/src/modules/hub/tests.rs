#[test]
fn reload_reads_the_newest_commit() {
    let refs = "001e# service=git-upload-pack\n0000015a7b6e4b442d738797e7df1b67a51eeb8411998ed7 HEAD\0multi_ack symref=HEAD:refs/heads/main\n003d7b6e4b442d738797e7df1b67a51eeb8411998ed7 refs/heads/main\n004db21037ecb0ce0d71b387f551b0a744774ba3ba0c refs/tags/v1\n0000";
    assert_eq!(
        super::main_commit(refs).as_deref(),
        Some("7b6e4b442d738797e7df1b67a51eeb8411998ed7")
    );
    assert_eq!(super::main_commit("0000"), None);
    assert_eq!(
        super::git_refs_url(super::HUB_BASE_URL).as_deref(),
        Some(
            "https://github.com/SnowwhiteOakheart/otakusoul-data.git/info/refs?service=git-upload-pack"
        )
    );
    assert_eq!(super::git_refs_url("http://127.0.0.1:9/hub"), None);
}

use super::*;

#[test]
fn registry_entries_bring_their_list_texts_per_language() {
    let entry = serde_json::json!({
        "title": "Matchball",
        "translations": {
            "en": {"title": "Match point", "description": "Hazel's final.", "count": 3},
            "ru": "kaputt",
            "fr": {}
        }
    });
    let texts = super::entry_translations(&entry);
    assert_eq!(texts.len(), 1, "only languages with texts");
    assert_eq!(texts["en"]["title"], "Match point");
    assert!(!texts["en"].contains_key("count"), "only strings");
    assert!(super::entry_translations(&serde_json::json!({})).is_empty());
}

#[test]
fn scene_backgrounds_are_only_fetched_from_safe_paths() {
    let file = serde_json::json!({
        "title": "Audienz",
        "description": "Thronsaal",
        "extensions": { "otakusoul_assets": { "backgrounds": [
            { "file": "Horizontal Elkia Throne Room.png", "path": "presets/no-game-no-life/backgrounds/Horizontal Elkia Throne Room.png" },
            { "file": "../evil.png", "path": "presets/x/evil.png" },
            { "file": "evil.png", "path": "presets/../../etc/evil.png" },
            { "file": "notes.txt", "path": "presets/x/notes.txt" },
            { "file": "outside.png", "path": "tools/outside.png" }
        ] } }
    });
    let def = scene_definition_from_hub(file, "Fallback").unwrap();
    let assets = scene_background_assets(&def);
    assert_eq!(assets.len(), 1);
    assert_eq!(assets[0].file, "Horizontal Elkia Throne Room.png");
}

#[test]
fn hub_scenes_keep_translations_and_story_data() {
    let file = serde_json::json!({
        "id": null,
        "folder": null,
        "title": "Matchball",
        "description": "Tennis",
        "party": ["Hazel Williams"],
        "persona": "None",
        "time_of_day": "Tag",
        "conversation_method": "Local LLM",
        "extensions": {
            "otakusoul_i18n": { "source_language": "de", "translations": { "en": { "title": "Match point" } } },
            "otakusoul_story": { "genre": "slice_of_life", "minutes": 30, "difficulty": "easy", "beginner": true }
        }
    });
    let def = scene_definition_from_hub(file, "Fallback").unwrap();
    assert_eq!(def.folder, HUB_SCENE_FOLDER);
    assert_eq!(def.persona, "");
    assert_eq!(def.localized("en").title, "Match point");
    let story = def.story_info().unwrap();
    assert_eq!(story.genre, "slice_of_life");
    assert!(story.beginner);
    assert!(!def.solo_mode);
}

#[test]
fn whole_scene_states_and_missing_titles_are_accepted() {
    let file =
        serde_json::json!({ "definition": { "title": "", "description": "x" }, "chat_log": [] });
    let def = scene_definition_from_hub(file, "Aus dem Hub").unwrap();
    assert_eq!(def.title, "Aus dem Hub");
    assert!(def.solo_mode, "no party = the game master plays everyone");
}

#[test]
fn registry_entries_carry_their_adult_marking() {
    let marked =
        serde_json::json!({"name": "Mint", "author": "a", "download_url": "u", "nsfw": true});
    let plain = serde_json::json!({"name": "Ayu", "author": "a", "download_url": "u"});
    assert!(is_nsfw(&marked) && !is_nsfw(&plain));
    assert!(character_entry(&marked, false).unwrap().nsfw);
    assert!(!character_entry(&plain, false).unwrap().nsfw);
    // Everything from the adult source counts as adult content.
    assert!(character_entry(&plain, true).unwrap().nsfw);
    let scene = serde_json::json!({"title": "T", "author": "a", "download_url": "u"});
    assert!(scene_entry(&scene, true).unwrap().nsfw);
    assert_eq!(
        scene_entry(&scene, false).unwrap().starting_location,
        "Startgebiet"
    );
    let book = serde_json::json!({"name": "B", "author": "a", "download_url": "u", "nsfw": true});
    assert!(lorebook_entry(&book, false).unwrap().nsfw);
    // Incomplete entries are skipped.
    assert!(character_entry(&serde_json::json!({"name": "X"}), false).is_none());
}

#[test]
fn collections_list_their_contents_by_registry_key() {
    let entry = serde_json::json!({
        "id": "steins_gate",
        "title": "Steins;Gate",
        "author": "A",
        "description": "Akihabara",
        "cover_url": "https://example.org/cover.webp",
        "lorebooks": ["Steins;Gate – Weltlinien & Divergenz"],
        "scenes": ["steins_gate_ep1_erste_dmail", 5],
        "characters": ["Okabe Rintarou"],
        "translations": {"en": {"description": "Akihabara (en)"}}
    });
    let c = collection_entry(&entry, false).unwrap();
    assert_eq!(c.scenes, vec!["steins_gate_ep1_erste_dmail"]);
    assert_eq!(c.lorebooks.len(), 1);
    assert_eq!(c.characters, vec!["Okabe Rintarou"]);
    assert_eq!(c.revision, 1);
    assert_eq!(c.translations["en"]["description"], "Akihabara (en)");
    assert!(!c.nsfw);
    // Without a title the id is shown; without an id the entry is skipped.
    let bare = collection_entry(&serde_json::json!({"id": "x"}), true).unwrap();
    assert_eq!(bare.title, "x");
    assert!(bare.nsfw && bare.lorebooks.is_empty());
    assert!(collection_entry(&serde_json::json!({"title": "y"}), false).is_none());
}

#[test]
fn registry_entries_without_revision_count_as_first() {
    assert_eq!(entry_revision(&serde_json::json!({})), (1, String::new()));
    assert_eq!(
        entry_revision(&serde_json::json!({ "revision": 4, "updated": "2026-10-16" })),
        (4, "2026-10-16".to_string())
    );
}

#[tokio::test]
async fn nsfw_hub_live_registry_check() {
    let chars = nsfw_registry_items("soul_registry.json", "characters").await;
    assert!(!chars.is_empty(), "expected characters in nsfw repository");
    assert!(
        chars
            .iter()
            .any(|c| c.get("name").and_then(|v| v.as_str()) == Some("Mint")),
        "expected Mint in nsfw character registry"
    );

    let scenes = nsfw_registry_items("stages_registry.json", "scenes").await;
    assert!(!scenes.is_empty(), "expected scenes in nsfw repository");
    assert!(
        scenes
            .iter()
            .any(|s| s.get("id").and_then(|v| v.as_str()) == Some("nachtschicht_in_hethereau")),
        "expected nachtschicht_in_hethereau in nsfw scenes registry"
    );

    let lorebooks = nsfw_registry_items("lorebooks_registry.json", "lorebooks").await;
    assert!(
        !lorebooks.is_empty(),
        "expected lorebooks in nsfw repository"
    );
    assert!(
        lorebooks
            .iter()
            .any(|l| l.get("name").and_then(|v| v.as_str()) == Some("Adulte Romance & Erotik")),
        "expected adult lorebook in nsfw lorebooks registry"
    );
}
