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
    /// The files of a model split into several parts (`-00001-of-00004.gguf` …), in order;
    /// empty for a single file. `filename` and `download_url` then name the first part and
    /// `size_bytes` is the size of all parts together.
    #[serde(default)]
    pub parts: Vec<HfGgufPart>,
}

/// One file of a split GGUF model.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct HfGgufPart {
    pub filename: String,
    pub size_bytes: u64,
    pub sha256: Option<String>,
    pub download_url: String,
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

    let mut files: Vec<HfGgufFile> = Vec::new();
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
                    parts: Vec::new(),
                });
            }
        }
    }

    let mut files = bundle_split_files(files);
    // Put the repository's recommended pack first, then keep the remaining list stable.
    files.sort_by(|a, b| {
        b.recommended
            .cmp(&a.recommended)
            .then_with(|| a.filename.cmp(&b.filename))
    });
    Ok(files)
}

/// Replaces the parts of each split model with one entry for the whole model. Splits with a
/// missing part are left out, since llama.cpp cannot load them.
fn bundle_split_files(files: Vec<HfGgufFile>) -> Vec<HfGgufFile> {
    use crate::modules::gguf::split_part;
    use std::collections::BTreeMap;

    let mut single = Vec::new();
    let mut splits: BTreeMap<(String, u32), Vec<(u32, HfGgufFile)>> = BTreeMap::new();
    for file in files {
        match split_part(&file.filename) {
            Some((prefix, index, count)) => splits
                .entry((prefix.to_string(), count))
                .or_default()
                .push((index, file)),
            None => single.push(file),
        }
    }
    for ((_, count), mut parts) in splits {
        parts.sort_by_key(|(index, _)| *index);
        parts.dedup_by_key(|(index, _)| *index);
        if parts.len() != count as usize {
            continue;
        }
        let size_bytes = parts.iter().map(|(_, f)| f.size_bytes).sum();
        let part_list = parts
            .iter()
            .map(|(_, f)| HfGgufPart {
                filename: f.filename.clone(),
                size_bytes: f.size_bytes,
                sha256: f.sha256.clone(),
                download_url: f.download_url.clone(),
            })
            .collect();
        let (_, first) = parts.swap_remove(0);
        single.push(HfGgufFile {
            size_bytes,
            size_formatted: format_bytes(size_bytes),
            sha256: None,
            parts: part_list,
            ..first
        });
    }
    single
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
                    parts: Vec::new(),
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
                parts: Vec::new(),
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

/// GGUF downloads in progress, by file name, so the same model never downloads twice at once.
static ACTIVE_DOWNLOADS: std::sync::LazyLock<
    parking_lot::Mutex<std::collections::HashSet<String>>,
> = std::sync::LazyLock::new(Default::default);

/// Marks a download as running while it lives.
struct ActiveDownload(String);

impl ActiveDownload {
    fn claim(name: &str) -> Option<Self> {
        ACTIVE_DOWNLOADS
            .lock()
            .insert(name.to_string())
            .then(|| Self(name.to_string()))
    }
}

impl Drop for ActiveDownload {
    fn drop(&mut self) {
        ACTIVE_DOWNLOADS.lock().remove(&self.0);
    }
}

/// Stops the running download of `filename`; its partial file is removed.
pub fn cancel_gguf_download(filename: &str) {
    if let Some(name) = std::path::Path::new(filename)
        .file_name()
        .and_then(|n| n.to_str())
    {
        CANCELLED_DOWNLOADS.lock().insert(name.to_string());
    }
}

/// Downloads a GGUF model into the models folder and returns the path to load: the file itself,
/// or the first part of a model split into `parts`. All parts are verified before any of them
/// appears in the folder, so a failed download never leaves half a model behind.
pub async fn download_gguf_file<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    download_url: &str,
    target_filename: &str,
    expected_size: u64,
    expected_sha256: Option<&str>,
    parts: &[HfGgufPart],
) -> Result<String, String> {
    let parts = if parts.is_empty() {
        vec![HfGgufPart {
            filename: target_filename.to_string(),
            size_bytes: expected_size,
            sha256: expected_sha256.map(str::to_string),
            download_url: download_url.to_string(),
        }]
    } else {
        parts.to_vec()
    };

    let safe_name = |filename: &str| {
        PathBuf::from(filename)
            .file_name()
            .and_then(|name| name.to_str())
            .map(str::to_string)
            .ok_or_else(|| crate::err!("backend.models.invalidFilename"))
    };
    // Progress and cancelling go by the name of the whole model (its first part).
    let progress_name = safe_name(target_filename)?;
    let Some(_active) = ActiveDownload::claim(&progress_name) else {
        return Err(crate::err!("backend.models.downloadRunning"));
    };
    let paths = crate::modules::paths::resolve_app_paths();
    let target_dir = PathBuf::from(&paths.bundled_models_dir);
    std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

    let mut dest_paths = Vec::with_capacity(parts.len());
    for part in &parts {
        let url = reqwest::Url::parse(&part.download_url)
            .map_err(|error| crate::err!("backend.common.downloadFailed", error = error))?;
        if url.scheme() != "https" || url.host_str() != Some("huggingface.co") {
            return Err(crate::err!(
                "backend.common.downloadFailed",
                error = "Nur HTTPS-Downloads von huggingface.co sind zulässig"
            ));
        }
        let dest_path = target_dir.join(safe_name(&part.filename)?);
        if dest_path.exists() {
            return Err(crate::err!(
                "backend.models.activate",
                error = format!("{} ist bereits installiert", dest_path.display())
            ));
        }
        dest_paths.push(dest_path);
    }

    // A stop from an earlier attempt must not end this one.
    CANCELLED_DOWNLOADS.lock().remove(&progress_name);
    let client = crate::modules::model_files::http_client()?;
    let mut progress = Progress {
        name: progress_name.clone(),
        done_bytes: 0,
        total_bytes: parts.iter().map(|p| p.size_bytes).sum(),
        start: std::time::Instant::now(),
        last_emit: std::time::Instant::now(),
    };
    let emit = |event: DownloadProgressEvent| {
        let _ = app.emit("model-download-progress", event);
    };
    let mut downloaded = Vec::with_capacity(parts.len());
    for (part, dest_path) in parts.iter().zip(&dest_paths) {
        let partial = download_part(&emit, &client, part, dest_path, &mut progress).await?;
        downloaded.push(partial);
    }

    // hard_link fails if the destination appeared while downloading, so an existing
    // model is never replaced by a concurrent download.
    for (i, (partial, dest_path)) in downloaded.iter().zip(&dest_paths).enumerate() {
        if let Err(e) = tokio::fs::hard_link(&partial.0, dest_path).await {
            for linked in &dest_paths[..i] {
                let _ = std::fs::remove_file(linked);
            }
            return Err(crate::err!("backend.models.activate", error = e));
        }
    }

    let _ = app.emit(
        "model-download-progress",
        DownloadProgressEvent {
            filename: progress_name,
            downloaded_bytes: progress.done_bytes,
            total_bytes: progress.total_bytes.max(progress.done_bytes),
            percent: 100.0,
            speed_mbps: 0.0,
            eta_seconds: None,
            finished: true,
            error: None,
        },
    );

    let model_path = &dest_paths[0];
    info!("GGUF-Download abgeschlossen: {:?}", model_path);
    Ok(model_path.to_string_lossy().to_string())
}

/// Progress of a whole model download over all its parts.
struct Progress {
    name: String,
    /// Bytes of the parts already finished.
    done_bytes: u64,
    total_bytes: u64,
    start: std::time::Instant,
    last_emit: std::time::Instant,
}

impl Progress {
    /// Progress with `part_bytes` of the current part on disk, `fresh_bytes` of them loaded in
    /// this run (speed and remaining time leave out what an earlier run left behind).
    fn event(&self, part_bytes: u64, fresh_bytes: u64) -> DownloadProgressEvent {
        let all_bytes = self.done_bytes + part_bytes;
        let fresh = self.done_bytes + fresh_bytes;
        let elapsed_secs = self.start.elapsed().as_secs_f32().max(0.001);
        let percent = if self.total_bytes > 0 {
            (all_bytes as f32 / self.total_bytes as f32) * 100.0
        } else {
            0.0
        };
        let remaining = self.total_bytes.saturating_sub(all_bytes);
        DownloadProgressEvent {
            filename: self.name.clone(),
            downloaded_bytes: all_bytes,
            total_bytes: self.total_bytes,
            percent,
            speed_mbps: (fresh as f32 / (1024.0 * 1024.0)) / elapsed_secs,
            eta_seconds: estimate_eta(fresh, fresh + remaining, elapsed_secs),
            finished: false,
            error: None,
        }
    }
}

/// Downloads a large part over several connections into `<file>.part` (see
/// [`segmented_download`]). A dropped connection keeps the ranges for the next attempt, a cancel
/// removes them. `Ok(None)` when the server ignores ranges.
async fn download_part_segmented(
    emit: &(impl Fn(DownloadProgressEvent) + Sync),
    client: &reqwest::Client,
    part: &HfGgufPart,
    dest_path: &std::path::Path,
    progress: &mut Progress,
) -> Result<Option<PartialDownload>, String> {
    use crate::modules::segmented_download::{self, Outcome, SegmentError};
    let file_name = dest_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_string();
    let partial_path = dest_path.with_file_name(format!("{file_name}.part"));
    let earlier = segmented_download::partial_bytes(&partial_path).min(part.size_bytes);
    let outcome = {
        let progress = &*progress;
        segmented_download::download(
            client,
            &part.download_url,
            &partial_path,
            part.size_bytes,
            &|| CANCELLED_DOWNLOADS.lock().contains(&progress.name),
            &|bytes| emit(progress.event(bytes, bytes.saturating_sub(earlier))),
        )
        .await
    };
    let sha256 = match outcome {
        Ok(Outcome::Done { sha256 }) => sha256,
        Ok(Outcome::NoRanges) => return Ok(None),
        Err(SegmentError::Cancelled) => {
            CANCELLED_DOWNLOADS.lock().remove(&progress.name);
            segmented_download::remove_partial(&partial_path);
            return Err(crate::err!("backend.models.downloadCancelled"));
        }
        Err(SegmentError::Status(status)) => {
            return Err(crate::err!(
                "backend.common.downloadStatus",
                status = status
            ));
        }
        Err(SegmentError::Interrupted(error)) => {
            return Err(crate::err!(
                "backend.common.downloadInterrupted",
                error = error
            ));
        }
        Err(SegmentError::Io(error)) => {
            return Err(crate::err!("backend.common.fileWrite", error = error));
        }
    };
    // From here the guard removes the file if anything still goes wrong.
    let partial = PartialDownload(partial_path);
    verify_download(
        &file_name,
        part.size_bytes,
        part.size_bytes,
        part.sha256.as_deref(),
        &sha256,
    )?;
    progress.done_bytes += part.size_bytes;
    Ok(Some(partial))
}

/// Asks for the rest of `part` from byte `from` after a dropped connection, waiting a little
/// longer each time; gives up after [`MAX_RESUMES`] attempts in a row or on a cancel.
async fn resume_part(
    client: &reqwest::Client,
    part: &HfGgufPart,
    from: u64,
    resumes: &mut u32,
    name: &str,
    mut error: String,
) -> Result<reqwest::Response, String> {
    use crate::modules::model_files::{MAX_RESUMES, resume_delay};
    loop {
        *resumes += 1;
        if *resumes > MAX_RESUMES {
            return Err(crate::err!(
                "backend.common.downloadInterrupted",
                error = error
            ));
        }
        tracing::warn!(
            "Download von {name} unterbrochen ({error}), setze bei {from} Bytes fort (Versuch {resumes})"
        );
        tokio::time::sleep(resume_delay(*resumes)).await;
        if CANCELLED_DOWNLOADS.lock().remove(name) {
            return Err(crate::err!("backend.models.downloadCancelled"));
        }
        match client
            .get(&part.download_url)
            .header("User-Agent", "OtakuSoul-Desktop-Client")
            .header(reqwest::header::RANGE, format!("bytes={from}-"))
            .send()
            .await
        {
            Ok(response) if response.status() == reqwest::StatusCode::PARTIAL_CONTENT => {
                return Ok(response);
            }
            // Without range support a resume cannot work; trying again would not help.
            Ok(response) if response.status().is_success() => {
                return Err(crate::err!(
                    "backend.common.downloadInterrupted",
                    error = error
                ));
            }
            Ok(response) => error = format!("HTTP {}", response.status()),
            Err(e) => error = e.to_string(),
        }
    }
}

/// Downloads and verifies one file into a partial file next to `dest_path`; the returned guard
/// removes it again once the caller has linked it into place (or given up). A dropped
/// connection resumes where it stopped.
async fn download_part(
    emit: &(impl Fn(DownloadProgressEvent) + Sync),
    client: &reqwest::Client,
    part: &HfGgufPart,
    dest_path: &std::path::Path,
    progress: &mut Progress,
) -> Result<PartialDownload, String> {
    // Hugging Face limits each connection; large parts come over several at once.
    if part.size_bytes >= crate::modules::segmented_download::min_size()
        && let Some(partial) =
            download_part_segmented(emit, client, part, dest_path, progress).await?
    {
        return Ok(partial);
    }
    let response = client
        .get(&part.download_url)
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

    let expected_size = part.size_bytes;
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
    if total_bytes == 0 && part.sha256.is_none() {
        return Err(crate::err!(
            "backend.common.downloadInterrupted",
            error = "Dateigröße und Prüfsumme fehlen"
        ));
    }
    if expected_size == 0 {
        progress.total_bytes += total_bytes;
    }

    let file_name = dest_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default();
    let partial_path =
        dest_path.with_file_name(format!("{file_name}.{}.part", rand::random::<u64>()));
    let mut file = tokio::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&partial_path)
        .await
        .map_err(|e| crate::err!("backend.common.fileCreate", error = e))?;
    let partial = PartialDownload(partial_path);

    let mut response = response;
    let mut hasher = Sha256::new();
    let mut downloaded_bytes = 0u64;
    let mut resumes = 0u32;
    let mut resumed_at = 0u64;

    loop {
        let mut stream = response.bytes_stream();
        let mut interrupted = None;
        while let Some(chunk_res) = stream.next().await {
            if CANCELLED_DOWNLOADS.lock().remove(&progress.name) {
                return Err(crate::err!("backend.models.downloadCancelled"));
            }
            let chunk = match chunk_res {
                Ok(chunk) => chunk,
                Err(e) => {
                    interrupted = Some(e.to_string());
                    break;
                }
            };
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

            if progress.last_emit.elapsed() >= std::time::Duration::from_millis(400) {
                emit(progress.event(downloaded_bytes, downloaded_bytes));
                progress.last_emit = std::time::Instant::now();
            }
        }
        // A connection that ends early counts as dropped, too.
        let error = match interrupted {
            Some(error) => error,
            None if total_bytes > 0 && downloaded_bytes < total_bytes => {
                format!("Verbindung nach {downloaded_bytes} von {total_bytes} Bytes beendet")
            }
            None => break,
        };
        // Progress since the last resume starts the count of attempts in a row again.
        if downloaded_bytes > resumed_at {
            resumes = 0;
        }
        resumed_at = downloaded_bytes;
        response = resume_part(
            client,
            part,
            downloaded_bytes,
            &mut resumes,
            &progress.name,
            error,
        )
        .await?;
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
        file_name,
        downloaded_bytes,
        total_bytes,
        part.sha256.as_deref(),
        &actual_sha256,
    )?;
    progress.done_bytes += downloaded_bytes;
    Ok(partial)
}

struct PartialDownload(PathBuf);

impl Drop for PartialDownload {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

#[cfg(test)]
mod tests {

    #[tokio::test(flavor = "multi_thread")]
    async fn a_dropped_connection_resumes_where_it_stopped() {
        // 4 MiB in 12 pieces: more drops than attempts in a row are allowed.
        let data = crate::modules::model_files::noise(4 << 20);
        let url = crate::modules::model_files::serve_flaky(data, 350 * 1024).await;
        let dir = std::env::temp_dir().join(format!("otakusoul-gguf-flaky-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let sha: String = <super::Sha256 as super::Digest>::digest(data)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        let part = super::HfGgufPart {
            filename: "flaky.gguf".into(),
            size_bytes: data.len() as u64,
            sha256: Some(sha),
            download_url: url,
        };
        let mut progress = super::Progress {
            name: "flaky.gguf".into(),
            done_bytes: 0,
            total_bytes: data.len() as u64,
            start: std::time::Instant::now(),
            last_emit: std::time::Instant::now(),
        };
        let partial = super::download_part(
            &|_| {},
            &reqwest::Client::new(),
            &part,
            &dir.join("flaky.gguf"),
            &mut progress,
        )
        .await
        .unwrap();
        assert_eq!(std::fs::read(&partial.0).unwrap(), data);
        drop(partial);
        let _ = std::fs::remove_dir_all(dir);
    }

    fn test_part(data: &[u8], url: String, name: &str) -> (super::HfGgufPart, super::Progress) {
        let sha: String = <super::Sha256 as super::Digest>::digest(data)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        (
            super::HfGgufPart {
                filename: name.into(),
                size_bytes: data.len() as u64,
                sha256: Some(sha),
                download_url: url,
            },
            super::Progress {
                name: name.into(),
                done_bytes: 0,
                total_bytes: data.len() as u64,
                start: std::time::Instant::now(),
                last_emit: std::time::Instant::now(),
            },
        )
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_small_part_resumes_over_one_connection() {
        // Below the size for parallel ranges: the single stream resumes by itself.
        let data = crate::modules::model_files::noise(40 * 1024);
        let url = crate::modules::model_files::serve_flaky(data, 10 * 1024).await;
        let dir = std::env::temp_dir().join(format!("otakusoul-gguf-small-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let (part, mut progress) = test_part(data, url, "small.gguf");
        let partial = super::download_part(
            &|_| {},
            &reqwest::Client::new(),
            &part,
            &dir.join("small.gguf"),
            &mut progress,
        )
        .await
        .unwrap();
        assert_eq!(std::fs::read(&partial.0).unwrap(), data);
        drop(partial);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn cancelling_a_gguf_download_leaves_nothing_behind() {
        let data = crate::modules::model_files::noise(2 << 20);
        let url = crate::modules::model_files::serve_flaky(data, 64 * 1024).await;
        let dir =
            std::env::temp_dir().join(format!("otakusoul-gguf-cancel-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let (part, mut progress) = test_part(data, url, "cancel-test.gguf");
        super::cancel_gguf_download("cancel-test.gguf");
        let result = super::download_part(
            &|_| {},
            &reqwest::Client::new(),
            &part,
            &dir.join("cancel-test.gguf"),
            &mut progress,
        )
        .await;
        assert!(result.is_err_and(|e| e.contains("backend.models.downloadCancelled")));
        assert_eq!(
            std::fs::read_dir(&dir).unwrap().count(),
            0,
            "no partial or range files"
        );
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn a_running_download_cannot_start_twice() {
        let first = super::ActiveDownload::claim("double-start-test.gguf").unwrap();
        assert!(super::ActiveDownload::claim("double-start-test.gguf").is_none());
        drop(first);
        assert!(super::ActiveDownload::claim("double-start-test.gguf").is_some());
    }

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
        // No model is preferred any more: the largest that fits.
        assert_eq!(pick(12_288), "ternary-bonsai-2-27b");
        assert_eq!(pick(16_384), "gemma-4-26b-a4b");
        assert_eq!(pick(24_576), "gemma-4-31b");
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

    #[test]
    fn bundles_the_parts_of_split_models() {
        let file = |name: &str, size: u64| super::HfGgufFile {
            filename: name.into(),
            size_bytes: size,
            sha256: Some(format!("sha-{name}")),
            size_formatted: String::new(),
            download_url: format!("https://huggingface.co/x/resolve/main/{name}"),
            quantization: "Q4_K_M".into(),
            runtime: "standard".into(),
            recommended: false,
            compatibility_note: String::new(),
            parts: Vec::new(),
        };
        let files = super::bundle_split_files(vec![
            file("Q4_K_M/m-Q4_K_M-00002-of-00002.gguf", 20),
            file("small-Q4_K_M.gguf", 5),
            file("Q4_K_M/m-Q4_K_M-00001-of-00002.gguf", 10),
            // Incomplete: part 2 of 3 is missing.
            file("Q8_0/m-Q8_0-00001-of-00003.gguf", 1),
            file("Q8_0/m-Q8_0-00003-of-00003.gguf", 1),
        ]);
        assert_eq!(files.len(), 2);
        assert!(files[0].parts.is_empty());
        let split = &files[1];
        assert_eq!(split.filename, "Q4_K_M/m-Q4_K_M-00001-of-00002.gguf");
        assert_eq!(split.size_bytes, 30);
        assert_eq!(split.sha256, None);
        let names: Vec<_> = split.parts.iter().map(|p| p.filename.as_str()).collect();
        assert_eq!(
            names,
            [
                "Q4_K_M/m-Q4_K_M-00001-of-00002.gguf",
                "Q4_K_M/m-Q4_K_M-00002-of-00002.gguf"
            ]
        );
        assert_eq!(
            split.parts[1].sha256.as_deref(),
            Some("sha-Q4_K_M/m-Q4_K_M-00002-of-00002.gguf")
        );
    }
}
