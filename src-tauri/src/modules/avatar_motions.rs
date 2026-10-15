//! Body motions for the 3D avatar: VRM animations (`.vrma`), Mixamo animations (`.fbx`,
//! retargeted onto the VRM in the frontend) and MMD motions (`.vmd`, for MMD models) the user
//! imports into `<data>/animations/`. Each file has a use (idle loop or a gesture such as waving); the
//! assignment lives next to the files in `roles.json`. Nothing is shipped or downloaded.
//!
//! glTF avatars can also bring their own animations inside the model file. Their names are read
//! straight from the file (`model_clips`) and their uses are kept per model in `model_roles.json`.

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

/// Moods a motion can be meant for (VRM expressions); empty = any mood. With several motions for
/// one use, the frontend prefers those matching the avatar's current emotion.
pub const MOODS: [&str; 5] = ["happy", "sad", "angry", "surprised", "relaxed"];

const ROLES_FILE: &str = "roles.json";
const MOODS_FILE: &str = "moods.json";
const MODEL_ROLES_FILE: &str = "model_roles.json";
/// Larger JSON chunks are no real avatar (the JSON only describes the model, the data is binary).
const MAX_GLTF_JSON: u64 = 64 * 1024 * 1024;

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
    /// One of `MOODS`, or empty for any mood.
    pub mood: String,
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

/// The mood a name suggests ("Wave_Happy", "Idle_Sad"), empty when none.
pub fn guess_mood(name: &str) -> &'static str {
    let name = name.to_lowercase();
    let has = |words: &[&str]| words.iter().any(|w| name.contains(w));
    if has(&[
        "happy",
        "joy",
        "smile",
        "laugh",
        "cheer",
        "excite",
        "fröhlich",
        "freude",
        "lach",
    ]) {
        "happy"
    } else if has(&[
        "sad", "cry", "sorrow", "depress", "trauer", "traurig", "wein",
    ]) {
        "sad"
    } else if has(&[
        "angry", "anger", "mad", "rage", "annoy", "wut", "wütend", "ärger",
    ]) {
        "angry"
    } else if has(&["surprise", "shock", "startle", "überrasch", "schreck"]) {
        "surprised"
    } else if has(&[
        "relax", "calm", "shy", "gentle", "ruhig", "sanft", "entspann",
    ]) {
        "relaxed"
    } else {
        ""
    }
}

fn check_mood(mood: &str) -> Result<(), String> {
    if mood.is_empty() || MOODS.contains(&mood) {
        Ok(())
    } else {
        Err(crate::err!("backend.avatarMotion.mood", mood = mood))
    }
}

fn read_moods(dir: &Path) -> BTreeMap<String, String> {
    fs::read_to_string(dir.join(MOODS_FILE))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn write_map(dir: &Path, file: &str, map: &impl Serialize) -> Result<(), String> {
    let text = serde_json::to_string_pretty(map).unwrap_or_default();
    fs::create_dir_all(dir).map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    fs::write(dir.join(file), text).map_err(|e| crate::err!("backend.common.fileWrite", error = e))
}

fn read_roles(dir: &Path) -> BTreeMap<String, String> {
    fs::read_to_string(dir.join(ROLES_FILE))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn scan_in(dir: &Path) -> Vec<AvatarMotion> {
    let roles = read_roles(dir);
    let moods = read_moods(dir);
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
            let mood = moods
                .get(&file)
                .cloned()
                .unwrap_or_else(|| guess_mood(&name).to_string());
            Some(AvatarMotion {
                mood,
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

pub fn set_avatar_motion_mood(file: &str, mood: &str) -> Result<(), String> {
    set_mood_in(&motions_dir(), file, mood)
}

fn set_mood_in(dir: &Path, file: &str, mood: &str) -> Result<(), String> {
    check_mood(mood)?;
    let mut moods = read_moods(dir);
    moods.insert(file.to_string(), mood.to_string());
    write_map(dir, MOODS_FILE, &moods)
}

/// Removes the file, its role and its mood.
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
        write_map(dir, ROLES_FILE, &roles)?;
    }
    let mut moods = read_moods(dir);
    if moods.remove(file).is_some() {
        write_map(dir, MOODS_FILE, &moods)?;
    }
    Ok(())
}

/// An animation stored inside a glTF avatar and its use.
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[ts(export)]
pub struct ModelClip {
    /// The clip name as three.js names it (`animation_<n>` when the file has none).
    pub name: String,
    /// One of `ROLES`, or empty when it is not used (it can still be played by hand).
    pub role: String,
    /// One of `MOODS`, or empty for any mood.
    pub mood: String,
}

/// What the user chose for one clip; unset fields fall back to the guess from the name.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct ClipUse {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    role: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    mood: Option<String>,
}

/// The JSON part of a glTF file: the first chunk of a `.glb`, or the whole `.gltf` text. Only
/// the JSON is read, never the (large) binary buffer behind it.
fn read_gltf_json(path: &Path) -> Result<serde_json::Value, String> {
    use std::io::Read;
    let invalid = || crate::err!("backend.avatarMotion.modelInvalid");
    let mut file = fs::File::open(path).map_err(|e| {
        crate::err!(
            "backend.common.fileReadPath",
            path = path.display(),
            error = e
        )
    })?;
    let mut head = [0u8; 20];
    let read = file.read(&mut head).map_err(|_| invalid())?;
    let text = if read >= 20 && head.starts_with(b"glTF") {
        let length = u64::from(u32::from_le_bytes(
            head[12..16].try_into().unwrap_or_default(),
        ));
        if &head[16..20] != b"JSON" || length > MAX_GLTF_JSON {
            return Err(invalid());
        }
        let mut json = Vec::new();
        file.take(length)
            .read_to_end(&mut json)
            .map_err(|_| invalid())?;
        json
    } else {
        let mut text = head[..read].to_vec();
        file.take(MAX_GLTF_JSON)
            .read_to_end(&mut text)
            .map_err(|_| invalid())?;
        text
    };
    serde_json::from_slice(&text).map_err(|_| invalid())
}

/// Animation names of a glTF file in file order, unnamed ones as three.js's GLTFLoader names them.
fn gltf_animation_names(gltf: &serde_json::Value) -> Vec<String> {
    gltf.get("animations")
        .and_then(serde_json::Value::as_array)
        .map(|animations| {
            animations
                .iter()
                .enumerate()
                .map(|(i, animation)| {
                    animation
                        .get("name")
                        .and_then(serde_json::Value::as_str)
                        .filter(|name| !name.is_empty())
                        .map_or_else(|| format!("animation_{i}"), str::to_string)
                })
                .collect()
        })
        .unwrap_or_default()
}

/// The model inside one of the avatar folders, as the key its clip uses are stored under.
fn model_key(model_path: &str, roots: &[PathBuf]) -> Result<(PathBuf, String), String> {
    let model = fs::canonicalize(model_path)
        .map_err(|_| crate::err!("backend.common.pathMissing", path = model_path))?;
    let inside = roots
        .iter()
        .filter_map(|root| fs::canonicalize(root).ok())
        .any(|root| model.starts_with(root));
    let key = model
        .file_name()
        .and_then(|n| n.to_str())
        .filter(|_| inside)
        .ok_or_else(|| crate::err!("backend.vrm.invalid"))?
        .to_string();
    Ok((model, key))
}

type ModelRoles = BTreeMap<String, BTreeMap<String, ClipUse>>;

fn read_model_roles(dir: &Path) -> ModelRoles {
    fs::read_to_string(dir.join(MODEL_ROLES_FILE))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

/// The animations inside a glTF avatar with their uses: the saved one, else guessed from the name.
pub fn model_clips(model_path: &str) -> Result<Vec<ModelClip>, String> {
    model_clips_in(
        model_path,
        &crate::modules::paths::avatar_roots(),
        &motions_dir(),
    )
}

fn model_clips_in(
    model_path: &str,
    roots: &[PathBuf],
    dir: &Path,
) -> Result<Vec<ModelClip>, String> {
    let (model, key) = model_key(model_path, roots)?;
    let saved = read_model_roles(dir).remove(&key).unwrap_or_default();
    Ok(gltf_animation_names(&read_gltf_json(&model)?)
        .into_iter()
        .map(|name| {
            let chosen = saved.get(&name).cloned().unwrap_or_default();
            ModelClip {
                role: chosen.role.unwrap_or_else(|| guess_role(&name).to_string()),
                mood: chosen.mood.unwrap_or_else(|| guess_mood(&name).to_string()),
                name,
            }
        })
        .collect())
}

pub fn set_model_clip_role(model_path: &str, clip: &str, role: &str) -> Result<(), String> {
    if !role.is_empty() && !ROLES.contains(&role) {
        return Err(crate::err!("backend.avatarMotion.role", role = role));
    }
    update_clip_use(
        model_path,
        clip,
        &crate::modules::paths::avatar_roots(),
        &motions_dir(),
        |chosen| chosen.role = Some(role.to_string()),
    )
}

pub fn set_model_clip_mood(model_path: &str, clip: &str, mood: &str) -> Result<(), String> {
    check_mood(mood)?;
    update_clip_use(
        model_path,
        clip,
        &crate::modules::paths::avatar_roots(),
        &motions_dir(),
        |chosen| chosen.mood = Some(mood.to_string()),
    )
}

fn update_clip_use(
    model_path: &str,
    clip: &str,
    roots: &[PathBuf],
    dir: &Path,
    change: impl FnOnce(&mut ClipUse),
) -> Result<(), String> {
    let (_, key) = model_key(model_path, roots)?;
    let mut uses = read_model_roles(dir);
    change(
        uses.entry(key)
            .or_default()
            .entry(clip.to_string())
            .or_default(),
    );
    write_map(dir, MODEL_ROLES_FILE, &uses)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guesses_moods_and_keeps_chosen_ones() {
        assert_eq!(guess_mood("Wave_Happy"), "happy");
        assert_eq!(guess_mood("Idle_Sad_Loop"), "sad");
        assert_eq!(guess_mood("Emote_Shy"), "relaxed");
        assert_eq!(guess_mood("Emote_Wave"), "");
        assert!(check_mood("dance").is_err());

        let tmp = std::env::temp_dir().join(format!("otakusoul-moods-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        fs::write(tmp.join("Idle Happy.vrma"), b"glTF\x02\0\0\0rest").unwrap();
        assert_eq!(scan_in(&tmp)[0].mood, "happy");
        set_mood_in(&tmp, "Idle Happy.vrma", "").unwrap();
        assert_eq!(scan_in(&tmp)[0].mood, "");
        assert!(set_mood_in(&tmp, "Idle Happy.vrma", "bored").is_err());
        delete_in(&tmp, "Idle Happy.vrma").unwrap();
        assert!(read_moods(&tmp).is_empty());
        let _ = fs::remove_dir_all(&tmp);
    }

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

    /// A minimal GLB: header, JSON chunk (padded to 4 bytes), no binary chunk.
    fn glb(json: &str) -> Vec<u8> {
        let mut chunk = json.as_bytes().to_vec();
        while !chunk.len().is_multiple_of(4) {
            chunk.push(b' ');
        }
        let mut out = b"glTF".to_vec();
        out.extend_from_slice(&2u32.to_le_bytes());
        out.extend_from_slice(&((12 + 8 + chunk.len()) as u32).to_le_bytes());
        out.extend_from_slice(&(chunk.len() as u32).to_le_bytes());
        out.extend_from_slice(b"JSON");
        out.extend_from_slice(&chunk);
        out
    }

    #[test]
    fn reads_and_assigns_model_clips() {
        let tmp = std::env::temp_dir().join(format!("otakusoul-clips-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        let avatars = tmp.join("avatars");
        fs::create_dir_all(&avatars).unwrap();
        let roots = [avatars.clone()];
        let dir = tmp.join("animations");
        let model = avatars.join("Figur.glb");
        fs::write(
            &model,
            glb(r#"{"asset":{"version":"2.0"},"animations":[{"name":"A_Idle_Loop"},{"name":"Emote_Wave"},{},{"name":"Attack_01"}]}"#),
        )
        .unwrap();
        let path = model.to_str().unwrap();

        let clips = model_clips_in(path, &roots, &dir).unwrap();
        let pairs: Vec<_> = clips
            .iter()
            .map(|c| (c.name.as_str(), c.role.as_str()))
            .collect();
        assert_eq!(
            pairs,
            [
                ("A_Idle_Loop", "idle"),
                ("Emote_Wave", "greeting"),
                ("animation_2", ""),
                ("Attack_01", "")
            ]
        );

        let set = |clip: &str, role: Option<&str>, mood: Option<&str>| {
            update_clip_use(path, clip, &roots, &dir, |chosen| {
                if let Some(role) = role {
                    chosen.role = Some(role.to_string());
                }
                if let Some(mood) = mood {
                    chosen.mood = Some(mood.to_string());
                }
            })
        };
        set("Attack_01", Some("angry"), None).unwrap();
        set("A_Idle_Loop", Some(""), None).unwrap();
        set("Emote_Wave", None, Some("happy")).unwrap();
        let clips = model_clips_in(path, &roots, &dir).unwrap();
        assert_eq!(clips[0].role, "");
        assert_eq!(clips[3].role, "angry");
        // The role of the wave is still guessed, its mood is the chosen one.
        assert_eq!(
            (clips[1].role.as_str(), clips[1].mood.as_str()),
            ("greeting", "happy")
        );

        // A plain .gltf (JSON text) works too; files outside the avatar folders do not.
        let text = avatars.join("Text.gltf");
        fs::write(&text, r#"{"animations":[{"name":"Nod"}]}"#).unwrap();
        assert_eq!(
            model_clips_in(text.to_str().unwrap(), &roots, &dir).unwrap()[0].role,
            "nod"
        );
        let outside = tmp.join("Outside.glb");
        fs::write(&outside, glb("{}")).unwrap();
        assert!(model_clips_in(outside.to_str().unwrap(), &roots, &dir).is_err());
        // Without animations the list is empty; broken files are an error.
        let none = avatars.join("None.glb");
        fs::write(&none, glb(r#"{"asset":{}}"#)).unwrap();
        assert!(
            model_clips_in(none.to_str().unwrap(), &roots, &dir)
                .unwrap()
                .is_empty()
        );
        let broken = avatars.join("Broken.glb");
        fs::write(&broken, b"glTF\x02\0\0\0\x20\0\0\0\x99\0\0\0BIN\0").unwrap();
        assert!(model_clips_in(broken.to_str().unwrap(), &roots, &dir).is_err());
        let _ = fs::remove_dir_all(&tmp);
    }
}
