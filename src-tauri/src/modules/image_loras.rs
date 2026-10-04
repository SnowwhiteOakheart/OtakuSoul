//! LoRAs for local image generation: a small checked catalog of anime styles plus any file the
//! user puts into `loras/`.
//!
//! `sd-server` ignores `<lora:…>` tags in the prompt; LoRAs go into the `lora` field of
//! `/sdapi/v1/txt2img` as paths relative to `--lora-model-dir`. A LoRA only works with the model
//! family it was trained for. A wrong one is not an error, `sd.cpp` just applies none of its
//! tensors, so catalog LoRAs are only sent to their own family. Files the user added have no
//! known family and are always sent.
//!
//! Every catalog file was tested with `sd-server` (all tensors applied). XLabs' FLUX anime LoRA
//! is missing on purpose: the original applies no tensors, the converted one blurs the image.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use tauri::Emitter;
use ts_rs::TS;

use crate::modules::local_image::{CANCEL_DOWNLOAD, ImageModelProgress};
use crate::modules::model_files::RemoteFile;

/// A LoRA chosen in the image settings and how strongly it applies.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct LoraSelection {
    /// File name in `loras/`.
    pub file: String,
    pub weight: f32,
}

struct CatalogLora {
    id: &'static str,
    name: &'static str,
    /// Model family it was trained for (`family` of the image model catalog).
    family: &'static str,
    remote: RemoteFile,
    /// Name in `loras/`; repositories often call the file just `lora.safetensors`.
    file: &'static str,
    license: &'static str,
    noncommercial: bool,
    /// Words the LoRA was trained on; put in front of the prompt.
    trigger: &'static str,
    weight: f32,
}

const CATALOG: &[CatalogLora] = &[
    CatalogLora {
        id: "anime-detailer-xl",
        name: "Anime Detailer XL",
        family: "sdxl",
        remote: RemoteFile {
            repo: "Linaqruf/anime-detailer-xl-lora",
            path: "anime-detailer-xl.safetensors",
            size: 43_170_124,
            sha256: Some("c63af131b72682eb5cb5a40e6c27aefc03cc2adee1a1bd950e79ec292044d5ea"),
        },
        file: "anime-detailer-xl.safetensors",
        license: "CreativeML Open RAIL++-M",
        noncommercial: false,
        trigger: "",
        weight: 1.0,
    },
    CatalogLora {
        id: "style-enhancer-xl",
        name: "Style Enhancer XL",
        family: "sdxl",
        remote: RemoteFile {
            repo: "Linaqruf/style-enhancer-xl-lora",
            path: "style-enhancer-xl.safetensors",
            size: 47_061_432,
            sha256: Some("f97807559f216209afe0dfb5ca39d1772de1fc8d3c4288f49541747d09b77d71"),
        },
        file: "style-enhancer-xl.safetensors",
        license: "CreativeML Open RAIL++-M",
        noncommercial: false,
        trigger: "",
        weight: 0.6,
    },
    CatalogLora {
        id: "pastel-anime-xl",
        name: "Pastel Anime XL",
        family: "sdxl",
        remote: RemoteFile {
            repo: "Linaqruf/pastel-anime-xl-lora",
            path: "pastel-anime-xl-latest.safetensors",
            size: 197_245_728,
            sha256: Some("4d8734308279ff039a365096b2c0d93905b66726d65020889032db8840f8c348"),
        },
        file: "pastel-anime-xl-latest.safetensors",
        license: "CreativeML Open RAIL++-M",
        noncommercial: false,
        trigger: "",
        weight: 1.0,
    },
    CatalogLora {
        id: "flux-ghibsky",
        name: "GHIBSKY Illustration (FLUX.1)",
        family: "flux",
        remote: RemoteFile {
            repo: "aleksa-codes/flux-ghibsky-illustration",
            path: "lora_v2.safetensors",
            size: 171_969_424,
            sha256: Some("6b7a3d6bf24ba01bdc4eda8988f13de91dd94a9af03e15b72e4792c5059ddb84"),
        },
        file: "flux-ghibsky-illustration.safetensors",
        license: "FLUX.1 [dev] Non-Commercial",
        noncommercial: true,
        trigger: "GHIBSKY style",
        weight: 0.8,
    },
];

/// A LoRA as the image settings show it: from the catalog or a file the user added.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct LoraInfo {
    /// File name in `loras/`; also the key of [`LoraSelection`].
    pub file: String,
    pub name: String,
    /// Catalog id; `None` for files the user added.
    pub catalog_id: Option<String>,
    /// Model family it works with; `None` when unknown (user files).
    pub family: Option<String>,
    pub installed: bool,
    pub download_bytes: u64,
    pub license: Option<String>,
    pub noncommercial: bool,
    pub trigger: String,
    pub default_weight: f32,
}

fn loras_dir() -> PathBuf {
    PathBuf::from(crate::modules::paths::resolve_app_paths().loras_dir)
}

fn is_installed(lora: &CatalogLora, dir: &Path) -> bool {
    std::fs::metadata(dir.join(lora.file)).is_ok_and(|m| m.len() == lora.remote.size)
}

/// Files `sd-server` accepts as LoRAs (`is_supported_model_ext`).
fn is_lora_file(path: &Path) -> bool {
    path.extension().and_then(|e| e.to_str()).is_some_and(|e| {
        matches!(
            e.to_ascii_lowercase().as_str(),
            "safetensors" | "ckpt" | "pt" | "gguf"
        )
    })
}

fn list_in(dir: &Path) -> Vec<LoraInfo> {
    let mut list: Vec<LoraInfo> = CATALOG
        .iter()
        .map(|l| LoraInfo {
            file: l.file.to_string(),
            name: l.name.to_string(),
            catalog_id: Some(l.id.to_string()),
            family: Some(l.family.to_string()),
            installed: is_installed(l, dir),
            download_bytes: l.remote.size,
            license: Some(l.license.to_string()),
            noncommercial: l.noncommercial,
            trigger: l.trigger.to_string(),
            default_weight: l.weight,
        })
        .collect();
    let mut own: Vec<LoraInfo> = std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_file() && is_lora_file(p))
        .filter_map(|p| p.file_name()?.to_str().map(str::to_string))
        .filter(|file| !CATALOG.iter().any(|l| l.file == file))
        .map(|file| LoraInfo {
            name: Path::new(&file)
                .file_stem()
                .map_or(file.clone(), |s| s.to_string_lossy().to_string()),
            file,
            catalog_id: None,
            family: None,
            installed: true,
            download_bytes: 0,
            license: None,
            noncommercial: false,
            trigger: String::new(),
            default_weight: 1.0,
        })
        .collect();
    own.sort_by_key(|l| l.name.to_lowercase());
    list.extend(own);
    list
}

/// The catalog with install state, followed by the user's own files.
pub fn list_loras() -> Vec<LoraInfo> {
    list_in(&loras_dir())
}

/// Downloads a catalog LoRA (resumable, SHA-256 checked); progress goes to
/// `image-model-progress` with the LoRA id as `model_id`.
pub async fn download_lora<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    id: &str,
) -> Result<(), String> {
    let lora = CATALOG
        .iter()
        .find(|l| l.id == id)
        .ok_or_else(|| crate::err!("backend.localImage.unknownModel", model = id))?;
    CANCEL_DOWNLOAD.store(false, Ordering::SeqCst);
    let dir = loras_dir();
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    let client = crate::modules::model_files::http_client()?;
    let total = lora.remote.size;
    let progress = |downloaded: u64, finished: bool| {
        let _ = app.emit(
            "image-model-progress",
            ImageModelProgress {
                model_id: lora.id.to_string(),
                file_name: lora.file.to_string(),
                downloaded_bytes: downloaded,
                total_bytes: total,
                percent: (downloaded as f32 / total.max(1) as f32 * 100.0).min(100.0),
                finished,
            },
        );
    };
    crate::modules::model_files::download_file_as(
        &client,
        &lora.remote,
        &dir.join(lora.file),
        &CANCEL_DOWNLOAD,
        &|downloaded| progress(downloaded, false),
    )
    .await?;
    progress(total, true);
    tracing::info!("LoRA {} heruntergeladen", lora.id);
    Ok(())
}

/// Deletes a LoRA file (catalog or own) from `loras/`.
pub fn delete_lora(file: &str) -> Result<(), String> {
    // Only plain names inside the LoRA folder.
    if file.is_empty() || Path::new(file).file_name().and_then(|n| n.to_str()) != Some(file) {
        return Err(crate::err!("backend.localImage.unknownModel", model = file));
    }
    let path = loras_dir().join(file);
    let _ = std::fs::remove_file(crate::modules::model_files::part_path(&path));
    std::fs::remove_file(&path).map_err(|e| crate::err!("backend.common.fileWrite", error = e))
}

/// What a generation with `family` uses of the selection.
#[derive(Debug, Default, PartialEq)]
pub struct AppliedLoras {
    /// `lora` field of the txt2img request.
    pub request: Vec<serde_json::Value>,
    /// Trigger words to put in front of the prompt.
    pub triggers: Vec<&'static str>,
    /// Extra VRAM for the LoRA weights, in MB.
    pub vram_mb: u64,
}

fn apply_in(dir: &Path, selections: &[LoraSelection], family: &str) -> AppliedLoras {
    let mut applied = AppliedLoras::default();
    for selection in selections {
        if selection.weight == 0.0 {
            continue;
        }
        let catalog = CATALOG.iter().find(|l| l.file == selection.file);
        if catalog.is_some_and(|l| l.family != family) {
            continue;
        }
        let Ok(meta) = std::fs::metadata(dir.join(&selection.file)) else {
            // `sd-server` rejects the whole request for an unknown path.
            tracing::warn!("LoRA {} fehlt, wird übersprungen", selection.file);
            continue;
        };
        applied.request.push(serde_json::json!({
            "path": selection.file,
            "multiplier": selection.weight,
        }));
        if let Some(lora) = catalog.filter(|l| !l.trigger.is_empty()) {
            applied.triggers.push(lora.trigger);
        }
        applied.vram_mb += meta.len().div_ceil(1024 * 1024);
    }
    applied
}

/// The selected LoRAs that exist and fit `family`.
pub fn apply(selections: &[LoraSelection], family: &str) -> AppliedLoras {
    apply_in(&loras_dir(), selections, family)
}

/// `prompt` with the trigger words in front that it doesn't contain yet.
pub fn with_triggers(prompt: &str, triggers: &[&str]) -> String {
    let lower = prompt.to_lowercase();
    let missing: Vec<&str> = triggers
        .iter()
        .copied()
        .filter(|t| !lower.contains(&t.to_lowercase()))
        .collect();
    if missing.is_empty() {
        prompt.to_string()
    } else {
        format!("{}, {prompt}", missing.join(", "))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("otakusoul-loras-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn pick(file: &str, weight: f32) -> LoraSelection {
        LoraSelection {
            file: file.into(),
            weight,
        }
    }

    #[test]
    fn catalog_is_consistent() {
        for lora in CATALOG {
            assert_eq!(lora.remote.sha256.map(str::len), Some(64), "{}", lora.id);
            assert!(lora.file.ends_with(".safetensors"), "{}", lora.id);
            assert_eq!(
                lora.noncommercial,
                lora.license.contains("Non-Commercial"),
                "{}",
                lora.id
            );
            assert_eq!(CATALOG.iter().filter(|l| l.file == lora.file).count(), 1);
        }
    }

    #[test]
    fn lists_catalog_and_own_files() {
        let dir = temp_dir("list");
        std::fs::write(dir.join("my-style.safetensors"), b"x").unwrap();
        std::fs::write(dir.join("notes.txt"), b"x").unwrap();
        std::fs::write(dir.join("anime-detailer-xl.safetensors"), b"partial").unwrap();
        let list = list_in(&dir);
        assert_eq!(list.len(), CATALOG.len() + 1);
        let detailer = list
            .iter()
            .find(|l| l.file == "anime-detailer-xl.safetensors")
            .unwrap();
        assert!(
            !detailer.installed,
            "a file of the wrong size isn't installed"
        );
        let own = list.last().unwrap();
        assert_eq!(
            (own.name.as_str(), own.family.as_deref(), own.installed),
            ("my-style", None, true)
        );
    }

    #[test]
    fn applies_only_existing_loras_of_the_model_family() {
        let dir = temp_dir("apply");
        for file in [
            "pastel-anime-xl-latest.safetensors",
            "flux-ghibsky-illustration.safetensors",
            "own.safetensors",
        ] {
            std::fs::write(dir.join(file), vec![0u8; 3 * 1024 * 1024]).unwrap();
        }
        let selection = [
            pick("pastel-anime-xl-latest.safetensors", 0.8),
            pick("flux-ghibsky-illustration.safetensors", 1.0),
            pick("own.safetensors", 0.5),
            pick("missing.safetensors", 1.0),
            pick("anime-detailer-xl.safetensors", 0.0),
        ];
        let sdxl = apply_in(&dir, &selection, "sdxl");
        let paths: Vec<_> = sdxl
            .request
            .iter()
            .map(|r| r["path"].as_str().unwrap())
            .collect();
        assert_eq!(
            paths,
            ["pastel-anime-xl-latest.safetensors", "own.safetensors"]
        );
        assert_eq!(sdxl.request[0]["multiplier"], 0.8_f32);
        assert!(sdxl.triggers.is_empty());
        assert_eq!(sdxl.vram_mb, 6);

        let flux = apply_in(&dir, &selection, "flux");
        assert_eq!(flux.triggers, ["GHIBSKY style"]);
        assert_eq!(flux.request.len(), 2);
    }

    #[test]
    fn trigger_words_are_added_once() {
        assert_eq!(
            with_triggers("a girl", &["GHIBSKY style"]),
            "GHIBSKY style, a girl"
        );
        assert_eq!(
            with_triggers("ghibsky style, a girl", &["GHIBSKY style"]),
            "ghibsky style, a girl"
        );
        assert_eq!(with_triggers("a girl", &[]), "a girl");
    }

    #[test]
    fn deletes_only_plain_file_names() {
        assert!(delete_lora("../settings.json").is_err());
        assert!(delete_lora("").is_err());
    }
}
