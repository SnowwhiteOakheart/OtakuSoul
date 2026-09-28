use base64::Engine as _;
use futures_util::StreamExt;
use kokoro_en::{KokoroTts, Voice};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};
use tauri::Emitter;
use tokio::io::AsyncWriteExt;

use crate::modules::paths::resolve_app_paths;
use crate::modules::voice::ScannedVoice;

const MODEL_REPOSITORY: &str = "onnx-community/Kokoro-82M-v1.0-ONNX";
const MODEL_FILENAME: &str = "model_quantized.onnx";
const MODEL_SHA256: &str = "FBAE9257E1E05FFC727E951EF9B9C98418E6D79F1C9B6B13BD59F5C9028A1478";
const SAMPLE_RATE: u32 = 24_000;
const DEFAULT_VOICES: &[&str] = &[
    "af_heart",
    "af_bella",
    "af_nicole",
    "af_sky",
    "am_michael",
    "bf_emma",
    "bf_lily",
    "bm_george",
];

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct KokoroConfig {
    #[serde(default)]
    pub model_path: String,
    #[serde(default)]
    pub voices_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KokoroInstallResult {
    pub model_path: String,
    pub voices_path: String,
    pub installed_voices: Vec<ScannedVoice>,
}

#[derive(Debug, Clone, Serialize)]
pub struct KokoroDownloadProgress {
    pub filename: String,
    pub file_index: usize,
    pub total_files: usize,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub percent: f32,
    pub finished: bool,
}

struct CachedKokoro {
    model_path: PathBuf,
    voices_path: PathBuf,
    engine: Arc<KokoroTts>,
}

static KOKORO_CACHE: OnceLock<tokio::sync::Mutex<Option<CachedKokoro>>> = OnceLock::new();

fn cache() -> &'static tokio::sync::Mutex<Option<CachedKokoro>> {
    KOKORO_CACHE.get_or_init(|| tokio::sync::Mutex::new(None))
}

fn validate_paths(config: &KokoroConfig) -> Result<(PathBuf, PathBuf), String> {
    if config.model_path.trim().is_empty() {
        return Err(
            "Kein Kokoro-Modell konfiguriert. Installiere das Standardpaket oder wähle eine ONNX-Datei."
                .to_string(),
        );
    }
    if config.voices_path.trim().is_empty() {
        return Err(
            "Keine Kokoro-Stimmen konfiguriert. Wähle einen Stimmenordner oder eine .bin-Datei."
                .to_string(),
        );
    }

    let model_path = fs::canonicalize(&config.model_path).map_err(|e| {
        format!(
            "Kokoro-Modell '{}' ist nicht lesbar: {e}",
            config.model_path
        )
    })?;
    if !model_path.is_file()
        || model_path.extension().and_then(|value| value.to_str()) != Some("onnx")
    {
        return Err("Das Kokoro-Modell muss eine vorhandene .onnx-Datei sein.".to_string());
    }

    let voices_path = fs::canonicalize(&config.voices_path).map_err(|e| {
        format!(
            "Kokoro-Stimmenpfad '{}' ist nicht lesbar: {e}",
            config.voices_path
        )
    })?;
    if !voices_path.is_dir()
        && (!voices_path.is_file()
            || voices_path.extension().and_then(|value| value.to_str()) != Some("bin"))
    {
        return Err(
            "Der Kokoro-Stimmenpfad muss ein Ordner mit .bin-Dateien oder eine einzelne .bin-Datei sein."
                .to_string(),
        );
    }

    Ok((model_path, voices_path))
}

async fn load_engine(config: &KokoroConfig) -> Result<Arc<KokoroTts>, String> {
    let (model_path, voices_path) = validate_paths(config)?;
    let mut cached = cache().lock().await;

    if let Some(entry) = cached.as_ref()
        && entry.model_path == model_path
        && entry.voices_path == voices_path
    {
        return Ok(Arc::clone(&entry.engine));
    }

    let engine = KokoroTts::new(&model_path, &voices_path)
        .await
        .map_err(|e| format!("Kokoro konnte nicht geladen werden: {e}"))?;
    let engine = Arc::new(engine);
    *cached = Some(CachedKokoro {
        model_path,
        voices_path,
        engine: Arc::clone(&engine),
    });
    Ok(engine)
}

fn rate_to_speed(rate: &str) -> f32 {
    let percent = rate
        .trim()
        .trim_end_matches('%')
        .parse::<f32>()
        .unwrap_or(0.0);
    (1.0 + percent / 100.0).clamp(0.5, 1.5)
}

fn samples_to_wav(samples: &[f32]) -> Result<Vec<u8>, String> {
    let mut cursor = Cursor::new(Vec::new());
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: SAMPLE_RATE,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    {
        let mut writer = hound::WavWriter::new(&mut cursor, spec)
            .map_err(|e| format!("Kokoro-WAV konnte nicht erstellt werden: {e}"))?;
        for sample in samples {
            let value = (sample.clamp(-1.0, 1.0) * i16::MAX as f32).round() as i16;
            writer
                .write_sample(value)
                .map_err(|e| format!("Kokoro-WAV konnte nicht geschrieben werden: {e}"))?;
        }
        writer
            .finalize()
            .map_err(|e| format!("Kokoro-WAV konnte nicht abgeschlossen werden: {e}"))?;
    }
    Ok(cursor.into_inner())
}

pub async fn synthesize(
    text: &str,
    voice_id: &str,
    rate: &str,
    config: &KokoroConfig,
) -> Result<String, String> {
    if text.trim().is_empty() {
        return Err("Kein Text zum Vorlesen vorhanden.".to_string());
    }
    if voice_id.trim().is_empty() {
        return Err("Keine Kokoro-Stimme ausgewählt.".to_string());
    }

    let engine = load_engine(config).await?;
    let voice = Voice::new(voice_id.trim()).with_speed(rate_to_speed(rate));
    let (samples, duration) = engine
        .synth(text, voice)
        .await
        .map_err(|e| format!("Kokoro-Synthese fehlgeschlagen: {e}"))?;
    if samples.is_empty() {
        return Err("Kokoro hat keine Audiodaten erzeugt.".to_string());
    }

    tracing::info!(
        "Kokoro: {} Zeichen zu {} Samples in {:.2?} synthetisiert.",
        text.len(),
        samples.len(),
        duration
    );
    let wav = samples_to_wav(&samples)?;
    Ok(format!(
        "data:audio/wav;base64,{}",
        base64::prelude::BASE64_STANDARD.encode(wav)
    ))
}

fn voice_metadata(id: &str) -> (&'static str, &'static str) {
    match id.get(..2).unwrap_or_default() {
        "af" => ("en-US", "Female"),
        "am" => ("en-US", "Male"),
        "bf" => ("en-GB", "Female"),
        "bm" => ("en-GB", "Male"),
        "ef" => ("es", "Female"),
        "em" => ("es", "Male"),
        "ff" => ("fr", "Female"),
        "fm" => ("fr", "Male"),
        "hf" => ("hi", "Female"),
        "hm" => ("hi", "Male"),
        "if" => ("it", "Female"),
        "im" => ("it", "Male"),
        "jf" => ("ja", "Female"),
        "jm" => ("ja", "Male"),
        "pf" => ("pt-BR", "Female"),
        "pm" => ("pt-BR", "Male"),
        "zf" => ("zh-CN", "Female"),
        "zm" => ("zh-CN", "Male"),
        _ => ("multi", "Unknown"),
    }
}

fn voice_info(path: &Path) -> Option<ScannedVoice> {
    if path.extension().and_then(|value| value.to_str()) != Some("bin") {
        return None;
    }
    let id = path.file_stem()?.to_str()?.to_string();
    let (locale, gender) = voice_metadata(&id);
    let name = id
        .split_once('_')
        .map(|(_, value)| value)
        .unwrap_or(&id)
        .replace('_', " ");
    let mut chars = name.chars();
    let name = chars
        .next()
        .map(|first| first.to_uppercase().collect::<String>() + chars.as_str())
        .unwrap_or_else(|| id.clone());
    Some(ScannedVoice {
        id,
        name,
        locale: locale.to_string(),
        gender: gender.to_string(),
    })
}

pub fn list_voices(voices_path: &str) -> Result<Vec<ScannedVoice>, String> {
    if voices_path.trim().is_empty() {
        return Ok(Vec::new());
    }
    let path = PathBuf::from(voices_path);
    if path.is_file() {
        return Ok(voice_info(&path).into_iter().collect());
    }
    if !path.is_dir() {
        return Ok(Vec::new());
    }

    let mut voices = fs::read_dir(&path)
        .map_err(|e| format!("Kokoro-Stimmenordner konnte nicht gelesen werden: {e}"))?
        .filter_map(Result::ok)
        .filter_map(|entry| voice_info(&entry.path()))
        .collect::<Vec<_>>();
    voices.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(voices)
}

fn installation_paths() -> (PathBuf, PathBuf) {
    let root = PathBuf::from(resolve_app_paths().data_dir)
        .join("models")
        .join("kokoro");
    (root.join(MODEL_FILENAME), root.join("voices"))
}

pub fn detect_installation() -> Option<KokoroInstallResult> {
    let (model_path, voices_path) = installation_paths();
    if !model_path.is_file() || !voices_path.is_dir() {
        return None;
    }
    let installed_voices = list_voices(&voices_path.to_string_lossy()).ok()?;
    if installed_voices.is_empty() {
        return None;
    }
    Some(KokoroInstallResult {
        model_path: model_path.to_string_lossy().to_string(),
        voices_path: voices_path.to_string_lossy().to_string(),
        installed_voices,
    })
}

async fn file_sha256(path: &Path) -> Result<String, String> {
    use tokio::io::AsyncReadExt;

    let mut file = tokio::fs::File::open(path).await.map_err(|e| {
        format!(
            "Datei '{}' konnte nicht geprüft werden: {e}",
            path.display()
        )
    })?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; 1024 * 1024];
    loop {
        let count = file.read(&mut buffer).await.map_err(|e| {
            format!(
                "Datei '{}' konnte nicht geprüft werden: {e}",
                path.display()
            )
        })?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(upper_hex(&hasher.finalize()))
}

async fn download_file<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    client: &reqwest::Client,
    url: &str,
    target: &Path,
    file_index: usize,
    total_files: usize,
    expected_sha256: Option<&str>,
) -> Result<(), String> {
    if target.is_file() {
        let valid = if let Some(expected) = expected_sha256 {
            file_sha256(target).await? == expected
        } else {
            target
                .metadata()
                .map(|value| value.len() > 1_024)
                .unwrap_or(false)
        };
        if valid {
            return Ok(());
        }
    }

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Kokoro-Download fehlgeschlagen: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "Kokoro-Download für '{}' meldet HTTP {}.",
            target.display(),
            response.status()
        ));
    }

    let filename = target
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("Kokoro-Datei")
        .to_string();
    let total_bytes = response.content_length().unwrap_or(0);
    let part_path = target.with_extension(format!(
        "{}.part",
        target
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("download")
    ));
    let mut file = tokio::fs::File::create(&part_path)
        .await
        .map_err(|e| format!("Kokoro-Zieldatei konnte nicht erstellt werden: {e}"))?;
    let mut stream = response.bytes_stream();
    let mut downloaded_bytes = 0_u64;
    let mut hasher = Sha256::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Kokoro-Download wurde unterbrochen: {e}"))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Kokoro-Download konnte nicht gespeichert werden: {e}"))?;
        hasher.update(&chunk);
        downloaded_bytes += chunk.len() as u64;
        let file_progress = if total_bytes > 0 {
            downloaded_bytes as f32 / total_bytes as f32
        } else {
            0.0
        };
        let percent = ((file_index as f32 + file_progress) / total_files as f32) * 100.0;
        let _ = app.emit(
            "kokoro-download-progress",
            KokoroDownloadProgress {
                filename: filename.clone(),
                file_index: file_index + 1,
                total_files,
                downloaded_bytes,
                total_bytes,
                percent,
                finished: false,
            },
        );
    }
    file.flush()
        .await
        .map_err(|e| format!("Kokoro-Download konnte nicht abgeschlossen werden: {e}"))?;
    drop(file);

    if let Some(expected) = expected_sha256 {
        let actual = upper_hex(&hasher.finalize());
        if actual != expected {
            return Err(format!(
                "Prüfsumme für {filename} stimmt nicht (erwartet {expected}, erhalten {actual})."
            ));
        }
    }

    if target.exists() {
        tokio::fs::remove_file(target)
            .await
            .map_err(|e| format!("Alte Kokoro-Datei konnte nicht ersetzt werden: {e}"))?;
    }
    tokio::fs::rename(&part_path, target)
        .await
        .map_err(|e| format!("Kokoro-Download konnte nicht aktiviert werden: {e}"))?;
    Ok(())
}

pub async fn install<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<KokoroInstallResult, String> {
    let (model_path, voices_path) = installation_paths();
    let root = model_path
        .parent()
        .ok_or_else(|| "Kokoro-Zielverzeichnis ist ungültig.".to_string())?;
    tokio::fs::create_dir_all(root)
        .await
        .map_err(|e| format!("Kokoro-Modellordner konnte nicht erstellt werden: {e}"))?;
    tokio::fs::create_dir_all(&voices_path)
        .await
        .map_err(|e| format!("Kokoro-Stimmenordner konnte nicht erstellt werden: {e}"))?;

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Kokoro-Download-Client konnte nicht erstellt werden: {e}"))?;
    let total_files = DEFAULT_VOICES.len() + 1;
    let model_url = format!(
        "https://huggingface.co/{MODEL_REPOSITORY}/resolve/main/onnx/{MODEL_FILENAME}?download=true"
    );
    download_file(
        app,
        &client,
        &model_url,
        &model_path,
        0,
        total_files,
        Some(MODEL_SHA256),
    )
    .await?;

    for (index, voice) in DEFAULT_VOICES.iter().enumerate() {
        let filename = format!("{voice}.bin");
        let url = format!(
            "https://huggingface.co/{MODEL_REPOSITORY}/resolve/main/voices/{filename}?download=true"
        );
        download_file(
            app,
            &client,
            &url,
            &voices_path.join(&filename),
            index + 1,
            total_files,
            None,
        )
        .await?;
    }

    let _ = app.emit(
        "kokoro-download-progress",
        KokoroDownloadProgress {
            filename: "Kokoro ist installiert".to_string(),
            file_index: total_files,
            total_files,
            downloaded_bytes: 0,
            total_bytes: 0,
            percent: 100.0,
            finished: true,
        },
    );

    detect_installation().ok_or_else(|| {
        "Kokoro wurde heruntergeladen, die Installation konnte aber nicht erkannt werden."
            .to_string()
    })
}

fn upper_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02X}", b)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rate_to_speed() {
        assert_eq!(rate_to_speed("+0%"), 1.0);
        assert_eq!(rate_to_speed("+25%"), 1.25);
        assert_eq!(rate_to_speed("-50%"), 0.5);
        assert_eq!(rate_to_speed("+200%"), 1.5);
    }

    #[test]
    fn test_voice_metadata() {
        assert_eq!(voice_metadata("af_heart"), ("en-US", "Female"));
        assert_eq!(voice_metadata("jm_kumo"), ("ja", "Male"));
        assert_eq!(voice_metadata("zf_xiaoxiao"), ("zh-CN", "Female"));
    }

    #[test]
    fn test_list_voices_from_directory() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let test_dir = std::env::temp_dir().join(format!("otakusoul-kokoro-voices-{}", unique));
        fs::create_dir_all(&test_dir).unwrap();
        fs::write(test_dir.join("af_heart.bin"), [0_u8; 8]).unwrap();
        fs::write(test_dir.join("jm_kumo.bin"), [0_u8; 8]).unwrap();
        fs::write(test_dir.join("ignore.txt"), [0_u8; 8]).unwrap();

        let voices = list_voices(&test_dir.to_string_lossy()).unwrap();
        assert_eq!(voices.len(), 2);
        assert_eq!(voices[0].id, "af_heart");
        assert_eq!(voices[1].id, "jm_kumo");

        let _ = fs::remove_dir_all(test_dir);
    }

    #[test]
    fn test_samples_to_wav() {
        let wav = samples_to_wav(&[0.0, 0.25, -0.25, 1.0]).unwrap();
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
    }

    #[tokio::test]
    #[ignore = "requires downloaded Kokoro ONNX model and voice files"]
    async fn test_live_kokoro_synthesis() {
        let config = KokoroConfig {
            model_path: std::env::var("OTAKUSOUL_KOKORO_TEST_MODEL")
                .expect("OTAKUSOUL_KOKORO_TEST_MODEL is required"),
            voices_path: std::env::var("OTAKUSOUL_KOKORO_TEST_VOICES")
                .expect("OTAKUSOUL_KOKORO_TEST_VOICES is required"),
        };
        let audio = synthesize("Hello from offline Kokoro.", "af_heart", "+0%", &config)
            .await
            .unwrap();
        assert!(audio.starts_with("data:audio/wav;base64,"));
        assert!(audio.len() > 10_000);
    }
}
