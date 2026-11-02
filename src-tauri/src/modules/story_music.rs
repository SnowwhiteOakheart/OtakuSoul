//! Music of a story (`extensions.otakusoul_music`): which moods it needs, how each should sound
//! (ACE-Step captions, optional lyrics for soft vocals), and the finished tracks the data
//! repository ships for it. Tracks of a story live in `<data>/music/sets/<set>/<mood>/`; scenes of
//! one story share a set. A lorebook can give a whole world its sound (`style`), a character card
//! a leitmotif (`theme`) that joins the moods where it fits.
//!
//! Nothing here generates music: the plan is what a generator (ACE-Step) gets later, the shipped
//! tracks are downloaded from `otakusoul-data` (path + SHA-256) when a scene opens.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use ts_rs::TS;

use crate::modules::paths::resolve_app_paths;
use crate::modules::stage::SceneDefinition;
use crate::modules::stage_music::{MOODS, music_dir};

/// Extension key on scenes, lorebooks and character cards.
pub const MUSIC_EXTENSION: &str = "otakusoul_music";

/// ACE-Step's condition for music without vocals.
pub const INSTRUMENTAL: &str = "[Instrumental]";

/// Length of a generated track when the story names none, in seconds.
const DEFAULT_DURATION: u32 = 120;
/// Moods a character's leitmotif joins when the card names none.
const THEME_MOODS: [&str; 3] = ["calm", "romance", "sorrow"];

/// How one mood of a story should sound.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MoodMusic {
    /// ACE-Step caption for this mood (genre, instruments, atmosphere, tempo …); the story's
    /// `style` goes in front of it.
    #[serde(default)]
    pub caption: String,
    /// ACE-Step lyrics with structure tags; empty or `[Instrumental]` means no vocals. Soft
    /// background singing: e.g. `[Verse]\nooh, aah` with "soft wordless female vocals, distant"
    /// in the caption. Vocals need ACE-Step's language model when generating.
    #[serde(default)]
    pub lyrics: String,
    /// Language of the vocals (`de`, `en`, `ja` …); only with lyrics.
    #[serde(default)]
    pub vocal_language: String,
    #[serde(default)]
    pub bpm: Option<u32>,
    /// Key and scale, e.g. `D minor`.
    #[serde(default)]
    pub keyscale: String,
    /// Length in seconds.
    #[serde(default)]
    pub duration: Option<u32>,
    /// How many tracks to make for the mood (they take turns).
    #[serde(default)]
    pub count: Option<u32>,
    /// Fixed seed so a good result can be made again.
    #[serde(default)]
    pub seed: Option<i64>,
}

/// A finished track of a story in the data repository.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MusicAsset {
    pub mood: String,
    /// File name in `<data>/music/sets/<set>/<mood>/`.
    pub file: String,
    /// Path in the data repository (below `music/` or `presets/`).
    pub path: String,
    pub sha256: String,
    /// From the adult content repository (fetched only while adult content is on).
    #[serde(default)]
    pub nsfw: bool,
    /// Origin, written next to the file: what made it and with which input.
    #[serde(default)]
    pub generator: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub caption: String,
    #[serde(default)]
    pub lyrics: String,
    #[serde(default)]
    pub seed: Option<i64>,
    #[serde(default)]
    pub generated: String,
    #[serde(default)]
    pub license: String,
}

/// `extensions.otakusoul_music` of a scene.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct StoryMusic {
    /// Folder of the story's music (`[a-z0-9_-]`); scenes of one story name the same set.
    /// Empty: the scene's id.
    #[serde(default)]
    pub set: String,
    /// Sound of the whole story, put in front of every mood's caption.
    #[serde(default)]
    pub style: String,
    #[serde(default)]
    pub moods: BTreeMap<String, MoodMusic>,
    #[serde(default)]
    pub tracks: Vec<MusicAsset>,
}

/// `extensions.otakusoul_music` of a lorebook: the sound of its world.
#[derive(Debug, Clone, Default, Deserialize)]
struct WorldMusic {
    #[serde(default)]
    style: String,
}

/// `extensions.otakusoul_music` of a character card: a leitmotif.
#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
pub struct CharacterTheme {
    #[serde(default)]
    pub theme: String,
    /// Moods it joins; empty: calm, romance and sorrow.
    #[serde(default)]
    pub moods: Vec<String>,
}

/// One mood as a generator gets it: the complete caption and lyrics.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct PlannedMood {
    pub mood: String,
    pub caption: String,
    pub lyrics: String,
    pub vocal_language: String,
    pub has_vocals: bool,
    pub bpm: Option<u32>,
    pub keyscale: String,
    pub duration: u32,
    pub count: u32,
    pub seed: Option<i64>,
    /// Finished tracks of this mood in the set folder.
    pub installed: u32,
}

/// The music of a scene: its set and every mood it asks for.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct SceneMusicPlan {
    /// `None`: the scene has no music of its own (it plays the general pool).
    pub set: Option<String>,
    pub style: String,
    /// Where the style comes from: `scene`, `lorebook` or empty.
    pub style_source: String,
    pub moods: Vec<PlannedMood>,
    /// Tracks the data repository ships for the story, and how many of them are here.
    pub shipped: u32,
    pub shipped_installed: u32,
}

pub fn valid_set_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
}

/// The scene's music section, if it has one.
pub fn story_music(def: &SceneDefinition) -> Option<StoryMusic> {
    def.extensions
        .get(MUSIC_EXTENSION)
        .and_then(|value| serde_json::from_value(value.clone()).ok())
}

/// The set folder of a scene: its `set`, else its id (only for scenes with a music section).
pub fn set_id(def: &SceneDefinition) -> Option<String> {
    let music = story_music(def)?;
    [music.set.trim(), def.id.trim()]
        .into_iter()
        .map(str::to_lowercase)
        .find(|id| valid_set_id(id))
}

pub fn set_dir(data_dir: &Path, set: &str) -> PathBuf {
    music_dir(data_dir).join("sets").join(set)
}

/// A shipped track that may be fetched: known mood, plain file name, repository path below
/// `music/` or `presets/` without `..`, a SHA-256.
fn valid_asset(asset: &MusicAsset) -> bool {
    let plain_name = !asset.file.is_empty()
        && !asset.file.contains(['/', '\\'])
        && !asset.file.starts_with('.')
        && crate::modules::stage_music::is_music_name(&asset.file);
    let safe_path = (asset.path.starts_with("music/") || asset.path.starts_with("presets/"))
        && !asset
            .path
            .split(['/', '\\'])
            .any(|part| part == ".." || part.is_empty());
    MOODS.contains(&asset.mood.as_str())
        && plain_name
        && safe_path
        && asset.sha256.len() == 64
        && asset
            .sha256
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
}

fn has_vocals(lyrics: &str) -> bool {
    let lyrics = lyrics.trim();
    !lyrics.is_empty() && !lyrics.eq_ignore_ascii_case(INSTRUMENTAL)
}

fn join_caption(parts: &[&str]) -> String {
    parts
        .iter()
        .map(|p| p.trim().trim_end_matches([',', '.']).trim())
        .filter(|p| !p.is_empty())
        .collect::<Vec<_>>()
        .join(", ")
}

fn count_files(dir: &Path) -> u32 {
    fs::read_dir(dir)
        .map(|entries| {
            entries
                .flatten()
                .filter(|e| {
                    e.path().is_file()
                        && e.file_name()
                            .to_str()
                            .is_some_and(crate::modules::stage_music::is_music_name)
                })
                .count() as u32
        })
        .unwrap_or(0)
}

/// The scene's plan from its own section, the styles of its lorebooks (in order) and the
/// leitmotifs of its party. `set_folder` counts what is already there.
pub fn plan(
    def: &SceneDefinition,
    lorebook_styles: &[String],
    themes: &[CharacterTheme],
    set_folder: Option<&Path>,
) -> SceneMusicPlan {
    let music = story_music(def).unwrap_or_default();
    let (style, style_source) = if !music.style.trim().is_empty() {
        (music.style.trim().to_string(), "scene")
    } else if let Some(style) = lorebook_styles.iter().find(|s| !s.trim().is_empty()) {
        (style.trim().to_string(), "lorebook")
    } else {
        (String::new(), "")
    };
    let moods = MOODS
        .iter()
        .filter_map(|mood| music.moods.get(*mood).map(|spec| (*mood, spec)))
        .map(|(mood, spec)| {
            let motifs: Vec<&str> = themes
                .iter()
                .filter(|t| {
                    if t.moods.is_empty() {
                        THEME_MOODS.contains(&mood)
                    } else {
                        t.moods.iter().any(|m| m == mood)
                    }
                })
                .map(|t| t.theme.as_str())
                .collect();
            let mut parts = vec![style.as_str(), spec.caption.as_str()];
            parts.extend(motifs);
            let vocals = has_vocals(&spec.lyrics);
            PlannedMood {
                mood: mood.to_string(),
                caption: join_caption(&parts),
                lyrics: if vocals {
                    spec.lyrics.trim().to_string()
                } else {
                    INSTRUMENTAL.to_string()
                },
                vocal_language: if vocals {
                    spec.vocal_language.trim().to_string()
                } else {
                    String::new()
                },
                has_vocals: vocals,
                bpm: spec.bpm.filter(|b| (30..=300).contains(b)),
                keyscale: spec.keyscale.trim().to_string(),
                duration: spec.duration.unwrap_or(DEFAULT_DURATION).clamp(10, 600),
                count: spec.count.unwrap_or(1).clamp(1, 8),
                seed: spec.seed,
                installed: set_folder
                    .map(|dir| count_files(&dir.join(mood)))
                    .unwrap_or(0),
            }
        })
        .collect();
    let shipped: Vec<&MusicAsset> = music.tracks.iter().filter(|t| valid_asset(t)).collect();
    let shipped_installed = set_folder
        .map(|dir| {
            shipped
                .iter()
                .filter(|t| dir.join(&t.mood).join(&t.file).is_file())
                .count() as u32
        })
        .unwrap_or(0);
    SceneMusicPlan {
        set: set_id(def),
        style,
        style_source: style_source.to_string(),
        moods,
        shipped: shipped.len() as u32,
        shipped_installed,
    }
}

/// Styles of the lorebooks a scene names (by name or id), in its order.
fn lorebook_styles(def: &SceneDefinition) -> Vec<String> {
    if def.lorebook.is_empty() {
        return Vec::new();
    }
    let all = crate::modules::lorebook::scan_available_lorebooks();
    def.lorebook
        .iter()
        .filter_map(|wanted| {
            all.iter()
                .find(|l| l.name.eq_ignore_ascii_case(wanted) || l.id.eq_ignore_ascii_case(wanted))
        })
        .filter_map(|l| l.extensions.get(MUSIC_EXTENSION).cloned())
        .filter_map(|value| serde_json::from_value::<WorldMusic>(value).ok())
        .map(|w| w.style)
        .collect()
}

/// Leitmotifs of the party's character cards.
fn party_themes(def: &SceneDefinition) -> Vec<CharacterTheme> {
    if def.party.is_empty() {
        return Vec::new();
    }
    let cards = crate::modules::paths::scan_available_characters();
    def.party
        .iter()
        .filter_map(|name| crate::modules::characters::find_by_name(&cards, name))
        .filter_map(|card| card.card.data.extensions.get(MUSIC_EXTENSION).cloned())
        .filter_map(|value| serde_json::from_value::<CharacterTheme>(value).ok())
        .filter(|t| !t.theme.trim().is_empty())
        .collect()
}

/// The plan of a scene with its lorebooks, party and the tracks already downloaded.
pub fn plan_for_scene(def: &SceneDefinition) -> SceneMusicPlan {
    let data_dir = PathBuf::from(resolve_app_paths().data_dir);
    let folder = set_id(def).map(|set| set_dir(&data_dir, &set));
    plan(
        def,
        &lorebook_styles(def),
        &party_themes(def),
        folder.as_deref(),
    )
}

/// Origin of a shipped track, saved as `<file>.json` next to it.
fn provenance(asset: &MusicAsset, set: &str) -> serde_json::Value {
    serde_json::json!({
        "set": set,
        "mood": asset.mood,
        "source": asset.path,
        "sha256": asset.sha256,
        "generator": asset.generator,
        "model": asset.model,
        "caption": asset.caption,
        "lyrics": asset.lyrics,
        "seed": asset.seed,
        "generated": asset.generated,
        "license": asset.license,
    })
}

/// One download at a time: opening a scene twice must not write the same file twice.
static DOWNLOADS: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// Downloads the tracks the data repository ships for the scene's story that are not in its set
/// folder yet (SHA-256 checked, origin saved next to each). Returns how many were fetched; a
/// failed track is logged and skipped, it is tried again next time.
pub async fn ensure_scene_music(def: &SceneDefinition) -> Result<u32, String> {
    use sha2::{Digest, Sha256};

    let (Some(music), Some(set)) = (story_music(def), set_id(def)) else {
        return Ok(0);
    };
    let adult = crate::modules::settings::nsfw_allowed();
    let wanted: Vec<MusicAsset> = music
        .tracks
        .into_iter()
        .filter(|t| valid_asset(t) && (adult || !t.nsfw))
        .collect();
    if wanted.is_empty() {
        return Ok(0);
    }
    let _guard = DOWNLOADS.lock().await;
    let dir = set_dir(&PathBuf::from(resolve_app_paths().data_dir), &set);
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| crate::err!("backend.common.httpClient", error = e))?;
    let mut fetched = 0;
    for asset in wanted {
        let mood_dir = dir.join(&asset.mood);
        let target = mood_dir.join(&asset.file);
        if target.is_file() {
            continue;
        }
        let encoded: Vec<String> = asset
            .path
            .split('/')
            .map(|part| urlencoding::encode(part).into_owned())
            .collect();
        let url = if asset.nsfw {
            crate::modules::hub::nsfw_hub_url(&encoded.join("/"))
        } else {
            crate::modules::hub::hub_url(&encoded.join("/"))
        };
        let bytes = match client.get(&url).send().await {
            Ok(res) if res.status().is_success() => res.bytes().await.ok(),
            _ => None,
        };
        let Some(bytes) = bytes.filter(|b| !b.is_empty()) else {
            tracing::warn!("Musik {} nicht geladen ({url})", asset.file);
            continue;
        };
        let digest: String = Sha256::digest(&bytes)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        if digest != asset.sha256 {
            tracing::warn!("Musik {}: Prüfsumme stimmt nicht", asset.file);
            continue;
        }
        fs::create_dir_all(&mood_dir)
            .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
        let partial = mood_dir.join(format!("{}.part", asset.file));
        fs::write(&partial, &bytes)
            .and_then(|()| fs::rename(&partial, &target))
            .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
        let origin = serde_json::to_string_pretty(&provenance(&asset, &set)).unwrap_or_default();
        let _ = fs::write(mood_dir.join(format!("{}.json", asset.file)), origin);
        fetched += 1;
    }
    Ok(fetched)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SHA: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    fn scene(extensions: serde_json::Value) -> SceneDefinition {
        serde_json::from_value(serde_json::json!({
            "id": "story_frozen_bells",
            "title": "T",
            "description": "D",
            "extensions": extensions,
        }))
        .unwrap()
    }

    #[test]
    fn scenes_without_music_play_the_general_pool() {
        let def = scene(serde_json::json!({}));
        assert_eq!(set_id(&def), None);
        let plan = plan(&def, &[], &[], None);
        assert_eq!(plan.set, None);
        assert!(plan.moods.is_empty());
    }

    #[test]
    fn set_defaults_to_the_scene_id_and_rejects_unsafe_names() {
        let def = scene(serde_json::json!({ "otakusoul_music": { "moods": {} } }));
        assert_eq!(set_id(&def).as_deref(), Some("story_frozen_bells"));
        let named = scene(serde_json::json!({ "otakusoul_music": { "set": "Frostweiler" } }));
        assert_eq!(set_id(&named).as_deref(), Some("frostweiler"));
        let evil = scene(serde_json::json!({ "otakusoul_music": { "set": "../x" } }));
        assert_eq!(set_id(&evil).as_deref(), Some("story_frozen_bells"));
    }

    #[test]
    fn plan_joins_style_caption_and_leitmotifs() {
        let def = scene(serde_json::json!({ "otakusoul_music": {
            "set": "frostweiler",
            "moods": {
                "calm": { "caption": "gentle harp, slow tempo.", "duration": 9999 },
                "combat": { "caption": "war drums", "bpm": 140, "count": 3 },
                "party": { "caption": "ignored" },
                "romance": { "caption": "warm strings", "lyrics": "[Verse]\nooh, aah", "vocal_language": "en" }
            }
        }}));
        let themes = [
            CharacterTheme {
                theme: "solo violin".into(),
                moods: vec![],
            },
            CharacterTheme {
                theme: "elven flute".into(),
                moods: vec!["combat".into()],
            },
        ];
        let plan = plan(&def, &["celtic folk, fiddle".into()], &themes, None);
        assert_eq!(plan.style_source, "lorebook");
        let moods: Vec<&str> = plan.moods.iter().map(|m| m.mood.as_str()).collect();
        assert_eq!(moods, ["calm", "combat", "romance"]);
        let calm = &plan.moods[0];
        assert_eq!(
            calm.caption,
            "celtic folk, fiddle, gentle harp, slow tempo, solo violin"
        );
        assert_eq!(calm.lyrics, INSTRUMENTAL);
        assert!(!calm.has_vocals);
        assert_eq!(calm.duration, 600);
        let combat = &plan.moods[1];
        assert_eq!(
            combat.caption,
            "celtic folk, fiddle, war drums, elven flute"
        );
        assert_eq!((combat.bpm, combat.count), (Some(140), 3));
        let romance = &plan.moods[2];
        assert!(romance.has_vocals);
        assert_eq!(romance.vocal_language, "en");
        assert_eq!(romance.lyrics, "[Verse]\nooh, aah");
    }

    #[test]
    fn scene_style_wins_over_the_lorebook() {
        let def = scene(serde_json::json!({ "otakusoul_music": { "style": "lo-fi piano" } }));
        let plan = plan(&def, &["celtic folk".into()], &[], None);
        assert_eq!(
            (plan.style.as_str(), plan.style_source.as_str()),
            ("lo-fi piano", "scene")
        );
    }

    #[test]
    fn only_safe_shipped_tracks_count() {
        let track = |mood: &str, file: &str, path: &str| serde_json::json!({ "mood": mood, "file": file, "path": path, "sha256": SHA });
        let def = scene(serde_json::json!({ "otakusoul_music": { "tracks": [
            track("calm", "calm_01.ogg", "music/frostweiler/calm_01.ogg"),
            track("calm", "calm_02.ogg", "music/../secrets/calm_02.ogg"),
            track("calm", "../calm.ogg", "music/frostweiler/calm.ogg"),
            track("party", "p.ogg", "music/frostweiler/p.ogg"),
            track("calm", "notes.txt", "music/frostweiler/notes.txt"),
            track("combat", "fight.ogg", "https://example.com/fight.ogg")
        ]}}));
        assert_eq!(plan(&def, &[], &[], None).shipped, 1);
    }

    #[test]
    fn counts_what_is_already_in_the_set_folder() {
        let dir = std::env::temp_dir().join(format!("otakusoul-set-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("calm")).unwrap();
        fs::write(dir.join("calm").join("calm_01.ogg"), b"x").unwrap();
        fs::write(dir.join("calm").join("calm_01.ogg.json"), b"{}").unwrap();
        let def = scene(serde_json::json!({ "otakusoul_music": {
            "moods": { "calm": { "caption": "harp" } },
            "tracks": [{ "mood": "calm", "file": "calm_01.ogg", "path": "music/x/calm_01.ogg", "sha256": SHA }]
        }}));
        let plan = plan(&def, &[], &[], Some(&dir));
        assert_eq!(plan.moods[0].installed, 1);
        assert_eq!((plan.shipped, plan.shipped_installed), (1, 1));
        let _ = fs::remove_dir_all(&dir);
    }
}
