use base64::Engine as _;
use std::io::Cursor;

use super::models::{SttConfig, SttEngine, http_client};

pub(super) fn decode_pcm_f32(audio_base64: &str) -> Result<Vec<f32>, String> {
    let bytes = base64::prelude::BASE64_STANDARD
        .decode(audio_base64)
        .map_err(|e| crate::err!("backend.voice.pcmDecode", error = e))?;
    if bytes.is_empty() || bytes.len() % 4 != 0 {
        return Err(crate::err!("backend.voice.pcmFormat"));
    }

    const MAX_SAMPLES: usize = 16_000 * 120;
    if bytes.len() / 4 > MAX_SAMPLES {
        return Err(crate::err!("backend.voice.recordingTooLong"));
    }

    let samples: Vec<f32> = (0..bytes.len())
        .step_by(4)
        .map(|index| {
            f32::from_le_bytes([
                bytes[index],
                bytes[index + 1],
                bytes[index + 2],
                bytes[index + 3],
            ])
        })
        .collect();
    if samples.iter().any(|sample| !sample.is_finite()) {
        return Err(crate::err!("backend.voice.pcmInvalid"));
    }
    Ok(samples)
}

pub(super) fn pcm_to_wav(samples: &[f32]) -> Result<Vec<u8>, String> {
    let mut cursor = Cursor::new(Vec::new());
    {
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: 16_000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::new(&mut cursor, spec)
            .map_err(|e| crate::err!("backend.voice.wavStart", error = e))?;
        for sample in samples {
            let value = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
            writer
                .write_sample(value)
                .map_err(|e| crate::err!("backend.voice.wavWrite", error = e))?;
        }
        writer
            .finalize()
            .map_err(|e| crate::err!("backend.voice.wavFinish", error = e))?;
    }
    Ok(cursor.into_inner())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn transcribe_native_whisper(samples: Vec<f32>, config: SttConfig) -> Result<String, String> {
    use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

    if config.whisper_model_path.trim().is_empty() {
        return Err(crate::err!("backend.voice.whisperNoModel"));
    }
    if !std::path::Path::new(&config.whisper_model_path).is_file() {
        return Err(crate::err!(
            "backend.voice.whisperModelMissing",
            path = config.whisper_model_path
        ));
    }

    let context = WhisperContext::new_with_params(
        &config.whisper_model_path,
        WhisperContextParameters::default(),
    )
    .map_err(|e| crate::err!("backend.voice.whisperModelLoad", error = e))?;
    let mut state = context
        .create_state()
        .map_err(|e| crate::err!("backend.voice.whisperState", error = e))?;
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_print_special(false);
    params.set_translate(false);
    params.set_no_context(true);
    params.set_n_threads(
        std::thread::available_parallelism()
            .map(|count| count.get().min(8) as i32)
            .unwrap_or(4),
    );
    if !config.language.trim().is_empty() && config.language != "auto" {
        params.set_language(Some(config.language.trim()));
    }
    if !config.prompt.trim().is_empty() {
        params.set_initial_prompt(&config.prompt);
    }

    state
        .full(params, &samples)
        .map_err(|e| crate::err!("backend.voice.whisperTranscribe", error = e))?;
    let segment_count = state.full_n_segments();
    let mut transcript = String::new();
    for index in 0..segment_count {
        let segment = state
            .get_segment(index)
            .ok_or_else(|| crate::err!("backend.voice.whisperSegmentMissing", index = index))?;
        let text = segment
            .to_str()
            .map_err(|e| crate::err!("backend.voice.whisperSegmentRead", error = e))?;
        transcript.push_str(text);
    }
    Ok(transcript.trim().to_string())
}

#[cfg(any(target_os = "android", target_os = "ios"))]
fn transcribe_native_whisper(_samples: Vec<f32>, _config: SttConfig) -> Result<String, String> {
    Err(crate::err!("backend.voice.whisperMobile"))
}

async fn transcribe_openai_compatible(
    samples: &[f32],
    config: &SttConfig,
) -> Result<String, String> {
    if config.endpoint.trim().is_empty() {
        return Err(crate::err!("backend.voice.sttNoEndpoint"));
    }
    let wav = pcm_to_wav(samples)?;
    let audio_part = reqwest::multipart::Part::bytes(wav)
        .file_name("recording.wav")
        .mime_str("audio/wav")
        .map_err(|e| crate::err!("backend.voice.sttMime", error = e))?;
    let mut form = reqwest::multipart::Form::new()
        .part("file", audio_part)
        .text("model", config.model.clone());
    if !config.language.trim().is_empty() && config.language != "auto" {
        let language_field = if config.model == "gpt-transcribe" {
            "languages[]"
        } else {
            "language"
        };
        form = form.text(language_field, config.language.clone());
    }
    if !config.prompt.trim().is_empty() {
        form = form.text("prompt", config.prompt.clone());
    }

    let mut request = http_client(120)?.post(&config.endpoint).multipart(form);
    if !config.api_key.trim().is_empty() {
        request = request.bearer_auth(&config.api_key);
    }
    let response = request
        .send()
        .await
        .map_err(|e| crate::err!("backend.voice.sttRequest", error = e))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| crate::err!("backend.voice.sttResponse", error = e))?;
    if !status.is_success() {
        return Err(crate::err!(
            "backend.voice.sttStatus",
            status = status,
            error = body
        ));
    }
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body)
        && let Some(text) = json["text"].as_str()
    {
        return Ok(text.trim().to_string());
    }
    Ok(body.trim().to_string())
}

pub async fn transcribe_speech(audio_base64: &str, config: &SttConfig) -> Result<String, String> {
    let samples = decode_pcm_f32(audio_base64)?;
    if samples.len() < 1_600 {
        return Err(crate::err!("backend.voice.recordingTooShort"));
    }

    match config.engine {
        SttEngine::NativeWhisper => {
            let owned_config = config.clone();
            tokio::task::spawn_blocking(move || transcribe_native_whisper(samples, owned_config))
                .await
                .map_err(|e| crate::err!("backend.voice.whisperWorker", error = e))?
        }
        SttEngine::OpenAi => transcribe_openai_compatible(&samples, config).await,
        SttEngine::Disabled => Err(crate::err!("backend.voice.sttDisabled")),
    }
}
