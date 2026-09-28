use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tracing::{info, warn};

use crate::modules::paths::resolve_app_paths;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannedLive2d {
    pub id: String,
    pub name: String,
    pub model_path: String,
    pub preview_image: Option<String>,
    pub version: String, // "cubism3_4" | "cubism2"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Live2dCatalogItem {
    pub id: String,
    pub name: String,
    pub description: String,
    pub url: String,
    pub model_file: String,
    pub is_installed: bool,
}

/// Catalog of official / well-known Live2D Cubism sample models
pub fn get_live2d_catalog() -> Vec<Live2dCatalogItem> {
    let installed = scan_available_live2d_models();
    let is_installed = |id: &str| installed.iter().any(|m| m.id == id);

    vec![
        Live2dCatalogItem {
            id: "unitychan".to_string(),
            name: "Unity-chan".to_string(),
            description: "Blonde Zöpfe, Bänder, Idol-Outfit (Ayu Ikue)".to_string(),
            url: "https://cubism.live2d.com/sample-data/bin/unitychan/unitychan_ja.zip".to_string(),
            model_file: "unitychan.model3.json".to_string(),
            is_installed: is_installed("unitychan"),
        },
        Live2dCatalogItem {
            id: "haru_greeter".to_string(),
            name: "Haru (Greeter / Office)".to_string(),
            description: "Dunkle Haare, schicker Blazer (Marina Wakatsuki)".to_string(),
            url: "https://cubism.live2d.com/sample-data/bin/haru_greeter/haru_greeter_ja.zip".to_string(),
            model_file: "haru_greeter_t05.model3.json".to_string(),
            is_installed: is_installed("haru_greeter"),
        },
        Live2dCatalogItem {
            id: "haru".to_string(),
            name: "Haru (Casual / Sporty)".to_string(),
            description: "Sportliche Jacke/Hoodie, aktive Ausdrücke (Hazel Williams)".to_string(),
            url: "https://cubism.live2d.com/sample-data/bin/haru/haru_ja.zip".to_string(),
            model_file: "haru.model3.json".to_string(),
            is_installed: is_installed("haru"),
        },
        Live2dCatalogItem {
            id: "senko".to_string(),
            name: "Senko".to_string(),
            description: "Fuchsöhrchen, Schweif, Schürze, verspielt (Cosmos)".to_string(),
            url: "https://raw.githubusercontent.com/Eikanya/Live2d-model/master/Live2D/Senko_Normals/senko.model3.json".to_string(),
            model_file: "senko.model3.json".to_string(),
            is_installed: is_installed("senko"),
        },
        Live2dCatalogItem {
            id: "tsumiki".to_string(),
            name: "Tsumiki Harugasa".to_string(),
            description: "Traditioneller Kimono & japanische Frisur (Hifumi Yamamoto)".to_string(),
            url: "https://cubism.live2d.com/sample-data/bin/tsumiki/tsumiki_ja.zip".to_string(),
            model_file: "tsumiki.model3.json".to_string(),
            is_installed: is_installed("tsumiki"),
        },
        Live2dCatalogItem {
            id: "rice".to_string(),
            name: "Rice Glassfield".to_string(),
            description: "Lange silber-lila Haare, Fantasy-Kleid (Yue)".to_string(),
            url: "https://cubism.live2d.com/sample-data/bin/rice/rice_en.zip".to_string(),
            model_file: "rice_pro_t03.model3.json".to_string(),
            is_installed: is_installed("rice"),
        },
        Live2dCatalogItem {
            id: "mao_pro".to_string(),
            name: "Niziiro Mao (Pro)".to_string(),
            description: "Bunt, Blendshapes, fröhliche Ausdrücke".to_string(),
            url: "https://cubism.live2d.com/sample-data/bin/mao/mao_en.zip".to_string(),
            model_file: "mao_pro.model3.json".to_string(),
            is_installed: is_installed("mao_pro"),
        },
        Live2dCatalogItem {
            id: "shizuku".to_string(),
            name: "Shizuku".to_string(),
            description: "Dunkle Haare, Schul- / Casual-Look".to_string(),
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

    // 2. Bundled assets directory relative to workspace root
    let current_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let mut base_root = current_dir.clone();
    if base_root.ends_with("src-tauri")
        && let Some(parent) = base_root.parent()
    {
        base_root = parent.to_path_buf();
    }
    search_dirs.push(base_root.join("assets").join("live2d"));
    search_dirs.push(base_root.join("..").join("assets").join("live2d"));

    // 3. Fallback: check relative to exe
    if let Ok(exe) = std::env::current_exe()
        && let Some(exe_dir) = exe.parent()
    {
        search_dirs.push(exe_dir.join("assets").join("live2d"));
        search_dirs.push(exe_dir.join("..").join("assets").join("live2d"));
    }

    // 4. Soul of Waifu local installation if available
    let sow_live2d =
        PathBuf::from("/home/deathtrap/development/Soul-of-Waifu-linux/assets/emotions/live2d");
    if sow_live2d.exists() {
        search_dirs.push(sow_live2d);
    }

    let mut found_models = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();

    for dir in search_dirs {
        if !dir.exists() || !dir.is_dir() {
            continue;
        }

        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    // Check for *.model3.json (Cubism 3/4) or *.model.json (Cubism 2)
                    if let Some(model_info) = inspect_live2d_dir(&path)
                        && !seen_ids.contains(&model_info.id)
                    {
                        seen_ids.insert(model_info.id.clone());
                        found_models.push(model_info);
                    }
                }
            }
        }
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
        } else if (fname.ends_with(".png") || fname.ends_with(".jpg"))
            && (fname.contains("icon") || fname.contains("preview") || fname.contains("thumbnail"))
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

/// Downloads and extracts a Live2D model into the user's live2d directory
pub async fn download_live2d_model(model_id: &str) -> Result<String, String> {
    let catalog = get_live2d_catalog();
    let item = catalog
        .iter()
        .find(|m| m.id == model_id)
        .ok_or_else(|| format!("Unbekanntes Live2D-Modell: {}", model_id))?;

    let paths = resolve_app_paths();
    let target_dir = PathBuf::from(&paths.data_dir).join("live2d").join(&item.id);
    fs::create_dir_all(&target_dir)
        .map_err(|e| format!("Zielverzeichnis konnte nicht erstellt werden: {}", e))?;

    info!(
        "Lade Live2D-Modell herunter: {} von {}",
        item.name, item.url
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("HTTP-Client-Fehler: {}", e))?;

    if item.url.ends_with(".zip") {
        let resp = client
            .get(&item.url)
            .send()
            .await
            .map_err(|e| format!("Download fehlgeschlagen: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!(
                "Download-Server antwortete mit Status {}",
                resp.status()
            ));
        }

        let bytes = resp
            .bytes()
            .await
            .map_err(|e| format!("Fehler beim Lesen der Download-Daten: {}", e))?;

        let cursor = std::io::Cursor::new(bytes);
        let mut archive = zip::ZipArchive::new(cursor)
            .map_err(|e| format!("ZIP-Archiv konnte nicht geöffnet werden: {}", e))?;

        // Extract files, stripping any "runtime/" prefix if present
        for i in 0..archive.len() {
            let mut file = archive
                .by_index(i)
                .map_err(|e| format!("Fehler beim Entpacken: {}", e))?;

            let enclosed = file.enclosed_name();
            if let Some(enclosed_path) = enclosed {
                let relative = enclosed_path
                    .strip_prefix("runtime/")
                    .unwrap_or(&enclosed_path);
                if relative.as_os_str().is_empty() {
                    continue;
                }

                let outpath = target_dir.join(relative);
                if file.is_dir() {
                    let _ = fs::create_dir_all(&outpath);
                } else {
                    if let Some(p) = outpath.parent() {
                        let _ = fs::create_dir_all(p);
                    }
                    let mut outfile = fs::File::create(&outpath).map_err(|e| {
                        format!("Datei {:?} konnte nicht erstellt werden: {}", outpath, e)
                    })?;
                    std::io::copy(&mut file, &mut outfile)
                        .map_err(|e| format!("Fehler beim Schreiben von {:?}: {}", outpath, e))?;
                }
            }
        }
        info!(
            "Live2D-Modell '{}' erfolgreich nach {:?} entpackt.",
            item.name, target_dir
        );
    } else {
        // Single file / raw github
        warn!("Direkter Download von Einzeldateien noch nicht voll implementiert.");
    }

    // Verify model file exists
    let expected_file = target_dir.join(&item.model_file);
    if expected_file.exists() {
        Ok(expected_file.to_string_lossy().to_string())
    } else {
        // Return first model file found
        let found = inspect_live2d_dir(&target_dir);
        if let Some(info) = found {
            Ok(info.model_path)
        } else {
            Ok(target_dir.to_string_lossy().to_string())
        }
    }
}

/// Imports a Live2D model from a user-selected path (ZIP archive, .model3.json file, or directory)
pub fn import_live2d_model(source_path: &str) -> Result<ScannedLive2d, String> {
    let src = PathBuf::from(source_path);
    if !src.exists() {
        return Err(format!("Pfad existiert nicht: {}", source_path));
    }

    let paths = resolve_app_paths();
    let dest_base = PathBuf::from(&paths.data_dir).join("live2d");
    fs::create_dir_all(&dest_base)
        .map_err(|e| format!("Zielordner konnte nicht erstellt werden: {}", e))?;

    if src.is_file() {
        let ext = src
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        if ext == "zip" {
            // Extract zip
            let model_name = src
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("imported_model");
            let target_dir = dest_base.join(model_name);
            fs::create_dir_all(&target_dir)
                .map_err(|e| format!("Verzeichnis konnte nicht erstellt werden: {}", e))?;

            let file = fs::File::open(&src)
                .map_err(|e| format!("ZIP konnte nicht geöffnet werden: {}", e))?;
            let mut archive =
                zip::ZipArchive::new(file).map_err(|e| format!("ZIP-Archiv fehlerhaft: {}", e))?;

            for i in 0..archive.len() {
                let mut f = archive
                    .by_index(i)
                    .map_err(|e| format!("Fehler beim Lesen des Eintrags: {}", e))?;
                if let Some(enclosed) = f.enclosed_name() {
                    let relative = enclosed.strip_prefix("runtime/").unwrap_or(&enclosed);
                    if relative.as_os_str().is_empty() {
                        continue;
                    }
                    let outpath = target_dir.join(relative);
                    if f.is_dir() {
                        let _ = fs::create_dir_all(&outpath);
                    } else {
                        if let Some(p) = outpath.parent() {
                            let _ = fs::create_dir_all(p);
                        }
                        let mut outfile = fs::File::create(&outpath)
                            .map_err(|e| format!("Datei konnte nicht angelegt werden: {}", e))?;
                        std::io::copy(&mut f, &mut outfile)
                            .map_err(|e| format!("Fehler beim Schreiben: {}", e))?;
                    }
                }
            }

            inspect_live2d_dir(&target_dir)
                .ok_or_else(|| "Im ZIP-Archiv wurde keine gültige .model3.json oder .model.json Datei gefunden.".to_string())
        } else if ext == "json"
            && (source_path.ends_with(".model3.json") || source_path.ends_with(".model.json"))
        {
            // User selected the model JSON directly -> copy its directory
            if let Some(parent) = src.parent() {
                let folder_name = parent
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("imported_model");
                let target_dir = dest_base.join(folder_name);
                copy_dir_recursive(parent, &target_dir)?;
                inspect_live2d_dir(&target_dir)
                    .ok_or_else(|| "Modell nach Kopieren nicht auffindbar.".to_string())
            } else {
                Err("Ungültiger übergeordneter Ordner für die Model-Datei.".to_string())
            }
        } else {
            Err("Nicht unterstütztes Dateiformat. Bitte wähle eine .zip-Datei oder eine *.model3.json/*.model.json Datei.".to_string())
        }
    } else if src.is_dir() {
        let folder_name = src
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("imported_model");
        let target_dir = dest_base.join(folder_name);
        copy_dir_recursive(&src, &target_dir)?;
        inspect_live2d_dir(&target_dir)
            .ok_or_else(|| "Im ausgewählten Ordner wurde keine gültige .model3.json oder .model.json Datei gefunden.".to_string())
    } else {
        Err("Ungültige Quelle.".to_string())
    }
}

/// Imports all Live2D models found in the Soul of Waifu installation directory
pub fn import_sow_live2d_models() -> Result<usize, String> {
    let paths = resolve_app_paths();
    let dest_base = PathBuf::from(&paths.data_dir).join("live2d");
    fs::create_dir_all(&dest_base)
        .map_err(|e| format!("Zielordner konnte nicht erstellt werden: {}", e))?;

    let sow_live2d =
        PathBuf::from("/home/deathtrap/development/Soul-of-Waifu-linux/assets/emotions/live2d");
    if !sow_live2d.exists() || !sow_live2d.is_dir() {
        return Err("Soul-of-Waifu Live2D-Verzeichnis wurde unter /home/deathtrap/development/Soul-of-Waifu-linux/assets/emotions/live2d nicht gefunden.".to_string());
    }

    let entries = fs::read_dir(&sow_live2d)
        .map_err(|e| format!("Fehler beim Lesen des SoW-Verzeichnisses: {}", e))?;

    let mut imported = 0;
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_dir()
            && let Some(folder_name) = p.file_name()
        {
            let target = dest_base.join(folder_name);
            if !target.exists() {
                let _ = copy_dir_recursive(&p, &target);
                imported += 1;
            }
        }
    }

    Ok(imported)
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst)
        .map_err(|e| format!("Verzeichnis {:?} konnte nicht erstellt werden: {}", dst, e))?;

    let entries = fs::read_dir(src)
        .map_err(|e| format!("Verzeichnis {:?} konnte nicht gelesen werden: {}", src, e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        let target = dst.join(entry.file_name());
        if path.is_dir() {
            copy_dir_recursive(&path, &target)?;
        } else {
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
}
