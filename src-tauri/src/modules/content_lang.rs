//! Language of story content the app writes itself (stage narration, suggestions, memory
//! defaults, bot replies). It follows the character's reply language, not the interface
//! language, so text inserted into a conversation matches the story.
//!
//! Translations for languages are loaded dynamically from `locales/` in the presets repo.
//! English is the default fallback encoded in the Rust source.

use std::path::Path;
use std::sync::OnceLock;
use std::collections::HashMap;
use std::sync::RwLock;
use std::borrow::Cow;

static TRANSLATIONS: OnceLock<RwLock<HashMap<String, HashMap<String, String>>>> = OnceLock::new();

fn translations() -> &'static RwLock<HashMap<String, HashMap<String, String>>> {
    TRANSLATIONS.get_or_init(|| RwLock::new(HashMap::new()))
}

pub fn load_locales() {
    let paths = crate::modules::paths::resolve_app_paths();
    let locales_dir = std::path::PathBuf::from(&paths.bundled_presets_dir).parent().unwrap().join("locales");
    if let Ok(entries) = std::fs::read_dir(&locales_dir) {
        let mut map = translations().write().unwrap();
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().is_some_and(|e| e == "json") {
                let lang = path.file_stem().unwrap().to_string_lossy().to_string();
                if let Ok(content) = std::fs::read_to_string(&path) {
                    if let Ok(dict) = serde_json::from_str::<HashMap<String, String>>(&content) {
                        map.insert(lang, dict);
                    }
                }
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContentLang(pub String);

impl ContentLang {
    pub fn from_reply_language(name: &str) -> Self {
        Self(language_code(name))
    }

    pub fn current() -> Self {
        if cfg!(test) {
            return Self("de".to_string());
        }
        let path = crate::modules::settings::get_settings_file_path();
        Self::from_settings_file(&path)
    }

    pub fn reply_language_name() -> String {
        reply_language_in(&crate::modules::settings::get_settings_file_path())
            .unwrap_or_else(|| "Deutsch".to_string())
    }

    fn from_settings_file(path: &Path) -> Self {
        reply_language_in(path)
            .map(|name| Self::from_reply_language(&name))
            .unwrap_or_else(|| Self("de".to_string()))
    }

    pub fn t<'a>(&'a self, en: &'a str) -> Cow<'a, str> {
        let map = translations().read().unwrap();
        if let Some(lang_map) = map.get(&self.0) {
            if let Some(translated) = lang_map.get(en) {
                return Cow::Owned(translated.clone());
            }
        }
        Cow::Borrowed(en)
    }

    pub fn fill_t(&self, en: &str, args: &[&dyn std::fmt::Display]) -> String {
        let template = self.t(en);
        let mut parts = template.split("{}");
        let mut out = parts.next().unwrap_or_default().to_string();
        for (index, part) in parts.enumerate() {
            if let Some(arg) = args.get(index) {
                out.push_str(&arg.to_string());
            }
            out.push_str(part);
        }
        out
    }

    pub fn none_marker(&self) -> String {
        self.t("None.").into_owned()
    }
}

pub fn language_code(reply_language: &str) -> String {
    let name = reply_language.trim().to_lowercase();
    match name.as_str() {
        "deutsch" | "german" => "de",
        "english" | "englisch" => "en",
        "русский" | "russian" => "ru",
        "日本語" | "japanese" => "ja",
        "français" | "francais" | "french" => "fr",
        "español" | "espanol" | "spanish" => "es",
        other => return other.to_string(),
    }
    .to_string()
}

fn reply_language_in(path: &Path) -> Option<String> {
    let content = std::fs::read_to_string(path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&content).ok()?;
    value.get("reply_language")?.as_str().map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_reply_languages() {
        assert_eq!(ContentLang::from_reply_language("Deutsch").0, "de");
        assert_eq!(ContentLang::from_reply_language("English").0, "en");
        assert_eq!(ContentLang::from_reply_language("Русский").0, "ru");
        assert_eq!(ContentLang::from_reply_language("日本語").0, "ja");
    }

    #[test]
    fn maps_reply_languages_to_codes() {
        assert_eq!(language_code("Deutsch"), "de");
        assert_eq!(language_code("Русский"), "ru");
        assert_eq!(language_code("日本語"), "ja");
        assert_eq!(language_code("en"), "en");
    }

    #[test]
    fn fills_placeholders_in_order() {
        assert_eq!(
            ContentLang("en".to_string()).fill_t("{} x {}", &[&3, &"five"]),
            "3 of five"
        );
    }

    #[test]
    fn reads_the_reply_language_from_settings() {
        let dir =
            std::env::temp_dir().join(format!("otakusoul-content-lang-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("settings.json");
        std::fs::write(&path, r#"{"reply_language":"English"}"#).unwrap();
        assert_eq!(ContentLang::from_settings_file(&path).0, "en");
        assert_eq!(
            ContentLang::from_settings_file(&dir.join("missing.json")).0,
            "de"
        );
        let _ = std::fs::remove_dir_all(dir);
    }
}
