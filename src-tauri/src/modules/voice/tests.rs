use base64::Engine as _;
use std::fs;

use super::*;

#[test]
fn the_narrator_has_its_own_default_voice() {
    let narrator = narrator_default_config("de");
    let character = VoiceConfig::default();
    assert_ne!(
        narrator.voice_id, character.voice_id,
        "sounds like the characters"
    );
    assert_eq!(narrator.voice_id, "de-DE-ConradNeural");
    assert_eq!(narrator_default_config("ja").voice_id, "ja-JP-KeitaNeural");
    assert_eq!(narrator_default_config("fr").voice_id, "en-GB-RyanNeural");
    // It reads the actions it is given and is ready for VoiceDesign and style voices.
    assert_eq!(narrator.filter_mode, TtsFilterMode::All);
    assert!(!narrator.openai_instructions.is_empty() && !narrator.local_style.is_empty());
    assert!(!narrator.narrator_for_actions);
}

#[test]
fn a_style_voice_speaks_with_the_feeling_of_the_line() {
    let config = VoiceConfig {
        engine: TtsEngine::Local,
        local_style: " Speak softly. ".into(),
        ..VoiceConfig::default()
    };
    let sad = local_speaking_style(&config, "*seufzt traurig* Ich vermisse dich so sehr.");
    assert!(sad.starts_with("Speak softly. "), "{sad}");
    assert!(sad.contains("sadly"), "{sad}");
    // A plain line keeps only the character's own style.
    assert_eq!(
        local_speaking_style(&config, "Der Zug fährt um acht."),
        "Speak softly."
    );
    // Without feelings the style stays as it is; without both there is nothing to send.
    let calm = VoiceConfig {
        local_emotion: false,
        ..config.clone()
    };
    assert_eq!(
        local_speaking_style(&calm, "*seufzt traurig*"),
        "Speak softly."
    );
    let empty = VoiceConfig {
        local_style: String::new(),
        local_emotion: false,
        ..config
    };
    assert_eq!(local_speaking_style(&empty, "*seufzt traurig*"), "");
}

#[test]
fn roleplay_actions_become_sound_tags() {
    let text = "*lacht leise* Das ist lustig. *kichert* *seufzt tief* \"Na gut.\" *schaut weg*";
    let tagged = actions_to_sound_tags(text);
    assert!(tagged.contains("[laugh]"));
    assert!(tagged.contains("[chuckle]"));
    assert!(tagged.contains("[sigh]"));
    // Actions without a sound stay and are removed by the filter as before.
    assert!(tagged.contains("*schaut weg*"));
    let cleaned = clean_text_for_tts(&tagged, &TtsFilterMode::StripActions, "");
    assert_eq!(
        cleaned,
        "[laugh] Das ist lustig. [chuckle] [sigh] \"Na gut.\""
    );
    assert!(actions_to_sound_tags("*clears her throat* Well.").contains("[clear throat]"));
}

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
fn reply_tags_are_not_read_aloud() {
    let text = clean_text_for_tts(
        "\"Hallo!\" <state>{\"Mood\": \"Happy\"}</state> [emotion: blush]",
        &TtsFilterMode::All,
        "",
    );
    assert_eq!(text, "\"Hallo!\"");
    assert_eq!(
        clean_text_for_tts("Ja. [emotion: bl", &TtsFilterMode::All, ""),
        "Ja."
    );
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
fn test_clean_text_for_tts_dialogue_only_typographic_quotes() {
    for input in [
        "*Sie schaut auf* „Hallo!“ *lächelt* „Wie geht es dir?“",
        "*She looks up* “Hello!” *smiles* “How are you?”",
        "*Sie schaut auf* »Hallo!« *lächelt* »Wie geht es dir?«",
        "*Sie schaut auf* «Hallo!» *lächelt* «Wie geht es dir?»",
        "*見上げる*「こんにちは！」*微笑む*「元気？」",
    ] {
        let result = clean_text_for_tts(input, &TtsFilterMode::DialogueOnly, "");
        assert!(!result.contains('*'), "{input} -> {result}");
        assert!(
            !result.contains("lächelt") && !result.contains("smiles") && !result.contains("微笑む"),
            "{input} -> {result}"
        );
    }
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
    assert!(
        headers
            .get("cookie")
            .unwrap()
            .to_str()
            .unwrap()
            .starts_with("muid=")
    );
    assert!(!headers.contains_key("sec-websocket-protocol"));
}

#[test]
fn the_service_time_comes_from_a_date_header() {
    let now = 1_792_857_595; // Sat, 24 Oct 2026 15:59:55 GMT
    assert_eq!(
        clock_skew_from_date("Sat, 24 Oct 2026 17:04:35 GMT", now),
        Some(3880)
    );
    assert_eq!(clock_skew_from_date("no date", now), None);
}

#[test]
fn test_edge_tts_security_token_and_url() {
    // Version 2: "<16 hex>-<64 hex>" (reference values in `edge_tts_drm`).
    let token = generate_edge_sec_ms_gec(1_700_000_000);
    assert_eq!(
        token,
        "2CD23A2CA0B2595A-F3C846C370E05F9CC83ACC5F995C5F5D87A4D0F14CE8936A0F902E64099E38A2"
    );

    let url = edge_tts_websocket_url("test-connection");
    assert!(url.contains("TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4"));
    assert!(url.contains("ConnectionId=test-connection"));
    assert!(url.contains("Sec-MS-GEC="));
    assert!(url.contains("Sec-MS-GEC-Version=2-143.0.3650.75"));
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
    let bytes: Vec<u8> = samples
        .iter()
        .flat_map(|sample| sample.to_le_bytes())
        .collect();
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
