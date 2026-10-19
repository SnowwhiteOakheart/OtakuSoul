//! Interface languages: one JSON dictionary per language, so a new language needs no new build.
//! Three layers, later ones win key by key:
//! 1. shipped with the app: `presets/locales/ui/`,
//! 2. from the data repository (`locales/ui_registry.json` + `locales/ui/<id>.json`), fetched at
//!    start into `<Daten>/locales/ui-hub/`; a shipped language only takes it with a higher `version`,
//! 3. own and community files in `<Daten>/locales/ui/` (added by hand or via import; survive updates).
//!
//! German is the reference; the frontend also has it built in.
//!
//! File format: flat `"key": "text"` pairs plus an optional `"__meta"` object
//! (`id`, `name`, `englishName`, `author`, `version`, `fallback`). The file name is the language id.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use ts_rs::TS;

const META_KEY: &str = "__meta";
/// Copy of the English texts for translators; the leading underscore keeps it out of the list.
const TEMPLATE_FILE: &str = "_template.json";
const HUB_REGISTRY: &str = "locales/ui_registry.json";
/// Event to the frontend once the data repository brought new or changed languages.
pub const CHANGED_EVENT: &str = "ui-languages-changed";

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
    /// A file in the user folder adds or changes this language (it can be removed again).
    pub custom: bool,
    /// Texts from the data repository are in use (newer than the shipped ones or not shipped).
    pub downloaded: bool,
}

#[derive(Default)]
struct Meta {
    id: Option<String>,
    name: Option<String>,
    english_name: Option<String>,
    author: Option<String>,
    version: Option<String>,
    fallback: Option<String>,
}

impl Meta {
    /// `self` wins where it has a value.
    fn over(self, base: Meta) -> Meta {
        Meta {
            id: self.id.or(base.id),
            name: self.name.or(base.name),
            english_name: self.english_name.or(base.english_name),
            author: self.author.or(base.author),
            version: self.version.or(base.version),
            fallback: self.fallback.or(base.fallback),
        }
    }
}

struct LocaleFile {
    meta: Meta,
    texts: HashMap<String, String>,
}

struct Merged {
    file: LocaleFile,
    custom: bool,
    downloaded: bool,
}

/// The three folders; tests point them elsewhere.
struct Dirs {
    bundled: PathBuf,
    hub: PathBuf,
    user: PathBuf,
}

impl Dirs {
    fn current() -> Self {
        let paths = crate::modules::paths::resolve_app_paths();
        let data = PathBuf::from(paths.data_dir).join("locales");
        Dirs {
            bundled: PathBuf::from(paths.bundled_presets_dir)
                .join("locales")
                .join("ui"),
            hub: data.join("ui-hub"),
            user: data.join("ui"),
        }
    }
}

pub fn user_dir() -> PathBuf {
    Dirs::current().user
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

/// `1.2.10` > `1.2.9`; missing parts count as 0, anything unreadable as "not newer".
fn version_newer(candidate: Option<&str>, current: Option<&str>) -> bool {
    let parse = |v: &str| -> Option<Vec<u32>> {
        v.trim()
            .trim_start_matches('v')
            .split('.')
            .map(|part| part.parse().ok())
            .collect()
    };
    let Some(candidate) = candidate.and_then(parse) else {
        return false;
    };
    let current = current.and_then(parse).unwrap_or_default();
    let len = candidate.len().max(current.len());
    let pad = |mut v: Vec<u32>| {
        v.resize(len, 0);
        v
    };
    pad(candidate) > pad(current)
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
                    id: meta_text(&fields, "id").filter(|id| is_language_id(id)),
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

fn merge(base: Option<LocaleFile>, over: LocaleFile) -> LocaleFile {
    match base {
        None => over,
        Some(mut base) => {
            base.texts.extend(over.texts);
            base.meta = over.meta.over(base.meta);
            base
        }
    }
}

/// Shipped file, then the data repository's (if newer or not shipped), then the user's.
fn load_merged(dirs: &Dirs, id: &str) -> Option<Merged> {
    if !is_language_id(id) {
        return None;
    }
    let file = format!("{id}.json");
    let mut merged = read_locale(&dirs.bundled.join(&file));
    let mut downloaded = false;
    if let Some(hub) = read_locale(&dirs.hub.join(&file)) {
        let shipped_version = merged.as_ref().and_then(|m| m.meta.version.as_deref());
        if merged.is_none() || version_newer(hub.meta.version.as_deref(), shipped_version) {
            merged = Some(merge(merged, hub));
            downloaded = true;
        }
    }
    let custom = read_locale(&dirs.user.join(&file));
    let has_custom = custom.is_some();
    if let Some(custom) = custom {
        merged = Some(merge(merged, custom));
    }
    Some(Merged {
        file: merged?,
        custom: has_custom,
        downloaded,
    })
}

fn list_in(dirs: &Dirs) -> Vec<UiLanguage> {
    let mut ids = language_ids(&dirs.bundled);
    ids.extend(language_ids(&dirs.hub));
    ids.extend(language_ids(&dirs.user));
    ids.sort();
    ids.dedup();
    let reference = load_merged(dirs, "de")
        .map(|merged| merged.file.texts)
        .unwrap_or_default();
    let mut languages: Vec<UiLanguage> = ids
        .into_iter()
        .filter_map(|id| {
            let Merged {
                file,
                custom,
                downloaded,
            } = load_merged(dirs, &id)?;
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
                downloaded,
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
    let languages = list_in(&Dirs::current());
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

/// All texts of `id` (all layers merged); `None` if no file exists.
pub fn load_language(id: &str) -> Option<HashMap<String, String>> {
    load_merged(&Dirs::current(), id).map(|merged| merged.file.texts)
}

/// A single interface text for the backend (tray menu): `lang`, its fallback, German.
pub fn ui_text(lang: &str, key: &str) -> Option<String> {
    let dirs = Dirs::current();
    let own = load_merged(&dirs, lang);
    if let Some(text) = own.as_ref().and_then(|m| m.file.texts.get(key)) {
        return Some(text.clone());
    }
    let fallback = own.and_then(|m| m.file.meta.fallback);
    // Same order as `t()` in the frontend.
    fallback
        .into_iter()
        .chain(["de".to_string()])
        .filter(|id| id.as_str() != lang)
        .find_map(|id| load_merged(&dirs, &id)?.file.texts.remove(key))
}

/// Creates the user folder and refreshes the translation template in it.
pub fn prepare_user_dir() -> Result<PathBuf, String> {
    let dirs = Dirs::current();
    std::fs::create_dir_all(&dirs.user)
        .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    if let Some(mut template) = std::fs::read_to_string(dirs.bundled.join("en.json"))
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
            let _ = std::fs::write(dirs.user.join(TEMPLATE_FILE), text + "\n");
        }
    }
    Ok(dirs.user)
}

/// Id for an imported file: `__meta.id`, else the file name (`pl.json`).
fn import_id(path: &Path, file: &LocaleFile) -> Option<String> {
    file.meta.id.clone().or_else(|| {
        path.file_stem()
            .and_then(|stem| stem.to_str())
            .filter(|stem| is_language_id(stem))
            .map(str::to_string)
    })
}

fn import_into(user: &Path, path: &Path) -> Result<String, String> {
    let content = std::fs::read_to_string(path).map_err(|e| {
        crate::err!(
            "backend.common.fileReadPath",
            path = path.display(),
            error = e
        )
    })?;
    let file = parse_locale(&content)
        .filter(|file| !file.texts.is_empty())
        .ok_or_else(|| crate::err!("backend.uiLanguage.invalidFile"))?;
    let id = import_id(path, &file).ok_or_else(|| crate::err!("backend.uiLanguage.invalidId"))?;
    std::fs::create_dir_all(user)
        .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    std::fs::write(user.join(format!("{id}.json")), content)
        .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    Ok(id)
}

/// Copies a language file chosen by the user into the user folder; returns its id.
/// A file with the same id there is replaced.
pub fn import_file(path: &Path) -> Result<String, String> {
    import_into(&Dirs::current().user, path)
}

/// Moves the user's file for `id` into the trash folder (shipped and downloaded texts stay).
pub fn remove_user_file(id: &str) -> Result<(), String> {
    if !is_language_id(id) {
        return Err(crate::err!("backend.uiLanguage.notFound", id = id));
    }
    let path = Dirs::current().user.join(format!("{id}.json"));
    if !path.is_file() {
        return Err(crate::err!("backend.uiLanguage.notFound", id = id));
    }
    let trash = PathBuf::from(crate::modules::paths::resolve_app_paths().trash_dir).join("locales");
    std::fs::create_dir_all(&trash)
        .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or_default();
    std::fs::rename(&path, trash.join(format!("{id}-{stamp}.json")))
        .map_err(|e| crate::err!("backend.common.fileWrite", error = e))
}

#[derive(Deserialize)]
struct HubRegistry {
    languages: Vec<HubEntry>,
}

#[derive(Deserialize)]
struct HubEntry {
    id: String,
    version: String,
}

/// Brings `<Daten>/locales/ui-hub/` in line with the data repository: new or changed versions are
/// downloaded, withdrawn languages removed. Returns whether anything changed. Without a reachable
/// registry nothing is touched (the last download stays in use).
async fn sync_hub(client: &reqwest::Client, dirs: &Dirs) -> Result<bool, String> {
    let hub = dirs.hub.as_path();
    let fetch = |file: String| async move {
        client
            .get(crate::modules::hub::hub_url(&file))
            .send()
            .await
            .and_then(reqwest::Response::error_for_status)
            .map_err(|e| e.to_string())?
            .text()
            .await
            .map_err(|e| e.to_string())
    };
    let registry: HubRegistry =
        serde_json::from_str(&fetch(HUB_REGISTRY.to_string()).await?).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(hub).map_err(|e| e.to_string())?;
    let mut changed = false;
    let listed: Vec<&HubEntry> = registry
        .languages
        .iter()
        .filter(|entry| is_language_id(&entry.id))
        .collect();
    for entry in &listed {
        let path = hub.join(format!("{}.json", entry.id));
        let local = read_locale(&path).and_then(|file| file.meta.version);
        if local.as_deref() == Some(entry.version.as_str()) {
            continue;
        }
        // The release already ships these texts or newer ones: nothing to fetch.
        let shipped = read_locale(&dirs.bundled.join(format!("{}.json", entry.id)));
        if shipped
            .is_some_and(|file| !version_newer(Some(&entry.version), file.meta.version.as_deref()))
        {
            continue;
        }
        let text = match fetch(format!("locales/ui/{}.json", entry.id)).await {
            Ok(text) => text,
            Err(e) => {
                tracing::debug!("Oberflächensprache {} nicht geladen: {e}", entry.id);
                continue;
            }
        };
        if parse_locale(&text).is_none_or(|file| file.texts.is_empty()) {
            tracing::warn!(
                "Oberflächensprache {} aus dem Daten-Repo ist ungültig",
                entry.id
            );
            continue;
        }
        if std::fs::write(&path, text).is_ok() {
            changed = true;
        }
    }
    for id in language_ids(hub) {
        if !listed.iter().any(|entry| entry.id == id) {
            let _ = std::fs::remove_file(hub.join(format!("{id}.json")));
            changed = true;
        }
    }
    Ok(changed)
}

/// Start-up download of interface languages from the data repository; tells the frontend when
/// the list or texts changed.
pub async fn refresh_hub(app: tauri::AppHandle) {
    use tauri::Emitter;
    let Ok(client) = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
    else {
        return;
    };
    match sync_hub(&client, &Dirs::current()).await {
        Ok(true) => {
            let _ = app.emit(CHANGED_EVENT, ());
        }
        Ok(false) => {}
        Err(e) => tracing::debug!("Oberflächensprachen aus dem Daten-Repo nicht geladen: {e}"),
    }
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

    fn temp_dirs(name: &str) -> (PathBuf, Dirs) {
        let root = std::env::temp_dir().join(format!(
            "otakusoul-ui-locales-{name}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&root);
        let dirs = Dirs {
            bundled: root.join("bundled"),
            hub: root.join("hub"),
            user: root.join("user"),
        };
        (root, dirs)
    }

    #[test]
    fn user_files_add_languages_and_override_keys() {
        let (root, dirs) = temp_dirs("user");
        write(
            &dirs.bundled,
            "de.json",
            r#"{"__meta":{"name":"Deutsch"},"a":"A","b":"B","c":"C"}"#,
        );
        write(
            &dirs.bundled,
            "en.json",
            r#"{"__meta":{"name":"English"},"a":"A","b":"B","c":"C"}"#,
        );
        write(&dirs.user, "en.json", r#"{"b":"Bee"}"#);
        write(
            &dirs.user,
            "fr.json",
            r#"{"__meta":{"name":"Français","fallback":"en"},"a":"À","x":"extra"}"#,
        );
        write(&dirs.user, "_template.json", r#"{"a":"A"}"#);
        write(&dirs.user, "broken.json", "{");

        let languages = list_in(&dirs);
        let ids: Vec<&str> = languages.iter().map(|l| l.id.as_str()).collect();
        assert_eq!(ids, ["de", "en", "fr"]);
        let en = &languages[1];
        assert!(en.custom);
        assert_eq!(en.name, "English");
        let fr = &languages[2];
        assert_eq!((fr.translated, fr.total), (1, 3));
        assert_eq!(fr.fallback.as_deref(), Some("en"));

        let en_texts = load_merged(&dirs, "en").unwrap().file.texts;
        assert_eq!(en_texts["b"], "Bee");
        assert_eq!(en_texts["c"], "C");
        assert!(load_merged(&dirs, "../de").is_none());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn downloaded_texts_need_a_newer_version_than_the_shipped_ones() {
        let (root, dirs) = temp_dirs("hub");
        write(
            &dirs.bundled,
            "en.json",
            r#"{"__meta":{"name":"English","version":"1.2.0"},"a":"A","b":"B"}"#,
        );
        write(
            &dirs.hub,
            "en.json",
            r#"{"__meta":{"version":"1.1.9"},"a":"old"}"#,
        );
        write(
            &dirs.hub,
            "pl.json",
            r#"{"__meta":{"name":"Polski","version":"1.0.0"},"a":"Ą"}"#,
        );
        write(&dirs.user, "pl.json", r#"{"b":"Bę"}"#);

        let en = load_merged(&dirs, "en").unwrap();
        assert!(!en.downloaded);
        assert_eq!(en.file.texts["a"], "A");
        write(
            &dirs.hub,
            "en.json",
            r#"{"__meta":{"version":"1.10.0"},"a":"new"}"#,
        );
        let en = load_merged(&dirs, "en").unwrap();
        assert!(en.downloaded);
        assert_eq!(
            (en.file.texts["a"].as_str(), en.file.texts["b"].as_str()),
            ("new", "B")
        );
        assert_eq!(en.file.meta.name.as_deref(), Some("English"));

        // Not shipped: the download counts as is, the user's file still wins.
        let pl = load_merged(&dirs, "pl").unwrap();
        assert!(pl.downloaded && pl.custom);
        assert_eq!(
            (pl.file.texts["a"].as_str(), pl.file.texts["b"].as_str()),
            ("Ą", "Bę")
        );
        assert!(
            list_in(&dirs)
                .iter()
                .any(|l| l.id == "pl" && l.name == "Polski")
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn versions_compare_by_number() {
        assert!(version_newer(Some("1.10.0"), Some("1.9.3")));
        assert!(version_newer(Some("1.0.1"), Some("1.0")));
        assert!(version_newer(Some("1.0.0"), None));
        assert!(!version_newer(Some("1.0.0"), Some("1.0.0")));
        assert!(!version_newer(Some("beta"), Some("1.0.0")));
        assert!(!version_newer(None, Some("1.0.0")));
    }

    #[test]
    fn import_takes_the_id_from_meta_or_the_file_name() {
        let (root, dirs) = temp_dirs("import");
        write(
            &root,
            "uebersetzung.json",
            r#"{"__meta":{"id":"pl"},"a":"Ą"}"#,
        );
        write(&root, "uk.json", r#"{"a":"А"}"#);
        write(&root, "meine.json", r#"{"a":"A"}"#);
        write(&root, "leer.json", r#"{"__meta":{"id":"cs"}}"#);

        assert_eq!(
            import_into(&dirs.user, &root.join("uebersetzung.json")).unwrap(),
            "pl"
        );
        assert_eq!(
            import_into(&dirs.user, &root.join("uk.json")).unwrap(),
            "uk"
        );
        assert!(dirs.user.join("pl.json").is_file());
        assert!(
            import_into(&dirs.user, &root.join("meine.json"))
                .unwrap_err()
                .contains("backend.uiLanguage.invalidId")
        );
        assert!(
            import_into(&dirs.user, &root.join("leer.json"))
                .unwrap_err()
                .contains("backend.uiLanguage.invalidFile")
        );
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
