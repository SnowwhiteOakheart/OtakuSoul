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
    /// Files attached by the user; see `attachments::prepare` before sending.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub attachments: Vec<crate::modules::attachments::Attachment>,
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
    pub generation_id: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ThoughtEvent {
    pub generation_id: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct DoneEvent {
    pub generation_id: String,
    pub full_text: String,
    pub full_thought: String,
    /// How full the context window was; only for chat messages from the UI.
    #[serde(default)]
    #[ts(optional)]
    pub context: Option<crate::modules::context_window::ContextUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ErrorEvent {
    pub error: String,
}

pub struct InferenceClient {
    abort_flag: Arc<AtomicBool>,
    abort_signal: tokio::sync::watch::Sender<u64>,
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

/// DRY `-1` means "the whole context". Newer llama-server builds reject negative values, so
/// local servers get their actual context size instead (or the field is left out if it can't
/// be read, which falls back to the server's default).
async fn resolve_dry_window(
    client: &reqwest::Client,
    mut request: ChatRequest,
    provider: &crate::modules::providers::LlmProviderType,
) -> ChatRequest {
    use crate::modules::providers::LlmProviderType;
    let Some(sampling) = request.sampling.as_mut() else {
        return request;
    };
    if !sampling.dry_penalty_last_n.is_some_and(|n| n < 0)
        || !matches!(
            provider,
            LlmProviderType::LocalLlama | LlmProviderType::Custom
        )
    {
        return request;
    }
    let base = crate::modules::context_window::server_base(&request.endpoint_url);
    let context = tokio::time::timeout(
        std::time::Duration::from_secs(5),
        crate::modules::context_window::server_context(client, &base),
    )
    .await
    .ok()
    .flatten();
    sampling.dry_penalty_last_n = context.and_then(|n| i32::try_from(n).ok());
    request
}

impl InferenceClient {
    fn emit_segment<R: tauri::Runtime>(
        app_handle: &tauri::AppHandle<R>,
        generation_id: &str,
        full_text: &mut String,
        full_thought: &mut String,
        is_thought: bool,
        text: String,
    ) {
        if is_thought {
            full_thought.push_str(&text);
            let _ = app_handle.emit(
                "llm-thought",
                ThoughtEvent {
                    generation_id: generation_id.to_owned(),
                    text,
                },
            );
        } else {
            full_text.push_str(&text);
            let _ = app_handle.emit(
                "llm-token",
                TokenEvent {
                    generation_id: generation_id.to_owned(),
                    text,
                },
            );
        }
    }

    pub fn new() -> Self {
        Self {
            abort_flag: Arc::new(AtomicBool::new(false)),
            abort_signal: tokio::sync::watch::channel(0).0,
        }
    }

    pub fn abort(&self) {
        self.abort_flag.store(true, Ordering::Relaxed);
        self.abort_signal
            .send_modify(|epoch| *epoch = epoch.wrapping_add(1));
    }

    /// Clears a previous abort; called when a new generation (or Stage turn) starts.
    pub fn reset_abort(&self) {
        self.abort_flag.store(false, Ordering::Relaxed);
    }

    pub fn is_aborted(&self) -> bool {
        self.abort_flag.load(Ordering::Relaxed)
    }

    /// Drops a pending preparation/request on abort, even if no network bytes arrive.
    /// The signal is an epoch so resetting the flag cannot revive an older waiter.
    pub async fn with_abort<T>(&self, future: impl std::future::Future<Output = T>) -> Option<T> {
        let mut signal = self.abort_signal.subscribe();
        if self.is_aborted() {
            return None;
        }
        tokio::select! {
            biased;
            _ = signal.changed() => None,
            result = future => Some(result),
        }
    }

    pub async fn stream_chat<R: tauri::Runtime>(
        &self,
        app_handle: &tauri::AppHandle<R>,
        request: ChatRequest,
        generation_id: &str,
    ) -> Result<DoneEvent, String> {
        let mut full_text = String::new();
        let mut full_thought = String::new();
        self.stream_segments(request, |is_thought, text| {
            Self::emit_segment(
                app_handle,
                generation_id,
                &mut full_text,
                &mut full_thought,
                is_thought,
                text,
            );
        })
        .await?;

        let done_event = DoneEvent {
            generation_id: generation_id.to_owned(),
            full_text,
            full_thought,
            context: None,
        };

        let _ = app_handle.emit("llm-done", done_event.clone());
        Ok(done_event)
    }

    /// Streams the reply and hands every visible text piece to `on_text` (reasoning is dropped);
    /// returns the whole text. Unlike `stream_chat` it emits no global chat events, so other
    /// views (e.g. Soul Stage) can show their own live text. Stopped by `abort`.
    pub async fn stream_text(
        &self,
        request: ChatRequest,
        mut on_text: impl FnMut(&str),
    ) -> Result<String, String> {
        let mut full_text = String::new();
        self.stream_segments(request, |is_thought, text| {
            if !is_thought {
                on_text(&text);
                full_text.push_str(&text);
            }
        })
        .await?;
        Ok(full_text)
    }

    /// The SSE loop shared by the streaming calls: `(is_thought, text)` per piece. Does not
    /// reset the abort flag, so an abort covers every call of a multi-step turn.
    async fn stream_segments(
        &self,
        request: ChatRequest,
        on_segment: impl FnMut(bool, String),
    ) -> Result<(), String> {
        self.with_abort(self.stream_segments_inner(request, on_segment))
            .await
            .unwrap_or(Ok(()))
    }

    async fn stream_segments_inner(
        &self,
        request: ChatRequest,
        mut on_segment: impl FnMut(bool, String),
    ) -> Result<(), String> {
        let provider = crate::modules::providers::ProviderRegistry::detect_provider(
            &request.endpoint_url,
            request.provider.as_ref(),
        );

        let client = reqwest::Client::new();
        let request = resolve_dry_window(&client, request, &provider).await;
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
                    on_segment(true, th);
                }

                if let Some(content) = delta.text {
                    for (is_thought, text) in think_filter.push(&content) {
                        on_segment(is_thought, text);
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
                    on_segment(is_thought, text);
                }
            }
        }

        if let Some((is_thought, text)) = think_filter.finish() {
            on_segment(is_thought, text);
        }
        Ok(())
    }

    /// Direct non-streaming completion for internal cognitive agents (Router, Archivist, Diary)
    /// Does not emit UI stream events.
    pub async fn generate_direct(&self, request: ChatRequest) -> Result<String, String> {
        let provider = crate::modules::providers::ProviderRegistry::detect_provider(
            &request.endpoint_url,
            request.provider.as_ref(),
        );

        let client = reqwest::Client::new();
        let request = resolve_dry_window(&client, request, &provider).await;
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

    /// Local server whose `/props` reports a context of 8192 tokens.
    async fn props_server() -> String {
        let app = axum::Router::new().route(
            "/props",
            axum::routing::get(|| async {
                axum::Json(serde_json::json!({
                    "model_path": "m.gguf",
                    "default_generation_settings": { "n_ctx": 8192 }
                }))
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await });
        format!("http://{addr}/v1/chat/completions")
    }

    fn request(endpoint: &str, dry: Option<i32>) -> super::ChatRequest {
        super::ChatRequest {
            endpoint_url: endpoint.into(),
            api_key: None,
            model: None,
            messages: Vec::new(),
            sampling: Some(super::SamplingParams {
                dry_penalty_last_n: dry,
                ..Default::default()
            }),
            reasoning_mode: None,
            provider: None,
        }
    }

    fn dry(request: &super::ChatRequest) -> Option<i32> {
        request.sampling.as_ref().unwrap().dry_penalty_last_n
    }

    #[tokio::test]
    async fn separate_clients_do_not_cancel_or_reset_each_other() {
        let chat = std::sync::Arc::new(super::InferenceClient::new());
        let stage = std::sync::Arc::new(super::InferenceClient::new());
        let (chat_started, chat_ready) = tokio::sync::oneshot::channel();
        let (stage_started, stage_ready) = tokio::sync::oneshot::channel();
        let waiting_chat = chat.clone();
        let waiting_stage = stage.clone();
        let chat_task = tokio::spawn(async move {
            waiting_chat
                .with_abort(async {
                    chat_started.send(()).unwrap();
                    std::future::pending::<()>().await
                })
                .await
        });
        let stage_task = tokio::spawn(async move {
            waiting_stage
                .with_abort(async {
                    stage_started.send(()).unwrap();
                    std::future::pending::<()>().await
                })
                .await
        });
        chat_ready.await.unwrap();
        stage_ready.await.unwrap();
        chat.abort();
        stage.reset_abort();
        assert!(
            tokio::time::timeout(std::time::Duration::from_secs(2), chat_task)
                .await
                .unwrap()
                .unwrap()
                .is_none()
        );
        assert!(chat.is_aborted());
        assert!(!stage.is_aborted());
        assert!(!stage_task.is_finished());
        stage.abort();
        chat.reset_abort();
        assert!(
            tokio::time::timeout(std::time::Duration::from_secs(2), stage_task)
                .await
                .unwrap()
                .unwrap()
                .is_none()
        );
        assert!(stage.is_aborted());
        assert!(!chat.is_aborted());
        assert_eq!(chat.with_abort(async { 42 }).await, Some(42));
    }

    #[test]
    fn native_chat_events_carry_the_request_identity() {
        let id = "chat-generation-42";
        let token = super::TokenEvent {
            generation_id: id.into(),
            text: "Hello".into(),
        };
        let thought = super::ThoughtEvent {
            generation_id: id.into(),
            text: "Thinking".into(),
        };
        let done = super::DoneEvent {
            generation_id: id.into(),
            full_text: "Hello".into(),
            full_thought: "Thinking".into(),
            context: None,
        };
        for event in [
            serde_json::to_value(token).unwrap(),
            serde_json::to_value(thought).unwrap(),
            serde_json::to_value(done).unwrap(),
        ] {
            assert_eq!(event["generation_id"], id);
        }
    }

    #[tokio::test]
    async fn abort_interrupts_a_request_waiting_for_response_headers() {
        let (entered, received) = tokio::sync::oneshot::channel();
        let entered = std::sync::Arc::new(std::sync::Mutex::new(Some(entered)));
        let app = axum::Router::new().route(
            "/v1/chat/completions",
            axum::routing::post(move || {
                let entered = entered.clone();
                async move {
                    if let Some(sender) = entered.lock().unwrap().take() {
                        let _ = sender.send(());
                    }
                    std::future::pending::<axum::response::Response>().await
                }
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!(
            "http://{}/v1/chat/completions",
            listener.local_addr().unwrap()
        );
        let server = tokio::spawn(async move { axum::serve(listener, app).await });
        let client = std::sync::Arc::new(super::InferenceClient::new());
        let running = client.clone();
        let task =
            tokio::spawn(
                async move { running.stream_text(request(&endpoint, None), |_| {}).await },
            );
        tokio::time::timeout(std::time::Duration::from_secs(2), received)
            .await
            .unwrap()
            .unwrap();
        client.abort();
        let result = tokio::time::timeout(std::time::Duration::from_secs(2), task)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert!(result.is_empty());
        server.abort();
    }

    #[tokio::test]
    async fn abort_interrupts_an_idle_stream_without_flushing_partial_tags() {
        use futures_util::StreamExt;
        let app = axum::Router::new().route(
            "/v1/chat/completions",
            axum::routing::post(|| async {
                let chunk = axum::body::Bytes::from(
                    "data: {\"choices\":[{\"delta\":{\"content\":\"Hello<thi\"}}]}\n\n",
                );
                let stream =
                    futures_util::stream::once(std::future::ready(Ok::<_, std::io::Error>(chunk)))
                        .chain(futures_util::stream::pending());
                axum::response::Response::builder()
                    .header("content-type", "text/event-stream")
                    .body(axum::body::Body::from_stream(stream))
                    .unwrap()
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!(
            "http://{}/v1/chat/completions",
            listener.local_addr().unwrap()
        );
        let server = tokio::spawn(async move { axum::serve(listener, app).await });
        let (entered, received) = tokio::sync::oneshot::channel();
        let client = std::sync::Arc::new(super::InferenceClient::new());
        let running = client.clone();
        let task = tokio::spawn(async move {
            let mut entered = Some(entered);
            let mut pieces = Vec::new();
            let result = running
                .stream_text(request(&endpoint, None), |text| {
                    pieces.push(text.to_string());
                    if let Some(sender) = entered.take() {
                        let _ = sender.send(());
                    }
                })
                .await;
            (result, pieces)
        });
        tokio::time::timeout(std::time::Duration::from_secs(2), received)
            .await
            .unwrap()
            .unwrap();
        client.abort();
        let (result, pieces) = tokio::time::timeout(std::time::Duration::from_secs(2), task)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(result.unwrap(), "Hello");
        assert_eq!(pieces.concat(), "Hello");
        server.abort();
    }

    #[tokio::test]
    async fn resetting_abort_does_not_revive_an_older_waiter() {
        let client = std::sync::Arc::new(super::InferenceClient::new());
        let running = client.clone();
        let (entered, received) = tokio::sync::oneshot::channel();
        let task = tokio::spawn(async move {
            running
                .with_abort(async {
                    entered.send(()).unwrap();
                    std::future::pending::<()>().await
                })
                .await
        });
        received.await.unwrap();
        client.abort();
        client.reset_abort();
        assert!(
            tokio::time::timeout(std::time::Duration::from_secs(2), task)
                .await
                .unwrap()
                .unwrap()
                .is_none()
        );
        assert_eq!(client.with_abort(async { 42 }).await, Some(42));
    }

    #[tokio::test]
    async fn dry_whole_context_becomes_the_server_context_size() {
        use crate::modules::providers::LlmProviderType::{LocalLlama, OpenRouter};
        let client = reqwest::Client::new();
        let endpoint = props_server().await;

        let local = super::resolve_dry_window(&client, request(&endpoint, Some(-1)), &LocalLlama);
        assert_eq!(dry(&local.await), Some(8192));
        let explicit =
            super::resolve_dry_window(&client, request(&endpoint, Some(256)), &LocalLlama);
        assert_eq!(dry(&explicit.await), Some(256));
        let cloud = super::resolve_dry_window(&client, request(&endpoint, Some(-1)), &OpenRouter);
        assert_eq!(dry(&cloud.await), Some(-1));
        // Unreachable server: leave it to the server's default.
        let gone = request("http://127.0.0.1:9/v1/chat/completions", Some(-1));
        let gone = super::resolve_dry_window(&client, gone, &LocalLlama);
        assert_eq!(dry(&gone.await), None);
    }

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
