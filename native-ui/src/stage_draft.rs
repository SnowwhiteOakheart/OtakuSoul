//! Bearbeitet Szenendefinitionen, ohne unbekannte Felder umzuschreiben.

use serde_json::{Value, json};

use crate::stage_preview::{self, Scene};
use crate::stage_rules::Rules;

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
    GmTone,
    NarratorStyle,
    ActorDepth,
    Dice,
    DisableOffscreen,
    Background,
    Ambient,
    LockBackground,
    DisableAmbient,
}

impl Field {
    const ALL: [Self; 19] = [
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
        Self::GmTone,
        Self::NarratorStyle,
        Self::ActorDepth,
        Self::Dice,
        Self::DisableOffscreen,
        Self::Background,
        Self::Ambient,
        Self::LockBackground,
        Self::DisableAmbient,
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
            Self::GmTone => "sceneNew.gmTone",
            Self::NarratorStyle => "sceneNew.narratorStyle",
            Self::ActorDepth => "sceneEdit.actors",
            Self::Dice => "sceneNew.dice",
            Self::DisableOffscreen => "sceneEdit.disableOffscreen",
            Self::Background => "sceneEdit.background",
            Self::Ambient => "sceneEdit.ambient",
            Self::LockBackground => "sceneEdit.lockBg",
            Self::DisableAmbient => "sceneEdit.disableAmbient",
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
            Self::GmTone => "gm_tone",
            Self::NarratorStyle => "narrator_style",
            Self::ActorDepth => "max_actor_depth",
            Self::Dice => "dice_rolls_enabled",
            Self::DisableOffscreen => "disable_offscreen",
            Self::Background => "starting_bg",
            Self::Ambient => "starting_ambient",
            Self::LockBackground => "lock_bg",
            Self::DisableAmbient => "disable_ambient",
        }
    }

    fn default_text(self) -> &'static str {
        match self {
            Self::GmTone => "Epic Fantasy",
            Self::ActorDepth => "3",
            Self::Dice => "true",
            Self::DisableOffscreen | Self::LockBackground | Self::DisableAmbient => "false",
            _ => "",
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
            Self::ActorDepth => value
                .as_u64()
                .map_or_else(|| self.default_text().into(), |value| value.to_string()),
            Self::Dice | Self::DisableOffscreen | Self::LockBackground | Self::DisableAmbient => {
                value
                    .as_bool()
                    .map_or_else(|| self.default_text().into(), |value| value.to_string())
            }
            _ => value
                .as_str()
                .unwrap_or_else(|| self.default_text())
                .to_owned(),
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
    pub rules: Rules,
    original: Option<Value>,
    values: [String; Field::ALL.len()],
}

impl Draft {
    pub fn new() -> Self {
        Self {
            target: None,
            rules: Rules::new(Value::Null),
            original: None,
            values: Field::ALL.map(|field| field.default_text().into()),
        }
    }

    pub fn from_scene(target: Option<usize>, scene: &Scene) -> Self {
        let definition = scene.definition();
        let values = Field::ALL.map(|field| field.text(&definition));
        Self {
            target,
            rules: Rules::new(definition["rules"].clone()),
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
            } else if text.trim() == field.default_text() {
                continue;
            }
            let value = match field {
                Field::ActorDepth => {
                    let actors = text
                        .trim()
                        .parse::<u32>()
                        .ok()
                        .filter(|count| (1..=6).contains(count))
                        .ok_or_else(|| {
                            crate::ui_text::text("gallery.native.actorsInvalid").to_owned()
                        })?;
                    Value::from(actors)
                }
                Field::Dice
                | Field::DisableOffscreen
                | Field::LockBackground
                | Field::DisableAmbient => {
                    let enabled = text
                        .parse::<bool>()
                        .map_err(|_| "Ungültiger Schalterwert.")?;
                    Value::from(enabled)
                }
                Field::Folder => {
                    let name = text.trim();
                    if !valid_folder_name(name) {
                        return Err(crate::ui_text::text("gallery.native.folderInvalid").into());
                    }
                    Value::from(name)
                }
                Field::Background | Field::Ambient => {
                    let name = text.trim();
                    if !crate::stage_media::valid_name(name) {
                        return Err(crate::ui_text::text("gallery.native.mediaNameInvalid").into());
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
        self.rules.apply(&mut definition);
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
    fn stage_media_and_5e_edits_preserve_unrelated_settings() {
        use crate::stage_rules::Edit;

        let mut source = json!({
            "id": "draft", "title": "Der Wald",
            "starting_bg": "https://example.test/old.png",
            "rules": {
                "ruleset": "5e", "map_id": "old_map",
                "goals": [{"kind": "exit", "target": "gate"}],
                "hero_classes": {"player": "fighter", "companion": "custom_class"},
                "future_rule": {"keep": true}
            }
        });
        let scene = stage_preview::parse(source.clone()).unwrap();
        let mut draft = Draft::from_scene(Some(0), &scene);
        draft.set(Field::Ambient, "../forest.ogg".into());
        assert!(draft.apply("draft").is_err());
        draft.set(Field::Ambient, "forest.ogg".into());
        draft.set(Field::LockBackground, "true".into());
        draft.rules.edit(Edit::Map("forest_road".into())).unwrap();
        draft
            .rules
            .edit(Edit::Class {
                member: "player".into(),
                class: "".into(),
            })
            .unwrap();
        draft.rules.edit(Edit::HeroicDeath(true)).unwrap();
        draft.rules.edit(Edit::Enabled(false)).unwrap();
        assert!(draft.apply("draft").unwrap().definition()["rules"].is_null());
        draft.rules.edit(Edit::Enabled(true)).unwrap();

        source["description"] = "".into();
        source["starting_ambient"] = "forest.ogg".into();
        source["lock_bg"] = true.into();
        source["rules"]["map_id"] = "forest_road".into();
        source["rules"]["hero_classes"] = json!({"companion": "custom_class"});
        source["rules"]["heroic_death"] = true.into();
        assert_eq!(draft.apply("draft").unwrap().definition(), source);
    }

    #[test]
    fn stage_narration_options_keep_defaults_implicit_and_write_typed_values() {
        let mut draft = Draft::new();
        draft.set(Field::Title, "Der Wald".into());
        let base = draft.apply("draft").unwrap().definition();
        assert!(base.get("gm_tone").is_none());
        assert!(base.get("max_actor_depth").is_none());
        assert!(base.get("dice_rolls_enabled").is_none());
        assert_eq!(draft.get(Field::GmTone), "Epic Fantasy");
        assert_eq!(draft.get(Field::ActorDepth), "3");
        assert_eq!(draft.get(Field::Dice), "true");
        draft.set(Field::GmTone, "Dark Fantasy".into());
        draft.set(Field::NarratorStyle, "Knapp und direkt".into());
        draft.set(Field::Dice, "false".into());
        draft.set(Field::DisableOffscreen, "true".into());
        draft.set(Field::ActorDepth, "7".into());
        assert!(draft.apply("draft").is_err());
        draft.set(Field::ActorDepth, "5".into());
        let scene = draft.apply("draft").unwrap();
        let definition = scene.definition();
        assert_eq!(definition["gm_tone"], "Dark Fantasy");
        assert_eq!(definition["narrator_style"], "Knapp und direkt");
        assert_eq!(definition["max_actor_depth"], 5);
        assert_eq!(definition["dice_rolls_enabled"], false);
        assert_eq!(definition["disable_offscreen"], true);
        assert_eq!(
            Draft::from_scene(Some(0), &scene)
                .apply("draft")
                .unwrap()
                .definition(),
            definition
        );
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
