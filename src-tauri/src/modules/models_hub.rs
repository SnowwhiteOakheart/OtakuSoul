use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tauri::Emitter;
use tokio::io::AsyncWriteExt;
use tracing::info;
use ts_rs::TS;

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
}

struct StarterSpec {
    id: &'static str,
    name: &'static str,
    repo: &'static str,
    file: &'static str,
    size: u64,
    sha256: &'static str,
    license: &'static str,
    vram_mb: u64,
}

/// One per VRAM tier; Apache-2.0, ungated, checked against Hugging Face's SHA-256.
const STARTERS: &[StarterSpec] = &[
    StarterSpec {
        id: "qwen3-4b",
        name: "Qwen3 4B Instruct",
        repo: "bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF",
        file: "Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
        size: 2_497_280_736,
        sha256: "2fde00ce69dd4899c70d020845e2638353015bba0fdf161b3eb965f2bca4464e",
        license: "Apache-2.0",
        vram_mb: 4_000,
    },
    StarterSpec {
        id: "qwen3-8b",
        name: "Qwen3 8B",
        repo: "bartowski/Qwen_Qwen3-8B-GGUF",
        file: "Qwen_Qwen3-8B-Q4_K_M.gguf",
        size: 5_027_784_224,
        sha256: "54fffa050078e984116639c83dfb64b5aa6d4cd474e018b076777c632bbccccd",
        license: "Apache-2.0",
        // 4.7 GiB of weights plus ~1 GB for an 8k context: fits an 8 GB card.
        vram_mb: 6_400,
    },
    StarterSpec {
        id: "mistral-nemo-12b",
        name: "Mistral Nemo 12B",
        repo: "bartowski/Mistral-Nemo-Instruct-2407-GGUF",
        file: "Mistral-Nemo-Instruct-2407-Q4_K_M.gguf",
        size: 7_477_208_192,
        sha256: "7c1a10d202d8788dbe5628dc962254d10654c853cae6aaeca0618f05490d4a46",
        license: "Apache-2.0",
        vram_mb: 9_800,
    },
    StarterSpec {
        id: "mistral-small-24b",
        name: "Mistral Small 3.2 24B",
        repo: "bartowski/mistralai_Mistral-Small-3.2-24B-Instruct-2506-GGUF",
        file: "mistralai_Mistral-Small-3.2-24B-Instruct-2506-Q4_K_M.gguf",
        size: 14_333_915_264,
        sha256: "80f5bda68f156f12650ca03a0a2dbfae06a215ac41caa773b8631a479f82415e",
        license: "Apache-2.0",
        vram_mb: 17_500,
    },
];

/// VRAM left for the model after the desktop and the driver take theirs.
const DESKTOP_RESERVE_MB: u64 = 1_536;

/// Index of the recommended starter for `vram_mb` (0 = no GPU): the largest that fits.
fn recommended_starter(vram_mb: u64) -> usize {
    let usable = vram_mb.saturating_sub(DESKTOP_RESERVE_MB);
    STARTERS
        .iter()
        .rposition(|s| s.vram_mb <= usable)
        .unwrap_or(0)
}

/// The starter models with install state and the recommendation for this machine's GPU.
pub fn starter_models() -> Vec<StarterModel> {
    let vram = crate::modules::hardware::probe_hardware()
        .primary_gpu()
        .map_or(0, |g| g.total_vram_mb);
    let recommended = recommended_starter(vram);
    let models_dir = PathBuf::from(crate::modules::paths::resolve_app_paths().bundled_models_dir);
    STARTERS
        .iter()
        .enumerate()
        .map(|(i, s)| StarterModel {
            id: s.id.to_string(),
            name: s.name.to_string(),
            license: s.license.to_string(),
            vram_mb: s.vram_mb,
            recommended: i == recommended,
            fits_gpu: s.vram_mb <= vram.saturating_sub(DESKTOP_RESERVE_MB),
            installed: std::fs::metadata(models_dir.join(s.file)).is_ok_and(|m| m.len() == s.size),
            file: HfGgufFile {
                filename: s.file.to_string(),
                size_bytes: s.size,
                sha256: Some(s.sha256.to_string()),
                size_formatted: format!("{:.1} GB", s.size as f64 / 1_073_741_824.0),
                download_url: format!("https://huggingface.co/{}/resolve/main/{}", s.repo, s.file),
                quantization: "Q4_K_M".to_string(),
                runtime: "standard".to_string(),
                recommended: i == recommended,
                compatibility_note: String::new(),
            },
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
        let pick = |vram| STARTERS[recommended_starter(vram)].id;
        assert_eq!(pick(0), "qwen3-4b", "without a GPU the smallest one");
        assert_eq!(
            pick(4_096),
            "qwen3-4b",
            "no tier fits 4 GB, the smallest is offered"
        );
        assert_eq!(pick(8_192), "qwen3-8b");
        assert_eq!(pick(12_288), "mistral-nemo-12b");
        assert_eq!(pick(16_384), "mistral-nemo-12b");
        assert_eq!(pick(24_576), "mistral-small-24b");
        for s in STARTERS {
            assert_eq!(s.sha256.len(), 64, "{}", s.id);
            assert!(s.file.ends_with("Q4_K_M.gguf"), "{}", s.id);
        }
    }

    use super::{STARTERS, recommended_starter, verify_download};

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
