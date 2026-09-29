//! Chat inference, prompt assembly, sessions, messages and swipes.

use crate::modules::inference::{ChatRequest, DoneEvent};
use crate::state::AppState;
use tauri::State;

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
pub fn assemble_prompt(context: crate::modules::prompt_builder::PromptContext) -> String {
    crate::modules::prompt_builder::build_system_prompt(&context)
}

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
