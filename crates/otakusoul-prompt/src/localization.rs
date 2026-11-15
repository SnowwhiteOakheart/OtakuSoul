//! Die renderrelevanten Kartentexte nach derselben Fallbackregel wie CharacterData.
use crate::Character;
use serde_json::Value;

fn translation<'a>(i18n: Option<&'a Value>, language: &str) -> Option<&'a Value> {
    let i18n = i18n?;
    let translations = i18n.get("translations")?;
    if let Some(own) = translations.get(language) {
        return Some(own);
    }
    let source = i18n.get("source_language").and_then(Value::as_str)?;
    if source == language || source == "en" || language == "en" {
        return None;
    }
    translations.get("en")
}

/// Lokalisiert nur die vom Renderer gebrauchten Felder. Leere Texte und unbekannte Felder
/// verändern die Projektion nicht. Die Originalkarte für den Nachspann bleibt beim Aufrufer.
pub fn localized_character(original: &Character, language: &str) -> Character {
    let Some(translation) =
        translation(original.extensions.get("otakusoul_i18n"), language).and_then(Value::as_object)
    else {
        return original.clone();
    };
    // CharacterData::localized fällt beim Deserialisieren ungültiger übersetzter Listen
    // auf die vollständige Originalkarte zurück, auch für deren Promptfelder.
    if ["alternate_greetings", "tags"].iter().any(|key| {
        translation
            .get(*key)
            .and_then(Value::as_array)
            .is_some_and(|list| list.iter().any(|item| !item.is_string()))
    }) {
        return original.clone();
    }
    let mut localized = original.clone();
    for (key, target) in [
        ("name", &mut localized.name),
        ("description", &mut localized.description),
        ("personality", &mut localized.personality),
        ("scenario", &mut localized.scenario),
        ("mes_example", &mut localized.mes_example),
    ] {
        if let Some(text) = translation.get(key).and_then(Value::as_str)
            && !text.trim().is_empty()
        {
            *target = text.to_owned();
        }
    }
    for (key, target) in [
        ("system_prompt", &mut localized.system_prompt),
        (
            "post_history_instructions",
            &mut localized.post_history_instructions,
        ),
    ] {
        if let Some(text) = translation.get(key).and_then(Value::as_str)
            && !text.trim().is_empty()
        {
            *target = Some(text.to_owned());
        }
    }
    if let Some(title) = translation
        .get("custom_title")
        .or_else(|| translation.get("sow_title"))
        .and_then(Value::as_str)
        && let Some(extensions) = localized.extensions.as_object_mut()
    {
        extensions.insert("custom_title".into(), title.into());
        if extensions.contains_key("sow_title") {
            extensions.insert("sow_title".into(), title.into());
        }
    }
    localized
}

#[cfg(test)]
mod tests {
    use super::*;

    fn card(source: Option<&str>) -> Character {
        let mut i18n = serde_json::json!({"translations":{"en":{"description":"English background"},"fr":{"description":"Fond français"}}});
        if let Some(source) = source {
            i18n["source_language"] = source.into();
        }
        Character {
            description: "Deutscher Hintergrund".into(),
            extensions: serde_json::json!({"otakusoul_i18n":i18n}),
            ..Character::default()
        }
    }

    #[test]
    fn explicit_translation_precedes_source_and_english_fallback_is_conditional() {
        let original = card(Some("de"));
        assert_eq!(
            localized_character(&original, "fr").description,
            "Fond français"
        );
        assert_eq!(
            localized_character(&original, "ja").description,
            "English background"
        );
        assert_eq!(
            localized_character(&original, "de").description,
            "Deutscher Hintergrund"
        );
        assert_eq!(
            localized_character(&card(Some("en")), "ja").description,
            "Deutscher Hintergrund"
        );
        assert_eq!(
            localized_character(&card(None), "ja").description,
            "Deutscher Hintergrund"
        );
        assert_eq!(
            localized_character(&card(None), "en").description,
            "English background"
        );
    }

    #[test]
    fn blank_translations_preserve_optional_values_and_title_metadata() {
        let original = Character {
            name: "Aiko".into(),
            description: "Basis".into(),
            system_prompt: Some("Originalsystem".into()),
            post_history_instructions: None,
            extensions: serde_json::json!({"sow_title":"Alt","unknown":42,"otakusoul_i18n":{"translations":{"fr":{"name":" ","description":"Traduit","system_prompt":"\n ","post_history_instructions":"Après","custom_title":"Titre"}}}}),
            ..Character::default()
        };
        let localized = localized_character(&original, "fr");
        assert_eq!(localized.name, "Aiko");
        assert_eq!(localized.description, "Traduit");
        assert_eq!(localized.system_prompt.as_deref(), Some("Originalsystem"));
        assert_eq!(
            localized.post_history_instructions.as_deref(),
            Some("Après")
        );
        assert_eq!(localized.extensions["custom_title"], "Titre");
        assert_eq!(localized.extensions["sow_title"], "Titre");
        assert_eq!(localized.extensions["unknown"], 42);
        assert_eq!(original.description, "Basis");
        assert!(original.post_history_instructions.is_none());

        let mut blank_title = original.clone();
        blank_title.extensions["otakusoul_i18n"]["translations"]["fr"]["custom_title"] = "".into();
        assert_eq!(
            localized_character(&blank_title, "fr").extensions["custom_title"],
            ""
        );
    }

    #[test]
    fn malformed_own_translation_does_not_silently_choose_another_language() {
        let mut original = card(Some("de"));
        original.extensions["otakusoul_i18n"]["translations"]["ja"] = Value::Null;
        assert_eq!(
            localized_character(&original, "ja").description,
            "Deutscher Hintergrund"
        );
    }

    #[test]
    fn malformed_translated_lists_preserve_the_entire_original_projection() {
        for key in ["alternate_greetings", "tags"] {
            let mut original = card(Some("de"));
            original.extensions["otakusoul_i18n"]["translations"]["fr"][key] =
                serde_json::json!(["Valide", 42]);
            assert_eq!(
                localized_character(&original, "fr").description,
                original.description,
                "{key}"
            );
        }
    }
}
