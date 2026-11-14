//! A short remark of the desktop pet about something that just happened to it (thrown, landed,
//! woken up, sat down). One bounded request to the chat model without streaming; nothing is
//! stored and nothing goes into the chat. The pet decides when to ask (switch on, pause between
//! two remarks); this only builds the prompt and cleans the answer.

use crate::modules::inference::InferenceClient;
use crate::modules::reply_ideas::{ReplyIdeasRequest, ask};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Longest remark kept (characters); a speech bubble holds one line.
const REMARK_CHARS: usize = 160;
/// The character's description is cut to this many characters in the prompt.
const DESCRIPTION_CHARS: usize = 600;

/// What happened to the pet.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum PetEvent {
    Thrown,
    Landed,
    Woke,
    Sat,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PetRemarkRequest {
    pub event: PetEvent,
    pub char_name: String,
    /// The character's description (may be empty).
    pub char_description: String,
    pub user_name: String,
    /// Language name as written into the prompt, e.g. "Deutsch".
    pub language: String,
    pub endpoint_url: String,
    pub api_key: Option<String>,
    pub model: Option<String>,
    pub provider: Option<crate::modules::providers::LlmProviderType>,
}

fn what_happened(event: PetEvent, user: &str) -> String {
    match event {
        PetEvent::Thrown => format!("{user} just grabbed you and flung you across the screen"),
        PetEvent::Landed => "you just landed on the floor after a fall".to_string(),
        PetEvent::Woke => format!("you were dozing and {user} came back and woke you up"),
        PetEvent::Sat => "you just sat down on the edge of a window".to_string(),
    }
}

fn instructions(req: &PetRemarkRequest) -> String {
    let (char, user) = (&req.char_name, &req.user_name);
    let mut text = format!(
        "[DESKTOP PET — REMARK]\nYou are {char}, living as a small pet on {user}'s desktop. \
         Right now {what}.\nSay exactly one short line (at most 12 words) in {lang} reacting to that, \
         in character. No quotation marks, no stage directions, no explanations, nothing else.",
        what = what_happened(req.event, user),
        lang = req.language,
    );
    let description: String = req
        .char_description
        .trim()
        .chars()
        .take(DESCRIPTION_CHARS)
        .collect();
    if !description.is_empty() {
        text.push_str(&format!("\nAbout {char}: {description}"));
    }
    text
}

/// The first non-empty line, without quotes or asterisk actions around it, cut to one bubble.
pub fn clean_remark(answer: &str) -> String {
    let line = answer
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or("");
    let line =
        line.trim_matches(|c: char| matches!(c, '"' | '\'' | '“' | '”' | '„' | '«' | '»' | '*'));
    let line = line.trim();
    if line.chars().count() <= REMARK_CHARS {
        return line.to_string();
    }
    let cut: String = line.chars().take(REMARK_CHARS).collect();
    format!("{}…", cut.trim_end())
}

pub async fn remark(client: &InferenceClient, req: PetRemarkRequest) -> Result<String, String> {
    let system = instructions(&req);
    let shell = ReplyIdeasRequest {
        chat_id: String::new(),
        char_name: req.char_name.clone(),
        user_name: req.user_name.clone(),
        user_description: String::new(),
        language: req.language.clone(),
        notes: String::new(),
        endpoint_url: req.endpoint_url.clone(),
        api_key: req.api_key.clone(),
        model: req.model.clone(),
        provider: req.provider.clone(),
    };
    let answer = ask(client, &shell, system, "React now.".to_string(), 0.9, 60).await?;
    let text = clean_remark(&answer);
    if text.is_empty() {
        return Err(crate::err!("backend.chat.noReplyDraft"));
    }
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(event: PetEvent) -> PetRemarkRequest {
        PetRemarkRequest {
            event,
            char_name: "Ayu".into(),
            char_description: "Schüchtern.".into(),
            user_name: "Kai".into(),
            language: "Deutsch".into(),
            endpoint_url: String::new(),
            api_key: None,
            model: None,
            provider: None,
        }
    }

    #[test]
    fn the_prompt_names_the_event_and_the_character() {
        let text = instructions(&request(PetEvent::Thrown));
        assert!(text.contains("Kai just grabbed you"));
        assert!(text.contains("in Deutsch"));
        assert!(text.contains("About Ayu: Schüchtern."));
        assert!(instructions(&request(PetEvent::Woke)).contains("woke you up"));
    }

    #[test]
    fn cleaning_keeps_one_plain_line() {
        assert_eq!(clean_remark("\n„Huch!“\nZweite Zeile"), "Huch!");
        assert_eq!(clean_remark("*schüttelt sich*"), "schüttelt sich");
        assert_eq!(clean_remark("   "), "");
        let long = "wort ".repeat(60);
        let cut = clean_remark(&long);
        assert!(cut.chars().count() <= REMARK_CHARS + 1 && cut.ends_with('…'));
    }
}
