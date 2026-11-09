//! Gemeinsame UI-Sprachpakete. Inhaltsübersetzungen bleiben im jeweiligen Fachmodul.
use serde_json::Value;
use std::sync::OnceLock;

pub const UI_LANGUAGE: &str = "de";
pub const CONTENT_LANGUAGE: &str = "de";

pub fn text(key: &'static str) -> &'static str {
    lookup(UI_LANGUAGE, key)
}

fn lookup(language: &str, key: &'static str) -> &'static str {
    lookup_existing(language, key).unwrap_or(key)
}

pub fn lookup_existing(language: &str, key: &str) -> Option<&'static str> {
    static NATIVE_DE: OnceLock<Value> = OnceLock::new();
    pack(language)
        .get(key)
        .and_then(Value::as_str)
        .or_else(|| pack("en").get(key).and_then(Value::as_str))
        .or_else(|| {
            NATIVE_DE
                .get_or_init(|| {
                    serde_json::from_str(include_str!("../assets/locales/de.json"))
                        .expect("Mitgeliefertes natives UI-Sprachpaket")
                })
                .get(key)
                .and_then(Value::as_str)
        })
}

fn pack(language: &str) -> &'static Value {
    static DE: OnceLock<Value> = OnceLock::new();
    static EN: OnceLock<Value> = OnceLock::new();
    static JA: OnceLock<Value> = OnceLock::new();
    static RU: OnceLock<Value> = OnceLock::new();
    let (cache, source) = match language {
        "de" => (&DE, include_str!("../../presets/locales/ui/de.json")),
        "ja" => (&JA, include_str!("../../presets/locales/ui/ja.json")),
        "ru" => (&RU, include_str!("../../presets/locales/ui/ru.json")),
        _ => (&EN, include_str!("../../presets/locales/ui/en.json")),
    };
    cache.get_or_init(|| serde_json::from_str(source).expect("Mitgeliefertes UI-Sprachpaket"))
}

pub fn format(key: &'static str, values: &[(&str, &str)]) -> String {
    let mut rendered = String::new();
    let mut remaining = text(key);
    while let Some((before, after)) = remaining.split_once("{{") {
        let Some((name, rest)) = after.split_once("}}") else {
            break;
        };
        rendered.push_str(before);
        if let Some((_, value)) = values.iter().find(|(parameter, _)| *parameter == name) {
            rendered.push_str(value);
        } else {
            rendered.push_str("{{");
            rendered.push_str(name);
            rendered.push_str("}}");
        }
        remaining = rest;
    }
    rendered.push_str(remaining);
    rendered
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shared_packages_resolve_existing_hub_keys() {
        for language in ["de", "en", "ja", "ru"] {
            assert!(pack(language)["hub.collectionCharacters"].is_string());
        }
        assert_eq!(
            lookup("unsupported", "common.back"),
            lookup("en", "common.back")
        );
        assert!(format("hub.collectionOpen", &[("name", "{{title}}")]).contains("{{title}}"));
    }
}
