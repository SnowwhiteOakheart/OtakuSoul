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


