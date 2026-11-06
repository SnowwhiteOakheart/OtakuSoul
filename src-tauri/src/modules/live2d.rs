use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Seek};
use std::path::{Component, Path, PathBuf};
use tracing::{info, warn};
use ts_rs::TS;

use crate::modules::paths::resolve_app_paths;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ScannedLive2d {
    pub id: String,
    pub name: String,
    pub model_path: String,
    pub preview_image: Option<String>,
    pub version: String, // "cubism3_4" | "cubism2"
    /// Imported or downloaded by the user (in `<data>/live2d`): can be removed.
    #[serde(default)]
    pub removable: bool,
    /// Preview picture taken in the avatar manager (the model's own `preview_image` comes first).
    #[serde(default)]
    pub thumbnail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Live2dCatalogItem {
    pub id: String,
    pub name: String,
    pub description: String,
    pub url: String,
    pub model_file: String,
    pub is_installed: bool,
}

/// A Live2D model definition discovered inside a ZIP archive before extraction.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export)]
pub struct Live2dZipCandidate {
    /// Slash-separated path of the `.model3.json` / `.model.json` inside the archive.
    pub entry_path: String,
    /// Suggested human-readable model name (e.g. "Miku Pro").
    pub name: String,
    /// File name of the model definition (e.g. "miku_sample_t04.model3.json").
    pub model_file: String,
    /// "cubism3_4" or "cubism2".
    pub version: String,
    /// Number of motion files detected inside this model's runtime folder.
    pub motion_count: usize,
}

/// Catalog of official / well-known Live2D Cubism sample models
pub fn get_live2d_catalog() -> Vec<Live2dCatalogItem> {
    let installed = scan_available_live2d_models();
    let is_installed = |id: &str| installed.iter().any(|m| m.id == id);

    vec![
        Live2dCatalogItem {
            id: "unitychan".to_string(),
            name: "Unity-chan".to_string(),
            description: "Blonde pigtails, ribbons, idol outfit (Ayu Ikue)".to_string(),
            url: "https://cubism.live2d.com/sample-data/bin/unitychan/unitychan_ja.zip".to_string(),
            model_file: "unitychan.model3.json".to_string(),
            is_installed: is_installed("unitychan"),
        },
        Live2dCatalogItem {
            id: "haru_greeter".to_string(),
            name: "Haru (Greeter / Office)".to_string(),
            description: "Dark hair, smart blazer (Marina Wakatsuki)".to_string(),
            url: "https://cubism.live2d.com/sample-data/bin/haru_greeter/haru_greeter_ja.zip"
                .to_string(),
            model_file: "haru_greeter_t05.model3.json".to_string(),
            is_installed: is_installed("haru_greeter"),
        },
        Live2dCatalogItem {
            id: "haru".to_string(),
            name: "Haru (Casual / Sporty)".to_string(),
            description: "Sporty jacket/hoodie, lively expressions (Hazel Williams)".to_string(),
            url: "https://cubism.live2d.com/sample-data/bin/haru/haru_ja.zip".to_string(),
            model_file: "haru.model3.json".to_string(),
            is_installed: is_installed("haru"),
        },
        Live2dCatalogItem {
            id: "senko".to_string(),
            name: "Senko".to_string(),
            description: "Fox ears, tail, apron, playful (Cosmos)".to_string(),
            url: "https://raw.githubusercontent.com/Eikanya/Live2d-model/master/Live2D/Senko_Normals/senko.model3.json".to_string(),
            model_file: "senko.model3.json".to_string(),
            is_installed: is_installed("senko"),
        },
        Live2dCatalogItem {
            id: "tsumiki".to_string(),
            name: "Tsumiki Harugasa".to_string(),
            description: "Traditional kimono & Japanese hairstyle (Hifumi Yamamoto)".to_string(),
            url: "https://cubism.live2d.com/sample-data/bin/tsumiki/tsumiki_ja.zip".to_string(),
            model_file: "tsumiki.model3.json".to_string(),
            is_installed: is_installed("tsumiki"),
        },
        Live2dCatalogItem {
            id: "rice".to_string(),
            name: "Rice Glassfield".to_string(),
            description: "Long silver-lilac hair, fantasy dress (Yue)".to_string(),
            url: "https://cubism.live2d.com/sample-data/bin/rice/rice_en.zip".to_string(),
            model_file: "rice_pro_t03.model3.json".to_string(),
            is_installed: is_installed("rice"),
        },
        Live2dCatalogItem {
            id: "mao_pro".to_string(),
            name: "Niziiro Mao (Pro)".to_string(),
            description: "Colourful, blendshapes, cheerful expressions".to_string(),
            url: "https://cubism.live2d.com/sample-data/bin/mao/mao_en.zip".to_string(),
            model_file: "mao_pro.model3.json".to_string(),
            is_installed: is_installed("mao_pro"),
        },
        Live2dCatalogItem {
            id: "shizuku".to_string(),
            name: "Shizuku".to_string(),
            description: "Dark hair, school / casual look".to_string(),
            url: "https://cubism.live2d.com/sample-data/bin/shizuku/shizuku_ja.zip".to_string(),
            model_file: "shizuku.model3.json".to_string(),
            is_installed: is_installed("shizuku"),
        },
    ]
}

/// Scans directories for Live2D models (.model3.json and .model.json)
pub fn scan_available_live2d_models() -> Vec<ScannedLive2d> {
    let paths = resolve_app_paths();
    let mut search_dirs = Vec::new();

    // 1. User live2d directory in data_dir
    let user_live2d = PathBuf::from(&paths.data_dir).join("live2d");
    search_dirs.push(user_live2d);

    // 2. Bundled models (resource dir, working directory, next to the executable, source checkout)
    search_dirs.extend(
        crate::modules::paths::bundle_roots()
            .into_iter()
            .map(|root| root.join("assets").join("live2d")),
    );

    let mut found_models = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();

    for dir in search_dirs {
        if !dir.exists() || !dir.is_dir() {
            continue;
        }

        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir()
                    && let Some(model_info) = inspect_live2d_dir(&path)
                    && !seen_ids.contains(&model_info.id)
                {
                    seen_ids.insert(model_info.id.clone());
                    found_models.push(model_info);
                }
            }
        }
    }

    let data_dir = PathBuf::from(&paths.data_dir);
    for model in &mut found_models {
        use crate::modules::avatar_library::{AvatarKind, custom_name, removable, thumbnail};
        if let Some(name) = custom_name(&data_dir, AvatarKind::Live2d, &model.id) {
            model.name = name;
        }
        model.removable = removable(&data_dir, AvatarKind::Live2d, Path::new(&model.model_path));
        model.thumbnail = thumbnail(&data_dir, AvatarKind::Live2d, &model.id);
    }
    found_models.sort_by_key(|a| a.name.to_lowercase());
    found_models
}

fn inspect_live2d_dir(dir: &Path) -> Option<ScannedLive2d> {
    let folder_name = dir.file_name()?.to_string_lossy().to_string();
    let entries = fs::read_dir(dir).ok()?;

    let mut model_file: Option<PathBuf> = None;
    let mut version = "cubism3_4".to_string();
    let mut preview_image: Option<String> = None;

    for entry in entries.flatten() {
        let p = entry.path();
        let fname = p.file_name()?.to_string_lossy().to_string();

        if fname.ends_with(".model3.json") {
            model_file = Some(p.clone());
            version = "cubism3_4".to_string();
        } else if fname.ends_with(".model.json") && model_file.is_none() {
            model_file = Some(p.clone());
            version = "cubism2".to_string();
        } else if let lower = fname.to_lowercase()
            && (lower.ends_with(".png") || lower.ends_with(".jpg") || lower.ends_with(".webp"))
            && (lower.contains("icon") || lower.contains("preview") || lower.contains("thumbnail"))
        {
            preview_image = Some(p.to_string_lossy().to_string());
        }
    }

    let raw_path = model_file?;
    let model_path = fs::canonicalize(&raw_path).unwrap_or(raw_path);
    let name = format_human_name(&folder_name);

    Some(ScannedLive2d {
        id: folder_name,
        name,
        model_path: model_path.to_string_lossy().to_string(),
        preview_image,
        version,
        removable: false,
        thumbnail: None,
    })
}

fn format_human_name(id: &str) -> String {
    let cleaned = id.replace(['_', '-'], " ");
    let words: Vec<String> = cleaned
        .split_whitespace()
        .map(|w| {
            let mut c = w.chars();
            match c.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
            }
        })
        .collect();
    words.join(" ")
}

/// Decodes a ZIP entry name as UTF-8, falling back to Shift_JIS for Japanese archives.
fn zip_entry_name(raw: &[u8]) -> String {
    match std::str::from_utf8(raw) {
        Ok(name) => name.to_string(),
        Err(_) => encoding_rs::SHIFT_JIS.decode(raw).0.into_owned(),
    }
}

/// Normalizes a ZIP path into safe relative components (`None` for `__MACOSX`, `..`, or AppleDouble `._*`).
fn safe_zip_path(name: &str) -> Option<PathBuf> {
    let mut path = PathBuf::new();
    for part in name.split(['/', '\\']) {
        if part.eq_ignore_ascii_case("__MACOSX") {
            return None;
        }
        match Path::new(part).components().next() {
            None | Some(Component::CurDir) => {}
            Some(Component::Normal(seg)) => path.push(seg),
            _ => return None,
        }
    }
    if path.as_os_str().is_empty() {
        return None;
    }
    if path
        .file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|n| n.starts_with("._"))
    {
        return None;
    }
    Some(path)
}

fn slash_path(path: &Path) -> String {
    path.components()
        .filter_map(|c| match c {
            Component::Normal(s) => Some(s.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

fn live2d_model_version(file_name: &str) -> Option<&'static str> {
    let lower = file_name.to_ascii_lowercase();
    if lower.ends_with(".model3.json") {
        Some("cubism3_4")
    } else if lower.ends_with(".model.json") {
        Some("cubism2")
    } else {
        None
    }
}

fn model_file_stem(file_name: &str) -> &str {
    let lower = file_name.to_ascii_lowercase();
    if lower.ends_with(".model3.json") {
        &file_name[..file_name.len() - ".model3.json".len()]
    } else if lower.ends_with(".model.json") {
        &file_name[..file_name.len() - ".model.json".len()]
    } else {
        Path::new(file_name)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(file_name)
    }
}

/// Cubism Editor project files (`.cmo3`/`.can3`/`.cae`) are large source assets not used at runtime.
fn is_editor_source_file(file_name: &str) -> bool {
    let lower = file_name.to_ascii_lowercase();
    lower.ends_with(".cmo3") || lower.ends_with(".can3") || lower.ends_with(".cae")
}

/// License/ReadMe notes or preview pictures located right next to a `runtime/` folder.
fn is_readme_or_preview(file_name: &str) -> bool {
    let lower = file_name.to_ascii_lowercase();
    if lower.ends_with(".txt")
        || lower.ends_with(".md")
        || lower.starts_with("license")
        || lower.starts_with("readme")
    {
        return true;
    }
    (lower.ends_with(".png") || lower.ends_with(".jpg") || lower.ends_with(".webp"))
        && (lower.contains("icon") || lower.contains("preview") || lower.contains("thumbnail"))
}

fn is_generic_dir_name(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "runtime"
            | "model"
            | "models"
            | "live2d"
            | "export"
            | "data"
            | "files"
            | "vts"
            | "vtubestudio"
            | "downloads"
            | "desktop"
            | "documents"
            | "tmp"
            | "temp"
    )
}

fn is_generic_stem(stem: &str) -> bool {
    matches!(
        stem.to_ascii_lowercase().as_str(),
        "model" | "avatar" | "live2d" | "character" | "default" | "runtime"
    )
}

fn sanitize_folder_id(raw: &str) -> String {
    let cleaned: String = raw
        .chars()
        .map(|c| {
            if matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') || c.is_control() {
                '_'
            } else {
                c
            }
        })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.');
    if trimmed.is_empty() {
        "imported_model".to_string()
    } else {
        trimmed.to_string()
    }
}

/// Picks an unused folder name in `parent` (`"name"`, `"name (2)"`, …).
fn free_live2d_dir(parent: &Path, name: &str) -> PathBuf {
    let safe = sanitize_folder_id(name);
    let mut dir = parent.join(&safe);
    let mut n = 2;
    while dir.exists() {
        dir = parent.join(format!("{safe} ({n})"));
        n += 1;
    }
    dir
}

/// Picks a meaningful folder name when importing a `.model3.json` file or directory from disk.
fn choose_disk_folder_name(model_dir: &Path, fallback_stem: &str) -> String {
    for ancestor in model_dir.ancestors().take(2) {
        if let Some(seg) = ancestor.file_name().and_then(|s| s.to_str())
            && !seg.is_empty()
            && !is_generic_dir_name(seg)
        {
            return sanitize_folder_id(seg);
        }
    }
    sanitize_folder_id(fallback_stem)
}

/// Scans a ZIP archive for all contained Live2D models alongside their suggested folder IDs.
fn scan_archive_candidates<R: Read + Seek>(
    archive: &mut zip::ZipArchive<R>,
    zip_stem: &str,
) -> Result<Vec<(Live2dZipCandidate, String)>, String> {
    let mut files: Vec<PathBuf> = Vec::new();
    for i in 0..archive.len() {
        let entry = archive
            .by_index_raw(i)
            .map_err(|e| crate::err!("backend.common.unzip", error = e))?;
        if entry.is_dir() {
            continue;
        }
        let decoded = zip_entry_name(entry.name_raw());
        if let Some(clean) = safe_zip_path(&decoded) {
            files.push(clean);
        }
    }

    struct RawModel {
        path: PathBuf,
        entry_path: String,
        model_file: String,
        stem: String,
        version: &'static str,
        base_id: String,
    }

    let mut raw_models: Vec<RawModel> = Vec::new();
    for path in &files {
        let Some(fname) = path.file_name().and_then(|s| s.to_str()) else {
            continue;
        };
        let Some(version) = live2d_model_version(fname) else {
            continue;
        };
        let stem = model_file_stem(fname).to_string();
        let parent = path.parent().unwrap_or_else(|| Path::new(""));

        // If the same folder holds both `foo.model3.json` and a legacy `foo.model.json`, keep Cubism 3/4.
        if let Some(existing) = raw_models.iter_mut().find(|m| {
            m.path.parent().unwrap_or_else(|| Path::new("")) == parent
                && m.stem.eq_ignore_ascii_case(&stem)
        }) {
            if version == "cubism3_4" && existing.version != "cubism3_4" {
                existing.path = path.clone();
                existing.entry_path = slash_path(path);
                existing.model_file = fname.to_string();
                existing.version = version;
            }
            continue;
        }

        let dir_choice = parent
            .components()
            .rev()
            .filter_map(|c| match c {
                Component::Normal(s) => s.to_str(),
                _ => None,
            })
            .find(|seg| !is_generic_dir_name(seg));

        let base_id = if let Some(dir_name) = dir_choice {
            dir_name.to_string()
        } else if !is_generic_stem(&stem) && !stem.is_empty() {
            stem.clone()
        } else {
            zip_stem.to_string()
        };

        raw_models.push(RawModel {
            path: path.clone(),
            entry_path: slash_path(path),
            model_file: fname.to_string(),
            stem,
            version,
            base_id,
        });
    }

    let mut base_counts: HashMap<String, usize> = HashMap::new();
    for m in &raw_models {
        *base_counts
            .entry(m.base_id.to_ascii_lowercase())
            .or_insert(0) += 1;
    }

    let mut results = Vec::with_capacity(raw_models.len());
    for m in raw_models {
        let model_dir = m.path.parent().unwrap_or_else(|| Path::new(""));
        let motion_count = files
            .iter()
            .filter(|f| {
                f.starts_with(model_dir)
                    && f.file_name().and_then(|s| s.to_str()).is_some_and(|n| {
                        let lower = n.to_ascii_lowercase();
                        lower.ends_with(".motion3.json") || lower.ends_with(".mtn")
                    })
            })
            .count();

        let disambiguated = if base_counts
            .get(&m.base_id.to_ascii_lowercase())
            .copied()
            .unwrap_or(0)
            > 1
            && !m.base_id.eq_ignore_ascii_case(&m.stem)
            && !m.stem.is_empty()
        {
            format!("{}_{}", m.base_id, m.stem)
        } else {
            m.base_id
        };

        let folder_id = sanitize_folder_id(&disambiguated);
        let name = format_human_name(&folder_id);
        results.push((
            Live2dZipCandidate {
                entry_path: m.entry_path,
                name,
                model_file: m.model_file,
                version: m.version.to_string(),
                motion_count,
            },
            folder_id,
        ));
    }

    Ok(results)
}

/// Extracts a single chosen `Live2dZipCandidate` from `archive` into `target_dir`.
fn extract_archive_candidate<R: Read + Seek>(
    archive: &mut zip::ZipArchive<R>,
    candidate: &Live2dZipCandidate,
    target_dir: &Path,
) -> Result<ScannedLive2d, String> {
    let candidate_path = safe_zip_path(&candidate.entry_path)
        .ok_or_else(|| crate::err!("backend.live2d.noModelInZip"))?;
    let model_dir = candidate_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_default();
    let outer_readme_dir = model_dir
        .file_name()
        .and_then(|n| n.to_str())
        .filter(|n| n.eq_ignore_ascii_case("runtime"))
        .and_then(|_| model_dir.parent())
        .filter(|p| !p.as_os_str().is_empty())
        .map(Path::to_path_buf);

    fs::create_dir_all(target_dir)
        .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;

    let extract_res = (|| -> Result<(), String> {
        let mut fallback_extras: Vec<(usize, String)> = Vec::new();

        for i in 0..archive.len() {
            let mut f = archive
                .by_index(i)
                .map_err(|e| crate::err!("backend.common.unzip", error = e))?;
            if f.is_dir() {
                continue;
            }
            let decoded = zip_entry_name(f.name_raw());
            let Some(clean_path) = safe_zip_path(&decoded) else {
                continue;
            };
            let Some(fname) = clean_path.file_name().and_then(|s| s.to_str()) else {
                continue;
            };
            if is_editor_source_file(fname) {
                continue;
            }

            if let Ok(rel) = clean_path.strip_prefix(&model_dir)
                && !rel.as_os_str().is_empty()
            {
                // When multiple model JSONs live in the same folder, only keep the chosen variant.
                if rel.components().count() == 1
                    && live2d_model_version(fname).is_some()
                    && !fname.eq_ignore_ascii_case(&candidate.model_file)
                {
                    continue;
                }
                let outpath = target_dir.join(rel);
                if let Some(p) = outpath.parent() {
                    fs::create_dir_all(p)
                        .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
                }
                let mut outfile = fs::File::create(&outpath)
                    .map_err(|e| crate::err!("backend.common.fileCreate", error = e))?;
                std::io::copy(&mut f, &mut outfile)
                    .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
            } else if let Some(ref outer) = outer_readme_dir
                && clean_path.parent() == Some(outer.as_path())
                && is_readme_or_preview(fname)
            {
                fallback_extras.push((i, fname.to_string()));
            }
        }

        for (idx, fname) in fallback_extras {
            let outpath = target_dir.join(&fname);
            if outpath.exists() {
                continue;
            }
            let mut f = archive
                .by_index(idx)
                .map_err(|e| crate::err!("backend.common.unzip", error = e))?;
            let mut outfile = fs::File::create(&outpath)
                .map_err(|e| crate::err!("backend.common.fileCreate", error = e))?;
            std::io::copy(&mut f, &mut outfile)
                .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
        }

        Ok(())
    })();

    if let Err(e) = extract_res {
        let _ = fs::remove_dir_all(target_dir);
        return Err(e);
    }

    inspect_live2d_dir(target_dir).ok_or_else(|| {
        let _ = fs::remove_dir_all(target_dir);
        crate::err!("backend.live2d.noModelInZip")
    })
}

/// Lists all Live2D model definitions inside a ZIP archive without extracting it.
pub fn inspect_live2d_zip(source_path: &str) -> Result<Vec<Live2dZipCandidate>, String> {
    let src = PathBuf::from(source_path);
    if !src.is_file() {
        return Err(crate::err!(
            "backend.common.pathMissing",
            path = source_path
        ));
    }
    let zip_stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("imported_model");
    let file =
        fs::File::open(&src).map_err(|e| crate::err!("backend.common.zipOpen", error = e))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| crate::err!("backend.common.zipInvalid", error = e))?;
    let candidates = scan_archive_candidates(&mut archive, zip_stem)?;
    Ok(candidates.into_iter().map(|(c, _)| c).collect())
}

/// Downloads and extracts a Live2D model into the user's live2d directory
pub async fn download_live2d_model(model_id: &str) -> Result<String, String> {
    let catalog = get_live2d_catalog();
    let item = catalog
        .iter()
        .find(|m| m.id == model_id)
        .ok_or_else(|| crate::err!("backend.live2d.unknownModel", name = model_id))?;

    let paths = resolve_app_paths();
    let target_dir = PathBuf::from(&paths.data_dir).join("live2d").join(&item.id);

    info!(
        "Lade Live2D-Modell herunter: {} von {}",
        item.name, item.url
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| crate::err!("backend.common.httpClient", error = e))?;

    if item.url.ends_with(".zip") {
        let resp = client
            .get(&item.url)
            .send()
            .await
            .map_err(|e| crate::err!("backend.common.downloadFailed", error = e))?;

        if !resp.status().is_success() {
            return Err(crate::err!(
                "backend.common.downloadStatus",
                status = resp.status()
            ));
        }

        let bytes = resp
            .bytes()
            .await
            .map_err(|e| crate::err!("backend.common.downloadRead", error = e))?;

        let cursor = std::io::Cursor::new(bytes);
        let mut archive = zip::ZipArchive::new(cursor)
            .map_err(|e| crate::err!("backend.common.zipOpen", error = e))?;

        let candidates = scan_archive_candidates(&mut archive, &item.id)?;
        if let Some((chosen, _)) = candidates
            .iter()
            .find(|(c, _)| c.model_file.eq_ignore_ascii_case(&item.model_file))
            .or_else(|| candidates.first())
        {
            let scanned = extract_archive_candidate(&mut archive, chosen, &target_dir)?;
            info!(
                "Live2D-Modell '{}' erfolgreich nach {:?} entpackt.",
                item.name, target_dir
            );
            return Ok(scanned.model_path);
        }
        return Err(crate::err!("backend.live2d.noModelInZip"));
    } else {
        // Single file / raw github
        fs::create_dir_all(&target_dir)
            .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
        warn!("Direkter Download von Einzeldateien noch nicht voll implementiert.");
    }

    // Verify model file exists
    let expected_file = target_dir.join(&item.model_file);
    if expected_file.exists() {
        Ok(expected_file.to_string_lossy().to_string())
    } else if let Some(info) = inspect_live2d_dir(&target_dir) {
        Ok(info.model_path)
    } else {
        Ok(target_dir.to_string_lossy().to_string())
    }
}

/// Imports a Live2D model from a user-selected path (ZIP archive, `.model3.json` file, or directory).
/// For multi-model ZIPs, `entry_path` selects which `.model3.json` / `.model.json` entry to extract.
pub fn import_live2d_model(
    source_path: &str,
    entry_path: Option<&str>,
) -> Result<ScannedLive2d, String> {
    let paths = resolve_app_paths();
    let dest_base = PathBuf::from(&paths.data_dir).join("live2d");
    import_live2d_model_into(Path::new(source_path), entry_path, &dest_base)
}

fn import_live2d_model_into(
    src: &Path,
    entry_path: Option<&str>,
    dest_base: &Path,
) -> Result<ScannedLive2d, String> {
    if !src.exists() {
        return Err(crate::err!(
            "backend.common.pathMissing",
            path = src.display()
        ));
    }

    fs::create_dir_all(dest_base)
        .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;

    if src.is_file() {
        let ext = src
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        let fname = src.file_name().and_then(|s| s.to_str()).unwrap_or("");

        if ext == "zip" {
            let zip_stem = src
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("imported_model");
            let file = fs::File::open(src)
                .map_err(|e| crate::err!("backend.common.zipOpen", error = e))?;
            let mut archive = zip::ZipArchive::new(file)
                .map_err(|e| crate::err!("backend.common.zipInvalid", error = e))?;

            let candidates = scan_archive_candidates(&mut archive, zip_stem)?;
            if candidates.is_empty() {
                return Err(crate::err!("backend.live2d.noModelInZip"));
            }

            let (chosen, folder_id) = if let Some(wanted) = entry_path {
                let norm = safe_zip_path(wanted).map(|p| slash_path(&p));
                candidates
                    .into_iter()
                    .find(|(c, _)| {
                        c.entry_path == wanted || norm.as_deref().is_some_and(|n| c.entry_path == n)
                    })
                    .ok_or_else(|| crate::err!("backend.live2d.noModelInZip"))?
            } else {
                candidates
                    .into_iter()
                    .next()
                    .ok_or_else(|| crate::err!("backend.live2d.noModelInZip"))?
            };

            let target_dir = free_live2d_dir(dest_base, &folder_id);
            extract_archive_candidate(&mut archive, &chosen, &target_dir)
        } else if ext == "json" && live2d_model_version(fname).is_some() {
            // User selected the model JSON directly -> copy its runtime directory
            let Some(parent) = src.parent() else {
                return Err(crate::err!("backend.live2d.invalidParent"));
            };
            let stem = model_file_stem(fname);
            let folder_name = choose_disk_folder_name(parent, stem);
            let target_dir = free_live2d_dir(dest_base, &folder_name);
            copy_dir_filtered(parent, &target_dir, Some(fname)).inspect_err(|_| {
                let _ = fs::remove_dir_all(&target_dir);
            })?;
            inspect_live2d_dir(&target_dir).ok_or_else(|| {
                let _ = fs::remove_dir_all(&target_dir);
                crate::err!("backend.live2d.modelLostAfterCopy")
            })
        } else {
            Err(crate::err!("backend.live2d.unsupportedFormat"))
        }
    } else if src.is_dir() {
        let runtime_sub = src.join("runtime");
        let source_dir = if inspect_live2d_dir(src).is_none() && runtime_sub.is_dir() {
            runtime_sub.as_path()
        } else {
            src
        };
        let fallback = src
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("imported_model");
        let folder_name = choose_disk_folder_name(source_dir, fallback);
        let target_dir = free_live2d_dir(dest_base, &folder_name);
        copy_dir_filtered(source_dir, &target_dir, None).inspect_err(|_| {
            let _ = fs::remove_dir_all(&target_dir);
        })?;
        inspect_live2d_dir(&target_dir).ok_or_else(|| {
            let _ = fs::remove_dir_all(&target_dir);
            crate::err!("backend.live2d.noModelInFolder")
        })
    } else {
        Err(crate::err!("backend.live2d.invalidSource"))
    }
}

fn copy_dir_filtered(src: &Path, dst: &Path, keep_only_model: Option<&str>) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| {
        crate::err!(
            "backend.common.dirCreatePath",
            path = format!("{:?}", dst),
            error = e
        )
    })?;

    let entries = fs::read_dir(src).map_err(|e| {
        crate::err!(
            "backend.common.dirReadPath",
            path = format!("{:?}", src),
            error = e
        )
    })?;

    for entry in entries.flatten() {
        let path = entry.path();
        let fname = entry.file_name();
        let fname_str = fname.to_string_lossy();
        if path.is_dir() {
            copy_dir_filtered(&path, &dst.join(&fname), None)?;
        } else {
            if is_editor_source_file(&fname_str) {
                continue;
            }
            if let Some(wanted) = keep_only_model
                && live2d_model_version(&fname_str).is_some()
                && !fname_str.eq_ignore_ascii_case(wanted)
            {
                continue;
            }
            let target = dst.join(&fname);
            fs::copy(&path, &target).map_err(|e| {
                format!(
                    "Fehler beim Kopieren von {:?} nach {:?}: {}",
                    path, target, e
                )
            })?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::sync::atomic::{AtomicUsize, Ordering};

    struct TempDir(PathBuf);

    impl TempDir {
        fn new(tag: &str) -> Self {
            static COUNTER: AtomicUsize = AtomicUsize::new(0);
            let n = COUNTER.fetch_add(1, Ordering::Relaxed);
            let dir = std::env::temp_dir().join(format!(
                "otakusoul_live2d_{}_{}_{}",
                tag,
                std::process::id(),
                n
            ));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn make_zip(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let buf = std::io::Cursor::new(Vec::new());
        let mut writer = zip::ZipWriter::new(buf);
        let opts = zip::write::SimpleFileOptions::default();
        for (name, data) in entries {
            writer.start_file(*name, opts).unwrap();
            writer.write_all(data).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }

    #[test]
    fn test_format_human_name() {
        assert_eq!(format_human_name("haru_greeter"), "Haru Greeter");
        assert_eq!(format_human_name("unitychan"), "Unitychan");
        assert_eq!(format_human_name("mao_pro"), "Mao Pro");
    }

    #[test]
    fn test_live2d_catalog_not_empty() {
        let catalog = get_live2d_catalog();
        assert!(catalog.len() >= 6);
        assert!(catalog.iter().any(|c| c.id == "unitychan"));
        assert!(catalog.iter().any(|c| c.id == "senko"));
    }

    #[test]
    fn multi_model_zip_lists_variants_and_imports_chosen_one() {
        let dir = TempDir::new("multi");
        let zip_path = dir.path().join("miku_ja.zip");
        let zip_bytes = make_zip(&[
            ("miku_pro/ReadMe.txt", b"Crypton license"),
            ("miku_pro/miku_sample_t05.cmo3", b"editor project"),
            ("miku_pro/runtime/miku_sample_t04.model3.json", b"{}"),
            ("miku_pro/runtime/miku_sample_t04.moc3", b"moc3"),
            ("miku_pro/runtime/motion/miku_01.motion3.json", b"{}"),
            ("miku_pro/runtime/motion/miku_02.motion3.json", b"{}"),
            ("miku_free/ReadMe.txt", b"Free readme"),
            ("miku_free/miku_t01.cmo3", b"editor project"),
            ("miku_free/runtime/miku.model3.json", b"{}"),
            ("miku_free/runtime/miku.moc3", b"moc3"),
            ("miku_free/runtime/motions/miku_idle.motion3.json", b"{}"),
            (
                "__MACOSX/miku_pro/runtime/._miku_sample_t04.model3.json",
                b"junk",
            ),
        ]);
        fs::write(&zip_path, zip_bytes).unwrap();

        let candidates = inspect_live2d_zip(zip_path.to_str().unwrap()).unwrap();
        assert_eq!(candidates.len(), 2);
        assert_eq!(candidates[0].name, "Miku Pro");
        assert_eq!(
            candidates[0].entry_path,
            "miku_pro/runtime/miku_sample_t04.model3.json"
        );
        assert_eq!(candidates[0].motion_count, 2);
        assert_eq!(candidates[1].name, "Miku Free");
        assert_eq!(
            candidates[1].entry_path,
            "miku_free/runtime/miku.model3.json"
        );
        assert_eq!(candidates[1].motion_count, 1);

        let dest = dir.path().join("live2d");
        let pro = import_live2d_model_into(
            &zip_path,
            Some("miku_pro/runtime/miku_sample_t04.model3.json"),
            &dest,
        )
        .unwrap();
        assert_eq!(pro.id, "miku_pro");
        assert_eq!(pro.name, "Miku Pro");
        assert!(dest.join("miku_pro/miku_sample_t04.model3.json").is_file());
        assert!(dest.join("miku_pro/ReadMe.txt").is_file());
        assert!(!dest.join("miku_pro/miku_sample_t05.cmo3").exists());
        assert!(!dest.join("miku_pro/miku.model3.json").exists());

        let free =
            import_live2d_model_into(&zip_path, Some("miku_free/runtime/miku.model3.json"), &dest)
                .unwrap();
        assert_eq!(free.id, "miku_free");
        assert_eq!(free.name, "Miku Free");
        assert!(dest.join("miku_free/miku.model3.json").is_file());
    }

    #[test]
    fn same_folder_variants_and_empty_zip_cleanup() {
        let dir = TempDir::new("variants");
        let dest = dir.path().join("live2d");

        // Empty ZIP leaves no broken target directory behind.
        let bad_zip = dir.path().join("broken.zip");
        fs::write(&bad_zip, make_zip(&[("notes/readme.txt", b"hello")])).unwrap();
        assert!(import_live2d_model_into(&bad_zip, None, &dest).is_err());
        assert_eq!(fs::read_dir(&dest).unwrap().count(), 0);

        // Two `.model3.json` variants sharing one runtime folder are disambiguated cleanly.
        let multi_zip = dir.path().join("outfit_pack.zip");
        fs::write(
            &multi_zip,
            make_zip(&[
                ("Sakura/runtime/coat_on.model3.json", b"{}"),
                ("Sakura/runtime/coat_off.model3.json", b"{}"),
                ("Sakura/runtime/sakura.moc3", b"moc3"),
            ]),
        )
        .unwrap();
        let list = inspect_live2d_zip(multi_zip.to_str().unwrap()).unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].name, "Sakura Coat On");
        assert_eq!(list[1].name, "Sakura Coat Off");

        let imported = import_live2d_model_into(
            &multi_zip,
            Some("Sakura/runtime/coat_off.model3.json"),
            &dest,
        )
        .unwrap();
        assert_eq!(imported.id, "Sakura_coat_off");
        assert!(dest.join("Sakura_coat_off/coat_off.model3.json").is_file());
        assert!(!dest.join("Sakura_coat_off/coat_on.model3.json").exists());
    }

    #[test]
    fn direct_model_json_in_runtime_uses_parent_character_name() {
        let dir = TempDir::new("direct");
        let runtime = dir.path().join("miku_pro").join("runtime");
        fs::create_dir_all(&runtime).unwrap();
        let model_json = runtime.join("miku_sample_t04.model3.json");
        fs::write(&model_json, b"{}").unwrap();

        let dest = dir.path().join("live2d");
        let imported = import_live2d_model_into(&model_json, None, &dest).unwrap();
        assert_eq!(imported.id, "miku_pro");
        assert_eq!(imported.name, "Miku Pro");
    }
}
