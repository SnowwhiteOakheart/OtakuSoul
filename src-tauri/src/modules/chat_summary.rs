//! Running summary of the messages that fell out of the context window. The chat model folds
//! new messages into the existing summary chunk by chunk; the result goes into the system prompt
//! as "Story So Far".

use crate::modules::context_window::estimate_tokens;
use crate::modules::inference::{ChatMessage, ChatRequest, InferenceClient, SamplingParams};
use crate::modules::memory::{ChatSession, MemoryDb, StoredChatMessage};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ChatSummaryRequest {
    pub chat_id: String,
    /// Summarize up to and including the message with this `order_index`.
    pub up_to_index: i64,
    pub char_name: String,
    pub user_name: String,
    pub reply_language: String,
    /// Context window of the model; chunks are sized to half of it.
    pub context_tokens: u32,
    pub endpoint_url: String,
    pub api_key: Option<String>,
    pub model: Option<String>,
    pub provider: Option<crate::modules::providers::LlmProviderType>,
}

const SUMMARY_MAX_TOKENS: u32 = 700;

/// Messages after the current summary up to `up_to`, split into chunks of about `chunk_tokens`.
fn chunks(
    messages: &[StoredChatMessage],
    after: i64,
    up_to: i64,
    chunk_tokens: usize,
) -> Vec<Vec<&StoredChatMessage>> {
    let mut chunks: Vec<Vec<&StoredChatMessage>> = Vec::new();
    let mut size = 0usize;
    for m in messages.iter().filter(|m| {
        let i = i64::from(m.order_index);
        i > after && i <= up_to && m.role != "system"
    }) {
        let tokens = estimate_tokens(&m.content);
        match chunks.last_mut() {
            Some(chunk) if size + tokens <= chunk_tokens => chunk.push(m),
            _ => {
                chunks.push(vec![m]);
                size = 0;
            }
        }
        size += tokens;
    }
    chunks
}

fn transcript(chunk: &[&StoredChatMessage], char_name: &str, user_name: &str) -> String {
    chunk
        .iter()
        .map(|m| {
            let speaker = if m.role == "user" {
                user_name
            } else {
                char_name
            };
            format!("{speaker}: {}", m.content.trim())
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn instructions(req: &ChatSummaryRequest) -> String {
    format!(
        "You keep the running summary of a roleplay chat between {char} and {user}. Fold the new \
         messages into the existing summary. Keep what matters for continuing the story: events in \
         order, decisions, promises, secrets, changes in the relationship, names, places, items and \
         open threads. Drop small talk and wording. Write in {lang}, in the third person and past \
         tense, at most about 250 words. Reply with the updated summary only, no heading or comment.",
        char = req.char_name,
        user = req.user_name,
        lang = req.reply_language,
    )
}

/// Folds the messages after `session.summary_until` up to `req.up_to_index` into the summary and
/// stores the progress after every chunk, so a failed call keeps what was already done.
pub async fn summarize(
    db: &MemoryDb,
    client: &InferenceClient,
    req: ChatSummaryRequest,
) -> Result<ChatSession, String> {
    let load = || {
        db.get_chat_session(&req.chat_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| crate::err!("backend.chat.notFound"))
    };
    let session = load()?;
    let messages = db
        .get_chat_messages(&req.chat_id)
        .map_err(|e| e.to_string())?;
    let chunk_tokens = ((req.context_tokens / 2) as usize).max(1_024);
    let mut summary = session.summary.clone();
    for chunk in chunks(
        &messages,
        session.summary_until,
        req.up_to_index,
        chunk_tokens,
    ) {
        let Some(last) = chunk.last().map(|m| i64::from(m.order_index)) else {
            continue;
        };
        let current = if summary.trim().is_empty() {
            "(none yet)".to_string()
        } else {
            summary.clone()
        };
        let request = ChatRequest {
            endpoint_url: req.endpoint_url.clone(),
            api_key: req.api_key.clone(),
            model: req.model.clone(),
            messages: vec![
                ChatMessage {
                    role: "system".into(),
                    content: instructions(&req),
                    attachments: Vec::new(),
                },
                ChatMessage {
                    role: "user".into(),
                    content: format!(
                        "Current summary:\n{current}\n\nNew messages:\n{}",
                        transcript(&chunk, &req.char_name, &req.user_name)
                    ),
                    attachments: Vec::new(),
                },
            ],
            sampling: Some(SamplingParams {
                temperature: Some(0.3),
                max_tokens: Some(SUMMARY_MAX_TOKENS),
                ..SamplingParams::default()
            }),
            reasoning_mode: Some(false),
            provider: req.provider.clone(),
        };
        let updated = client.generate_direct(request).await?;
        let updated = updated.trim();
        if updated.is_empty() {
            return Err(crate::err!("backend.chat.summaryEmpty"));
        }
        summary = updated.to_string();
        db.update_chat_summary(&req.chat_id, &summary, last)
            .map_err(|e| e.to_string())?;
    }
    load()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stored(index: i32, role: &str, content: &str) -> StoredChatMessage {
        StoredChatMessage {
            id: format!("m{index}"),
            chat_id: "c".into(),
            role: role.into(),
            content: content.into(),
            thought: None,
            order_index: index,
            swipe_index: 0,
            swipes: Vec::new(),
            created_at: 0,
            attachments: Vec::new(),
        }
    }

    #[test]
    fn chunks_only_the_new_messages() {
        let messages: Vec<_> = (0..10)
            .map(|i| {
                stored(
                    i,
                    if i % 2 == 0 { "user" } else { "assistant" },
                    &"x".repeat(30),
                )
            })
            .collect();
        // 10 tokens each; summary covers 0..=2, summarize up to 7 → 3..=7 in chunks of 2.
        let parts = chunks(&messages, 2, 7, 20);
        let indices: Vec<Vec<i32>> = parts
            .iter()
            .map(|c| c.iter().map(|m| m.order_index).collect())
            .collect();
        assert_eq!(indices, vec![vec![3, 4], vec![5, 6], vec![7]]);
    }

    /// Against a running llama-server: `OTAKUSOUL_LLAMA_URL=http://127.0.0.1:48777 cargo test
    /// --lib chat_summary -- --ignored --nocapture`.
    #[tokio::test]
    #[ignore]
    async fn summarizes_a_chat_with_a_real_model() {
        let base = std::env::var("OTAKUSOUL_LLAMA_URL").expect("OTAKUSOUL_LLAMA_URL");
        let db = MemoryDb::new_in_memory().unwrap();
        let session = db.create_chat_session("aiko", "Test").unwrap();
        let lines = [
            ("user", "Hallo Aiko! Ich bin Kai, neu in Kyoto."),
            (
                "assistant",
                "*verbeugt sich* Willkommen, Kai! Ich zeige dir gern den Fushimi-Inari-Schrein.",
            ),
            ("user", "Gern, morgen um zehn am Bahnhof?"),
            (
                "assistant",
                "Abgemacht! *lächelt* Bring bequeme Schuhe mit, es sind viele Stufen.",
            ),
            (
                "user",
                "Am Schrein: Wow, die vielen roten Tore! Was ist das für ein Fuchs?",
            ),
            (
                "assistant",
                "Die Füchse sind Boten der Göttin Inari. *reicht dir ein kleines Fuchs-Amulett* Das ist für dich.",
            ),
            ("user", "Danke! Ich verspreche, es immer bei mir zu tragen."),
            (
                "assistant",
                "*errötet* Dann pass gut darauf auf. Ach, und erzähl niemandem, dass ich Angst vor Gewittern habe.",
            ),
            ("user", "Dein Geheimnis ist bei mir sicher."),
            (
                "assistant",
                "Nächsten Samstag ist das Gion-Fest. Kommst du mit?",
            ),
        ];
        for (role, text) in lines {
            db.add_chat_message(&session.id, role, text, None, &[])
                .unwrap();
        }
        let client = InferenceClient::new();
        let request = |up_to: i64| ChatSummaryRequest {
            chat_id: session.id.clone(),
            up_to_index: up_to,
            char_name: "Aiko".into(),
            user_name: "Kai".into(),
            reply_language: "Deutsch".into(),
            // Small window → several chunks.
            context_tokens: 2_048,
            endpoint_url: format!("{base}/v1/chat/completions"),
            api_key: None,
            model: None,
            provider: Some(crate::modules::providers::LlmProviderType::LocalLlama),
        };
        let first = summarize(&db, &client, request(5)).await.unwrap();
        println!("--- bis 5 ---\n{}", first.summary);
        assert_eq!(first.summary_until, 5);
        let second = summarize(&db, &client, request(9)).await.unwrap();
        println!("--- bis 9 ---\n{}", second.summary);
        assert_eq!(second.summary_until, 9);
        assert!(second.summary.contains("Inari") || second.summary.contains("Amulett"));
    }

    #[test]
    fn names_the_speakers() {
        let a = stored(0, "user", "Hallo");
        let b = stored(1, "assistant", "*lächelt* Hi!");
        assert_eq!(
            transcript(&[&a, &b], "Aiko", "Kai"),
            "Kai: Hallo\n\nAiko: *lächelt* Hi!"
        );
    }
}
