//! Textanfragen des nativen Testchats für OpenAI-kompatible und Anthropic-Endpunkte.

use crate::{connection::Format, profile::StoredMessage};
use otakusoul_prompt::AssembledPrompt;
use serde_json::{Value, json};

const MAX_REPLY_TOKENS: u32 = 1024;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Role {
    User,
    Assistant,
}

impl Role {
    fn as_str(self) -> &'static str {
        match self {
            Self::User => "user",
            Self::Assistant => "assistant",
        }
    }
}

#[derive(Clone)]
struct Turn {
    role: Role,
    text: String,
}

pub struct Request {
    system: String,
    post_history: Option<String>,
    turns: Vec<Turn>,
}

impl Request {
    pub fn new(
        prompt: &AssembledPrompt,
        greeting: Option<&str>,
        messages: &[StoredMessage],
        draft: &str,
    ) -> Self {
        let mut turns = Vec::with_capacity(messages.len() + 2);
        if let Some(text) = greeting.filter(|text| !text.trim().is_empty()) {
            turns.push(Turn {
                role: Role::Assistant,
                text: text.into(),
            });
        }
        turns.extend(messages.iter().filter_map(|message| {
            let role = match message.role.as_str() {
                "user" => Role::User,
                "assistant" => Role::Assistant,
                _ => return None,
            };
            (!message.content.trim().is_empty()).then(|| Turn {
                role,
                text: message.content.clone(),
            })
        }));
        turns.push(Turn {
            role: Role::User,
            text: draft.trim().into(),
        });
        Self {
            system: prompt.system.clone(),
            post_history: prompt
                .post_history
                .clone()
                .filter(|text| !text.trim().is_empty()),
            turns,
        }
    }

    pub fn body(&self, format: Format, model: &str) -> Value {
        let mut body = json!({"max_tokens": MAX_REPLY_TOKENS, "stream": true});
        if !model.trim().is_empty() {
            body["model"] = model.trim().into();
        }
        match format {
            Format::OpenAi => body["messages"] = self.openai_messages().into(),
            Format::Anthropic => {
                body["messages"] = self.anthropic_messages().into();
                let system = [Some(self.system.as_str()), self.post_history.as_deref()]
                    .into_iter()
                    .flatten()
                    .filter(|text| !text.is_empty())
                    .collect::<Vec<_>>()
                    .join("\n\n");
                if !system.is_empty() {
                    body["system"] = system.into();
                }
            }
        }
        body
    }

    fn openai_messages(&self) -> Vec<Value> {
        // Wie Tauris LocalLlama/Custom-Adapter: System nur am Anfang, Nachspann
        // am Ende der letzten User-Nachricht. Viele lokale Chat-Templates erwarten das.
        let mut messages = Vec::new();
        if !self.system.is_empty() {
            messages.push(json!({"role": "system", "content": self.system}));
        }
        let mut turns: Vec<Turn> = Vec::with_capacity(self.turns.len());
        for turn in &self.turns {
            match turns.last_mut() {
                Some(last) if turn.role == Role::User && last.role == Role::User => {
                    append_text(&mut last.text, &turn.text);
                }
                _ => turns.push(turn.clone()),
            }
        }
        if let Some(post_history) = &self.post_history
            && let Some(last) = turns.last_mut()
        {
            append_text(&mut last.text, post_history);
        }
        messages.extend(
            turns
                .into_iter()
                .map(|turn| json!({"role": turn.role.as_str(), "content": turn.text})),
        );
        messages
    }

    fn anthropic_messages(&self) -> Vec<Value> {
        // Wie Tauris Anthropic-Adapter: User zuerst und gleichartige Nachrichten
        // als getrennte Textblöcke in einem Turn.
        let mut turns: Vec<(Role, Vec<Value>)> = Vec::new();
        if self
            .turns
            .first()
            .is_some_and(|turn| turn.role == Role::Assistant)
        {
            turns.push((Role::User, vec![text_block("Hallo.")]));
        }
        for turn in &self.turns {
            let block = text_block(&turn.text);
            match turns.last_mut() {
                Some((role, blocks)) if *role == turn.role => blocks.push(block),
                _ => turns.push((turn.role, vec![block])),
            }
        }
        turns
            .into_iter()
            .map(|(role, blocks)| json!({"role": role.as_str(), "content": blocks}))
            .collect()
    }
}

fn append_text(target: &mut String, text: &str) {
    if !text.is_empty() {
        if !target.is_empty() {
            target.push_str("\n\n");
        }
        target.push_str(text);
    }
}

fn text_block(text: &str) -> Value {
    json!({"type": "text", "text": if text.is_empty() { "..." } else { text }})
}

#[cfg(test)]
mod tests {
    use super::*;

    fn prompt() -> AssembledPrompt {
        AssembledPrompt {
            system: "Rollenbeschreibung".into(),
            post_history: Some("Nachspann".into()),
        }
    }

    fn message(role: &str, content: &str) -> StoredMessage {
        StoredMessage {
            role: role.into(),
            content: content.into(),
        }
    }

    #[test]
    fn openai_preserves_order_and_adapts_post_history_to_local_templates() {
        let history = [
            message("user", "Ältere Frage"),
            message("assistant", "Ältere Antwort"),
            message("system", "Kein erlaubter Verlaufseintrag"),
            message("user", "Vorherige Frage"),
        ];
        let body = Request::new(&prompt(), Some("Begrüßung"), &history, " Neue Frage ")
            .body(Format::OpenAi, "");
        assert_eq!(
            body,
            json!({
                "max_tokens": 1024,
                "stream": true,
                "messages": [
                    {"role": "system", "content": "Rollenbeschreibung"},
                    {"role": "assistant", "content": "Begrüßung"},
                    {"role": "user", "content": "Ältere Frage"},
                    {"role": "assistant", "content": "Ältere Antwort"},
                    {"role": "user", "content": "Vorherige Frage\n\nNeue Frage\n\nNachspann"},
                ]
            })
        );
    }

    #[test]
    fn anthropic_keeps_greeting_and_instructions_with_compatible_roles() {
        let history = [message("user", "Vorherige Frage")];
        let body = Request::new(&prompt(), Some("Begrüßung"), &history, "Neue Frage")
            .body(Format::Anthropic, " Testmodell ");
        assert_eq!(
            body,
            json!({
                "max_tokens": 1024,
                "model": "Testmodell",
                "stream": true,
                "system": "Rollenbeschreibung\n\nNachspann",
                "messages": [
                    {"role": "user", "content": [{"type": "text", "text": "Hallo."}]},
                    {"role": "assistant", "content": [{"type": "text", "text": "Begrüßung"}]},
                    {"role": "user", "content": [
                        {"type": "text", "text": "Vorherige Frage"},
                        {"type": "text", "text": "Neue Frage"},
                    ]},
                ]
            })
        );
    }
}
