//! The last prompt sent to the chat model, for the "show last prompt" view: what the model
//! really got after lorebooks, prompt template, attachments and context trimming. Only in
//! memory; the API key is never kept and attachments appear by name only.

use crate::modules::context_window::ContextUsage;
use crate::modules::inference::ChatRequest;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PromptLogMessage {
    pub role: String,
    pub content: String,
    /// Names of attached files; images are not repeated as data.
    pub attachments: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PromptLog {
    /// Unix seconds.
    pub at: i64,
    pub endpoint_url: String,
    pub model: Option<String>,
    pub messages: Vec<PromptLogMessage>,
    /// Sampler settings as sent (JSON), if any.
    pub sampling: Option<String>,
    pub context: Option<ContextUsage>,
}

impl PromptLog {
    pub fn of(request: &ChatRequest, context: Option<ContextUsage>) -> Self {
        Self {
            at: chrono::Utc::now().timestamp(),
            endpoint_url: request.endpoint_url.clone(),
            model: request.model.clone(),
            messages: request
                .messages
                .iter()
                .map(|message| PromptLogMessage {
                    role: message.role.clone(),
                    content: message.content.clone(),
                    attachments: message.attachments.iter().map(|a| a.name.clone()).collect(),
                })
                .collect(),
            sampling: request
                .sampling
                .as_ref()
                .and_then(|s| serde_json::to_string_pretty(s).ok()),
            context,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::inference::ChatMessage;

    #[test]
    fn keeps_no_api_key_and_names_attachments_only() {
        let request = ChatRequest {
            endpoint_url: "https://example.org/v1/chat/completions".into(),
            api_key: Some("sk-geheim".into()),
            model: Some("m".into()),
            messages: vec![ChatMessage {
                role: "user".into(),
                content: "Hallo".into(),
                attachments: vec![crate::modules::attachments::Attachment {
                    id: "a".into(),
                    kind: "image".into(),
                    name: "bild.png".into(),
                    mime: "image/png".into(),
                    file: "c/a.png".into(),
                    text: None,
                    truncated: false,
                }],
            }],
            sampling: None,
            reasoning_mode: None,
            provider: None,
        };
        let log = PromptLog::of(&request, None);
        let json = serde_json::to_string(&log).unwrap();
        assert!(!json.contains("sk-geheim"));
        assert_eq!(log.messages[0].attachments, vec!["bild.png".to_string()]);
    }
}
