use crate::modules::hardware::{probe_hardware, recommend_gpu_layers, HardwareInfo, LayerRecommendation};
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
) -> LayerRecommendation {
    recommend_gpu_layers(model_size_mb, total_layers, context_size)
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
pub fn load_character_card(file_path: String) -> Result<crate::modules::characters::CharacterProfile, String> {
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
                lorebook.name.trim().to_lowercase().replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "_")
            };
            std::path::PathBuf::from(&paths.lorebooks_dir).join(format!("{}.json", slug))
        }
    } else {
        let slug = if !lorebook.id.trim().is_empty() {
            lorebook.id.clone()
        } else {
            lorebook.name.trim().to_lowercase().replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "_")
        };
        std::path::PathBuf::from(&paths.lorebooks_dir).join(format!("{}.json", slug))
    };

    lorebook.file_path = Some(target_path.to_string_lossy().to_string());
    if lorebook.id.is_empty() {
        lorebook.id = target_path.file_stem().and_then(|s| s.to_str()).unwrap_or("lorebook").to_string();
    }

    lorebook.save_to_file(&target_path)?;
    Ok(target_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn delete_lorebook(file_path: String) -> Result<(), String> {
    let p = std::path::Path::new(&file_path);
    if p.exists() {
        std::fs::remove_file(p).map_err(|e| format!("Fehler beim Löschen des Lorebooks: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn import_lorebook_file(source_path: String) -> Result<crate::modules::lorebook::Lorebook, String> {
    let p = std::path::Path::new(&source_path);
    let mut book = crate::modules::lorebook::Lorebook::load_from_file(p)?;
    let paths = crate::modules::paths::resolve_app_paths();

    let slug = p.file_stem().and_then(|s| s.to_str()).unwrap_or("imported_lorebook");
    let target = std::path::PathBuf::from(&paths.lorebooks_dir).join(format!("{}.json", slug));
    book.file_path = Some(target.to_string_lossy().to_string());
    book.id = slug.to_string();
    let _ = book.save_to_file(&target);
    Ok(book)
}

#[tauri::command]
pub fn export_lorebook_file(lorebook: crate::modules::lorebook::Lorebook, target_path: String) -> Result<(), String> {
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
    Ok(crate::modules::lorebook::evaluate_lorebooks(&lorebooks, &context, current_tension))
}

#[tauri::command]
pub fn assemble_prompt(context: crate::modules::prompt_builder::PromptContext) -> String {
    crate::modules::prompt_builder::build_system_prompt(&context)
}

#[tauri::command]
pub fn read_file_binary(file_path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&file_path).map_err(|e| format!("Fehler beim Lesen der Datei {:?}: {}", file_path, e))
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
    let psych = state.memory_db.get_or_create_psychology(char_id).map_err(|e| e.to_string())?;

    let messages = if let Some(cid) = &req.chat_id {
        state.memory_db.get_chat_messages(cid).unwrap_or_default()
    } else {
        let sessions = state.memory_db.list_chat_sessions(char_id).unwrap_or_default();
        if let Some(first) = sessions.first() {
            state.memory_db.get_chat_messages(&first.id).unwrap_or_default()
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
            crate::modules::inference::ChatMessage { role: "system".to_string(), content: diary_sys },
            crate::modules::inference::ChatMessage { role: "user".to_string(), content: diary_user },
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
        return Err("LLM hat leeren Tagebucheintrag generiert.".to_string());
    }

    let id = state.memory_db.add_diary_entry(
        char_id,
        "Innere Reflexion",
        diary_text,
        &psych.primary_emotion,
    ).map_err(|e| e.to_string())?;

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
    state
        .memory_db
        .import_sow_memory_folder(&char_id, std::path::Path::new(&folder_path), &user_name)
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
    state
        .memory_db
        .list_memory_backups(&char_id, None)
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
pub fn get_stage_state(
    state: State<'_, AppState>,
) -> crate::modules::stage::SceneState {
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
pub fn delete_stage_scene(
    scene_id: String,
) -> Result<(), String> {
    crate::modules::stage::delete_scene(&scene_id)
}

#[tauri::command]
pub fn export_stage_markdown(
    scene_id: String,
) -> Result<String, String> {
    crate::modules::stage::export_scene_to_markdown(&scene_id)
}

#[tauri::command]
pub async fn run_stage_turn(
    state: State<'_, AppState>,
    request: crate::modules::stage::StageTurnRequest,
) -> Result<crate::modules::stage::SceneState, String> {
    crate::modules::stage::execute_stage_turn(&state.stage_engine, &state.inference_client, request).await
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
    crate::modules::stage::execute_stage_rest(&state.stage_engine, &state.inference_client, &scene_id, &rest_type).await
}

#[tauri::command]
pub fn update_world_state(
    state: State<'_, AppState>,
    world: crate::modules::stage::WorldState,
) -> Result<(), String> {
    state.stage_engine.update_world(world);
    Ok(())
}

#[tauri::command]
pub fn set_clock_progress(
    state: State<'_, AppState>,
    clock_id: String,
    progress: u32,
) -> Result<(), String> {
    state.stage_engine.set_clock_progress(&clock_id, progress);
    Ok(())
}

#[tauri::command]
pub fn add_clock(
    state: State<'_, AppState>,
    clock: crate::modules::stage::CampaignClock,
) -> Result<(), String> {
    state.stage_engine.add_clock(clock);
    Ok(())
}

#[tauri::command]
pub fn delete_clock(
    state: State<'_, AppState>,
    clock_id: String,
) -> Result<(), String> {
    state.stage_engine.delete_clock(&clock_id);
    Ok(())
}

#[tauri::command]
pub fn start_encounter(
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.stage_engine.start_encounter();
    Ok(())
}

#[tauri::command]
pub fn end_encounter(
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.stage_engine.end_encounter();
    Ok(())
}

#[tauri::command]
pub fn next_encounter_turn(
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.stage_engine.next_turn();
    Ok(())
}

#[tauri::command]
pub fn apply_combatant_delta(
    state: State<'_, AppState>,
    combatant_id: String,
    hp_delta: i32,
    stress_delta: i32,
) -> Result<(), String> {
    state.stage_engine.apply_combatant_delta(&combatant_id, hp_delta, stress_delta);
    Ok(())
}

#[tauri::command]
pub fn add_combatant_condition(
    state: State<'_, AppState>,
    combatant_id: String,
    condition: crate::modules::stage::CombatCondition,
) -> Result<(), String> {
    state.stage_engine.add_condition(&combatant_id, condition);
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
    Ok(state.companion_engine.apply_hormone_interaction(&interaction_type))
}

#[tauri::command]
pub fn set_hormones(
    state: State<'_, AppState>,
    dopamine: f32,
    cortisol: f32,
    oxytocin: f32,
    fatigue: f32,
) -> Result<crate::modules::companion::Neurohormones, String> {
    Ok(state.companion_engine.set_hormone_values(dopamine, cortisol, oxytocin, fatigue))
}

#[tauri::command]
pub fn request_tool_call(
    state: State<'_, AppState>,
    tool_name: String,
    arguments: serde_json::Value,
) -> Result<crate::modules::companion::ToolCallRequest, String> {
    state.companion_engine.request_tool_call(&tool_name, arguments)
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

// --- Technical Debt & Phase 8: Data Foundation, Settings & Character Library Commands ---

#[tauri::command]
pub fn get_app_paths() -> crate::modules::paths::AppPaths {
    crate::modules::paths::resolve_app_paths()
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
    crate::modules::settings::save_app_settings(&settings)
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
pub fn delete_chat_session(
    state: State<'_, AppState>,
    chat_id: String,
) -> Result<(), String> {
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
pub fn delete_chat_message(
    state: State<'_, AppState>,
    msg_id: String,
) -> Result<(), String> {
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
    crate::modules::voice::list_available_voices(
        &engine,
        &elevenlabs_api_key,
        &kokoro_voices_path,
    )
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
pub fn import_live2d_model(source_path: String) -> Result<crate::modules::live2d::ScannedLive2d, String> {
    crate::modules::live2d::import_live2d_model(&source_path)
}

#[tauri::command]
pub fn import_sow_live2d_models() -> Result<usize, String> {
    crate::modules::live2d::import_sow_live2d_models()
}


