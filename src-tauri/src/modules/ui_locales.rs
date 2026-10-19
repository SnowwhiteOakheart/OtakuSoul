//! Interface languages: one JSON dictionary per language, so a new language needs no new build.
//! The shipped ones live in `presets/locales/ui/`, own and community translations in
//! `<Daten>/locales/ui/` (survives updates). A file there with the id of a shipped language only
//! overrides the keys it contains. German is the reference; the frontend also has it built in.
//!
//! File format: flat `"key": "text"` pairs plus an optional `"__meta"` object
//! (`name`, `englishName`, `author`, `version`, `fallback`). The file name is the language id.

use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use ts_rs::TS;

const META_KEY: &str = "__meta";
/// Copy of the English texts for translators; the leading underscore keeps it out of the list.
const TEMPLATE_FILE: &str = "_template.json";

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct UiLanguage {
    /// File name without `.json`, a BCP 47 tag such as `fr` or `pt-BR`.
    pub id: String,
    /// Name in the language itself ("Français").
    pub name: String,
    pub english_name: String,
    pub author: String,
    pub version: String,
    /// Language for keys this one lacks, before German (e.g. `en`).
    pub fallback: Option<String>,
    /// Keys of the German reference this language translates.
    pub translated: u32,
    /// Keys of the German reference.
    pub total: u32,
    /// A file in the user folder adds or changes this language.
    pub custom: bool,
}

#[derive(Default)]
struct Meta {
    name: Option<String>,
    english_name: Option<String>,
    author: Option<String>,
    version: Option<String>,
    fallback: Option<String>,
}

struct LocaleFile {
    meta: Meta,
    texts: HashMap<String, String>,
}

pub fn bundled_dir() -> PathBuf {
    PathBuf::from(crate::modules::paths::resolve_app_paths().bundled_presets_dir)
        .join("locales")
        .join("ui")
}

pub fn user_dir() -> PathBuf {
    PathBuf::from(crate::modules::paths::resolve_app_paths().data_dir)
        .join("locales")
        .join("ui")
}

/// Language tags only (`de`, `pt-BR`, `zh-Hant`): the id becomes a file name.
pub fn is_language_id(id: &str) -> bool {
    let mut parts = id.split('-');
    let primary = parts.next().unwrap_or_default();
    (2..=3).contains(&primary.len())
        && primary.chars().all(|c| c.is_ascii_alphabetic())
        && parts.all(|part| {
            (2..=8).contains(&part.len()) && part.chars().all(|c| c.is_ascii_alphanumeric())
        })
}

fn meta_text(meta: &serde_json::Map<String, serde_json::Value>, key: &str) -> Option<String> {
    meta.get(key)
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_string)
}

fn parse_locale(content: &str) -> Option<LocaleFile> {
    let serde_json::Value::Object(map) = serde_json::from_str(content).ok()? else {
        return None;
    };
    let mut meta = Meta::default();
    let mut texts = HashMap::with_capacity(map.len());
    for (key, value) in map {
        match value {
            serde_json::Value::String(text) => {
                texts.insert(key, text);
            }
            serde_json::Value::Object(fields) if key == META_KEY => {
                meta = Meta {
                    name: meta_text(&fields, "name"),
                    english_name: meta_text(&fields, "englishName"),
                    author: meta_text(&fields, "author"),
                    version: meta_text(&fields, "version"),
                    fallback: meta_text(&fields, "fallback").filter(|id| is_language_id(id)),
                };
            }
            // Other values (numbers, lists) are not texts; a typo should not drop the whole file.
            _ => {}
        }
    }
    Some(LocaleFile { meta, texts })
}

fn read_locale(path: &Path) -> Option<LocaleFile> {
    let content = std::fs::read_to_string(path).ok()?;
    let parsed = parse_locale(&content);
    if parsed.is_none() {
        tracing::warn!(
            "Sprachdatei {} ist kein gültiges JSON-Objekt",
            path.display()
        );
    }
    parsed
}

fn language_ids(dir: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
                return None;
            }
            let id = path.file_stem()?.to_str()?.to_string();
            is_language_id(&id).then_some(id)
        })
        .collect()
}

/// Shipped file first, then the user's: later keys and metadata win.
fn load_merged(bundled: &Path, user: &Path, id: &str) -> Option<(LocaleFile, bool)> {
    if !is_language_id(id) {
        return None;
    }
    let file = format!("{id}.json");
    let base = read_locale(&bundled.join(&file));
    let custom = read_locale(&user.join(&file));
    let has_custom = custom.is_some();
    let merged = match (base, custom) {
        (None, None) => return None,
        (Some(only), None) | (None, Some(only)) => only,
        (Some(mut base), Some(custom)) => {
            base.texts.extend(custom.texts);
            let meta = custom.meta;
            base.meta = Meta {
                name: meta.name.or(base.meta.name),
                english_name: meta.english_name.or(base.meta.english_name),
                author: meta.author.or(base.meta.author),
                version: meta.version.or(base.meta.version),
                fallback: meta.fallback.or(base.meta.fallback),
            };
            base
        }
    };
    Some((merged, has_custom))
}

fn list_in(bundled: &Path, user: &Path) -> Vec<UiLanguage> {
    let mut ids = language_ids(bundled);
    ids.extend(language_ids(user));
    ids.sort();
    ids.dedup();
    let reference = load_merged(bundled, user, "de")
        .map(|(file, _)| file.texts)
        .unwrap_or_default();
    let mut languages: Vec<UiLanguage> = ids
        .into_iter()
        .filter_map(|id| {
            let (file, custom) = load_merged(bundled, user, &id)?;
            let translated = file
                .texts
                .keys()
                .filter(|key| reference.contains_key(*key))
                .count();
            Some(UiLanguage {
                name: file.meta.name.unwrap_or_else(|| id.clone()),
                english_name: file.meta.english_name.unwrap_or_default(),
                author: file.meta.author.unwrap_or_default(),
                version: file.meta.version.unwrap_or_default(),
                fallback: file.meta.fallback.filter(|fallback| *fallback != id),
                translated: translated as u32,
                total: reference.len() as u32,
                custom,
                id,
            })
        })
        .collect();
    // Shipped languages first in their usual order, then the rest by name.
    let rank = |id: &str| {
        ["de", "en", "ru"]
            .iter()
            .position(|known| *known == id)
            .unwrap_or(usize::MAX)
    };
    languages.sort_by(|a, b| {
        rank(&a.id)
            .cmp(&rank(&b.id))
            .then_with(|| a.name.cmp(&b.name))
    });
    languages
}

/// Lowercase native and English names → id, from the last listing (for reply languages).
static NAMES: std::sync::RwLock<Vec<(String, String)>> = std::sync::RwLock::new(Vec::new());

pub fn available_languages() -> Vec<UiLanguage> {
    let languages = list_in(&bundled_dir(), &user_dir());
    let names = languages
        .iter()
        .flat_map(|language| {
            [&language.name, &language.english_name]
                .into_iter()
                .filter(|name| !name.is_empty())
                .map(|name| (name.to_lowercase(), language.id.clone()))
        })
        .collect();
    *NAMES.write().unwrap() = names;
    languages
}

/// Id of an installed interface language by its name ("Polski" → `pl`); needs a prior listing.
pub fn language_id_for_name(name: &str) -> Option<String> {
    let name = name.trim().to_lowercase();
    NAMES
        .read()
        .unwrap()
        .iter()
        .find(|(known, _)| *known == name)
        .map(|(_, id)| id.clone())
}

/// All texts of `id` (shipped and user file merged); `None` if neither exists.
pub fn load_language(id: &str) -> Option<HashMap<String, String>> {
    load_merged(&bundled_dir(), &user_dir(), id).map(|(file, _)| file.texts)
}

/// A single interface text for the backend (tray menu): `lang`, its fallback, German.
pub fn ui_text(lang: &str, key: &str) -> Option<String> {
    let (bundled, user) = (bundled_dir(), user_dir());
    let own = load_merged(&bundled, &user, lang);
    if let Some(text) = own.as_ref().and_then(|(file, _)| file.texts.get(key)) {
        return Some(text.clone());
    }
    let fallback = own.and_then(|(file, _)| file.meta.fallback);
    // Same order as `t()` in the frontend.
    fallback
        .into_iter()
        .chain(["de".to_string()])
        .filter(|id| id.as_str() != lang)
        .find_map(|id| load_merged(&bundled, &user, &id)?.0.texts.remove(key))
}

/// Creates the user folder and refreshes the translation template in it.
pub fn prepare_user_dir() -> Result<PathBuf, String> {
    let dir = user_dir();
    std::fs::create_dir_all(&dir)
        .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    if let Some(mut template) = std::fs::read_to_string(bundled_dir().join("en.json"))
        .ok()
        .and_then(|content| {
            serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(&content).ok()
        })
    {
        template.insert(
            META_KEY.to_string(),
            serde_json::json!({
                "name": "Name of the language in itself",
                "englishName": "Name in English",
                "author": "Your name",
                "version": "1.0.0",
                "fallback": "en",
            }),
        );
        if let Ok(text) = serde_json::to_string_pretty(&template) {
            let _ = std::fs::write(dir.join(TEMPLATE_FILE), text + "\n");
        }
    }
    Ok(dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(dir: &Path, name: &str, content: &str) {
        std::fs::create_dir_all(dir).unwrap();
        std::fs::write(dir.join(name), content).unwrap();
    }

    #[test]
    fn language_ids_are_plain_tags() {
        for ok in ["de", "pt-BR", "zh-Hant", "yue"] {
            assert!(is_language_id(ok), "{ok}");
        }
        for bad in [
            "",
            "_template",
            "../de",
            "d",
            "deutsch",
            "de_DE",
            "de-",
            "de/x",
        ] {
            assert!(!is_language_id(bad), "{bad}");
        }
    }

    #[test]
    fn user_files_add_languages_and_override_keys() {
        let root =
            std::env::temp_dir().join(format!("otakusoul-ui-locales-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let bundled = root.join("bundled");
        let user = root.join("user");
        write(
            &bundled,
            "de.json",
            r#"{"__meta":{"name":"Deutsch"},"a":"A","b":"B","c":"C"}"#,
        );
        write(
            &bundled,
            "en.json",
            r#"{"__meta":{"name":"English"},"a":"A","b":"B","c":"C"}"#,
        );
        write(&user, "en.json", r#"{"b":"Bee"}"#);
        write(
            &user,
            "fr.json",
            r#"{"__meta":{"name":"Français","fallback":"en"},"a":"À","x":"extra"}"#,
        );
        write(&user, "_template.json", r#"{"a":"A"}"#);
        write(&user, "broken.json", "{");

        let languages = list_in(&bundled, &user);
        let ids: Vec<&str> = languages.iter().map(|l| l.id.as_str()).collect();
        assert_eq!(ids, ["de", "en", "fr"]);
        let en = &languages[1];
        assert!(en.custom);
        assert_eq!(en.name, "English");
        let fr = &languages[2];
        assert_eq!((fr.translated, fr.total), (1, 3));
        assert_eq!(fr.fallback.as_deref(), Some("en"));

        let (en_texts, _) = load_merged(&bundled, &user, "en").unwrap();
        assert_eq!(en_texts.texts["b"], "Bee");
        assert_eq!(en_texts.texts["c"], "C");
        assert!(load_merged(&bundled, &user, "../de").is_none());
        let _ = std::fs::remove_dir_all(&root);
    }

    /// The shipped files must parse; otherwise the interface silently stays German.
    #[test]
    fn shipped_languages_parse_with_metadata() {
        for raw in [
            include_str!("../../../presets/locales/ui/de.json"),
            include_str!("../../../presets/locales/ui/en.json"),
            include_str!("../../../presets/locales/ui/ru.json"),
        ] {
            let file = parse_locale(raw).unwrap();
            assert!(file.meta.name.is_some());
            assert!(file.texts.contains_key("tray.show"));
            assert!(file.texts.contains_key("tray.quit"));
        }
    }
}
