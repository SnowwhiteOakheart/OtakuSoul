use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Emitter;
use tracing::info;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SamplingParams {
    pub temperature: Option<f32>,
    pub top_p: Option<f32>,
    pub min_p: Option<f32>,
    pub top_k: Option<u32>,
    pub frequency_penalty: Option<f32>,
    pub presence_penalty: Option<f32>,
    pub repeat_penalty: Option<f32>,
    pub dynatemp_range: Option<f32>,
    pub dynatemp_exponent: Option<f32>,
    pub dry_multiplier: Option<f32>,
    pub dry_base: Option<f32>,
    pub dry_allowed_length: Option<u32>,
    pub dry_penalty_last_n: Option<i32>,
    pub xtc_threshold: Option<f32>,
    pub xtc_probability: Option<f32>,
    #[serde(default)]
    pub stop_strings: Vec<String>,
    pub max_tokens: Option<u32>,
}

impl Default for SamplingParams {
    fn default() -> Self {
        Self {
            temperature: Some(0.7),
            top_p: Some(0.9),
            min_p: Some(0.05),
            top_k: Some(40),
            frequency_penalty: None,
            presence_penalty: None,
            repeat_penalty: Some(1.05),
            dynatemp_range: None,
            dynatemp_exponent: None,
            dry_multiplier: None,
            dry_base: None,
            dry_allowed_length: None,
            dry_penalty_last_n: None,
            xtc_threshold: None,
            xtc_probability: None,
            stop_strings: Vec::new(),
            max_tokens: Some(2048),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub endpoint_url: String, // e.g. "http://127.0.0.1:48596/v1/chat/completions" or OpenRouter
    pub api_key: Option<String>,
    pub model: Option<String>,
    pub messages: Vec<ChatMessage>,
    pub sampling: Option<SamplingParams>,
    #[serde(default)]
    pub reasoning_mode: Option<bool>,
    pub provider: Option<crate::modules::providers::LlmProviderType>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenEvent {
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThoughtEvent {
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DoneEvent {
    pub full_text: String,
    pub full_thought: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorEvent {
    pub error: String,
}

pub struct InferenceClient {
    abort_flag: Arc<AtomicBool>,
}

impl Default for InferenceClient {
    fn default() -> Self {
        Self::new()
    }
}

impl InferenceClient {
    pub fn new() -> Self {
        Self {
            abort_flag: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn abort(&self) {
        self.abort_flag.store(true, Ordering::Relaxed);
    }

    pub async fn stream_chat<R: tauri::Runtime>(
        &self,
        app_handle: &tauri::AppHandle<R>,
        request: ChatRequest,
    ) -> Result<DoneEvent, String> {
        self.abort_flag.store(false, Ordering::Relaxed);

        let provider = crate::modules::providers::ProviderRegistry::detect_provider(
            &request.endpoint_url,
            request.provider.as_ref(),
        );

        let client = reqwest::Client::new();
        let req_builder =
            crate::modules::providers::ProviderRegistry::build_http_request(&client, &request)?;

        let response = req_builder
            .send()
            .await
            .map_err(|e| format!("Verbindungsfehler zu {}: {}", request.endpoint_url, e))?;

        if !response.status().is_success() {
            let status = response.status();
            let err_text = response.text().await.unwrap_or_default();
            return Err(format!("LLM-Server Fehler ({}): {}", status, err_text));
        }

        let mut stream = response.bytes_stream();
        let mut full_text = String::new();
        let mut full_thought = String::new();
        let mut in_think_block = false;
        let mut buffer = String::new();

        while let Some(chunk_res) = stream.next().await {
            if self.abort_flag.load(Ordering::Relaxed) {
                info!("Inferenz durch Benutzer abgebrochen");
                break;
            }

            let chunk = chunk_res.map_err(|e| format!("Stream-Fehler: {}", e))?;
            let chunk_str = String::from_utf8_lossy(&chunk);
            buffer.push_str(&chunk_str);

            while let Some(line_end) = buffer.find('\n') {
                let line = buffer[..line_end].trim().to_string();
                buffer.drain(..=line_end);

                if line.is_empty() || line.starts_with(':') {
                    continue;
                }

                let delta =
                    crate::modules::providers::ProviderRegistry::parse_sse_line(&line, &provider);
                if delta.is_done {
                    break;
                }

                if let Some(th) = delta.thought
                    && !th.is_empty()
                {
                    full_thought.push_str(&th);
                    let _ = app_handle.emit("llm-thought", ThoughtEvent { text: th });
                }

                if let Some(content) = delta.text {
                    if content.is_empty() {
                        continue;
                    }

                    // Process inline <think> tags if model outputs them inside text stream
                    let mut remaining = &content[..];
                    while !remaining.is_empty() {
                        if !in_think_block {
                            if let Some(pos) = remaining.find("<think>") {
                                let before = &remaining[..pos];
                                if !before.is_empty() {
                                    full_text.push_str(before);
                                    let _ = app_handle.emit(
                                        "llm-token",
                                        TokenEvent {
                                            text: before.to_string(),
                                        },
                                    );
                                }
                                in_think_block = true;
                                remaining = &remaining[pos + 7..];
                            } else {
                                full_text.push_str(remaining);
                                let _ = app_handle.emit(
                                    "llm-token",
                                    TokenEvent {
                                        text: remaining.to_string(),
                                    },
                                );
                                break;
                            }
                        } else {
                            if let Some(pos) = remaining.find("</think>") {
                                let thought_part = &remaining[..pos];
                                if !thought_part.is_empty() {
                                    full_thought.push_str(thought_part);
                                    let _ = app_handle.emit(
                                        "llm-thought",
                                        ThoughtEvent {
                                            text: thought_part.to_string(),
                                        },
                                    );
                                }
                                in_think_block = false;
                                remaining = &remaining[pos + 8..];
                            } else {
                                full_thought.push_str(remaining);
                                let _ = app_handle.emit(
                                    "llm-thought",
                                    ThoughtEvent {
                                        text: remaining.to_string(),
                                    },
                                );
                                break;
                            }
                        }
                    }
                }
            }
        }

        let done_event = DoneEvent {
            full_text,
            full_thought,
        };

        let _ = app_handle.emit("llm-done", done_event.clone());
        Ok(done_event)
    }

    /// Direct non-streaming completion for internal cognitive agents (Router, Archivist, Diary)
    /// Does not emit UI stream events.
    pub async fn generate_direct(&self, request: ChatRequest) -> Result<String, String> {
        let provider = crate::modules::providers::ProviderRegistry::detect_provider(
            &request.endpoint_url,
            request.provider.as_ref(),
        );

        let client = reqwest::Client::new();
        let req_builder =
            crate::modules::providers::ProviderRegistry::build_http_request(&client, &request)?;

        let response = req_builder
            .send()
            .await
            .map_err(|e| format!("Verbindungsfehler zu {}: {}", request.endpoint_url, e))?;

        if !response.status().is_success() {
            let status = response.status();
            let err_text = response.text().await.unwrap_or_default();
            return Err(format!("LLM-Server Fehler ({}): {}", status, err_text));
        }

        let mut stream = response.bytes_stream();
        let mut full_text = String::new();
        let mut buffer = String::new();

        while let Some(chunk_res) = stream.next().await {
            let chunk = chunk_res.map_err(|e| format!("Stream-Fehler: {}", e))?;
            let chunk_str = String::from_utf8_lossy(&chunk);
            buffer.push_str(&chunk_str);

            while let Some(line_end) = buffer.find('\n') {
                let line = buffer[..line_end].trim().to_string();
                buffer.drain(..=line_end);

                if line.is_empty() || line.starts_with(':') {
                    continue;
                }

                let delta =
                    crate::modules::providers::ProviderRegistry::parse_sse_line(&line, &provider);
                if delta.is_done {
                    break;
                }

                if let Some(content) = delta.text {
                    full_text.push_str(&content);
                }
            }
        }

        // Clean out <think>...</think> tags if model produced them
        let cleaned = if let (Some(start), Some(end)) =
            (full_text.find("<think>"), full_text.rfind("</think>"))
        {
            if end > start {
                let mut stripped = full_text[..start].to_string();
                stripped.push_str(&full_text[end + 8..]);
                stripped
            } else {
                full_text
            }
        } else {
            full_text
        };

        Ok(cleaned.trim().to_string())
    }
}
