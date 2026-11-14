//! The Song Studio's songs: the request a song is made from and the song list with the request
//! each song was made from (`<song>.mp3.json` next to it). Folder and file names:
//! [`crate::modules::studio_files`].

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::modules::studio_files::{self, StudioKind};

/// What the Song Studio asks ACE-Step for (one request, `versions` songs).
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, TS)]
#[serde(default)]
#[ts(export)]
pub struct SongRequest {
    /// Song title (also the file name); empty = date and time.
    pub title: String,
    /// Style, mood and instruments (ACE-Step's caption).
    pub caption: String,
    /// Lyrics with structure tags; empty = the language model writes them,
    /// `[Instrumental]` = no vocals.
    pub lyrics: String,
    /// Language of the vocals (`de`, `en`, …); empty = the language model decides.
    pub vocal_language: String,
    /// Length in seconds (10–600).
    pub duration: u32,
    /// `None` = the language model picks the tempo.
    pub bpm: Option<u32>,
    /// E.g. `C major`; empty = the language model picks.
    pub keyscale: String,
    /// Beats per bar (`3`, `4`, …); empty = the language model picks.
    pub timesignature: String,
    /// `None` = random.
    pub seed: Option<i64>,
    /// Diffusion steps; `None` = the model set's default.
    pub steps: Option<u32>,
    /// Language model temperature (freedom of the composition); `None` = 0.85.
    pub lm_temperature: Option<f32>,
    /// How many versions to make (1–10).
    pub versions: u32,
    pub model_id: String,
}

/// A finished song in the song folder.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub struct SongEntry {
    pub file_name: String,
    pub path: String,
    pub title: String,
    pub size_bytes: u64,
    /// UNIX seconds of the last change.
    pub modified: u64,
    /// The request it was made from (only for songs of the Song Studio).
    pub request: Option<SongRequest>,
    /// Lyrics as sung (also those the language model wrote).
    pub lyrics: String,
    pub seed: Option<i64>,
}

/// What is written next to a song: its request and what the language model made of it.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct SongOrigin {
    pub title: String,
    pub request: Option<SongRequest>,
    pub lyrics: String,
    pub seed: Option<i64>,
    pub generator: String,
    pub model: String,
    pub lm_model: String,
    pub generated: String,
    pub license: String,
}

/// Songs in the song folder (MP3, WAV, FLAC, OGG), newest first.
pub fn list() -> Vec<SongEntry> {
    studio_files::list_files::<SongOrigin>(StudioKind::Songs, &["mp3", "wav", "flac", "ogg"])
        .into_iter()
        .map(|file| {
            let stem = file
                .path
                .file_stem()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_default();
            let origin = file.origin;
            SongEntry {
                path: file.path.to_string_lossy().into_owned(),
                title: origin
                    .as_ref()
                    .map(|o| o.title.clone())
                    .filter(|t| !t.is_empty())
                    .unwrap_or(stem),
                size_bytes: file.size_bytes,
                modified: file.modified,
                request: origin.as_ref().and_then(|o| o.request.clone()),
                lyrics: origin
                    .as_ref()
                    .map(|o| o.lyrics.clone())
                    .unwrap_or_default(),
                seed: origin.as_ref().and_then(|o| o.seed),
                file_name: file.file_name,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn old_requests_still_read() {
        let request: SongRequest = serde_json::from_str(r#"{"caption":"lofi"}"#).unwrap();
        assert_eq!(request.caption, "lofi");
        assert_eq!(request.versions, 0);
    }
}
