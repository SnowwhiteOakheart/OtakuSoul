//! Reply ideas for the user ("What could I say?"): the chat model suggests a few short next
//! messages in the user's voice, based on the end of the chat. Nothing is stored; the user picks
//! one into the composer and edits it before sending.

use crate::modules::inference::{ChatMessage, ChatRequest, InferenceClient, SamplingParams};
use crate::modules::memory::StoredChatMessage;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// How many ideas the model is asked for (and at most returned).
pub const IDEA_COUNT: usize = 3;
/// Messages from the end of the chat the model sees.
const RECENT_MESSAGES: usize = 12;
/// Longer messages are cut to this many characters (the end matters less than the gist).
const MESSAGE_CHARS: usize = 1200;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ReplyIdeasRequest {
    pub chat_id: String,
    pub char_name: String,
    pub user_name: String,
    /// The persona's description (may be empty).
    pub user_description: String,
    /// Language name as written into the prompt, e.g. "Deutsch".
    pub language: String,
    pub endpoint_url: String,
    pub api_key: Option<String>,
    pub model: Option<String>,
    pub provider: Option<crate::modules::providers::LlmProviderType>,
}

fn instructions(req: &ReplyIdeasRequest) -> String {
    let (user, char) = (&req.user_name, &req.char_name);
    let mut text = format!(
        "[CHAT — REPLY IDEAS]\nYou help {user} decide what to write next in a roleplay chat with {char}.\n\
         Suggest exactly {IDEA_COUNT} different next messages that {user} could send, written by {user} \
         in the first person and in {lang}. Keep each to one or two short sentences and match the chat's \
         style: actions in *asterisks*, speech in quotation marks.\n\
         Make them clearly different: one natural reaction, one that asks or digs deeper, and one bolder \
         idea that moves the story forward.\n\
         Never write {char}'s lines or decide what {char} does.\n\
         Reply with a JSON array of {IDEA_COUNT} strings and nothing else.",
        lang = req.language,
    );
    if !req.user_description.trim().is_empty() {
        text.push_str(&format!(
            "\n\nAbout {user}: {}",
            req.user_description.trim()
        ));
    }
    text
}

fn shorten(text: &str) -> String {
    let text = text.trim();
    match text.char_indices().nth(MESSAGE_CHARS) {
        Some((end, _)) => format!("{}…", &text[..end]),
        None => text.to_string(),
    }
}

/// The end of the chat as a transcript with names (system notes and empty messages left out).
fn transcript(messages: &[StoredChatMessage], req: &ReplyIdeasRequest) -> String {
    let lines: Vec<String> = messages
        .iter()
        .filter(|m| (m.role == "user" || m.role == "assistant") && !m.content.trim().is_empty())
        .rev()
        .take(RECENT_MESSAGES)
        .map(|m| {
            let name = if m.role == "user" {
                &req.user_name
            } else {
                &req.char_name
            };
            format!("{name}: {}", shorten(&m.content))
        })
        .collect();
    let mut lines = lines;
    lines.reverse();
    if lines.is_empty() {
        format!(
            "(The chat has not started yet. Suggest ways for {} to open it.)",
            req.user_name
        )
    } else {
        format!("Conversation so far:\n{}", lines.join("\n\n"))
    }
}

/// Removes list markers ("1.", "2)", "- ", "• ") from a line; a leading `*` stays (an action).
fn strip_marker(line: &str) -> &str {
    let line = line.trim();
    let digits = line.chars().take_while(char::is_ascii_digit).count();
    if digits > 0
        && let Some(rest) = line[digits..].strip_prefix(['.', ')', ':'])
    {
        return rest.trim();
    }
    line.strip_prefix("- ")
        .or_else(|| line.strip_prefix("• "))
        .unwrap_or(line)
        .trim()
}

/// The ideas from the model's answer: a JSON array, or else one idea per line. Empty and
/// repeated ideas are dropped; at most `IDEA_COUNT` remain.
pub fn parse_ideas(text: &str) -> Vec<String> {
    let from_json = text
        .find('[')
        .zip(text.rfind(']'))
        .filter(|(start, end)| start < end)
        .and_then(|(start, end)| serde_json::from_str::<Vec<String>>(&text[start..=end]).ok());
    let candidates = from_json.unwrap_or_else(|| {
        text.lines()
            .map(strip_marker)
            .filter(|line| !line.starts_with("```"))
            .map(str::to_string)
            .collect()
    });
    let mut ideas: Vec<String> = Vec::new();
    for idea in candidates.iter().map(|idea| idea.trim()) {
        if !idea.is_empty() && !ideas.iter().any(|known| known == idea) {
            ideas.push(idea.to_string());
        }
    }
    ideas.truncate(IDEA_COUNT);
    ideas
}

pub async fn suggest(
    client: &InferenceClient,
    messages: &[StoredChatMessage],
    req: ReplyIdeasRequest,
) -> Result<Vec<String>, String> {
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
                content: transcript(messages, &req),
                attachments: Vec::new(),
            },
        ],
        sampling: Some(SamplingParams {
            temperature: Some(0.9),
            max_tokens: Some(400),
            ..SamplingParams::default()
        }),
        reasoning_mode: Some(false),
        provider: req.provider.clone(),
    };
    let answer = match tokio::time::timeout(
        std::time::Duration::from_secs(120),
        client.generate_direct(request),
    )
    .await
    {
        Ok(result) => result?,
        Err(_) => return Err(crate::err!("backend.llm.timeout", seconds = 120)),
    };
    let ideas = parse_ideas(&answer);
    if ideas.is_empty() {
        return Err(crate::err!("backend.chat.noReplyIdeas"));
    }
    Ok(ideas)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_json_array_even_with_text_around_it() {
        let answer = "Here you go:\n```json\n[\"*nickt* \\\"Gern.\\\"\", \"Warum?\", \"Warum?\", \" \", \"Los!\", \"Mehr\"]\n```";
        assert_eq!(parse_ideas(answer), ["*nickt* \"Gern.\"", "Warum?", "Los!"]);
    }

    #[test]
    fn falls_back_to_one_idea_per_line() {
        let answer = "1. \"Hallo!\"\n2) *winkt*\n- Wie geht's?\n\n• Komm mit.";
        assert_eq!(
            parse_ideas(answer),
            ["\"Hallo!\"", "*winkt*", "Wie geht's?"]
        );
    }

    fn request() -> ReplyIdeasRequest {
        ReplyIdeasRequest {
            chat_id: "c".into(),
            char_name: "Ayu".into(),
            user_name: "Kai".into(),
            user_description: "Ein Reisender.".into(),
            language: "Deutsch".into(),
            endpoint_url: String::new(),
            api_key: None,
            model: None,
            provider: None,
        }
    }

    fn message(role: &str, content: &str) -> StoredChatMessage {
        StoredChatMessage {
            id: String::new(),
            chat_id: "c".into(),
            role: role.into(),
            content: content.into(),
            thought: None,
            order_index: 0,
            swipe_index: 0,
            swipes: Vec::new(),
            created_at: 0,
            attachments: Vec::new(),
        }
    }

    #[test]
    fn transcript_names_speakers_and_keeps_only_the_end() {
        let mut messages = vec![message("system", "intern")];
        messages.extend((0..20).map(|i| {
            message(
                if i % 2 == 0 { "assistant" } else { "user" },
                &format!("Nachricht {i}"),
            )
        }));
        let text = transcript(&messages, &request());
        assert!(text.starts_with("Conversation so far:\nAyu: Nachricht 8"));
        assert!(text.ends_with("Kai: Nachricht 19"));
        assert!(!text.contains("intern"));
        assert!(instructions(&request()).contains("About Kai: Ein Reisender."));
        assert!(transcript(&[], &request()).contains("open it"));
    }
}
