//! Flüchtiger Kartenentwurf; übernimmt nur bearbeitete Felder und schreibt keine Dateien.
use crate::model::Character;
use serde_json::{Value, json};
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Field {
    Name,
    Description,
    Personality,
    Scenario,
    FirstMessage,
    ExampleMessages,
    SystemPrompt,
    PostHistory,
    Title,
    Tags,
    CreatorNotes,
}

impl fmt::Display for Field {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::Name => "Name",
            Self::Description => "Beschreibung",
            Self::Personality => "Persönlichkeit",
            Self::Scenario => "Szenario",
            Self::FirstMessage => "Begrüßung",
            Self::ExampleMessages => "Beispieldialoge",
            Self::SystemPrompt => "System-Prompt",
            Self::PostHistory => "Nachspann nach dem Verlauf",
            Self::Title => "Titel",
            Self::Tags => "Tags (eine Zeile je Tag)",
            Self::CreatorNotes => "Erstellernotizen",
        })
    }
}

impl Field {
    pub const ALL: [Self; 11] = [
        Self::Name,
        Self::Description,
        Self::Personality,
        Self::Scenario,
        Self::FirstMessage,
        Self::ExampleMessages,
        Self::SystemPrompt,
        Self::PostHistory,
        Self::Title,
        Self::Tags,
        Self::CreatorNotes,
    ];

    fn key(self) -> &'static str {
        match self {
            Self::Name => "name",
            Self::Description => "description",
            Self::Personality => "personality",
            Self::Scenario => "scenario",
            Self::FirstMessage => "first_mes",
            Self::ExampleMessages => "mes_example",
            Self::SystemPrompt => "system_prompt",
            Self::PostHistory => "post_history_instructions",
            Self::Title => "custom_title",
            Self::Tags => "tags",
            Self::CreatorNotes => "creator_notes",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Draft {
    pub target: Option<usize>,
    values: [String; 11],
    alternate_greetings: Vec<String>,
    alternate_greetings_changed: bool,
    expressions: serde_json::Map<String, Value>,
    expressions_changed: bool,
    bound_lorebooks: Vec<String>,
    bound_lorebooks_changed: bool,
    portrait_override: Option<Vec<u8>>,
}

impl Draft {
    pub fn portrait_override(&self) -> Option<&[u8]> {
        self.portrait_override.as_deref()
    }
    pub fn new() -> Self {
        Self {
            target: None,
            values: Default::default(),
            alternate_greetings: Vec::new(),
            alternate_greetings_changed: false,
            expressions: serde_json::Map::new(),
            expressions_changed: false,
            bound_lorebooks: Vec::new(),
            bound_lorebooks_changed: false,
            portrait_override: None,
        }
    }

    pub fn from_character(index: usize, character: &Character) -> Self {
        Self {
            target: Some(index),
            values: Field::ALL.map(|field| value(character, field)),
            alternate_greetings: character
                .card
                .as_ref()
                .and_then(|card| card.get("data").unwrap_or(card).get("alternate_greetings"))
                .and_then(Value::as_array)
                .map(|greetings| {
                    greetings
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::to_owned)
                        .collect()
                })
                .unwrap_or_default(),
            alternate_greetings_changed: false,
            expressions: expression_map(character),
            expressions_changed: false,
            bound_lorebooks: lorebook_bindings(character),
            bound_lorebooks_changed: false,
            portrait_override: None,
        }
    }

    pub fn get(&self, field: Field) -> &str {
        &self.values[field as usize]
    }

    pub fn set(&mut self, field: Field, value: String) {
        self.values[field as usize] = value;
    }

    pub fn alternate_greetings(&self) -> &[String] {
        &self.alternate_greetings
    }

    pub fn add_greeting(&mut self) {
        self.alternate_greetings.push(String::new());
        self.alternate_greetings_changed = true;
    }

    pub fn set_greeting(&mut self, index: usize, text: String) {
        if let Some(greeting) = self.alternate_greetings.get_mut(index)
            && *greeting != text
        {
            *greeting = text;
            self.alternate_greetings_changed = true;
        }
    }

    pub fn remove_greeting(&mut self, index: usize) {
        if index < self.alternate_greetings.len() {
            self.alternate_greetings.remove(index);
            self.alternate_greetings_changed = true;
        }
    }

    pub fn expressions(&self) -> &serde_json::Map<String, Value> {
        &self.expressions
    }

    pub fn bound_lorebooks(&self) -> &[String] {
        &self.bound_lorebooks
    }

    pub fn set_bound_lorebooks(&mut self, references: Vec<String>) {
        let mut normalized = Vec::new();
        for reference in references {
            let reference = reference.trim();
            if !reference.is_empty()
                && reference != "None"
                && !normalized.iter().any(|existing| existing == reference)
            {
                normalized.push(reference.to_owned());
            }
        }
        if normalized != self.bound_lorebooks {
            self.bound_lorebooks = normalized;
            self.bound_lorebooks_changed = true;
        }
    }

    pub fn set_portrait(&mut self, bytes: Vec<u8>) {
        self.portrait_override = Some(bytes);
    }

    pub fn set_expression(&mut self, key: &str, reference: Option<String>) -> Result<(), String> {
        if key.trim().is_empty() {
            return Err("Bitte einen gültigen Ausdruck auswählen.".into());
        }
        match reference {
            Some(reference) => {
                let reference = Value::String(reference);
                if self.expressions.get(key) != Some(&reference) {
                    self.expressions.insert(key.into(), reference);
                    self.expressions_changed = true;
                }
            }
            None => {
                if self.expressions.remove(key).is_some() {
                    self.expressions_changed = true;
                }
            }
        }
        Ok(())
    }

    /// `existing` ist auch beim Duplizieren die Quellkarte, damit fremde Metadaten und Bild bleiben.
    /// Ein leerer Name wird abgewiesen; alle anderen Texte dürfen bewusst geleert werden.
    pub fn apply(&self, existing: Option<&Character>, id: String) -> Result<Character, String> {
        let name = self.get(Field::Name).trim();
        if name.is_empty() {
            return Err("Bitte einen Namen für den Charakter eingeben.".into());
        }
        let mut card = existing
            .and_then(|character| character.card.clone())
            .unwrap_or_else(|| json!({"spec":"chara_card_v2","spec_version":"2.0","data":{}}));
        if !card.is_object() {
            return Err("Die Charakterkarte enthält kein gültiges JSON-Objekt.".into());
        }
        let data = if card.get("data").is_some() {
            card.get_mut("data").expect("data wurde gerade geprüft")
        } else {
            &mut card
        };
        let data = data
            .as_object_mut()
            .ok_or("Die Charakterkarte enthält keinen gültigen Datenbereich.")?;
        let mut changed = Vec::new();
        if self.alternate_greetings_changed {
            if data.get("alternate_greetings").is_some_and(|value| {
                !value.is_null()
                    && value
                        .as_array()
                        .is_none_or(|list| list.iter().any(|item| !item.is_string()))
            }) {
                return Err("Die alternativen Begrüßungen der ursprünglichen Karte sind keine gültige Textliste und können hier nicht verändert werden.".into());
            }
            data.insert(
                "alternate_greetings".into(),
                json!(self.alternate_greetings),
            );
            changed.push("alternate_greetings");
        }
        for field in Field::ALL {
            let text = if field == Field::Name {
                name
            } else {
                self.get(field)
            };
            if existing.is_none_or(|character| value(character, field) != text)
                || existing.is_some_and(|character| character.card.is_none())
            {
                match field {
                    Field::Title => {
                        let extensions = data.entry("extensions").or_insert_with(|| json!({}));
                        let extensions = extensions.as_object_mut().ok_or(
                            "Der Titel kann nicht geändert werden: Die Erweiterungen der Karte enthalten kein gültiges JSON-Objekt.",
                        )?;
                        extensions.insert("custom_title".into(), text.into());
                        if extensions.contains_key("sow_title") {
                            extensions.insert("sow_title".into(), text.into());
                        }
                        changed.push("sow_title");
                    }
                    Field::Tags => {
                        data.insert(
                            "tags".into(),
                            Value::Array(
                                text.lines()
                                    .map(str::trim)
                                    .filter(|tag| !tag.is_empty())
                                    .map(|tag| Value::String(tag.into()))
                                    .collect(),
                            ),
                        );
                    }
                    _ => {
                        data.insert(field.key().into(), text.into());
                    }
                }
                // Der gemeinsame Renderer akzeptiert auch diese Import-Aliase. Bei einer
                // Bearbeitung darf kein zweiter Wert desselben Felds übrig bleiben.
                if field == Field::ExampleMessages {
                    data.remove("example_messages");
                    data.remove("example_dialogs");
                }
                changed.push(field.key());
            }
        }
        if self.expressions_changed {
            let extensions = data.entry("extensions").or_insert_with(|| json!({}));
            let extensions = extensions.as_object_mut().ok_or(
                "Die Ausdrucksbilder können nicht geändert werden: Die Erweiterungen der Karte enthalten kein gültiges JSON-Objekt.",
            )?;
            // Auch ein leeres kanonisches Objekt sperrt den Legacy-Fallback. Die alten
            // Erweiterungen bleiben erhalten, ohne entfernte Bilder wieder einzublenden.
            extensions.insert(
                "expressions".into(),
                Value::Object(self.expressions.clone()),
            );
        }
        if self.bound_lorebooks_changed {
            let extensions = data.entry("extensions").or_insert_with(|| json!({}));
            let extensions = extensions.as_object_mut().ok_or(
                "Die Lorebook-Bindungen können nicht geändert werden: Die Erweiterungen der Karte enthalten kein gültiges JSON-Objekt.",
            )?;
            extensions.insert("bound_lorebooks".into(), json!(self.bound_lorebooks));
            if let Some(first) = self.bound_lorebooks.first() {
                extensions.insert("selected_lorebook".into(), first.clone().into());
            } else {
                extensions.remove("selected_lorebook");
            }
        }
        // Sonst würde eine alte Übersetzung den gerade bearbeiteten Text in der
        // deutschen Prompt-Vorschau wieder verdecken. Unveränderte Übersetzungen bleiben.
        if let Some(translations) = data
            .get_mut("extensions")
            .and_then(|extensions| extensions.get_mut("otakusoul_i18n"))
            .and_then(|i18n| i18n.get_mut("translations"))
            .and_then(Value::as_object_mut)
        {
            for translation in translations.values_mut().filter_map(Value::as_object_mut) {
                for key in &changed {
                    translation.remove(*key);
                }
            }
        }
        Ok(Character {
            id,
            name: name.into(),
            description: self.get(Field::Description).into(),
            first_message: self.get(Field::FirstMessage).into(),
            card: Some(card),
            portrait: self
                .portrait_override
                .clone()
                .or_else(|| existing.and_then(|character| character.portrait.clone())),
        })
    }
}

/// Dieselbe Reihenfolge wie `load_character_profile`: Legacy-Auswahl vor weiteren Bindungen.
fn lorebook_bindings(character: &Character) -> Vec<String> {
    let Some(extensions) = character
        .card
        .as_ref()
        .and_then(|card| card.get("data").unwrap_or(card).get("extensions"))
    else {
        return Vec::new();
    };
    let mut bindings = Vec::new();
    if let Some(selected) = extensions.get("selected_lorebook").and_then(Value::as_str)
        && !selected.trim().is_empty()
        && selected != "None"
    {
        bindings.push(selected.to_owned());
    }
    if let Some(references) = extensions.get("bound_lorebooks").and_then(Value::as_array) {
        for reference in references.iter().filter_map(Value::as_str) {
            if !reference.trim().is_empty()
                && !bindings.iter().any(|existing| existing == reference)
            {
                bindings.push(reference.to_owned());
            }
        }
    }
    bindings
}

/// Dieselbe Nullish-/Legacy-Präzedenz wie `getPortraitExpressions` im Tauri-Frontend.
fn expression_map(character: &Character) -> serde_json::Map<String, Value> {
    let Some(extensions) = character
        .card
        .as_ref()
        .and_then(|card| card.get("data").unwrap_or(card).get("extensions"))
    else {
        return serde_json::Map::new();
    };
    let selected = extensions
        .get("expressions")
        .filter(|value| !value.is_null())
        .or_else(|| extensions.get("custom_expressions"));
    selected
        .and_then(Value::as_object)
        .or_else(|| extensions.get("sow_expressions").and_then(Value::as_object))
        .cloned()
        .unwrap_or_default()
}

fn value(character: &Character, field: Field) -> String {
    match field {
        Field::Name => character.name.clone(),
        Field::Description => character.description.clone(),
        Field::FirstMessage => character.first_message.clone(),
        _ => {
            let Some(card) = &character.card else {
                return String::new();
            };
            let data = card.get("data").unwrap_or(card);
            if field == Field::Tags {
                return data
                    .get("tags")
                    .and_then(Value::as_array)
                    .map(|tags| {
                        tags.iter()
                            .filter_map(Value::as_str)
                            .collect::<Vec<_>>()
                            .join("\n")
                    })
                    .unwrap_or_default();
            }
            if field == Field::Title {
                return data
                    .get("extensions")
                    .and_then(|extensions| {
                        extensions
                            .get("custom_title")
                            .or_else(|| extensions.get("sow_title"))
                    })
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_owned();
            }
            data.get(field.key())
                .or_else(|| {
                    (field == Field::ExampleMessages)
                        .then(|| {
                            data.get("example_messages")
                                .or_else(|| data.get("example_dialogs"))
                        })
                        .flatten()
                })
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn lorebook_bindings_normalize_changes_and_remove_the_legacy_selection() {
        let original = character(
            json!({"name":"Alice","description":"Original","first_mes":"Hallo",
            "extensions":{"selected_lorebook":"legacy","bound_lorebooks":["other","legacy",42,""]}}),
        );
        let mut draft = Draft::from_character(0, &original);
        assert_eq!(draft.bound_lorebooks(), ["legacy", "other"]);
        draft.set_bound_lorebooks(vec![
            " new ".into(),
            "new".into(),
            "None".into(),
            " ".into(),
            "second".into(),
        ]);
        assert_eq!(draft.bound_lorebooks(), ["new", "second"]);
        let edited = draft.apply(Some(&original), "original".into()).unwrap();
        let card = edited.card.unwrap();
        assert_eq!(card["extensions"]["selected_lorebook"], "new");
        assert_eq!(
            card["extensions"]["bound_lorebooks"],
            json!(["new", "second"])
        );
        draft.set_bound_lorebooks(Vec::new());
        let edited = draft.apply(Some(&original), "original".into()).unwrap();
        let card = edited.card.unwrap();
        assert!(card["extensions"].get("selected_lorebook").is_none());
        assert_eq!(card["extensions"]["bound_lorebooks"], json!([]));
        assert!(
            Draft::from_character(
                0,
                &Character {
                    card: Some(card),
                    ..original
                }
            )
            .bound_lorebooks()
            .is_empty()
        );
    }

    #[test]
    fn untouched_malformed_lorebook_metadata_stays_unchanged() {
        for extensions in [
            Value::Null,
            json!(["foreign"]),
            json!({"selected_lorebook":42,"bound_lorebooks":{"foreign":true}}),
        ] {
            let original = character(
                json!({"name":"Alice","description":"Original","first_mes":"Hallo","extensions":extensions}),
            );
            let mut draft = Draft::from_character(0, &original);
            draft.set_bound_lorebooks(Vec::new());
            let edited = draft.apply(Some(&original), "original".into()).unwrap();
            assert_eq!(edited.card, original.card);
            if !extensions.is_object() {
                draft.set_bound_lorebooks(vec!["book".into()]);
                assert!(draft.apply(Some(&original), "original".into()).is_err());
            }
        }
    }

    #[test]
    fn binding_changes_preserve_embedded_books_and_foreign_extensions() {
        let original = character(
            json!({"spec":"chara_card_v2","data":{"name":"Alice","description":"Original","first_mes":"Hallo",
            "character_book":{"entries":[{"content":"Embedded"}],"foreign":42},
            "extensions":{"foreign":{"kept":true},"embedded_lorebook":{"entries":[]},"bound_lorebooks":["book"]}}}),
        );
        let mut draft = Draft::from_character(0, &original);
        draft.set_bound_lorebooks(vec!["other".into()]);
        let edited = draft.apply(Some(&original), "original".into()).unwrap();
        let card = edited.card.unwrap();
        let source = original.card.unwrap();
        assert_eq!(
            card["data"]["character_book"],
            source["data"]["character_book"]
        );
        assert_eq!(
            card["data"]["extensions"]["foreign"],
            source["data"]["extensions"]["foreign"]
        );
        assert_eq!(
            card["data"]["extensions"]["embedded_lorebook"],
            source["data"]["extensions"]["embedded_lorebook"]
        );
        assert_eq!(card["data"]["extensions"]["selected_lorebook"], "other");
    }

    #[test]
    fn portrait_override_supports_new_cards_without_changing_existing_metadata() {
        let mut new = Draft::new();
        new.set(Field::Name, "Neue Karte".into());
        new.set_portrait(vec![1, 2, 3]);
        assert_eq!(
            new.apply(None, "new".into()).unwrap().portrait,
            Some(vec![1, 2, 3])
        );

        let card = json!({"name":"Alice","description":"Original","first_mes":"Hallo",
            "extensions":{"foreign":{"keep":true},"expressions":{"happy":"happy.webp"}}});
        let original = character(card.clone());
        let mut draft = Draft::from_character(0, &original);
        draft.set_portrait(vec![4, 5, 6]);
        let edited = draft.apply(Some(&original), "original".into()).unwrap();
        assert_eq!(edited.portrait, Some(vec![4, 5, 6]));
        assert_eq!(edited.card, Some(card));
    }

    #[test]
    fn expression_maps_follow_nullish_and_legacy_precedence() {
        for (extensions, expected) in [
            (
                json!({"expressions":{"neutral":"current"},"custom_expressions":{"neutral":"custom"},"sow_expressions":{"neutral":"legacy"}}),
                json!({"neutral":"current"}),
            ),
            (
                json!({"expressions":null,"custom_expressions":{"neutral":"custom"},"sow_expressions":{"neutral":"legacy"}}),
                json!({"neutral":"custom"}),
            ),
            (
                json!({"expressions":[],"custom_expressions":{"neutral":"custom"},"sow_expressions":{"neutral":"legacy"}}),
                json!({"neutral":"legacy"}),
            ),
            (
                json!({"expressions":{},"sow_expressions":{"neutral":"legacy"}}),
                json!({}),
            ),
        ] {
            let original = character(
                json!({"name":"Alice","description":"Original","first_mes":"Hallo","extensions":extensions}),
            );
            assert_eq!(
                Value::Object(Draft::from_character(0, &original).expressions().clone()),
                expected
            );
        }
    }

    #[test]
    fn expression_edits_preserve_unknown_values_and_do_not_resurrect_removed_legacy_images() {
        let original = character(
            json!({"data":{"name":"Alice","description":"Original","first_mes":"Hallo",
            "extensions":{"sow_expressions":{"neutral":"old.png","sad":"sad.png","future_slot":{"opaque":true}},
                "foreign":[1,2],"otakusoul_i18n":{"translations":{"de":{"description":"Beschreibung"}}}}}}),
        );
        let mut draft = Draft::from_character(0, &original);
        draft
            .set_expression("neutral", Some("data:image/png;base64,new".into()))
            .unwrap();
        draft.set_expression("sad", None).unwrap();
        let edited = draft.apply(Some(&original), "original".into()).unwrap();
        let extensions = &edited.card.as_ref().unwrap()["data"]["extensions"];
        assert_eq!(
            extensions["expressions"]["neutral"],
            "data:image/png;base64,new"
        );
        assert_eq!(
            extensions["expressions"]["future_slot"],
            json!({"opaque":true})
        );
        assert_eq!(extensions["foreign"], json!([1, 2]));
        assert_eq!(
            extensions["otakusoul_i18n"]["translations"]["de"]["description"],
            "Beschreibung"
        );
        assert_eq!(extensions["sow_expressions"]["sad"], "sad.png");
        let mut roundtrip = Draft::from_character(0, &edited);
        assert!(!roundtrip.expressions().contains_key("sad"));
        roundtrip.set_expression("neutral", None).unwrap();
        roundtrip.set_expression("future_slot", None).unwrap();
        let empty = roundtrip.apply(Some(&edited), "original".into()).unwrap();
        assert!(Draft::from_character(0, &empty).expressions().is_empty());
    }

    #[test]
    fn untouched_expression_data_is_preserved_and_malformed_extensions_cannot_be_replaced() {
        for extensions in [
            Value::Null,
            json!(["foreign"]),
            json!("foreign"),
            json!({"expressions":[42],"custom_expressions":false}),
        ] {
            let card = json!({"name":"Alice","description":"Original","first_mes":"Hallo","extensions":extensions});
            let original = character(card.clone());
            let mut draft = Draft::from_character(0, &original);
            assert!(draft.set_expression(" ", Some("image".into())).is_err());
            assert_eq!(
                draft
                    .apply(Some(&original), "original".into())
                    .unwrap()
                    .card,
                Some(card)
            );
            draft
                .set_expression("neutral", Some("image".into()))
                .unwrap();
            if !extensions.is_object() {
                assert!(draft.apply(Some(&original), "original".into()).is_err());
            }
        }
        let original =
            character(json!({"name":"Alice","description":"Original","first_mes":"Hallo"}));
        let mut draft = Draft::from_character(0, &original);
        draft
            .set_expression("neutral", Some("new.png".into()))
            .unwrap();
        assert_eq!(
            draft
                .apply(Some(&original), "original".into())
                .unwrap()
                .card
                .unwrap()["extensions"]["expressions"]["neutral"],
            "new.png"
        );
    }

    fn character(card: Value) -> Character {
        Character {
            id: "original".into(),
            name: "Alice".into(),
            description: "Original".into(),
            first_message: "Hallo".into(),
            card: Some(card),
            portrait: Some(vec![1, 2, 3]),
        }
    }

    #[test]
    fn editing_preserves_unknown_fields_and_flat_or_v2_shape() {
        for wrapped in [false, true] {
            let data = json!({"name":"Alice","description":"Original","first_mes":"Hallo",
                "extensions":{"foreign":{"secret":42}},"character_book":{"entries":[]},
                "example_messages":"Old example"});
            let card = if wrapped {
                json!({"spec":"chara_card_v2","data":data,"foreign_top":true})
            } else {
                data
            };
            let original = character(card);
            let mut draft = Draft::from_character(3, &original);
            assert_eq!(draft.target, Some(3));
            draft.set(Field::Name, "  Beth  ".into());
            draft.set(Field::ExampleMessages, "New example".into());
            let edited = draft.apply(Some(&original), "new-id".into()).unwrap();
            assert_eq!(edited.name, "Beth");
            assert_eq!(edited.portrait, original.portrait);
            assert_eq!(edited.id, "new-id");
            let card = edited.card.unwrap();
            assert_eq!(card.get("data").is_some(), wrapped);
            let data = card.get("data").unwrap_or(&card);
            assert_eq!(data["extensions"]["foreign"]["secret"], 42);
            assert!(data["character_book"].is_object());
            assert_eq!(data["mes_example"], "New example");
            assert!(data.get("example_messages").is_none());
            if wrapped {
                assert_eq!(card["foreign_top"], true);
            }
        }
    }

    #[test]
    fn blank_names_fail_and_new_cards_have_v2_metadata() {
        let mut draft = Draft::new();
        draft.set(Field::Name, " \n ".into());
        assert!(draft.apply(None, "new".into()).is_err());
        draft.set(Field::Name, " Neue Figur ".into());
        let created = draft.apply(None, "new".into()).unwrap();
        assert_eq!(created.name, "Neue Figur");
        assert_eq!(created.card.unwrap()["spec"], "chara_card_v2");
        assert!(created.portrait.is_none());
    }

    #[test]
    fn only_translations_of_changed_fields_are_removed() {
        let original = character(json!({"data":{"name":"Alice","description":"Original",
            "first_mes":"Hallo","extensions":{"otakusoul_i18n":{"source_language":"en",
            "translations":{"de":{"name":"Alice DE","description":"Alt","scenario":"Szene"},
                "ja":{"description":"古い"}}}}}}));
        let mut draft = Draft::from_character(0, &original);
        draft.set(Field::Description, "Neu".into());
        let edited = draft.apply(Some(&original), "original".into()).unwrap();
        let card = edited.card.unwrap();
        let translations = &card["data"]["extensions"]["otakusoul_i18n"]["translations"];
        assert!(translations["de"].get("description").is_none());
        assert!(translations["ja"].get("description").is_none());
        assert_eq!(translations["de"]["name"], "Alice DE");
        assert_eq!(translations["de"]["scenario"], "Szene");
    }

    #[test]
    fn metadata_edit_preserves_foreign_extensions_and_updates_title_aliases() {
        let original = character(json!({"data":{"name":"Alice","description":"Original",
            "first_mes":"Hallo","tags":["fantasy","ruhig"],"creator_notes":"Alt",
            "extensions":{"sow_title":"Alter Titel","foreign":{"keep":[1,2]},
                "otakusoul_i18n":{"translations":{"de":{"custom_title":"Übersetzt",
                    "sow_title":"Alt","description":"Beschreibung"}}}}}}));
        let mut draft = Draft::from_character(0, &original);
        assert_eq!(draft.get(Field::Title), "Alter Titel");
        assert_eq!(draft.get(Field::Tags), "fantasy\nruhig");
        assert_eq!(draft.get(Field::CreatorNotes), "Alt");
        draft.set(Field::Title, "Neuer Titel".into());
        draft.set(Field::Tags, " Romanze \n\n Japan, modern \n".into());
        draft.set(Field::CreatorNotes, "Notizen\nmit Zeilenumbruch".into());
        let edited = draft.apply(Some(&original), "original".into()).unwrap();
        let data = &edited.card.as_ref().unwrap()["data"];
        assert_eq!(data["tags"], json!(["Romanze", "Japan, modern"]));
        assert_eq!(data["creator_notes"], "Notizen\nmit Zeilenumbruch");
        assert_eq!(data["extensions"]["custom_title"], "Neuer Titel");
        assert_eq!(data["extensions"]["sow_title"], "Neuer Titel");
        assert_eq!(data["extensions"]["foreign"], json!({"keep":[1,2]}));
        let translation = &data["extensions"]["otakusoul_i18n"]["translations"]["de"];
        assert!(translation.get("custom_title").is_none());
        assert!(translation.get("sow_title").is_none());
        assert_eq!(translation["description"], "Beschreibung");
        let roundtrip = Draft::from_character(0, &edited);
        assert_eq!(roundtrip.get(Field::Tags), "Romanze\nJapan, modern");
    }

    #[test]
    fn unchanged_metadata_stays_absent_and_malformed_extensions_are_not_replaced() {
        let original = character(
            json!({"name":"Alice","description":"Original","first_mes":"Hallo",
            "extensions":["fremde Daten"]}),
        );
        let mut draft = Draft::from_character(0, &original);
        draft.set(Field::CreatorNotes, "Notiz".into());
        let edited = draft.apply(Some(&original), "original".into()).unwrap();
        let card = edited.card.unwrap();
        assert!(card.get("tags").is_none());
        assert_eq!(card["extensions"], json!(["fremde Daten"]));
        draft.set(Field::Title, "Titel".into());
        assert!(draft.apply(Some(&original), "original".into()).is_err());

        let mut new = Draft::new();
        new.set(Field::Name, "Neu".into());
        let created = new.apply(None, "new".into()).unwrap();
        assert_eq!(created.card.unwrap()["data"]["tags"], json!([]));
    }

    #[test]
    fn untouched_alternate_greetings_preserve_missing_and_malformed_data() {
        for list in [
            None,
            Some(Value::Null),
            Some(json!("foreign text")),
            Some(json!(["Valid", 42])),
        ] {
            let mut card =
                json!({"name":"Alice","description":"Original","first_mes":"Hallo","foreign":true});
            if let Some(list) = list {
                card["alternate_greetings"] = list;
            }
            let original = character(card.clone());
            let draft = Draft::from_character(0, &original);
            assert_eq!(
                draft
                    .apply(Some(&original), "original".into())
                    .unwrap()
                    .card,
                Some(card)
            );
        }
    }

    #[test]
    fn alternate_greetings_edit_preserves_multiline_macros_order_and_other_translations() {
        let original = character(
            json!({"data":{"name":"Alice","description":"Original","first_mes":"Hallo",
            "alternate_greetings":["First", "Second"], "foreign":{"keep":true},
            "extensions":{"otakusoul_i18n":{"translations":{"de":{"alternate_greetings":["Alt"],"description":"Beschreibung"},
                "ja":{"alternate_greetings":["前"]}}}}}}),
        );
        let mut draft = Draft::from_character(0, &original);
        draft.set_greeting(0, "{{user}}\n*{{char}} winkt.*".into());
        draft.remove_greeting(1);
        draft.add_greeting();
        draft.set_greeting(99, "ignorieren".into());
        draft.remove_greeting(99);
        assert_eq!(
            draft.alternate_greetings(),
            &["{{user}}\n*{{char}} winkt.*", ""]
        );
        let edited = draft.apply(Some(&original), "original".into()).unwrap();
        let data = &edited.card.as_ref().unwrap()["data"];
        assert_eq!(
            data["alternate_greetings"],
            json!(["{{user}}\n*{{char}} winkt.*", ""])
        );
        assert_eq!(data["foreign"], json!({"keep":true}));
        let translations = &data["extensions"]["otakusoul_i18n"]["translations"];
        assert!(translations["de"].get("alternate_greetings").is_none());
        assert!(translations["ja"].get("alternate_greetings").is_none());
        assert_eq!(translations["de"]["description"], "Beschreibung");
        assert_eq!(
            Draft::from_character(0, &edited).alternate_greetings(),
            draft.alternate_greetings()
        );
    }

    #[test]
    fn changing_malformed_greetings_is_rejected_but_null_is_an_empty_list() {
        for list in [json!("foreign text"), json!(["Valid", 42])] {
            let original = character(
                json!({"name":"Alice","description":"Original","first_mes":"Hallo","alternate_greetings":list}),
            );
            let mut draft = Draft::from_character(0, &original);
            draft.add_greeting();
            assert!(
                draft
                    .apply(Some(&original), "original".into())
                    .is_err_and(|error| error.contains("Textliste"))
            );
        }
        let original = character(
            json!({"name":"Alice","description":"Original","first_mes":"Hallo","alternate_greetings":null}),
        );
        let mut draft = Draft::from_character(0, &original);
        draft.add_greeting();
        let edited = draft.apply(Some(&original), "original".into()).unwrap();
        assert_eq!(edited.card.unwrap()["alternate_greetings"], json!([""]));
    }
}
