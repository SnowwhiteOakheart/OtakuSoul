//! Hardware, llama-server, cloud model lists, LLM presets and the GGUF model hub.

use crate::modules::hardware::{
    HardwareInfo, LayerRecommendation, probe_hardware, recommend_gpu_layers,
};
use crate::modules::llama_manager::{LlamaServerConfig, ServerStatus};
use crate::state::AppState;
use tauri::State;

/// Spawns `nvidia-smi` and probes Vulkan: off the main thread, so it doesn't stall the window
/// and every other synchronous command (Tauri runs those on the main thread).
#[tauri::command]
pub async fn get_hardware_info() -> Result<HardwareInfo, String> {
    tokio::task::spawn_blocking(probe_hardware)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_layer_recommendation(
    model_size_mb: u64,
    total_layers: u32,
    context_size: u32,
    model_path: Option<String>,
    cache_type_k: Option<String>,
    cache_type_v: Option<String>,
) -> Result<LayerRecommendation, String> {
    // Probes the hardware: off the main thread, like `get_hardware_info`.
    tokio::task::spawn_blocking(move || {
        recommend_gpu_layers(
            model_size_mb,
            total_layers,
            context_size,
            model_path.as_deref(),
            cache_type_k.as_deref(),
            cache_type_v.as_deref(),
        )
    })
    .await
    .map_err(|e| e.to_string())
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
    expected_size: u64,
    expected_sha256: Option<String>,
) -> Result<String, String> {
    crate::modules::models_hub::download_gguf_file(
        &app,
        &download_url,
        &filename,
        expected_size,
        expected_sha256.as_deref(),
    )
    .await
}

#[tauri::command]
pub fn cancel_gguf_download(filename: String) {
    crate::modules::models_hub::cancel_gguf_download(&filename);
}

use crate::modules::runtimes::{RuntimeInfo, RuntimeKind, RuntimeVariant};

#[tauri::command]
pub fn get_runtime(kind: RuntimeKind) -> Option<RuntimeInfo> {
    crate::modules::runtimes::installed(kind)
}

/// The build kept from before the last update, if any.
#[tauri::command]
pub fn get_previous_runtime(kind: RuntimeKind) -> Option<RuntimeInfo> {
    crate::modules::runtimes::previous(kind)
}

/// Switches back to the previous build (used from the next server start).
#[tauri::command]
pub fn rollback_runtime(kind: RuntimeKind) -> Result<RuntimeInfo, String> {
    crate::modules::runtimes::rollback(kind)
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

/// A short answer without a chat (setup wizard: connection test, first reply). Bounded, so a
/// wrong endpoint doesn't leave the wizard waiting.
#[tauri::command]
pub async fn quick_reply(
    state: State<'_, AppState>,
    request: crate::modules::inference::QuickReplyRequest,
) -> Result<String, String> {
    use crate::modules::inference::{ChatMessage, ChatRequest, SamplingParams};
    let message = |role: &str, content: String| ChatMessage {
        role: role.to_string(),
        content,
        attachments: Vec::new(),
    };
    let chat = ChatRequest {
        endpoint_url: request.endpoint_url,
        api_key: request.api_key,
        model: request.model,
        messages: vec![
            message("system", request.system),
            message("user", request.user),
        ],
        sampling: Some(SamplingParams {
            max_tokens: Some(request.max_tokens),
            ..SamplingParams::default()
        }),
        reasoning_mode: Some(false),
        provider: request.provider,
    };
    match tokio::time::timeout(
        std::time::Duration::from_secs(90),
        state.inference_client.generate_direct(chat),
    )
    .await
    {
        Ok(Ok(text)) if text.trim().is_empty() => Err(crate::err!("backend.llm.emptyReply")),
        Ok(result) => result,
        Err(_) => Err(crate::err!("backend.llm.timeout", seconds = 90)),
    }
}

/// Chat models for getting started, with the recommendation for this GPU.
#[tauri::command]
pub async fn list_starter_models() -> Vec<crate::modules::models_hub::StarterModel> {
    tokio::task::spawn_blocking(crate::modules::models_hub::starter_models)
        .await
        .unwrap_or_default()
}
