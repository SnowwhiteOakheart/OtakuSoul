use base64::Engine as _;
use tracing::{debug, info, warn};

use super::models::{ScannedVoice, uuid_v4};

pub(super) const EDGE_TTS_TRUSTED_CLIENT_TOKEN: &str = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const EDGE_TTS_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) \
    AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0";

pub fn list_edge_tts_voices() -> Vec<ScannedVoice> {
    vec![
        // German voices
        ScannedVoice {
            id: "de-DE-KatjaNeural".into(),
            name: "Katja".into(),
            locale: "de-DE".into(),
            gender: "Female".into(),
        },
        ScannedVoice {
            id: "de-DE-ConradNeural".into(),
            name: "Conrad".into(),
            locale: "de-DE".into(),
            gender: "Male".into(),
        },
        ScannedVoice {
            id: "de-DE-AmalaNeural".into(),
            name: "Amala".into(),
            locale: "de-DE".into(),
            gender: "Female".into(),
        },
        ScannedVoice {
            id: "de-DE-BerndNeural".into(),
            name: "Bernd".into(),
            locale: "de-DE".into(),
            gender: "Male".into(),
        },
        ScannedVoice {
            id: "de-DE-ChristophNeural".into(),
            name: "Christoph".into(),
            locale: "de-DE".into(),
            gender: "Male".into(),
        },
        ScannedVoice {
            id: "de-DE-ElkeNeural".into(),
            name: "Elke".into(),
            locale: "de-DE".into(),
            gender: "Female".into(),
        },
        ScannedVoice {
            id: "de-DE-GiselaNeural".into(),
            name: "Gisela (Kind)".into(),
            locale: "de-DE".into(),
            gender: "Female".into(),
        },
        ScannedVoice {
            id: "de-DE-KasperNeural".into(),
            name: "Kasper".into(),
            locale: "de-DE".into(),
            gender: "Male".into(),
        },
        ScannedVoice {
            id: "de-DE-KillianNeural".into(),
            name: "Killian".into(),
            locale: "de-DE".into(),
            gender: "Male".into(),
        },
        ScannedVoice {
            id: "de-DE-KlarissaNeural".into(),
            name: "Klarissa".into(),
            locale: "de-DE".into(),
            gender: "Female".into(),
        },
        ScannedVoice {
            id: "de-DE-KlausNeural".into(),
            name: "Klaus".into(),
            locale: "de-DE".into(),
            gender: "Male".into(),
        },
        ScannedVoice {
            id: "de-DE-LouisaNeural".into(),
            name: "Louisa".into(),
            locale: "de-DE".into(),
            gender: "Female".into(),
        },
        ScannedVoice {
            id: "de-DE-MajaNeural".into(),
            name: "Maja".into(),
            locale: "de-DE".into(),
            gender: "Female".into(),
        },
        ScannedVoice {
            id: "de-DE-RalfNeural".into(),
            name: "Ralf".into(),
            locale: "de-DE".into(),
            gender: "Male".into(),
        },
        ScannedVoice {
            id: "de-DE-TanjaNeural".into(),
            name: "Tanja".into(),
            locale: "de-DE".into(),
            gender: "Female".into(),
        },
        ScannedVoice {
            id: "de-DE-SeraphinaMultilingualNeural".into(),
            name: "Seraphina (Multilingual)".into(),
            locale: "de-DE".into(),
            gender: "Female".into(),
        },
        ScannedVoice {
            id: "de-DE-FlorianMultilingualNeural".into(),
            name: "Florian (Multilingual)".into(),
            locale: "de-DE".into(),
            gender: "Male".into(),
        },
        ScannedVoice {
            id: "de-AT-IngridNeural".into(),
            name: "Ingrid (AT)".into(),
            locale: "de-AT".into(),
            gender: "Female".into(),
        },
        ScannedVoice {
            id: "de-AT-JonasNeural".into(),
            name: "Jonas (AT)".into(),
            locale: "de-AT".into(),
            gender: "Male".into(),
        },
        // Japanese voices
        ScannedVoice {
            id: "ja-JP-NanamiNeural".into(),
            name: "Nanami".into(),
            locale: "ja-JP".into(),
            gender: "Female".into(),
        },
        ScannedVoice {
            id: "ja-JP-KeitaNeural".into(),
            name: "Keita".into(),
            locale: "ja-JP".into(),
            gender: "Male".into(),
        },
        ScannedVoice {
            id: "ja-JP-AoiNeural".into(),
            name: "Aoi".into(),
            locale: "ja-JP".into(),
            gender: "Female".into(),
        },
        ScannedVoice {
            id: "ja-JP-DaichiNeural".into(),
            name: "Daichi".into(),
            locale: "ja-JP".into(),
            gender: "Male".into(),
        },
        ScannedVoice {
            id: "ja-JP-MayuNeural".into(),
            name: "Mayu".into(),
            locale: "ja-JP".into(),
            gender: "Female".into(),
        },
        ScannedVoice {
            id: "ja-JP-NaokiNeural".into(),
            name: "Naoki".into(),
            locale: "ja-JP".into(),
            gender: "Male".into(),
        },
        ScannedVoice {
            id: "ja-JP-ShioriNeural".into(),
            name: "Shiori".into(),
            locale: "ja-JP".into(),
            gender: "Female".into(),
        },
        ScannedVoice {
            id: "ja-JP-MasaruMultilingualNeural".into(),
            name: "Masaru (Multilingual)".into(),
            locale: "ja-JP".into(),
            gender: "Male".into(),
        },
        // English voices
        ScannedVoice {
            id: "en-US-JennyNeural".into(),
            name: "Jenny".into(),
            locale: "en-US".into(),
            gender: "Female".into(),
        },
        ScannedVoice {
            id: "en-US-GuyNeural".into(),
            name: "Guy".into(),
            locale: "en-US".into(),
            gender: "Male".into(),
        },
        ScannedVoice {
            id: "en-US-AriaNeural".into(),
            name: "Aria".into(),
            locale: "en-US".into(),
            gender: "Female".into(),
        },
        ScannedVoice {
            id: "en-US-DavisNeural".into(),
            name: "Davis".into(),
            locale: "en-US".into(),
            gender: "Male".into(),
        },
        ScannedVoice {
            id: "en-US-SaraNeural".into(),
            name: "Sara".into(),
            locale: "en-US".into(),
            gender: "Female".into(),
        },
        ScannedVoice {
            id: "en-US-TonyNeural".into(),
            name: "Tony".into(),
            locale: "en-US".into(),
            gender: "Male".into(),
        },
        ScannedVoice {
            id: "en-US-NancyNeural".into(),
            name: "Nancy".into(),
            locale: "en-US".into(),
            gender: "Female".into(),
        },
        ScannedVoice {
            id: "en-US-AvaMultilingualNeural".into(),
            name: "Ava (Multilingual)".into(),
            locale: "en-US".into(),
            gender: "Female".into(),
        },
        ScannedVoice {
            id: "en-US-AndrewMultilingualNeural".into(),
            name: "Andrew (Multilingual)".into(),
            locale: "en-US".into(),
            gender: "Male".into(),
        },
        ScannedVoice {
            id: "en-US-EmmaMultilingualNeural".into(),
            name: "Emma (Multilingual)".into(),
            locale: "en-US".into(),
            gender: "Female".into(),
        },
        ScannedVoice {
            id: "en-US-BrianMultilingualNeural".into(),
            name: "Brian (Multilingual)".into(),
            locale: "en-US".into(),
            gender: "Male".into(),
        },
        ScannedVoice {
            id: "en-GB-SoniaNeural".into(),
            name: "Sonia (GB)".into(),
            locale: "en-GB".into(),
            gender: "Female".into(),
        },
        ScannedVoice {
            id: "en-GB-RyanNeural".into(),
            name: "Ryan (GB)".into(),
            locale: "en-GB".into(),
            gender: "Male".into(),
        },
        // Korean voices
        ScannedVoice {
            id: "ko-KR-SunHiNeural".into(),
            name: "Sun-Hi".into(),
            locale: "ko-KR".into(),
            gender: "Female".into(),
        },
        ScannedVoice {
            id: "ko-KR-InJoonNeural".into(),
            name: "InJoon".into(),
            locale: "ko-KR".into(),
            gender: "Male".into(),
        },
        // Chinese voices
        ScannedVoice {
            id: "zh-CN-XiaoxiaoNeural".into(),
            name: "Xiaoxiao".into(),
            locale: "zh-CN".into(),
            gender: "Female".into(),
        },
        ScannedVoice {
            id: "zh-CN-YunxiNeural".into(),
            name: "Yunxi".into(),
            locale: "zh-CN".into(),
            gender: "Male".into(),
        },
        // French voices
        ScannedVoice {
            id: "fr-FR-DeniseNeural".into(),
            name: "Denise".into(),
            locale: "fr-FR".into(),
            gender: "Female".into(),
        },
        ScannedVoice {
            id: "fr-FR-HenriNeural".into(),
            name: "Henri".into(),
            locale: "fr-FR".into(),
            gender: "Male".into(),
        },
        // Spanish voices
        ScannedVoice {
            id: "es-ES-ElviraNeural".into(),
            name: "Elvira".into(),
            locale: "es-ES".into(),
            gender: "Female".into(),
        },
        ScannedVoice {
            id: "es-ES-AlvaroNeural".into(),
            name: "Alvaro".into(),
            locale: "es-ES".into(),
            gender: "Male".into(),
        },
    ]
}

/// Synthesizes speech using the Edge-TTS (Microsoft Cognitive Services) WebSocket endpoint.
/// Returns base64-encoded MP3 audio as a data URL.
pub async fn synthesize_edge_tts(
    text: &str,
    voice_id: &str,
    rate: &str,
    pitch: &str,
    volume: &str,
) -> Result<String, String> {
    if text.trim().is_empty() {
        return Err(crate::err!("backend.voice.noText"));
    }
    synthesize_edge_tts_websocket(text, voice_id, rate, pitch, volume).await
}

/// Edge-TTS synthesis via the WebSocket protocol (same as the edge-tts Python library).
async fn synthesize_edge_tts_websocket(
    text: &str,
    voice_id: &str,
    rate: &str,
    pitch: &str,
    volume: &str,
) -> Result<String, String> {
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

    // We use tokio-tungstenite for WebSocket communication
    use futures_util::{SinkExt, StreamExt};
    use tokio_tungstenite::connect_async;
    use tokio_tungstenite::tungstenite::Message;

    let mut retried = false;
    let (mut ws_stream, _response) = loop {
        let request = build_edge_tts_request(&edge_tts_websocket_url(&connection_id))?;
        match connect_async(request).await {
            Ok(connected) => break connected,
            // The token depends on the time: a wrong system clock makes it invalid (HTTP 403).
            // Take the service's time from the answer and try once more, as edge-tts does.
            Err(tokio_tungstenite::tungstenite::Error::Http(response))
                if !retried && response.status().as_u16() == 403 =>
            {
                let date = response.headers().get("date").and_then(|v| v.to_str().ok());
                if !learn_edge_clock_skew(date) {
                    return Err(crate::err!("backend.voice.websocket", error = "HTTP 403"));
                }
                retried = true;
            }
            Err(e) => return Err(crate::err!("backend.voice.websocket", error = e)),
        }
    };

    // Send speech config
    let timestamp =
        chrono::Utc::now().format("%a %b %d %Y %H:%M:%S GMT+0000 (Coordinated Universal Time)");
    let config_msg = format!(
        "X-Timestamp:{}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{{\"context\":{{\"synthesis\":{{\"audio\":{{\"metadataoptions\":{{\"sentenceBoundaryEnabled\":\"false\",\"wordBoundaryEnabled\":\"false\"}},\"outputFormat\":\"audio-24khz-48kbitrate-mono-mp3\"}}}}}}}}",
        timestamp
    );
    ws_stream
        .send(Message::Text(config_msg.into()))
        .await
        .map_err(|e| crate::err!("backend.voice.sendConfig", error = e))?;

    // Send SSML
    let request_id = uuid_v4().replace('-', "");
    let ssml_msg = format!(
        "X-RequestId:{}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:{}\r\nPath:ssml\r\n\r\n{}",
        request_id, timestamp, ssml
    );
    ws_stream
        .send(Message::Text(ssml_msg.into()))
        .await
        .map_err(|e| crate::err!("backend.voice.sendSsml", error = e))?;

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
                        if header
                            .windows(header_marker.len())
                            .any(|w| w == header_marker)
                        {
                            audio_data.extend_from_slice(&data[2 + header_len..]);
                        }
                    }
                }
            }
            Ok(Message::Text(txt)) => {
                let txt_str: &str = &txt;
                debug!("Edge-TTS Message: {}", txt_str);
                if txt_str.contains("Path:turn.end") {
                    break;
                }
            }
            Ok(Message::Close(c)) => {
                info!("Edge-TTS Closed: {:?}", c);
                if let Some(close_frame) = c
                    && close_frame.reason.contains("Unsupported voice")
                {
                    return Err(crate::err!(
                        "backend.voice.edgeVoiceRetired",
                        error = close_frame.reason
                    ));
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
        return Err(crate::err!("backend.voice.edgeNoAudio"));
    }

    info!(
        "Edge-TTS: {} Bytes Audio-Daten empfangen.",
        audio_data.len()
    );
    let b64 = base64::prelude::BASE64_STANDARD.encode(&audio_data);
    Ok(format!("data:audio/mp3;base64,{}", b64))
}

pub(super) fn build_edge_tts_request(
    ws_url: &str,
) -> Result<tokio_tungstenite::tungstenite::http::Request<()>, String> {
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;
    use tokio_tungstenite::tungstenite::http::header::{
        ACCEPT_ENCODING, ACCEPT_LANGUAGE, CACHE_CONTROL, COOKIE, HeaderValue, ORIGIN, PRAGMA,
        USER_AGENT,
    };

    // IntoClientRequest generates the mandatory WebSocket handshake headers,
    // including a fresh Sec-WebSocket-Key. Building a plain HTTP request here
    // would bypass that logic and tungstenite would reject it before connecting.
    let mut request = ws_url
        .into_client_request()
        .map_err(|e| crate::err!("backend.voice.websocketRequest", error = e))?;

    request
        .headers_mut()
        .insert(USER_AGENT, HeaderValue::from_static(EDGE_TTS_USER_AGENT));
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
    request
        .headers_mut()
        .insert(ACCEPT_LANGUAGE, HeaderValue::from_static("en-US,en;q=0.9"));
    let muid = uuid_v4().replace('-', "").to_uppercase();
    request.headers_mut().insert(
        COOKIE,
        HeaderValue::from_str(&format!("muid={};", muid))
            .map_err(|e| crate::err!("backend.voice.edgeCookie", error = e))?,
    );

    Ok(request)
}

pub(super) fn edge_tts_websocket_url(connection_id: &str) -> String {
    format!(
        "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1\
         ?TrustedClientToken={EDGE_TTS_TRUSTED_CLIENT_TOKEN}\
         &ConnectionId={connection_id}\
         &Sec-MS-GEC={}\
         &Sec-MS-GEC-Version={}",
        generate_edge_sec_ms_gec(edge_now()),
        crate::modules::edge_tts_drm::SEC_MS_GEC_VERSION
    )
}

/// Seconds the read-aloud service's clock is ahead of this computer's, learned from a rejected
/// request (a PC clock an hour off was enough for HTTP 403, 24.10.2026).
static EDGE_CLOCK_SKEW: std::sync::atomic::AtomicI64 = std::sync::atomic::AtomicI64::new(0);

/// The current time as the service sees it.
pub(super) fn edge_now() -> i64 {
    chrono::Utc::now().timestamp() + EDGE_CLOCK_SKEW.load(std::sync::atomic::Ordering::Relaxed)
}

/// The skew an HTTP `Date` header reveals against `now`.
pub(super) fn clock_skew_from_date(date: &str, now: i64) -> Option<i64> {
    chrono::DateTime::parse_from_rfc2822(date)
        .ok()
        .map(|server| server.timestamp() - now)
}

/// Adopts the service's time from a rejected answer's `Date` header; false without one.
fn learn_edge_clock_skew(date: Option<&str>) -> bool {
    let Some(skew) = date.and_then(|d| clock_skew_from_date(d, chrono::Utc::now().timestamp()))
    else {
        return false;
    };
    tracing::warn!("Edge-TTS: Systemuhr weicht {skew} s von der Serverzeit ab, korrigiere");
    EDGE_CLOCK_SKEW.store(skew, std::sync::atomic::Ordering::Relaxed);
    true
}

/// The token the read-aloud service requires (version 2 since late 2026, see `edge_tts_drm`).
pub(super) fn generate_edge_sec_ms_gec(unix_timestamp: i64) -> String {
    crate::modules::edge_tts_drm::sec_ms_gec(unix_timestamp, EDGE_TTS_TRUSTED_CLIENT_TOKEN)
}
