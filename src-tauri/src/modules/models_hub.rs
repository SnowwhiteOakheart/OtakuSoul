use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tauri::Emitter;
use tokio::io::AsyncWriteExt;
use tracing::info;
use ts_rs::TS;

use crate::modules::model_catalog::{Catalog, CatalogModel};

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct HfModelSummary {
    pub id: String,
    pub author: String,
    pub downloads: u64,
    pub likes: u64,
    pub pipeline_tag: Option<String>,
    pub last_modified: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct HfGgufFile {
    pub filename: String,
    pub size_bytes: u64,
    pub sha256: Option<String>,
    pub size_formatted: String,
    pub download_url: String,
    pub quantization: String,
    /// Runtime required to load this particular GGUF ("standard", "prism" or "legacy").
    pub runtime: String,
    pub recommended: bool,
    pub compatibility_note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct DownloadProgressEvent {
    pub filename: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub percent: f32,
    pub speed_mbps: f32,
    /// Estimated seconds until the download completes; `None` while unknown or when finished.
    pub eta_seconds: Option<u64>,
    pub finished: bool,
    pub error: Option<String>,
}

/// Remaining seconds at the average speed so far; `None` without a known size or progress.
fn estimate_eta(downloaded_bytes: u64, total_bytes: u64, elapsed_secs: f32) -> Option<u64> {
    if total_bytes == 0 || downloaded_bytes == 0 || downloaded_bytes >= total_bytes {
        return None;
    }
    let bytes_per_sec = downloaded_bytes as f64 / f64::from(elapsed_secs);
    Some(((total_bytes - downloaded_bytes) as f64 / bytes_per_sec).ceil() as u64)
}

fn format_bytes(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;

    if bytes >= GB {
        format!("{:.2} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else {
        format!("{:.0} KB", bytes as f64 / KB as f64)
    }
}

fn verify_download(
    filename: &str,
    downloaded_bytes: u64,
    expected_size: u64,
    expected_sha256: Option<&str>,
    actual_sha256: &str,
) -> Result<(), String> {
    if expected_size > 0 && downloaded_bytes != expected_size {
        return Err(crate::err!(
            "backend.common.downloadInterrupted",
            error = format!("Erwartet: {expected_size} Bytes, empfangen: {downloaded_bytes} Bytes")
        ));
    }
    if let Some(expected) = expected_sha256
        && actual_sha256 != expected.trim_start_matches("sha256:").to_ascii_lowercase()
    {
        return Err(crate::err!(
            "backend.runtime.checksum",
            file = filename,
            expected = expected,
            actual = actual_sha256
        ));
    }
    Ok(())
}

fn extract_quantization(filename: &str) -> String {
    let lower = filename.to_uppercase();
    let quants = [
        "PQ2_0", "PTQ1_0", "Q2_0_G64", "Q2_G64", "Q4_K_M", "Q4_K_S", "Q4_0", "Q4_1", "Q5_K_M",
        "Q5_K_S", "Q5_0", "Q5_1", "Q8_0", "Q6_K", "Q3_K_M", "Q3_K_S", "Q2_K", "IQ4_XS", "IQ4_NL",
        "IQ3_M", "BF16", "F16",
    ];

    for q in quants {
        if lower.contains(q) {
            return q.to_string();
        }
    }
    "GGUF".to_string()
}

fn classify_gguf(model_id: &str, filename: &str) -> (String, bool, String) {
    let model = model_id.to_ascii_lowercase();
    let file = filename.to_ascii_lowercase();

    if file.contains("pq2_0") || file.contains("ptq1_0") || model.contains("ternary-bonsai-2-") {
        return (
            "prism".to_string(),
            file.contains("pq2_0") && !file.contains("mmproj") && !file.contains("dspark"),
            crate::err!("backend.models.notePrism"),
        );
    }

    // This one filename predates the upstream Q2_0 migration. It deliberately uses an
    // incompatible layout and must not be confused with current, ordinary Q2_0 files.
    if model == "prism-ml/ternary-bonsai-27b-gguf" && file.ends_with("ternary-bonsai-27b-q2_0.gguf")
    {
        return (
            "legacy".to_string(),
            false,
            crate::err!("backend.models.noteLegacy"),
        );
    }

    if file.contains("q2_g64") || file.contains("q2_0_g64") {
        return (
            "standard".to_string(),
            false,
            crate::err!("backend.models.noteG64"),
        );
    }

    (
        "standard".to_string(),
        false,
        crate::err!("backend.models.noteDefault"),
    )
}

pub async fn search_hf_models(query: &str) -> Result<Vec<HfModelSummary>, String> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://huggingface.co/api/models?search={}&filter=gguf&sort=downloads&direction=-1&limit=25",
        urlencoding::encode(query)
    );

    let res = client
        .get(&url)
        .header("User-Agent", "OtakuSoul-Desktop-Client")
        .send()
        .await
        .map_err(|e| crate::err!("backend.models.search", error = e))?;

    if !res.status().is_success() {
        return Err(crate::err!(
            "backend.models.apiStatus",
            status = res.status()
        ));
    }

    let val: serde_json::Value = res
        .json()
        .await
        .map_err(|e| crate::err!("backend.models.parse", error = e))?;

    let mut models = Vec::new();
    if let Some(arr) = val.as_array() {
        for m in arr {
            if let Some(id) = m.get("id").and_then(|s| s.as_str()) {
                let author = m
                    .get("author")
                    .and_then(|s| s.as_str())
                    .unwrap_or("HuggingFace")
                    .to_string();
                let downloads = m.get("downloads").and_then(|d| d.as_u64()).unwrap_or(0);
                let likes = m.get("likes").and_then(|l| l.as_u64()).unwrap_or(0);
                let pipeline_tag = m
                    .get("pipeline_tag")
                    .and_then(|p| p.as_str())
                    .map(|s| s.to_string());
                let last_modified = m
                    .get("lastModified")
                    .and_then(|lm| lm.as_str())
                    .map(|s| s.to_string());

                models.push(HfModelSummary {
                    id: id.to_string(),
                    author,
                    downloads,
                    likes,
                    pipeline_tag,
                    last_modified,
                });
            }
        }
    }

    Ok(models)
}

pub async fn get_hf_model_files(model_id: &str) -> Result<Vec<HfGgufFile>, String> {
    let client = reqwest::Client::new();
    let url = format!("https://huggingface.co/api/models/{}?blobs=true", model_id);

    let res = client
        .get(&url)
        .header("User-Agent", "OtakuSoul-Desktop-Client")
        .send()
        .await
        .map_err(|e| crate::err!("backend.models.filesFetch", error = e))?;

    if !res.status().is_success() {
        return Err(crate::err!(
            "backend.models.filesMissing",
            status = res.status()
        ));
    }

    let val: serde_json::Value = res
        .json()
        .await
        .map_err(|e| crate::err!("backend.models.metadataParse", error = e))?;

    let mut files = Vec::new();
    if let Some(siblings) = val.get("siblings").and_then(|s| s.as_array()) {
        for s in siblings {
            if let Some(rfilename) = s.get("rfilename").and_then(|f| f.as_str())
                && rfilename.ends_with(".gguf")
            {
                let download_url = format!(
                    "https://huggingface.co/{}/resolve/main/{}",
                    model_id, rfilename
                );
                let size_bytes = s
                    .get("size")
                    .and_then(|sz| sz.as_u64())
                    .or_else(|| {
                        s.get("lfs")
                            .and_then(|l| l.get("size"))
                            .and_then(|sz| sz.as_u64())
                    })
                    .unwrap_or(0);
                let size_formatted = format_bytes(size_bytes);
                let sha256 = s
                    .get("lfs")
                    .and_then(|lfs| lfs.get("oid"))
                    .and_then(|oid| oid.as_str())
                    .map(|oid| oid.trim_start_matches("sha256:").to_ascii_lowercase());
                let quantization = extract_quantization(rfilename);
                let (runtime, recommended, compatibility_note) = classify_gguf(model_id, rfilename);

                files.push(HfGgufFile {
                    filename: rfilename.to_string(),
                    size_bytes,
                    sha256,
                    size_formatted,
                    download_url,
                    quantization,
                    runtime,
                    recommended,
                    compatibility_note,
                });
            }
        }
    }

    // Put the repository's recommended pack first, then keep the remaining list stable.
    files.sort_by(|a, b| {
        b.recommended
            .cmp(&a.recommended)
            .then_with(|| a.filename.cmp(&b.filename))
    });
    Ok(files)
}

/// A chat model for getting started, offered by the first-run wizard for the detected GPU.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct StarterModel {
    pub id: String,
    pub name: String,
    pub license: String,
    /// Estimated VRAM with the default context, in MB.
    pub vram_mb: u64,
    /// The largest model that fits the GPU (the smallest one without a GPU).
    pub recommended: bool,
    pub fits_gpu: bool,
    pub installed: bool,
    pub file: HfGgufFile,
    /// Short description per language code.
    pub description: std::collections::HashMap<String, String>,
    /// `open`, `restricted` or `noncommercial` (see `CatalogModel::license_kind`).
    pub license_kind: String,
    /// What the licence restricts, per language code.
    pub license_note: std::collections::HashMap<String, String>,
    pub license_url: String,
    /// Vision projector to download next to the model (`filename` is the name it is saved
    /// under, unique per model); `None` when the model cannot see images.
    pub mmproj: Option<HfGgufFile>,
    pub mmproj_installed: bool,
}

/// Index of the recommended starter for `vram_mb` (0 = no GPU): a preferred one that fits,
/// else the largest that fits, else the smallest; only openly licensed models are recommended.
fn recommended_starter(catalog: &Catalog, vram_mb: u64) -> usize {
    let usable = vram_mb.saturating_sub(catalog.desktop_reserve_mb);
    let open = |s: &CatalogModel| s.license_kind() == "open";
    let fits = |s: &CatalogModel| open(s) && s.vram_mb <= usable;
    let models = &catalog.models;
    models
        .iter()
        .position(|s| s.preferred && fits(s))
        .or_else(|| models.iter().rposition(fits))
        .or_else(|| models.iter().position(open))
        .unwrap_or(0)
}

/// The starter models (catalog in `model_catalog`) with install state and the recommendation for
/// this machine's GPU.
pub fn starter_models() -> Vec<StarterModel> {
    let vram = crate::modules::hardware::probe_hardware()
        .primary_gpu()
        .map_or(0, |g| g.total_vram_mb);
    let catalog = crate::modules::model_catalog::catalog();
    let recommended = recommended_starter(&catalog, vram);
    let models_dir = PathBuf::from(crate::modules::paths::resolve_app_paths().bundled_models_dir);
    let usable = vram.saturating_sub(catalog.desktop_reserve_mb);
    catalog
        .models
        .into_iter()
        .enumerate()
        .map(|(i, s)| StarterModel {
            mmproj: s
                .mmproj
                .as_ref()
                .zip(s.mmproj_target())
                .map(|(m, target)| HfGgufFile {
                    size_formatted: format!("{:.2} GB", m.size_bytes as f64 / 1_073_741_824.0),
                    download_url: format!(
                        "https://huggingface.co/{}/resolve/main/{}",
                        s.hf_id, m.file
                    ),
                    filename: target,
                    size_bytes: m.size_bytes,
                    sha256: Some(m.sha256.clone()),
                    quantization: "F16".into(),
                    runtime: s.runtime.clone(),
                    recommended: false,
                    compatibility_note: String::new(),
                }),
            mmproj_installed: s.mmproj.as_ref().zip(s.mmproj_target()).is_some_and(
                |(m, target)| {
                    std::fs::metadata(models_dir.join(target))
                        .is_ok_and(|f| f.len() == m.size_bytes)
                },
            ),
            license_kind: s.license_kind().to_string(),
            license_url: s
                .license_url
                .clone()
                .unwrap_or_else(|| format!("https://huggingface.co/{}", s.hf_id)),
            license_note: s.license_note.clone(),
            installed: std::fs::metadata(models_dir.join(&s.file))
                .is_ok_and(|m| m.len() == s.size_bytes),
            fits_gpu: s.vram_mb <= usable,
            recommended: i == recommended,
            vram_mb: s.vram_mb,
            file: HfGgufFile {
                size_formatted: format!("{:.1} GB", s.size_bytes as f64 / 1_073_741_824.0),
                download_url: format!("https://huggingface.co/{}/resolve/main/{}", s.hf_id, s.file),
                filename: s.file,
                size_bytes: s.size_bytes,
                sha256: Some(s.sha256),
                quantization: s.quantization,
                runtime: s.runtime,
                recommended: i == recommended,
                compatibility_note: String::new(),
            },
            id: s.id,
            name: s.name,
            license: s.license,
            description: s.description,
        })
        .collect()
}

/// GGUF downloads the user stopped, by file name; the download loop checks it per chunk.
static CANCELLED_DOWNLOADS: std::sync::LazyLock<
    parking_lot::Mutex<std::collections::HashSet<String>>,
> = std::sync::LazyLock::new(Default::default);

/// Stops the running download of `filename`; its partial file is removed.
pub fn cancel_gguf_download(filename: &str) {
    if let Some(name) = std::path::Path::new(filename)
        .file_name()
        .and_then(|n| n.to_str())
    {
        CANCELLED_DOWNLOADS.lock().insert(name.to_string());
    }
}

pub async fn download_gguf_file<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    download_url: &str,
    target_filename: &str,
    expected_size: u64,
    expected_sha256: Option<&str>,
) -> Result<String, String> {
    let url = reqwest::Url::parse(download_url)
        .map_err(|error| crate::err!("backend.common.downloadFailed", error = error))?;
    if url.scheme() != "https" || url.host_str() != Some("huggingface.co") {
        return Err(crate::err!(
            "backend.common.downloadFailed",
            error = "Nur HTTPS-Downloads von huggingface.co sind zulässig"
        ));
    }

    let client = reqwest::Client::new();
    let response = client
        .get(download_url)
        .header("User-Agent", "OtakuSoul-Desktop-Client")
        .send()
        .await
        .map_err(|e| crate::err!("backend.common.downloadFailed", error = e))?;

    if !response.status().is_success() {
        return Err(crate::err!(
            "backend.common.downloadStatus",
            status = response.status()
        ));
    }

    let content_length = response.content_length().unwrap_or(0);
    if expected_size > 0 && content_length > 0 && expected_size != content_length {
        return Err(crate::err!(
            "backend.common.downloadInterrupted",
            error = format!("Erwartet: {expected_size} Bytes, Antwort: {content_length} Bytes")
        ));
    }
    let total_bytes = if expected_size > 0 {
        expected_size
    } else {
        content_length
    };
    if total_bytes == 0 && expected_sha256.is_none() {
        return Err(crate::err!(
            "backend.common.downloadInterrupted",
            error = "Dateigröße und Prüfsumme fehlen"
        ));
    }

    let paths = crate::modules::paths::resolve_app_paths();
    let target_dir = PathBuf::from(&paths.bundled_models_dir);
    std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

    let safe_filename = PathBuf::from(target_filename)
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| crate::err!("backend.models.invalidFilename"))?
        .to_string();
    // A stop from an earlier attempt must not end this one.
    CANCELLED_DOWNLOADS.lock().remove(&safe_filename);
    let dest_path = target_dir.join(&safe_filename);
    if dest_path.exists() {
        return Err(crate::err!(
            "backend.models.activate",
            error = format!("{safe_filename} ist bereits installiert")
        ));
    }
    let partial_path = target_dir.join(format!("{}.{}.part", safe_filename, rand::random::<u64>()));
    let mut file = tokio::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&partial_path)
        .await
        .map_err(|e| crate::err!("backend.common.fileCreate", error = e))?;
    let _partial_cleanup = PartialDownload(partial_path.clone());

    let mut stream = response.bytes_stream();
    let mut hasher = Sha256::new();
    let mut downloaded_bytes = 0u64;
    let start_time = std::time::Instant::now();
    let mut last_emit = std::time::Instant::now();

    while let Some(chunk_res) = stream.next().await {
        if CANCELLED_DOWNLOADS.lock().remove(&safe_filename) {
            return Err(crate::err!("backend.models.downloadCancelled"));
        }
        let chunk =
            chunk_res.map_err(|e| crate::err!("backend.common.downloadInterrupted", error = e))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;

        hasher.update(&chunk);
        downloaded_bytes += chunk.len() as u64;
        if total_bytes > 0 && downloaded_bytes > total_bytes {
            return Err(crate::err!(
                "backend.common.downloadInterrupted",
                error = format!("Datei ist größer als die erwarteten {total_bytes} Bytes")
            ));
        }

        if last_emit.elapsed() >= std::time::Duration::from_millis(400) {
            let elapsed_secs = start_time.elapsed().as_secs_f32().max(0.001);
            let speed_mbps = (downloaded_bytes as f32 / (1024.0 * 1024.0)) / elapsed_secs;
            let percent = if total_bytes > 0 {
                (downloaded_bytes as f32 / total_bytes as f32) * 100.0
            } else {
                0.0
            };
            let eta_seconds = estimate_eta(downloaded_bytes, total_bytes, elapsed_secs);

            let _ = app.emit(
                "model-download-progress",
                DownloadProgressEvent {
                    filename: safe_filename.clone(),
                    downloaded_bytes,
                    total_bytes,
                    percent,
                    speed_mbps,
                    eta_seconds,
                    finished: false,
                    error: None,
                },
            );

            last_emit = std::time::Instant::now();
        }
    }

    file.flush()
        .await
        .map_err(|e| crate::err!("backend.models.finish", error = e))?;
    drop(file);
    let actual_sha256: String = hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    verify_download(
        &safe_filename,
        downloaded_bytes,
        total_bytes,
        expected_sha256,
        &actual_sha256,
    )?;
    // hard_link fails if the destination appeared while downloading, so an existing
    // model is never replaced by a concurrent download.
    tokio::fs::hard_link(&partial_path, &dest_path)
        .await
        .map_err(|e| crate::err!("backend.models.activate", error = e))?;

    let _ = app.emit(
        "model-download-progress",
        DownloadProgressEvent {
            filename: safe_filename,
            downloaded_bytes,
            total_bytes,
            percent: 100.0,
            speed_mbps: 0.0,
            eta_seconds: None,
            finished: true,
            error: None,
        },
    );

    info!("GGUF-Download abgeschlossen: {:?}", dest_path);
    Ok(dest_path.to_string_lossy().to_string())
}

struct PartialDownload(PathBuf);

impl Drop for PartialDownload {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

#[cfg(test)]
mod tests {

    #[test]
    fn starter_recommendation_follows_vram() {
        let catalog = crate::modules::model_catalog::catalog();
        let pick = |vram| {
            catalog.models[recommended_starter(&catalog, vram)]
                .id
                .as_str()
        };
        assert_eq!(pick(0), "gemma-4-e4b", "without a GPU the smallest one");
        assert_eq!(
            pick(4_096),
            "gemma-4-e4b",
            "no tier fits 4 GB, the smallest is offered"
        );
        assert_eq!(pick(8_192), "qwen3.5-9b");
        assert_eq!(pick(10_240), "gemma-4-12b");
        // Bonsai is preferred wherever it fits, even over larger models.
        assert_eq!(pick(12_288), "ternary-bonsai-2-27b");
        assert_eq!(pick(16_384), "ternary-bonsai-2-27b");
        assert_eq!(pick(24_576), "ternary-bonsai-2-27b");
        // Models without an open licence are listed, never picked by themselves.
        assert!(catalog.models.iter().any(|m| m.license_kind() != "open"));
        for vram in [0, 8_192, 12_288, 16_384, 24_576, 49_152] {
            assert_eq!(
                catalog.models[recommended_starter(&catalog, vram)].license_kind(),
                "open"
            );
        }
        for s in &catalog.models {
            assert!(
                s.file.ends_with(&format!("{}.gguf", s.quantization)),
                "{}",
                s.id
            );
            let (runtime, _, _) = classify_gguf(&s.hf_id, &s.file);
            assert_eq!(runtime, s.runtime, "{}", s.id);
        }
    }

    use super::{recommended_starter, verify_download};

    #[test]
    fn rejects_incomplete_or_changed_model_data() {
        let expected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
        assert!(verify_download("model.gguf", 3, 3, Some(expected), expected).is_ok());
        assert!(verify_download("model.gguf", 2, 3, Some(expected), expected).is_err());
        assert!(verify_download("model.gguf", 3, 3, Some(expected), "wrong").is_err());
    }

    #[test]
    fn estimates_remaining_download_time() {
        // 25 of 100 MB in 5 s → 5 MB/s → 15 s left.
        assert_eq!(super::estimate_eta(25, 100, 5.0), Some(15));
        assert_eq!(super::estimate_eta(0, 100, 5.0), None);
        assert_eq!(super::estimate_eta(100, 100, 5.0), None);
        assert_eq!(super::estimate_eta(10, 0, 5.0), None);
    }

    use super::{classify_gguf, extract_quantization};

    #[test]
    fn identifies_bonsai_runtime_and_safe_fallbacks() {
        let prism = classify_gguf(
            "prism-ml/Ternary-Bonsai-27B-gguf",
            "Ternary-Bonsai-27B-PQ2_0.gguf",
        );
        assert_eq!(prism.0, "prism");
        assert!(prism.1);

        let fallback = classify_gguf(
            "prism-ml/Ternary-Bonsai-27B-gguf",
            "Ternary-Bonsai-27B-Q2_g64.gguf",
        );
        assert_eq!(fallback.0, "standard");
        assert!(!fallback.1);

        let legacy = classify_gguf(
            "prism-ml/Ternary-Bonsai-27B-gguf",
            "Ternary-Bonsai-27B-Q2_0.gguf",
        );
        assert_eq!(legacy.0, "legacy");
    }

    #[test]
    fn reports_prism_quantization_before_generic_q2() {
        assert_eq!(extract_quantization("model-PQ2_0.gguf"), "PQ2_0");
        assert_eq!(extract_quantization("model-Q2_g64.gguf"), "Q2_G64");
    }
}
