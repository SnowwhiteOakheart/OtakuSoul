use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Emitter;
use tokio::io::AsyncWriteExt;
use tracing::info;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HfModelSummary {
    pub id: String,
    pub author: String,
    pub downloads: u64,
    pub likes: u64,
    pub pipeline_tag: Option<String>,
    pub last_modified: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HfGgufFile {
    pub filename: String,
    pub size_bytes: u64,
    pub size_formatted: String,
    pub download_url: String,
    pub quantization: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgressEvent {
    pub filename: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub percent: f32,
    pub speed_mbps: f32,
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

fn extract_quantization(filename: &str) -> String {
    let lower = filename.to_uppercase();
    let quants = [
        "Q4_K_M", "Q4_K_S", "Q4_0", "Q4_1",
        "Q5_K_M", "Q5_K_S", "Q5_0", "Q5_1",
        "Q8_0", "Q6_K", "Q3_K_M", "Q3_K_S",
        "Q2_K", "IQ4_XS", "IQ4_NL", "IQ3_M",
        "BF16", "F16",
    ];

    for q in quants {
        if lower.contains(q) {
            return q.to_string();
        }
    }
    "GGUF".to_string()
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
        .map_err(|e| format!("Fehler bei HuggingFace-Suche: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("HuggingFace API-Fehler ({})", res.status()));
    }

    let val: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("Fehler beim Parsen der HF-Antwort: {}", e))?;

    let mut models = Vec::new();
    if let Some(arr) = val.as_array() {
        for m in arr {
            if let Some(id) = m.get("id").and_then(|s| s.as_str()) {
                let author = m.get("author").and_then(|s| s.as_str()).unwrap_or("HuggingFace").to_string();
                let downloads = m.get("downloads").and_then(|d| d.as_u64()).unwrap_or(0);
                let likes = m.get("likes").and_then(|l| l.as_u64()).unwrap_or(0);
                let pipeline_tag = m.get("pipeline_tag").and_then(|p| p.as_str()).map(|s| s.to_string());
                let last_modified = m.get("lastModified").and_then(|lm| lm.as_str()).map(|s| s.to_string());

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
    let url = format!("https://huggingface.co/api/models/{}", model_id);

    let res = client
        .get(&url)
        .header("User-Agent", "OtakuSoul-Desktop-Client")
        .send()
        .await
        .map_err(|e| format!("Fehler beim Abrufen der Modelldateien: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Modelldateien nicht gefunden ({})", res.status()));
    }

    let val: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("Fehler beim Parsen der Modell-Metadaten: {}", e))?;

    let mut files = Vec::new();
    if let Some(siblings) = val.get("siblings").and_then(|s| s.as_array()) {
        for s in siblings {
            if let Some(rfilename) = s.get("rfilename").and_then(|f| f.as_str()) {
                if rfilename.ends_with(".gguf") {
                    let download_url = format!(
                        "https://huggingface.co/{}/resolve/main/{}",
                        model_id, rfilename
                    );
                    let size_bytes = s.get("size").and_then(|sz| sz.as_u64()).unwrap_or(0);
                    let size_formatted = format_bytes(size_bytes);
                    let quantization = extract_quantization(rfilename);

                    files.push(HfGgufFile {
                        filename: rfilename.to_string(),
                        size_bytes,
                        size_formatted,
                        download_url,
                        quantization,
                    });
                }
            }
        }
    }

    // Sort by quantization quality (Q4, Q5, Q8, etc.)
    files.sort_by(|a, b| a.filename.cmp(&b.filename));
    Ok(files)
}

pub async fn download_gguf_file<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    download_url: &str,
    target_filename: &str,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let response = client
        .get(download_url)
        .header("User-Agent", "OtakuSoul-Desktop-Client")
        .send()
        .await
        .map_err(|e| format!("Download-Verbindungsfehler: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download fehlgeschlagen ({})", response.status()));
    }

    let total_bytes = response.content_length().unwrap_or(0);

    let paths = crate::modules::paths::resolve_app_paths();
    let target_dir = PathBuf::from(&paths.bundled_models_dir);
    std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

    let dest_path = target_dir.join(target_filename);
    let mut file = tokio::fs::File::create(&dest_path)
        .await
        .map_err(|e| format!("Fehler beim Erstellen der Zieldatei: {}", e))?;

    let mut stream = response.bytes_stream();
    let mut downloaded_bytes = 0u64;
    let start_time = std::time::Instant::now();
    let mut last_emit = std::time::Instant::now();

    while let Some(chunk_res) = stream.next().await {
        let chunk = chunk_res.map_err(|e| format!("Fehler beim Empfangen des Datenstroms: {}", e))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Schreibfehler: {}", e))?;

        downloaded_bytes += chunk.len() as u64;

        if last_emit.elapsed() >= std::time::Duration::from_millis(400) {
            let elapsed_secs = start_time.elapsed().as_secs_f32().max(0.001);
            let speed_mbps = (downloaded_bytes as f32 / (1024.0 * 1024.0)) / elapsed_secs;
            let percent = if total_bytes > 0 {
                (downloaded_bytes as f32 / total_bytes as f32) * 100.0
            } else {
                0.0
            };

            let _ = app.emit(
                "model-download-progress",
                DownloadProgressEvent {
                    filename: target_filename.to_string(),
                    downloaded_bytes,
                    total_bytes,
                    percent,
                    speed_mbps,
                },
            );

            last_emit = std::time::Instant::now();
        }
    }

    let _ = app.emit(
        "model-download-progress",
        DownloadProgressEvent {
            filename: target_filename.to_string(),
            downloaded_bytes,
            total_bytes,
            percent: 100.0,
            speed_mbps: 0.0,
        },
    );

    info!("GGUF-Download abgeschlossen: {:?}", dest_path);
    Ok(dest_path.to_string_lossy().to_string())
}
