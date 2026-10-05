//! Chat inference, prompt assembly, sessions, messages and swipes.

use crate::modules::inference::{ChatRequest, DoneEvent};
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn send_chat_message(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    mut request: ChatRequest,
    context_tokens: Option<u32>,
    generation_id: String,
) -> Result<DoneEvent, String> {
    use crate::modules::context_window::server_base;
    use crate::modules::providers::{LlmProviderType, ProviderRegistry};

    let _generation = state
        .chat_generation
        .try_lock()
        .map_err(|_| crate::err!("backend.chat.generationBusy"))?;
    state.inference_client.reset_abort();
    let aborted = |generation_id: String| DoneEvent {
        generation_id,
        full_text: String::new(),
        full_thought: String::new(),
        context: None,
        aborted: true,
    };
    // Preparation stops at once on abort. Streaming is not wrapped here: it ends on abort by
    // itself and returns the text so far, which the chat keeps (and can continue).
    let prepared = state
        .inference_client
        .with_abort(async {
            // A local llama-server reports its own context size and counts exactly; cloud models use
            // `context_tokens` from the settings.
            let local =
                ProviderRegistry::detect_provider(&request.endpoint_url, request.provider.as_ref())
                    == LlmProviderType::LocalLlama;
            // A local model sees images only with a vision projector; cloud models are trusted to.
            let vision = !local
                || state
                    .llama_manager
                    .running_config()
                    .await
                    .and_then(|c| c.mmproj_path)
                    .is_some_and(|p| !p.trim().is_empty());
            crate::modules::attachments::prepare(&mut request.messages, vision);
            let base = local.then(|| server_base(&request.endpoint_url));
            let max_reply = request.sampling.as_ref().and_then(|s| s.max_tokens);
            let (messages, usage) = state
                .token_counter
                .fit(
                    std::mem::take(&mut request.messages),
                    base.as_deref(),
                    context_tokens,
                    max_reply,
                )
                .await;
            request.messages = messages;
            *state.last_prompt.lock() = Some(crate::modules::prompt_log::PromptLog::of(
                &request,
                usage.clone(),
            ));
            (request, usage)
        })
        .await;
    let Some((request, usage)) = prepared else {
        return Ok(aborted(generation_id));
    };
    if state.inference_client.is_aborted() {
        return Ok(aborted(generation_id));
    }
    let mut done = state
        .inference_client
        .stream_chat(&app, request, &generation_id)
        .await?;
    done.context = usage;
    Ok(done)
}

/// What the chat model got last (after lorebooks, template and context trimming), for debugging.
#[tauri::command]
pub fn get_last_prompt(
    state: State<'_, AppState>,
) -> Option<crate::modules::prompt_log::PromptLog> {
    state.last_prompt.lock().clone()
}

#[tauri::command]
pub fn abort_chat_generation(state: State<'_, AppState>) -> Result<(), String> {
    state.inference_client.abort();
    Ok(())
}

#[tauri::command]
pub fn assemble_prompt(
    context: crate::modules::prompt_builder::PromptContext,
) -> crate::modules::prompt_builder::AssembledPrompt {
    crate::modules::prompt_builder::assemble(&context)
}

#[tauri::command]
pub fn list_prompt_templates() -> Vec<crate::modules::prompt_builder::BuiltinPromptTemplate> {
    crate::modules::prompt_builder::builtin_prompt_templates()
}

#[tauri::command]
pub fn create_chat_session(
    state: State<'_, AppState>,
    character_id: String,
    title: String,
    greeting: Option<String>,
) -> Result<crate::modules::memory::ChatSession, String> {
    state
        .memory_db
        .create_chat_session_with_greeting(&character_id, &title, greeting.as_deref())
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
pub async fn summarize_chat(
    state: State<'_, AppState>,
    request: crate::modules::chat_summary::ChatSummaryRequest,
) -> Result<crate::modules::memory::ChatSession, String> {
    crate::modules::chat_summary::summarize(&state.memory_db, &state.inference_client, request)
        .await
}

/// Translates one chat message with the chat model.
#[tauri::command]
pub async fn translate_message(
    state: State<'_, AppState>,
    request: crate::modules::translate::TranslateRequest,
) -> Result<String, String> {
    crate::modules::translate::translate(&state.inference_client, request).await
}

#[tauri::command]
pub fn update_chat_summary(
    state: State<'_, AppState>,
    chat_id: String,
    summary: String,
    summary_until: i64,
) -> Result<(), String> {
    state
        .memory_db
        .update_chat_summary(&chat_id, &summary, summary_until)
        .map_err(|e| e.to_string())
}

/// Stores a file the user attaches to their next message (`data` is base64).
#[tauri::command]
pub async fn save_attachment(
    chat_id: String,
    name: String,
    data: String,
) -> Result<crate::modules::attachments::Attachment, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data.trim())
        .map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || crate::modules::attachments::save(&chat_id, &name, &bytes))
        .await
        .map_err(|e| e.to_string())?
}

/// An image attachment as `data:` URL, for showing it in the chat.
#[tauri::command]
pub fn get_attachment_data_url(
    attachment: crate::modules::attachments::Attachment,
) -> Option<String> {
    crate::modules::attachments::data_url(&attachment)
}

/// „Ab hier als neuen Chat fortsetzen“: the history up to `message_id` in a new chat.
#[tauri::command]
pub fn branch_chat(
    state: State<'_, AppState>,
    chat_id: String,
    message_id: String,
    title: String,
) -> Result<crate::modules::memory::ChatSession, String> {
    state
        .memory_db
        .branch_chat(&chat_id, &message_id, &title)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_chat_bookmarks(
    state: State<'_, AppState>,
    chat_id: String,
) -> Result<Vec<String>, String> {
    state
        .memory_db
        .list_chat_bookmarks(&chat_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_chat_bookmark(
    state: State<'_, AppState>,
    chat_id: String,
    message_id: String,
    bookmarked: bool,
) -> Result<(), String> {
    state
        .memory_db
        .set_chat_bookmark(&chat_id, &message_id, bookmarked)
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
    attachments: Option<Vec<crate::modules::attachments::Attachment>>,
) -> Result<crate::modules::memory::StoredChatMessage, String> {
    state
        .memory_db
        .add_chat_message(
            &chat_id,
            &role,
            &content,
            thought.as_deref(),
            attachments.as_deref().unwrap_or_default(),
        )
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
