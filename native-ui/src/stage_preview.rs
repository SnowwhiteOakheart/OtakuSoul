//! Lesende Projektion der Stage-Szenen für die native Galerie.

use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Genre {
    Fantasy,
    Adventure,
    Comedy,
    Romance,
    SliceOfLife,
    Mystery,
    SciFi,
    Horror,
    Adventure5e,
    Custom,
}

impl Genre {
    pub fn key(self) -> &'static str {
        match self {
            Self::Fantasy => "gallery.filter.fantasy",
            Self::Adventure => "gallery.filter.adventure",
            Self::Comedy => "gallery.filter.comedy",
            Self::Romance => "gallery.filter.romance",
            Self::SliceOfLife => "gallery.filter.slice_of_life",
            Self::Mystery => "gallery.filter.mystery",
            Self::SciFi => "gallery.filter.scifi",
            Self::Horror => "gallery.filter.horror",
            Self::Adventure5e => "gallery.filter.adventure5e",
            Self::Custom => "gallery.filter.custom",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Collection {
    Starter,
    Crypt,
}

#[derive(Debug, Clone)]
pub struct Scene {
    pub id: String,
    pub party: Vec<String>,
    pub lorebooks: Vec<String>,
    pub genre: Genre,
    pub beginner: bool,
    pub minutes: Option<u32>,
    pub difficulty: Option<&'static str>,
    pub notes: Vec<&'static str>,
    title: String,
    raw: Value,
    collection: Option<Collection>,
}

impl Scene {
    pub fn title(&self, language: &str) -> &str {
        self.localized("title", language).unwrap_or(&self.title)
    }

    pub fn description(&self, language: &str) -> &str {
        self.text("description", language)
    }

    pub fn location(&self, language: &str) -> &str {
        self.text("starting_location", language)
    }

    pub fn time_of_day(&self, language: &str) -> &str {
        self.text("time_of_day", language)
    }

    pub fn opening(&self, language: &str) -> &str {
        let narration = self.text("opening_narration", language);
        if narration.is_empty() {
            self.text("first_message", language)
        } else {
            narration
        }
    }

    pub fn choices(&self, language: &str) -> Vec<&str> {
        let choices = &self.raw["extensions"]["otakusoul_story"]["choices"];
        // Die Galerie priorisiert die gewählte Sprache, dann Englisch und Deutsch.
        choices[language]
            .as_array()
            .or_else(|| choices["en"].as_array())
            .or_else(|| choices["de"].as_array())
            .into_iter()
            .flatten()
            .filter_map(|choice| nonempty(&choice["text"]))
            .collect()
    }

    pub fn collection(&self) -> Option<Collection> {
        self.collection
    }

    pub fn folder(&self) -> Option<&str> {
        nonempty(&self.raw["folder"]).filter(|name| !is_builtin_folder(name))
    }

    pub fn definition(&self) -> Value {
        let mut definition = self.raw.clone();
        definition["id"] = self.id.clone().into();
        definition["title"] = self.title.clone().into();
        if !definition["description"].is_string() {
            definition["description"] = "".into();
        }
        definition
    }

    fn localized(&self, field: &str, language: &str) -> Option<&str> {
        let extension = self.raw["extensions"].get("otakusoul_i18n");
        let translation = otakusoul_prompt::i18n_translation(extension, language)?;
        translation.get(field).and_then(nonempty)
    }

    pub(super) fn text(&self, field: &str, language: &str) -> &str {
        self.localized(field, language)
            .or_else(|| self.raw.get(field).and_then(nonempty))
            .unwrap_or_default()
    }
}

pub fn is_builtin_folder(name: &str) -> bool {
    name.eq_ignore_ascii_case("Eigene Szenen") || name.eq_ignore_ascii_case("Alle")
}

pub fn parse(raw: Value) -> Result<Scene, String> {
    project(raw, None)
}

pub fn parse_hub(raw: Value, id: &str, fallback_title: &str) -> Result<Scene, String> {
    project(raw, Some((id, fallback_title)))
}

pub fn parse_file(mut raw: Value, fallback_id: &str) -> Result<Scene, String> {
    let definition = if raw.get("definition").is_some_and(Value::is_object) {
        &mut raw["definition"]
    } else {
        &mut raw
    };
    if let Some(object) = definition.as_object_mut()
        && object
            .get("id")
            .is_none_or(|id| id.as_str().is_some_and(|value| value.trim().is_empty()))
    {
        object.insert("id".into(), fallback_id.into());
    }
    parse(raw)
}

fn project(mut raw: Value, registry: Option<(&str, &str)>) -> Result<Scene, String> {
    crate::profile::check_public_hub_content(&raw)?;
    if let Some(definition) = raw.get_mut("definition").filter(|value| value.is_object()) {
        raw = definition.take();
        crate::profile::check_public_hub_content(&raw)?;
    }
    if !raw.is_object()
        || !["title", "description", "opening_narration", "first_message"]
            .into_iter()
            .any(|field| raw.get(field).and_then(nonempty).is_some())
    {
        return Err("Die Stage-Datei enthält keine Szenendefinition.".into());
    }
    let id = registry
        .map(|(id, _)| id.trim())
        .or_else(|| nonempty(&raw["id"]))
        .filter(|id| !id.is_empty())
        .ok_or("Die Szene hat keine gültige Kennung.")?
        .to_owned();
    let title = nonempty(&raw["title"])
        .or_else(|| registry.map(|(_, title)| title.trim()))
        .filter(|title| !title.is_empty())
        .ok_or("Die Szene hat keinen gültigen Titel.")?
        .to_owned();
    let story = &raw["extensions"]["otakusoul_story"];
    let genre = if raw["rules"]["ruleset"].as_str() == Some("5e") {
        Genre::Adventure5e
    } else {
        match story["genre"].as_str() {
            Some("fantasy") => Genre::Fantasy,
            Some("adventure") => Genre::Adventure,
            Some("comedy") => Genre::Comedy,
            Some("romance") => Genre::Romance,
            Some("slice_of_life") => Genre::SliceOfLife,
            Some("mystery") => Genre::Mystery,
            Some("scifi") => Genre::SciFi,
            Some("horror") => Genre::Horror,
            _ => Genre::Custom,
        }
    };
    let minutes = story["minutes"]
        .as_u64()
        .and_then(|minutes| u32::try_from(minutes).ok())
        .filter(|minutes| *minutes > 0);
    let difficulty = match story["difficulty"].as_str() {
        Some("easy") => Some("gallery.difficulty.easy"),
        Some("medium") => Some("gallery.difficulty.medium"),
        Some("hard") => Some("gallery.difficulty.hard"),
        _ => None,
    };
    let notes = story["notes"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|note| match note.as_str()? {
            "romance" => Some("gallery.note.romance"),
            "action" => Some("gallery.note.action"),
            "dark_themes" => Some("gallery.note.dark_themes"),
            "death" => Some("gallery.note.death"),
            "mild_danger" => Some("gallery.note.mild_danger"),
            "flirting" => Some("gallery.note.flirting"),
            "suspense" => Some("gallery.note.suspense"),
            "spooky" => Some("gallery.note.spooky"),
            "mild_violence" => Some("gallery.note.mild_violence"),
            _ => None,
        })
        .collect();
    Ok(Scene {
        id,
        party: string_list(&raw["party"]),
        lorebooks: string_list(&raw["lorebook"]),
        genre,
        beginner: story["beginner"].as_bool().unwrap_or(false),
        minutes,
        difficulty,
        notes,
        title,
        raw,
        collection: None,
    })
}

fn nonempty(value: &Value) -> Option<&str> {
    value.as_str().filter(|text| !text.trim().is_empty())
}

fn string_list(value: &Value) -> Vec<String> {
    value
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(nonempty)
        .map(str::to_owned)
        .collect()
}

pub fn bundled() -> Vec<Scene> {
    use Collection::{Crypt, Starter};

    let definitions = [
        (
            "story_frozen_bells",
            Starter,
            include_str!("../../presets/stories/scenes/story_frozen_bells.json"),
        ),
        (
            "story_hanami_live",
            Starter,
            include_str!("../../presets/stories/scenes/story_hanami_live.json"),
        ),
        (
            "story_missing_mic",
            Starter,
            include_str!("../../presets/stories/scenes/story_missing_mic.json"),
        ),
        (
            "story_ryokan_night",
            Starter,
            include_str!("../../presets/stories/scenes/story_ryokan_night.json"),
        ),
        (
            "story_silent_station",
            Starter,
            include_str!("../../presets/stories/scenes/story_silent_station.json"),
        ),
        (
            "akt1_waldstrasse",
            Crypt,
            include_str!("../../presets/crypt-of-shadows/scenes/akt1_waldstrasse.json"),
        ),
        (
            "akt2_gruft",
            Crypt,
            include_str!("../../presets/crypt-of-shadows/scenes/akt2_gruft.json"),
        ),
        (
            "akt3_heiligtum",
            Crypt,
            include_str!("../../presets/crypt-of-shadows/scenes/akt3_heiligtum.json"),
        ),
    ];
    definitions
        .into_iter()
        .map(|(id, collection, json)| {
            let mut raw: Value = serde_json::from_str(json).expect("Mitgelieferte Szene ist JSON");
            raw["id"] = Value::String(id.into());
            let mut scene = parse(raw).expect("Mitgelieferte Szene hat ID und Titel");
            scene.collection = Some(collection);
            scene
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn bundled_gallery_keeps_story_and_adventure_ids_and_languages() {
        let scenes = bundled();
        assert_eq!(scenes.len(), 8);
        assert_eq!(scenes[0].id, "story_frozen_bells");
        assert_eq!(scenes[0].collection(), Some(Collection::Starter));
        assert_eq!(scenes[0].genre.key(), "gallery.filter.fantasy");
        assert_eq!(scenes[0].difficulty, Some("gallery.difficulty.easy"));
        assert_eq!(scenes[0].minutes, Some(45));
        assert!(scenes[0].beginner);
        assert_eq!(scenes[0].notes, ["gallery.note.mild_danger"]);
        assert_eq!(scenes[4].title("en"), "Silence on Station Kepler-9");
        assert_eq!(
            scenes[4].location("en"),
            "Docking airlock of Station Kepler-9"
        );
        assert_eq!(scenes[4].choices("missing"), scenes[4].choices("en"));
        assert_eq!(scenes[4].choices("de").len(), 3);
        assert_eq!(scenes[5].id, "akt1_waldstrasse");
        assert_eq!(scenes[5].collection(), Some(Collection::Crypt));
        assert_eq!(scenes[5].genre, Genre::Adventure5e);
        assert!(!scenes[5].opening("de").is_empty());
    }

    #[test]
    fn gateway_projects_state_wrappers_and_keeps_authoritative_ids() {
        let scene = parse_hub(json!({"definition": {
            "id": "wrong", "title": null, "party": ["Ada", null, " "],
            "lorebook": ["Welt"], "first_message": "Willkommen",
            "extensions": {"otakusoul_story": {
                "genre":"unknown", "minutes":0, "difficulty":"unknown",
                "notes":["unknown", "action"], "choices": {"de":[{"text":"Ansehen"}, {"text":" "}]}
            }}
        }}), "story_frozen_bells", "Gateway-Titel").unwrap();
        assert_eq!(scene.id, "story_frozen_bells");
        assert_eq!(scene.title("de"), "Gateway-Titel");
        assert_eq!(scene.collection(), None);
        assert_eq!(scene.genre, Genre::Custom);
        assert_eq!(scene.party, ["Ada"]);
        assert_eq!(scene.lorebooks, ["Welt"]);
        assert_eq!(scene.opening("en"), "Willkommen");
        assert_eq!(scene.choices("ru"), ["Ansehen"]);
        assert_eq!(scene.notes, ["gallery.note.action"]);
        assert_eq!(scene.minutes, None);
        assert_eq!(scene.difficulty, None);
    }

    #[test]
    fn stage_scene_file_roundtrip_preserves_the_definition_only() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("scene.json");
        let state = json!({
            "definition": {
                "id": "",
                "title": "Kampagne",
                "description": "Ein neuer Anfang",
                "rules": {"ruleset": "5e"},
                "extensions": {"custom": {"enabled": true}}
            },
            "chat_log": [{"content": "Fortschritt"}]
        });
        crate::file_export::write_json(&path, &state, None).unwrap();
        let scene = parse_file(
            crate::profile::read_standalone_json(&path).unwrap(),
            "local-id",
        )
        .unwrap();
        let export_path = temp.path().join("export.json");
        crate::file_export::write_json(&export_path, &scene.definition(), None).unwrap();
        let exported = crate::profile::read_standalone_json(&export_path).unwrap();
        let mut expected = state["definition"].clone();
        expected["id"] = "local-id".into();
        assert_eq!(exported, expected);
        assert_eq!(parse_file(exported, "unused").unwrap().id, "local-id");
    }

    #[test]
    fn malformed_definitions_and_adult_content_are_rejected() {
        assert!(parse(json!({"title":"Titel"})).is_err());
        assert!(parse_hub(json!([]), "id", "Titel").is_err());
        assert!(parse_hub(json!({"definition": {}}), "id", "Titel").is_err());
        let marked = json!({"definition": {
            "title": "Titel", "extensions": {"otakusoul_nsfw": true}
        }});
        assert!(parse_hub(marked, "id", "Titel").is_err());
    }
}
