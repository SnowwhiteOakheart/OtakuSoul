//! Cognitive soul memory: psychology, relationship, diary, reflection and snapshots.

use crate::modules::inference::ChatRequest;
use crate::state::AppState;
use tauri::State;

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
        .replace("{user_name}", user_name)
        .replace(
            "{language}",
            &crate::modules::content_lang::ContentLang::reply_language_name(),
        );

    let diary_user = format!(
        "Latest conversation with {}:\n{}\n\nYour current emotion: {} (intensity: {}/5)",
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
