//! Language of story content the app writes itself (stage narration, suggestions, memory
//! defaults, bot replies). It follows the character's reply language, not the interface
//! language, so text inserted into a conversation matches the story.
//!
//! Translations for languages are loaded dynamically from `locales/` in the presets repo.
//! English is the default fallback encoded in the Rust source.

#![allow(clippy::collapsible_if)]

use std::borrow::Cow;
use std::collections::HashMap;
use std::path::Path;
use std::sync::OnceLock;
use std::sync::RwLock;

static TRANSLATIONS: OnceLock<RwLock<HashMap<String, HashMap<String, String>>>> = OnceLock::new();

fn translations() -> &'static RwLock<HashMap<String, HashMap<String, String>>> {
    TRANSLATIONS.get_or_init(|| RwLock::new(HashMap::new()))
}

/// Story-text files in `dir` (`<id>.json`); any language with a file there counts.
fn story_languages_in(dir: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if !path.is_file() || path.extension().and_then(|ext| ext.to_str()) != Some("json") {
                return None;
            }
            let id = path.file_stem()?.to_str()?.to_string();
            crate::modules::ui_locales::is_language_id(&id).then_some(id)
        })
        .collect()
}

/// Languages to fetch story texts for: the ones already known plus every installed interface
/// language, so a new translation also gets story texts once the data repository has them.
/// English is the source in the code.
fn story_languages() -> Vec<String> {
    let mut languages: Vec<String> = translations().read().unwrap().keys().cloned().collect();
    languages.extend(
        crate::modules::ui_locales::available_languages()
            .into_iter()
            .map(|language| language.id),
    );
    languages.retain(|id| id != "en");
    languages.sort();
    languages.dedup();
    languages
}

fn downloaded_locales_dir() -> std::path::PathBuf {
    std::path::PathBuf::from(crate::modules::paths::resolve_app_paths().data_dir).join("locales")
}

fn read_locale(path: &Path) -> Option<HashMap<String, String>> {
    let content = std::fs::read_to_string(path).ok()?;
    serde_json::from_str::<HashMap<String, String>>(&content)
        .ok()
        .filter(|dict| !dict.is_empty())
}

fn merge_locale(lang: &str, dict: HashMap<String, String>) {
    translations()
        .write()
        .unwrap()
        .entry(lang.to_string())
        .or_default()
        .extend(dict);
}

/// Loads the story texts: the copy shipped in `presets/locales/`, then a newer one downloaded
/// from the data repository (`<Daten>/locales/`, see [`refresh_locales`]). Call once the
/// resource folder is known.
pub fn load_locales() {
    let paths = crate::modules::paths::resolve_app_paths();
    let bundled = std::path::PathBuf::from(&paths.bundled_presets_dir).join("locales");
    for dir in [bundled, downloaded_locales_dir()] {
        for lang in story_languages_in(&dir) {
            if let Some(dict) = read_locale(&dir.join(format!("{lang}.json"))) {
                merge_locale(&lang, dict);
            }
        }
    }
}

/// Fetches the current story texts from the data repository, keeps them for the next start and
/// applies them right away. Errors only end up in the log (the shipped copy stays in use).
pub async fn refresh_locales() {
    let Ok(client) = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
    else {
        return;
    };
    let dir = downloaded_locales_dir();
    for lang in story_languages() {
        let url = crate::modules::hub::hub_url(&format!("locales/{lang}.json"));
        let text = match client
            .get(&url)
            .send()
            .await
            .and_then(reqwest::Response::error_for_status)
        {
            Ok(response) => match response.text().await {
                Ok(text) => text,
                Err(e) => {
                    tracing::debug!("Spieltexte {lang} nicht geladen: {e}");
                    continue;
                }
            },
            Err(e) => {
                tracing::debug!("Spieltexte {lang} nicht geladen: {e}");
                continue;
            }
        };
        let Ok(dict) = serde_json::from_str::<HashMap<String, String>>(&text) else {
            tracing::warn!("Spieltexte {lang} aus dem Daten-Repo sind kein gültiges JSON");
            continue;
        };
        if dict.is_empty() {
            continue;
        }
        let _ = std::fs::create_dir_all(&dir);
        if let Err(e) = std::fs::write(dir.join(format!("{lang}.json")), &text) {
            tracing::warn!("Spieltexte {lang} nicht gespeichert: {e}");
        }
        merge_locale(&lang, dict);
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
        other => {
            return crate::modules::ui_locales::language_id_for_name(other)
                .unwrap_or_else(|| other.to_string());
        }
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

    /// Story texts the app writes into every Stage scene; the shipped copies must translate them.
    #[test]
    fn shipped_story_texts_translate_the_scene_defaults() {
        for (lang, raw) in [
            ("de", include_str!("../../../presets/locales/de.json")),
            ("ru", include_str!("../../../presets/locales/ru.json")),
            ("ja", include_str!("../../../presets/locales/ja.json")),
        ] {
            let dict: HashMap<String, String> = serde_json::from_str(raw).unwrap();
            for key in [
                "Player",
                "Companion",
                "Dramatic tension",
                "Study the surroundings closely",
                "Dusk",
            ] {
                let text = dict
                    .get(key)
                    .unwrap_or_else(|| panic!("{lang}: {key} fehlt"));
                assert_ne!(text, key, "{lang}: {key} unübersetzt");
            }
        }
    }

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
            "3 x five"
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
