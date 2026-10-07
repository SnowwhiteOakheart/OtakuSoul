//! Scene files: bundled presets, user folders, import/export, editing and backgrounds.

use super::*;

pub fn build_initial_scene_state(def: &SceneDefinition) -> SceneState {
    let lang_code = crate::modules::content_lang::language_code(
        &crate::modules::content_lang::ContentLang::reply_language_name(),
    );
    let localized_def = def.localized(&lang_code);
    let lang = crate::modules::content_lang::ContentLang::current();
    let initial_msg = SceneTurnMessage {
        id: format!("msg_{}", Utc::now().timestamp_millis()),
        sender_id: "gm".to_string(),
        sender_name: "Game Master".to_string(),
        sender_role: "gm".to_string(),
        avatar_url: None,
        content: if !localized_def.opening_narration.is_empty() {
            localized_def.opening_narration.clone()
        } else {
            localized_def.description.clone()
        },
        turn_mode: "do".to_string(),
        whisper_target: None,
        event_card: None,
        timestamp: Utc::now().timestamp() as u64,
    };

    let world = WorldState {
        location: if !def.starting_location.is_empty() {
            def.starting_location.clone()
        } else {
            lang.t("Old refuge").to_string()
        },
        time_of_day: if !def.time_of_day.is_empty() {
            def.time_of_day.clone()
        } else {
            lang.t("Dusk").to_string()
        },
        weather: lang.t("Clear").to_string(),
        danger_level: 2,
        active_quest: localized_def.description.clone(),
        key_facts: HashMap::new(),
    };

    let persona_name = if def.persona.is_empty() {
        lang.t("Player").to_string()
    } else {
        def.persona.clone()
    };

    let mut state = SceneState {
        definition: def.clone(),
        world,
        clocks: vec![CampaignClock {
            id: "clock_tension".to_string(),
            name: lang.t("Dramatic tension").to_string(),
            current: 1,
            max: 6,
            clock_type: "danger".to_string(),
        }],
        combat: EncounterState::default(),
        arcs: Vec::new(),
        inventory: Vec::new(),
        objectives: vec![CampaignObjective {
            id: "objective_main".to_string(),
            title: if !localized_def.title.is_empty() {
                localized_def.title.clone()
            } else {
                lang.t("Begin the adventure").to_string()
            },
            description: localized_def.description.clone(),
            current: 0,
            max: 1,
            status: "active".to_string(),
        }],
        relationships: def
            .party
            .iter()
            .map(|name| StageRelationship {
                subject: name.clone(),
                target: persona_name.clone(),
                affinity: 0,
                tags: vec![lang.t("Companion").to_string()],
                role_view: lang.t("Companion").to_string(),
                last_shift_reason: String::new(),
            })
            .collect(),
        consequence_ledger: Vec::new(),
        chat_log: vec![initial_msg],
        pending_choices: vec![
            TaggedChoice {
                text: lang.t("Study the surroundings closely").to_string(),
                badge: Some(lang.t("Perception").to_string()),
                action_type: "do".to_string(),
            },
            TaggedChoice {
                text: lang.t("Dare a step forward").to_string(),
                badge: None,
                action_type: "do".to_string(),
            },
            TaggedChoice {
                text: lang.t("Confer with the companions").to_string(),
                badge: None,
                action_type: "say".to_string(),
            },
        ],
        current_turn_actor: "PLAYER".to_string(),
        current_bg: if !def.starting_bg.is_empty() {
            Some(def.starting_bg.clone())
        } else {
            None
        },
        current_ambient: ambient_name(&def.starting_ambient),
        arc_archive: Vec::new(),
        turns_since_audit: 0,
        overlays: Vec::new(),
        lore_cards: Vec::new(),
        memory_sync: HashMap::new(),
        private_knowledge: HashMap::new(),
        map: None,
        history_summaries: HashMap::new(),
        npcs: Vec::new(),
    };
    ensure_party_vitals(&mut state);
    state
}

pub fn ensure_default_scene_folders() {
    let paths = resolve_app_paths();
    let scenes_dir = PathBuf::from(&paths.scenes_dir);
    let _ = fs::create_dir_all(&scenes_dir);

    let search_roots = [
        PathBuf::from(&paths.bundled_presets_dir),
        PathBuf::from("presets"),
        PathBuf::from("../presets"),
    ];

    // 1. Ensure "No Game No Life" folder exists in scenes_dir with all 12 chapters
    let ngnl_dir = scenes_dir.join("No Game No Life");
    let needs_ngnl_copy = !ngnl_dir.exists()
        || fs::read_dir(&ngnl_dir)
            .map(|d| {
                d.flatten()
                    .filter(|e| e.path().extension().is_some_and(|ext| ext == "json"))
                    .count()
                    < 12
            })
            .unwrap_or(true);

    if needs_ngnl_copy {
        let _ = fs::create_dir_all(&ngnl_dir);
        for root in &search_roots {
            let src_scenes = root.join("no-game-no-life").join("scenes");
            if src_scenes.exists() {
                if let Ok(entries) = fs::read_dir(&src_scenes) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.is_file() && p.extension().is_some_and(|ext| ext == "json") {
                            let stem = p
                                .file_stem()
                                .unwrap_or_default()
                                .to_string_lossy()
                                .to_string();
                            let target_p = ngnl_dir.join(format!("{}.json", stem));
                            if let Ok(content) = fs::read_to_string(&p)
                                && let Ok(mut def) =
                                    serde_json::from_str::<SceneDefinition>(&content)
                            {
                                def.id = stem.clone();
                                def.folder = "No Game No Life".to_string();
                                let state = build_initial_scene_state(&def);
                                if let Ok(json_str) = serde_json::to_string_pretty(&state) {
                                    let _ = fs::write(&target_p, json_str);
                                }
                            }
                        }
                    }
                }
                break;
            }
        }
    }

    // 2. Ensure No Game No Life Lorebooks are copied to lorebooks_dir
    let lorebooks_dir = PathBuf::from(&paths.lorebooks_dir);
    let _ = fs::create_dir_all(&lorebooks_dir);
    for root in &search_roots {
        let src_lb = root.join("no-game-no-life").join("lorebooks");
        if src_lb.exists() {
            if let Ok(entries) = fs::read_dir(&src_lb) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_file()
                        && p.extension().is_some_and(|ext| ext == "json")
                        && let Some(filename) = p.file_name()
                    {
                        let target_lb = lorebooks_dir.join(filename);
                        if !target_lb.exists() {
                            let _ = fs::copy(&p, &target_lb);
                        }
                    }
                }
            }
            break;
        }
    }

    // 3. Ensure Sakura Succubus 3 folder exists with presets
    let ss3_dir = scenes_dir.join("Sakura Succubus 3");
    if !ss3_dir.exists() {
        for root in &search_roots {
            let src_scenes = root.join("sakura-succubus-3").join("scenes");
            if src_scenes.exists() {
                let _ = fs::create_dir_all(&ss3_dir);
                if let Ok(entries) = fs::read_dir(&src_scenes) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.is_file() && p.extension().is_some_and(|ext| ext == "json") {
                            let stem = p
                                .file_stem()
                                .unwrap_or_default()
                                .to_string_lossy()
                                .to_string();
                            let target_p = ss3_dir.join(format!("{}.json", stem));
                            if let Ok(content) = fs::read_to_string(&p)
                                && let Ok(mut def) =
                                    serde_json::from_str::<SceneDefinition>(&content)
                            {
                                def.id = stem.clone();
                                def.folder = "Sakura Succubus 3".to_string();
                                let state = build_initial_scene_state(&def);
                                if let Ok(json_str) = serde_json::to_string_pretty(&state) {
                                    let _ = fs::write(&target_p, json_str);
                                }
                            }
                        }
                    }
                }
                break;
            }
        }
    }
}

pub fn find_scene_path(scene_id: &str) -> Option<PathBuf> {
    let paths = resolve_app_paths();
    let scenes_dir = PathBuf::from(&paths.scenes_dir);

    // 1. Direct file: scenes/{scene_id}.json
    let direct = scenes_dir.join(format!("{}.json", scene_id));
    if direct.exists() {
        return Some(direct);
    }

    // 2. Subdirectories in scenes/
    if let Ok(entries) = fs::read_dir(&scenes_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                let candidate = p.join(format!("{}.json", scene_id));
                if candidate.exists() {
                    return Some(candidate);
                }
            }
        }
    }

    // 3. Search in presets
    let search_roots = [
        PathBuf::from(&paths.bundled_presets_dir),
        PathBuf::from("presets"),
        PathBuf::from("../presets"),
    ];

    for root in &search_roots {
        for folder in &["no-game-no-life", "sakura-succubus-3"] {
            let scene_dir = root.join(folder).join("scenes");
            if scene_dir.exists() {
                let candidate = scene_dir.join(format!("{}.json", scene_id));
                if candidate.exists() {
                    return Some(candidate);
                }
                if let Ok(entries) = fs::read_dir(&scene_dir) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        let stem = p.file_stem().unwrap_or_default().to_string_lossy();
                        if stem == scene_id || format!("{}_{}", folder, stem) == scene_id {
                            return Some(p);
                        }
                    }
                }
            }
        }
    }

    None
}

pub(super) fn parse_scene_file_preview(
    p: &Path,
    folder_label: &str,
    is_preset: bool,
) -> Option<ScenePreview> {
    let content = fs::read_to_string(p).ok()?;
    if let Ok(state) = serde_json::from_str::<SceneState>(&content) {
        let lang_code = crate::modules::content_lang::language_code(
            &crate::modules::content_lang::ContentLang::reply_language_name(),
        );
        let localized_def = state.definition.localized(&lang_code);
        let has_progress = state.chat_log.len() > 1;
        let turn_count = state.chat_log.len();
        return Some(ScenePreview {
            id: localized_def.id.clone(),
            title: localized_def.title.clone(),
            description: localized_def.description.clone(),
            party: localized_def.party.clone(),
            location: state.world.location.clone(),
            time_of_day: state.world.time_of_day.clone(),
            gm_tone: localized_def.gm_tone.clone(),
            folder: if !localized_def.folder.is_empty() {
                localized_def.folder.clone()
            } else {
                folder_label.to_string()
            },
            is_preset,
            starting_bg: state
                .current_bg
                .clone()
                .unwrap_or_else(|| localized_def.starting_bg.clone()),
            last_played: state.definition.last_played.clone(),
            has_progress,
            turn_count,
            rules_5e: state.definition.is_5e(),
        });
    }

    if let Ok(def) = serde_json::from_str::<SceneDefinition>(&content) {
        let lang_code = crate::modules::content_lang::language_code(
            &crate::modules::content_lang::ContentLang::reply_language_name(),
        );
        let localized_def = def.localized(&lang_code);
        let stem = p
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let id = if def.id.is_empty() {
            stem
        } else {
            def.id.clone()
        };
        return Some(ScenePreview {
            id,
            title: localized_def.title.clone(),
            description: localized_def.description.clone(),
            party: def.party.clone(),
            location: def.starting_location.clone(),
            time_of_day: def.time_of_day.clone(),
            gm_tone: def.gm_tone.clone(),
            folder: if !def.folder.is_empty() {
                def.folder.clone()
            } else {
                folder_label.to_string()
            },
            is_preset,
            starting_bg: def.starting_bg.clone(),
            last_played: def.last_played.clone(),
            has_progress: false,
            turn_count: 0,
            rules_5e: def.is_5e(),
        });
    }

    None
}

pub(super) fn extract_sort_key(s: &str) -> (u32, String) {
    let lower = s.to_lowercase();
    if let Some(pos) = lower.find("kapitel ") {
        let rest = &lower[pos + 8..];
        let num_str: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
        if let Ok(num) = num_str.parse::<u32>() {
            return (num, lower);
        }
    }
    if let Some(pos) = lower.find("episode ") {
        let rest = &lower[pos + 8..];
        let num_str: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
        if let Ok(num) = num_str.parse::<u32>() {
            return (num, lower);
        }
    }
    if let Some(pos) = lower.find("episode") {
        let rest = &lower[pos + 7..];
        let num_str: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
        if let Ok(num) = num_str.parse::<u32>() {
            return (num, lower);
        }
    }
    (9999, lower)
}

pub fn scan_available_scenes() -> Vec<ScenePreview> {
    ensure_default_scene_folders();
    let mut results = Vec::new();
    let paths = resolve_app_paths();
    let user_scenes_dir = PathBuf::from(&paths.scenes_dir);

    // 1. User scenes in data_dir/scenes (root & subfolders)
    if user_scenes_dir.exists()
        && let Ok(entries) = fs::read_dir(&user_scenes_dir)
    {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                let folder_name = entry.file_name().to_string_lossy().to_string();
                if let Ok(sub_entries) = fs::read_dir(&p) {
                    for sub_entry in sub_entries.flatten() {
                        let sub_p = sub_entry.path();
                        if sub_p.is_file()
                            && sub_p.extension().is_some_and(|ext| ext == "json")
                            && let Some(preview) =
                                parse_scene_file_preview(&sub_p, &folder_name, false)
                            && !results.iter().any(|r: &ScenePreview| r.id == preview.id)
                        {
                            results.push(preview);
                        }
                    }
                }
            } else if p.is_file()
                && p.extension().is_some_and(|ext| ext == "json")
                && let Some(preview) = parse_scene_file_preview(&p, "Eigene Szenen", false)
                && !results.iter().any(|r: &ScenePreview| r.id == preview.id)
            {
                results.push(preview);
            }
        }
    }

    // 2. Bundled presets fallback
    let search_roots = [
        PathBuf::from(&paths.bundled_presets_dir),
        PathBuf::from("presets"),
        PathBuf::from("../presets"),
    ];

    let preset_folders = [
        ("sakura-succubus-3", "Sakura Succubus 3"),
        ("no-game-no-life", "No Game No Life"),
    ];

    for root in &search_roots {
        for (folder_key, folder_label) in &preset_folders {
            let scene_dir = root.join(folder_key).join("scenes");
            if scene_dir.exists()
                && let Ok(entries) = fs::read_dir(&scene_dir)
            {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_file()
                        && p.extension().is_some_and(|ext| ext == "json")
                        && let Some(preview) = parse_scene_file_preview(&p, folder_label, true)
                        && !results
                            .iter()
                            .any(|r: &ScenePreview| r.id == preview.id || r.title == preview.title)
                    {
                        results.push(preview);
                    }
                }
            }
        }
    }

    // Sort by folder, then chapter number, then title
    results.sort_by(|a, b| {
        if a.folder != b.folder {
            if a.folder == "No Game No Life" {
                return std::cmp::Ordering::Less;
            }
            if b.folder == "No Game No Life" {
                return std::cmp::Ordering::Greater;
            }
            a.folder.cmp(&b.folder)
        } else {
            let (num_a, name_a) = extract_sort_key(&a.title);
            let (num_b, name_b) = extract_sort_key(&b.title);
            if num_a != num_b {
                num_a.cmp(&num_b)
            } else {
                name_a.cmp(&name_b)
            }
        }
    });

    results
}

pub fn load_scene_by_id(scene_id: &str) -> Result<SceneState, String> {
    if let Some(path) = find_scene_path(scene_id) {
        let content = fs::read_to_string(&path)
            .map_err(|e| crate::err!("backend.stage.sceneRead", error = e))?;
        if let Ok(mut state) = serde_json::from_str::<SceneState>(&content) {
            ensure_party_vitals(&mut state);
            return Ok(state);
        }
        if let Ok(def) = serde_json::from_str::<SceneDefinition>(&content) {
            let state = build_initial_scene_state(&def);
            let _ = save_scene_state(&state);
            return Ok(state);
        }
    }
    Err(crate::err!("backend.stage.sceneMissing", id = scene_id))
}

pub fn save_scene_state(state: &SceneState) -> Result<(), String> {
    let paths = resolve_app_paths();
    let scenes_dir = PathBuf::from(&paths.scenes_dir);
    let _ = fs::create_dir_all(&scenes_dir);

    let target_file = if let Some(existing_path) = find_scene_path(&state.definition.id) {
        if existing_path.starts_with(&scenes_dir) {
            existing_path
        } else {
            let folder_dir = if !state.definition.folder.is_empty()
                && state.definition.folder != "Eigene Szenen"
            {
                scenes_dir.join(&state.definition.folder)
            } else {
                scenes_dir.clone()
            };
            let _ = fs::create_dir_all(&folder_dir);
            folder_dir.join(format!("{}.json", state.definition.id))
        }
    } else {
        let folder_dir =
            if !state.definition.folder.is_empty() && state.definition.folder != "Eigene Szenen" {
                scenes_dir.join(&state.definition.folder)
            } else {
                scenes_dir.clone()
            };
        let _ = fs::create_dir_all(&folder_dir);
        folder_dir.join(format!("{}.json", state.definition.id))
    };

    if target_file.exists() {
        let bak_file = target_file.with_extension("json.bak");
        let _ = fs::copy(&target_file, &bak_file);
    }

    let json_data = serde_json::to_string_pretty(state)
        .map_err(|e| crate::err!("backend.stage.sceneSerialize", error = e))?;

    fs::write(&target_file, json_data).map_err(|e| {
        format!(
            "Fehler beim Speichern der Szene in {:?}: {}",
            target_file, e
        )
    })?;

    Ok(())
}

pub fn reset_stage_scene(scene_id: &str) -> Result<SceneState, String> {
    let current_state = load_scene_by_id(scene_id)?;
    let fresh_state = build_initial_scene_state(&current_state.definition);
    save_scene_state(&fresh_state)?;
    Ok(fresh_state)
}

pub fn list_stage_folders() -> Result<Vec<String>, String> {
    ensure_default_scene_folders();
    let paths = resolve_app_paths();
    let scenes_dir = PathBuf::from(&paths.scenes_dir);
    let mut folders = Vec::new();

    folders.push("No Game No Life".to_string());
    folders.push("Sakura Succubus 3".to_string());
    folders.push("Eigene Szenen".to_string());

    if let Ok(entries) = fs::read_dir(&scenes_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                let name = entry.file_name().to_string_lossy().to_string();
                if !folders.iter().any(|f| f.eq_ignore_ascii_case(&name)) {
                    folders.push(name);
                }
            }
        }
    }

    folders.sort();
    Ok(folders)
}

pub fn create_stage_folder(folder_name: &str) -> Result<(), String> {
    let clean = folder_name.trim();
    if clean.is_empty() || clean.contains('/') || clean.contains('\\') || clean.contains("..") {
        return Err(crate::err!("backend.stage.folderNameInvalid"));
    }
    let paths = resolve_app_paths();
    let target = PathBuf::from(&paths.scenes_dir).join(clean);
    fs::create_dir_all(&target).map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    Ok(())
}

pub fn move_stage_scene_to_folder(
    scene_id: &str,
    target_folder: &str,
) -> Result<SceneState, String> {
    let mut state = load_scene_by_id(scene_id)?;
    let old_path = find_scene_path(scene_id);
    let paths = resolve_app_paths();
    let scenes_dir = PathBuf::from(&paths.scenes_dir);

    let clean_folder = target_folder.trim();
    let target_dir = if clean_folder.is_empty() || clean_folder == "Eigene Szenen" {
        scenes_dir.clone()
    } else {
        scenes_dir.join(clean_folder)
    };
    fs::create_dir_all(&target_dir)
        .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;

    state.definition.folder = if clean_folder.is_empty() {
        "Eigene Szenen".to_string()
    } else {
        clean_folder.to_string()
    };

    let new_path = target_dir.join(format!("{}.json", scene_id));
    let json_data = serde_json::to_string_pretty(&state)
        .map_err(|e| crate::err!("backend.stage.sceneSerialize", error = e))?;
    fs::write(&new_path, json_data).map_err(|e| {
        crate::err!(
            "backend.common.fileWritePath",
            path = format!("{:?}", new_path),
            error = e
        )
    })?;

    if let Some(old) = old_path
        && old != new_path
        && old.starts_with(&scenes_dir)
    {
        let _ = fs::remove_file(&old);
        let old_bak = old.with_extension("json.bak");
        if old_bak.exists() {
            let _ = fs::remove_file(old_bak);
        }
    }

    Ok(state)
}

pub fn delete_stage_folder(folder_name: &str) -> Result<(), String> {
    let clean = folder_name.trim();
    if clean == "No Game No Life" || clean == "Eigene Szenen" {
        return Err(crate::err!("backend.stage.folderBuiltin"));
    }
    let paths = resolve_app_paths();
    let scenes_dir = PathBuf::from(&paths.scenes_dir);
    let folder_path = scenes_dir.join(clean);
    if !folder_path.exists() {
        return Err(crate::err!("backend.stage.folderMissing"));
    }

    // Move any contained scenes to root scenes_dir
    if let Ok(entries) = fs::read_dir(&folder_path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file()
                && p.extension().is_some_and(|ext| ext == "json")
                && let Some(name) = p.file_name()
            {
                let dest = scenes_dir.join(name);
                let _ = fs::rename(&p, &dest);
            }
        }
    }
    let _ = fs::remove_dir_all(&folder_path);
    Ok(())
}

pub fn import_stage_scene_json(
    json_content: &str,
    target_folder: Option<&str>,
) -> Result<SceneState, String> {
    let clean_folder = target_folder.unwrap_or("Eigene Szenen");
    if let Ok(mut state) = serde_json::from_str::<SceneState>(json_content) {
        if state.definition.id.trim().is_empty() {
            state.definition.id = format!("scene_{}", Utc::now().timestamp_millis());
        }
        state.definition.folder = clean_folder.to_string();
        save_scene_state(&state)?;
        return Ok(state);
    }

    if let Ok(mut def) = serde_json::from_str::<SceneDefinition>(json_content) {
        if def.id.trim().is_empty() {
            def.id = format!("scene_{}", Utc::now().timestamp_millis());
        }
        def.folder = clean_folder.to_string();
        let state = build_initial_scene_state(&def);
        save_scene_state(&state)?;
        return Ok(state);
    }

    Err(crate::err!("backend.stage.invalidSceneFile"))
}

pub fn export_stage_scene_json(scene_id: &str) -> Result<String, String> {
    let state = load_scene_by_id(scene_id)?;
    serde_json::to_string_pretty(&state).map_err(|e| crate::err!("backend.stage.export", error = e))
}

/// Editing changes configuration only; the running world's history stays intact.
pub fn update_scene_definition(state: &mut SceneState, mut definition: SceneDefinition) {
    definition.id = state.definition.id.clone();
    definition.created_at = state.definition.created_at.clone();
    definition.last_played = state.definition.last_played.clone();
    definition.folder = state.definition.folder.clone();
    definition.max_actor_depth = definition.max_actor_depth.clamp(1, 6);
    definition.solo_mode = definition.party.is_empty();
    // A new ambient choice plays right away unless the planner has switched it meanwhile.
    if state.current_ambient == ambient_name(&state.definition.starting_ambient) {
        state.current_ambient = ambient_name(&definition.starting_ambient);
    }
    state.definition = definition;
    state.history_summaries.clear();
    ensure_party_vitals(state);
}

/// `None` for the "no sound" values the editor and older scenes use.
pub fn ambient_name(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty() && !["none", "null", "silence"].contains(&value.to_lowercase().as_str()))
        .then(|| value.to_string())
}

/// Ambient sound file as `data:` URL, looked up by name in the ambient folders.
pub fn stage_ambient_data_url(name: &str) -> Result<String, String> {
    let name = name.trim();
    let path = Path::new(name);
    if name.contains(['/', '\\']) || !asset_extension_allowed(path, "ambient") {
        return Err(crate::err!("backend.stage.invalidAsset"));
    }
    let file = stage_asset_dirs("ambient")
        .into_iter()
        .map(|dir| dir.join(name))
        .find(|candidate| candidate.is_file())
        .ok_or_else(|| crate::err!("backend.stage.invalidAsset"))?;
    let bytes = fs::read(&file).map_err(|e| {
        crate::err!(
            "backend.common.fileReadPath",
            path = file.display(),
            error = e
        )
    })?;
    let mime = match path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase()
        .as_str()
    {
        "mp3" => "audio/mpeg",
        "ogg" => "audio/ogg",
        _ => "audio/wav",
    };
    Ok(format!(
        "data:{mime};base64,{}",
        BASE64_STANDARD.encode(bytes)
    ))
}

fn stage_asset_dirs(kind: &str) -> Vec<PathBuf> {
    let paths = resolve_app_paths();
    let mut dirs = vec![
        PathBuf::from(&paths.data_dir).join(kind),
        PathBuf::from("assets").join(kind),
        PathBuf::from("../assets").join(kind),
    ];
    if let Ok(presets) = fs::read_dir(&paths.bundled_presets_dir) {
        dirs.extend(presets.flatten().map(|entry| entry.path().join(kind)));
    }
    dirs
}

fn asset_extension_allowed(path: &Path, kind: &str) -> bool {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    match kind {
        "backgrounds" => matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp"),
        "ambient" => matches!(ext.as_str(), "mp3" | "wav" | "ogg"),
        _ => false,
    }
}

pub fn list_stage_assets() -> HashMap<String, Vec<String>> {
    ["backgrounds", "ambient"]
        .into_iter()
        .map(|kind| {
            let mut names: Vec<String> = stage_asset_dirs(kind)
                .into_iter()
                .filter_map(|dir| fs::read_dir(dir).ok())
                .flatten()
                .flatten()
                .filter(|entry| {
                    entry.path().is_file() && asset_extension_allowed(&entry.path(), kind)
                })
                .filter_map(|entry| entry.file_name().into_string().ok())
                .collect();
            names.sort();
            names.dedup();
            (kind.to_string(), names)
        })
        .collect()
}

pub fn import_stage_asset(file_path: &str, kind: &str) -> Result<String, String> {
    let source = Path::new(file_path);
    if !asset_extension_allowed(source, kind) || !source.is_file() {
        return Err(crate::err!("backend.stage.invalidAsset"));
    }
    let extension = source.extension().and_then(|e| e.to_str()).unwrap_or("bin");
    let stem: String = source
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("stage")
        .chars()
        .filter(|c| c.is_alphanumeric() || matches!(c, '_' | '-'))
        .take(60)
        .collect();
    let name = format!(
        "{}_{}.{}",
        stem,
        rand::random::<u64>(),
        extension.to_lowercase()
    );
    let dir = PathBuf::from(resolve_app_paths().data_dir).join(kind);
    fs::create_dir_all(&dir).map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    fs::copy(source, dir.join(&name))
        .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    Ok(name)
}

pub fn create_custom_scene(mut def: SceneDefinition) -> Result<SceneState, String> {
    if def.id.trim().is_empty() {
        def.id = format!("custom_scene_{}", Utc::now().timestamp_millis());
    }
    def.max_actor_depth = def.max_actor_depth.clamp(1, 6);
    def.created_at = Utc::now().to_rfc3339();
    def.last_played = Some(Utc::now().to_rfc3339());
    let state = build_initial_scene_state(&def);
    save_scene_state(&state)?;
    Ok(state)
}

pub fn delete_scene(scene_id: &str) -> Result<(), String> {
    if let Some(target_file) = find_scene_path(scene_id) {
        let paths = resolve_app_paths();
        let scenes_dir = PathBuf::from(&paths.scenes_dir);
        if target_file.starts_with(&scenes_dir) {
            let bak_file = target_file.with_extension("json.bak");
            if bak_file.exists() {
                let _ = fs::remove_file(bak_file);
            }
            fs::remove_file(target_file)
                .map_err(|e| crate::err!("backend.common.delete", error = e))?;
        }
    }
    Ok(())
}

pub fn edit_stage_turn_message(
    engine: &StageEngine,
    scene_id: &str,
    message_id: &str,
    new_content: &str,
) -> Result<SceneState, String> {
    edit_stage_turn_message_with_saver(engine, scene_id, message_id, new_content, save_scene_state)
}

pub(super) fn edit_stage_turn_message_with_saver(
    engine: &StageEngine,
    scene_id: &str,
    message_id: &str,
    new_content: &str,
    save: impl FnOnce(&SceneState) -> Result<(), String>,
) -> Result<SceneState, String> {
    let mut state = engine.get_state();
    if state.definition.id != scene_id {
        state = load_scene_by_id(scene_id)?;
    }
    engine.push_snapshot(scene_id, state.clone());

    if let Some(msg) = state.chat_log.iter_mut().find(|m| m.id == message_id) {
        msg.content = new_content.to_string();
        state.history_summaries.clear();
        reconcile_npc_memories(&mut state);
        rebuild_private_knowledge(&mut state);
        save(&state)?;
        engine.set_state(state.clone());
        Ok(state)
    } else {
        Err(crate::err!("backend.stage.messageMissing", id = message_id))
    }
}

pub fn delete_stage_turn_message(
    engine: &StageEngine,
    scene_id: &str,
    message_id: &str,
) -> Result<SceneState, String> {
    delete_stage_turn_message_with_saver(engine, scene_id, message_id, save_scene_state)
}

pub(super) fn delete_stage_turn_message_with_saver(
    engine: &StageEngine,
    scene_id: &str,
    message_id: &str,
    save: impl FnOnce(&SceneState) -> Result<(), String>,
) -> Result<SceneState, String> {
    let mut state = engine.get_state();
    if state.definition.id != scene_id {
        state = load_scene_by_id(scene_id)?;
    }
    engine.push_snapshot(scene_id, state.clone());

    state.chat_log.retain(|m| m.id != message_id);
    state.history_summaries.clear();
    reconcile_npc_memories(&mut state);
    rebuild_private_knowledge(&mut state);
    save(&state)?;
    engine.set_state(state.clone());
    Ok(state)
}

pub async fn regenerate_stage_turn(
    engine: &StageEngine,
    inference: &InferenceClient,
    scene_id: &str,
    on_stream: StageStream<'_>,
) -> Result<SceneState, String> {
    let mut state = engine.get_state();
    if state.definition.id != scene_id {
        state = load_scene_by_id(scene_id)?;
    }

    let player_idx = state
        .chat_log
        .iter()
        .rposition(|m| m.sender_role == "player");

    if let Some(idx) = player_idx {
        let player_msg = state.chat_log[idx].clone();
        state.chat_log.truncate(idx);
        state.history_summaries.clear();
        reconcile_npc_memories(&mut state);
        rebuild_private_knowledge(&mut state);
        save_scene_state(&state)?;
        engine.set_state(state);

        execute_stage_turn(
            engine,
            inference,
            StageTurnRequest {
                scene_id: scene_id.to_string(),
                user_input: player_msg.content,
                turn_mode: player_msg.turn_mode,
                whisper_target: player_msg.whisper_target,
                force_next_actor: None,
            },
            on_stream,
        )
        .await
    } else {
        let fresh = reset_stage_scene(scene_id)?;
        engine.set_state(fresh.clone());
        Ok(fresh)
    }
}

pub fn get_stage_background_image(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("none") {
        return Ok(String::new());
    }
    if trimmed.starts_with("data:image/")
        || trimmed.starts_with("http://")
        || trimmed.starts_with("https://")
    {
        return Ok(trimmed.to_string());
    }

    let search_dirs = stage_asset_dirs("backgrounds");

    let candidates = [
        trimmed.to_string(),
        format!("{}.png", trimmed),
        format!("{}.jpg", trimmed),
        format!("{}.jpeg", trimmed),
        format!("{}.webp", trimmed),
    ];

    for dir in &search_dirs {
        for candidate in &candidates {
            let file_path = dir.join(candidate);
            if file_path.exists()
                && file_path.is_file()
                && let Ok(bytes) = fs::read(&file_path)
            {
                let ext = file_path
                    .extension()
                    .map_or("png", |e| e.to_str().unwrap_or("png"))
                    .to_lowercase();
                let mime = match ext.as_str() {
                    "jpg" | "jpeg" => "image/jpeg",
                    "webp" => "image/webp",
                    _ => "image/png",
                };
                return Ok(format!(
                    "data:{};base64,{}",
                    mime,
                    BASE64_STANDARD.encode(&bytes)
                ));
            }
        }
    }

    Err(crate::err!(
        "backend.stage.backgroundMissing",
        name = trimmed
    ))
}

pub fn export_scene_to_markdown(scene_id: &str) -> Result<String, String> {
    let state = load_scene_by_id(scene_id)?;
    let mut md = format!("# {}\n\n", state.definition.title);
    md.push_str(&format!(
        "**Ort:** {} | **Zeit:** {} | **Spielleiter-Ton:** {}\n\n",
        state.world.location, state.world.time_of_day, state.definition.gm_tone
    ));
    md.push_str(&format!("*{}*\n\n---\n\n", state.definition.description));

    if !state.objectives.is_empty() {
        md.push_str("## Kampagnenziele\n\n");
        for objective in &state.objectives {
            md.push_str(&format!(
                "- [{}] **{}** — {}/{}: {}\n",
                if objective.status == "completed" {
                    "x"
                } else {
                    " "
                },
                objective.title,
                objective.current,
                objective.max,
                objective.description
            ));
        }
        md.push('\n');
    }
    if !state.inventory.is_empty() {
        md.push_str("## Inventar\n\n");
        for item in &state.inventory {
            md.push_str(&format!(
                "- **{}** ×{} — {}\n",
                item.name, item.quantity, item.description
            ));
        }
        md.push('\n');
    }
    if !state.consequence_ledger.is_empty() {
        md.push_str("## Dauerhafte Konsequenzen\n\n");
        for entry in &state.consequence_ledger {
            md.push_str(&format!("- {}\n", entry.text));
        }
        md.push('\n');
    }
    md.push_str("## Abenteuer-Protokoll\n\n");

    for msg in &state.chat_log {
        let timestamp_str = chrono::DateTime::from_timestamp(msg.timestamp as i64, 0)
            .map(|dt| dt.format("%H:%M").to_string())
            .unwrap_or_default();

        match msg.sender_role.as_str() {
            "gm" => {
                md.push_str(&format!(
                    "### 🎲 Game Master ({})\n\n{}\n\n",
                    timestamp_str, msg.content
                ));
            }
            "player" => {
                let mode_icon = match msg.turn_mode.as_str() {
                    "say" => "💬",
                    "do" => "⚔️",
                    "think" => "💭",
                    "whisper" => "🤫",
                    _ => "🎬",
                };
                md.push_str(&format!(
                    "**{} {}** ({})  \n{}\n\n",
                    mode_icon, msg.sender_name, timestamp_str, msg.content
                ));
            }
            "companion" => {
                md.push_str(&format!(
                    "**🌸 {}** ({})  \n{}\n\n",
                    msg.sender_name, timestamp_str, msg.content
                ));
            }
            _ => {
                md.push_str(&format!(
                    "**{}** ({})  \n{}\n\n",
                    msg.sender_name, timestamp_str, msg.content
                ));
            }
        }
    }

    Ok(md)
}
