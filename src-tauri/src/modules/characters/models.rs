use base64::prelude::*;
use serde::{Deserialize, Serialize};
use std::fs;
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct CharacterData {
    pub name: String,
    pub description: String,
    pub personality: String,
    pub scenario: String,
    #[serde(alias = "first_message", default)]
    pub first_mes: String,
    #[serde(alias = "example_messages", alias = "example_dialogs", default)]
    pub mes_example: String,
    #[serde(default)]
    pub alternate_greetings: Vec<String>,
    pub system_prompt: Option<String>,
    pub post_history_instructions: Option<String>,
    pub creator_notes: Option<String>,
    pub character_version: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub creator: Option<String>,
    #[serde(default)]
    pub character_book: Option<serde_json::Value>,
    #[serde(default)]
    pub extensions: serde_json::Value,
}

/// Key in `extensions` that holds translations of a card:
/// `{"source_language": "de", "translations": {"en": {"description": "...", ...}}}`.
/// Keeping them in `extensions` leaves the card a valid V2 card for other apps; cards without
/// it (e.g. imported from the web) simply use their base fields in every language.
pub const I18N_EXTENSION: &str = "otakusoul_i18n";

/// Key in `extensions` that lists official pages where the card's avatar models can be downloaded:
/// `[{"kind": "live2d", "page_url": "https://…", "name": "…", "license": "…"}]` (field names as in
/// the avatar hub). Cards and the hub never carry such models themselves; the user fetches them
/// from the rights holder and imports them as usual.
pub const MODEL_LINKS_EXTENSION: &str = "otakusoul_model_links";

/// Model kinds a link in `otakusoul_model_links` may name.
pub const MODEL_LINK_KINDS: [&str; 3] = ["vrm", "live2d", "inochi2d"];

/// Whether `url` is a web page the app may open: `https://` with a host, no spaces.
pub fn is_safe_page_url(url: &str) -> bool {
    url.strip_prefix("https://").is_some_and(|rest| {
        !rest.is_empty() && !rest.starts_with('/') && !rest.contains(char::is_whitespace)
    })
}

/// Entries of `otakusoul_model_links` the app would not offer: no list, an unknown model kind or
/// a page that is not `https://`. Returns what to show for each (the address, else the kind).
pub fn invalid_model_links(extensions: &serde_json::Value) -> Vec<String> {
    let Some(links) = extensions.get(MODEL_LINKS_EXTENSION) else {
        return Vec::new();
    };
    let Some(links) = links.as_array() else {
        return vec![MODEL_LINKS_EXTENSION.to_string()];
    };
    links
        .iter()
        .filter_map(|link| {
            let kind = link
                .get("kind")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("");
            let url = link
                .get("page_url")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("");
            let ok = MODEL_LINK_KINDS.contains(&kind) && is_safe_page_url(url);
            (!ok).then(|| {
                if url.is_empty() {
                    kind.to_string()
                } else {
                    url.to_string()
                }
            })
        })
        .collect()
}

/// The translation for `lang` in an `otakusoul_i18n` extension: the language's own, otherwise
/// the English one (understood most widely) – unless `lang` is the declared source language, whose
/// text is the base itself. `None` keeps the base text.
pub fn i18n_translation<'a>(
    i18n: Option<&'a serde_json::Value>,
    lang: &str,
) -> Option<&'a serde_json::Value> {
    let i18n = i18n?;
    let translations = i18n.get("translations")?;
    if let Some(own) = translations.get(lang) {
        return Some(own);
    }
    let source = i18n
        .get("source_language")
        .and_then(serde_json::Value::as_str)?;
    if source == lang || source == "en" || lang == "en" {
        return None;
    }
    translations.get("en")
}

/// Text fields a translation may override; empty or missing ones fall back to the base card.
const TRANSLATABLE_TEXT: [&str; 9] = [
    "name",
    "description",
    "personality",
    "scenario",
    "first_mes",
    "mes_example",
    "system_prompt",
    "post_history_instructions",
    "creator_notes",
];

impl CharacterData {
    /// The card with its fields in `lang` (ISO 639-1) where a translation exists.
    pub fn localized(&self, lang: &str) -> CharacterData {
        let Some(translation) = i18n_translation(self.extensions.get(I18N_EXTENSION), lang)
            .and_then(serde_json::Value::as_object)
        else {
            return self.clone();
        };
        let mut data = serde_json::to_value(self).unwrap_or_default();
        let Some(fields) = data.as_object_mut() else {
            return self.clone();
        };
        for key in TRANSLATABLE_TEXT {
            if let Some(text) = translation.get(key).and_then(serde_json::Value::as_str)
                && !text.trim().is_empty()
            {
                fields.insert(key.to_string(), text.into());
            }
        }
        for key in ["alternate_greetings", "tags"] {
            if let Some(list) = translation.get(key).and_then(serde_json::Value::as_array)
                && !list.is_empty()
            {
                fields.insert(key.to_string(), list.clone().into());
            }
        }
        if let Some(title) = translation
            .get("custom_title")
            .or_else(|| translation.get("sow_title"))
            .and_then(serde_json::Value::as_str)
            && let Some(extensions) = fields.get_mut("extensions").and_then(|e| e.as_object_mut())
        {
            extensions.insert("custom_title".to_string(), title.into());
            if extensions.contains_key("sow_title") {
                extensions.insert("sow_title".to_string(), title.into());
            }
        }
        serde_json::from_value(data).unwrap_or_else(|_| self.clone())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CharacterCardV2 {
    #[serde(default = "default_spec")]
    pub spec: String,
    #[serde(default = "default_spec_version")]
    pub spec_version: String,
    pub data: CharacterData,
}

fn default_spec() -> String {
    "chara_card_v2".to_string()
}

fn default_spec_version() -> String {
    "2.0".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CharacterProfile {
    pub id: String,
    pub card: CharacterCardV2,
    /// A new picture as data URL (editor, imports). Cards read from disk leave it empty and name
    /// the file in `avatar_path` instead: the library would otherwise send every PNG as Base64.
    pub avatar_data_url: Option<String>,
    /// The PNG holding the card's picture; the interface shows it via the asset protocol.
    #[serde(default)]
    #[ts(optional)]
    pub avatar_path: Option<String>,
    pub source_path: Option<String>,
    pub bound_lorebooks: Vec<String>,
}

impl CharacterProfile {
    /// The picture's bytes: a PNG data URL first, otherwise the file in `avatar_path`.
    /// Other data URLs (JPEG, WebP) count as no PNG, like before.
    pub fn avatar_png_bytes(&self) -> Option<Vec<u8>> {
        if let Some(url) = self.avatar_data_url.as_deref()
            && url.starts_with("data:")
        {
            let stripped = url.strip_prefix("data:image/png;base64,")?;
            return BASE64_STANDARD.decode(stripped.trim()).ok();
        }
        fs::read(self.avatar_path.as_deref()?).ok()
    }

    /// Whether the card has a picture at all (data URL or file).
    pub fn has_avatar(&self) -> bool {
        self.avatar_data_url
            .as_deref()
            .is_some_and(|url| url.starts_with("data:"))
            || self.avatar_path.is_some()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct UserPersona {
    pub id: String,
    pub name: String,
    pub description: String,
    pub avatar_data_url: Option<String>,
}

impl Default for UserPersona {
    fn default() -> Self {
        Self {
            id: "default_user".to_string(),
            name: "User".to_string(),
            description: crate::modules::content_lang::ContentLang::current()
                .t("A curious adventurer and conversation partner.")
                .to_string(),
            avatar_data_url: None,
        }
    }
}

/// The card a scene or a story names: the exact name first, otherwise the name before a bracket,
/// so a party entry "Klein" finds the card "Klein (Ryoutarou Tsuboi)". Case does not matter.
pub fn find_by_name<'a>(
    characters: &'a [CharacterProfile],
    name: &str,
) -> Option<&'a CharacterProfile> {
    let name = name.trim();
    characters
        .iter()
        .find(|c| c.card.data.name.trim().eq_ignore_ascii_case(name))
        .or_else(|| {
            characters
                .iter()
                .find(|c| short_name(&c.card.data.name).eq_ignore_ascii_case(name))
        })
}

/// "Klein (Ryoutarou Tsuboi)" → "Klein".
fn short_name(name: &str) -> &str {
    name.split_once(" (")
        .map_or(name, |(short, _)| short)
        .trim()
}
