use base64::Engine as _;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Cursor;
use std::path::PathBuf;
use std::time::Duration;
use tracing::{info, warn};

use crate::modules::paths::resolve_app_paths;

const EDGE_TTS_TRUSTED_CLIENT_TOKEN: &str = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const EDGE_TTS_SEC_MS_GEC_VERSION: &str = "1-143.0.3650.75";
const EDGE_TTS_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) \
    AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0";

// ---------------------------------------------------------------------------
// Data Models
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TtsEngine {
    #[serde(rename = "edge")]
    Edge,
    #[serde(rename = "kokoro")]
    Kokoro,
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

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub enum SttEngine {
    #[serde(rename = "native_whisper")]
    NativeWhisper,
    #[serde(rename = "openai")]
    OpenAi,
    #[serde(rename = "disabled")]
    #[default]
    Disabled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RvcConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub endpoint: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub pitch: i32,
    #[serde(default = "default_rvc_index_rate")]
    pub index_rate: f32,
    #[serde(default = "default_rvc_protect")]
    pub protect: f32,
}

impl Default for RvcConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            endpoint: String::new(),
            api_key: String::new(),
            model: String::new(),
            pitch: 0,
            index_rate: default_rvc_index_rate(),
            protect: default_rvc_protect(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SttConfig {
    #[serde(default)]
    pub engine: SttEngine,
    #[serde(default)]
    pub whisper_model_path: String,
    #[serde(default = "default_stt_endpoint")]
    pub endpoint: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_stt_model")]
    pub model: String,
    #[serde(default)]
    pub language: String,
    #[serde(default)]
    pub prompt: String,
    #[serde(default = "default_vad_threshold")]
    pub vad_threshold: f32,
    #[serde(default = "default_vad_silence_ms")]
    pub vad_silence_ms: u32,
    #[serde(default)]
    pub input_device_id: String,
}

impl Default for SttConfig {
    fn default() -> Self {
        Self {
            engine: SttEngine::Disabled,
            whisper_model_path: String::new(),
            endpoint: default_stt_endpoint(),
            api_key: String::new(),
            model: default_stt_model(),
            language: String::new(),
            prompt: String::new(),
            vad_threshold: default_vad_threshold(),
            vad_silence_ms: default_vad_silence_ms(),
            input_device_id: String::new(),
        }
    }
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
    #[serde(default)]
    pub openai_instructions: String,
    #[serde(default)]
    pub kokoro: crate::modules::kokoro::KokoroConfig,
    #[serde(default)]
    pub output_device_id: String,
    #[serde(default)]
    pub rvc: RvcConfig,
    #[serde(default)]
    pub stt: SttConfig,
}

fn default_rate() -> String { "+0%".to_string() }
fn default_pitch() -> String { "+0Hz".to_string() }
fn default_volume() -> String { "+0%".to_string() }
fn default_filter_mode() -> TtsFilterMode { TtsFilterMode::StripActions }
fn default_openai_endpoint() -> String { "http://localhost:8880/v1/audio/speech".to_string() }
fn default_openai_model() -> String { "tts-1".to_string() }
fn default_stt_endpoint() -> String { "http://localhost:8080/v1/audio/transcriptions".to_string() }
fn default_stt_model() -> String { "whisper-1".to_string() }
fn default_vad_threshold() -> f32 { 0.025 }
fn default_vad_silence_ms() -> u32 { 900 }
fn default_rvc_index_rate() -> f32 { 0.75 }
fn default_rvc_protect() -> f32 { 0.33 }

fn http_client(timeout_seconds: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_seconds))
        .build()
        .map_err(|e| format!("Audio-HTTP-Client konnte nicht erstellt werden: {}", e))
}

impl Default for VoiceConfig {
    fn default() -> Self {
        Self {
            engine: TtsEngine::Edge,
            voice_id: "de-DE-KatjaNeural".to_string(),
            rate: default_rate(),
            pitch: default_pitch(),
            volume: default_volume(),
            filter_mode: TtsFilterMode::StripActions,
            custom_regex: String::new(),
            elevenlabs_api_key: String::new(),
            openai_endpoint: default_openai_endpoint(),
            openai_api_key: String::new(),
            openai_model: default_openai_model(),
            openai_instructions: String::new(),
            kokoro: crate::modules::kokoro::KokoroConfig::default(),
            output_device_id: String::new(),
            rvc: RvcConfig::default(),
            stt: SttConfig::default(),
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

    // 5. Remove markdown headers and underscore emphasis markers. Asterisks
    // remain until the action filter has had a chance to inspect them.
    let header_re = regex::Regex::new(r"(?m)^#{1,6}\s+").unwrap();
    text = header_re.replace_all(&text, "").to_string();
    text = text.replace("__", "");

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
            // Remove roleplay actions, including multiline/double-star variants.
            // A dangling opening marker can occur when streamed text is flushed;
            // in that case it is safer to omit the unfinished action as well.
            let action_re = regex::Regex::new(r"(?s)\*{1,3}[^*]*?\*{1,3}").unwrap();
            let dangling_action_re = regex::Regex::new(r"(?s)\*{1,3}[^*]*$").unwrap();
            let without_actions = action_re.replace_all(&text, "");
            dangling_action_re.replace(&without_actions, "").to_string()
        }
    };

    // 7. Apply custom regex exclusion if set
    if !custom_regex.is_empty()
        && let Ok(custom_re) = regex::Regex::new(custom_regex) {
            text = custom_re.replace_all(&text, "").to_string();
        }

    // 8. Never pass Markdown asterisks to a speech engine. In "Alles"
    // mode their content remains, but Edge-TTS must not pronounce "Stern".
    text = text.replace('*', "");

    // 9. Collapse whitespace
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

/// Returns available voices for a given engine. ElevenLabs is queried live when
/// an API key is available; callers can still enter an arbitrary voice ID.
pub async fn list_available_voices(
    engine: &str,
    elevenlabs_api_key: &str,
    kokoro_voices_path: &str,
) -> Result<Vec<ScannedVoice>, String> {
    match engine {
        "edge" => {
            let url = format!(
                "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken={}",
                EDGE_TTS_TRUSTED_CLIENT_TOKEN
            );
            match http_client(15)?.get(&url).send().await {
                Ok(response) if response.status().is_success() => {
                    let payload: serde_json::Value = response.json().await.unwrap_or_default();
                    if let Some(arr) = payload.as_array() {
                        let mut voices = Vec::new();
                        for v in arr {
                            if let (Some(id), Some(locale), Some(gender)) = (
                                v.get("ShortName").and_then(|s| s.as_str()),
                                v.get("Locale").and_then(|s| s.as_str()),
                                v.get("Gender").and_then(|s| s.as_str())
                            ) {
                                // Extract a readable name from ShortName (e.g. "de-DE-KatjaNeural" -> "Katja")
                                let name = id.split('-').next_back().unwrap_or(id).replace("Neural", "");
                                voices.push(ScannedVoice {
                                    id: id.to_string(),
                                    name,
                                    locale: locale.to_string(),
                                    gender: gender.to_string(),
                                });
                            }
                        }
                        return Ok(voices);
                    }
                }
                _ => {} // Fallback to hardcoded list on error
            }
            Ok(list_edge_tts_voices())
        }
        "kokoro" => crate::modules::kokoro::list_voices(kokoro_voices_path),
        "elevenlabs" => {
            if elevenlabs_api_key.trim().is_empty() {
                return Ok(Vec::new());
            }

            let response = http_client(15)?
                .get("https://api.elevenlabs.io/v1/voices")
                .header("xi-api-key", elevenlabs_api_key)
                .send()
                .await
                .map_err(|e| format!("ElevenLabs-Stimmen konnten nicht geladen werden: {}", e))?;

            if !response.status().is_success() {
                let status = response.status();
                let body = response.text().await.unwrap_or_default();
                return Err(format!("ElevenLabs API-Fehler {}: {}", status, body));
            }

            let payload: serde_json::Value = response
                .json()
                .await
                .map_err(|e| format!("Ungültige ElevenLabs-Stimmenliste: {}", e))?;
            let voices = payload["voices"]
                .as_array()
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|voice| {
                            let id = voice["voice_id"].as_str()?.to_string();
                            let name = voice["name"].as_str().unwrap_or(&id).to_string();
                            let labels = voice["labels"].as_object();
                            let locale = labels
                                .and_then(|l| l.get("language"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("multi")
                                .to_string();
                            let gender = labels
                                .and_then(|l| l.get("gender"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("Unknown")
                                .to_string();
                            Some(ScannedVoice { id, name, locale, gender })
                        })
                        .collect()
                })
                .unwrap_or_default();
            Ok(voices)
        }
        "openai" => {
            // Standard OpenAI voices
            Ok(vec![
                ScannedVoice { id: "alloy".into(), name: "Alloy".into(), locale: "multi".into(), gender: "Neutral".into() },
                ScannedVoice { id: "ash".into(), name: "Ash".into(), locale: "multi".into(), gender: "Neutral".into() },
                ScannedVoice { id: "ballad".into(), name: "Ballad".into(), locale: "multi".into(), gender: "Neutral".into() },
                ScannedVoice { id: "coral".into(), name: "Coral".into(), locale: "multi".into(), gender: "Neutral".into() },
                ScannedVoice { id: "echo".into(), name: "Echo".into(), locale: "multi".into(), gender: "Male".into() },
                ScannedVoice { id: "fable".into(), name: "Fable".into(), locale: "multi".into(), gender: "Male".into() },
                ScannedVoice { id: "onyx".into(), name: "Onyx".into(), locale: "multi".into(), gender: "Male".into() },
                ScannedVoice { id: "nova".into(), name: "Nova".into(), locale: "multi".into(), gender: "Female".into() },
                ScannedVoice { id: "sage".into(), name: "Sage".into(), locale: "multi".into(), gender: "Neutral".into() },
                ScannedVoice { id: "shimmer".into(), name: "Shimmer".into(), locale: "multi".into(), gender: "Female".into() },
                ScannedVoice { id: "verse".into(), name: "Verse".into(), locale: "multi".into(), gender: "Neutral".into() },
                ScannedVoice { id: "marin".into(), name: "Marin".into(), locale: "multi".into(), gender: "Neutral".into() },
                ScannedVoice { id: "cedar".into(), name: "Cedar".into(), locale: "multi".into(), gender: "Neutral".into() },
            ])
        }
        _ => Ok(Vec::new()),
    }
}

// ---------------------------------------------------------------------------
// Edge-TTS Synthesis (Microsoft Speech REST API)
// ---------------------------------------------------------------------------

/// Synthesizes speech using the Edge-TTS (Microsoft Cognitive Services) WebSocket endpoint.
/// Returns base64-encoded MP3 audio as a data URL.
pub async fn synthesize_edge_tts(text: &str, voice_id: &str, rate: &str, pitch: &str, volume: &str) -> Result<String, String> {
    if text.trim().is_empty() {
        return Err("Kein Text zum Vorlesen vorhanden.".to_string());
    }
    synthesize_edge_tts_websocket(text, voice_id, rate, pitch, volume).await
}

/// Edge-TTS synthesis via the WebSocket protocol (same as the edge-tts Python library)
async fn synthesize_edge_tts_websocket(text: &str, voice_id: &str, rate: &str, pitch: &str, volume: &str) -> Result<String, String> {
    // Escape XML special characters
    let escaped_text = text
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;");

    let ssml = format!(
        r#"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='{}'><prosody rate='{}' pitch='{}' volume='{}'>{}</prosody></voice></speak>"#,
        voice_id, rate, pitch, volume, escaped_text
    );

    let connection_id = uuid_v4().replace('-', "");
    let ws_url = edge_tts_websocket_url(&connection_id);

    // We use tokio-tungstenite for WebSocket communication
    use futures_util::{SinkExt, StreamExt};
    use tokio_tungstenite::connect_async;
    use tokio_tungstenite::tungstenite::Message;

    let request = build_edge_tts_request(&ws_url)?;

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
                info!("Edge-TTS Message: {}", txt_str);
                if txt_str.contains("Path:turn.end") {
                    break;
                }
            }
            Ok(Message::Close(c)) => {
                info!("Edge-TTS Closed: {:?}", c);
                if let Some(close_frame) = c
                    && close_frame.reason.contains("Unsupported voice") {
                        return Err(format!("Die ausgewählte Stimme wird von Microsoft nicht mehr unterstützt. Bitte wähle eine andere Stimme aus. (Details: {})", close_frame.reason));
                    }
                break;
            }
            Err(e) => {
                warn!("WebSocket-Fehler: {}", e);
                break;
            }
            _ => {
                info!("Edge-TTS Other Message");
            }
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

fn build_edge_tts_request(
    ws_url: &str,
) -> Result<tokio_tungstenite::tungstenite::http::Request<()>, String> {
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;
    use tokio_tungstenite::tungstenite::http::header::{
        HeaderValue, ACCEPT_ENCODING, ACCEPT_LANGUAGE, CACHE_CONTROL, COOKIE, ORIGIN, PRAGMA,
        USER_AGENT,
    };

    // IntoClientRequest generates the mandatory WebSocket handshake headers,
    // including a fresh Sec-WebSocket-Key. Building a plain HTTP request here
    // would bypass that logic and tungstenite would reject it before connecting.
    let mut request = ws_url
        .into_client_request()
        .map_err(|e| format!("WebSocket-Anfrage konnte nicht erstellt werden: {}", e))?;

    request.headers_mut().insert(
        USER_AGENT,
        HeaderValue::from_static(EDGE_TTS_USER_AGENT),
    );
    request
        .headers_mut()
        .insert(PRAGMA, HeaderValue::from_static("no-cache"));
    request
        .headers_mut()
        .insert(CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    request.headers_mut().insert(
        ORIGIN,
        HeaderValue::from_static("chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold"),
    );
    request.headers_mut().insert(
        ACCEPT_ENCODING,
        HeaderValue::from_static("gzip, deflate, br, zstd"),
    );
    request.headers_mut().insert(
        ACCEPT_LANGUAGE,
        HeaderValue::from_static("en-US,en;q=0.9"),
    );
    let muid = uuid_v4().replace('-', "").to_uppercase();
    request.headers_mut().insert(
        COOKIE,
        HeaderValue::from_str(&format!("muid={};", muid))
            .map_err(|e| format!("Edge-TTS-Cookie konnte nicht erstellt werden: {}", e))?,
    );

    Ok(request)
}

fn edge_tts_websocket_url(connection_id: &str) -> String {
    format!(
        "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1\
         ?TrustedClientToken={EDGE_TTS_TRUSTED_CLIENT_TOKEN}\
         &ConnectionId={connection_id}\
         &Sec-MS-GEC={}\
         &Sec-MS-GEC-Version={EDGE_TTS_SEC_MS_GEC_VERSION}",
        generate_edge_sec_ms_gec(chrono::Utc::now().timestamp())
    )
}

fn generate_edge_sec_ms_gec(unix_timestamp: i64) -> String {
    use sha2::{Digest, Sha256};

    const WINDOWS_EPOCH_OFFSET_SECONDS: i64 = 11_644_473_600;
    const FIVE_MINUTES_SECONDS: i64 = 300;
    const HUNDRED_NANOSECONDS_PER_SECOND: i64 = 10_000_000;

    let rounded_timestamp =
        unix_timestamp - unix_timestamp.rem_euclid(FIVE_MINUTES_SECONDS);
    let windows_file_time = (rounded_timestamp + WINDOWS_EPOCH_OFFSET_SECONDS)
        * HUNDRED_NANOSECONDS_PER_SECOND;
    let value = format!("{windows_file_time}{EDGE_TTS_TRUSTED_CLIENT_TOKEN}");
    Sha256::digest(value.as_bytes()).iter().map(|b| format!("{:02X}", b)).collect()
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
    let client = http_client(120)?;
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

pub async fn synthesize_openai_tts(
    text: &str,
    endpoint: &str,
    api_key: &str,
    model: &str,
    voice_id: &str,
    rate: &str,
    instructions: &str,
) -> Result<String, String> {
    if text.trim().is_empty() {
        return Err("Kein Text zum Vorlesen vorhanden.".to_string());
    }

    let client = http_client(120)?;
    let rate_percent = rate.trim_end_matches('%').parse::<f32>().unwrap_or(0.0);
    let speed = (1.0 + rate_percent / 100.0).clamp(0.25, 4.0);
    let mut body = serde_json::json!({
        "model": model,
        "input": text,
        "voice": voice_id,
        "response_format": "wav",
        "speed": speed
    });
    if !instructions.trim().is_empty() {
        body["instructions"] = serde_json::Value::String(instructions.to_string());
    }

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

    let mime = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("audio/mpeg")
        .split(';')
        .next()
        .unwrap_or("audio/mpeg")
        .to_string();
    let bytes = response.bytes().await
        .map_err(|e| format!("Fehler beim Empfangen der OpenAI-TTS-Audio-Daten: {}", e))?;
    let b64 = base64::prelude::BASE64_STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, b64))
}

// ---------------------------------------------------------------------------
// Optional RVC post-processing
// ---------------------------------------------------------------------------

fn decode_audio_data_url(data_url: &str) -> Result<(String, Vec<u8>), String> {
    let (metadata, encoded) = data_url
        .split_once(',')
        .ok_or_else(|| "Ungültige Audio-Data-URL.".to_string())?;
    let mime = metadata
        .strip_prefix("data:")
        .and_then(|value| value.split(';').next())
        .unwrap_or("audio/mpeg")
        .to_string();
    let bytes = base64::prelude::BASE64_STANDARD
        .decode(encoded)
        .map_err(|e| format!("Audio-Base64 konnte nicht dekodiert werden: {}", e))?;
    Ok((mime, bytes))
}

async fn apply_rvc(data_url: &str, config: &RvcConfig) -> Result<String, String> {
    if !config.enabled {
        return Ok(data_url.to_string());
    }
    if config.endpoint.trim().is_empty() {
        return Err("RVC ist aktiviert, aber kein RVC-Endpunkt konfiguriert.".to_string());
    }

    let (mime, audio) = decode_audio_data_url(data_url)?;
    let extension = if mime.contains("wav") { "wav" } else { "mp3" };
    let audio_part = reqwest::multipart::Part::bytes(audio)
        .file_name(format!("speech.{}", extension))
        .mime_str(&mime)
        .map_err(|e| format!("Ungültiger RVC-Audiotyp: {}", e))?;
    let form = reqwest::multipart::Form::new()
        .part("audio", audio_part)
        .text("model", config.model.clone())
        .text("pitch", config.pitch.to_string())
        .text("index_rate", config.index_rate.to_string())
        .text("protect", config.protect.to_string());

    let mut request = http_client(120)?.post(&config.endpoint).multipart(form);
    if !config.api_key.trim().is_empty() {
        request = request.bearer_auth(&config.api_key);
    }
    let response = request
        .send()
        .await
        .map_err(|e| format!("RVC-Anfrage fehlgeschlagen: {}", e))?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("RVC-Endpunkt meldet {}: {}", status, body));
    }

    let result_mime = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("audio/wav")
        .split(';')
        .next()
        .unwrap_or("audio/wav")
        .to_string();
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("RVC-Audio konnte nicht gelesen werden: {}", e))?;
    Ok(format!(
        "data:{};base64,{}",
        result_mime,
        base64::prelude::BASE64_STANDARD.encode(bytes)
    ))
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

    let synthesized = match config.engine {
        TtsEngine::Edge => {
            synthesize_edge_tts(&cleaned, &config.voice_id, &config.rate, &config.pitch, &config.volume).await
        }
        TtsEngine::Kokoro => {
            crate::modules::kokoro::synthesize(
                &cleaned,
                &config.voice_id,
                &config.rate,
                &config.kokoro,
            )
            .await
        }
        TtsEngine::ElevenLabs => {
            synthesize_elevenlabs(&cleaned, &config.voice_id, &config.elevenlabs_api_key).await
        }
        TtsEngine::OpenAi => {
            synthesize_openai_tts(
                &cleaned,
                &config.openai_endpoint,
                &config.openai_api_key,
                &config.openai_model,
                &config.voice_id,
                &config.rate,
                &config.openai_instructions,
            ).await
        }
        TtsEngine::Disabled => {
            Err("TTS ist für diesen Charakter deaktiviert.".to_string())
        }
    }?;

    apply_rvc(&synthesized, &config.rvc).await
}

// ---------------------------------------------------------------------------
// Speech-to-text (native whisper.cpp or OpenAI-compatible endpoint)
// ---------------------------------------------------------------------------

fn decode_pcm_f32(audio_base64: &str) -> Result<Vec<f32>, String> {
    let bytes = base64::prelude::BASE64_STANDARD
        .decode(audio_base64)
        .map_err(|e| format!("PCM-Audio konnte nicht dekodiert werden: {}", e))?;
    if bytes.is_empty() || bytes.len() % 4 != 0 {
        return Err("PCM-Audio muss 32-Bit-Float-Samples enthalten.".to_string());
    }

    const MAX_SAMPLES: usize = 16_000 * 120;
    if bytes.len() / 4 > MAX_SAMPLES {
        return Err("Die Aufnahme ist länger als 120 Sekunden.".to_string());
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
        return Err("PCM-Audio enthält ungültige Samples.".to_string());
    }
    Ok(samples)
}

fn pcm_to_wav(samples: &[f32]) -> Result<Vec<u8>, String> {
    let mut cursor = Cursor::new(Vec::new());
    {
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: 16_000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::new(&mut cursor, spec)
            .map_err(|e| format!("WAV-Encoder konnte nicht gestartet werden: {}", e))?;
        for sample in samples {
            let value = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
            writer
                .write_sample(value)
                .map_err(|e| format!("WAV-Sample konnte nicht geschrieben werden: {}", e))?;
        }
        writer
            .finalize()
            .map_err(|e| format!("WAV-Datei konnte nicht abgeschlossen werden: {}", e))?;
    }
    Ok(cursor.into_inner())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn transcribe_native_whisper(samples: Vec<f32>, config: SttConfig) -> Result<String, String> {
    use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

    if config.whisper_model_path.trim().is_empty() {
        return Err("Bitte zuerst ein whisper.cpp-GGML/GGUF-Modell auswählen.".to_string());
    }
    if !std::path::Path::new(&config.whisper_model_path).is_file() {
        return Err(format!(
            "Whisper-Modell nicht gefunden: {}",
            config.whisper_model_path
        ));
    }

    let context = WhisperContext::new_with_params(
        &config.whisper_model_path,
        WhisperContextParameters::default(),
    )
    .map_err(|e| format!("Whisper-Modell konnte nicht geladen werden: {}", e))?;
    let mut state = context
        .create_state()
        .map_err(|e| format!("Whisper-Zustand konnte nicht erstellt werden: {}", e))?;
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
        .map_err(|e| format!("Whisper-Transkription fehlgeschlagen: {}", e))?;
    let segment_count = state.full_n_segments();
    let mut transcript = String::new();
    for index in 0..segment_count {
        let segment = state
            .get_segment(index)
            .ok_or_else(|| format!("Whisper-Segment {} fehlt.", index))?;
        let text = segment
            .to_str()
            .map_err(|e| format!("Whisper-Segment konnte nicht gelesen werden: {}", e))?;
        transcript.push_str(text);
    }
    Ok(transcript.trim().to_string())
}

#[cfg(any(target_os = "android", target_os = "ios"))]
fn transcribe_native_whisper(_samples: Vec<f32>, _config: SttConfig) -> Result<String, String> {
    Err(
        "Native Whisper-STT ist auf Mobile deaktiviert. Bitte einen OpenAI-kompatiblen STT-Endpunkt verwenden."
            .to_string(),
    )
}

async fn transcribe_openai_compatible(samples: &[f32], config: &SttConfig) -> Result<String, String> {
    if config.endpoint.trim().is_empty() {
        return Err("Kein STT-Endpunkt konfiguriert.".to_string());
    }
    let wav = pcm_to_wav(samples)?;
    let audio_part = reqwest::multipart::Part::bytes(wav)
        .file_name("recording.wav")
        .mime_str("audio/wav")
        .map_err(|e| format!("STT-Audiotyp konnte nicht gesetzt werden: {}", e))?;
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
        .map_err(|e| format!("STT-Anfrage fehlgeschlagen: {}", e))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("STT-Antwort konnte nicht gelesen werden: {}", e))?;
    if !status.is_success() {
        return Err(format!("STT-Endpunkt meldet {}: {}", status, body));
    }
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body)
        && let Some(text) = json["text"].as_str() {
            return Ok(text.trim().to_string());
        }
    Ok(body.trim().to_string())
}

pub async fn transcribe_speech(audio_base64: &str, config: &SttConfig) -> Result<String, String> {
    let samples = decode_pcm_f32(audio_base64)?;
    if samples.len() < 1_600 {
        return Err("Die Aufnahme ist zu kurz für eine Transkription.".to_string());
    }

    match config.engine {
        SttEngine::NativeWhisper => {
            let owned_config = config.clone();
            tokio::task::spawn_blocking(move || transcribe_native_whisper(samples, owned_config))
                .await
                .map_err(|e| format!("Whisper-Worker ist fehlgeschlagen: {}", e))?
        }
        SttEngine::OpenAi => transcribe_openai_compatible(&samples, config).await,
        SttEngine::Disabled => Err("Spracherkennung ist deaktiviert.".to_string()),
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
    let safe_id: String = char_id
        .chars()
        .map(|character| {
            if character.is_alphanumeric() || matches!(character, '-' | '_') {
                character
            } else {
                '_'
            }
        })
        .collect();
    let safe_id = if safe_id.trim_matches('_').is_empty() {
        "default"
    } else {
        &safe_id
    };
    get_voice_config_dir().join(format!("{}.json", safe_id))
}

pub fn load_character_voice_config(char_id: &str) -> VoiceConfig {
    let path = get_voice_config_path(char_id);
    let mut config = load_voice_config_from_path(&path);
    let prefix = voice_secret_prefix(&path);
    let mut needs_migration = false;
    for (name, value) in voice_secret_fields(&mut config) {
        needs_migration |= crate::modules::secrets::hydrate(&format!("{}/{}", prefix, name), value);
    }
    if needs_migration {
        let _ = save_character_voice_config(char_id, &config);
    }
    config
}

fn voice_secret_prefix(path: &std::path::Path) -> String {
    let stem = path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    format!("voice/{}", stem)
}

fn voice_secret_fields(config: &mut VoiceConfig) -> [(&'static str, &mut String); 4] {
    [
        ("elevenlabs_api_key", &mut config.elevenlabs_api_key),
        ("openai_api_key", &mut config.openai_api_key),
        ("rvc_api_key", &mut config.rvc.api_key),
        ("stt_api_key", &mut config.stt.api_key),
    ]
}

fn load_voice_config_from_path(path: &std::path::Path) -> VoiceConfig {
    if path.exists()
        && let Ok(content) = fs::read_to_string(path)
            && let Ok(config) = serde_json::from_str::<VoiceConfig>(&content) {
                return config;
            }
    VoiceConfig::default()
}

pub fn save_character_voice_config(char_id: &str, config: &VoiceConfig) -> Result<(), String> {
    let path = get_voice_config_path(char_id);
    let prefix = voice_secret_prefix(&path);
    let mut on_disk = config.clone();
    for (name, value) in voice_secret_fields(&mut on_disk) {
        crate::modules::secrets::externalize(&format!("{}/{}", prefix, name), value);
    }
    save_voice_config_to_path(&path, &on_disk)?;
    info!("Stimmen-Konfiguration für '{}' gespeichert in {:?}", char_id, path);
    Ok(())
}

fn save_voice_config_to_path(path: &std::path::Path, config: &VoiceConfig) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)
            .map_err(|e| format!("Stimmen-Konfigurationsordner konnte nicht erstellt werden: {}", e))?;
    }
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Fehler bei der Serialisierung der Stimmen-Konfiguration: {}", e))?;
    fs::write(path, json)
        .map_err(|e| format!("Fehler beim Schreiben der Stimmen-Konfiguration: {}", e))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// UUID helper (simple v4 generation)
// ---------------------------------------------------------------------------

fn uuid_v4() -> String {
    let bytes: [u8; 16] = rand::random();
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
    fn test_clean_text_for_tts_strip_actions_handles_multiline_and_bold_markers() {
        let input = "**Sie schaut kurz auf.\nDann lächelt sie.** \"Hallo!\"";
        let result = clean_text_for_tts(input, &TtsFilterMode::StripActions, "");
        assert_eq!(result, "\"Hallo!\"");
    }

    #[test]
    fn test_clean_text_for_tts_strip_actions_omits_dangling_stream_fragment() {
        let input = "Hallo. *Sie schaut zum Fenster und";
        let result = clean_text_for_tts(input, &TtsFilterMode::StripActions, "");
        assert_eq!(result, "Hallo.");
    }

    #[test]
    fn test_clean_text_for_tts_all_never_speaks_markdown_asterisks() {
        let input = "*lächelt* Hallo! **Wichtig.**";
        let result = clean_text_for_tts(input, &TtsFilterMode::All, "");
        assert_eq!(result, "lächelt Hallo! Wichtig.");
        assert!(!result.contains('*'));
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
    fn test_edge_tts_request_contains_websocket_handshake_headers() {
        let request = build_edge_tts_request(
            "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=test&ConnectionId=test",
        )
        .unwrap();
        let headers = request.headers();

        assert_eq!(request.method(), "GET");
        assert!(headers.contains_key("host"));
        assert!(headers.contains_key("connection"));
        assert!(headers.contains_key("upgrade"));
        assert!(headers.contains_key("sec-websocket-version"));
        assert!(headers.contains_key("sec-websocket-key"));
        assert_eq!(
            headers.get("origin").unwrap(),
            "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold"
        );
        assert!(headers
            .get("cookie")
            .unwrap()
            .to_str()
            .unwrap()
            .starts_with("muid="));
        assert!(!headers.contains_key("sec-websocket-protocol"));
    }

    #[test]
    fn test_edge_tts_security_token_and_url() {
        assert_eq!(
            generate_edge_sec_ms_gec(0),
            "7ECB79D14E3AA576D2D79E6D487A1388156D91E614B1BE11C64226A29BC8DD8C"
        );

        let url = edge_tts_websocket_url("test-connection");
        assert!(url.contains("TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4"));
        assert!(url.contains("ConnectionId=test-connection"));
        assert!(url.contains("Sec-MS-GEC="));
        assert!(url.contains("Sec-MS-GEC-Version=1-143.0.3650.75"));
    }

    #[tokio::test]
    #[ignore = "requires access to the public Edge-TTS service"]
    async fn test_edge_tts_live_synthesis() {
        let audio = synthesize_edge_tts(
            "Dies ist ein kurzer Test.",
            "de-DE-KatjaNeural",
            "+0%",
            "+0Hz",
            "+0%",
        )
        .await
        .unwrap();

        assert!(audio.starts_with("data:audio/mp3;base64,"));
        assert!(audio.len() > 1_000);
    }

    #[test]
    fn test_voice_config_serialization() {
        let config = VoiceConfig::default();
        let json = serde_json::to_string_pretty(&config).unwrap();
        let parsed: VoiceConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.voice_id, "de-DE-KatjaNeural");
        assert_eq!(parsed.engine, TtsEngine::Edge);
        assert_eq!(parsed.filter_mode, TtsFilterMode::StripActions);
    }

    #[test]
    fn test_voice_config_persistence() {
        let test_dir = std::env::temp_dir().join(format!("otakusoul-voice-test-{}", uuid_v4()));
        let path = test_dir.join("voice.json");
        let config = VoiceConfig {
            voice_id: "ja-JP-NanamiNeural".to_string(),
            ..Default::default()
        };
        let save_res = save_voice_config_to_path(&path, &config);
        assert!(save_res.is_ok());

        let loaded = load_voice_config_from_path(&path);
        assert_eq!(loaded.voice_id, "ja-JP-NanamiNeural");

        let _ = fs::remove_dir_all(test_dir);
    }

    #[tokio::test]
    async fn test_list_available_voices_edge() {
        let voices = list_available_voices("edge", "", "").await.unwrap();
        assert!(voices.len() > 10);
    }

    #[tokio::test]
    async fn test_list_available_voices_openai() {
        let voices = list_available_voices("openai", "", "").await.unwrap();
        assert!(voices.iter().any(|v| v.id == "nova"));
    }

    #[test]
    fn test_pcm_base64_roundtrip_and_wav_encoding() {
        let samples = [0.0_f32, 0.25, -0.5, 1.0];
        let bytes: Vec<u8> = samples.iter().flat_map(|sample| sample.to_le_bytes()).collect();
        let encoded = base64::prelude::BASE64_STANDARD.encode(bytes);
        let decoded = decode_pcm_f32(&encoded).unwrap();
        assert_eq!(decoded, samples);

        let wav = pcm_to_wav(&decoded).unwrap();
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
    }

    #[test]
    fn test_voice_config_backward_compatible_defaults() {
        let old_json = r#"{
          "engine":"edge",
          "voice_id":"de-DE-KatjaNeural",
          "rate":"+0%",
          "pitch":"+0Hz",
          "volume":"+0%",
          "filter_mode":"all",
          "custom_regex":"",
          "elevenlabs_api_key":"",
          "openai_endpoint":"http://localhost:8880/v1/audio/speech",
          "openai_api_key":"",
          "openai_model":"tts-1"
        }"#;
        let config: VoiceConfig = serde_json::from_str(old_json).unwrap();
        assert_eq!(config.stt.engine, SttEngine::Disabled);
        assert!(!config.rvc.enabled);
        assert!(config.output_device_id.is_empty());
        assert!(config.kokoro.model_path.is_empty());
        assert!(config.kokoro.voices_path.is_empty());
    }
}
