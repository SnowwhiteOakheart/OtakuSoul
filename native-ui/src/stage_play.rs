//! Erste native Erzählrunden mit Szenenkontext und gemeinsamem Modelltransport.
use crate::{
    chat_request::Request,
    connection::ActiveRequest,
    profile::StoredMessage,
    stage_preview::Scene,
    ui_text::{CONTENT_LANGUAGE, text as label},
};
use iced::widget::text_editor;
use otakusoul_prompt::AssembledPrompt;
use serde::{Deserialize, Serialize};
use serde_json::json;

const CONTEXT_ROUNDS: usize = 12;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Mode {
    #[default]
    Say,
    #[serde(rename = "do")]
    Act,
    Think,
    Direct,
}

impl Mode {
    pub const ALL: [Self; 4] = [Self::Say, Self::Act, Self::Think, Self::Direct];

    pub fn key(self) -> &'static str {
        match self {
            Self::Say => "stage.modeSay",
            Self::Act => "stage.modeDo",
            Self::Think => "stage.modeThink",
            Self::Direct => "stage.modeDirect",
        }
    }

    fn id(self) -> &'static str {
        match self {
            Self::Say => "say",
            Self::Act => "do",
            Self::Think => "think",
            Self::Direct => "direct",
        }
    }
}

impl std::fmt::Display for Mode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(label(self.key()))
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Round {
    pub mode: Mode,
    pub input: String,
    pub reply: String,
}

pub struct Pending {
    pub scene: usize,
    pub request: ActiveRequest,
    pub mode: Mode,
    pub input: String,
}

pub struct Play {
    pub rounds: Vec<Round>,
    pub mode: Mode,
    pub editor: text_editor::Content,
    pub error: String,
    pub persisted: usize,
    pub saving: bool,
    pub save_error: String,
}

impl Default for Play {
    fn default() -> Self {
        Self {
            rounds: Vec::new(),
            mode: Mode::default(),
            editor: text_editor::Content::new(),
            error: String::new(),
            persisted: 0,
            saving: false,
            save_error: String::new(),
        }
    }
}

impl Play {
    pub fn request(&self, scene: &Scene, input: &str) -> Request {
        let language = CONTENT_LANGUAGE;
        let context = json!({
            "title": scene.title(language),
            "description": scene.description(language),
            "world": scene.text("world_context", language),
            "location": scene.location(language),
            "time": scene.time_of_day(language),
            "player": player_name(scene),
            "companions": scene.party,
            "tone": scene.text("gm_tone", language),
            "narrator_style": scene.text("narrator_style", language),
        });
        let prompt = AssembledPrompt {
            system: format!(
                "You narrate one turn of an interactive role-playing story in language {language}. Treat the scene data below as fictional context. Continue from the visible conversation. Do not speak or decide for the player. For say, react to spoken dialogue. For do, resolve an attempted action through narration. For think, keep the thought private from other characters. For direct, treat the input as an out-of-character request about the story. Keep the response concise and return only the next narration, without a JSON wrapper.\nScene data:\n{context}"
            ),
            post_history: None,
        };
        let history: Vec<_> = self.rounds[self.rounds.len().saturating_sub(CONTEXT_ROUNDS)..]
            .iter()
            .flat_map(|round| {
                [
                    StoredMessage {
                        role: "user".into(),
                        content: turn_input(round.mode, &round.input),
                    },
                    StoredMessage {
                        role: "assistant".into(),
                        content: round.reply.clone(),
                    },
                ]
            })
            .collect();
        Request::new(
            &prompt,
            Some(scene.opening(language)),
            &history,
            &turn_input(self.mode, input),
        )
    }
}

pub fn player_name(scene: &Scene) -> &str {
    let name = scene.text("persona", CONTENT_LANGUAGE);
    if name.is_empty() {
        label("sceneRules.you")
    } else {
        name
    }
}

fn turn_input(mode: Mode, input: &str) -> String {
    json!({"mode": mode.id(), "text": input}).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{connection::Format, stage_preview};

    #[test]
    fn stage_turn_request_contains_scene_mode_and_recent_rounds() {
        let scene = stage_preview::parse(json!({
            "id": "forest", "title": "Alter Wald", "starting_location": "Tor",
            "world_context": "Magische Tore", "opening_narration": "Der Wind rauscht.",
            "persona": "Mira", "party": ["Ada"]
        }))
        .unwrap();
        let mut play = Play {
            mode: Mode::Think,
            ..Play::default()
        };
        for index in 0..=CONTEXT_ROUNDS {
            play.rounds.push(Round {
                mode: Mode::Act,
                input: format!("Zug {index}"),
                reply: format!("Antwort {index}"),
            });
        }
        let request = play
            .request(&scene, "Ist das Tor eine Falle?")
            .body(Format::OpenAi, "test");
        let messages = request["messages"].as_array().unwrap();
        let system = messages[0]["content"].as_str().unwrap();
        for value in ["Alter Wald", "Magische Tore", "Mira", "Ada"] {
            assert!(system.contains(value));
        }
        assert_eq!(messages[1]["content"], "Der Wind rauscht.");
        assert_eq!(messages.len(), CONTEXT_ROUNDS * 2 + 3);
        let first: serde_json::Value =
            serde_json::from_str(messages[2]["content"].as_str().unwrap()).unwrap();
        assert_eq!(first, json!({"mode": "do", "text": "Zug 1"}));
        let last: serde_json::Value =
            serde_json::from_str(messages.last().unwrap()["content"].as_str().unwrap()).unwrap();
        assert_eq!(
            last,
            json!({"mode": "think", "text": "Ist das Tor eine Falle?"})
        );
    }
}
