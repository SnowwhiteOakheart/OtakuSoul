//! Öffentlicher Hub-Katalog und begrenzte Downloads für den nativen Prototyp.

use serde_json::Value;
use std::{fmt, time::Duration};
use url::Url;

const HOST: &str = "raw.githubusercontent.com";
const REPOSITORY_PATH: &str = "/SnowwhiteOakheart/otakusoul-data/main/";
const REGISTRY_LIMIT: usize = 2 * 1024 * 1024;
const CHARACTER_LIMIT: usize = 32 * 1024 * 1024;
const LOREBOOK_LIMIT: usize = 4 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Kind {
    Worlds,
    Characters,
    Scenes,
    Lorebooks,
}

impl Kind {
    pub const ALL: [Self; 4] = [
        Self::Worlds,
        Self::Characters,
        Self::Scenes,
        Self::Lorebooks,
    ];

    fn registry(self) -> (&'static str, &'static str) {
        match self {
            Self::Worlds => ("collections_registry.json", "collections"),
            Self::Characters => ("soul_registry.json", "characters"),
            Self::Scenes => ("stages_registry.json", "scenes"),
            Self::Lorebooks => ("lorebooks_registry.json", "lorebooks"),
        }
    }
}

impl fmt::Display for Kind {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::Worlds => "Welten",
            Self::Characters => "Charaktere",
            Self::Scenes => "Szenarien",
            Self::Lorebooks => "Lorebooks",
        })
    }
}

#[derive(Debug, Clone)]
pub struct Entry {
    pub id: String,
    pub title: String,
    pub author: String,
    pub description: String,
    pub revision: u32,
    pub members: Vec<String>,
    download: Option<Download>,
}

#[derive(Debug, Clone)]
struct Download {
    url: Url,
    limit: usize,
}

impl Entry {
    pub fn can_import(&self) -> bool {
        self.download.is_some()
    }

    pub fn download_filename(&self) -> Option<&str> {
        self.download.as_ref()?.url.path_segments()?.next_back()
    }
}

pub fn load(kind: Kind) -> Result<Vec<Entry>, String> {
    let (file, key) = kind.registry();
    let url = Url::parse(&format!("https://{HOST}{REPOSITORY_PATH}{file}"))
        .expect("Die feste Hub-Registry-Adresse muss gültig sein");
    let bytes = fetch(url, REGISTRY_LIMIT)?;
    let registry: Value = serde_json::from_slice(&bytes)
        .map_err(|_| "Der Hub-Katalog enthält kein gültiges JSON.")?;
    parse_registry(kind, key, &registry)
}

pub fn download(entry: &Entry) -> Result<Vec<u8>, String> {
    let source = entry
        .download
        .as_ref()
        .ok_or("Dieser Hub-Eintrag kann nicht importiert werden.")?;
    fetch(source.url.clone(), source.limit)
}

fn parse_registry(kind: Kind, key: &str, registry: &Value) -> Result<Vec<Entry>, String> {
    let entries = registry
        .get(key)
        .and_then(Value::as_array)
        .ok_or("Die erwartete Liste fehlt im Hub-Katalog.")?;
    Ok(entries
        .iter()
        .filter(|entry| entry.get("nsfw").and_then(Value::as_bool) != Some(true))
        .filter_map(|entry| parse_entry(kind, entry))
        .collect())
}

fn parse_entry(kind: Kind, entry: &Value) -> Option<Entry> {
    let text = |key| entry.get(key).and_then(nonempty);
    let id = match kind {
        Kind::Worlds | Kind::Scenes => text("id")?,
        Kind::Characters | Kind::Lorebooks => text("name")?,
    };
    let translated = |key: &str| {
        entry
            .get("translations")?
            .get("de")?
            .get(key)
            .and_then(nonempty)
    };
    let title = match kind {
        Kind::Worlds | Kind::Scenes => translated("title").or_else(|| text("title")).unwrap_or(id),
        Kind::Characters | Kind::Lorebooks => id,
    };
    let description = translated("description")
        .or_else(|| text("description"))
        .unwrap_or_default();
    let revision = entry
        .get("revision")
        .and_then(Value::as_u64)
        .and_then(|value| u32::try_from(value).ok())
        .unwrap_or(1)
        .max(1);
    let members = if kind == Kind::Worlds {
        ["characters", "lorebooks", "scenes"]
            .into_iter()
            .filter_map(|key| entry.get(key).and_then(Value::as_array))
            .flatten()
            .filter_map(nonempty)
            .map(str::to_owned)
            .collect()
    } else {
        Vec::new()
    };
    let download = match kind {
        Kind::Characters | Kind::Lorebooks => Some(validate_download(kind, text("download_url")?)?),
        Kind::Worlds | Kind::Scenes => None,
    };
    Some(Entry {
        id: id.into(),
        title: title.into(),
        author: text("author").unwrap_or_default().into(),
        description: description.into(),
        revision,
        members,
        download,
    })
}

fn nonempty(value: &Value) -> Option<&str> {
    value
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

fn validate_download(kind: Kind, address: &str) -> Option<Download> {
    let (folder, suffixes, limit) = match kind {
        Kind::Characters => ("cards_gateway/", &[".png", ".json"][..], CHARACTER_LIMIT),
        Kind::Lorebooks => ("lorebooks_gateway/", &[".json"][..], LOREBOOK_LIMIT),
        Kind::Worlds | Kind::Scenes => return None,
    };
    let url = Url::parse(address).ok()?;
    if url.scheme() != "https"
        || url.host_str() != Some(HOST)
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return None;
    }
    let filename = url
        .path()
        .strip_prefix(REPOSITORY_PATH)?
        .strip_prefix(folder)?;
    if filename.contains('/')
        || !suffixes.iter().any(|suffix| {
            filename
                .to_ascii_lowercase()
                .strip_suffix(suffix)
                .is_some_and(|stem| !stem.is_empty())
        })
    {
        return None;
    }
    // Verhindert, dass ein kodierter Trenner einen weiteren Pfadabschnitt öffnet.
    for escape in filename.split('%').skip(1) {
        let byte = u8::from_str_radix(escape.get(..2)?, 16).ok()?;
        if byte.is_ascii_control() || matches!(byte, b'/' | b'\\' | b'%') {
            return None;
        }
    }
    Some(Download { url, limit })
}

fn fetch(url: Url, limit: usize) -> Result<Vec<u8>, String> {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|_| "Der Hub-Netzwerkdienst konnte nicht gestartet werden.")?
        .block_on(async move {
            let client = reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .connect_timeout(Duration::from_secs(5))
                .timeout(Duration::from_secs(30))
                .build()
                .map_err(|_| "Der Hub-HTTP-Client konnte nicht vorbereitet werden.")?;
            let mut response = client
                .get(url)
                .send()
                .await
                .map_err(|_| "Der Hub ist gerade nicht erreichbar.")?;
            if !response.status().is_success() {
                return Err(format!(
                    "Der Hub meldet HTTP {}.",
                    response.status().as_u16()
                ));
            }
            let too_large = "Die Hub-Datei überschreitet die Größenbegrenzung.";
            if response
                .content_length()
                .is_some_and(|length| length > limit as u64)
            {
                return Err(too_large.into());
            }
            let mut bytes = Vec::new();
            while let Some(chunk) = response
                .chunk()
                .await
                .map_err(|_| "Der Hub-Download wurde unterbrochen.")?
            {
                if chunk.len() > limit - bytes.len() {
                    return Err(too_large.into());
                }
                bytes.extend_from_slice(&chunk);
            }
            Ok(bytes)
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn character_catalog_keeps_public_entries_with_safe_downloads() {
        let registry = json!({"characters": [
            {"name": "Figur", "author": "Autor", "download_url":
                "https://raw.githubusercontent.com/SnowwhiteOakheart/otakusoul-data/main/cards_gateway/Meine%20Figur.png"},
            {"name": "18+", "nsfw": true, "download_url":
                "https://raw.githubusercontent.com/SnowwhiteOakheart/otakusoul-data/main/cards_gateway/adult.png"},
            {"name": "Fremd", "download_url": "https://example.org/figur.png"}
        ]});
        let list = parse_registry(Kind::Characters, "characters", &registry).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "Figur");
        assert_eq!(list[0].author, "Autor");
        assert_eq!(list[0].revision, 1);
        assert!(list[0].can_import());
        assert_eq!(list[0].download_filename(), Some("Meine%20Figur.png"));
    }

    #[test]
    fn collections_preserve_members_and_display_translations_without_changing_keys() {
        let registry = json!({"collections": [{
            "id": "collection", "title": "World", "description": "Base",
            "translations": {"de": {"title": "Welt", "description": "Beschreibung"}},
            "characters": ["Figur"], "lorebooks": ["Buch"], "scenes": ["scene"],
            "revision": 4
        }]});
        let list = parse_registry(Kind::Worlds, "collections", &registry).unwrap();
        assert_eq!(list[0].id, "collection");
        assert_eq!(list[0].title, "Welt");
        assert_eq!(list[0].description, "Beschreibung");
        assert_eq!(list[0].revision, 4);
        assert_eq!(list[0].members, ["Figur", "Buch", "scene"]);
        assert!(!list[0].can_import());
    }

    #[test]
    fn import_addresses_are_restricted_to_the_public_gateway_folder() {
        for address in [
            "http://raw.githubusercontent.com/SnowwhiteOakheart/otakusoul-data/main/lorebooks_gateway/a.json",
            "https://someone@raw.githubusercontent.com/SnowwhiteOakheart/otakusoul-data/main/lorebooks_gateway/a.json",
            "https://raw.githubusercontent.com.evil.org/SnowwhiteOakheart/otakusoul-data/main/lorebooks_gateway/a.json",
            "https://raw.githubusercontent.com/SnowwhiteOakheart/otakusoul-data-nsfw/main/lorebooks_gateway/a.json",
            "https://raw.githubusercontent.com/SnowwhiteOakheart/otakusoul-data/main/cards_gateway/a.json",
            "https://raw.githubusercontent.com/SnowwhiteOakheart/otakusoul-data/main/lorebooks_gateway/%2e%2e/a.json",
            "https://raw.githubusercontent.com/SnowwhiteOakheart/otakusoul-data/main/lorebooks_gateway/..%2Fa.json",
            "https://raw.githubusercontent.com/SnowwhiteOakheart/otakusoul-data/main/lorebooks_gateway/..%255ca.json",
            "https://raw.githubusercontent.com/SnowwhiteOakheart/otakusoul-data/main/lorebooks_gateway/a.json?x=1",
            "https://raw.githubusercontent.com/SnowwhiteOakheart/otakusoul-data/main/lorebooks_gateway/a.png",
        ] {
            assert!(
                validate_download(Kind::Lorebooks, address).is_none(),
                "{address}"
            );
        }
    }
}
