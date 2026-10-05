//! Character cards, personas and the AI character assistant.

use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn load_lorebook(file_path: String) -> Result<crate::modules::lorebook::Lorebook, String> {
    crate::modules::lorebook::Lorebook::load_from_file(std::path::Path::new(&file_path))
}

/// Reads every card (PNG decoding, avatar data URLs) off the main thread.
#[tauri::command]
pub async fn scan_characters() -> Vec<crate::modules::characters::CharacterProfile> {
    tokio::task::spawn_blocking(crate::modules::paths::scan_available_characters)
        .await
        .unwrap_or_default()
}

#[tauri::command]
pub fn save_character_card(
    profile: crate::modules::characters::CharacterProfile,
) -> Result<crate::modules::characters::CharacterProfile, String> {
    crate::modules::characters::save_character_to_user_dir(&profile)
}

/// Imports a card file; asks via `backend.characters.exists` before replacing a character.
#[tauri::command]
pub fn import_character_file(
    file_path: String,
    overwrite: Option<bool>,
) -> Result<crate::modules::hub::CharacterImportResult, String> {
    crate::modules::characters::import_character_file(
        std::path::Path::new(&file_path),
        overwrite.unwrap_or(false),
    )
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
                content: "You are an experienced roleplay and AI character author. You create consistent, psychologically layered character profiles in the SillyTavern V2 format. Reply ONLY in the requested JSON format.".to_string(),
                attachments: Vec::new(),
            },
            crate::modules::inference::ChatMessage {
                role: "user".to_string(),
                content: prompt,
                attachments: Vec::new(),
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
