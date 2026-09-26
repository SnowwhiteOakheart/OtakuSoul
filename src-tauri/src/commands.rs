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
pub fn evaluate_lorebook_context(
    lorebook: crate::modules::lorebook::Lorebook,
    context: String,
) -> Vec<crate::modules::lorebook::LorebookEntry> {
    lorebook.scan_and_activate(&context)
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
) -> crate::modules::stage::StageState {
    state.stage_engine.get_state()
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
