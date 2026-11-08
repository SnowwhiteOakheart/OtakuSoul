//! Reine Projektionen und Filter der Charakterbibliothek, ohne GUI oder Dateizugriff.
use crate::model::Character;
use serde_json::Value;
use std::collections::BTreeSet;

fn data(character: &Character) -> Option<&Value> {
    character
        .card
        .as_ref()
        .map(|card| card.get("data").unwrap_or(card))
}

/// Bereinigte Tags in Kartenreihenfolge; fremde oder fehlerhafte Werte werden ignoriert.
pub fn tags(character: &Character) -> Vec<String> {
    let mut seen = BTreeSet::new();
    data(character)
        .and_then(|data| data.get("tags"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|tag| !tag.is_empty() && seen.insert((*tag).to_owned()))
        .map(str::to_owned)
        .collect()
}

pub fn available_tags(characters: &[Character]) -> Vec<String> {
    characters
        .iter()
        .flat_map(tags)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

/// Textsuche und exakter Tagfilter werden gemeinsam angewendet.
pub fn matches(character: &Character, query: &str, tag: Option<&str>) -> bool {
    let tags = tags(character);
    if tag.is_some_and(|selected| !tags.iter().any(|tag| tag == selected.trim())) {
        return false;
    }
    let query = query.trim().to_lowercase();
    if query.is_empty() {
        return true;
    }
    let personality = data(character)
        .and_then(|data| data.get("personality"))
        .and_then(Value::as_str)
        .unwrap_or_default();
    [
        character.name.as_str(),
        character.description.as_str(),
        personality,
    ]
    .into_iter()
    .chain(tags.iter().map(String::as_str))
    .any(|text| text.to_lowercase().contains(&query))
}

/// Dieselben Inhaltsbreiten wie `useGridCols` der Tauri-Bibliothek.
pub fn columns(width: f32) -> usize {
    if !width.is_finite() || width < 640.0 {
        1
    } else if width < 768.0 {
        2
    } else if width < 1024.0 {
        3
    } else if width < 1280.0 {
        4
    } else {
        5
    }
}

pub fn title(character: &Character) -> String {
    let extensions = data(character).and_then(|data| data.get("extensions"));
    for key in ["custom_title", "sow_title"] {
        if let Some(title) = extensions
            .and_then(|extensions| extensions.get(key))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|title| !title.is_empty())
        {
            return title.to_owned();
        }
    }
    tags(character)
        .into_iter()
        .next()
        .unwrap_or_else(|| "Charakter".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn character(card: Value) -> Character {
        Character {
            id: "test".into(),
            name: "Änne".into(),
            description: "Eine reisende Ärztin".into(),
            first_message: String::new(),
            card: Some(card),
            portrait: None,
        }
    }

    #[test]
    fn search_and_exact_tag_filter_combine_without_case_folding_the_tag() {
        let character =
            character(json!({"data":{"personality":"Geduldig", "tags":[" Fantasy ","Heilerin"]}}));
        assert!(matches(&character, " ÄNNE ", Some(" Fantasy ")));
        assert!(matches(&character, "ärztin", None));
        assert!(matches(&character, "GEDULD", Some("Heilerin")));
        assert!(matches(&character, "heil", None));
        assert!(!matches(&character, "Änne", Some("fantasy")));
        assert!(!matches(&character, "unbekannt", Some("Fantasy")));
    }

    #[test]
    fn tag_projection_preserves_order_while_global_choices_are_unique_and_sorted() {
        let first = character(json!({"tags":[" B ","A","B",null,42,""]}));
        let second = character(json!({"data":{"tags":["C","A"]}}));
        assert_eq!(tags(&first), ["B", "A"]);
        assert_eq!(available_tags(&[first, second]), ["A", "B", "C"]);
    }

    #[test]
    fn title_fallbacks_and_malformed_metadata_do_not_hide_the_character() {
        let mut character = character(
            json!({"data":{"tags":["Fantasy"],"extensions":{"custom_title":" ","sow_title":" Reisende "}}}),
        );
        assert_eq!(title(&character), "Reisende");
        character.card.as_mut().unwrap()["data"]["extensions"]["custom_title"] = "Ärztin".into();
        assert_eq!(title(&character), "Ärztin");
        character.card.as_mut().unwrap()["data"]["extensions"] = Value::Null;
        assert_eq!(title(&character), "Fantasy");
        character.card = Some(json!({"data":null}));
        assert!(tags(&character).is_empty());
        assert_eq!(title(&character), "Charakter");
        assert!(matches(&character, "Änne", None));
        assert!(!matches(&character, "null", None));
    }

    #[test]
    fn grid_columns_follow_each_tauri_breakpoint() {
        for (width, count) in [
            (0.0, 1),
            (639.0, 1),
            (640.0, 2),
            (767.0, 2),
            (768.0, 3),
            (1023.0, 3),
            (1024.0, 4),
            (1279.0, 4),
            (1280.0, 5),
            (2500.0, 5),
        ] {
            assert_eq!(columns(width), count);
        }
        assert_eq!(columns(f32::NAN), 1);
        assert_eq!(columns(-1.0), 1);
    }
}
