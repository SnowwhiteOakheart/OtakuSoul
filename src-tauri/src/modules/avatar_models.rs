//! 3D avatar models besides single-file VRMs: MMD models (`.pmx`/`.pmd` with their textures in
//! a folder) imported as a folder or a ZIP into `<data>/avatars/<name>/`. VRM import and the
//! combined list live in `paths.rs`.

use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};

/// Limits for copying the folder of a model: a `.pmx` lying in "Downloads" must not pull in
/// everything next to it.
const MAX_FOLDER_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_FOLDER_FILES: usize = 5000;

pub fn is_mmd_model(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("pmx") || e.eq_ignore_ascii_case("pmd"))
}

/// MMD files start with "PMX " or "Pmd".
fn has_mmd_header(path: &Path) -> bool {
    let mut magic = [0u8; 4];
    fs::File::open(path)
        .and_then(|mut f| f.read_exact(&mut magic))
        .is_ok()
        && (&magic == b"PMX " || magic.starts_with(b"Pmd"))
}

/// MMD models in the subfolders of `dir` (a few levels deep, as packs nest them).
/// glTF avatars: `.gltf` (JSON with `.bin` and textures next to it) or binary `.glb`.
pub fn is_gltf_model(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("gltf") || e.eq_ignore_ascii_case("glb"))
}

/// glTF models in the subfolders of `dir` (a `.gltf` brings its folder; loose `.glb` files right
/// in `dir` are listed as single files elsewhere), `.gltf` before `.glb` in each folder.
pub fn find_gltf_models(dir: &Path, depth: usize) -> Vec<PathBuf> {
    let mut found = Vec::new();
    let Ok(entries) = fs::read_dir(dir) else {
        return found;
    };
    let mut dirs: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .collect();
    dirs.sort();
    for sub in dirs {
        found.extend(gltf_in(&sub, depth));
    }
    found
}

fn gltf_in(dir: &Path, depth: usize) -> Vec<PathBuf> {
    let mut found = Vec::new();
    let Ok(entries) = fs::read_dir(dir) else {
        return found;
    };
    let mut entries: Vec<PathBuf> = entries.flatten().map(|e| e.path()).collect();
    entries.sort_by_key(|p| {
        let gltf = p
            .extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| e.eq_ignore_ascii_case("gltf"));
        (!gltf, p.clone())
    });
    for path in entries {
        if path.is_file() && is_gltf_model(&path) {
            found.push(path);
        } else if path.is_dir() && depth > 0 {
            found.extend(gltf_in(&path, depth - 1));
        }
    }
    found
}

/// A glTF model must have a skeleton; one without (a statue, a scan) cannot move.
fn check_gltf_rig(model: &Path) -> Result<(), String> {
    let summary = crate::modules::avatar_motions::gltf_summary(model)
        .map_err(|_| crate::err!("backend.vrm.invalid"))?;
    if summary.skins == 0 {
        return Err(crate::err!("backend.vrm.noSkeleton"));
    }
    Ok(())
}

pub fn find_mmd_models(dir: &Path, depth: usize) -> Vec<PathBuf> {
    let mut found = Vec::new();
    let Ok(entries) = fs::read_dir(dir) else {
        return found;
    };
    let mut entries: Vec<PathBuf> = entries.flatten().map(|e| e.path()).collect();
    entries.sort();
    for path in entries {
        if path.is_file() && is_mmd_model(&path) {
            found.push(path);
        } else if path.is_dir() && depth > 0 {
            found.extend(find_mmd_models(&path, depth - 1));
        }
    }
    found
}

/// Imports an MMD model: a `.zip` is unpacked, a `.pmx`/`.pmd` brings its folder (textures)
/// along. Returns the path of the model file inside the avatar folder.
/// Imports an avatar that comes with its own folder: an MMD model (`.pmx`/`.pmd`), a `.gltf` with
/// its `.bin` and textures, or a ZIP holding either (or a `.glb`). Returns the model and its format
/// (`mmd` or `gltf`).
pub fn import_folder_model(
    src: &Path,
    avatars_dir: &Path,
) -> Result<(PathBuf, &'static str), String> {
    let is_zip = src
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("zip"));
    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("MMD")
        .to_string();
    if is_zip {
        let target = free_dir(avatars_dir, &stem);
        unzip(src, &target).inspect_err(|_| {
            let _ = fs::remove_dir_all(&target);
        })?;
        if let Some(model) = find_mmd_models(&target, 4).into_iter().next() {
            return Ok((model, "mmd"));
        }
        let Some(model) = gltf_in(&target, 4).into_iter().next() else {
            let _ = fs::remove_dir_all(&target);
            return Err(crate::err!("backend.avatar.noModelInZip"));
        };
        check_gltf_rig(&model).inspect_err(|_| {
            let _ = fs::remove_dir_all(&target);
        })?;
        return Ok((model, "gltf"));
    }
    let gltf = src
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("gltf"));
    if gltf {
        check_gltf_rig(src)?;
    }
    if !gltf && (!is_mmd_model(src) || !has_mmd_header(src)) {
        return Err(crate::err!("backend.vrm.invalid"));
    }
    let folder = src
        .parent()
        .ok_or_else(|| crate::err!("backend.vrm.invalid"))?;
    let (bytes, files) = folder_size(folder);
    if bytes > MAX_FOLDER_BYTES || files > MAX_FOLDER_FILES {
        return Err(crate::err!(
            "backend.avatar.folderTooLarge",
            path = folder.display()
        ));
    }
    let name = folder
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(&stem)
        .to_string();
    let target = free_dir(avatars_dir, &name);
    copy_dir(folder, &target).inspect_err(|_| {
        let _ = fs::remove_dir_all(&target);
    })?;
    Ok((
        target.join(src.file_name().unwrap_or_default()),
        if gltf { "gltf" } else { "mmd" },
    ))
}

/// A folder name that is not taken yet ("Name", "Name (2)", …).
fn free_dir(parent: &Path, name: &str) -> PathBuf {
    let mut dir = parent.join(name);
    let mut n = 2;
    while dir.exists() {
        dir = parent.join(format!("{name} ({n})"));
        n += 1;
    }
    dir
}

fn folder_size(dir: &Path) -> (u64, usize) {
    let mut bytes = 0;
    let mut files = 0;
    let mut stack = vec![dir.to_path_buf()];
    while let Some(current) = stack.pop() {
        for entry in fs::read_dir(&current).into_iter().flatten().flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else {
                bytes += entry.metadata().map(|m| m.len()).unwrap_or(0);
                files += 1;
            }
            if files > MAX_FOLDER_FILES {
                return (bytes, files);
            }
        }
    }
    (bytes, files)
}

fn copy_dir(from: &Path, to: &Path) -> Result<(), String> {
    fs::create_dir_all(to).map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    for entry in fs::read_dir(from)
        .map_err(|e| {
            crate::err!(
                "backend.common.dirReadPath",
                path = from.display(),
                error = e
            )
        })?
        .flatten()
    {
        let path = entry.path();
        let target = to.join(entry.file_name());
        if path.is_dir() {
            copy_dir(&path, &target)?;
        } else {
            fs::copy(&path, &target)
                .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
        }
    }
    Ok(())
}

/// The name of a ZIP entry: UTF-8 if it is, otherwise Shift_JIS (Japanese MMD packs are made
/// on Windows; the PMX names its textures in Unicode, so the file names must match).
fn entry_name(raw: &[u8]) -> String {
    match std::str::from_utf8(raw) {
        Ok(name) => name.to_string(),
        Err(_) => encoding_rs::SHIFT_JIS.decode(raw).0.into_owned(),
    }
}

/// A relative path inside the target folder; `None` for absolute paths or `..`.
fn safe_relative(name: &str) -> Option<PathBuf> {
    let mut path = PathBuf::new();
    for part in name.split(['/', '\\']) {
        match Path::new(part).components().next() {
            None => {}
            Some(Component::Normal(part)) => path.push(part),
            Some(Component::CurDir) => {}
            _ => return None,
        }
    }
    (!path.as_os_str().is_empty()).then_some(path)
}

fn unzip(src: &Path, target: &Path) -> Result<(), String> {
    let file = fs::File::open(src).map_err(|e| crate::err!("backend.common.zipOpen", error = e))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| crate::err!("backend.common.zipInvalid", error = e))?;
    let mut total = 0u64;
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| crate::err!("backend.common.unzip", error = e))?;
        let Some(relative) = safe_relative(&entry_name(entry.name_raw())) else {
            continue;
        };
        total += entry.size();
        if total > MAX_FOLDER_BYTES || i > MAX_FOLDER_FILES {
            return Err(crate::err!(
                "backend.avatar.folderTooLarge",
                path = src.display()
            ));
        }
        let out = target.join(relative);
        if entry.is_dir() {
            fs::create_dir_all(&out)
                .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
            continue;
        }
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
        }
        let mut writer = fs::File::create(&out)
            .map_err(|e| crate::err!("backend.common.fileCreate", error = e))?;
        std::io::copy(&mut entry, &mut writer)
            .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    }
    Ok(())
}

/// Files of a model folder relative to the model file (forward slashes), so the viewer can
/// find textures whose spelling differs in case (models are made on Windows). Only inside
/// the app's avatar folders.
pub fn list_model_files(
    model_path: &str,
    allowed_roots: &[PathBuf],
) -> Result<Vec<String>, String> {
    let model = fs::canonicalize(model_path)
        .map_err(|_| crate::err!("backend.common.pathMissing", path = model_path))?;
    let inside = allowed_roots
        .iter()
        .filter_map(|root| fs::canonicalize(root).ok())
        .any(|root| model.starts_with(root));
    let dir = model
        .parent()
        .filter(|_| inside)
        .ok_or_else(|| crate::err!("backend.vrm.invalid"))?;
    let mut files = Vec::new();
    let mut stack = vec![dir.to_path_buf()];
    while let Some(current) = stack.pop() {
        for entry in fs::read_dir(&current).into_iter().flatten().flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if let Ok(relative) = path.strip_prefix(dir) {
                files.push(relative.to_string_lossy().replace('\\', "/"));
            }
            if files.len() >= MAX_FOLDER_FILES {
                return Ok(files);
            }
        }
    }
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("otakusoul-mmd-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn decodes_shift_jis_names_and_rejects_escapes() {
        // "テクスチャ/顔.png" in Shift_JIS.
        let (raw, _, _) = encoding_rs::SHIFT_JIS.encode("テクスチャ/顔.png");
        assert_eq!(entry_name(&raw), "テクスチャ/顔.png");
        assert_eq!(entry_name("tex/a.png".as_bytes()), "tex/a.png");
        assert_eq!(
            safe_relative("tex\\a.png"),
            Some(PathBuf::from("tex").join("a.png"))
        );
        assert_eq!(safe_relative("../evil.png"), None);
        // A leading slash only loses its root; the path stays inside the target folder.
        assert_eq!(
            safe_relative("/etc/passwd"),
            Some(PathBuf::from("etc").join("passwd"))
        );
        assert_eq!(safe_relative("C:/x/../../y"), None);
    }

    #[test]
    fn imports_zip_and_folder() {
        let tmp = temp("import");
        let avatars = tmp.join("avatars");

        // A ZIP with a Japanese folder name, as MMD packs come.
        let zip_path = tmp.join("Miku.zip");
        let mut writer = zip::ZipWriter::new(fs::File::create(&zip_path).unwrap());
        let options = zip::write::SimpleFileOptions::default();
        writer.start_file("ミク/ミク.pmx", options).unwrap();
        writer.write_all(b"PMX \0\0\0\0").unwrap();
        writer.start_file("ミク/tex/Face.png", options).unwrap();
        writer.write_all(b"png").unwrap();
        writer.finish().unwrap();
        let (model, _) = import_folder_model(&zip_path, &avatars).unwrap();
        assert!(model.ends_with("Miku/ミク/ミク.pmx"), "{model:?}");
        let files =
            list_model_files(model.to_str().unwrap(), std::slice::from_ref(&avatars)).unwrap();
        assert!(files.contains(&"tex/Face.png".to_string()), "{files:?}");
        assert!(list_model_files(model.to_str().unwrap(), &[tmp.join("other")]).is_err());

        // A loose .pmx brings its folder; a fake one is refused.
        let folder = tmp.join("Model A");
        fs::create_dir_all(folder.join("tex")).unwrap();
        fs::write(folder.join("a.pmx"), b"PMX \0\0\0\0").unwrap();
        fs::write(folder.join("tex").join("b.png"), b"png").unwrap();
        let (copied, _) = import_folder_model(&folder.join("a.pmx"), &avatars).unwrap();
        assert!(copied.ends_with("Model A/a.pmx"));
        assert!(avatars.join("Model A").join("tex").join("b.png").exists());
        fs::write(folder.join("fake.pmx"), b"nope").unwrap();
        assert!(import_folder_model(&folder.join("fake.pmx"), &avatars).is_err());

        assert_eq!(find_mmd_models(&avatars, 4).len(), 2);
        let _ = fs::remove_dir_all(&tmp);
    }

    /// A minimal rigged (or unrigged) glTF JSON document.
    fn gltf_json(rigged: bool) -> String {
        let skins = if rigged {
            r#","skins":[{"joints":[0]}]"#
        } else {
            ""
        };
        format!(
            r#"{{"asset":{{"version":"2.0"}},"buffers":[{{"uri":"Body.bin","byteLength":4}}],"images":[{{"uri":"tex/Skin.png"}}]{skins}}}"#
        )
    }

    #[test]
    fn imports_gltf_with_its_folder_and_from_zip() {
        let tmp = temp("gltf");
        let avatars = tmp.join("avatars");
        let folder = tmp.join("Figur");
        fs::create_dir_all(folder.join("tex")).unwrap();
        fs::write(folder.join("Figur.gltf"), gltf_json(true)).unwrap();
        fs::write(folder.join("Body.bin"), b"\0\0\0\0").unwrap();
        fs::write(folder.join("tex").join("Skin.png"), b"png").unwrap();
        let (model, format) = import_folder_model(&folder.join("Figur.gltf"), &avatars).unwrap();
        assert_eq!(format, "gltf");
        assert!(model.ends_with("Figur/Figur.gltf"));
        assert!(avatars.join("Figur").join("Body.bin").exists());
        assert!(avatars.join("Figur").join("tex").join("Skin.png").exists());

        // Without a skeleton nothing is copied.
        let statue = tmp.join("Statue");
        fs::create_dir_all(&statue).unwrap();
        fs::write(statue.join("Statue.gltf"), gltf_json(false)).unwrap();
        let refused = import_folder_model(&statue.join("Statue.gltf"), &avatars).unwrap_err();
        assert!(refused.contains("backend.vrm.noSkeleton"), "{refused}");
        assert!(!avatars.join("Statue").exists());

        // A ZIP with a .gltf (and a .glb next to it: the .gltf wins).
        let zip_path = tmp.join("Pack.zip");
        let mut writer = zip::ZipWriter::new(fs::File::create(&zip_path).unwrap());
        let options = zip::write::SimpleFileOptions::default();
        writer.start_file("Pack/b.glb", options).unwrap();
        writer.write_all(b"glTF").unwrap();
        writer.start_file("Pack/a.gltf", options).unwrap();
        writer.write_all(gltf_json(true).as_bytes()).unwrap();
        writer.start_file("Pack/Body.bin", options).unwrap();
        writer.write_all(b"\0\0\0\0").unwrap();
        writer.finish().unwrap();
        let (model, format) = import_folder_model(&zip_path, &avatars).unwrap();
        assert_eq!(
            (format, model.file_name().unwrap().to_str().unwrap()),
            ("gltf", "a.gltf")
        );

        // An unrigged one in a ZIP is refused and its folder removed again.
        let zip_statue = tmp.join("Statue.zip");
        let mut writer = zip::ZipWriter::new(fs::File::create(&zip_statue).unwrap());
        writer.start_file("s.gltf", options).unwrap();
        writer.write_all(gltf_json(false).as_bytes()).unwrap();
        writer.finish().unwrap();
        assert!(import_folder_model(&zip_statue, &avatars).is_err());
        assert!(!avatars.join("Statue").exists());

        // Listing: one model per folder, .gltf first.
        let listed = find_gltf_models(&avatars, 4);
        assert_eq!(listed.len(), 3, "{listed:?}");
        assert!(listed[0].ends_with("Figur/Figur.gltf"));
        let _ = fs::remove_dir_all(&tmp);
    }
}
