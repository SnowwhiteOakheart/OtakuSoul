//! Own names for avatars and removing imported ones. Files keep their names (settings, character
//! cards, face and clip settings point to the paths); the name shown comes from
//! `<data>/avatar_names.json`. Removing moves an imported model to the app's trash, bundled models
//! stay. Preview pictures the avatar manager takes of a model lie in `<data>/avatar_thumbs/`.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Component, Path, PathBuf};

/// `vrm` (3D: VRM, glTF, MMD) or `live2d`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AvatarKind {
    Vrm,
    Live2d,
}

impl AvatarKind {
    pub fn parse(kind: &str) -> Result<Self, String> {
        match kind {
            "vrm" => Ok(Self::Vrm),
            "live2d" => Ok(Self::Live2d),
            _ => Err(crate::err!("backend.avatar.unknownKind", kind = kind)),
        }
    }

    /// Folder imported models of this kind live in.
    fn user_dir(self, data_dir: &Path) -> PathBuf {
        data_dir.join(match self {
            Self::Vrm => "avatars",
            Self::Live2d => "live2d",
        })
    }
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct Names {
    #[serde(default)]
    vrm: BTreeMap<String, String>,
    #[serde(default)]
    live2d: BTreeMap<String, String>,
}

impl Names {
    fn of(&mut self, kind: AvatarKind) -> &mut BTreeMap<String, String> {
        match kind {
            AvatarKind::Vrm => &mut self.vrm,
            AvatarKind::Live2d => &mut self.live2d,
        }
    }
}

/// Names as long as a window title stays readable.
const MAX_NAME_CHARS: usize = 80;

fn names_file(data_dir: &Path) -> PathBuf {
    data_dir.join("avatar_names.json")
}

fn load(data_dir: &Path) -> Names {
    fs::read_to_string(names_file(data_dir))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn store(data_dir: &Path, names: &Names) -> Result<(), String> {
    let json = serde_json::to_string_pretty(names)
        .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    fs::write(names_file(data_dir), json)
        .map_err(|e| crate::err!("backend.common.fileWrite", error = e))
}

/// Largest preview picture accepted (a 4:3 WebP of a few hundred pixels is far smaller).
const MAX_THUMBNAIL_BYTES: usize = 2 * 1024 * 1024;

impl AvatarKind {
    fn label(self) -> &'static str {
        match self {
            Self::Vrm => "vrm",
            Self::Live2d => "live2d",
        }
    }
}

/// Where the preview picture of a model goes: named after a hash of its key, so names with any
/// characters and moved app folders work.
fn thumbnail_file(data_dir: &Path, kind: AvatarKind, key: &str) -> PathBuf {
    use sha2::{Digest, Sha256};
    let hash = Sha256::digest(key.as_bytes());
    let short: String = hash.iter().take(10).map(|b| format!("{b:02x}")).collect();
    data_dir
        .join("avatar_thumbs")
        .join(format!("{}-{short}.webp", kind.label()))
}

/// The saved preview picture of a model, if there is one.
pub fn thumbnail(data_dir: &Path, kind: AvatarKind, key: &str) -> Option<String> {
    let file = thumbnail_file(data_dir, kind, key);
    file.is_file().then(|| file.to_string_lossy().into_owned())
}

/// Stores a preview picture (`data:image/webp;base64,…` or PNG) and returns its file.
pub fn save_thumbnail(
    data_dir: &Path,
    kind: AvatarKind,
    key: &str,
    data_url: &str,
) -> Result<String, String> {
    use base64::Engine as _;
    let invalid = || crate::err!("backend.avatar.invalidThumbnail");
    let encoded = data_url
        .strip_prefix("data:image/webp;base64,")
        .or_else(|| data_url.strip_prefix("data:image/png;base64,"))
        .ok_or_else(invalid)?;
    if encoded.len() > MAX_THUMBNAIL_BYTES * 4 / 3 + 4 {
        return Err(invalid());
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|_| invalid())?;
    let webp = bytes.len() > 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP";
    let png = bytes.starts_with(b"\x89PNG\r\n\x1a\n");
    if !(webp || png) || bytes.len() > MAX_THUMBNAIL_BYTES {
        return Err(invalid());
    }
    let file = thumbnail_file(data_dir, kind, key);
    if let Some(dir) = file.parent() {
        fs::create_dir_all(dir).map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    }
    fs::write(&file, bytes).map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    Ok(file.to_string_lossy().into_owned())
}

/// Key of a model in the name list: its path below one of `roots` with `/`, else the whole
/// path. Bundled models keep their key when the app moves to another folder.
pub fn key_for(path: &Path, roots: &[PathBuf]) -> String {
    roots
        .iter()
        .find_map(|root| path.strip_prefix(root).ok())
        .unwrap_or(path)
        .components()
        .filter_map(|c| match c {
            Component::Normal(part) => Some(part.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

/// The user's name for a model, if one was given.
pub fn custom_name(data_dir: &Path, kind: AvatarKind, key: &str) -> Option<String> {
    load(data_dir).of(kind).get(key).cloned()
}

/// Gives a model an own name; an empty name returns to the one from the file.
pub fn rename(data_dir: &Path, kind: AvatarKind, key: &str, name: &str) -> Result<(), String> {
    let name: String = name.trim().chars().take(MAX_NAME_CHARS).collect();
    let mut names = load(data_dir);
    if name.is_empty() {
        names.of(kind).remove(key);
    } else {
        names.of(kind).insert(key.to_string(), name);
    }
    store(data_dir, &names)
}

/// Whether `path` is an imported model (inside the user's folder of its kind) that may be removed.
pub fn removable(data_dir: &Path, kind: AvatarKind, path: &Path) -> bool {
    imported_entry(data_dir, kind, path).is_some()
}

/// The file or folder directly in the user's folder that holds `path` (a folder model is removed
/// as a whole). `None` for bundled models or paths outside.
fn imported_entry(data_dir: &Path, kind: AvatarKind, path: &Path) -> Option<PathBuf> {
    let root = fs::canonicalize(kind.user_dir(data_dir)).ok()?;
    let path = fs::canonicalize(path).ok()?;
    let first = path.strip_prefix(&root).ok()?.components().next()?;
    match first {
        Component::Normal(part) => Some(root.join(part)),
        _ => None,
    }
}

/// Moves an imported model (with its folder) to the trash and forgets its name. Returns where it
/// went, so it can be put back.
pub fn remove(
    data_dir: &Path,
    trash_dir: &Path,
    kind: AvatarKind,
    path: &Path,
    key: &str,
) -> Result<PathBuf, String> {
    let entry = imported_entry(data_dir, kind, path)
        .ok_or_else(|| crate::err!("backend.avatar.notRemovable"))?;
    let trash = trash_dir.join("avatars");
    fs::create_dir_all(&trash).map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let file_name = entry
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    let target = trash.join(format!("{timestamp}_{file_name}"));
    fs::rename(&entry, &target).map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    let mut names = load(data_dir);
    if names.of(kind).remove(key).is_some() {
        store(data_dir, &names)?;
    }
    // The preview picture is made from the model again when it comes back.
    let _ = fs::remove_file(thumbnail_file(data_dir, kind, key));
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "otakusoul-avatar-lib-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn names_are_kept_per_kind_and_reset_when_empty() {
        let data = temp("names");
        rename(&data, AvatarKind::Vrm, "Mika.vrm", "  Mika im Kimono ").unwrap();
        rename(&data, AvatarKind::Live2d, "haru", "Haru").unwrap();
        assert_eq!(
            custom_name(&data, AvatarKind::Vrm, "Mika.vrm").as_deref(),
            Some("Mika im Kimono")
        );
        assert_eq!(custom_name(&data, AvatarKind::Live2d, "Mika.vrm"), None);
        rename(&data, AvatarKind::Vrm, "Mika.vrm", "").unwrap();
        assert_eq!(custom_name(&data, AvatarKind::Vrm, "Mika.vrm"), None);
        assert_eq!(
            custom_name(&data, AvatarKind::Live2d, "haru").as_deref(),
            Some("Haru")
        );
        let _ = fs::remove_dir_all(data);
    }

    #[test]
    fn thumbnails_are_checked_and_found_by_key() {
        use base64::Engine as _;
        let data = temp("thumbs");
        let webp = [b"RIFF".as_slice(), &[8, 0, 0, 0], b"WEBPVP8 "].concat();
        let url = format!(
            "data:image/webp;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(&webp)
        );
        assert_eq!(thumbnail(&data, AvatarKind::Vrm, "Mika.vrm"), None);
        let file = save_thumbnail(&data, AvatarKind::Vrm, "Mika.vrm", &url).unwrap();
        assert_eq!(fs::read(&file).unwrap(), webp);
        assert_eq!(thumbnail(&data, AvatarKind::Vrm, "Mika.vrm"), Some(file));
        assert_eq!(thumbnail(&data, AvatarKind::Live2d, "Mika.vrm"), None);
        // Not a picture, wrong type or too large: refused.
        let text = base64::engine::general_purpose::STANDARD.encode(b"<script>");
        assert!(
            save_thumbnail(
                &data,
                AvatarKind::Vrm,
                "x",
                &format!("data:image/webp;base64,{text}")
            )
            .is_err()
        );
        assert!(save_thumbnail(&data, AvatarKind::Vrm, "x", "data:text/html;base64,AAAA").is_err());
        let huge = "A".repeat(MAX_THUMBNAIL_BYTES * 2);
        assert!(
            save_thumbnail(
                &data,
                AvatarKind::Vrm,
                "x",
                &format!("data:image/png;base64,{huge}")
            )
            .is_err()
        );
        let _ = fs::remove_dir_all(data);
    }

    #[test]
    fn keys_are_relative_to_their_root() {
        let roots = [
            PathBuf::from("/opt/app/assets/vrm"),
            PathBuf::from("/home/u/data/avatars"),
        ];
        assert_eq!(
            key_for(Path::new("/opt/app/assets/vrm/Anime Girl.vrm"), &roots),
            "Anime Girl.vrm"
        );
        assert_eq!(
            key_for(Path::new("/home/u/data/avatars/pack/model.pmx"), &roots),
            "pack/model.pmx"
        );
    }

    #[test]
    fn removes_imported_models_with_their_folder_into_the_trash() {
        let data = temp("remove");
        let trash = data.join(".trash");
        let pack = data.join("avatars").join("pack");
        fs::create_dir_all(pack.join("tex")).unwrap();
        fs::write(pack.join("model.pmx"), b"PMX ").unwrap();
        fs::write(data.join("avatars").join("Mika.vrm"), b"glTF").unwrap();
        rename(&data, AvatarKind::Vrm, "pack/model.pmx", "Kimono").unwrap();

        let moved = remove(
            &data,
            &trash,
            AvatarKind::Vrm,
            &pack.join("model.pmx"),
            "pack/model.pmx",
        )
        .unwrap();
        assert!(!pack.exists(), "the whole folder goes");
        assert!(moved.join("model.pmx").exists(), "into the trash, not away");
        assert_eq!(custom_name(&data, AvatarKind::Vrm, "pack/model.pmx"), None);
        assert!(
            data.join("avatars").join("Mika.vrm").exists(),
            "other models stay"
        );

        // Bundled models and paths outside the user's folder are refused.
        let bundled = data.join("bundled.vrm");
        fs::write(&bundled, b"glTF").unwrap();
        assert!(!removable(&data, AvatarKind::Vrm, &bundled));
        assert!(remove(&data, &trash, AvatarKind::Vrm, &bundled, "bundled.vrm").is_err());
        assert!(bundled.exists());
        let _ = fs::remove_dir_all(data);
    }
}
