use base64::Engine as _;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tracing::{info, warn};

use crate::modules::paths::resolve_app_paths;

// ---------------------------------------------------------------------------
// Data Models
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TtsEngine {
    #[serde(rename = "edge")]
    Edge,
    #[serde(rename = "elevenlabs")]
    ElevenLabs,
    #[serde(rename = "openai")]
    OpenAi,
    #[serde(rename = "disabled")]
    Disabled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TtsFilterMode {
    #[serde(rename = "all")]
    All,
    #[serde(rename = "dialogue_only")]
    DialogueOnly,
    #[serde(rename = "strip_actions")]
    StripActions,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceConfig {
    pub engine: TtsEngine,
    pub voice_id: String,
    #[serde(default = "default_rate")]
    pub rate: String,
    #[serde(default = "default_pitch")]
    pub pitch: String,
    #[serde(default = "default_volume")]
    pub volume: String,
    #[serde(default = "default_filter_mode")]
    pub filter_mode: TtsFilterMode,
    #[serde(default)]
    pub custom_regex: String,
    #[serde(default)]
    pub elevenlabs_api_key: String,
    #[serde(default = "default_openai_endpoint")]
    pub openai_endpoint: String,
    #[serde(default)]
    pub openai_api_key: String,
    #[serde(default = "default_openai_model")]
    pub openai_model: String,
}

fn default_rate() -> String { "+0%".to_string() }
fn default_pitch() -> String { "+0Hz".to_string() }
fn default_volume() -> String { "+0%".to_string() }
fn default_filter_mode() -> TtsFilterMode { TtsFilterMode::All }
fn default_openai_endpoint() -> String { "http://localhost:8880/v1/audio/speech".to_string() }
fn default_openai_model() -> String { "tts-1".to_string() }

impl Default for VoiceConfig {
    fn default() -> Self {
        Self {
            engine: TtsEngine::Edge,
            voice_id: "de-DE-KatjaNeural".to_string(),
            rate: default_rate(),
            pitch: default_pitch(),
            volume: default_volume(),
            filter_mode: TtsFilterMode::All,
            custom_regex: String::new(),
            elevenlabs_api_key: String::new(),
            openai_endpoint: default_openai_endpoint(),
            openai_api_key: String::new(),
            openai_model: default_openai_model(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannedVoice {
    pub id: String,
    pub name: String,
    pub locale: String,
    pub gender: String,
}

// ---------------------------------------------------------------------------
// Text Cleaning / Filtering for TTS
// ---------------------------------------------------------------------------

/// Removes markdown, think blocks and filters text based on mode
pub fn clean_text_for_tts(raw: &str, filter_mode: &TtsFilterMode, custom_regex: &str) -> String {
    let mut text = raw.to_string();

    // 1. Remove <think>…</think> blocks (greedy within each match)
    let think_re = regex::Regex::new(r"(?is)<think>.*?</think>").unwrap();
    text = think_re.replace_all(&text, "").to_string();

    // 2. Remove markdown code blocks
    let code_block_re = regex::Regex::new(r"(?s)```.*?```").unwrap();
    text = code_block_re.replace_all(&text, "").to_string();

    // 3. Remove inline code
    let inline_code_re = regex::Regex::new(r"`[^`]+`").unwrap();
    text = inline_code_re.replace_all(&text, "").to_string();

    // 4. Remove URLs
    let url_re = regex::Regex::new(r"https?://\S+").unwrap();
    text = url_re.replace_all(&text, "").to_string();

    // 5. Remove markdown headers, bold, italic markers
    let header_re = regex::Regex::new(r"^#{1,6}\s+").unwrap();
    text = header_re.replace_all(&text, "").to_string();
    text = text.replace("**", "").replace("__", "");

    // 6. Apply filter mode
    text = match filter_mode {
        TtsFilterMode::All => text,
        TtsFilterMode::DialogueOnly => {
            // Extract only text within quotes: "…", „…", »…«, 「…」
            let dialogue_re = regex::Regex::new(
                r#"(?:["„»「]([^""\u{300C}\u{300D}»«]+)[""«」\u{300D}])"#
            ).unwrap();
            let matches: Vec<String> = dialogue_re
                .captures_iter(&text)
                .filter_map(|cap| cap.get(1).map(|m| m.as_str().to_string()))
                .collect();
            if matches.is_empty() {
                text // Fallback: if no dialogue found, use all text
            } else {
                matches.join(" ")
            }
        }
        TtsFilterMode::StripActions => {
            // Remove text within asterisks *action*
            let action_re = regex::Regex::new(r"\*[^*]+\*").unwrap();
            action_re.replace_all(&text, "").to_string()
        }
    };

    // 7. Apply custom regex exclusion if set
    if !custom_regex.is_empty() {
        if let Ok(custom_re) = regex::Regex::new(custom_regex) {
            text = custom_re.replace_all(&text, "").to_string();
        }
    }

    // 8. Collapse whitespace
    let ws_re = regex::Regex::new(r"\s+").unwrap();
    text = ws_re.replace_all(&text, " ").to_string();

    text.trim().to_string()
}

// ---------------------------------------------------------------------------
// Built-in Edge-TTS Voice List
// ---------------------------------------------------------------------------

pub fn list_edge_tts_voices() -> Vec<ScannedVoice> {
    vec![
        // German voices
        ScannedVoice { id: "de-DE-KatjaNeural".into(), name: "Katja".into(), locale: "de-DE".into(), gender: "Female".into() },
        ScannedVoice { id: "de-DE-ConradNeural".into(), name: "Conrad".into(), locale: "de-DE".into(), gender: "Male".into() },
        ScannedVoice { id: "de-DE-AmalaNeural".into(), name: "Amala".into(), locale: "de-DE".into(), gender: "Female".into() },
        ScannedVoice { id: "de-DE-BerndNeural".into(), name: "Bernd".into(), locale: "de-DE".into(), gender: "Male".into() },
        ScannedVoice { id: "de-DE-ChristophNeural".into(), name: "Christoph".into(), locale: "de-DE".into(), gender: "Male".into() },
        ScannedVoice { id: "de-DE-ElkeNeural".into(), name: "Elke".into(), locale: "de-DE".into(), gender: "Female".into() },
        ScannedVoice { id: "de-DE-GiselaNeural".into(), name: "Gisela (Kind)".into(), locale: "de-DE".into(), gender: "Female".into() },
        ScannedVoice { id: "de-DE-KasperNeural".into(), name: "Kasper".into(), locale: "de-DE".into(), gender: "Male".into() },
        ScannedVoice { id: "de-DE-KillianNeural".into(), name: "Killian".into(), locale: "de-DE".into(), gender: "Male".into() },
        ScannedVoice { id: "de-DE-KlarissaNeural".into(), name: "Klarissa".into(), locale: "de-DE".into(), gender: "Female".into() },
        ScannedVoice { id: "de-DE-KlausNeural".into(), name: "Klaus".into(), locale: "de-DE".into(), gender: "Male".into() },
        ScannedVoice { id: "de-DE-LouisaNeural".into(), name: "Louisa".into(), locale: "de-DE".into(), gender: "Female".into() },
        ScannedVoice { id: "de-DE-MajaNeural".into(), name: "Maja".into(), locale: "de-DE".into(), gender: "Female".into() },
        ScannedVoice { id: "de-DE-RalfNeural".into(), name: "Ralf".into(), locale: "de-DE".into(), gender: "Male".into() },
        ScannedVoice { id: "de-DE-TanjaNeural".into(), name: "Tanja".into(), locale: "de-DE".into(), gender: "Female".into() },
        ScannedVoice { id: "de-DE-SeraphinaMultilingualNeural".into(), name: "Seraphina (Multilingual)".into(), locale: "de-DE".into(), gender: "Female".into() },
        ScannedVoice { id: "de-DE-FlorianMultilingualNeural".into(), name: "Florian (Multilingual)".into(), locale: "de-DE".into(), gender: "Male".into() },
        ScannedVoice { id: "de-AT-IngridNeural".into(), name: "Ingrid (AT)".into(), locale: "de-AT".into(), gender: "Female".into() },
        ScannedVoice { id: "de-AT-JonasNeural".into(), name: "Jonas (AT)".into(), locale: "de-AT".into(), gender: "Male".into() },
        // Japanese voices
        ScannedVoice { id: "ja-JP-NanamiNeural".into(), name: "Nanami".into(), locale: "ja-JP".into(), gender: "Female".into() },
        ScannedVoice { id: "ja-JP-KeitaNeural".into(), name: "Keita".into(), locale: "ja-JP".into(), gender: "Male".into() },
        ScannedVoice { id: "ja-JP-AoiNeural".into(), name: "Aoi".into(), locale: "ja-JP".into(), gender: "Female".into() },
        ScannedVoice { id: "ja-JP-DaichiNeural".into(), name: "Daichi".into(), locale: "ja-JP".into(), gender: "Male".into() },
        ScannedVoice { id: "ja-JP-MayuNeural".into(), name: "Mayu".into(), locale: "ja-JP".into(), gender: "Female".into() },
        ScannedVoice { id: "ja-JP-NaokiNeural".into(), name: "Naoki".into(), locale: "ja-JP".into(), gender: "Male".into() },
        ScannedVoice { id: "ja-JP-ShioriNeural".into(), name: "Shiori".into(), locale: "ja-JP".into(), gender: "Female".into() },
        ScannedVoice { id: "ja-JP-MasaruMultilingualNeural".into(), name: "Masaru (Multilingual)".into(), locale: "ja-JP".into(), gender: "Male".into() },
        // English voices
        ScannedVoice { id: "en-US-JennyNeural".into(), name: "Jenny".into(), locale: "en-US".into(), gender: "Female".into() },
        ScannedVoice { id: "en-US-GuyNeural".into(), name: "Guy".into(), locale: "en-US".into(), gender: "Male".into() },
        ScannedVoice { id: "en-US-AriaNeural".into(), name: "Aria".into(), locale: "en-US".into(), gender: "Female".into() },
        ScannedVoice { id: "en-US-DavisNeural".into(), name: "Davis".into(), locale: "en-US".into(), gender: "Male".into() },
        ScannedVoice { id: "en-US-SaraNeural".into(), name: "Sara".into(), locale: "en-US".into(), gender: "Female".into() },
        ScannedVoice { id: "en-US-TonyNeural".into(), name: "Tony".into(), locale: "en-US".into(), gender: "Male".into() },
        ScannedVoice { id: "en-US-NancyNeural".into(), name: "Nancy".into(), locale: "en-US".into(), gender: "Female".into() },
        ScannedVoice { id: "en-US-AvaMultilingualNeural".into(), name: "Ava (Multilingual)".into(), locale: "en-US".into(), gender: "Female".into() },
        ScannedVoice { id: "en-US-AndrewMultilingualNeural".into(), name: "Andrew (Multilingual)".into(), locale: "en-US".into(), gender: "Male".into() },
        ScannedVoice { id: "en-US-EmmaMultilingualNeural".into(), name: "Emma (Multilingual)".into(), locale: "en-US".into(), gender: "Female".into() },
        ScannedVoice { id: "en-US-BrianMultilingualNeural".into(), name: "Brian (Multilingual)".into(), locale: "en-US".into(), gender: "Male".into() },
        ScannedVoice { id: "en-GB-SoniaNeural".into(), name: "Sonia (GB)".into(), locale: "en-GB".into(), gender: "Female".into() },
        ScannedVoice { id: "en-GB-RyanNeural".into(), name: "Ryan (GB)".into(), locale: "en-GB".into(), gender: "Male".into() },
        // Korean voices
        ScannedVoice { id: "ko-KR-SunHiNeural".into(), name: "Sun-Hi".into(), locale: "ko-KR".into(), gender: "Female".into() },
        ScannedVoice { id: "ko-KR-InJoonNeural".into(), name: "InJoon".into(), locale: "ko-KR".into(), gender: "Male".into() },
        // Chinese voices
        ScannedVoice { id: "zh-CN-XiaoxiaoNeural".into(), name: "Xiaoxiao".into(), locale: "zh-CN".into(), gender: "Female".into() },
        ScannedVoice { id: "zh-CN-YunxiNeural".into(), name: "Yunxi".into(), locale: "zh-CN".into(), gender: "Male".into() },
        // French voices
        ScannedVoice { id: "fr-FR-DeniseNeural".into(), name: "Denise".into(), locale: "fr-FR".into(), gender: "Female".into() },
        ScannedVoice { id: "fr-FR-HenriNeural".into(), name: "Henri".into(), locale: "fr-FR".into(), gender: "Male".into() },
        // Spanish voices
        ScannedVoice { id: "es-ES-ElviraNeural".into(), name: "Elvira".into(), locale: "es-ES".into(), gender: "Female".into() },
        ScannedVoice { id: "es-ES-AlvaroNeural".into(), name: "Alvaro".into(), locale: "es-ES".into(), gender: "Male".into() },
    ]
}

/// Returns available voices for a given engine
pub fn list_available_voices(engine: &str) -> Vec<ScannedVoice> {
    match engine {
        "edge" => list_edge_tts_voices(),
        "elevenlabs" => {
            // ElevenLabs voices are fetched via API at runtime by the frontend
            // Return empty for now - the frontend uses the API key to fetch them
            vec![]
        }
        "openai" => {
            // Standard OpenAI voices
            vec![
                ScannedVoice { id: "alloy".into(), name: "Alloy".into(), locale: "multi".into(), gender: "Neutral".into() },
                ScannedVoice { id: "echo".into(), name: "Echo".into(), locale: "multi".into(), gender: "Male".into() },
                ScannedVoice { id: "fable".into(), name: "Fable".into(), locale: "multi".into(), gender: "Male".into() },
                ScannedVoice { id: "onyx".into(), name: "Onyx".into(), locale: "multi".into(), gender: "Male".into() },
                ScannedVoice { id: "nova".into(), name: "Nova".into(), locale: "multi".into(), gender: "Female".into() },
                ScannedVoice { id: "shimmer".into(), name: "Shimmer".into(), locale: "multi".into(), gender: "Female".into() },
            ]
        }
        _ => vec![],
    }
}

// ---------------------------------------------------------------------------
// Edge-TTS Synthesis (Microsoft Speech REST API)
// ---------------------------------------------------------------------------

/// Synthesizes speech using the Edge-TTS (Microsoft Cognitive Services) WebSocket endpoint.
/// Returns base64-encoded MP3 audio as a data URL.
pub async fn synthesize_edge_tts(text: &str, voice_id: &str, rate: &str, pitch: &str, _volume: &str) -> Result<String, String> {
    if text.trim().is_empty() {
        return Err("Kein Text zum Vorlesen vorhanden.".to_string());
    }
    synthesize_edge_tts_websocket(text, voice_id, rate, pitch, _volume).await
}

/// Edge-TTS synthesis via the WebSocket protocol (same as the edge-tts Python library)
async fn synthesize_edge_tts_websocket(text: &str, voice_id: &str, rate: &str, pitch: &str, _volume: &str) -> Result<String, String> {
    // Escape XML special characters
    let escaped_text = text
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;");

    let ssml = format!(
        r#"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='{}'><prosody rate='{}' pitch='{}'>{}</prosody></voice></speak>"#,
        voice_id, rate, pitch, escaped_text
    );

    let connection_id = uuid_v4().replace('-', "");
    let ws_url = format!(
        "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&ConnectionId={}",
        connection_id
    );

    // We use tokio-tungstenite for WebSocket communication
    use futures_util::{SinkExt, StreamExt};
    use tokio_tungstenite::connect_async;
    use tokio_tungstenite::tungstenite::Message;

    let request = tokio_tungstenite::tungstenite::http::Request::builder()
        .uri(&ws_url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0")
        .header("Origin", "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold")
        .header("Sec-WebSocket-Protocol", "")
        .body(())
        .map_err(|e| format!("WebSocket-Anfrage konnte nicht erstellt werden: {}", e))?;

    let (mut ws_stream, _response) = connect_async(request)
        .await
        .map_err(|e| format!("WebSocket-Verbindung fehlgeschlagen: {}", e))?;

    // Send speech config
    let timestamp = chrono::Utc::now().format("%a %b %d %Y %H:%M:%S GMT+0000 (Coordinated Universal Time)");
    let config_msg = format!(
        "X-Timestamp:{}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{{\"context\":{{\"synthesis\":{{\"audio\":{{\"metadataoptions\":{{\"sentenceBoundaryEnabled\":\"false\",\"wordBoundaryEnabled\":\"false\"}},\"outputFormat\":\"audio-24khz-48kbitrate-mono-mp3\"}}}}}}}}",
        timestamp
    );
    ws_stream.send(Message::Text(config_msg.into())).await
        .map_err(|e| format!("Fehler beim Senden der Konfiguration: {}", e))?;

    // Send SSML
    let request_id = uuid_v4().replace('-', "");
    let ssml_msg = format!(
        "X-RequestId:{}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:{}\r\nPath:ssml\r\n\r\n{}",
        request_id, timestamp, ssml
    );
    ws_stream.send(Message::Text(ssml_msg.into())).await
        .map_err(|e| format!("Fehler beim Senden der SSML-Nachricht: {}", e))?;

    // Collect audio data
    let mut audio_data: Vec<u8> = Vec::new();
    let header_marker = b"Path:audio\r\n";

    while let Some(msg) = ws_stream.next().await {
        match msg {
            Ok(Message::Binary(data)) => {
                // Binary messages contain audio data with a header
                // Find the header separator (two bytes for header length + "Path:audio\r\n")
                if data.len() > 2 {
                    let header_len = u16::from_be_bytes([data[0], data[1]]) as usize;
                    if header_len + 2 <= data.len() {
                        let header = &data[2..2 + header_len];
                        if header.windows(header_marker.len()).any(|w| w == header_marker) {
                            audio_data.extend_from_slice(&data[2 + header_len..]);
                        }
                    }
                }
            }
            Ok(Message::Text(txt)) => {
                let txt_str: &str = &txt;
                if txt_str.contains("Path:turn.end") {
                    break;
                }
            }
            Ok(Message::Close(_)) => break,
            Err(e) => {
                warn!("WebSocket-Fehler: {}", e);
                break;
            }
            _ => {}
        }
    }

    let _ = ws_stream.close(None).await;

    if audio_data.is_empty() {
        return Err("Keine Audio-Daten von Edge-TTS empfangen.".to_string());
    }

    info!("Edge-TTS: {} Bytes Audio-Daten empfangen.", audio_data.len());
    let b64 = base64::prelude::BASE64_STANDARD.encode(&audio_data);
    Ok(format!("data:audio/mp3;base64,{}", b64))
}

// ---------------------------------------------------------------------------
// ElevenLabs Synthesis
// ---------------------------------------------------------------------------

pub async fn synthesize_elevenlabs(text: &str, voice_id: &str, api_key: &str) -> Result<String, String> {
    if text.trim().is_empty() {
        return Err("Kein Text zum Vorlesen vorhanden.".to_string());
    }
    if api_key.is_empty() {
        return Err("ElevenLabs API-Key ist nicht konfiguriert.".to_string());
    }

    let url = format!("https://api.elevenlabs.io/v1/text-to-speech/{}", voice_id);
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "text": text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75
        }
    });

    let response = client
        .post(&url)
        .header("xi-api-key", api_key)
        .header("Content-Type", "application/json")
        .header("Accept", "audio/mpeg")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("ElevenLabs-Anfrage fehlgeschlagen: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let err_text = response.text().await.unwrap_or_default();
        return Err(format!("ElevenLabs API-Fehler {}: {}", status, err_text));
    }

    let bytes = response.bytes().await
        .map_err(|e| format!("Fehler beim Empfangen der ElevenLabs-Audio-Daten: {}", e))?;
    let b64 = base64::prelude::BASE64_STANDARD.encode(&bytes);
    Ok(format!("data:audio/mp3;base64,{}", b64))
}

// ---------------------------------------------------------------------------
// OpenAI-compatible TTS Synthesis (works with OpenAI, Kokoro, AllTalk etc.)
// ---------------------------------------------------------------------------

pub async fn synthesize_openai_tts(text: &str, endpoint: &str, api_key: &str, model: &str, voice_id: &str) -> Result<String, String> {
    if text.trim().is_empty() {
        return Err("Kein Text zum Vorlesen vorhanden.".to_string());
    }

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": model,
        "input": text,
        "voice": voice_id,
        "response_format": "mp3"
    });

    let mut req = client
        .post(endpoint)
        .header("Content-Type", "application/json")
        .json(&body);

    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", api_key));
    }

    let response = req.send().await
        .map_err(|e| format!("OpenAI-TTS-Anfrage fehlgeschlagen: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let err_text = response.text().await.unwrap_or_default();
        return Err(format!("OpenAI-TTS API-Fehler {}: {}", status, err_text));
    }

    let bytes = response.bytes().await
        .map_err(|e| format!("Fehler beim Empfangen der OpenAI-TTS-Audio-Daten: {}", e))?;
    let b64 = base64::prelude::BASE64_STANDARD.encode(&bytes);
    Ok(format!("data:audio/mp3;base64,{}", b64))
}

// ---------------------------------------------------------------------------
// Unified Synthesis Dispatcher
// ---------------------------------------------------------------------------

/// Dispatches TTS synthesis based on the VoiceConfig engine
pub async fn synthesize_speech(text: &str, config: &VoiceConfig) -> Result<String, String> {
    let cleaned = clean_text_for_tts(text, &config.filter_mode, &config.custom_regex);
    if cleaned.is_empty() {
        return Err("Nach dem Filtern ist kein vorlesesbarer Text übrig.".to_string());
    }

    match config.engine {
        TtsEngine::Edge => {
            synthesize_edge_tts(&cleaned, &config.voice_id, &config.rate, &config.pitch, &config.volume).await
        }
        TtsEngine::ElevenLabs => {
            synthesize_elevenlabs(&cleaned, &config.voice_id, &config.elevenlabs_api_key).await
        }
        TtsEngine::OpenAi => {
            synthesize_openai_tts(&cleaned, &config.openai_endpoint, &config.openai_api_key, &config.openai_model, &config.voice_id).await
        }
        TtsEngine::Disabled => {
            Err("TTS ist für diesen Charakter deaktiviert.".to_string())
        }
    }
}

// ---------------------------------------------------------------------------
// Character Voice Config Persistence
// ---------------------------------------------------------------------------

fn get_voice_config_dir() -> PathBuf {
    let paths = resolve_app_paths();
    PathBuf::from(paths.config_dir).join("voice_configs")
}

fn get_voice_config_path(char_id: &str) -> PathBuf {
    get_voice_config_dir().join(format!("{}.json", char_id))
}

pub fn load_character_voice_config(char_id: &str) -> VoiceConfig {
    let path = get_voice_config_path(char_id);
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(config) = serde_json::from_str::<VoiceConfig>(&content) {
                return config;
            }
        }
    }
    VoiceConfig::default()
}

pub fn save_character_voice_config(char_id: &str, config: &VoiceConfig) -> Result<(), String> {
    let dir = get_voice_config_dir();
    let _ = fs::create_dir_all(&dir);
    let path = get_voice_config_path(char_id);
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Fehler bei der Serialisierung der Stimmen-Konfiguration: {}", e))?;
    fs::write(&path, json)
        .map_err(|e| format!("Fehler beim Schreiben der Stimmen-Konfiguration: {}", e))?;
    info!("Stimmen-Konfiguration für '{}' gespeichert in {:?}", char_id, path);
    Ok(())
}

// ---------------------------------------------------------------------------
// UUID helper (simple v4 generation)
// ---------------------------------------------------------------------------

fn uuid_v4() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let bytes: [u8; 16] = rng.gen();
    format!(
        "{:08x}-{:04x}-4{:03x}-{:04x}-{:012x}",
        u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]),
        u16::from_be_bytes([bytes[4], bytes[5]]),
        u16::from_be_bytes([bytes[6], bytes[7]]) & 0x0FFF,
        (u16::from_be_bytes([bytes[8], bytes[9]]) & 0x3FFF) | 0x8000,
        u64::from_be_bytes([0, 0, bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]])
    )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_text_for_tts_removes_think_blocks() {
        let input = "Hallo! <think>This is internal reasoning</think> Wie geht es dir?";
        let result = clean_text_for_tts(input, &TtsFilterMode::All, "");
        assert_eq!(result, "Hallo! Wie geht es dir?");
    }

    #[test]
    fn test_clean_text_for_tts_removes_code_blocks() {
        let input = "Schau dir das an:\n```rust\nfn main() {}\n```\nund das hier.";
        let result = clean_text_for_tts(input, &TtsFilterMode::All, "");
        assert!(result.contains("Schau dir das an:"));
        assert!(result.contains("und das hier."));
        assert!(!result.contains("fn main()"));
    }

    #[test]
    fn test_clean_text_for_tts_strip_actions() {
        let input = "*lächelt sanft* Hallo! *dreht sich um* Schön dich zu sehen.";
        let result = clean_text_for_tts(input, &TtsFilterMode::StripActions, "");
        assert_eq!(result, "Hallo! Schön dich zu sehen.");
    }

    #[test]
    fn test_clean_text_for_tts_dialogue_only() {
        let input = "*Sie schaut auf* \"Hallo!\" *lächelt* \"Wie geht es dir?\"";
        let result = clean_text_for_tts(input, &TtsFilterMode::DialogueOnly, "");
        assert!(result.contains("Hallo!"));
        assert!(result.contains("Wie geht es dir?"));
        assert!(!result.contains("lächelt"));
    }

    #[test]
    fn test_clean_text_for_tts_removes_urls() {
        let input = "Besuche https://example.com/test für Details.";
        let result = clean_text_for_tts(input, &TtsFilterMode::All, "");
        assert!(!result.contains("https://"));
        assert!(result.contains("Besuche"));
        assert!(result.contains("für Details."));
    }

    #[test]
    fn test_clean_text_for_tts_custom_regex() {
        let input = "[System: this is a note] Hallo Welt!";
        let result = clean_text_for_tts(input, &TtsFilterMode::All, r"\[System:.*?\]");
        assert_eq!(result, "Hallo Welt!");
    }

    #[test]
    fn test_edge_tts_voice_list_not_empty() {
        let voices = list_edge_tts_voices();
        assert!(!voices.is_empty());
        assert!(voices.iter().any(|v| v.locale.starts_with("de-")));
        assert!(voices.iter().any(|v| v.locale.starts_with("ja-")));
        assert!(voices.iter().any(|v| v.locale.starts_with("en-")));
    }

    #[test]
    fn test_voice_config_serialization() {
        let config = VoiceConfig::default();
        let json = serde_json::to_string_pretty(&config).unwrap();
        let parsed: VoiceConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.voice_id, "de-DE-KatjaNeural");
        assert_eq!(parsed.engine, TtsEngine::Edge);
    }

    #[test]
    fn test_voice_config_persistence() {
        let config = VoiceConfig {
            voice_id: "ja-JP-NanamiNeural".to_string(),
            ..Default::default()
        };
        let save_res = save_character_voice_config("test_voice_unit", &config);
        assert!(save_res.is_ok());

        let loaded = load_character_voice_config("test_voice_unit");
        assert_eq!(loaded.voice_id, "ja-JP-NanamiNeural");

        // Clean up
        let path = get_voice_config_path("test_voice_unit");
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn test_list_available_voices_edge() {
        let voices = list_available_voices("edge");
        assert!(voices.len() > 10);
    }

    #[test]
    fn test_list_available_voices_openai() {
        let voices = list_available_voices("openai");
        assert!(voices.iter().any(|v| v.id == "nova"));
    }
}
