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
        })
    }
}

impl Field {
    pub const ALL: [Self; 8] = [
        Self::Name,
        Self::Description,
        Self::Personality,
        Self::Scenario,
        Self::FirstMessage,
        Self::ExampleMessages,
        Self::SystemPrompt,
        Self::PostHistory,
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
        }
    }
}

#[derive(Debug, Clone)]
pub struct Draft {
    pub target: Option<usize>,
    values: [String; 8],
}

impl Draft {
    pub fn new() -> Self {
        Self {
            target: None,
            values: Default::default(),
        }
    }

    pub fn from_character(index: usize, character: &Character) -> Self {
        Self {
            target: Some(index),
            values: Field::ALL.map(|field| value(character, field).to_owned()),
        }
    }

    pub fn get(&self, field: Field) -> &str {
        &self.values[field as usize]
    }

    pub fn set(&mut self, field: Field, value: String) {
        self.values[field as usize] = value;
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
        for field in Field::ALL {
            let text = if field == Field::Name {
                name
            } else {
                self.get(field)
            };
            if existing.is_none_or(|character| value(character, field) != text)
                || existing.is_some_and(|character| character.card.is_none())
            {
                data.insert(field.key().into(), text.into());
                // Der gemeinsame Renderer akzeptiert auch diese Import-Aliase. Bei einer
                // Bearbeitung darf kein zweiter Wert desselben Felds übrig bleiben.
                if field == Field::ExampleMessages {
                    data.remove("example_messages");
                    data.remove("example_dialogs");
                }
                changed.push(field.key());
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
            portrait: existing.and_then(|character| character.portrait.clone()),
        })
    }
}

fn value(character: &Character, field: Field) -> &str {
    match field {
        Field::Name => &character.name,
        Field::Description => &character.description,
        Field::FirstMessage => &character.first_message,
        _ => {
            let Some(card) = &character.card else {
                return "";
            };
            let data = card.get("data").unwrap_or(card);
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
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
