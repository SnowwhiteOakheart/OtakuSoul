//! Keeps a chat request inside the model's context window: the system prompt and the latest
//! message always go out, older messages are left out from the front until the rest fits next
//! to the reply reserve. A local llama-server counts tokens exactly (`/tokenize`, cached per
//! message); cloud models are estimated.

use crate::modules::inference::ChatMessage;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::sync::Mutex;
use std::time::Duration;
use ts_rs::TS;

/// Template tokens around each message (role markers, separators), roughly what chat templates add.
const PER_MESSAGE_TOKENS: usize = 6;
/// An attached image, roughly (vision encoders use a few hundred to about a thousand tokens).
const IMAGE_TOKENS: usize = 1_000;
/// Messages cached per model; enough for very long chats.
const CACHE_LIMIT: usize = 20_000;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ContextUsage {
    /// Tokens of the messages that were sent.
    pub prompt_tokens: u32,
    /// Context window of the model.
    pub context_tokens: u32,
    /// Tokens kept free for the reply.
    pub reserve_tokens: u32,
    /// Older messages that no longer fit and were left out.
    pub dropped_messages: u32,
    /// Counted by an estimate (cloud) instead of the model's tokenizer.
    pub estimated: bool,
}

#[derive(Default)]
pub struct TokenCounter {
    /// (model, text hash) → tokens.
    cache: Mutex<HashMap<(String, u64), usize>>,
}

/// The parts of `/props` needed here.
#[derive(Deserialize)]
struct Props {
    #[serde(default)]
    model_path: String,
    default_generation_settings: GenerationSettings,
}

#[derive(Deserialize)]
struct GenerationSettings {
    n_ctx: u32,
}

#[derive(Deserialize)]
struct Tokenized {
    tokens: Vec<serde_json::Value>,
}

/// Cloud models: about 3 bytes per token is on the safe side for German, English and Russian
/// (Cyrillic needs two bytes per letter but also more tokens per word).
pub fn estimate_tokens(text: &str) -> usize {
    text.len().div_ceil(3)
}

/// Indices of the messages to send: all system messages, the newest messages that fit, and
/// always the latest non-system one (a trailing instruction such as "continue" doesn't count). `count(i)` gives the tokens of message `i` and is only called for
/// messages that are considered, newest first.
pub fn select(
    messages: &[ChatMessage],
    budget: usize,
    mut count: impl FnMut(usize) -> usize,
) -> (Vec<usize>, usize) {
    let cost = |tokens: usize| tokens + PER_MESSAGE_TOKENS;
    let mut used: usize = messages
        .iter()
        .enumerate()
        .filter(|(_, m)| m.role == "system")
        .map(|(i, _)| cost(count(i)))
        .sum();
    let latest = messages.iter().rposition(|m| m.role != "system");
    let mut keep: Vec<usize> = Vec::new();
    let mut full = false;
    for i in (0..messages.len()).rev() {
        if messages[i].role == "system" {
            keep.push(i);
            continue;
        }
        if full {
            continue;
        }
        let tokens = cost(count(i));
        if Some(i) == latest || used + tokens <= budget {
            used += tokens;
            keep.push(i);
        } else {
            // Stop at the first gap so the conversation stays contiguous.
            full = true;
        }
    }
    keep.reverse();
    (keep, used)
}

impl TokenCounter {
    /// Drops the oldest messages that don't fit into `context_tokens` (for cloud models; local
    /// servers report their own size) minus the reply reserve.
    pub async fn fit(
        &self,
        messages: Vec<ChatMessage>,
        local_base: Option<&str>,
        context_tokens: Option<u32>,
        max_reply: Option<u32>,
    ) -> (Vec<ChatMessage>, Option<ContextUsage>) {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .unwrap_or_default();
        let props = match local_base {
            Some(base) => fetch_props(&client, base).await,
            None => None,
        };
        let Some(context) = props
            .as_ref()
            .map(|p| p.default_generation_settings.n_ctx)
            .or(context_tokens)
            .filter(|n| *n > 0)
        else {
            return (messages, None);
        };
        let reserve = max_reply.unwrap_or(2048).min(context / 2);
        let budget = (context - reserve) as usize;

        let mut counts: HashMap<usize, usize> = HashMap::new();
        let estimated = props.is_none();
        if let (Some(base), Some(props)) = (local_base, props.as_ref()) {
            // Exact counts, newest first, until the window is full; cached for the next turn.
            let system = (0..messages.len()).filter(|&i| messages[i].role == "system");
            let others = (0..messages.len())
                .rev()
                .filter(|&i| messages[i].role != "system");
            let mut used = 0usize;
            for i in system.chain(others) {
                if used > budget && messages[i].role != "system" {
                    break;
                }
                let tokens = self
                    .count_local(&client, base, &props.model_path, &messages[i].content)
                    .await
                    + messages[i].attachments.len() * IMAGE_TOKENS;
                counts.insert(i, tokens);
                used += tokens + PER_MESSAGE_TOKENS;
            }
        }
        let (keep, used) = select(&messages, budget, |i| {
            *counts.entry(i).or_insert_with(|| {
                estimate_tokens(&messages[i].content) + messages[i].attachments.len() * IMAGE_TOKENS
            })
        });
        let dropped = messages.len() - keep.len();
        let usage = ContextUsage {
            prompt_tokens: used as u32,
            context_tokens: context,
            reserve_tokens: reserve,
            dropped_messages: dropped as u32,
            estimated,
        };
        let kept = if dropped == 0 {
            messages
        } else {
            keep.into_iter().map(|i| messages[i].clone()).collect()
        };
        (kept, Some(usage))
    }

    async fn count_local(
        &self,
        client: &reqwest::Client,
        base: &str,
        model: &str,
        text: &str,
    ) -> usize {
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        text.hash(&mut hasher);
        let key = (model.to_string(), hasher.finish());
        if let Some(tokens) = self.cache.lock().ok().and_then(|c| c.get(&key).copied()) {
            return tokens;
        }
        let counted = async {
            client
                .post(format!("{base}/tokenize"))
                .json(&serde_json::json!({ "content": text }))
                .send()
                .await
                .ok()?
                .json::<Tokenized>()
                .await
                .ok()
                .map(|t| t.tokens.len())
        }
        .await;
        match counted {
            Some(tokens) => {
                if let Ok(mut cache) = self.cache.lock() {
                    if cache.len() >= CACHE_LIMIT {
                        cache.clear();
                    }
                    cache.insert(key, tokens);
                }
                tokens
            }
            None => estimate_tokens(text),
        }
    }
}

async fn fetch_props(client: &reqwest::Client, base: &str) -> Option<Props> {
    client
        .get(format!("{base}/props"))
        .send()
        .await
        .ok()?
        .json::<Props>()
        .await
        .ok()
}

/// Context size the llama-server at `base` was started with.
pub async fn server_context(client: &reqwest::Client, base: &str) -> Option<u32> {
    fetch_props(client, base)
        .await
        .map(|p| p.default_generation_settings.n_ctx)
        .filter(|n| *n > 0)
}

/// `http://127.0.0.1:8080` from `http://127.0.0.1:8080/v1/chat/completions`.
pub fn server_base(endpoint: &str) -> String {
    let trimmed = endpoint.trim_end_matches('/');
    trimmed
        .strip_suffix("/v1/chat/completions")
        .or_else(|| trimmed.strip_suffix("/chat/completions"))
        .unwrap_or(trimmed)
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn msg(role: &str, content: &str) -> ChatMessage {
        ChatMessage {
            role: role.into(),
            content: content.into(),
            attachments: Vec::new(),
        }
    }

    #[test]
    fn drops_the_oldest_messages_and_keeps_system_prompts() {
        let messages = vec![
            msg("system", "prompt"),
            msg("assistant", "greeting"),
            msg("user", "one"),
            msg("assistant", "two"),
            msg("system", "[Author's note]"),
            msg("user", "three"),
        ];
        // Every message costs 10 + 6 tokens; 5 of them fit into 80.
        let (keep, used) = select(&messages, 80, |_| 10);
        assert_eq!(keep, vec![0, 2, 3, 4, 5]);
        assert_eq!(used, 80);
    }

    #[test]
    fn always_sends_the_latest_message() {
        let messages = vec![msg("system", "prompt"), msg("user", "long")];
        let (keep, _) = select(&messages, 10, |i| if i == 1 { 1_000 } else { 1 });
        assert_eq!(keep, vec![0, 1]);
    }

    #[test]
    fn stops_at_the_first_gap() {
        // The small old message would fit, but sending it without its neighbour breaks the flow.
        let messages = vec![msg("user", "a"), msg("assistant", "b"), msg("user", "c")];
        let sizes = [1, 100, 10];
        let (keep, _) = select(&messages, 50, |i| sizes[i]);
        assert_eq!(keep, vec![2]);
    }

    /// Against a running llama-server: `OTAKUSOUL_LLAMA_URL=http://127.0.0.1:48777 cargo test
    /// --lib context_window -- --ignored --nocapture`.
    #[tokio::test]
    #[ignore]
    async fn fits_a_long_chat_into_a_real_server() {
        let base = std::env::var("OTAKUSOUL_LLAMA_URL").expect("OTAKUSOUL_LLAMA_URL");
        let mut messages = vec![msg("system", &"Du bist Aiko. ".repeat(100))];
        for i in 0..200 {
            let role = if i % 2 == 0 { "user" } else { "assistant" };
            messages.push(msg(
                role,
                &format!("Nachricht {i}: {}", "Wie war dein Tag? ".repeat(20)),
            ));
        }
        let counter = TokenCounter::default();
        for round in 0..2 {
            let started = std::time::Instant::now();
            let (kept, usage) = counter
                .fit(messages.clone(), Some(&base), None, Some(1024))
                .await;
            let usage = usage.expect("usage");
            println!(
                "round {round}: {usage:?}, {} kept, {:?}",
                kept.len(),
                started.elapsed()
            );
            assert!(!usage.estimated);
            assert!(usage.dropped_messages > 0);
            assert!(usage.prompt_tokens + usage.reserve_tokens <= usage.context_tokens);
            assert_eq!(kept[0].role, "system");
            assert_eq!(
                kept.last().unwrap().content,
                messages.last().unwrap().content
            );
        }
    }

    #[test]
    fn derives_the_server_address() {
        assert_eq!(
            server_base("http://127.0.0.1:48596/v1/chat/completions"),
            "http://127.0.0.1:48596"
        );
    }
}
