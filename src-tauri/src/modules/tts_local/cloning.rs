use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::catalog::{TtsModel, voices_dir};

/// Cloned voices need a clean sample of a few seconds; longer ones only slow synthesis down.
const MIN_SAMPLE_SECS: f32 = 3.0;
const MAX_SAMPLE_SECS: f32 = 30.0;

/// Sample rate of stored voice references (required by Qwen3-TTS).
pub const REFERENCE_RATE: u32 = 24_000;

/// A voice cloned from the user's own recording (`voices/<id>.wav|.txt|.json`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ClonedVoice {
    pub id: String,
    pub name: String,
    /// Language the reference is spoken in.
    pub language: String,
    /// Transcript of the reference recording.
    pub ref_text: String,
    /// The consent statement the user confirmed; sent with every synthesis request.
    pub consent_statement: String,
    pub duration_secs: f32,
    pub created_at: String,
}

pub fn list_cloned_voices() -> Vec<ClonedVoice> {
    let Ok(entries) = std::fs::read_dir(voices_dir()) else {
        return Vec::new();
    };
    let mut voices: Vec<ClonedVoice> = entries
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x == "json"))
        .filter_map(|e| serde_json::from_str(&std::fs::read_to_string(e.path()).ok()?).ok())
        .filter(|v: &ClonedVoice| voices_dir().join(format!("{}.wav", v.id)).is_file())
        .collect();
    voices.sort_by_key(|v| v.name.to_lowercase());
    voices
}

pub(super) fn slug(name: &str) -> String {
    let base: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|p| !p.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    let base = if base.is_empty() {
        "voice".to_string()
    } else {
        base
    };
    format!("{base}-{:x}", chrono::Utc::now().timestamp_millis())
}

/// Stores a cloned voice from mono f32 PCM samples. `consent` must be confirmed.
pub fn create_cloned_voice(
    name: &str,
    samples: &[f32],
    sample_rate: u32,
    ref_text: &str,
    language: &str,
    consent: bool,
) -> Result<ClonedVoice, String> {
    if !consent {
        return Err(crate::err!("backend.tts.consentRequired"));
    }
    let name = name.trim();
    if name.is_empty() {
        return Err(crate::err!("backend.tts.voiceNameRequired"));
    }
    if ref_text.trim().is_empty() {
        return Err(crate::err!("backend.tts.refTextRequired"));
    }
    if !(8_000..=48_000).contains(&sample_rate) {
        return Err(crate::err!("backend.tts.sampleInvalid"));
    }
    let duration = samples.len() as f32 / sample_rate as f32;
    if !(MIN_SAMPLE_SECS..=MAX_SAMPLE_SECS).contains(&duration) {
        return Err(crate::err!(
            "backend.tts.sampleLength",
            seconds = format!("{duration:.1}"),
            min = MIN_SAMPLE_SECS,
            max = MAX_SAMPLE_SECS
        ));
    }

    let dir = voices_dir();
    std::fs::create_dir_all(&dir)
        .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    let id = slug(name);
    // Qwen3-TTS rejects references that are not 24 kHz.
    let samples = resample_linear(samples, sample_rate, REFERENCE_RATE);
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: REFERENCE_RATE,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer = hound::WavWriter::create(dir.join(format!("{id}.wav")), spec)
        .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    for s in &samples {
        writer
            .write_sample((s.clamp(-1.0, 1.0) * f32::from(i16::MAX)) as i16)
            .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    }
    writer
        .finalize()
        .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;

    let voice = ClonedVoice {
        id: id.clone(),
        name: name.to_string(),
        language: language.to_string(),
        ref_text: ref_text.trim().to_string(),
        consent_statement: format!(
            "OtakuSoul user confirmed on {}: I am this speaker or have their consent to clone this voice.",
            chrono::Utc::now().to_rfc3339()
        ),
        duration_secs: duration,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    // crispasr reads `<name>.txt` next to a `.wav` reference as its transcript.
    std::fs::write(dir.join(format!("{id}.txt")), &voice.ref_text)
        .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    let json = serde_json::to_string_pretty(&voice)
        .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    std::fs::write(dir.join(format!("{id}.json")), json)
        .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    tracing::info!("Stimme {} ({:.1}s) gespeichert", voice.id, duration);
    Ok(voice)
}

/// The name a cloned voice is sent under. Chatterbox clones natively only from the file itself
/// (24 kHz WAV): with the bare name the server finds the voice but the backend loads nothing
/// ("native WAV cloning failed", CrispASR 0.8.43); the other backends take the bare name.
pub(super) fn clone_voice_name(model: &TtsModel, id: &str) -> String {
    if model.backend.starts_with("chatterbox") {
        format!("{id}.wav")
    } else {
        id.to_string()
    }
}

pub(super) fn resample_linear(input: &[f32], from: u32, to: u32) -> Vec<f32> {
    if from == to || input.is_empty() {
        return input.to_vec();
    }
    let ratio = f64::from(from) / f64::from(to);
    let len = ((input.len() as f64) / ratio).round().max(1.0) as usize;
    (0..len)
        .map(|i| {
            let pos = i as f64 * ratio;
            let left = (pos as usize).min(input.len() - 1);
            let right = (left + 1).min(input.len() - 1);
            let frac = (pos - left as f64) as f32;
            input[left] * (1.0 - frac) + input[right] * frac
        })
        .collect()
}

pub fn delete_cloned_voice(id: &str) -> Result<(), String> {
    // Only ids we created: no path separators.
    if id.is_empty() || id.contains(['/', '\\', '.']) {
        return Err(crate::err!("backend.tts.unknownVoice", voice = id));
    }
    for ext in ["wav", "txt", "json"] {
        let _ = std::fs::remove_file(voices_dir().join(format!("{id}.{ext}")));
    }
    Ok(())
}
