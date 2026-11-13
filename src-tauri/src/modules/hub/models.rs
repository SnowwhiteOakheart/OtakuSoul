use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::modules::characters::CharacterProfile;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct GatewayCharacterEntry {
    pub name: String,
    pub author: String,
    pub download_url: String,
    /// Increases with every change of the content; compared with the installed copy.
    #[serde(default)]
    pub revision: u32,
    /// Date of the current revision (for display).
    #[serde(default)]
    pub updated: String,
    /// Content for adults (from the NSFW source or marked so).
    #[serde(default)]
    pub nsfw: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GatewayLorebookEntry {
    pub name: String,
    pub author: String,
    pub description: String,
    pub entry_count: u32,
    pub download_url: String,
    /// Increases with every change of the content; compared with the installed copy.
    #[serde(default)]
    pub revision: u32,
    /// Date of the current revision (for display).
    #[serde(default)]
    pub updated: String,
    /// Texts for the list in other languages (`{"en": {"description": "…"}}`); the original
    /// name or title stays the key for updates.
    #[serde(default)]
    #[ts(type = "Record<string, Record<string, string>>")]
    pub translations: std::collections::HashMap<String, std::collections::HashMap<String, String>>,
    /// Content for adults (from the NSFW source or marked so).
    #[serde(default)]
    pub nsfw: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GatewaySceneEntry {
    #[serde(default)]
    pub id: String,
    pub title: String,
    pub author: String,
    pub description: String,
    pub starting_location: String,
    pub download_url: String,
    /// Increases with every change of the content; compared with the installed copy.
    #[serde(default)]
    pub revision: u32,
    /// Date of the current revision (for display).
    #[serde(default)]
    pub updated: String,
    /// Texts for the list in other languages (see `GatewayLorebookEntry::translations`).
    #[serde(default)]
    #[ts(type = "Record<string, Record<string, string>>")]
    pub translations: std::collections::HashMap<String, std::collections::HashMap<String, String>>,
    /// Content for adults (from the NSFW source or marked so).
    #[serde(default)]
    pub nsfw: bool,
}

/// A story collection: the lorebooks, scenes and characters of one series, shown as one card in
/// the hub. The lists hold registry keys (lorebook and character names, scene ids); an entry may
/// belong to several collections.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GatewayCollectionEntry {
    pub id: String,
    pub title: String,
    pub author: String,
    pub description: String,
    /// Cover image (16:9); empty = none.
    #[serde(default)]
    pub cover_url: String,
    #[serde(default)]
    pub lorebooks: Vec<String>,
    #[serde(default)]
    pub scenes: Vec<String>,
    #[serde(default)]
    pub characters: Vec<String>,
    #[serde(default)]
    pub revision: u32,
    #[serde(default)]
    pub updated: String,
    /// Texts in other languages (`{"en": {"title": …, "description": …}}`).
    #[serde(default)]
    #[ts(type = "Record<string, Record<string, string>>")]
    pub translations: std::collections::HashMap<String, std::collections::HashMap<String, String>>,
    /// Content for adults (from the NSFW source or marked so).
    #[serde(default)]
    pub nsfw: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ChubSearchItem {
    pub id: u64,
    pub name: String,
    #[serde(alias = "fullPath")]
    pub full_path: String,
    pub description: Option<String>,
    pub tagline: Option<String>,
    pub avatar_url: Option<String>,
    #[serde(alias = "starCount", default)]
    pub star_count: u32,
    #[serde(alias = "n_favorites", default)]
    pub n_favorites: u32,
    #[serde(alias = "nTokens", default)]
    pub n_tokens: u32,
    #[serde(alias = "nChats", default)]
    pub n_chats: u32,
    #[serde(default)]
    pub topics: Vec<String>,
    #[serde(default)]
    pub nsfw_image: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ChubSearchResult {
    pub items: Vec<ChubSearchItem>,
    pub total_count: Option<u64>,
    pub has_more: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ChubCharacterDetail {
    pub name: String,
    pub tagline: String,
    pub avatar_url: String,
    pub star_count: u32,
    pub n_favorites: u32,
    pub n_tokens: u32,
    pub personality: String,
    pub first_message: String,
    pub scenario: String,
    pub example_dialogs: String,
    pub alternate_greetings: Vec<String>,
    pub has_embedded_lorebook: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CharacterImportResult {
    pub profile: CharacterProfile,
    pub imported_lorebook: Option<String>,
}
