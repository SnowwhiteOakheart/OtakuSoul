use crate::modules::inference::{ChatMessage, ChatRequest, SamplingParams};
use crate::modules::providers::LlmProviderType;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tracing::info;
use ts_rs::TS;

use super::json::extract_json_object;
use super::prompts::CLEANUP_SYSTEM_PROMPT;

/// What a memory cleanup needs: whose memory and which model.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MemoryCleanupRequest {
    pub character_id: String,
    pub endpoint_url: String,
    pub api_key: Option<String>,
    pub model: Option<String>,
    pub provider: Option<LlmProviderType>,
}

#[derive(Deserialize)]
struct CleanupAnswer {
    #[serde(default)]
    groups: Vec<crate::modules::memory::CleanupGroup>,
}

/// Asks the model which memories belong together. Nothing is written: the user confirms the
/// proposal first (`apply_memory_cleanup`).
pub async fn propose_memory_cleanup(
    state: &AppState,
    req: MemoryCleanupRequest,
) -> Result<crate::modules::memory::CleanupProposal, String> {
    let candidates = state
        .memory_db
        .cleanup_candidates(&req.character_id, crate::modules::memory::CLEANUP_TOKENS)
        .map_err(|e| e.to_string())?;
    if candidates.len() < 2 {
        return Ok(Default::default());
    }
    let listing: String = candidates
        .iter()
        .map(|m| format!("#{} [{}] {}\n", m.id, m.category, m.content.trim()))
        .collect();
    let language = crate::modules::content_lang::ContentLang::reply_language_name();
    let request = ChatRequest {
        endpoint_url: req.endpoint_url,
        api_key: req.api_key,
        model: req.model,
        messages: vec![
            ChatMessage {
                role: "system".to_string(),
                content: CLEANUP_SYSTEM_PROMPT
                    .replace(
                        "{character}",
                        crate::modules::memory::base_character_id(&req.character_id),
                    )
                    .replace("{language}", &language),
                attachments: Vec::new(),
            },
            ChatMessage {
                role: "user".to_string(),
                content: format!("=== MEMORIES ===\n{listing}"),
                attachments: Vec::new(),
            },
        ],
        sampling: Some(SamplingParams {
            temperature: Some(0.2),
            max_tokens: Some(2500),
            ..Default::default()
        }),
        reasoning_mode: Some(false),
        provider: req.provider,
    };
    info!(
        "[SoulMemory] Aufräumen für {}: {} Erinnerungen prüfen...",
        req.character_id,
        candidates.len()
    );
    let raw = state.inference_client.generate_direct(request).await?;
    let json =
        extract_json_object(&raw).ok_or_else(|| crate::err!("backend.memory.cleanupNoJson"))?;
    let answer: CleanupAnswer = serde_json::from_str(&json)
        .map_err(|e| crate::err!("backend.memory.cleanupBadJson", error = e))?;
    let known: Vec<i64> = candidates.iter().map(|m| m.id).collect();
    let groups = crate::modules::memory::valid_cleanup_groups(answer.groups, &known);
    let sources = candidates
        .into_iter()
        .filter(|m| groups.iter().any(|g| g.memory_ids.contains(&m.id)))
        .collect();
    Ok(crate::modules::memory::CleanupProposal { groups, sources })
}
