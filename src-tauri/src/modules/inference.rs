use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
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
    pub max_tokens: Option<u32>,
}

impl Default for SamplingParams {
    fn default() -> Self {
        Self {
            temperature: Some(0.7),
            top_p: Some(0.9),
            min_p: Some(0.05),
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

        let client = reqwest::Client::new();
        let mut req_builder = client.post(&request.endpoint_url);

        if let Some(key) = &request.api_key {
            if !key.is_empty() {
                req_builder = req_builder.header("Authorization", format!("Bearer {}", key));
            }
        }

        let sampling = request.sampling.unwrap_or_default();
        let body = serde_json::json!({
            "model": request.model.unwrap_or_else(|| "default".to_string()),
            "messages": request.messages,
            "stream": true,
            "temperature": sampling.temperature.unwrap_or(0.7),
            "top_p": sampling.top_p.unwrap_or(0.9),
            "min_p": sampling.min_p.unwrap_or(0.05),
            "max_tokens": sampling.max_tokens.unwrap_or(2048),
        });

        let response = req_builder
            .json(&body)
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

                if line == "data: [DONE]" {
                    break;
                }

                if let Some(data_json) = line.strip_prefix("data: ") {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(data_json) {
                        if let Some(delta) = val["choices"][0]["delta"].as_object() {
                            // Check for dedicated reasoning_content (DeepSeek / Qwen API format)
                            if let Some(reasoning) = delta.get("reasoning_content").and_then(|v| v.as_str()) {
                                if !reasoning.is_empty() {
                                    full_thought.push_str(reasoning);
                                    let _ = app_handle.emit("llm-thought", ThoughtEvent {
                                        text: reasoning.to_string(),
                                    });
                                    continue;
                                }
                            }

                            // Regular content with inline <think> tags parser
                            if let Some(content) = delta.get("content").and_then(|v| v.as_str()) {
                                if content.is_empty() {
                                    continue;
                                }

                                let mut remaining = content;

                                while !remaining.is_empty() {
                                    if !in_think_block {
                                        if let Some(pos) = remaining.find("<think>") {
                                            let before = &remaining[..pos];
                                            if !before.is_empty() {
                                                full_text.push_str(before);
                                                let _ = app_handle.emit("llm-token", TokenEvent {
                                                    text: before.to_string(),
                                                });
                                            }
                                            in_think_block = true;
                                            remaining = &remaining[pos + 7..];
                                        } else {
                                            full_text.push_str(remaining);
                                            let _ = app_handle.emit("llm-token", TokenEvent {
                                                text: remaining.to_string(),
                                            });
                                            break;
                                        }
                                    } else {
                                        if let Some(pos) = remaining.find("</think>") {
                                            let thought_part = &remaining[..pos];
                                            if !thought_part.is_empty() {
                                                full_thought.push_str(thought_part);
                                                let _ = app_handle.emit("llm-thought", ThoughtEvent {
                                                    text: thought_part.to_string(),
                                                });
                                            }
                                            in_think_block = false;
                                            remaining = &remaining[pos + 8..];
                                        } else {
                                            full_thought.push_str(remaining);
                                            let _ = app_handle.emit("llm-thought", ThoughtEvent {
                                                text: remaining.to_string(),
                                            });
                                            break;
                                        }
                                    }
                                }
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
}
