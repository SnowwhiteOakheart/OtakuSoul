//! Bearbeitet Szenendefinitionen, ohne unbekannte Felder umzuschreiben.

use serde_json::{Value, json};

use crate::stage_preview::{self, Scene};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Field {
    Title,
    Description,
    Location,
    Time,
    Opening,
    WorldContext,
    Persona,
    Party,
    Lorebooks,
    Folder,
}

impl Field {
    const ALL: [Self; 10] = [
        Self::Title,
        Self::Description,
        Self::Location,
        Self::Time,
        Self::Opening,
        Self::WorldContext,
        Self::Persona,
        Self::Party,
        Self::Lorebooks,
        Self::Folder,
    ];

    pub const MULTILINE: [Self; 5] = [
        Self::Description,
        Self::Opening,
        Self::WorldContext,
        Self::Party,
        Self::Lorebooks,
    ];

    pub fn label_key(self) -> &'static str {
        match self {
            Self::Title => "sceneNew.sceneTitle",
            Self::Description => "sceneNew.description",
            Self::Location => "sceneNew.startLocation",
            Self::Time => "sceneNew.timeOfDay",
            Self::Opening => "sceneNew.opening",
            Self::WorldContext => "sceneNew.worldContext",
            Self::Persona => "sceneNew.persona",
            Self::Party => "sceneNew.party",
            Self::Lorebooks => "sceneEdit.lorebooks",
            Self::Folder => "gallery.native.folder",
        }
    }

    fn key(self) -> &'static str {
        match self {
            Self::Title => "title",
            Self::Description => "description",
            Self::Location => "starting_location",
            Self::Time => "time_of_day",
            Self::Opening => "opening_narration",
            Self::WorldContext => "world_context",
            Self::Persona => "persona",
            Self::Party => "party",
            Self::Lorebooks => "lorebook",
            Self::Folder => "folder",
        }
    }

    fn text(self, definition: &Value) -> String {
        let value = &definition[self.key()];
        match self {
            Self::Folder => value
                .as_str()
                .map(str::trim)
                .filter(|name| !stage_preview::is_builtin_folder(name))
                .unwrap_or_default()
                .to_owned(),
            Self::Party | Self::Lorebooks => value
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>()
                .join("\n"),
            _ => value.as_str().unwrap_or_default().to_owned(),
        }
    }

    fn is_localized(self) -> bool {
        matches!(
            self,
            Self::Title
                | Self::Description
                | Self::Location
                | Self::Time
                | Self::Opening
                | Self::WorldContext
        )
    }
}

pub struct Draft {
    pub target: Option<usize>,
    original: Option<Value>,
    values: [String; Field::ALL.len()],
}

impl Draft {
    pub fn new() -> Self {
        Self {
            target: None,
            original: None,
            values: Default::default(),
        }
    }

    pub fn from_scene(target: Option<usize>, scene: &Scene) -> Self {
        let definition = scene.definition();
        let values = Field::ALL.map(|field| field.text(&definition));
        Self {
            target,
            original: Some(definition),
            values,
        }
    }

    pub fn get(&self, field: Field) -> &str {
        &self.values[field as usize]
    }

    pub fn set(&mut self, field: Field, value: String) {
        self.values[field as usize] = value;
    }

    pub fn apply(&self, id: &str) -> Result<Scene, String> {
        let title = self.get(Field::Title).trim();
        if title.is_empty() {
            return Err("Bitte gib einen Titel für die Szene ein.".into());
        }

        let mut definition = self.original.clone().unwrap_or_else(|| {
            json!({
                "title": title,
                "description": title,
                "solo_mode": true
            })
        });
        definition["id"] = id.into();
        for field in Field::ALL {
            let text = self.get(field);
            if let Some(original) = &self.original {
                if text == field.text(original) {
                    continue;
                }
            } else if text.trim().is_empty() {
                continue;
            }
            let value = match field {
                Field::Folder => {
                    let name = text.trim();
                    if !valid_folder_name(name) {
                        return Err(crate::ui_text::text("gallery.native.folderInvalid").into());
                    }
                    Value::from(name)
                }
                Field::Party | Field::Lorebooks => {
                    let mut items = Vec::new();
                    for item in text.lines().map(str::trim).filter(|item| !item.is_empty()) {
                        if !items.contains(&item) {
                            items.push(item);
                        }
                    }
                    if field == Field::Party {
                        definition["solo_mode"] = items.is_empty().into();
                    }
                    json!(items)
                }
                _ => Value::from(text.trim()),
            };
            let key = field.key();
            if definition.get(key) == Some(&value) {
                continue;
            }
            definition[key] = value;
            if field.is_localized()
                && let Some(translations) = definition
                    .pointer_mut("/extensions/otakusoul_i18n/translations")
                    .and_then(Value::as_object_mut)
            {
                for translation in translations.values_mut().filter_map(Value::as_object_mut) {
                    translation.remove(key);
                }
            }
        }
        stage_preview::parse(definition)
    }
}

pub fn valid_folder_name(name: &str) -> bool {
    !stage_preview::is_builtin_folder(name)
        && name.chars().count() <= 100
        && !name.chars().any(char::is_control)
        && !name.contains(['/', '\\'])
        && !name.contains("..")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_scene_requires_title_and_preserves_list_order() {
        let mut draft = Draft::new();
        draft.set(Field::Title, "   ".into());
        assert!(draft.apply("draft").is_err());

        draft.set(Field::Title, " Der Wald ".into());
        let solo = draft.apply("draft").unwrap().definition();
        assert_eq!(solo["description"], "Der Wald");
        assert_eq!(solo["solo_mode"], true);

        draft.set(Field::Party, " beta\r\n\r\nalpha\n beta ".into());
        draft.set(Field::Lorebooks, " myth \nmyth\n legend ".into());
        let scene = draft.apply("draft").unwrap();
        assert_eq!(scene.id, "draft");
        assert_eq!(scene.title("de"), "Der Wald");
        assert_eq!(scene.party, ["beta", "alpha"]);
        assert_eq!(scene.lorebooks, ["myth", "legend"]);
        assert_eq!(scene.definition()["solo_mode"], false);
    }

    #[test]
    fn stage_folder_edits_preserve_legacy_defaults_and_reject_invalid_names() {
        let original = json!({
            "id": "draft", "title": "Der Wald", "folder": "Eigene Szenen"
        });
        let scene = stage_preview::parse(original).unwrap();
        let mut draft = Draft::from_scene(Some(0), &scene);
        assert_eq!(draft.get(Field::Folder), "");
        assert_eq!(
            draft.apply("draft").unwrap().definition()["folder"],
            "Eigene Szenen"
        );
        for invalid in ["ALLE", "../Kampagne", "Nord/Süd", "Nord\\Süd"] {
            draft.set(Field::Folder, invalid.into());
            assert!(draft.apply("draft").is_err());
        }
        draft.set(Field::Folder, "  Kampagne Nord  ".into());
        let named = draft.apply("draft").unwrap();
        assert_eq!(named.folder(), Some("Kampagne Nord"));
        let mut draft = Draft::from_scene(Some(0), &named);
        draft.set(Field::Folder, String::new());
        let unfiled = draft.apply("draft").unwrap();
        assert_eq!(unfiled.folder(), None);
        assert_eq!(unfiled.definition()["folder"], "");
    }

    #[test]
    fn editing_preserves_unknown_data_and_only_clears_stale_translations() {
        let original = json!({
            "id": "srd5",
            "title": "A Forest",
            "description": "The characters find a forest.",
            "party": ["ranger"],
            "first_message": "A quiet evening",
            "rules": { "ruleset": "5e", "next_scene": "second" },
            "extensions": {
                "otakusoul_i18n": {
                    "source_language": "en",
                    "translations": {
                        "de": { "title": "Wald", "description": "Ein Wald.", "first_message": "Ein Abend" },
                        "ja": { "title": "森", "custom": "value" }
                    }
                },
                "example": { "keep": true }
            },
            "future_field": [1, 2]
        });
        let scene = stage_preview::parse(original.clone()).unwrap();
        let mut draft = Draft::from_scene(Some(2), &scene);
        assert_eq!(draft.target, Some(2));
        assert_eq!(draft.get(Field::Title), "A Forest");
        assert_eq!(draft.get(Field::Opening), "");
        assert_eq!(draft.apply("srd5").unwrap().definition(), original);

        draft.set(Field::Title, " A New Forest ".into());
        draft.set(Field::Party, " \n ".into());
        let result = draft.apply("srd5").unwrap().definition();
        let mut expected = original;
        expected["title"] = "A New Forest".into();
        expected["party"] = json!([]);
        expected["solo_mode"] = true.into();
        expected["extensions"]["otakusoul_i18n"]["translations"] = json!({
            "de": { "description": "Ein Wald.", "first_message": "Ein Abend" },
            "ja": { "custom": "value" }
        });
        assert_eq!(result, expected);
    }
}
