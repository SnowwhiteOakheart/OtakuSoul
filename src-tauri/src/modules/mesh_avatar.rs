//! Mesh avatars from Mesh Avatar Studio (<https://github.com/shinshin86/mesh-avatar-studio>): a
//! single illustration cut into layers with a rig, animated as a 2D mesh. The app keeps them as
//! `.mavatar` archives (a ZIP with stored entries: `avatar.json`, `rig.json`, `built/…`) in
//! `<data>/mesh_avatars/`; the frontend renders them with the `mesh-avatar` runtime from the
//! archive's bytes. A Studio project folder is packed into such an archive on import.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use ts_rs::TS;

use crate::modules::paths::resolve_app_paths;

/// Archive limits of the format (`docs/format.md` of Mesh Avatar Studio).
const MAX_ENTRIES: usize = 200;
const MAX_ENTRY_BYTES: u64 = 64 * 1024 * 1024;
/// Files a player needs; everything else in `built/` is listed in its metadata.
const REQUIRED: [&str; 4] = [
    "rig.json",
    "built/layers.json",
    "built/base.png",
    "built/hairmask.png",
];
const EXTENSION: &str = "mavatar";

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ScannedMeshAvatar {
    /// File name (unique in the folder), what character cards store.
    pub id: String,
    pub name: String,
    pub model_path: String,
    /// The avatar's own picture (its thumbnail or source illustration), extracted once.
    pub preview_image: Option<String>,
    pub size_mb: f64,
    pub author: Option<String>,
    pub license: Option<String>,
    /// Imported by the user (in `<data>/mesh_avatars`): can be removed.
    #[serde(default)]
    pub removable: bool,
    /// Preview picture taken in the avatar manager.
    #[serde(default)]
    pub thumbnail: Option<String>,
}

/// The fields of `avatar.json` the app reads (unknown ones are ignored, as the format asks).
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
struct Manifest {
    #[serde(default)]
    format: String,
    #[serde(default)]
    version: u32,
    #[serde(default)]
    name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    author: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    license: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    thumbnail: Option<String>,
}

impl Manifest {
    fn valid(&self) -> bool {
        self.format == "mesh-avatar" && self.version == 1 && !self.name.trim().is_empty()
    }
}

/// Folders searched for mesh avatars (only the user's; none are shipped).
pub fn mesh_avatar_roots() -> Vec<PathBuf> {
    vec![user_dir(&PathBuf::from(resolve_app_paths().data_dir))]
}

fn user_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("mesh_avatars")
}

fn has_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case(EXTENSION))
}

/// Archives in a folder and its direct subfolders.
fn avatar_files(dir: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let Ok(entries) = fs::read_dir(dir) else {
        return out;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && has_extension(&path) {
            out.push(path);
        } else if path.is_dir()
            && let Ok(inner) = fs::read_dir(&path)
        {
            out.extend(
                inner
                    .flatten()
                    .map(|e| e.path())
                    .filter(|p| p.is_file() && has_extension(p)),
            );
        }
    }
    out
}

/// An entry name allowed in an archive: relative, forward slashes, no `..`.
fn safe_entry_name(name: &str) -> bool {
    !name.is_empty()
        && !name.starts_with('/')
        && !name.contains('\\')
        && !name.contains(':')
        && name
            .split('/')
            .all(|part| !part.is_empty() && part != "." && part != "..")
}

/// A plain file name in the archive root (`source.png`, `thumbnail.png`).
fn root_file_name(name: &str) -> bool {
    safe_entry_name(name) && !name.contains('/')
}

/// Checks an archive's layout and returns its manifest.
fn check_archive<R: Read + std::io::Seek>(
    archive: &mut zip::ZipArchive<R>,
) -> Result<Manifest, String> {
    let not_avatar = || crate::err!("backend.meshAvatar.notAvatar");
    if archive.len() > MAX_ENTRIES {
        return Err(crate::err!("backend.meshAvatar.tooLarge"));
    }
    let mut names = std::collections::HashSet::new();
    for i in 0..archive.len() {
        let entry = archive.by_index(i).map_err(|_| not_avatar())?;
        let name = entry.name().map_err(|_| not_avatar())?.to_string();
        if !safe_entry_name(name.trim_end_matches('/')) {
            return Err(not_avatar());
        }
        if entry.size() > MAX_ENTRY_BYTES {
            return Err(crate::err!("backend.meshAvatar.tooLarge"));
        }
        if !entry.is_dir() {
            names.insert(name);
        }
    }
    if REQUIRED.iter().any(|required| !names.contains(*required)) {
        return Err(not_avatar());
    }
    let manifest = read_manifest(archive).ok_or_else(not_avatar)?;
    if !manifest.valid() {
        return Err(not_avatar());
    }
    Ok(manifest)
}

fn read_entry<R: Read + std::io::Seek>(
    archive: &mut zip::ZipArchive<R>,
    name: &str,
) -> Option<Vec<u8>> {
    let mut entry = archive.by_name(name).ok()?;
    if entry.size() > MAX_ENTRY_BYTES {
        return None;
    }
    let mut bytes = Vec::new();
    entry.read_to_end(&mut bytes).ok()?;
    Some(bytes)
}

fn read_manifest<R: Read + std::io::Seek>(archive: &mut zip::ZipArchive<R>) -> Option<Manifest> {
    serde_json::from_slice(&read_entry(archive, "avatar.json")?).ok()
}

/// The avatar's own picture as a file next to the other avatar pictures (written once).
fn own_preview<R: Read + std::io::Seek>(
    archive: &mut zip::ZipArchive<R>,
    manifest: &Manifest,
    data_dir: &Path,
    key: &str,
) -> Option<String> {
    use sha2::{Digest, Sha256};
    let hash = Sha256::digest(key.as_bytes());
    let short: String = hash.iter().take(10).map(|b| format!("{b:02x}")).collect();
    let file = data_dir
        .join("avatar_thumbs")
        .join(format!("mesh-own-{short}.png"));
    if !file.is_file() {
        let candidates = [
            manifest.thumbnail.as_deref(),
            manifest.source.as_deref(),
            Some("built/base.png"),
        ];
        let png = candidates
            .into_iter()
            .flatten()
            .filter(|name| safe_entry_name(name))
            .find_map(|name| read_entry(archive, name))
            .filter(|bytes| bytes.starts_with(b"\x89PNG\r\n\x1a\n"))?;
        fs::create_dir_all(file.parent()?).ok()?;
        fs::write(&file, png).ok()?;
    }
    Some(file.to_string_lossy().into_owned())
}

fn describe(path: &Path, roots: &[PathBuf], data_dir: &Path) -> Option<ScannedMeshAvatar> {
    use crate::modules::avatar_library::{AvatarKind, custom_name, key_for, removable, thumbnail};
    let mut archive = zip::ZipArchive::new(fs::File::open(path).ok()?).ok()?;
    let manifest = check_archive(&mut archive).ok()?;
    let key = key_for(path, roots);
    let size_mb = fs::metadata(path)
        .map(|m| m.len() as f64 / 1_048_576.0)
        .unwrap_or(0.0);
    Some(ScannedMeshAvatar {
        id: path.file_name()?.to_string_lossy().into_owned(),
        name: custom_name(data_dir, AvatarKind::Mesh, &key)
            .unwrap_or_else(|| manifest.name.trim().to_string()),
        preview_image: own_preview(&mut archive, &manifest, data_dir, &key),
        size_mb: (size_mb * 10.0).round() / 10.0,
        author: manifest.author.clone().filter(|a| !a.trim().is_empty()),
        license: manifest.license.clone().filter(|l| !l.trim().is_empty()),
        removable: removable(data_dir, AvatarKind::Mesh, path),
        thumbnail: thumbnail(data_dir, AvatarKind::Mesh, &key),
        model_path: path.to_string_lossy().into_owned(),
    })
}

/// All mesh avatars the app can show.
pub fn scan_mesh_avatars() -> Vec<ScannedMeshAvatar> {
    let data_dir = PathBuf::from(resolve_app_paths().data_dir);
    let roots = mesh_avatar_roots();
    let mut found: Vec<ScannedMeshAvatar> = roots
        .iter()
        .flat_map(|root| avatar_files(root))
        .filter_map(|path| describe(&path, &roots, &data_dir))
        .collect();
    found.sort_by_key(|m| m.name.to_lowercase());
    found
}

/// A free file name in `dir` for `stem` ("Shiro.mavatar", "Shiro (2).mavatar", …), or the existing
/// file if it holds the same bytes.
fn target_for(dir: &Path, stem: &str, bytes: &[u8]) -> PathBuf {
    let mut candidate = dir.join(format!("{stem}.{EXTENSION}"));
    let mut n = 2;
    while candidate.exists() {
        if fs::read(&candidate).is_ok_and(|existing| existing == bytes) {
            return candidate;
        }
        candidate = dir.join(format!("{stem} ({n}).{EXTENSION}"));
        n += 1;
    }
    candidate
}

/// A file name from an avatar's name: letters, digits, spaces and `-_.` only.
fn file_stem_for(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || matches!(c, ' ' | '-' | '_' | '.') {
                c
            } else {
                ' '
            }
        })
        .collect();
    let stem = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    let stem: String = stem
        .trim_matches(|c: char| c == '.' || c.is_whitespace())
        .chars()
        .take(60)
        .collect();
    if stem.is_empty() {
        "Mesh Avatar".to_string()
    } else {
        stem
    }
}

/// Regular files below `dir` (no symlinks), as archive names under `prefix`.
fn collect_files(dir: &Path, prefix: &str, out: &mut Vec<(String, PathBuf)>) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| {
        crate::err!(
            "backend.common.fileReadPath",
            path = dir.display(),
            error = e
        )
    })?;
    for entry in entries.flatten() {
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        let name = entry.file_name().to_string_lossy().into_owned();
        let archive_name = format!("{prefix}/{name}");
        if !safe_entry_name(&archive_name) {
            continue;
        }
        if kind.is_dir() {
            collect_files(&entry.path(), &archive_name, out)?;
        } else if kind.is_file() {
            out.push((archive_name, entry.path()));
        }
        if out.len() > MAX_ENTRIES {
            return Err(crate::err!("backend.meshAvatar.tooLarge"));
        }
    }
    Ok(())
}

/// Packs a Studio project folder into `.mavatar` bytes: manifest (made from the folder name if
/// missing), rig, built layers and the named thumbnail/source picture. Drafts, reviews and work
/// files stay out.
fn pack_folder(folder: &Path) -> Result<(Manifest, Vec<u8>), String> {
    let not_avatar = || crate::err!("backend.meshAvatar.notAvatar");
    if !folder.join("rig.json").is_file() || !folder.join("built").is_dir() {
        return Err(not_avatar());
    }
    let folder_name = folder
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Mesh Avatar".to_string());
    let (manifest, manifest_bytes) = match fs::read(folder.join("avatar.json")) {
        Ok(bytes) => {
            let manifest: Manifest = serde_json::from_slice(&bytes).map_err(|_| not_avatar())?;
            (manifest, bytes)
        }
        Err(_) => {
            let manifest = Manifest {
                format: "mesh-avatar".into(),
                version: 1,
                name: folder_name,
                ..Manifest::default()
            };
            let bytes = serde_json::to_vec_pretty(&manifest).map_err(|_| not_avatar())?;
            (manifest, bytes)
        }
    };
    if !manifest.valid() {
        return Err(not_avatar());
    }
    let mut files = vec![("rig.json".to_string(), folder.join("rig.json"))];
    for extra in [manifest.thumbnail.as_deref(), manifest.source.as_deref()]
        .into_iter()
        .flatten()
    {
        if root_file_name(extra)
            && folder.join(extra).is_file()
            && !files.iter().any(|(n, _)| n == extra)
        {
            files.push((extra.to_string(), folder.join(extra)));
        }
    }
    collect_files(&folder.join("built"), "built", &mut files)?;
    if files.len() + 1 > MAX_ENTRIES {
        return Err(crate::err!("backend.meshAvatar.tooLarge"));
    }

    let mut writer = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    // The format asks for stored entries (the PNGs are compressed already).
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Stored)
        .large_file(false);
    let write_err = |e: &dyn std::fmt::Display| crate::err!("backend.common.fileWrite", error = e);
    writer
        .start_file("avatar.json", options)
        .map_err(|e| write_err(&e))?;
    writer
        .write_all(&manifest_bytes)
        .map_err(|e| write_err(&e))?;
    for (name, path) in &files {
        let len = fs::metadata(path).map(|m| m.len()).unwrap_or(0);
        if len > MAX_ENTRY_BYTES {
            return Err(crate::err!("backend.meshAvatar.tooLarge"));
        }
        let bytes = fs::read(path).map_err(|e| {
            crate::err!(
                "backend.common.fileReadPath",
                path = path.display(),
                error = e
            )
        })?;
        writer
            .start_file(name.as_str(), options)
            .map_err(|e| write_err(&e))?;
        writer.write_all(&bytes).map_err(|e| write_err(&e))?;
    }
    let bytes = writer.finish().map_err(|e| write_err(&e))?.into_inner();
    Ok((manifest, bytes))
}

fn store(dir: &Path, stem: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes))
        .map_err(|_| crate::err!("backend.meshAvatar.notAvatar"))?;
    check_archive(&mut archive)?;
    fs::create_dir_all(dir).map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    let target = target_for(dir, stem, bytes);
    if !target.exists() {
        fs::write(&target, bytes)
            .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    }
    Ok(target)
}

/// Imports a mesh avatar: a `.mavatar` archive, a Studio project folder, or a file inside such a
/// folder (`avatar.json`, `rig.json`); folders are packed into an archive first.
pub fn import_mesh_avatar(source_path: &str) -> Result<ScannedMeshAvatar, String> {
    let data_dir = PathBuf::from(resolve_app_paths().data_dir);
    import_into(&user_dir(&data_dir), &data_dir, Path::new(source_path))
}

fn import_into(dir: &Path, data_dir: &Path, src: &Path) -> Result<ScannedMeshAvatar, String> {
    if !src.exists() {
        return Err(crate::err!(
            "backend.common.pathMissing",
            path = src.display()
        ));
    }
    let project = if src.is_dir() {
        Some(src.to_path_buf())
    } else if src.file_name().and_then(|n| n.to_str()).is_some_and(|n| {
        n.eq_ignore_ascii_case("avatar.json") || n.eq_ignore_ascii_case("rig.json")
    }) {
        src.parent().map(Path::to_path_buf)
    } else {
        None
    };
    let target = if let Some(folder) = project {
        let (manifest, bytes) = pack_folder(&folder)?;
        store(dir, &file_stem_for(&manifest.name), &bytes)?
    } else if has_extension(src) {
        let bytes = fs::read(src).map_err(|e| {
            crate::err!(
                "backend.common.fileReadPath",
                path = src.display(),
                error = e
            )
        })?;
        let stem = src
            .file_stem()
            .map(|s| file_stem_for(&s.to_string_lossy()))
            .unwrap_or_else(|| "Mesh Avatar".into());
        store(dir, &stem, &bytes)?
    } else {
        return Err(crate::err!("backend.meshAvatar.unsupportedFormat"));
    };
    let roots = vec![dir.to_path_buf()];
    describe(&target, &roots, data_dir).ok_or_else(|| {
        let _ = fs::remove_file(&target);
        crate::err!("backend.meshAvatar.notAvatar")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("otakusoul-mesh-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\nfake";

    /// A Studio project folder with the files a player needs plus work files that stay out.
    fn project(root: &Path, manifest: Option<&str>) -> PathBuf {
        let folder = root.join("shiro-test");
        fs::create_dir_all(folder.join("built/sprites")).unwrap();
        fs::create_dir_all(folder.join("review")).unwrap();
        if let Some(manifest) = manifest {
            fs::write(folder.join("avatar.json"), manifest).unwrap();
        }
        fs::write(folder.join("rig.json"), r#"{"version":1}"#).unwrap();
        fs::write(folder.join("rig.draft.json"), "{}").unwrap();
        fs::write(folder.join("source.png"), PNG).unwrap();
        fs::write(folder.join("HANDOVER.md"), "notes").unwrap();
        fs::write(folder.join("review/pose.png"), PNG).unwrap();
        fs::write(folder.join("built/layers.json"), r#"{"layers":{}}"#).unwrap();
        fs::write(folder.join("built/base.png"), PNG).unwrap();
        fs::write(folder.join("built/hairmask.png"), PNG).unwrap();
        fs::write(folder.join("built/sprites/mouth_a.png"), PNG).unwrap();
        folder
    }

    fn entries(path: &Path) -> Vec<(String, zip::CompressionMethod)> {
        let mut archive = zip::ZipArchive::new(fs::File::open(path).unwrap()).unwrap();
        let mut out: Vec<_> = (0..archive.len())
            .map(|i| {
                let e = archive.by_index(i).unwrap();
                (e.name().unwrap().to_string(), e.compression())
            })
            .collect();
        out.sort_by(|a, b| a.0.cmp(&b.0));
        out
    }

    #[test]
    fn packs_a_project_folder_without_work_files() {
        let root = temp("pack");
        let folder = project(
            &root,
            Some(
                r#"{"format":"mesh-avatar","version":1,"name":"Shiro · Test","author":"Me","source":"source.png","lipSync":{"openness":0.5}}"#,
            ),
        );
        let store_dir = root.join("data/mesh_avatars");
        let model = import_into(&store_dir, &root.join("data"), &folder).unwrap();
        assert_eq!(model.name, "Shiro · Test");
        assert_eq!(model.id, "Shiro Test.mavatar");
        assert_eq!(model.author.as_deref(), Some("Me"));
        assert!(model.preview_image.is_some());
        let names: Vec<_> = entries(Path::new(&model.model_path));
        assert!(
            names
                .iter()
                .all(|(_, method)| *method == zip::CompressionMethod::Stored)
        );
        let names: Vec<_> = names.into_iter().map(|(n, _)| n).collect();
        assert_eq!(
            names,
            [
                "avatar.json",
                "built/base.png",
                "built/hairmask.png",
                "built/layers.json",
                "built/sprites/mouth_a.png",
                "rig.json",
                "source.png"
            ]
        );
        // The packed archive imports again as itself (same bytes, same file).
        let again =
            import_into(&store_dir, &root.join("data"), Path::new(&model.model_path)).unwrap();
        assert_eq!(fs::read_dir(&store_dir).unwrap().count(), 1);
        assert_eq!(again.model_path, model.model_path);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_folder_without_manifest_is_named_after_it() {
        let root = temp("noman");
        let folder = project(&root, None);
        let model = import_into(
            &root.join("store"),
            &root.join("data"),
            &folder.join("rig.json"),
        )
        .unwrap();
        assert_eq!(model.name, "shiro-test");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn refuses_what_is_no_mesh_avatar() {
        let root = temp("refuse");
        let folder = project(&root, Some(r#"{"format":"other","version":1,"name":"X"}"#));
        assert!(import_into(&root.join("store"), &root.join("data"), &folder).is_err());
        let folder = project(
            &root,
            Some(r#"{"format":"mesh-avatar","version":2,"name":"X"}"#),
        );
        assert!(import_into(&root.join("store"), &root.join("data"), &folder).is_err());
        let wrong = root.join("x.txt");
        fs::write(&wrong, "x").unwrap();
        assert!(import_into(&root.join("store"), &root.join("data"), &wrong).is_err());
        // An archive with a path leaving its root.
        let bad = root.join("bad.mavatar");
        let mut writer = zip::ZipWriter::new(fs::File::create(&bad).unwrap());
        let options = zip::write::SimpleFileOptions::default();
        for name in [
            "avatar.json",
            "rig.json",
            "built/layers.json",
            "built/base.png",
            "built/hairmask.png",
            "../evil.png",
        ] {
            writer.start_file(name, options).unwrap();
            writer
                .write_all(br#"{"format":"mesh-avatar","version":1,"name":"Bad"}"#)
                .unwrap();
        }
        writer.finish().unwrap();
        assert!(import_into(&root.join("store"), &root.join("data"), &bad).is_err());
        assert!(!root.join("store").join("bad.mavatar").exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn entry_names_and_file_stems() {
        assert!(safe_entry_name("built/sprites/mouth_a.png"));
        for bad in [
            "",
            "/abs.png",
            "..",
            "built/../x",
            "a\\b",
            "C:/x",
            "built//x",
        ] {
            assert!(!safe_entry_name(bad), "{bad}");
        }
        assert_eq!(
            file_stem_for("Shiro · OtakuSoul Integrationstest"),
            "Shiro OtakuSoul Integrationstest"
        );
        assert_eq!(file_stem_for("../.."), "Mesh Avatar");
    }

    /// A real Studio project and archive, only by hand:
    /// `OTAKUSOUL_MESH_PROJECT=<folder> cargo test --lib mesh_avatar -- --ignored`.
    #[test]
    #[ignore]
    fn imports_a_local_studio_project() {
        let Ok(folder) = std::env::var("OTAKUSOUL_MESH_PROJECT") else {
            return;
        };
        let root = temp("local");
        let folder = PathBuf::from(folder);
        let model = import_into(&root.join("store"), &root.join("data"), &folder).unwrap();
        println!("{model:?}");
        for entry in entries(Path::new(&model.model_path)) {
            println!("  {}", entry.0);
        }
        let archives: Vec<_> = fs::read_dir(&folder)
            .unwrap()
            .flatten()
            .map(|e| e.path())
            .filter(|p| has_extension(p))
            .collect();
        for archive in archives {
            println!(
                "{:?}",
                import_into(&root.join("store"), &root.join("data"), &archive).unwrap()
            );
        }
        let _ = fs::remove_dir_all(&root);
    }
}
