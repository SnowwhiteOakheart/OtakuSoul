use base64::Engine as _;

use super::edge::{
    EDGE_TTS_TRUSTED_CLIENT_TOKEN, edge_now, generate_edge_sec_ms_gec, list_edge_tts_voices,
    synthesize_edge_tts,
};
use super::filter::{actions_to_sound_tags, clean_text_for_tts};
use super::models::{RvcConfig, ScannedVoice, TtsEngine, VoiceConfig, http_client};

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
                "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken={}&Sec-MS-GEC={}&Sec-MS-GEC-Version={}",
                EDGE_TTS_TRUSTED_CLIENT_TOKEN,
                generate_edge_sec_ms_gec(edge_now()),
                crate::modules::edge_tts_drm::SEC_MS_GEC_VERSION
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
                                v.get("Gender").and_then(|s| s.as_str()),
                            ) {
                                // Extract a readable name from ShortName (e.g. "de-DE-KatjaNeural" -> "Katja")
                                let name = id
                                    .split('-')
                                    .next_back()
                                    .unwrap_or(id)
                                    .replace("Neural", "");
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
                .map_err(|e| crate::err!("backend.voice.elevenVoicesLoad", error = e))?;

            if !response.status().is_success() {
                let status = response.status();
                let body = response.text().await.unwrap_or_default();
                return Err(crate::err!(
                    "backend.voice.elevenApi",
                    status = status,
                    error = body
                ));
            }

            let payload: serde_json::Value = response
                .json()
                .await
                .map_err(|e| crate::err!("backend.voice.elevenVoicesInvalid", error = e))?;
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
                            Some(ScannedVoice {
                                id,
                                name,
                                locale,
                                gender,
                            })
                        })
                        .collect()
                })
                .unwrap_or_default();
            Ok(voices)
        }
        "openai" => {
            // Standard OpenAI voices
            Ok(vec![
                ScannedVoice {
                    id: "alloy".into(),
                    name: "Alloy".into(),
                    locale: "multi".into(),
                    gender: "Neutral".into(),
                },
                ScannedVoice {
                    id: "ash".into(),
                    name: "Ash".into(),
                    locale: "multi".into(),
                    gender: "Neutral".into(),
                },
                ScannedVoice {
                    id: "ballad".into(),
                    name: "Ballad".into(),
                    locale: "multi".into(),
                    gender: "Neutral".into(),
                },
                ScannedVoice {
                    id: "coral".into(),
                    name: "Coral".into(),
                    locale: "multi".into(),
                    gender: "Neutral".into(),
                },
                ScannedVoice {
                    id: "echo".into(),
                    name: "Echo".into(),
                    locale: "multi".into(),
                    gender: "Male".into(),
                },
                ScannedVoice {
                    id: "fable".into(),
                    name: "Fable".into(),
                    locale: "multi".into(),
                    gender: "Male".into(),
                },
                ScannedVoice {
                    id: "onyx".into(),
                    name: "Onyx".into(),
                    locale: "multi".into(),
                    gender: "Male".into(),
                },
                ScannedVoice {
                    id: "nova".into(),
                    name: "Nova".into(),
                    locale: "multi".into(),
                    gender: "Female".into(),
                },
                ScannedVoice {
                    id: "sage".into(),
                    name: "Sage".into(),
                    locale: "multi".into(),
                    gender: "Neutral".into(),
                },
                ScannedVoice {
                    id: "shimmer".into(),
                    name: "Shimmer".into(),
                    locale: "multi".into(),
                    gender: "Female".into(),
                },
                ScannedVoice {
                    id: "verse".into(),
                    name: "Verse".into(),
                    locale: "multi".into(),
                    gender: "Neutral".into(),
                },
                ScannedVoice {
                    id: "marin".into(),
                    name: "Marin".into(),
                    locale: "multi".into(),
                    gender: "Neutral".into(),
                },
                ScannedVoice {
                    id: "cedar".into(),
                    name: "Cedar".into(),
                    locale: "multi".into(),
                    gender: "Neutral".into(),
                },
            ])
        }
        _ => Ok(Vec::new()),
    }
}

pub async fn synthesize_elevenlabs(
    text: &str,
    voice_id: &str,
    api_key: &str,
) -> Result<String, String> {
    if text.trim().is_empty() {
        return Err(crate::err!("backend.voice.noText"));
    }
    if api_key.is_empty() {
        return Err(crate::err!("backend.voice.elevenNoKey"));
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
        .map_err(|e| crate::err!("backend.voice.elevenRequest", error = e))?;

    if !response.status().is_success() {
        let status = response.status();
        let err_text = response.text().await.unwrap_or_default();
        return Err(crate::err!(
            "backend.voice.elevenApi",
            status = status,
            error = err_text
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| crate::err!("backend.voice.elevenAudio", error = e))?;
    let b64 = base64::prelude::BASE64_STANDARD.encode(&bytes);
    Ok(format!("data:audio/mp3;base64,{}", b64))
}

/// OpenAI-compatible TTS synthesis (works with OpenAI, Kokoro, AllTalk etc.).
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
        return Err(crate::err!("backend.voice.noText"));
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

    let response = req
        .send()
        .await
        .map_err(|e| crate::err!("backend.voice.openaiRequest", error = e))?;

    if !response.status().is_success() {
        let status = response.status();
        let err_text = response.text().await.unwrap_or_default();
        return Err(crate::err!(
            "backend.voice.openaiApi",
            status = status,
            error = err_text
        ));
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
    let bytes = response
        .bytes()
        .await
        .map_err(|e| crate::err!("backend.voice.openaiAudio", error = e))?;
    let b64 = base64::prelude::BASE64_STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, b64))
}

fn decode_audio_data_url(data_url: &str) -> Result<(String, Vec<u8>), String> {
    let (metadata, encoded) = data_url
        .split_once(',')
        .ok_or_else(|| crate::err!("backend.voice.invalidDataUrl"))?;
    let mime = metadata
        .strip_prefix("data:")
        .and_then(|value| value.split(';').next())
        .unwrap_or("audio/mpeg")
        .to_string();
    let bytes = base64::prelude::BASE64_STANDARD
        .decode(encoded)
        .map_err(|e| crate::err!("backend.voice.base64", error = e))?;
    Ok((mime, bytes))
}

async fn apply_rvc(data_url: &str, config: &RvcConfig) -> Result<String, String> {
    if !config.enabled {
        return Ok(data_url.to_string());
    }
    if config.endpoint.trim().is_empty() {
        return Err(crate::err!("backend.voice.rvcNoEndpoint"));
    }

    let (mime, audio) = decode_audio_data_url(data_url)?;
    let extension = if mime.contains("wav") { "wav" } else { "mp3" };
    let audio_part = reqwest::multipart::Part::bytes(audio)
        .file_name(format!("speech.{}", extension))
        .mime_str(&mime)
        .map_err(|e| crate::err!("backend.voice.rvcMime", error = e))?;
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
        .map_err(|e| crate::err!("backend.voice.rvcRequest", error = e))?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(crate::err!(
            "backend.voice.rvcStatus",
            status = status,
            error = body
        ));
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
        .map_err(|e| crate::err!("backend.voice.rvcAudio", error = e))?;
    Ok(format!(
        "data:{};base64,{}",
        result_mime,
        base64::prelude::BASE64_STANDARD.encode(bytes)
    ))
}

/// The speaking style for a local voice with style control: the character's own style plus the
/// feeling of this text (when enabled and not neutral).
pub(super) fn local_speaking_style(config: &VoiceConfig, text: &str) -> String {
    let feeling = config
        .local_emotion
        .then(|| crate::modules::emotions::classify_emotion(text))
        .and_then(|result| crate::modules::emotions::speaking_style(&result.emotion));
    [config.local_style.trim(), feeling.unwrap_or_default()]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

/// Dispatches TTS synthesis based on the VoiceConfig engine.
pub async fn synthesize_speech(text: &str, config: &VoiceConfig) -> Result<String, String> {
    // The feeling comes from the text as written: actions (*sighs sadly*) are the strongest cues
    // and the filter below removes them.
    let style = if config.engine == TtsEngine::Local {
        local_speaking_style(config, text)
    } else {
        String::new()
    };
    let tagged;
    let text = if config.engine == TtsEngine::Local
        && crate::modules::tts_local::speaks_sound_tags(config.local_model_id.as_deref())
    {
        tagged = actions_to_sound_tags(text);
        tagged.as_str()
    } else {
        text
    };
    let cleaned = clean_text_for_tts(text, &config.filter_mode, &config.custom_regex);
    if cleaned.is_empty() {
        return Err(crate::err!("backend.voice.nothingLeft"));
    }

    let synthesized = match config.engine {
        TtsEngine::Edge => {
            synthesize_edge_tts(
                &cleaned,
                &config.voice_id,
                &config.rate,
                &config.pitch,
                &config.volume,
            )
            .await
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
            )
            .await
        }
        TtsEngine::Local => {
            crate::modules::tts_local::synthesize_data_url(
                config.local_model_id.as_deref(),
                &config.voice_id,
                &cleaned,
                &config.rate,
                &config.openai_instructions,
                &style,
            )
            .await
        }
        TtsEngine::Disabled => Err(crate::err!("backend.voice.ttsDisabled")),
    }?;

    apply_rvc(&synthesized, &config.rvc).await
}
