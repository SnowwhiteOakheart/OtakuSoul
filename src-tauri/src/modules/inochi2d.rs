//! Inochi2D puppets (`.inp`, `.inx`): the free 2D puppet format next to Live2D. Models are single
//! files in `<data>/inochi2d/` (imported or downloaded) or in the bundled `assets/inochi2d/`.
//! The frontend renders them itself (`src/services/inochi2d`); here they are found, described from
//! their header (name, artist, licence) and imported.
//!
//! File layout: `TRNSRTS\0`, u32 (big endian) JSON length, JSON, `TEX_SECT`, u32 count, per texture
//! u32 length + u8 encoding (0 PNG, 1 TGA, 2 BC7) + data.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use tracing::info;
use ts_rs::TS;

use crate::modules::paths::resolve_app_paths;

const MAGIC: &[u8; 8] = b"TRNSRTS\0";
const TEX_SECT: &[u8; 8] = b"TEX_SECT";
/// A puppet description larger than this is not read for its header (real ones are a few MB).
const MAX_JSON_BYTES: u32 = 128 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ScannedInochi2d {
    /// File name (unique per folder), what character cards store.
    pub id: String,
    pub name: String,
    pub model_path: String,
    /// Preview picture stored inside the puppet (extracted once), if it has one.
    pub preview_image: Option<String>,
    pub size_mb: f64,
    pub artist: Option<String>,
    pub rigger: Option<String>,
    pub license_url: Option<String>,
    /// Imported or downloaded by the user (in `<data>/inochi2d`): can be removed.
    #[serde(default)]
    pub removable: bool,
    /// Preview picture taken in the avatar manager.
    #[serde(default)]
    pub thumbnail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Inochi2dCatalogItem {
    pub id: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub license: String,
    pub url: String,
    pub sha256: String,
    pub size_mb: f64,
    pub is_installed: bool,
}

/// One puppet of the registry (`inochi2d_registry.json`, shipped and in the data repository).
#[derive(Debug, Clone, Deserialize)]
struct RegistryPuppet {
    /// File name it is stored under (`.inp`/`.inx`), also what character cards name.
    id: String,
    name: String,
    #[serde(default)]
    author: String,
    #[serde(default)]
    license: String,
    url: String,
    sha256: String,
    size_bytes: u64,
    /// Shown only while adult content is on.
    #[serde(default)]
    nsfw: bool,
    /// Short description per language code.
    #[serde(default)]
    description: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Deserialize)]
struct Registry {
    version: u32,
    puppets: Vec<RegistryPuppet>,
}

/// Official Inochi2D example models (CC BY 4.0, design and rigging by seagetch) and whatever the
/// data repository adds later; never bundled, loaded from their source and checked (SHA-256).
const BUNDLED_REGISTRY: &str = include_str!("../../../presets/inochi2d_registry.json");
const REGISTRY_FILE: &str = "inochi2d_registry.json";

/// Whether an entry is safe to offer: a plain puppet file name, an https source and a checksum.
fn valid_entry(p: &RegistryPuppet) -> bool {
    let name_ok =
        !p.id.contains(['/', '\\']) && !p.id.starts_with('.') && is_puppet_name(Path::new(&p.id));
    name_ok
        && p.url.starts_with("https://")
        && p.sha256.len() == 64
        && p.sha256
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
        && p.size_bytes > 0
        && !p.name.trim().is_empty()
}

/// Parses a registry and drops invalid entries; `None` if nothing usable is left.
fn parse_registry(text: &str) -> Option<Registry> {
    let mut registry: Registry = serde_json::from_str(text).ok()?;
    registry.puppets.retain(valid_entry);
    (!registry.puppets.is_empty()).then_some(registry)
}

/// The registry in use: the downloaded copy if it is newer than the shipped one.
fn registry(data_dir: &Path) -> Registry {
    let bundled = parse_registry(BUNDLED_REGISTRY).expect("shipped Inochi2D registry is valid");
    fs::read_to_string(data_dir.join(REGISTRY_FILE))
        .ok()
        .and_then(|text| parse_registry(&text))
        .filter(|downloaded| downloaded.version > bundled.version)
        .unwrap_or(bundled)
}

/// Fetches the registry from the data repository at start (kept for the next catalog request).
pub async fn refresh_registry() {
    let fetch = async {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(20))
            .build()
            .map_err(|e| e.to_string())?;
        let text = client
            .get(crate::modules::hub::hub_url(REGISTRY_FILE))
            .send()
            .await
            .and_then(reqwest::Response::error_for_status)
            .map_err(|e| e.to_string())?
            .text()
            .await
            .map_err(|e| e.to_string())?;
        parse_registry(&text).ok_or("keine gültige Registry")?;
        let data_dir = PathBuf::from(resolve_app_paths().data_dir);
        fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
        fs::write(data_dir.join(REGISTRY_FILE), text).map_err(|e| e.to_string())
    };
    if let Err(e) = fetch.await {
        tracing::debug!("Inochi2D-Registry nicht geladen: {e}");
    }
}

/// Description in `lang`, else English, else German, else any.
fn describe_in(p: &RegistryPuppet, lang: &str) -> String {
    [lang, "en", "de"]
        .iter()
        .find_map(|l| p.description.get(*l))
        .or_else(|| p.description.values().next())
        .cloned()
        .unwrap_or_default()
}

/// Header facts of a puppet.
#[derive(Debug, Default, PartialEq)]
pub struct PuppetInfo {
    pub name: Option<String>,
    pub artist: Option<String>,
    pub rigger: Option<String>,
    pub license_url: Option<String>,
    pub thumbnail_id: Option<u32>,
}

/// Some exporters pad texts with zero bytes.
fn clean(value: Option<&serde_json::Value>) -> Option<String> {
    let text = value?.as_str()?.replace('\0', "");
    let text = text.trim();
    (!text.is_empty()).then(|| text.to_string())
}

/// Reads the JSON part of a puppet file.
fn read_payload(file: &mut fs::File) -> Option<serde_json::Value> {
    let mut head = [0_u8; 12];
    file.read_exact(&mut head).ok()?;
    if &head[..8] != MAGIC {
        return None;
    }
    let length = u32::from_be_bytes([head[8], head[9], head[10], head[11]]);
    if length == 0 || length > MAX_JSON_BYTES {
        return None;
    }
    let mut json = vec![0_u8; length as usize];
    file.read_exact(&mut json).ok()?;
    serde_json::from_slice(&json).ok()
}

/// Name, artist and licence from the puppet's header; `None` if it is no Inochi2D puppet.
pub fn puppet_info(path: &Path) -> Option<PuppetInfo> {
    let mut file = fs::File::open(path).ok()?;
    let payload = read_payload(&mut file)?;
    payload.get("nodes")?;
    let meta = payload.get("meta");
    let field = |key: &str| clean(meta.and_then(|m| m.get(key)));
    let thumbnail_id = meta
        .and_then(|m| m.get("thumbnailId"))
        .and_then(serde_json::Value::as_u64)
        .filter(|id| *id < u64::from(u32::MAX))
        .map(|id| id as u32);
    Some(PuppetInfo {
        name: field("name"),
        artist: field("artist"),
        rigger: field("rigger"),
        license_url: field("licenseURL"),
        thumbnail_id,
    })
}

/// The PNG picture texture `index` holds (the puppet's own preview), if it is one.
fn embedded_png(path: &Path, index: u32) -> Option<Vec<u8>> {
    let mut file = fs::File::open(path).ok()?;
    let mut head = [0_u8; 12];
    file.read_exact(&mut head).ok()?;
    if &head[..8] != MAGIC {
        return None;
    }
    let length = u32::from_be_bytes([head[8], head[9], head[10], head[11]]);
    file.seek(SeekFrom::Current(i64::from(length))).ok()?;
    let mut sect = [0_u8; 12];
    file.read_exact(&mut sect).ok()?;
    if &sect[..8] != TEX_SECT {
        return None;
    }
    let count = u32::from_be_bytes([sect[8], sect[9], sect[10], sect[11]]);
    if index >= count {
        return None;
    }
    for i in 0..count {
        let mut tex = [0_u8; 5];
        file.read_exact(&mut tex).ok()?;
        let size = u32::from_be_bytes([tex[0], tex[1], tex[2], tex[3]]);
        if i == index {
            if tex[4] != 0 || size > 16 * 1024 * 1024 {
                return None;
            }
            let mut data = vec![0_u8; size as usize];
            file.read_exact(&mut data).ok()?;
            return data.starts_with(b"\x89PNG\r\n\x1a\n").then_some(data);
        }
        file.seek(SeekFrom::Current(i64::from(size))).ok()?;
    }
    None
}

/// Folders searched for puppets: the user's first, then the bundled ones.
pub fn inochi2d_roots() -> Vec<PathBuf> {
    let paths = resolve_app_paths();
    let mut roots = vec![user_dir(&PathBuf::from(&paths.data_dir))];
    roots.extend(
        crate::modules::paths::bundle_roots()
            .into_iter()
            .map(|root| root.join("assets").join("inochi2d")),
    );
    roots
}

fn user_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("inochi2d")
}

fn is_puppet_file(path: &Path) -> bool {
    path.is_file()
        && path
            .extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| e.eq_ignore_ascii_case("inp") || e.eq_ignore_ascii_case("inx"))
}

/// Puppet files in a folder and its direct subfolders.
fn puppet_files(dir: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let Ok(entries) = fs::read_dir(dir) else {
        return out;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if is_puppet_file(&path) {
            out.push(path);
        } else if path.is_dir()
            && let Ok(inner) = fs::read_dir(&path)
        {
            out.extend(
                inner
                    .flatten()
                    .map(|e| e.path())
                    .filter(|p| is_puppet_file(p)),
            );
        }
    }
    out
}

/// "nagatoro-fullbody_v3" → "Nagatoro Fullbody V3".
fn human_name(stem: &str) -> String {
    stem.replace(['_', '-'], " ")
        .split_whitespace()
        .map(|w| {
            let mut c = w.chars();
            c.next()
                .map(|f| f.to_uppercase().collect::<String>() + c.as_str())
                .unwrap_or_default()
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// The puppet's own preview picture as a file next to the other avatar pictures (written once).
fn own_preview(data_dir: &Path, key: &str, path: &Path, info: &PuppetInfo) -> Option<String> {
    use sha2::{Digest, Sha256};
    let index = info.thumbnail_id?;
    let hash = Sha256::digest(key.as_bytes());
    let short: String = hash.iter().take(10).map(|b| format!("{b:02x}")).collect();
    let file = data_dir
        .join("avatar_thumbs")
        .join(format!("inochi2d-own-{short}.png"));
    if !file.is_file() {
        let png = embedded_png(path, index)?;
        fs::create_dir_all(file.parent()?).ok()?;
        fs::write(&file, png).ok()?;
    }
    Some(file.to_string_lossy().into_owned())
}

fn describe(path: &Path, roots: &[PathBuf], data_dir: &Path) -> Option<ScannedInochi2d> {
    use crate::modules::avatar_library::{AvatarKind, custom_name, key_for, removable, thumbnail};
    let info = puppet_info(path)?;
    let path = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let key = key_for(&path, roots);
    let id = path.file_name()?.to_string_lossy().into_owned();
    let stem = path.file_stem()?.to_string_lossy().into_owned();
    let size_mb = fs::metadata(&path)
        .map(|m| m.len() as f64 / 1_048_576.0)
        .unwrap_or(0.0);
    let name = custom_name(data_dir, AvatarKind::Inochi2d, &key)
        .or_else(|| info.name.clone())
        .unwrap_or_else(|| human_name(&stem));
    Some(ScannedInochi2d {
        id,
        name,
        preview_image: own_preview(data_dir, &key, &path, &info),
        size_mb: (size_mb * 10.0).round() / 10.0,
        artist: info.artist.clone(),
        rigger: info.rigger.clone(),
        license_url: info.license_url.clone(),
        removable: removable(data_dir, AvatarKind::Inochi2d, &path),
        thumbnail: thumbnail(data_dir, AvatarKind::Inochi2d, &key),
        model_path: path.to_string_lossy().into_owned(),
    })
}

/// All puppets the app can show; a file name found twice counts once (the user's copy first).
pub fn scan_inochi2d_models() -> Vec<ScannedInochi2d> {
    let data_dir = PathBuf::from(resolve_app_paths().data_dir);
    let roots = inochi2d_roots();
    let mut seen = std::collections::HashSet::new();
    let mut found = Vec::new();
    for root in &roots {
        for path in puppet_files(root) {
            if let Some(model) = describe(&path, &roots, &data_dir)
                && seen.insert(model.model_path.clone())
            {
                found.push(model);
            }
        }
    }
    found.sort_by_key(|m| m.name.to_lowercase());
    found
}

/// The puppets of the registry (adult ones only while adult content is on), marked when they are
/// already there; descriptions in `lang`.
pub fn catalog(lang: &str) -> Vec<Inochi2dCatalogItem> {
    let data_dir = PathBuf::from(resolve_app_paths().data_dir);
    let installed = user_dir(&data_dir);
    // Puppets shipped with the app (Aka) count as there, too.
    let shipped: Vec<PathBuf> = inochi2d_roots().into_iter().skip(1).collect();
    let adult = crate::modules::nsfw::allowed();
    registry(&data_dir)
        .puppets
        .into_iter()
        .filter(|p| adult || !p.nsfw)
        .map(|p| Inochi2dCatalogItem {
            description: describe_in(&p, lang),
            size_mb: (p.size_bytes as f64 / 1_048_576.0 * 10.0).round() / 10.0,
            is_installed: installed.join(&p.id).is_file()
                || shipped.iter().any(|root| root.join(&p.id).is_file()),
            id: p.id,
            name: p.name,
            author: p.author,
            license: p.license,
            url: p.url,
            sha256: p.sha256,
        })
        .collect()
}

/// A free file name in `dir` for `name` ("Aka.inx", "Aka (2).inx", …), or the existing file if it
/// holds the same bytes.
fn target_for(dir: &Path, name: &str, bytes: &[u8]) -> PathBuf {
    let path = Path::new(name);
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("puppet");
    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("inp");
    let mut candidate = dir.join(name);
    let mut n = 2;
    while candidate.exists() {
        if fs::read(&candidate).is_ok_and(|existing| existing == bytes) {
            return candidate;
        }
        candidate = dir.join(format!("{stem} ({n}).{ext}"));
        n += 1;
    }
    candidate
}

fn store(dir: &Path, name: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    if bytes.len() < 12 || &bytes[..8] != MAGIC {
        return Err(crate::err!("backend.inochi2d.notPuppet"));
    }
    fs::create_dir_all(dir).map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    let target = target_for(dir, name, bytes);
    if !target.exists() {
        fs::write(&target, bytes)
            .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    }
    Ok(target)
}

/// Copies a puppet (`.inp`/`.inx`, or a ZIP holding one) into the user's folder.
pub fn import_inochi2d_model(source_path: &str) -> Result<ScannedInochi2d, String> {
    let src = PathBuf::from(source_path);
    if !src.is_file() {
        return Err(crate::err!(
            "backend.common.pathMissing",
            path = source_path
        ));
    }
    let data_dir = PathBuf::from(resolve_app_paths().data_dir);
    let dir = user_dir(&data_dir);
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let target = match ext.as_str() {
        "inp" | "inx" => {
            let bytes = fs::read(&src).map_err(|e| {
                crate::err!(
                    "backend.common.fileReadPath",
                    path = src.display(),
                    error = e
                )
            })?;
            let name = src
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            store(&dir, &name, &bytes)?
        }
        "zip" => {
            let file = fs::File::open(&src)
                .map_err(|e| crate::err!("backend.common.zipOpen", error = e))?;
            let mut archive = zip::ZipArchive::new(file)
                .map_err(|e| crate::err!("backend.common.zipInvalid", error = e))?;
            let mut found = None;
            for i in 0..archive.len() {
                let mut entry = archive
                    .by_index(i)
                    .map_err(|e| crate::err!("backend.common.unzip", error = e))?;
                let Some(name) = entry.enclosed_name() else {
                    continue;
                };
                if !is_puppet_name(&name) {
                    continue;
                }
                let file_name = name
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default();
                let mut bytes = Vec::new();
                entry
                    .read_to_end(&mut bytes)
                    .map_err(|e| crate::err!("backend.common.unzip", error = e))?;
                found = Some(store(&dir, &file_name, &bytes)?);
                break;
            }
            found.ok_or_else(|| crate::err!("backend.inochi2d.noPuppetInZip"))?
        }
        _ => return Err(crate::err!("backend.inochi2d.unsupportedFormat")),
    };
    let model = describe(&target, &inochi2d_roots(), &data_dir);
    if model.is_none() {
        // Not readable after all: do not leave a broken file behind.
        let _ = fs::remove_file(&target);
    }
    model.ok_or_else(|| crate::err!("backend.inochi2d.notPuppet"))
}

fn is_puppet_name(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("inp") || e.eq_ignore_ascii_case("inx"))
}

/// Downloads an example puppet from its source into the user's folder (SHA-256 checked).
pub async fn download_inochi2d_model(model_id: &str) -> Result<ScannedInochi2d, String> {
    use futures_util::StreamExt;
    use sha2::{Digest, Sha256};
    use std::io::Write;

    let data_dir = PathBuf::from(resolve_app_paths().data_dir);
    let adult = crate::modules::nsfw::allowed();
    let entry = registry(&data_dir)
        .puppets
        .into_iter()
        .find(|p| p.id == model_id && (adult || !p.nsfw))
        .ok_or_else(|| crate::err!("backend.inochi2d.unknownModel", name = model_id))?;
    let dir = user_dir(&data_dir);
    fs::create_dir_all(&dir).map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    let target = dir.join(&entry.id);
    if !target.is_file() {
        info!(
            "Lade Inochi2D-Modell herunter: {} von {}",
            entry.name, entry.url
        );
        let client = reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(30))
            .timeout(std::time::Duration::from_secs(600))
            .build()
            .map_err(|e| crate::err!("backend.common.httpClient", error = e))?;
        let resp = client
            .get(&entry.url)
            .send()
            .await
            .map_err(|e| crate::err!("backend.common.downloadFailed", error = e))?;
        if !resp.status().is_success() {
            return Err(crate::err!(
                "backend.common.downloadStatus",
                status = resp.status()
            ));
        }
        let partial = dir.join(format!("{}.part", entry.id));
        let mut out = fs::File::create(&partial)
            .map_err(|e| crate::err!("backend.common.fileCreate", error = e))?;
        let mut hasher = Sha256::new();
        let mut stream = resp.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| crate::err!("backend.common.downloadRead", error = e))?;
            hasher.update(&chunk);
            out.write_all(&chunk)
                .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
        }
        drop(out);
        let digest: String = hasher
            .finalize()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        if digest != entry.sha256 {
            let _ = fs::remove_file(&partial);
            return Err(crate::err!("backend.inochi2d.checksum", name = entry.name));
        }
        fs::rename(&partial, &target)
            .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    }
    describe(&target, &inochi2d_roots(), &data_dir)
        .ok_or_else(|| crate::err!("backend.inochi2d.notPuppet"))
}

/// One controlled value of a puppet set by hand: a parameter axis, optionally reversed.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Inochi2dChannel {
    pub param: String,
    /// 0 = x, 1 = y (2D parameters).
    #[serde(default)]
    pub axis: u8,
    /// The parameter means the opposite (e.g. "eye open" for blinking).
    #[serde(default)]
    pub inverted: bool,
}

/// Hand-made settings of a puppet: channels (`mouthOpen`, `blinkLeft`, …), which of its own
/// animations shows an emotion and which one the desktop pet plays for walking and sitting.
/// Missing entries are found automatically; `null` / `""` means "none".
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Inochi2dMapping {
    #[serde(default)]
    pub channels: std::collections::BTreeMap<String, Option<Inochi2dChannel>>,
    #[serde(default)]
    pub emotions: std::collections::BTreeMap<String, String>,
    /// `walk` / `sit` → own animation for that state of the desktop pet.
    #[serde(default)]
    pub loops: std::collections::BTreeMap<String, String>,
}

const MAPPINGS_FILE: &str = "inochi2d_mappings.json";
/// Keys a mapping may hold; anything else is dropped when saving.
pub const CHANNEL_KEYS: [&str; 15] = [
    "headYaw",
    "headPitch",
    "headRoll",
    "bodyYaw",
    "bodyPitch",
    "bodyRoll",
    "eyeX",
    "eyeY",
    "blinkLeft",
    "blinkRight",
    "mouthOpen",
    "smile",
    "breath",
    "cheek",
    "brows",
];

fn mappings_path(data_dir: &Path) -> PathBuf {
    data_dir.join(MAPPINGS_FILE)
}

fn load_mappings(data_dir: &Path) -> std::collections::BTreeMap<String, Inochi2dMapping> {
    fs::read_to_string(mappings_path(data_dir))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

/// The hand-made settings of the puppet at `path` (empty when there are none).
pub fn mapping_for(data_dir: &Path, key: &str) -> Inochi2dMapping {
    load_mappings(data_dir).remove(key).unwrap_or_default()
}

/// Stores the settings of a puppet; an empty mapping removes the entry.
pub fn set_mapping(data_dir: &Path, key: &str, mut mapping: Inochi2dMapping) -> Result<(), String> {
    mapping.channels.retain(|k, v| {
        CHANNEL_KEYS.contains(&k.as_str())
            && v.as_ref()
                .is_none_or(|c| !c.param.trim().is_empty() && c.axis <= 1)
    });
    mapping
        .emotions
        .retain(|k, v| k.len() <= 40 && v.chars().count() <= 200);
    mapping
        .loops
        .retain(|k, v| matches!(k.as_str(), "walk" | "sit") && v.chars().count() <= 200);
    let mut all = load_mappings(data_dir);
    if mapping == Inochi2dMapping::default() {
        all.remove(key);
    } else {
        all.insert(key.to_string(), mapping);
    }
    let json = serde_json::to_string_pretty(&all)
        .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    fs::create_dir_all(data_dir).map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    fs::write(mappings_path(data_dir), json)
        .map_err(|e| crate::err!("backend.common.fileWrite", error = e))
}

/// Key of a puppet in the settings files (its path below the puppet folders).
pub fn puppet_key(path: &Path) -> String {
    crate::modules::avatar_library::key_for(path, &inochi2d_roots())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("otakusoul-inochi2d-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// A minimal puppet: header, JSON and `textures` (encoding, bytes).
    fn puppet(json: &str, textures: &[(u8, &[u8])]) -> Vec<u8> {
        let mut out = MAGIC.to_vec();
        out.extend((json.len() as u32).to_be_bytes());
        out.extend(json.as_bytes());
        out.extend(TEX_SECT);
        out.extend((textures.len() as u32).to_be_bytes());
        for (encoding, data) in textures {
            out.extend((data.len() as u32).to_be_bytes());
            out.push(*encoding);
            out.extend(*data);
        }
        out
    }

    #[test]
    fn reads_the_header_and_cleans_names() {
        let dir = temp("info");
        let file = dir.join("aka.inp");
        fs::write(
            &file,
            puppet(
                r#"{"meta":{"name":"Aka\u0000\u0000","artist":"seagetch","licenseURL":"https://cc","thumbnailId":4294967295},"nodes":{}}"#,
                &[],
            ),
        )
        .unwrap();
        let info = puppet_info(&file).unwrap();
        assert_eq!(info.name.as_deref(), Some("Aka"));
        assert_eq!(info.artist.as_deref(), Some("seagetch"));
        assert_eq!(info.license_url.as_deref(), Some("https://cc"));
        assert_eq!(info.thumbnail_id, None, "u32::MAX means no preview");

        fs::write(dir.join("broken.inp"), b"PK\x03\x04 not a puppet").unwrap();
        assert!(puppet_info(&dir.join("broken.inp")).is_none());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn finds_the_embedded_png_preview() {
        let dir = temp("thumb");
        let png = b"\x89PNG\r\n\x1a\nrest";
        let file = dir.join("p.inx");
        fs::write(
            &file,
            puppet(
                r#"{"meta":{"thumbnailId":1},"nodes":{}}"#,
                &[(1, b"tga!"), (0, png)],
            ),
        )
        .unwrap();
        assert_eq!(embedded_png(&file, 1).as_deref(), Some(png.as_slice()));
        assert_eq!(embedded_png(&file, 0), None, "TGA is no preview picture");
        assert_eq!(embedded_png(&file, 5), None);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn stores_copies_under_free_names() {
        let dir = temp("store");
        let a = puppet(r#"{"nodes":{}}"#, &[]);
        let mut b = a.clone();
        b.push(1);
        let first = store(&dir, "Aka.inx", &a).unwrap();
        assert_eq!(
            store(&dir, "Aka.inx", &a).unwrap(),
            first,
            "the same file is reused"
        );
        let second = store(&dir, "Aka.inx", &b).unwrap();
        assert_eq!(second.file_name().unwrap(), "Aka (2).inx");
        assert!(store(&dir, "x.inp", b"not a puppet").is_err());
        assert_eq!(puppet_files(&dir).len(), 2);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn mappings_are_kept_per_puppet_and_cleaned() {
        let dir = temp("mapping");
        let mut mapping = Inochi2dMapping::default();
        mapping.channels.insert(
            "mouthOpen".into(),
            Some(Inochi2dChannel {
                param: "Mouth::Open".into(),
                axis: 0,
                inverted: false,
            }),
        );
        mapping.channels.insert("blinkLeft".into(), None);
        mapping.channels.insert("unknown".into(), None);
        mapping.emotions.insert("joy".into(), "Laugh".into());
        mapping.loops.insert("sit".into(), "Pose_Sitz".into());
        mapping.loops.insert("jump".into(), "Hop".into());
        set_mapping(&dir, "nagatoro.inp", mapping).unwrap();
        let read = mapping_for(&dir, "nagatoro.inp");
        assert_eq!(read.channels.len(), 2, "unknown channel dropped");
        assert_eq!(read.channels["blinkLeft"], None, "explicit none kept");
        assert_eq!(read.emotions["joy"], "Laugh");
        assert_eq!(read.loops["sit"], "Pose_Sitz");
        assert!(!read.loops.contains_key("jump"));
        assert_eq!(mapping_for(&dir, "other.inp"), Inochi2dMapping::default());
        set_mapping(&dir, "nagatoro.inp", Inochi2dMapping::default()).unwrap();
        assert_eq!(
            mapping_for(&dir, "nagatoro.inp"),
            Inochi2dMapping::default()
        );
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn human_names() {
        assert_eq!(human_name("nagatoro-fullbody_v3"), "Nagatoro Fullbody V3");
    }

    #[test]
    fn shipped_registry_is_valid() {
        let registry = parse_registry(BUNDLED_REGISTRY).unwrap();
        assert!(registry.puppets.iter().any(|p| p.id == "Aka.inx"));
        assert_eq!(
            describe_in(&registry.puppets[0], "ja"),
            registry.puppets[0].description["ja"]
        );
        assert_eq!(
            describe_in(&registry.puppets[0], "pl"),
            registry.puppets[0].description["en"]
        );
    }

    /// The bundled Aka is the unmodified file of the registry (CC BY 4.0) and names its author.
    #[test]
    fn shipped_puppet_matches_the_registry() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../assets/inochi2d/Aka.inx");
        let entry = parse_registry(BUNDLED_REGISTRY)
            .unwrap()
            .puppets
            .into_iter()
            .find(|p| p.id == "Aka.inx")
            .unwrap();
        assert_eq!(
            crate::modules::hub_installed::file_sha256(&path).as_deref(),
            Some(entry.sha256.as_str())
        );
        let info = puppet_info(&path).unwrap();
        assert_eq!(info.artist.as_deref(), Some("seagetch"));
        assert!(
            fs::read_to_string(path.with_file_name("lizenzen.txt"))
                .unwrap()
                .contains("CC BY 4.0")
        );
    }

    #[test]
    fn registry_entries_are_checked_and_newer_downloads_win() {
        let entry = |id: &str, url: &str, sha: &str| serde_json::json!({ "id": id, "name": "X", "url": url, "sha256": sha, "size_bytes": 10 });
        let sha = "a".repeat(64);
        let text = serde_json::json!({ "version": 99, "puppets": [
            entry("Good.inp", "https://example.org/Good.inp", &sha),
            entry("../evil.inp", "https://example.org/e.inp", &sha),
            entry("Plain.inp", "http://example.org/p.inp", &sha),
            entry("Short.inp", "https://example.org/s.inp", "abc"),
            entry("Picture.png", "https://example.org/p.png", &sha),
        ]})
        .to_string();
        let parsed = parse_registry(&text).unwrap();
        assert_eq!(
            parsed
                .puppets
                .iter()
                .map(|p| p.id.as_str())
                .collect::<Vec<_>>(),
            ["Good.inp"]
        );

        let dir = temp("registry");
        fs::write(dir.join(REGISTRY_FILE), &text).unwrap();
        assert_eq!(registry(&dir).version, 99, "newer download wins");
        let older = serde_json::json!({ "version": 0, "puppets": [entry("Old.inp", "https://e.org/o.inp", &sha)] });
        fs::write(dir.join(REGISTRY_FILE), older.to_string()).unwrap();
        assert!(
            registry(&dir).puppets.iter().any(|p| p.id == "Aka.inx"),
            "older download loses"
        );
        fs::write(dir.join(REGISTRY_FILE), "kaputt").unwrap();
        assert!(
            registry(&dir).puppets.iter().any(|p| p.id == "Aka.inx"),
            "broken download ignored"
        );
        let _ = fs::remove_dir_all(dir);
    }
}
