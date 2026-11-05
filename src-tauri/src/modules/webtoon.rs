//! Webtoon export of a Stage act: the script the interface draws into a long picture column.
//! One panel per line of the log, with the place behind it (the background the line was said in
//! front of, `SceneTurnMessage::bg`) and the speaker's portrait in the mood the text shows
//! ([`classify_emotion`]). Every picture comes as a `data:` URL (or an app path like `/npc/…`), so
//! the canvas stays clean and can be saved as PNG.

use crate::modules::characters::{CharacterProfile, find_by_name};
use crate::modules::content_lang::ContentLang;
use crate::modules::emotions::classify_emotion;
use crate::modules::replay_export::{clean_text, portrait_data_url};
use crate::modules::stage::SceneState;
use serde::Serialize;
use std::collections::HashMap;
use ts_rs::TS;

/// A picture larger than this stays out (a card's expression image, a background).
const MAX_PICTURE_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct WebtoonPanel {
    pub speaker: String,
    /// `narrator`, `player`, `figure` or `system`.
    pub voice: String,
    pub text: String,
    /// How the player acts (`say`, `do`, `think`, `whisper`, …).
    pub mode: String,
    /// Index into [`WebtoonScript::images`].
    pub bg: Option<u32>,
    pub portrait: Option<u32>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct WebtoonScript {
    pub title: String,
    pub subtitle: String,
    /// Pictures used by the panels, each once.
    pub images: Vec<String>,
    pub panels: Vec<WebtoonPanel>,
    pub footer: String,
}

/// Collects each picture once and hands out its index.
#[derive(Default)]
struct Images {
    list: Vec<String>,
    index: HashMap<String, u32>,
}

impl Images {
    fn add(&mut self, picture: String) -> u32 {
        if let Some(&i) = self.index.get(&picture) {
            return i;
        }
        let i = self.list.len() as u32;
        self.index.insert(picture.clone(), i);
        self.list.push(picture);
        i
    }
}

/// Only pictures a canvas may read back: `data:` URLs and the app's own files (`/npc/…`).
fn drawable(picture: &str) -> bool {
    picture.starts_with("data:image/") || (picture.starts_with('/') && !picture.starts_with("//"))
}

fn mime_of(path: &std::path::Path) -> Option<&'static str> {
    match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "png" => Some("image/png"),
        "webp" => Some("image/webp"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        _ => None,
    }
}

/// A card's expression picture (`data:` URL or a file, relative to the card) as a data URL.
fn picture_of(source: &str, card_path: Option<&str>) -> Option<String> {
    if source.starts_with("data:image/") {
        return Some(source.to_string());
    }
    if source.starts_with("http://") || source.starts_with("https://") {
        return None;
    }
    let mut path = std::path::PathBuf::from(source);
    if path.is_relative() {
        path = std::path::Path::new(card_path?).parent()?.join(path);
    }
    if std::fs::metadata(&path).ok()?.len() > MAX_PICTURE_BYTES {
        return None;
    }
    let mime = mime_of(&path)?;
    use base64::Engine as _;
    Some(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(std::fs::read(&path).ok()?)
    ))
}

/// The figure's portrait for `text`: the extra slot the text calls for, else its mood, else
/// neutral, else the card picture.
fn mood_portrait(profile: &CharacterProfile, text: &str) -> Option<String> {
    let extensions = &profile.card.data.extensions;
    let expressions = ["expressions", "custom_expressions", "sow_expressions"]
        .iter()
        .find_map(|key| extensions.get(key).and_then(serde_json::Value::as_object));
    let emotion = classify_emotion(text);
    if let Some(expressions) = expressions {
        for key in [
            emotion.portrait.as_str(),
            emotion.vrm_expression.as_str(),
            "neutral",
        ] {
            if let Some(picture) = expressions
                .get(key)
                .and_then(serde_json::Value::as_str)
                .and_then(|source| picture_of(source, profile.source_path.as_deref()))
            {
                return Some(picture);
            }
        }
    }
    portrait_data_url(profile)
}

fn blank(bg: &str) -> bool {
    bg.trim().is_empty() || bg.eq_ignore_ascii_case("none")
}

/// The act as panels. `background` turns a background name into a picture (the Stage's lookup).
pub fn webtoon_script(
    state: &SceneState,
    characters: &[CharacterProfile],
    lang: &ContentLang,
    background: &dyn Fn(&str) -> Option<String>,
) -> WebtoonScript {
    let def = &state.definition;
    let mut images = Images::default();
    let mut backgrounds: HashMap<String, Option<u32>> = HashMap::new();
    let mut portraits: HashMap<(String, String), Option<u32>> = HashMap::new();
    // Lines from before backgrounds were recorded keep the last known place, at first the start.
    let mut place = Some(def.starting_bg.clone())
        .filter(|bg| !blank(bg))
        .or_else(|| state.current_bg.clone().filter(|bg| !blank(bg)));

    let mut panels = Vec::new();
    for message in &state.chat_log {
        let text = clean_text(&message.content);
        if text.is_empty() {
            continue;
        }
        if let Some(bg) = message.bg.as_deref().filter(|bg| !blank(bg)) {
            place = Some(bg.to_string());
        }
        let bg = place.as_ref().and_then(|name| {
            *backgrounds.entry(name.clone()).or_insert_with(|| {
                background(name)
                    .filter(|p| drawable(p))
                    .map(|p| images.add(p))
            })
        });
        let voice = match message.sender_role.as_str() {
            "gm" => "narrator",
            "player" => "player",
            "companion" | "npc" => "figure",
            _ => "system",
        };
        let portrait = if voice == "figure" {
            let profile = find_by_name(characters, &message.sender_name);
            let mood = classify_emotion(&text);
            let key = (
                message.sender_name.to_lowercase(),
                format!("{}|{}", mood.portrait, mood.vrm_expression),
            );
            *portraits.entry(key).or_insert_with(|| {
                profile
                    .and_then(|p| mood_portrait(p, &text))
                    .or_else(|| message.avatar_url.clone())
                    .filter(|p| drawable(p))
                    .map(|p| images.add(p))
            })
        } else {
            None
        };
        let speaker = if voice == "narrator" {
            lang.t("Game master").into_owned()
        } else {
            message.sender_name.clone()
        };
        panels.push(WebtoonPanel {
            speaker,
            voice: voice.into(),
            text,
            mode: message.turn_mode.clone(),
            bg,
            portrait,
        });
    }
    WebtoonScript {
        title: def.title.clone(),
        subtitle: clean_text(&def.description),
        images: images.list,
        panels,
        footer: lang.t("Made with OtakuSoul").into_owned(),
    }
}

/// Writes the drawn pages (`data:image/png;base64,…` or plain Base64) next to each other:
/// `target.png` for one page, `target_01.png`, `target_02.png` … for more. Returns the files.
pub fn write_pages(target: &str, pages: &[String]) -> Result<Vec<String>, String> {
    use base64::Engine as _;
    let target = std::path::Path::new(target);
    let stem = target
        .file_stem()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("webtoon");
    let dir = target.parent().unwrap_or(std::path::Path::new("."));
    let mut written = Vec::new();
    for (i, page) in pages.iter().enumerate() {
        let payload = page.split_once(',').map_or(page.as_str(), |(_, b)| b);
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(payload)
            .map_err(|e| crate::err!("backend.webtoon.page", error = e))?;
        if !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
            return Err(crate::err!("backend.webtoon.page", error = "PNG"));
        }
        let path = if pages.len() == 1 {
            dir.join(format!("{stem}.png"))
        } else {
            dir.join(format!("{stem}_{:02}.png", i + 1))
        };
        std::fs::write(&path, bytes)
            .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
        written.push(path.to_string_lossy().to_string());
    }
    Ok(written)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::stage::{SceneDefinition, SceneTurnMessage, build_initial_scene_state};

    fn message(role: &str, name: &str, text: &str, bg: Option<&str>) -> SceneTurnMessage {
        SceneTurnMessage {
            id: "m".into(),
            sender_id: name.into(),
            sender_name: name.into(),
            sender_role: role.into(),
            avatar_url: None,
            content: text.into(),
            turn_mode: "say".into(),
            whisper_target: None,
            event_card: None,
            timestamp: 1_760_000_000,
            bg: bg.map(Into::into),
        }
    }

    #[test]
    fn panels_follow_the_places_and_skip_empty_lines() {
        let def: SceneDefinition = serde_json::from_str(include_str!(
            "../../../presets/stories/scenes/story_frozen_bells.json"
        ))
        .unwrap();
        let mut state = build_initial_scene_state(&def);
        state.definition.starting_bg = "tower.png".into();
        state.chat_log = vec![
            // An old line without a recorded place: the start.
            message("gm", "GM", "Es schneit. [emotion: calm]", None),
            message("player", "Du", "Ich klopfe.", Some("tower.png")),
            message("companion", "Lirwen", "<think>x</think>", Some("tower.png")),
            message("npc", "Wirt", "Herein!", Some("inn.png")),
            message("gm", "GM", "Drinnen ist es warm.", None),
        ];
        let lookup = |name: &str| match name {
            "tower.png" => Some("data:image/png;base64,TOWER".to_string()),
            "inn.png" => Some("data:image/png;base64,INN".to_string()),
            _ => None,
        };
        let script = webtoon_script(&state, &[], &ContentLang::current(), &lookup);
        let places: Vec<_> = script
            .panels
            .iter()
            .map(|p| p.bg.map(|i| script.images[i as usize].as_str()))
            .collect();
        assert_eq!(
            places,
            [
                Some("data:image/png;base64,TOWER"),
                Some("data:image/png;base64,TOWER"),
                Some("data:image/png;base64,INN"),
                // A later line without a place stays where the story is.
                Some("data:image/png;base64,INN"),
            ]
        );
        assert_eq!(script.images.len(), 2, "each picture once");
        assert_eq!(script.panels[0].voice, "narrator");
        assert_eq!(script.panels[0].text, "Es schneit.");
        assert_eq!(script.panels[2].voice, "figure");
        assert!(
            script.panels[2].portrait.is_none(),
            "no card, no picture: the initial"
        );
    }

    #[test]
    fn only_readable_pictures_reach_the_canvas() {
        assert!(drawable("data:image/webp;base64,AAAA"));
        assert!(drawable("/npc/guard.png"));
        assert!(!drawable("https://example.org/x.png"));
        assert!(!drawable("//evil.example/x.png"));
        assert!(!drawable("C:\\Users\\x.png"));
    }

    #[test]
    fn pages_are_numbered_and_must_be_png() {
        use base64::Engine as _;
        let dir = std::env::temp_dir().join(format!("otakusoul-webtoon-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let png = format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(b"\x89PNG\r\n\x1a\nrest")
        );
        let target = dir.join("frost.png").to_string_lossy().to_string();
        let one = write_pages(&target, std::slice::from_ref(&png)).unwrap();
        assert!(one[0].ends_with("frost.png"));
        let two = write_pages(&target, &[png.clone(), png]).unwrap();
        assert!(two[0].ends_with("frost_01.png") && two[1].ends_with("frost_02.png"));
        assert!(
            write_pages(&target, &["aGVsbG8=".into()]).is_err(),
            "not a PNG"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
