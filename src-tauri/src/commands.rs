use crate::modules::hardware::{
    HardwareInfo, LayerRecommendation, probe_hardware, recommend_gpu_layers,
};
use crate::modules::inference::{ChatRequest, DoneEvent};
use crate::modules::llama_manager::{LlamaServerConfig, ServerStatus};
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn get_hardware_info() -> HardwareInfo {
    probe_hardware()
}

#[tauri::command]
pub fn get_layer_recommendation(
    model_size_mb: u64,
    total_layers: u32,
    context_size: u32,
    model_path: Option<String>,
    cache_type_k: Option<String>,
    cache_type_v: Option<String>,
) -> LayerRecommendation {
    recommend_gpu_layers(
        model_size_mb,
        total_layers,
        context_size,
        model_path.as_deref(),
        cache_type_k.as_deref(),
        cache_type_v.as_deref(),
    )
}

#[tauri::command]
pub async fn start_llama_server(
    state: State<'_, AppState>,
    config: LlamaServerConfig,
) -> Result<(), String> {
    state.llama_manager.start(config).await
}

#[tauri::command]
pub async fn stop_llama_server(state: State<'_, AppState>) -> Result<(), String> {
    state.llama_manager.stop().await
}

#[tauri::command]
pub async fn get_llama_server_status(state: State<'_, AppState>) -> Result<ServerStatus, String> {
    Ok(state.llama_manager.get_status().await)
}

#[tauri::command]
pub async fn send_chat_message(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    request: ChatRequest,
) -> Result<DoneEvent, String> {
    state.inference_client.stream_chat(&app, request).await
}

#[tauri::command]
pub fn abort_chat_generation(state: State<'_, AppState>) -> Result<(), String> {
    state.inference_client.abort();
    Ok(())
}

#[tauri::command]
pub fn load_character_card(
    file_path: String,
) -> Result<crate::modules::characters::CharacterProfile, String> {
    crate::modules::characters::load_character_from_file(std::path::Path::new(&file_path))
}

#[tauri::command]
pub fn load_lorebook(file_path: String) -> Result<crate::modules::lorebook::Lorebook, String> {
    crate::modules::lorebook::Lorebook::load_from_file(std::path::Path::new(&file_path))
}

#[tauri::command]
pub fn list_all_lorebooks() -> Result<Vec<crate::modules::lorebook::Lorebook>, String> {
    let paths = crate::modules::paths::resolve_app_paths();
    let books = crate::modules::lorebook::list_all_lorebooks(
        std::path::Path::new(&paths.lorebooks_dir),
        std::path::Path::new(&paths.bundled_presets_dir),
    );
    Ok(books)
}

#[tauri::command]
pub fn save_lorebook(mut lorebook: crate::modules::lorebook::Lorebook) -> Result<String, String> {
    let paths = crate::modules::paths::resolve_app_paths();
    let target_path = if let Some(fp) = &lorebook.file_path {
        if !fp.trim().is_empty() {
            std::path::PathBuf::from(fp)
        } else {
            let slug = if !lorebook.id.trim().is_empty() {
                lorebook.id.clone()
            } else {
                lorebook
                    .name
                    .trim()
                    .to_lowercase()
                    .replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "_")
            };
            std::path::PathBuf::from(&paths.lorebooks_dir).join(format!("{}.json", slug))
        }
    } else {
        let slug = if !lorebook.id.trim().is_empty() {
            lorebook.id.clone()
        } else {
            lorebook
                .name
                .trim()
                .to_lowercase()
                .replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "_")
        };
        std::path::PathBuf::from(&paths.lorebooks_dir).join(format!("{}.json", slug))
    };

    lorebook.file_path = Some(target_path.to_string_lossy().to_string());
    if lorebook.id.is_empty() {
        lorebook.id = target_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("lorebook")
            .to_string();
    }

    lorebook.save_to_file(&target_path)?;
    Ok(target_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn delete_lorebook(file_path: String) -> Result<(), String> {
    let p = std::path::Path::new(&file_path);
    if p.exists() {
        std::fs::remove_file(p).map_err(|e| crate::err!("backend.lorebook.delete", error = e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn import_lorebook_file(
    source_path: String,
) -> Result<crate::modules::lorebook::Lorebook, String> {
    let p = std::path::Path::new(&source_path);
    let mut book = crate::modules::lorebook::Lorebook::load_from_file(p)?;
    let paths = crate::modules::paths::resolve_app_paths();

    let slug = p
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("imported_lorebook");
    let target = std::path::PathBuf::from(&paths.lorebooks_dir).join(format!("{}.json", slug));
    book.file_path = Some(target.to_string_lossy().to_string());
    book.id = slug.to_string();
    let _ = book.save_to_file(&target);
    Ok(book)
}

#[tauri::command]
pub fn export_lorebook_file(
    lorebook: crate::modules::lorebook::Lorebook,
    target_path: String,
) -> Result<(), String> {
    lorebook.save_to_file(std::path::Path::new(&target_path))
}

#[tauri::command]
pub fn evaluate_lorebook_context(
    lorebook: crate::modules::lorebook::Lorebook,
    context: String,
) -> Vec<crate::modules::lorebook::LorebookEntry> {
    lorebook.scan_and_activate(&context)
}

#[tauri::command]
pub fn evaluate_multi_lorebooks(
    lorebooks: Vec<crate::modules::lorebook::Lorebook>,
    context: String,
    current_tension: u32,
) -> Result<crate::modules::lorebook::EvaluatedLoreResult, String> {
    Ok(crate::modules::lorebook::evaluate_lorebooks(
        &lorebooks,
        &context,
        current_tension,
    ))
}

#[tauri::command]
pub fn assemble_prompt(context: crate::modules::prompt_builder::PromptContext) -> String {
    crate::modules::prompt_builder::build_system_prompt(&context)
}

#[tauri::command]
pub fn read_file_binary(file_path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&file_path).map_err(|e| {
        crate::err!(
            "backend.common.fileReadPath",
            path = format!("{:?}", file_path),
            error = e
        )
    })
}

// --- Phase 5: Cognitive Soul Memory Commands ---

#[tauri::command]
pub fn get_cognitive_overview(
    state: State<'_, AppState>,
    char_id: String,
    user_name: String,
) -> Result<crate::modules::memory::CognitiveOverview, String> {
    state
        .memory_db
        .get_cognitive_overview(&char_id, &user_name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_psychology(
    state: State<'_, AppState>,
    char_id: String,
    psychology: crate::modules::memory::PsychologyState,
) -> Result<(), String> {
    state
        .memory_db
        .update_psychology(&char_id, &psychology)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_relationship(
    state: State<'_, AppState>,
    char_id: String,
    relationship: crate::modules::memory::RelationshipState,
) -> Result<(), String> {
    state
        .memory_db
        .update_relationship(&char_id, &relationship)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_episodic_memory(
    state: State<'_, AppState>,
    char_id: String,
    category: String,
    content: String,
    significance: u32,
) -> Result<i64, String> {
    state
        .memory_db
        .add_episodic_memory(&char_id, &category, &content, significance)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_diary_entry(
    state: State<'_, AppState>,
    char_id: String,
    title: String,
    entry_text: String,
    mood: String,
) -> Result<i64, String> {
    state
        .memory_db
        .add_diary_entry(&char_id, &title, &entry_text, &mood)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn apply_emotional_decay(
    state: State<'_, AppState>,
    char_id: String,
) -> Result<Option<String>, String> {
    state
        .memory_db
        .apply_emotional_decay(&char_id)
        .map_err(|e| e.to_string())
}

// --- Phase 11: Soul Memory 2.0 Pipeline & Markdown Sync Commands ---

#[tauri::command]
pub async fn trigger_memory_pipeline(
    state: State<'_, AppState>,
    req: crate::modules::soul_memory_pipeline::SoulMemoryPipelineRequest,
) -> Result<crate::modules::soul_memory_pipeline::SoulMemoryPipelineResult, String> {
    crate::modules::soul_memory_pipeline::execute_soul_memory_pipeline(&state, req).await
}

#[tauri::command]
pub fn get_character_memory_markdown(
    state: State<'_, AppState>,
    char_id: String,
) -> Result<String, String> {
    state
        .memory_db
        .render_character_markdown(&char_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_character_memory_markdown(
    state: State<'_, AppState>,
    char_id: String,
    markdown: String,
) -> Result<(), String> {
    state
        .memory_db
        .parse_and_sync_character_markdown(&char_id, &markdown)
}

#[tauri::command]
pub fn get_user_memory_markdown(
    state: State<'_, AppState>,
    char_id: String,
    user_name: String,
) -> Result<String, String> {
    state
        .memory_db
        .render_user_markdown(&char_id, &user_name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_user_memory_markdown(
    state: State<'_, AppState>,
    char_id: String,
    user_name: String,
    markdown: String,
) -> Result<(), String> {
    state
        .memory_db
        .parse_and_sync_user_markdown(&char_id, &user_name, &markdown)
}

#[tauri::command]
pub async fn generate_manual_diary_entry(
    state: State<'_, AppState>,
    req: crate::modules::soul_memory_pipeline::SoulMemoryPipelineRequest,
) -> Result<crate::modules::memory::DiaryEntry, String> {
    let char_id = &req.character_id;
    let user_name = &req.user_name;
    let psych = state
        .memory_db
        .get_or_create_psychology(char_id)
        .map_err(|e| e.to_string())?;

    let messages = if let Some(cid) = &req.chat_id {
        state.memory_db.get_chat_messages(cid).unwrap_or_default()
    } else {
        let sessions = state
            .memory_db
            .list_chat_sessions(char_id)
            .unwrap_or_default();
        if let Some(first) = sessions.first() {
            state
                .memory_db
                .get_chat_messages(&first.id)
                .unwrap_or_default()
        } else {
            Vec::new()
        }
    };

    let recent = if messages.len() > 8 {
        &messages[messages.len() - 8..]
    } else {
        &messages[..]
    };

    let mut dialog_formatted = String::new();
    for msg in recent {
        dialog_formatted.push_str(&format!("{}: {}\n", msg.role, msg.content));
    }

    let diary_sys = crate::modules::soul_memory_pipeline::DIARY_SYSTEM_PROMPT
        .replace("{character}", char_id)
        .replace("{user_name}", user_name);

    let diary_user = format!(
        "Letztes Gespräch mit {}:\n{}\n\nDeine aktuelle Emotion: {} (Intensität: {}/5)",
        user_name, dialog_formatted, psych.primary_emotion, psych.intensity
    );

    let diary_req = ChatRequest {
        endpoint_url: req.endpoint_url.clone(),
        api_key: req.api_key.clone(),
        model: req.model.clone(),
        messages: vec![
            crate::modules::inference::ChatMessage {
                role: "system".to_string(),
                content: diary_sys,
            },
            crate::modules::inference::ChatMessage {
                role: "user".to_string(),
                content: diary_user,
            },
        ],
        sampling: Some(crate::modules::inference::SamplingParams {
            temperature: Some(0.6),
            max_tokens: Some(400),
            ..Default::default()
        }),
        reasoning_mode: Some(false),
        provider: req.provider.clone(),
    };

    let diary_raw = state.inference_client.generate_direct(diary_req).await?;
    let diary_text = diary_raw.trim();
    if diary_text.is_empty() {
        return Err(crate::err!("backend.memory.emptyDiary"));
    }

    let id = state
        .memory_db
        .add_diary_entry(
            char_id,
            "Innere Reflexion",
            diary_text,
            &psych.primary_emotion,
        )
        .map_err(|e| e.to_string())?;

    Ok(crate::modules::memory::DiaryEntry {
        id,
        title: "Innere Reflexion".to_string(),
        entry_text: diary_text.to_string(),
        mood: psych.primary_emotion.clone(),
        created_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0),
    })
}

#[tauri::command]
pub fn import_sow_memory_files(
    state: State<'_, AppState>,
    char_id: String,
    folder_path: String,
    user_name: String,
) -> Result<usize, String> {
    state.memory_db.import_sow_memory_folder(
        &char_id,
        std::path::Path::new(&folder_path),
        &user_name,
    )
}

#[tauri::command]
pub fn backup_memory_state(
    state: State<'_, AppState>,
    char_id: String,
    user_name: Option<String>,
) -> Result<crate::modules::memory::MemoryBackupInfo, String> {
    state
        .memory_db
        .backup_memory_state(&char_id, user_name.as_deref(), None)
}

#[tauri::command]
pub fn list_memory_backups(
    state: State<'_, AppState>,
    char_id: String,
) -> Result<Vec<crate::modules::memory::MemoryBackupInfo>, String> {
    state.memory_db.list_memory_backups(&char_id, None)
}

#[tauri::command]
pub fn restore_memory_backup(
    state: State<'_, AppState>,
    backup_file_path: String,
) -> Result<(), String> {
    state
        .memory_db
        .restore_memory_backup(std::path::Path::new(&backup_file_path))
}

// --- Phase 6: Soul Stage Tabletop RPG Commands ---

#[tauri::command]
pub fn roll_stage_dice(
    formula: String,
    target_dc: Option<i32>,
) -> Result<crate::modules::stage::DiceRollResult, String> {
    crate::modules::stage::roll_dice(&formula, target_dc)
}

#[tauri::command]
pub fn get_stage_state(state: State<'_, AppState>) -> crate::modules::stage::SceneState {
    state.stage_engine.get_state()
}

#[tauri::command]
pub fn list_stage_scenes() -> Result<Vec<crate::modules::stage::ScenePreview>, String> {
    Ok(crate::modules::stage::scan_available_scenes())
}

#[tauri::command]
pub fn load_stage_scene(
    state: State<'_, AppState>,
    scene_id: String,
) -> Result<crate::modules::stage::SceneState, String> {
    let scene_st = crate::modules::stage::load_scene_by_id(&scene_id)?;
    state.stage_engine.set_state(scene_st.clone());
    Ok(scene_st)
}

#[tauri::command]
pub fn save_stage_scene(
    state: State<'_, AppState>,
    scene_state: crate::modules::stage::SceneState,
) -> Result<(), String> {
    crate::modules::stage::save_scene_state(&scene_state)?;
    state.stage_engine.set_state(scene_state);
    Ok(())
}

#[tauri::command]
pub fn create_stage_scene(
    state: State<'_, AppState>,
    definition: crate::modules::stage::SceneDefinition,
) -> Result<crate::modules::stage::SceneState, String> {
    let scene_st = crate::modules::stage::create_custom_scene(definition)?;
    state.stage_engine.set_state(scene_st.clone());
    Ok(scene_st)
}

#[tauri::command]
pub fn delete_stage_scene(scene_id: String) -> Result<(), String> {
    crate::modules::stage::delete_scene(&scene_id)
}

#[tauri::command]
pub fn export_stage_markdown(scene_id: String) -> Result<String, String> {
    crate::modules::stage::export_scene_to_markdown(&scene_id)
}

#[tauri::command]
pub fn stage_list_folders() -> Result<Vec<String>, String> {
    crate::modules::stage::list_stage_folders()
}

#[tauri::command]
pub fn stage_create_folder(folder_name: String) -> Result<(), String> {
    crate::modules::stage::create_stage_folder(&folder_name)
}

#[tauri::command]
pub fn stage_move_scene_to_folder(
    state: State<'_, AppState>,
    scene_id: String,
    target_folder: String,
) -> Result<crate::modules::stage::SceneState, String> {
    let res = crate::modules::stage::move_stage_scene_to_folder(&scene_id, &target_folder)?;
    state.stage_engine.set_state(res.clone());
    Ok(res)
}

#[tauri::command]
pub fn stage_delete_folder(folder_name: String) -> Result<(), String> {
    crate::modules::stage::delete_stage_folder(&folder_name)
}

#[tauri::command]
pub fn stage_import_scene_json(
    state: State<'_, AppState>,
    json_content: String,
    target_folder: Option<String>,
) -> Result<crate::modules::stage::SceneState, String> {
    let res =
        crate::modules::stage::import_stage_scene_json(&json_content, target_folder.as_deref())?;
    state.stage_engine.set_state(res.clone());
    Ok(res)
}

#[tauri::command]
pub fn stage_export_scene_json(scene_id: String) -> Result<String, String> {
    crate::modules::stage::export_stage_scene_json(&scene_id)
}

#[tauri::command]
pub fn stage_reset_scene(
    state: State<'_, AppState>,
    scene_id: String,
) -> Result<crate::modules::stage::SceneState, String> {
    let res = crate::modules::stage::reset_stage_scene(&scene_id)?;
    state.stage_engine.set_state(res.clone());
    Ok(res)
}

#[tauri::command]
pub fn stage_edit_message(
    state: State<'_, AppState>,
    scene_id: String,
    message_id: String,
    new_content: String,
) -> Result<crate::modules::stage::SceneState, String> {
    crate::modules::stage::edit_stage_turn_message(
        &state.stage_engine,
        &scene_id,
        &message_id,
        &new_content,
    )
}

#[tauri::command]
pub fn stage_delete_message(
    state: State<'_, AppState>,
    scene_id: String,
    message_id: String,
) -> Result<crate::modules::stage::SceneState, String> {
    crate::modules::stage::delete_stage_turn_message(&state.stage_engine, &scene_id, &message_id)
}

#[tauri::command]
pub async fn stage_regenerate_turn(
    state: State<'_, AppState>,
    scene_id: String,
) -> Result<crate::modules::stage::SceneState, String> {
    crate::modules::stage::regenerate_stage_turn(
        &state.stage_engine,
        &state.inference_client,
        &scene_id,
    )
    .await
}

#[tauri::command]
pub fn stage_get_background_image(name: String) -> Result<String, String> {
    crate::modules::stage::get_stage_background_image(&name)
}

#[tauri::command]
pub async fn run_stage_turn(
    state: State<'_, AppState>,
    request: crate::modules::stage::StageTurnRequest,
) -> Result<crate::modules::stage::SceneState, String> {
    crate::modules::stage::execute_stage_turn(&state.stage_engine, &state.inference_client, request)
        .await
}

#[tauri::command]
pub fn undo_stage_turn(
    state: State<'_, AppState>,
    scene_id: String,
) -> Result<crate::modules::stage::SceneState, String> {
    state.stage_engine.undo_turn(&scene_id)
}

#[tauri::command]
pub async fn rest_stage_party(
    state: State<'_, AppState>,
    scene_id: String,
    rest_type: String,
) -> Result<crate::modules::stage::SceneState, String> {
    crate::modules::stage::execute_stage_rest(
        &state.stage_engine,
        &state.inference_client,
        &scene_id,
        &rest_type,
    )
    .await
}

#[tauri::command]
pub fn use_stage_inventory_item(
    state: State<'_, AppState>,
    scene_id: String,
    item_id: String,
) -> Result<crate::modules::stage::SceneState, String> {
    state.stage_engine.use_inventory_item(&scene_id, &item_id)
}

#[tauri::command]
pub fn delay_encounter_turn(
    state: State<'_, AppState>,
) -> Result<crate::modules::stage::SceneState, String> {
    let scene = state.stage_engine.delay_turn()?;
    crate::modules::stage::save_scene_state(&scene)?;
    Ok(scene)
}

#[tauri::command]
pub fn update_world_state(
    state: State<'_, AppState>,
    world: crate::modules::stage::WorldState,
) -> Result<(), String> {
    state.stage_engine.update_world(world);
    crate::modules::stage::save_scene_state(&state.stage_engine.get_state())?;
    Ok(())
}

#[tauri::command]
pub fn set_clock_progress(
    state: State<'_, AppState>,
    clock_id: String,
    progress: u32,
) -> Result<(), String> {
    state.stage_engine.set_clock_progress(&clock_id, progress);
    crate::modules::stage::save_scene_state(&state.stage_engine.get_state())?;
    Ok(())
}

#[tauri::command]
pub fn add_clock(
    state: State<'_, AppState>,
    clock: crate::modules::stage::CampaignClock,
) -> Result<(), String> {
    state.stage_engine.add_clock(clock);
    crate::modules::stage::save_scene_state(&state.stage_engine.get_state())?;
    Ok(())
}

#[tauri::command]
pub fn delete_clock(state: State<'_, AppState>, clock_id: String) -> Result<(), String> {
    state.stage_engine.delete_clock(&clock_id);
    crate::modules::stage::save_scene_state(&state.stage_engine.get_state())?;
    Ok(())
}

#[tauri::command]
pub fn start_encounter(state: State<'_, AppState>) -> Result<(), String> {
    state.stage_engine.start_encounter();
    crate::modules::stage::save_scene_state(&state.stage_engine.get_state())?;
    Ok(())
}

#[tauri::command]
pub fn end_encounter(state: State<'_, AppState>) -> Result<(), String> {
    state.stage_engine.end_encounter();
    crate::modules::stage::save_scene_state(&state.stage_engine.get_state())?;
    Ok(())
}

#[tauri::command]
pub fn next_encounter_turn(state: State<'_, AppState>) -> Result<(), String> {
    state.stage_engine.next_turn();
    crate::modules::stage::save_scene_state(&state.stage_engine.get_state())?;
    Ok(())
}

#[tauri::command]
pub fn apply_combatant_delta(
    state: State<'_, AppState>,
    combatant_id: String,
    hp_delta: i32,
    stress_delta: i32,
) -> Result<(), String> {
    state
        .stage_engine
        .apply_combatant_delta(&combatant_id, hp_delta, stress_delta);
    crate::modules::stage::save_scene_state(&state.stage_engine.get_state())?;
    Ok(())
}

#[tauri::command]
pub fn add_combatant_condition(
    state: State<'_, AppState>,
    combatant_id: String,
    condition: crate::modules::stage::CombatCondition,
) -> Result<(), String> {
    state.stage_engine.add_condition(&combatant_id, condition);
    crate::modules::stage::save_scene_state(&state.stage_engine.get_state())?;
    Ok(())
}

// --- Phase 7: Soul Companion & Tool Calling Commands ---

#[tauri::command]
pub fn get_companion_state(
    state: State<'_, AppState>,
) -> crate::modules::companion::CompanionState {
    state.companion_engine.get_state()
}

#[tauri::command]
pub fn apply_hormone_interaction(
    state: State<'_, AppState>,
    interaction_type: String,
) -> Result<crate::modules::companion::Neurohormones, String> {
    Ok(state
        .companion_engine
        .apply_hormone_interaction(&interaction_type))
}

#[tauri::command]
pub fn set_hormones(
    state: State<'_, AppState>,
    dopamine: f32,
    cortisol: f32,
    oxytocin: f32,
    fatigue: f32,
) -> Result<crate::modules::companion::Neurohormones, String> {
    Ok(state
        .companion_engine
        .set_hormone_values(dopamine, cortisol, oxytocin, fatigue))
}

#[tauri::command]
pub fn request_tool_call(
    state: State<'_, AppState>,
    tool_name: String,
    arguments: serde_json::Value,
) -> Result<crate::modules::companion::ToolCallRequest, String> {
    state
        .companion_engine
        .request_tool_call(&tool_name, arguments)
}

#[tauri::command]
pub fn resolve_tool_call(
    state: State<'_, AppState>,
    call_id: String,
    approved: bool,
) -> Result<crate::modules::companion::ToolExecutionResult, String> {
    state.companion_engine.resolve_tool_call(&call_id, approved)
}

#[tauri::command]
pub fn update_companion_settings(
    state: State<'_, AppState>,
    settings: crate::modules::companion::CompanionSettings,
) -> Result<(), String> {
    state.companion_engine.update_settings(settings);
    Ok(())
}

#[tauri::command]
pub fn add_companion_thought(state: State<'_, AppState>, thought: String) -> Result<(), String> {
    state.companion_engine.add_thought(&thought);
    Ok(())
}

#[tauri::command]
pub fn clear_companion_thoughts(state: State<'_, AppState>) -> Result<(), String> {
    state.companion_engine.clear_thoughts();
    Ok(())
}

#[tauri::command]
pub fn add_companion_goal(
    state: State<'_, AppState>,
    summary: String,
    due_minutes: i64,
) -> Result<crate::modules::companion::Goal, String> {
    Ok(state.companion_engine.add_promise(&summary, due_minutes))
}

#[tauri::command]
pub fn mark_companion_goal_completed(
    state: State<'_, AppState>,
    goal_id: String,
) -> Result<(), String> {
    state.companion_engine.mark_goal_completed(&goal_id)
}

#[tauri::command]
pub fn delete_companion_goal(state: State<'_, AppState>, goal_id: String) -> Result<(), String> {
    state.companion_engine.delete_goal(&goal_id)
}

#[tauri::command]
pub fn get_companion_environment_snapshot() -> crate::modules::companion_tools::EnvironmentSnapshot
{
    crate::modules::companion_tools::CompanionTools::get_environment_snapshot()
}

#[tauri::command]
pub fn detect_desktop_window(state: State<'_, AppState>) -> String {
    let title = state.companion_engine.detect_active_window();
    state.companion_engine.set_active_window(&title);
    title
}

#[tauri::command]
pub fn list_mcp_servers(
    state: State<'_, AppState>,
) -> Vec<crate::modules::mcp_client::McpServerConfig> {
    state.companion_engine.mcp().list_servers()
}

#[tauri::command]
pub fn save_mcp_servers(
    state: State<'_, AppState>,
    servers: Vec<crate::modules::mcp_client::McpServerConfig>,
) -> Result<(), String> {
    state.companion_engine.mcp().save_servers(servers)
}

#[tauri::command]
pub fn toggle_mcp_server(
    state: State<'_, AppState>,
    server_id: String,
    enabled: bool,
) -> Result<Vec<crate::modules::mcp_client::McpServerConfig>, String> {
    state
        .companion_engine
        .mcp()
        .toggle_server(&server_id, enabled)
}

#[tauri::command]
pub async fn fetch_mcp_server_tools(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Vec<crate::modules::mcp_client::McpToolInfo>, String> {
    state
        .companion_engine
        .mcp()
        .fetch_server_tools(&server_id)
        .await
}

#[tauri::command]
pub async fn call_mcp_tool(
    state: State<'_, AppState>,
    server_id: String,
    tool_name: String,
    arguments: serde_json::Value,
) -> Result<String, String> {
    state
        .companion_engine
        .mcp()
        .call_mcp_tool(&server_id, &tool_name, arguments)
        .await
}

#[tauri::command]
pub fn list_companion_plugins(
    state: State<'_, AppState>,
) -> Vec<crate::modules::mcp_client::CompanionPlugin> {
    state.companion_engine.mcp().list_plugins()
}

#[tauri::command]
pub fn save_companion_plugin(
    state: State<'_, AppState>,
    plugin: crate::modules::mcp_client::CompanionPlugin,
) -> Result<(), String> {
    state.companion_engine.mcp().save_plugin(plugin)
}

#[tauri::command]
pub async fn execute_companion_plugin(
    state: State<'_, AppState>,
    plugin_id: String,
    arguments: serde_json::Value,
) -> Result<String, String> {
    state
        .companion_engine
        .mcp()
        .execute_plugin(&plugin_id, arguments)
        .await
}

#[tauri::command]
pub async fn toggle_companion_overlay(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    enable: bool,
    click_through: bool,
) -> Result<bool, String> {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("companion_overlay") {
        if enable {
            let _ = window.show();
            let _ = window.set_focus();
            let _ = window.set_ignore_cursor_events(click_through);
        } else {
            let _ = window.hide();
        }
    } else if enable {
        let builder = tauri::WebviewWindowBuilder::new(
            &app,
            "companion_overlay",
            tauri::WebviewUrl::App("index.html?overlay=true".into()),
        )
        .title("OtakuSoul Companion")
        .inner_size(380.0, 560.0)
        .resizable(true)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .shadow(false);

        let window = builder
            .build()
            .map_err(|e| crate::err!("backend.companion.overlayWindow", error = e))?;
        let _ = window.set_ignore_cursor_events(click_through);
    }
    state.companion_engine.set_overlay_active(enable);
    Ok(enable)
}

#[tauri::command]
pub fn evaluate_companion_proactive(state: State<'_, AppState>) -> Option<(String, String)> {
    state.companion_engine.evaluate_proactive_opportunity()
}

// --- Technical Debt & Phase 8: Data Foundation, Settings & Character Library Commands ---

#[tauri::command]
pub fn get_app_paths() -> crate::modules::paths::AppPaths {
    crate::modules::paths::resolve_app_paths()
}

/// Opens the folder for additional VRM avatars (e.g. the release avatar pack) in the file manager.
#[tauri::command]
pub fn open_avatar_folder(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let dir = std::path::PathBuf::from(crate::modules::paths::resolve_app_paths().data_dir)
        .join("avatars");
    std::fs::create_dir_all(&dir)
        .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    app.opener()
        .open_path(dir.to_string_lossy(), None::<&str>)
        .map_err(|e| crate::err!("backend.common.openFolder", error = e))
}

#[tauri::command]
pub fn scan_characters() -> Vec<crate::modules::characters::CharacterProfile> {
    crate::modules::paths::scan_available_characters()
}

#[tauri::command]
pub fn scan_models() -> Vec<crate::modules::paths::ScannedModel> {
    crate::modules::paths::scan_available_models()
}

#[tauri::command]
pub fn scan_vrm_models() -> Vec<crate::modules::paths::ScannedVrm> {
    crate::modules::paths::scan_available_vrm_models()
}

#[tauri::command]
pub fn load_settings() -> crate::modules::settings::AppSettings {
    crate::modules::settings::load_app_settings()
}

#[tauri::command]
pub fn save_settings(settings: crate::modules::settings::AppSettings) -> Result<(), String> {
    crate::modules::settings::save_frontend_settings(settings)
}

#[tauri::command]
pub fn save_character_card(
    profile: crate::modules::characters::CharacterProfile,
) -> Result<crate::modules::characters::CharacterProfile, String> {
    crate::modules::characters::save_character_to_user_dir(&profile)
}

#[tauri::command]
pub fn export_character_card(
    profile: crate::modules::characters::CharacterProfile,
    target_path: String,
    export_as_png: bool,
) -> Result<(), String> {
    crate::modules::characters::export_character_card(
        &profile,
        std::path::Path::new(&target_path),
        export_as_png,
    )
}

#[tauri::command]
pub fn delete_character(char_id: String) -> Result<(), String> {
    crate::modules::characters::delete_character(&char_id)
}

#[tauri::command]
pub fn restore_hidden_characters() -> Result<(), String> {
    crate::modules::characters::restore_hidden_characters()
}

#[tauri::command]
pub fn load_personas() -> Vec<crate::modules::characters::UserPersona> {
    crate::modules::characters::load_personas()
}

#[tauri::command]
pub fn save_persona(
    persona: crate::modules::characters::UserPersona,
) -> Result<Vec<crate::modules::characters::UserPersona>, String> {
    crate::modules::characters::save_persona(persona)
}

#[tauri::command]
pub fn delete_persona(
    persona_id: String,
) -> Result<Vec<crate::modules::characters::UserPersona>, String> {
    crate::modules::characters::delete_persona(&persona_id)
}

// --- Phase 9: Vollwertiger Chat & Swipes Commands ---

#[tauri::command]
pub fn create_chat_session(
    state: State<'_, AppState>,
    character_id: String,
    title: String,
) -> Result<crate::modules::memory::ChatSession, String> {
    state
        .memory_db
        .create_chat_session(&character_id, &title)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_chat_sessions(
    state: State<'_, AppState>,
    character_id: String,
) -> Result<Vec<crate::modules::memory::ChatSession>, String> {
    state
        .memory_db
        .list_chat_sessions(&character_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_chat_session(
    state: State<'_, AppState>,
    chat_id: String,
) -> Result<Option<crate::modules::memory::ChatSession>, String> {
    state
        .memory_db
        .get_chat_session(&chat_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_chat_session(state: State<'_, AppState>, chat_id: String) -> Result<(), String> {
    state
        .memory_db
        .delete_chat_session(&chat_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_chat_session(
    state: State<'_, AppState>,
    chat_id: String,
    new_title: String,
) -> Result<(), String> {
    state
        .memory_db
        .rename_chat_session(&chat_id, &new_title)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_chat_author_note(
    state: State<'_, AppState>,
    chat_id: String,
    author_note: String,
    author_note_depth: u32,
) -> Result<(), String> {
    state
        .memory_db
        .update_chat_author_note(&chat_id, &author_note, author_note_depth)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_chat_messages(
    state: State<'_, AppState>,
    chat_id: String,
) -> Result<Vec<crate::modules::memory::StoredChatMessage>, String> {
    state
        .memory_db
        .get_chat_messages(&chat_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_chat_message(
    state: State<'_, AppState>,
    chat_id: String,
    role: String,
    content: String,
    thought: Option<String>,
) -> Result<crate::modules::memory::StoredChatMessage, String> {
    state
        .memory_db
        .add_chat_message(&chat_id, &role, &content, thought.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_chat_message(
    state: State<'_, AppState>,
    msg_id: String,
    content: String,
    thought: Option<String>,
) -> Result<crate::modules::memory::StoredChatMessage, String> {
    state
        .memory_db
        .update_chat_message(&msg_id, &content, thought.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_message_swipe(
    state: State<'_, AppState>,
    msg_id: String,
    content: String,
    thought: Option<String>,
) -> Result<crate::modules::memory::StoredChatMessage, String> {
    state
        .memory_db
        .add_message_swipe(&msg_id, &content, thought.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn switch_message_swipe(
    state: State<'_, AppState>,
    msg_id: String,
    swipe_index: usize,
) -> Result<crate::modules::memory::StoredChatMessage, String> {
    state
        .memory_db
        .switch_message_swipe(&msg_id, swipe_index)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_chat_message(state: State<'_, AppState>, msg_id: String) -> Result<(), String> {
    state
        .memory_db
        .delete_chat_message(&msg_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_messages_after(
    state: State<'_, AppState>,
    chat_id: String,
    order_index: i32,
) -> Result<(), String> {
    state
        .memory_db
        .delete_messages_after(&chat_id, order_index)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_chat_jsonl(
    state: State<'_, AppState>,
    chat_id: String,
    char_name: String,
    user_name: String,
) -> Result<String, String> {
    state
        .memory_db
        .export_chat_jsonl(&chat_id, &char_name, &user_name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_chat_jsonl(
    state: State<'_, AppState>,
    character_id: String,
    jsonl_content: String,
    title_override: Option<String>,
) -> Result<crate::modules::memory::ChatSession, String> {
    state
        .memory_db
        .import_chat_jsonl(&character_id, &jsonl_content, title_override.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fetch_openrouter_models(
    api_key: Option<String>,
) -> Result<Vec<crate::modules::providers::OpenRouterModelInfo>, String> {
    crate::modules::providers::fetch_openrouter_models(api_key.as_deref()).await
}

#[tauri::command]
pub fn load_llm_presets() -> Result<Vec<crate::modules::llm_presets::LlmPreset>, String> {
    Ok(crate::modules::llm_presets::load_llm_presets(None))
}

#[tauri::command]
pub fn save_llm_preset(
    preset: crate::modules::llm_presets::LlmPreset,
) -> Result<Vec<crate::modules::llm_presets::LlmPreset>, String> {
    crate::modules::llm_presets::save_llm_preset(preset, None)
}

#[tauri::command]
pub fn delete_llm_preset(
    preset_id: String,
) -> Result<Vec<crate::modules::llm_presets::LlmPreset>, String> {
    crate::modules::llm_presets::delete_llm_preset(&preset_id, None)
}

#[tauri::command]
pub async fn search_hf_models(
    query: String,
) -> Result<Vec<crate::modules::models_hub::HfModelSummary>, String> {
    crate::modules::models_hub::search_hf_models(&query).await
}

#[tauri::command]
pub async fn get_hf_model_files(
    model_id: String,
) -> Result<Vec<crate::modules::models_hub::HfGgufFile>, String> {
    crate::modules::models_hub::get_hf_model_files(&model_id).await
}

#[tauri::command]
pub async fn download_gguf_model(
    app: tauri::AppHandle,
    download_url: String,
    filename: String,
) -> Result<String, String> {
    crate::modules::models_hub::download_gguf_file(&app, &download_url, &filename).await
}

// --- Voice / TTS Commands ---

#[tauri::command]
pub async fn list_available_voices(
    engine: String,
    elevenlabs_api_key: String,
    kokoro_voices_path: String,
) -> Result<Vec<crate::modules::voice::ScannedVoice>, String> {
    crate::modules::voice::list_available_voices(&engine, &elevenlabs_api_key, &kokoro_voices_path)
        .await
}

#[tauri::command]
pub fn get_kokoro_installation() -> Option<crate::modules::kokoro::KokoroInstallResult> {
    crate::modules::kokoro::detect_installation()
}

#[tauri::command]
pub async fn install_kokoro_model(
    app: tauri::AppHandle,
) -> Result<crate::modules::kokoro::KokoroInstallResult, String> {
    crate::modules::kokoro::install(&app).await
}

#[tauri::command]
pub async fn synthesize_speech(
    text: String,
    config: crate::modules::voice::VoiceConfig,
) -> Result<String, String> {
    crate::modules::voice::synthesize_speech(&text, &config).await
}

#[tauri::command]
pub async fn transcribe_speech(
    audio_base64: String,
    config: crate::modules::voice::SttConfig,
) -> Result<String, String> {
    crate::modules::voice::transcribe_speech(&audio_base64, &config).await
}

#[tauri::command]
pub fn get_character_voice_config(char_id: String) -> crate::modules::voice::VoiceConfig {
    crate::modules::voice::load_character_voice_config(&char_id)
}

#[tauri::command]
pub fn save_character_voice_config(
    char_id: String,
    config: crate::modules::voice::VoiceConfig,
) -> Result<(), String> {
    crate::modules::voice::save_character_voice_config(&char_id, &config)
}

// --- Phase 14: Live2D & Emotion Classification Commands ---

#[tauri::command]
pub fn scan_live2d_models() -> Vec<crate::modules::live2d::ScannedLive2d> {
    crate::modules::live2d::scan_available_live2d_models()
}

#[tauri::command]
pub fn get_live2d_catalog() -> Vec<crate::modules::live2d::Live2dCatalogItem> {
    crate::modules::live2d::get_live2d_catalog()
}

#[tauri::command]
pub async fn download_live2d_model(model_id: String) -> Result<String, String> {
    crate::modules::live2d::download_live2d_model(&model_id).await
}

#[tauri::command]
pub fn classify_text_emotion(text: String) -> crate::modules::emotions::EmotionResult {
    crate::modules::emotions::classify_emotion(&text)
}

#[tauri::command]
pub fn import_live2d_model(
    source_path: String,
) -> Result<crate::modules::live2d::ScannedLive2d, String> {
    crate::modules::live2d::import_live2d_model(&source_path)
}

#[tauri::command]
pub fn import_sow_live2d_models() -> Result<usize, String> {
    crate::modules::live2d::import_sow_live2d_models()
}

// --- Soul Hub (Soul Gateway, Chub AI, World Lorebooks & Stage Scenarios) Commands ---

#[tauri::command]
pub async fn fetch_soul_gateway_registry()
-> Result<Vec<crate::modules::soul_hub::GatewayCharacterEntry>, String> {
    crate::modules::soul_hub::fetch_soul_gateway_registry().await
}

#[tauri::command]
pub async fn import_soul_gateway_character(
    name: String,
    author: String,
    download_url: String,
) -> Result<crate::modules::soul_hub::CharacterImportResult, String> {
    crate::modules::soul_hub::import_soul_gateway_character(&name, &author, &download_url).await
}

#[tauri::command]
pub async fn search_chub_characters(
    query: String,
    page: u32,
    first: u32,
    sort: String,
    topics: Option<Vec<String>>,
    nsfw: bool,
) -> Result<crate::modules::soul_hub::ChubSearchResult, String> {
    crate::modules::soul_hub::search_chub_characters(&query, page, first, &sort, topics, nsfw).await
}

#[tauri::command]
pub async fn get_chub_character_details(
    full_path: String,
) -> Result<crate::modules::soul_hub::ChubCharacterDetail, String> {
    crate::modules::soul_hub::get_chub_character_details(&full_path).await
}

#[tauri::command]
pub async fn import_chub_character(
    full_path: String,
) -> Result<crate::modules::soul_hub::CharacterImportResult, String> {
    crate::modules::soul_hub::import_chub_character(&full_path).await
}

#[tauri::command]
pub async fn import_character_from_url(
    url: String,
) -> Result<crate::modules::soul_hub::CharacterImportResult, String> {
    crate::modules::soul_hub::import_character_from_url(&url).await
}

#[tauri::command]
pub async fn fetch_lorebooks_gateway_registry()
-> Result<Vec<crate::modules::soul_hub::GatewayLorebookEntry>, String> {
    crate::modules::soul_hub::fetch_lorebooks_gateway_registry().await
}

#[tauri::command]
pub async fn import_lorebook_from_gateway(
    download_url: String,
    fallback_name: String,
) -> Result<crate::modules::lorebook::Lorebook, String> {
    crate::modules::soul_hub::import_lorebook_from_gateway(&download_url, &fallback_name).await
}

#[tauri::command]
pub async fn fetch_stages_gateway_registry()
-> Result<Vec<crate::modules::soul_hub::GatewaySceneEntry>, String> {
    crate::modules::soul_hub::fetch_stages_gateway_registry().await
}

#[tauri::command]
pub async fn import_scene_from_gateway(
    download_url: String,
    fallback_title: String,
) -> Result<crate::modules::stage::SceneState, String> {
    crate::modules::soul_hub::import_scene_from_gateway(&download_url, &fallback_title).await
}

// --- Phase 17: Ecosystem, Backups, Image Generation, Discord & Web Client ---

#[tauri::command]
pub fn create_profile_backup(
    selection: crate::modules::profile_backup::BackupGroupSelection,
    description: Option<String>,
) -> Result<crate::modules::profile_backup::BackupEntryInfo, String> {
    crate::modules::profile_backup::ProfileBackupManager::create_backup(
        selection,
        description,
        false,
    )
}

#[tauri::command]
pub fn list_profile_backups() -> Result<Vec<crate::modules::profile_backup::BackupEntryInfo>, String>
{
    Ok(crate::modules::profile_backup::ProfileBackupManager::list_backups())
}

#[tauri::command]
pub fn restore_profile_backup(
    filename: String,
    groups: Option<crate::modules::profile_backup::BackupGroupSelection>,
) -> Result<String, String> {
    crate::modules::profile_backup::ProfileBackupManager::restore_backup(&filename, groups)
}

#[tauri::command]
pub fn delete_profile_backup(filename: String) -> Result<bool, String> {
    crate::modules::profile_backup::ProfileBackupManager::delete_backup(&filename)
}

#[tauri::command]
pub fn get_image_gen_config() -> Result<crate::modules::image_generator::ImageGenConfig, String> {
    Ok(crate::modules::image_generator::ImageGenerator::load_config())
}

#[tauri::command]
pub fn save_image_gen_config(
    config: crate::modules::image_generator::ImageGenConfig,
) -> Result<(), String> {
    crate::modules::image_generator::ImageGenerator::save_config(&config)
}

#[tauri::command]
pub fn build_character_image_prompt(
    character_name: String,
    character_description: Option<String>,
    emotion: Option<String>,
    scene_context: Option<String>,
    user_prompt: Option<String>,
) -> Result<String, String> {
    Ok(
        crate::modules::image_generator::ImageGenerator::build_character_prompt(
            &character_name,
            character_description.as_deref(),
            emotion.as_deref(),
            scene_context.as_deref(),
            user_prompt.as_deref(),
        ),
    )
}

#[tauri::command]
pub async fn generate_image_action(
    prompt: String,
    negative: Option<String>,
    custom_config: Option<crate::modules::image_generator::ImageGenConfig>,
) -> Result<crate::modules::image_generator::GeneratedImageResult, String> {
    crate::modules::image_generator::ImageGenerator::generate_image(
        &prompt,
        negative.as_deref(),
        custom_config,
    )
    .await
}

#[tauri::command]
pub fn list_generated_images()
-> Result<Vec<crate::modules::image_generator::GeneratedImageInfo>, String> {
    Ok(crate::modules::image_generator::ImageGenerator::list_generated_images())
}

#[tauri::command]
pub fn set_discord_rpc_enabled(state: State<'_, AppState>, enabled: bool) -> Result<(), String> {
    state.discord_rpc.set_enabled(enabled);
    Ok(())
}

#[tauri::command]
pub fn get_discord_rpc_enabled(state: State<'_, AppState>) -> Result<bool, String> {
    Ok(state.discord_rpc.is_enabled())
}

#[tauri::command]
pub async fn update_discord_rpc_activity(
    state: State<'_, AppState>,
    activity: crate::modules::discord::DiscordRpcActivity,
) -> Result<(), String> {
    state.discord_rpc.update_activity(activity).await;
    Ok(())
}

#[tauri::command]
pub async fn get_discord_bot_config(
    _state: State<'_, AppState>,
) -> Result<crate::modules::discord::DiscordBotConfig, String> {
    Ok(crate::modules::discord::DiscordBotManager::load_config())
}

#[tauri::command]
pub async fn save_discord_bot_config(
    state: State<'_, AppState>,
    config: crate::modules::discord::DiscordBotConfig,
) -> Result<(), String> {
    state.discord_bot.save_config(config).await
}

#[tauri::command]
pub async fn start_discord_bot(state: State<'_, AppState>) -> Result<(), String> {
    state.discord_bot.start_bot().await
}

#[tauri::command]
pub async fn stop_discord_bot(state: State<'_, AppState>) -> Result<(), String> {
    state.discord_bot.stop_bot().await
}

#[tauri::command]
pub async fn get_discord_bot_status(
    state: State<'_, AppState>,
) -> Result<crate::modules::discord::DiscordBotStatus, String> {
    Ok(state.discord_bot.get_status().await)
}

#[tauri::command]
pub fn get_web_server_config(
    _state: State<'_, AppState>,
) -> Result<crate::modules::web_server::WebServerConfig, String> {
    Ok(crate::modules::web_server::WebServerManager::load_config())
}

#[tauri::command]
pub async fn save_web_server_config(
    state: State<'_, AppState>,
    config: crate::modules::web_server::WebServerConfig,
) -> Result<(), String> {
    state.web_server.save_config(config).await
}

#[tauri::command]
pub async fn start_web_server(state: State<'_, AppState>) -> Result<(), String> {
    state.web_server.start_server().await
}

#[tauri::command]
pub async fn stop_web_server(state: State<'_, AppState>) -> Result<(), String> {
    state.web_server.stop_server().await
}

#[tauri::command]
pub async fn get_web_server_status(
    state: State<'_, AppState>,
) -> Result<crate::modules::web_server::WebServerStatus, String> {
    Ok(state.web_server.get_status().await)
}

#[tauri::command]
pub async fn regenerate_web_server_token(state: State<'_, AppState>) -> Result<String, String> {
    state.web_server.regenerate_token().await
}

#[tauri::command]
pub fn build_character_wizard_prompt_cmd(
    input: crate::modules::characters::CharacterWizardInput,
) -> Result<String, String> {
    Ok(crate::modules::characters::build_character_wizard_prompt(
        &input,
    ))
}

#[tauri::command]
pub fn parse_character_wizard_draft_cmd(
    raw_text: String,
) -> Result<crate::modules::characters::CharacterDraft, String> {
    crate::modules::characters::parse_character_wizard_draft(&raw_text)
}

#[tauri::command]
pub fn create_character_from_draft(
    draft: crate::modules::characters::CharacterDraft,
) -> Result<crate::modules::characters::CharacterProfile, String> {
    let paths = crate::modules::paths::resolve_app_paths();
    let sanitized_name = draft
        .name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>();
    let filename = format!("{}.json", sanitized_name);
    let target_path = std::path::PathBuf::from(&paths.characters_dir).join(&filename);

    let card = crate::modules::characters::CharacterCardV2 {
        spec: "chara_card_v2".to_string(),
        spec_version: "2.0".to_string(),
        data: crate::modules::characters::CharacterData {
            name: draft.name.clone(),
            description: draft.description,
            personality: draft.personality,
            scenario: draft.scenario,
            first_mes: draft.first_mes,
            mes_example: draft.mes_example,
            system_prompt: Some(draft.system_prompt),
            tags: draft.tags,
            creator: Some("OtakuSoul AI Assistant".to_string()),
            ..Default::default()
        },
    };

    let json_bytes = serde_json::to_vec_pretty(&card)
        .map_err(|e| crate::err!("backend.characters.serialize", error = e))?;
    std::fs::write(&target_path, json_bytes)
        .map_err(|e| crate::err!("backend.characters.save", error = e))?;

    crate::modules::characters::load_character_from_file(&target_path)
}

#[tauri::command]
pub async fn generate_character_draft_llm(
    state: State<'_, AppState>,
    input: crate::modules::characters::CharacterWizardInput,
    endpoint_url: String,
    api_key: Option<String>,
    model: Option<String>,
    provider: Option<crate::modules::providers::LlmProviderType>,
) -> Result<crate::modules::characters::CharacterDraft, String> {
    let prompt = crate::modules::characters::build_character_wizard_prompt(&input);
    let req = crate::modules::inference::ChatRequest {
        endpoint_url,
        api_key,
        model,
        messages: vec![
            crate::modules::inference::ChatMessage {
                role: "system".to_string(),
                content: "Du bist ein erfahrener Rollenspiel- und KI-Charakter-Autor. Du generierst konsistente, psychologisch vielschichtige Charakter-Profile im SillyTavern V2 Format. Antworte AUSSCHLIESSLICH im geforderten JSON-Format.".to_string(),
            },
            crate::modules::inference::ChatMessage {
                role: "user".to_string(),
                content: prompt,
            },
        ],
        sampling: Some(crate::modules::inference::SamplingParams {
            temperature: Some(0.7),
            max_tokens: Some(2500),
            ..Default::default()
        }),
        reasoning_mode: Some(false),
        provider,
    };

    let raw = state.inference_client.generate_direct(req).await?;
    crate::modules::characters::parse_character_wizard_draft(&raw)
}

// Phase 18: Logging & Updater Commands
#[tauri::command]
pub fn get_app_logs(
    max_lines: Option<usize>,
) -> Result<Vec<crate::modules::logger::LogEntry>, String> {
    Ok(crate::modules::logger::get_recent_logs(max_lines))
}

#[tauri::command]
pub fn clear_app_logs() -> Result<(), String> {
    crate::modules::logger::clear_app_logs()
}

#[tauri::command]
pub fn export_app_logs() -> Result<String, String> {
    crate::modules::logger::export_app_logs()
}

#[tauri::command]
pub async fn check_for_updates() -> Result<crate::modules::updater::UpdateInfo, String> {
    crate::modules::updater::check_for_app_updates().await
}
