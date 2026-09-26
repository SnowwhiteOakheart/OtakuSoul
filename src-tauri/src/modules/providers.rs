use crate::modules::inference::ChatRequest;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LlmProviderType {
    LocalLlama,
    OpenRouter,
    Anthropic,
    OpenAi,
    DeepSeek,
    Gemini,
    Mistral,
    Custom,
}

impl Default for LlmProviderType {
    fn default() -> Self {
        LlmProviderType::LocalLlama
    }
}

impl LlmProviderType {
    pub fn default_endpoint(&self, local_port: u16) -> String {
        match self {
            LlmProviderType::LocalLlama => {
                format!("http://127.0.0.1:{}/v1/chat/completions", local_port)
            }
            LlmProviderType::OpenRouter => {
                "https://openrouter.ai/api/v1/chat/completions".to_string()
            }
            LlmProviderType::Anthropic => "https://api.anthropic.com/v1/messages".to_string(),
            LlmProviderType::OpenAi => "https://api.openai.com/v1/chat/completions".to_string(),
            LlmProviderType::DeepSeek => "https://api.deepseek.com/chat/completions".to_string(),
            LlmProviderType::Gemini => {
                "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions".to_string()
            }
            LlmProviderType::Mistral => "https://api.mistral.ai/v1/chat/completions".to_string(),
            LlmProviderType::Custom => "".to_string(),
        }
    }

    pub fn default_model(&self) -> &'static str {
        match self {
            LlmProviderType::LocalLlama => "local",
            LlmProviderType::OpenRouter => "anthropic/claude-3.5-sonnet",
            LlmProviderType::Anthropic => "claude-3-5-sonnet-20241022",
            LlmProviderType::OpenAi => "gpt-4o",
            LlmProviderType::DeepSeek => "deepseek-chat",
            LlmProviderType::Gemini => "gemini-1.5-pro-latest",
            LlmProviderType::Mistral => "mistral-large-latest",
            LlmProviderType::Custom => "default",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenRouterModelInfo {
    pub id: String,
    pub name: String,
    pub context_length: Option<u64>,
    pub prompt_pricing: Option<String>,
    pub completion_pricing: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct ParsedDelta {
    pub text: Option<String>,
    pub thought: Option<String>,
    pub is_done: bool,
}

pub struct ProviderRegistry;

impl ProviderRegistry {
    /// Detects provider from URL or explicitly configured provider type
    pub fn detect_provider(url: &str, provider_type: Option<&LlmProviderType>) -> LlmProviderType {
        if let Some(pt) = provider_type {
            return pt.clone();
        }

        let lower = url.to_lowercase();
        if lower.contains("anthropic.com") {
            LlmProviderType::Anthropic
        } else if lower.contains("openrouter.ai") {
            LlmProviderType::OpenRouter
        } else if lower.contains("deepseek.com") {
            LlmProviderType::DeepSeek
        } else if lower.contains("googleapis.com") {
            LlmProviderType::Gemini
        } else if lower.contains("openai.com") {
            LlmProviderType::OpenAi
        } else if lower.contains("mistral.ai") {
            LlmProviderType::Mistral
        } else if lower.contains("127.0.0.1") || lower.contains("localhost") {
            LlmProviderType::LocalLlama
        } else {
            LlmProviderType::Custom
        }
    }

    /// Formats request headers and JSON payload for the target provider
    pub fn build_http_request(
        client: &reqwest::Client,
        request: &ChatRequest,
    ) -> Result<reqwest::RequestBuilder, String> {
        let provider = Self::detect_provider(&request.endpoint_url, request.provider.as_ref());

        match provider {
            LlmProviderType::Anthropic => Self::build_anthropic_request(client, request),
            _ => Self::build_openai_compatible_request(client, request, &provider),
        }
    }

    /// Parses SSE delta according to provider format
    pub fn parse_sse_line(line: &str, provider: &LlmProviderType) -> ParsedDelta {
        match provider {
            LlmProviderType::Anthropic => Self::parse_anthropic_sse(line),
            _ => Self::parse_openai_sse(line),
        }
    }

    fn build_anthropic_request(
        client: &reqwest::Client,
        request: &ChatRequest,
    ) -> Result<reqwest::RequestBuilder, String> {
        let mut req_builder = client
            .post(&request.endpoint_url)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json");

        if let Some(key) = &request.api_key {
            if !key.is_empty() {
                req_builder = req_builder.header("x-api-key", key);
            }
        }

        // Separate system messages from conversation history
        let mut system_parts = Vec::new();
        let mut conversation: Vec<serde_json::Value> = Vec::new();

        for msg in &request.messages {
            if msg.role == "system" {
                system_parts.push(msg.content.clone());
            } else {
                let role = if msg.role == "user" { "user" } else { "assistant" };
                // Anthropic does not allow empty content blocks
                let text = if msg.content.trim().is_empty() {
                    "..."
                } else {
                    &msg.content
                };
                conversation.push(serde_json::json!({
                    "role": role,
                    "content": text
                }));
            }
        }

        // Anthropic requires alternating user/assistant turns starting with user
        let mut normalized_messages: Vec<serde_json::Value> = Vec::new();
        for msg in conversation {
            let role = msg.get("role").and_then(|r| r.as_str()).unwrap_or("user");
            let content = msg.get("content").and_then(|c| c.as_str()).unwrap_or("");

            if let Some(last) = normalized_messages.last_mut() {
                let last_role = last.get("role").and_then(|r| r.as_str()).unwrap_or("");
                if last_role == role {
                    // Merge consecutive turns of same role
                    let last_content = last.get("content").and_then(|c| c.as_str()).unwrap_or("");
                    let merged = format!("{}\n\n{}", last_content, content);
                    last["content"] = serde_json::Value::String(merged);
                    continue;
                }
            }
            normalized_messages.push(serde_json::json!({
                "role": role,
                "content": content
            }));
        }

        // Ensure first message is user
        if let Some(first) = normalized_messages.first() {
            if first.get("role").and_then(|r| r.as_str()) != Some("user") {
                normalized_messages.insert(
                    0,
                    serde_json::json!({
                        "role": "user",
                        "content": "Hallo."
                    }),
                );
            }
        } else {
            normalized_messages.push(serde_json::json!({
                "role": "user",
                "content": "Hallo."
            }));
        }

        let sampling = request.sampling.clone().unwrap_or_default();
        let model = request
            .model
            .clone()
            .unwrap_or_else(|| LlmProviderType::Anthropic.default_model().to_string());

        let mut body = serde_json::json!({
            "model": model,
            "messages": normalized_messages,
            "max_tokens": sampling.max_tokens.unwrap_or(2048),
            "stream": true,
            "temperature": sampling.temperature.unwrap_or(0.7),
        });

        if let Some(top_p) = sampling.top_p {
            body["top_p"] = serde_json::json!(top_p);
        }

        if !system_parts.is_empty() {
            body["system"] = serde_json::json!(system_parts.join("\n\n"));
        }

        if !sampling.stop_strings.is_empty() {
            body["stop_sequences"] = serde_json::json!(sampling.stop_strings);
        }

        Ok(req_builder.json(&body))
    }

    fn build_openai_compatible_request(
        client: &reqwest::Client,
        request: &ChatRequest,
        provider: &LlmProviderType,
    ) -> Result<reqwest::RequestBuilder, String> {
        let mut req_builder = client
            .post(&request.endpoint_url)
            .header("content-type", "application/json");

        if let Some(key) = &request.api_key {
            if !key.is_empty() {
                req_builder = req_builder.header("Authorization", format!("Bearer {}", key));
            }
        }

        if *provider == LlmProviderType::OpenRouter {
            req_builder = req_builder
                .header("HTTP-Referer", "https://github.com/SnowwhiteOakheart/OtakuSoul")
                .header("X-Title", "OtakuSoul AI Platform");
        }

        let sampling = request.sampling.clone().unwrap_or_default();
        let default_model = provider.default_model().to_string();
        let model = request.model.clone().unwrap_or(default_model);

        let mut body = serde_json::json!({
            "model": model,
            "messages": request.messages,
            "stream": true,
            "temperature": sampling.temperature.unwrap_or(0.7),
            "max_tokens": sampling.max_tokens.unwrap_or(2048),
        });

        if let Some(top_p) = sampling.top_p {
            body["top_p"] = serde_json::json!(top_p);
        }
        if let Some(min_p) = sampling.min_p {
            body["min_p"] = serde_json::json!(min_p);
        }
        if let Some(top_k) = sampling.top_k {
            body["top_k"] = serde_json::json!(top_k);
        }
        if let Some(fp) = sampling.frequency_penalty {
            body["frequency_penalty"] = serde_json::json!(fp);
        }
        if let Some(pp) = sampling.presence_penalty {
            body["presence_penalty"] = serde_json::json!(pp);
        }
        if let Some(rp) = sampling.repeat_penalty {
            body["repeat_penalty"] = serde_json::json!(rp);
        }

        // llama.cpp & OpenRouter advanced extensions (DRY, XTC, Dynatemp)
        if let Some(d_range) = sampling.dynatemp_range {
            body["dynatemp_range"] = serde_json::json!(d_range);
        }
        if let Some(d_exp) = sampling.dynatemp_exponent {
            body["dynatemp_exponent"] = serde_json::json!(d_exp);
        }

        if let Some(dry_m) = sampling.dry_multiplier {
            body["dry_multiplier"] = serde_json::json!(dry_m);
        }
        if let Some(dry_b) = sampling.dry_base {
            body["dry_base"] = serde_json::json!(dry_b);
        }
        if let Some(dry_l) = sampling.dry_allowed_length {
            body["dry_allowed_length"] = serde_json::json!(dry_l);
        }
        if let Some(dry_n) = sampling.dry_penalty_last_n {
            body["dry_penalty_last_n"] = serde_json::json!(dry_n);
        }

        if let Some(xtc_t) = sampling.xtc_threshold {
            body["xtc_threshold"] = serde_json::json!(xtc_t);
        }
        if let Some(xtc_p) = sampling.xtc_probability {
            body["xtc_probability"] = serde_json::json!(xtc_p);
        }

        if !sampling.stop_strings.is_empty() {
            body["stop"] = serde_json::json!(sampling.stop_strings);
        }

        // Suppress reasoning if disabled for roleplay
        if !request.reasoning_mode.unwrap_or(false) {
            body["chat_template_kwargs"] = serde_json::json!({
                "enable_thinking": false
            });
            body["extra_body"] = serde_json::json!({
                "thinking": { "type": "disabled" },
                "thinking_budget_tokens": 0
            });
        }

        Ok(req_builder.json(&body))
    }

    fn parse_anthropic_sse(line: &str) -> ParsedDelta {
        let trimmed = line.trim();
        if !trimmed.starts_with("data:") {
            return ParsedDelta::default();
        }

        let json_str = trimmed["data:".len()..].trim();
        if json_str.is_empty() || json_str == "[DONE]" {
            return ParsedDelta {
                text: None,
                thought: None,
                is_done: json_str == "[DONE]",
            };
        }

        if let Ok(v) = serde_json::from_str::<serde_json::Value>(json_str) {
            let event_type = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
            if event_type == "content_block_delta" {
                if let Some(delta) = v.get("delta") {
                    let delta_type = delta.get("type").and_then(|t| t.as_str()).unwrap_or("");
                    if delta_type == "text_delta" {
                        if let Some(t) = delta.get("text").and_then(|s| s.as_str()) {
                            return ParsedDelta {
                                text: Some(t.to_string()),
                                thought: None,
                                is_done: false,
                            };
                        }
                    } else if delta_type == "thinking_delta" {
                        if let Some(th) = delta.get("thinking").and_then(|s| s.as_str()) {
                            return ParsedDelta {
                                text: None,
                                thought: Some(th.to_string()),
                                is_done: false,
                            };
                        }
                    }
                }
            } else if event_type == "message_stop" {
                return ParsedDelta {
                    text: None,
                    thought: None,
                    is_done: true,
                };
            }
        }

        ParsedDelta::default()
    }

    fn parse_openai_sse(line: &str) -> ParsedDelta {
        let trimmed = line.trim();
        if !trimmed.starts_with("data:") {
            return ParsedDelta::default();
        }

        let json_str = trimmed["data:".len()..].trim();
        if json_str == "[DONE]" {
            return ParsedDelta {
                text: None,
                thought: None,
                is_done: true,
            };
        }

        if let Ok(v) = serde_json::from_str::<serde_json::Value>(json_str) {
            if let Some(choices) = v.get("choices").and_then(|c| c.as_array()) {
                if let Some(first) = choices.first() {
                    let mut delta_res = ParsedDelta::default();
                    if let Some(delta) = first.get("delta") {
                        if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                            delta_res.text = Some(content.to_string());
                        }
                        if let Some(thought) = delta
                            .get("reasoning_content")
                            .or_else(|| delta.get("thought"))
                            .and_then(|th| th.as_str())
                        {
                            delta_res.thought = Some(thought.to_string());
                        }
                    }
                    if let Some(finish) = first.get("finish_reason").and_then(|f| f.as_str()) {
                        if !finish.is_empty() {
                            delta_res.is_done = true;
                        }
                    }
                    return delta_res;
                }
            }
        }

        ParsedDelta::default()
    }
}

/// Fetch list of available models from OpenRouter
pub async fn fetch_openrouter_models(api_key: Option<&str>) -> Result<Vec<OpenRouterModelInfo>, String> {
    let client = reqwest::Client::new();
    let mut req = client.get("https://openrouter.ai/api/v1/models");
    if let Some(key) = api_key {
        if !key.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", key));
        }
    }

    let res = req
        .send()
        .await
        .map_err(|e| format!("Fehler beim Abrufen der OpenRouter-Modelle: {}", e))?;

    if !res.status().is_success() {
        return Err(format!(
            "OpenRouter-Fehler ({}): {}",
            res.status(),
            res.text().await.unwrap_or_default()
        ));
    }

    let val: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("Fehler beim Parsen der OpenRouter-Daten: {}", e))?;

    let mut models = Vec::new();
    if let Some(data) = val.get("data").and_then(|d| d.as_array()) {
        for m in data {
            if let Some(id) = m.get("id").and_then(|s| s.as_str()) {
                let name = m.get("name").and_then(|s| s.as_str()).unwrap_or(id).to_string();
                let context_length = m.get("context_length").and_then(|c| c.as_u64());
                let prompt_pricing = m
                    .pointer("/pricing/prompt")
                    .and_then(|p| p.as_str())
                    .map(|s| s.to_string());
                let completion_pricing = m
                    .pointer("/pricing/completion")
                    .and_then(|p| p.as_str())
                    .map(|s| s.to_string());

                models.push(OpenRouterModelInfo {
                    id: id.to_string(),
                    name,
                    context_length,
                    prompt_pricing,
                    completion_pricing,
                });
            }
        }
    }

    Ok(models)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_provider() {
        assert_eq!(
            ProviderRegistry::detect_provider("https://api.anthropic.com/v1/messages", None),
            LlmProviderType::Anthropic
        );
        assert_eq!(
            ProviderRegistry::detect_provider("https://openrouter.ai/api/v1/chat/completions", None),
            LlmProviderType::OpenRouter
        );
        assert_eq!(
            ProviderRegistry::detect_provider("http://127.0.0.1:48596/v1/chat/completions", None),
            LlmProviderType::LocalLlama
        );
        assert_eq!(
            ProviderRegistry::detect_provider("https://api.deepseek.com/chat/completions", None),
            LlmProviderType::DeepSeek
        );
    }

    #[test]
    fn test_parse_anthropic_sse() {
        let line = r#"data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hallo Hiroki!"}}"#;
        let delta = ProviderRegistry::parse_sse_line(line, &LlmProviderType::Anthropic);
        assert_eq!(delta.text.as_deref(), Some("Hallo Hiroki!"));
        assert_eq!(delta.is_done, false);

        let stop = r#"data: {"type":"message_stop"}"#;
        let delta_stop = ProviderRegistry::parse_sse_line(stop, &LlmProviderType::Anthropic);
        assert_eq!(delta_stop.is_done, true);
    }

    #[test]
    fn test_parse_openai_sse() {
        let line = r#"data: {"choices":[{"delta":{"content":"Guten Morgen","reasoning_content":"Denke nach"}}]}"#;
        let delta = ProviderRegistry::parse_sse_line(line, &LlmProviderType::LocalLlama);
        assert_eq!(delta.text.as_deref(), Some("Guten Morgen"));
        assert_eq!(delta.thought.as_deref(), Some("Denke nach"));
        assert_eq!(delta.is_done, false);
    }
}
