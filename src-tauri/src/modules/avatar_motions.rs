//! Body motions for the 3D avatar: VRM animations (`.vrma`), Mixamo animations (`.fbx`,
//! retargeted onto the VRM in the frontend) and MMD motions (`.vmd`, for MMD models) the user
//! imports into `<data>/animations/`. Each file has a use (idle loop or a gesture such as waving); the
//! assignment lives next to the files in `roles.json`. Nothing is shipped or downloaded.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use ts_rs::TS;

/// Uses a motion can have; the frontend plays them on emotions and roleplay actions.
pub const ROLES: [&str; 8] = [
    "idle",
    "greeting",
    "nod",
    "happy",
    "sad",
    "angry",
    "surprised",
    "thinking",
];

const ROLES_FILE: &str = "roles.json";

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[ts(export)]
pub struct AvatarMotion {
    /// File name inside the animations folder (also the key of its role).
    pub file: String,
    pub name: String,
    pub path: String,
    /// One of `ROLES`, or empty when it is not used.
    pub role: String,
    /// File format: `vrma` or `fbx` (for VRM avatars), `vmd` (for MMD models).
    pub kind: String,
}

fn motions_dir() -> PathBuf {
    crate::modules::paths::base_dirs().1.join("animations")
}

/// The format by extension, if it is a motion file at all.
fn motion_kind(path: &Path) -> Option<&'static str> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    match extension.as_str() {
        "vrma" => Some("vrma"),
        "fbx" => Some("fbx"),
        "vmd" => Some("vmd"),
        _ => None,
    }
}

fn is_motion_file(path: &Path) -> bool {
    motion_kind(path).is_some()
}

/// The content matches the format: VRMA is binary glTF, FBX is binary ("Kaydara FBX Binary")
/// or the ASCII variant.
fn has_valid_header(kind: &str, head: &[u8]) -> bool {
    match kind {
        "vrma" => head.starts_with(b"glTF"),
        "fbx" => {
            head.starts_with(b"Kaydara FBX Binary")
                || String::from_utf8_lossy(head).contains("FBXHeaderExtension")
        }
        "vmd" => head.starts_with(b"Vocaloid Motion Data"),
        _ => false,
    }
}

/// A first guess from the file name, so typical packs work without setup.
pub fn guess_role(name: &str) -> &'static str {
    let name = name.to_lowercase();
    let has = |words: &[&str]| words.iter().any(|w| name.contains(w));
    if has(&["idle", "stand", "breath", "wait", "ruhe", "warten"]) {
        "idle"
    } else if has(&[
        "greet", "wave", "hello", "hi_", "bye", "wink", "gruß", "gruss", "hallo",
    ]) {
        "greeting"
    } else if has(&["nod", "yes", "agree", "nick"]) {
        "nod"
    } else if has(&[
        "happy", "joy", "laugh", "cheer", "peace", "jump", "freude", "lach",
    ]) {
        "happy"
    } else if has(&["sad", "cry", "sorrow", "trauer", "wein"]) {
        "sad"
    } else if has(&["angry", "anger", "mad", "wut", "ärger"]) {
        "angry"
    } else if has(&["surprise", "shock", "überrasch", "schreck"]) {
        "surprised"
    } else if has(&["think", "ponder", "hmm", "denk", "überleg"]) {
        "thinking"
    } else {
        ""
    }
}

fn read_roles(dir: &Path) -> BTreeMap<String, String> {
    fs::read_to_string(dir.join(ROLES_FILE))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn scan_in(dir: &Path) -> Vec<AvatarMotion> {
    let roles = read_roles(dir);
    let mut motions: Vec<AvatarMotion> = fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_file() && is_motion_file(path))
        .filter_map(|path| {
            let file = path.file_name()?.to_str()?.to_string();
            let name = path.file_stem()?.to_str()?.to_string();
            let role = roles
                .get(&file)
                .cloned()
                .unwrap_or_else(|| guess_role(&name).to_string());
            Some(AvatarMotion {
                file,
                name,
                kind: motion_kind(&path)?.to_string(),
                path: path.to_string_lossy().to_string(),
                role,
            })
        })
        .collect();
    motions.sort_by_key(|m| m.name.to_lowercase());
    motions
}

pub fn scan_avatar_motions() -> Vec<AvatarMotion> {
    scan_in(&motions_dir())
}

/// Copies a motion file into the animations folder; an identical file is reused, another one
/// with the same name gets a numbered name (like VRM imports).
pub fn import_avatar_motion(source_path: &str) -> Result<AvatarMotion, String> {
    import_into(Path::new(source_path), &motions_dir())
}

fn import_into(src: &Path, dir: &Path) -> Result<AvatarMotion, String> {
    if !src.is_file() {
        return Err(crate::err!(
            "backend.common.pathMissing",
            path = src.display()
        ));
    }
    let mut head = Vec::with_capacity(1024);
    let readable = fs::File::open(src)
        .and_then(|f| std::io::Read::read_to_end(&mut std::io::Read::take(f, 1024), &mut head))
        .is_ok();
    if !readable || !motion_kind(src).is_some_and(|kind| has_valid_header(kind, &head)) {
        return Err(crate::err!("backend.avatarMotion.invalid"));
    }
    fs::create_dir_all(dir).map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("motion");
    let extension = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("vrma")
        .to_lowercase();
    let source = fs::read(src).map_err(|e| {
        crate::err!(
            "backend.common.fileReadPath",
            path = src.display(),
            error = e
        )
    })?;
    let mut dest = dir.join(format!("{stem}.{extension}"));
    let mut n = 2;
    while dest.exists() && fs::read(&dest).ok().as_deref() != Some(source.as_slice()) {
        dest = dir.join(format!("{stem} ({n}).{extension}"));
        n += 1;
    }
    if !dest.exists() {
        fs::write(&dest, &source)
            .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    }
    let file = dest
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or_default()
        .to_string();
    scan_in(dir)
        .into_iter()
        .find(|m| m.file == file)
        .ok_or_else(|| crate::err!("backend.avatarMotion.invalid"))
}

pub fn set_avatar_motion_role(file: &str, role: &str) -> Result<(), String> {
    set_role_in(&motions_dir(), file, role)
}

fn set_role_in(dir: &Path, file: &str, role: &str) -> Result<(), String> {
    if !role.is_empty() && !ROLES.contains(&role) {
        return Err(crate::err!("backend.avatarMotion.role", role = role));
    }
    let mut roles = read_roles(dir);
    roles.insert(file.to_string(), role.to_string());
    let text = serde_json::to_string_pretty(&roles).unwrap_or_default();
    fs::create_dir_all(dir).map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    fs::write(dir.join(ROLES_FILE), text)
        .map_err(|e| crate::err!("backend.common.fileWrite", error = e))
}

/// Removes the file and its role.
pub fn delete_avatar_motion(file: &str) -> Result<(), String> {
    delete_in(&motions_dir(), file)
}

fn delete_in(dir: &Path, file: &str) -> Result<(), String> {
    // Only plain file names inside the folder.
    let path = dir.join(file);
    if Path::new(file).file_name().and_then(|n| n.to_str()) != Some(file) || !is_motion_file(&path)
    {
        return Err(crate::err!("backend.avatarMotion.invalid"));
    }
    if path.exists() {
        fs::remove_file(&path).map_err(|e| crate::err!("backend.common.delete", error = e))?;
    }
    let mut roles = read_roles(dir);
    if roles.remove(file).is_some() {
        let text = serde_json::to_string_pretty(&roles).unwrap_or_default();
        fs::write(dir.join(ROLES_FILE), text)
            .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guesses_roles_from_names() {
        assert_eq!(guess_role("VRMA_02_greeting"), "greeting");
        assert_eq!(guess_role("Idle_Breathing"), "idle");
        assert_eq!(guess_role("nicken"), "nod");
        assert_eq!(guess_role("VRMA_05_spin"), "");
    }

    #[test]
    fn imports_assigns_and_deletes() {
        let tmp = std::env::temp_dir().join(format!("otakusoul-motions-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        let src = tmp.join("Wave Hello.vrma");
        fs::write(&src, b"glTF\x02\0\0\0rest").unwrap();
        let dir = tmp.join("animations");

        let motion = import_into(&src, &dir).unwrap();
        assert_eq!(
            (motion.file.as_str(), motion.role.as_str()),
            ("Wave Hello.vrma", "greeting")
        );
        // The same file again is reused, not copied.
        assert_eq!(import_into(&src, &dir).unwrap().file, "Wave Hello.vrma");

        set_role_in(&dir, "Wave Hello.vrma", "idle").unwrap();
        assert_eq!(scan_in(&dir)[0].role, "idle");
        assert!(set_role_in(&dir, "Wave Hello.vrma", "dance").is_err());

        let fbx = tmp.join("Mixamo Nod.fbx");
        let mut binary = b"Kaydara FBX Binary  \0\x1a\0".to_vec();
        binary.extend_from_slice(&[0; 32]);
        fs::write(&fbx, binary).unwrap();
        let motion = import_into(&fbx, &dir).unwrap();
        assert_eq!((motion.kind.as_str(), motion.role.as_str()), ("fbx", "nod"));
        let ascii = tmp.join("ascii.fbx");
        fs::write(&ascii, "; FBX 7.4.0 project file\nFBXHeaderExtension:  {\n").unwrap();
        assert_eq!(import_into(&ascii, &dir).unwrap().kind, "fbx");
        delete_in(&dir, "Mixamo Nod.fbx").unwrap();
        delete_in(&dir, "ascii.fbx").unwrap();
        let vmd = tmp.join("dance.vmd");
        fs::write(&vmd, b"Vocaloid Motion Data 0002\0\0\0\0\0").unwrap();
        assert_eq!(import_into(&vmd, &dir).unwrap().kind, "vmd");
        delete_in(&dir, "dance.vmd").unwrap();

        let not_gltf = tmp.join("fake.vrma");
        fs::write(&not_gltf, b"nope").unwrap();
        assert!(import_into(&not_gltf, &dir).is_err());

        assert!(delete_in(&dir, "../fake.vrma").is_err());
        delete_in(&dir, "Wave Hello.vrma").unwrap();
        assert!(scan_in(&dir).is_empty());
        assert!(read_roles(&dir).is_empty());
        let _ = fs::remove_dir_all(&tmp);
    }
}
