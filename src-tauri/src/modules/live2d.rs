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

    // 2. Bundled assets directory: ./assets/live2d
    let bundled_live2d = PathBuf::from("./assets/live2d");
    search_dirs.push(bundled_live2d);

    // 3. Fallback: check ../assets/live2d or relative to exe
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            search_dirs.push(exe_dir.join("assets").join("live2d"));
            search_dirs.push(exe_dir.join("..").join("assets").join("live2d"));
        }
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
                    if let Some(model_info) = inspect_live2d_dir(&path) {
                        if !seen_ids.contains(&model_info.id) {
                            seen_ids.insert(model_info.id.clone());
                            found_models.push(model_info);
                        }
                    }
                }
            }
        }
    }

    found_models.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
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

    let model_path = model_file?;
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

    info!("Lade Live2D-Modell herunter: {} von {}", item.name, item.url);

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
            return Err(format!("Download-Server antwortete mit Status {}", resp.status()));
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
                let relative = enclosed_path.strip_prefix("runtime/").unwrap_or(&enclosed_path);
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
                    let mut outfile = fs::File::create(&outpath)
                        .map_err(|e| format!("Datei {:?} konnte nicht erstellt werden: {}", outpath, e))?;
                    std::io::copy(&mut file, &mut outfile)
                        .map_err(|e| format!("Fehler beim Schreiben von {:?}: {}", outpath, e))?;
                }
            }
        }
        info!("Live2D-Modell '{}' erfolgreich nach {:?} entpackt.", item.name, target_dir);
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
