use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Emitter;
use tracing::info;
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TokenEvent {
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ThoughtEvent {
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct DoneEvent {
    pub full_text: String,
    pub full_thought: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ErrorEvent {
    pub error: String,
}

pub struct InferenceClient {
    abort_flag: Arc<AtomicBool>,
}

#[derive(Default)]
struct SseLines {
    bytes: Vec<u8>,
}

impl SseLines {
    fn push(&mut self, chunk: &[u8]) -> Result<Vec<String>, String> {
        self.bytes.extend_from_slice(chunk);
        let mut lines = Vec::new();
        while let Some(end) = self.bytes.iter().position(|byte| *byte == b'\n') {
            let line = self.bytes.drain(..=end).collect::<Vec<_>>();
            lines.push(String::from_utf8(line).map_err(|error| error.to_string())?);
        }
        Ok(lines)
    }

    fn finish(&mut self) -> Result<Option<String>, String> {
        if self.bytes.is_empty() {
            return Ok(None);
        }
        String::from_utf8(std::mem::take(&mut self.bytes))
            .map(Some)
            .map_err(|error| error.to_string())
    }
}

#[derive(Default)]
struct ThinkTagFilter {
    pending: String,
    in_think_block: bool,
}

impl ThinkTagFilter {
    /// Returns `(is_thought, text)` segments that can be emitted immediately.
    fn push(&mut self, content: &str) -> Vec<(bool, String)> {
        self.pending.push_str(content);
        let mut segments = Vec::new();
        loop {
            let tag = if self.in_think_block {
                "</think>"
            } else {
                "<think>"
            };
            if let Some(position) = self.pending.find(tag) {
                if position > 0 {
                    segments.push((self.in_think_block, self.pending[..position].to_string()));
                }
                self.pending.drain(..position + tag.len());
                self.in_think_block = !self.in_think_block;
                continue;
            }

            let keep = (1..tag.len())
                .rev()
                .find(|length| self.pending.ends_with(&tag[..*length]))
                .unwrap_or(0);
            let emit_len = self.pending.len() - keep;
            if emit_len > 0 {
                segments.push((self.in_think_block, self.pending[..emit_len].to_string()));
                self.pending.drain(..emit_len);
            }
            return segments;
        }
    }

    fn finish(&mut self) -> Option<(bool, String)> {
        if self.pending.is_empty() {
            None
        } else {
            Some((self.in_think_block, std::mem::take(&mut self.pending)))
        }
    }
}

impl Default for InferenceClient {
    fn default() -> Self {
        Self::new()
    }
}

impl InferenceClient {
    fn emit_segment<R: tauri::Runtime>(
        app_handle: &tauri::AppHandle<R>,
        full_text: &mut String,
        full_thought: &mut String,
        is_thought: bool,
        text: String,
    ) {
        if is_thought {
            full_thought.push_str(&text);
            let _ = app_handle.emit("llm-thought", ThoughtEvent { text });
        } else {
            full_text.push_str(&text);
            let _ = app_handle.emit("llm-token", TokenEvent { text });
        }
    }

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

        let response = req_builder.send().await.map_err(|e| {
            crate::err!("backend.llm.connect", url = request.endpoint_url, error = e)
        })?;

        if !response.status().is_success() {
            let status = response.status();
            let err_text = response.text().await.unwrap_or_default();
            return Err(crate::err!(
                "backend.llm.server",
                status = status,
                error = err_text
            ));
        }

        let mut stream = response.bytes_stream();
        let mut full_text = String::new();
        let mut full_thought = String::new();
        let mut lines = SseLines::default();
        let mut think_filter = ThinkTagFilter::default();

        'stream: while let Some(chunk_res) = stream.next().await {
            if self.abort_flag.load(Ordering::Relaxed) {
                info!("Inferenz durch Benutzer abgebrochen");
                break;
            }

            let chunk = chunk_res.map_err(|e| crate::err!("backend.llm.stream", error = e))?;
            for line in lines
                .push(&chunk)
                .map_err(|error| crate::err!("backend.llm.stream", error = error))?
            {
                let line = line.trim();
                if line.is_empty() || line.starts_with(':') {
                    continue;
                }

                let delta =
                    crate::modules::providers::ProviderRegistry::parse_sse_line(line, &provider);
                if let Some(th) = delta.thought
                    && !th.is_empty()
                {
                    full_thought.push_str(&th);
                    let _ = app_handle.emit("llm-thought", ThoughtEvent { text: th });
                }

                if let Some(content) = delta.text {
                    for (is_thought, text) in think_filter.push(&content) {
                        Self::emit_segment(
                            app_handle,
                            &mut full_text,
                            &mut full_thought,
                            is_thought,
                            text,
                        );
                    }
                }
                if delta.is_done {
                    break 'stream;
                }
            }
        }

        if let Some(line) = lines
            .finish()
            .map_err(|error| crate::err!("backend.llm.stream", error = error))?
        {
            let delta =
                crate::modules::providers::ProviderRegistry::parse_sse_line(line.trim(), &provider);
            if let Some(content) = delta.text {
                for (is_thought, text) in think_filter.push(&content) {
                    Self::emit_segment(
                        app_handle,
                        &mut full_text,
                        &mut full_thought,
                        is_thought,
                        text,
                    );
                }
            }
        }

        if let Some((is_thought, text)) = think_filter.finish() {
            Self::emit_segment(
                app_handle,
                &mut full_text,
                &mut full_thought,
                is_thought,
                text,
            );
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

        let response = req_builder.send().await.map_err(|e| {
            crate::err!("backend.llm.connect", url = request.endpoint_url, error = e)
        })?;

        if !response.status().is_success() {
            let status = response.status();
            let err_text = response.text().await.unwrap_or_default();
            return Err(crate::err!(
                "backend.llm.server",
                status = status,
                error = err_text
            ));
        }

        let mut stream = response.bytes_stream();
        let mut full_text = String::new();
        let mut lines = SseLines::default();
        let mut think_filter = ThinkTagFilter::default();

        'stream: while let Some(chunk_res) = stream.next().await {
            let chunk = chunk_res.map_err(|e| crate::err!("backend.llm.stream", error = e))?;
            for line in lines
                .push(&chunk)
                .map_err(|error| crate::err!("backend.llm.stream", error = error))?
            {
                let line = line.trim();
                if line.is_empty() || line.starts_with(':') {
                    continue;
                }

                let delta =
                    crate::modules::providers::ProviderRegistry::parse_sse_line(line, &provider);
                if let Some(content) = delta.text {
                    for (is_thought, text) in think_filter.push(&content) {
                        if !is_thought {
                            full_text.push_str(&text);
                        }
                    }
                }
                if delta.is_done {
                    break 'stream;
                }
            }
        }
        if let Some(line) = lines
            .finish()
            .map_err(|error| crate::err!("backend.llm.stream", error = error))?
        {
            let delta =
                crate::modules::providers::ProviderRegistry::parse_sse_line(line.trim(), &provider);
            if let Some(content) = delta.text {
                for (is_thought, text) in think_filter.push(&content) {
                    if !is_thought {
                        full_text.push_str(&text);
                    }
                }
            }
        }
        if let Some((false, text)) = think_filter.finish() {
            full_text.push_str(&text);
        }

        Ok(full_text.trim().to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::{SseLines, ThinkTagFilter};

    #[test]
    fn decodes_utf8_after_a_complete_line_arrives() {
        let mut lines = SseLines::default();
        let message = "data: {\"text\":\"Grüße\"}\n".as_bytes();
        let split = message.iter().position(|byte| *byte == 0xc3).unwrap() + 1;
        assert!(lines.push(&message[..split]).unwrap().is_empty());
        assert_eq!(
            lines.push(&message[split..]).unwrap(),
            vec![String::from_utf8(message.to_vec()).unwrap()]
        );
    }

    #[test]
    fn separates_thought_tags_split_across_deltas() {
        let mut filter = ThinkTagFilter::default();
        let mut segments = Vec::new();
        for part in ["Hallo <thi", "nk>intern</thi", "nk> Welt"] {
            segments.extend(filter.push(part));
        }
        if let Some(last) = filter.finish() {
            segments.push(last);
        }
        let answer: String = segments
            .iter()
            .filter(|(thought, _)| !thought)
            .map(|(_, text)| text.as_str())
            .collect();
        let thought: String = segments
            .iter()
            .filter(|(thought, _)| *thought)
            .map(|(_, text)| text.as_str())
            .collect();
        assert_eq!(answer, "Hallo  Welt");
        assert_eq!(thought, "intern");
    }
}
