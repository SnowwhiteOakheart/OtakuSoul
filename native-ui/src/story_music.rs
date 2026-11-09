//! Musikbeschreibungen für ACE-Step im gemeinsamen Tauri-Szenenformat.
use crate::{
    chat_request::Request,
    stage_preview::Scene,
    ui_text::{CONTENT_LANGUAGE, text as label},
};
use otakusoul_prompt::AssembledPrompt;
use serde_json::{Value, json};
use std::{collections::BTreeMap, sync::LazyLock};

pub const MOODS: [(&str, &str); 9] = [
    ("calm", "stageMusic.mood.calm"),
    ("tavern", "stageMusic.mood.tavern"),
    ("adventure", "stageMusic.mood.adventure"),
    ("tension", "stageMusic.mood.tension"),
    ("mystery", "stageMusic.mood.mystery"),
    ("combat", "stageMusic.mood.combat"),
    ("boss", "stageMusic.mood.boss"),
    ("romance", "stageMusic.mood.romance"),
    ("sorrow", "stageMusic.mood.sorrow"),
];
const VOCAL_MOODS: [&str; 4] = ["calm", "mystery", "romance", "sorrow"];
const VOCALS: &str = "[Intro]\n[Verse]\nooh, aah\nooh, aah\n[Outro]";
static DEFAULTS: LazyLock<Value> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../presets/story_music_defaults.json"))
        .expect("Mitgelieferte Musikvorlagen")
});

#[derive(Debug, Clone)]
pub enum Edit {
    Enabled(bool),
    Style(String),
    Mood(&'static str, bool),
    Caption(&'static str, String),
    Vocals(bool),
    Reset,
}

pub struct Music {
    pub enabled: bool,
    pub style: String,
    pub captions: BTreeMap<String, String>,
    pub vocals: bool,
}

impl Music {
    pub fn for_genre(genre: &str, enabled: bool) -> Self {
        let defaults = &DEFAULTS[genre];
        Self {
            enabled,
            style: defaults["style"].as_str().unwrap_or_default().into(),
            captions: MOODS
                .into_iter()
                .filter_map(|(mood, _)| {
                    defaults["moods"][mood]
                        .as_str()
                        .map(|caption| (mood.into(), caption.into()))
                })
                .collect(),
            vocals: false,
        }
    }

    pub fn edit(&mut self, edit: Edit, genre: &str) {
        match edit {
            Edit::Enabled(enabled) => self.enabled = enabled,
            Edit::Style(style) => self.style = style,
            Edit::Mood(mood, true) => {
                self.captions.entry(mood.into()).or_insert_with(|| {
                    DEFAULTS[genre]["moods"][mood]
                        .as_str()
                        .unwrap_or_default()
                        .into()
                });
            }
            Edit::Mood(mood, false) => {
                self.captions.remove(mood);
            }
            Edit::Caption(mood, value) => {
                if let Some(caption) = self.captions.get_mut(mood) {
                    *caption = value;
                }
            }
            Edit::Vocals(enabled) => self.vocals = enabled,
            Edit::Reset => *self = Self::for_genre(genre, self.enabled),
        }
    }

    pub fn section(&self, id: &str) -> Option<Value> {
        if !self.enabled {
            return None;
        }
        let moods: serde_json::Map<String, Value> = MOODS
            .into_iter()
            .filter_map(|(mood, _)| {
                let caption = self.captions.get(mood)?.trim();
                if caption.is_empty() {
                    return None;
                }
                let entry = if self.vocals && VOCAL_MOODS.contains(&mood) {
                    json!({
                        "caption": format!("{caption}, soft wordless vocals far in the background"),
                        "lyrics": VOCALS, "vocal_language": "en"
                    })
                } else {
                    json!({"caption": caption})
                };
                Some((mood.into(), entry))
            })
            .collect();
        (!moods.is_empty()).then(|| json!({"set": id, "style": self.style.trim(), "moods": moods}))
    }

    pub fn requested_moods(&self, genre: &str) -> Vec<&'static str> {
        MOODS
            .into_iter()
            .filter_map(|(mood, _)| {
                let requested = if self.captions.is_empty() {
                    DEFAULTS[genre]["moods"][mood].is_string()
                } else {
                    self.captions.contains_key(mood)
                };
                requested.then_some(mood)
            })
            .collect()
    }

    pub fn apply_suggestion(&mut self, genre: &str, suggestion: Suggestion) -> Result<(), String> {
        let updates: Vec<_> = self
            .requested_moods(genre)
            .into_iter()
            .filter_map(|mood| suggestion.captions.get(mood).map(|caption| (mood, caption)))
            .collect();
        if updates.is_empty() {
            return Err(label("storyWizard.music.unusable").into());
        }
        if !suggestion.style.is_empty() {
            self.style = suggestion.style;
        }
        for (mood, caption) in updates {
            self.captions.insert(mood.into(), caption.clone());
        }
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct Suggestion {
    style: String,
    captions: BTreeMap<String, String>,
}

pub fn request(scene: &Scene, genre: &str, moods: &[&str]) -> Request {
    let prompt = AssembledPrompt {
        system: format!(
            "Write English background music prompts for ACE-Step. Return one JSON object only, with a string \"style\" (at most 15 words) and a \"moods\" object mapping mood IDs to captions (at most 25 words each). Include instruments, atmosphere and tempo. Instrumental only, without artist or song names. Use exactly these moods: {}.",
            moods.join(", ")
        ),
        post_history: None,
    };
    let context = format!(
        "Genre: {}\nTitle: {}\nPlace: {}\nSituation: {}\nCharacters: {}",
        genre.replace('_', " "),
        scene.title(CONTENT_LANGUAGE),
        scene.location(CONTENT_LANGUAGE),
        scene.description(CONTENT_LANGUAGE),
        scene.party.join(", "),
    );
    Request::new(&prompt, None, &[], &context)
}

pub fn parse_suggestion(answer: &str) -> Result<Suggestion, String> {
    let invalid = || label("storyWizard.music.unusable").to_owned();
    let start = answer.find('{').ok_or_else(invalid)?;
    let body = serde_json::Deserializer::from_str(&answer[start..])
        .into_iter::<Value>()
        .next()
        .and_then(Result::ok)
        .ok_or_else(invalid)?;
    let clean = |value: &Value| {
        value
            .as_str()
            .unwrap_or_default()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .chars()
            .take(300)
            .collect::<String>()
    };
    let mut captions = BTreeMap::new();
    if let Some(moods) = body["moods"].as_object() {
        for (mood, value) in moods {
            let key = mood.trim().to_ascii_lowercase();
            let caption = clean(value);
            if !caption.is_empty() && MOODS.iter().any(|(mood, _)| *mood == key) {
                captions.insert(key, caption);
            }
        }
    }
    if captions.is_empty() {
        return Err(invalid());
    }
    Ok(Suggestion {
        style: clean(&body["style"]),
        captions,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn story_music_defaults_and_vocals_use_the_stage_scene_schema() {
        for genre in crate::story_wizard::GENRES {
            let mut music = Music::for_genre(crate::story_wizard::genre_id(genre), true);
            assert!(!music.style.is_empty());
            assert!(music.captions.len() >= 4);
            music.edit(Edit::Vocals(true), "fantasy");
            let section = music.section("story").unwrap();
            assert_eq!(section["set"], "story");
            assert_eq!(section["moods"]["calm"]["lyrics"], VOCALS);
            assert!(
                section["moods"]["calm"]["caption"]
                    .as_str()
                    .unwrap()
                    .ends_with("background")
            );
            assert!(section["moods"]["combat"].get("lyrics").is_none());
            music.edit(Edit::Enabled(false), "fantasy");
            assert!(music.section("story").is_none());
        }
    }

    #[test]
    fn story_music_suggestion_only_updates_requested_moods() {
        let mut music = Music::for_genre("fantasy", true);
        let tavern = music.captions["tavern"].clone();
        let suggestion = parse_suggestion(r#"
```json
{"style":"  Acoustic   score  ","moods":{"Calm":"  Slow harp  ","boss":"Exclude me","unknown":"Exclude me"}}
```
"#).unwrap();
        music.apply_suggestion("fantasy", suggestion).unwrap();
        assert_eq!(music.style, "Acoustic score");
        assert_eq!(music.captions["calm"], "Slow harp");
        assert_eq!(music.captions["tavern"], tavern);
        assert!(!music.captions.contains_key("boss"));
        assert!(parse_suggestion(r#"{"moods":{"other":"ignored"}}"#).is_err());
    }
}
