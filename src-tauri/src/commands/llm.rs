//! Hardware, llama-server, cloud model lists, LLM presets and the GGUF model hub.

use crate::modules::hardware::{
    HardwareInfo, LayerRecommendation, probe_hardware, recommend_gpu_layers,
};
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
pub fn load_character_card(
    file_path: String,
) -> Result<crate::modules::characters::CharacterProfile, String> {
    crate::modules::characters::load_character_from_file(std::path::Path::new(&file_path))
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

use crate::modules::runtimes::{RuntimeInfo, RuntimeKind, RuntimeVariant};

#[tauri::command]
pub fn get_runtime(kind: RuntimeKind) -> Option<RuntimeInfo> {
    crate::modules::runtimes::installed(kind)
}

#[tauri::command]
pub async fn list_runtime_variants(kind: RuntimeKind) -> Result<Vec<RuntimeVariant>, String> {
    crate::modules::runtimes::list_variants(kind).await
}

#[tauri::command]
pub async fn install_runtime(
    app: tauri::AppHandle,
    kind: RuntimeKind,
    backend: String,
) -> Result<RuntimeInfo, String> {
    crate::modules::runtimes::install(&app, kind, &backend).await
}
