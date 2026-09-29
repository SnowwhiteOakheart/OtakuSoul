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
