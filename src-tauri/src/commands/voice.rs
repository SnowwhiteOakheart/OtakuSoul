//! Text-to-speech, speech recognition and per-character voice settings.

#[tauri::command]
pub async fn list_available_voices(
    engine: String,
    elevenlabs_api_key: String,
    kokoro_voices_path: String,
) -> Result<Vec<crate::modules::voice::ScannedVoice>, String> {
    crate::modules::voice::list_available_voices(&engine, &elevenlabs_api_key, &kokoro_voices_path)
        .await
}

#[tauri::command]
pub fn get_kokoro_installation() -> Option<crate::modules::kokoro::KokoroInstallResult> {
    crate::modules::kokoro::detect_installation()
}

#[tauri::command]
pub async fn install_kokoro_model(
    app: tauri::AppHandle,
) -> Result<crate::modules::kokoro::KokoroInstallResult, String> {
    crate::modules::kokoro::install(&app).await
}

#[tauri::command]
pub async fn synthesize_speech(
    text: String,
    config: crate::modules::voice::VoiceConfig,
) -> Result<String, String> {
    crate::modules::voice::synthesize_speech(&text, &config).await
}

#[tauri::command]
pub fn list_tts_models() -> Vec<crate::modules::tts_local::TtsModelInfo> {
    crate::modules::tts_local::list_models()
}

#[tauri::command]
pub async fn download_tts_model(app: tauri::AppHandle, model_id: String) -> Result<(), String> {
    crate::modules::tts_local::download_model(&app, &model_id).await
}

#[tauri::command]
pub fn cancel_tts_model_download() {
    crate::modules::tts_local::cancel_download();
}

#[tauri::command]
pub async fn delete_tts_model(model_id: String) -> Result<(), String> {
    crate::modules::tts_local::delete_model(&model_id).await
}

#[tauri::command]
pub fn get_tts_local_settings() -> crate::modules::tts_local::TtsLocalSettings {
    crate::modules::tts_local::load_settings()
}

#[tauri::command]
pub async fn save_tts_local_settings(
    settings: crate::modules::tts_local::TtsLocalSettings,
) -> Result<(), String> {
    crate::modules::tts_local::save_settings(&settings)?;
    // The spoken disclaimer is a server flag; the next synthesis restarts it as needed.
    Ok(())
}

#[tauri::command]
pub fn list_cloned_voices() -> Vec<crate::modules::tts_local::ClonedVoice> {
    crate::modules::tts_local::list_cloned_voices()
}

/// Stores a cloned voice from base64-encoded little-endian f32 mono samples.
#[tauri::command]
pub fn create_cloned_voice(
    name: String,
    samples_base64: String,
    sample_rate: u32,
    ref_text: String,
    language: String,
    consent: bool,
) -> Result<crate::modules::tts_local::ClonedVoice, String> {
    let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, samples_base64)
        .map_err(|e| crate::err!("backend.voice.pcmDecode", error = e))?;
    if bytes.len() % 4 != 0 {
        return Err(crate::err!("backend.voice.pcmFormat"));
    }
    let samples: Vec<f32> = bytes
        .as_chunks::<4>()
        .0
        .iter()
        .map(|c| f32::from_le_bytes(*c))
        .collect();
    crate::modules::tts_local::create_cloned_voice(
        &name,
        &samples,
        sample_rate,
        &ref_text,
        &language,
        consent,
    )
}

#[tauri::command]
pub fn delete_cloned_voice(voice_id: String) -> Result<(), String> {
    crate::modules::tts_local::delete_cloned_voice(&voice_id)
}

#[tauri::command]
pub async fn transcribe_speech(
    audio_base64: String,
    config: crate::modules::voice::SttConfig,
) -> Result<String, String> {
    crate::modules::voice::transcribe_speech(&audio_base64, &config).await
}

#[tauri::command]
pub fn get_character_voice_config(char_id: String) -> crate::modules::voice::VoiceConfig {
    crate::modules::voice::load_character_voice_config(&char_id)
}

#[tauri::command]
pub fn save_character_voice_config(
    char_id: String,
    config: crate::modules::voice::VoiceConfig,
) -> Result<(), String> {
    crate::modules::voice::save_character_voice_config(&char_id, &config)
}
