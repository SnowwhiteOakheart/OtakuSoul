//! Translates single chat messages with the chat model itself (local or cloud), so no text
//! goes to a separate translation service and the roleplay formatting survives.

use crate::modules::inference::{ChatMessage, ChatRequest, InferenceClient, SamplingParams};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TranslateRequest {
    pub text: String,
    /// Language name as written into the prompt, e.g. "Deutsch".
    pub target_language: String,
    pub endpoint_url: String,
    pub api_key: Option<String>,
    pub model: Option<String>,
    pub provider: Option<crate::modules::providers::LlmProviderType>,
}

fn instructions(target: &str) -> String {
    format!(
        "You are a translator for roleplay chat messages. Translate the user's text into {target}. \
         Keep the formatting exactly: actions in *asterisks*, speech in quotation marks, line breaks, \
         emojis and names. Translate faithfully, without commenting, summarizing or continuing the \
         story. If the text is already in {target}, return it unchanged. Reply with the translation only."
    )
}

/// Models sometimes wrap the result in quotes or a "Translation:" label; drop that.
fn clean(text: &str) -> String {
    let text = text.trim();
    let text = ["Translation:", "Übersetzung:", "Перевод:"]
        .iter()
        .find_map(|label| text.strip_prefix(label))
        .unwrap_or(text)
        .trim();
    text.to_string()
}

pub async fn translate(client: &InferenceClient, req: TranslateRequest) -> Result<String, String> {
    if req.text.trim().is_empty() {
        return Ok(String::new());
    }
    // Room for languages that need more tokens than the source (e.g. Russian).
    let max_tokens = ((req.text.len() / 2) as u32).clamp(256, 4096);
    let request = ChatRequest {
        endpoint_url: req.endpoint_url,
        api_key: req.api_key,
        model: req.model,
        messages: vec![
            ChatMessage {
                role: "system".into(),
                content: instructions(&req.target_language),
                attachments: Vec::new(),
            },
            ChatMessage {
                role: "user".into(),
                content: req.text,
                attachments: Vec::new(),
            },
        ],
        sampling: Some(SamplingParams {
            temperature: Some(0.2),
            max_tokens: Some(max_tokens),
            ..SamplingParams::default()
        }),
        reasoning_mode: Some(false),
        provider: req.provider,
    };
    let translated = clean(&client.generate_direct(request).await?);
    if translated.is_empty() {
        return Err(crate::err!("backend.translate.empty"));
    }
    Ok(translated)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_labels_from_the_answer() {
        assert_eq!(
            clean("  Übersetzung: *lächelt* \"Hallo!\"  "),
            "*lächelt* \"Hallo!\""
        );
        assert_eq!(clean("*smiles* \"Hi!\""), "*smiles* \"Hi!\"");
    }
}
