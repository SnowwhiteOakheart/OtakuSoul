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

struct CatalogEntry {
    id: &'static str,
    name: &'static str,
    description: &'static str,
    author: &'static str,
    license: &'static str,
    url: &'static str,
    sha256: &'static str,
    bytes: u64,
}

/// Official Inochi2D example models (CC BY 4.0, design and rigging by seagetch), loaded from
/// the source and checked against their SHA-256.
const CATALOG: &[CatalogEntry] = &[
    CatalogEntry {
        id: "Aka.inx",
        name: "Aka",
        description: "Fox girl, shrine maiden outfit, tail and hair physics",
        author: "seagetch",
        license: "CC BY 4.0",
        url: "https://media.githubusercontent.com/media/Inochi2D/example-models/main/Aka.inx",
        sha256: "dbf82ffb86d1c761bca883ad37ec1c47487a447f8104290b459ce60aaee81e0f",
        bytes: 17_731_911,
    },
    CatalogEntry {
        id: "Midori.inx",
        name: "Midori",
        description: "Raccoon girl, green dress, mesh-group deformation",
        author: "seagetch",
        license: "CC BY 4.0",
        url: "https://media.githubusercontent.com/media/Inochi2D/example-models/main/Midori.inx",
        sha256: "bfa33997dad3b7b94bca3a0dc61241fd5f2464ed9e3d28381bafc8ad5fcc870a",
        bytes: 20_585_829,
    },
];

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

/// The official example puppets, marked when they are already there.
pub fn catalog() -> Vec<Inochi2dCatalogItem> {
    let installed = user_dir(&PathBuf::from(resolve_app_paths().data_dir));
    CATALOG
        .iter()
        .map(|c| Inochi2dCatalogItem {
            id: c.id.to_string(),
            name: c.name.to_string(),
            description: c.description.to_string(),
            author: c.author.to_string(),
            license: c.license.to_string(),
            url: c.url.to_string(),
            sha256: c.sha256.to_string(),
            size_mb: (c.bytes as f64 / 1_048_576.0 * 10.0).round() / 10.0,
            is_installed: installed.join(c.id).is_file(),
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
            let bytes =
                fs::read(&src).map_err(|e| crate::err!("backend.common.fileRead", error = e))?;
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

    let entry = CATALOG
        .iter()
        .find(|c| c.id == model_id)
        .ok_or_else(|| crate::err!("backend.inochi2d.unknownModel", name = model_id))?;
    let data_dir = PathBuf::from(resolve_app_paths().data_dir);
    let dir = user_dir(&data_dir);
    fs::create_dir_all(&dir).map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    let target = dir.join(entry.id);
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
            .get(entry.url)
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
    fn human_names() {
        assert_eq!(human_name("nagatoro-fullbody_v3"), "Nagatoro Fullbody V3");
    }

    #[test]
    fn catalog_has_checksums() {
        assert!(
            CATALOG
                .iter()
                .all(|c| c.sha256.len() == 64 && c.url.starts_with("https://"))
        );
    }
}
