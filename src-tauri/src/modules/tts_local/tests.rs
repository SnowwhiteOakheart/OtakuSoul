use super::*;

#[test]
fn a_designed_voice_brings_its_description() {
    let designed = [super::DesignedVoice {
        id: "abc".into(),
        name: "Rauchige Erzählerin".into(),
        description: " A calm, smoky female voice ".into(),
    }];
    let pick = |voice_id, own| super::design_description(voice_id, &designed, own);
    assert_eq!(pick("design:abc", "ignored"), "A calm, smoky female voice");
    // A deleted designed voice falls back to the character's own description.
    assert_eq!(pick("design:gone", " own "), "own");
    assert_eq!(pick("", "own"), "own");
}

#[test]
fn chatterbox_gets_the_clone_as_wav_file() {
    let chatterbox = catalog_model("chatterbox-multilingual").unwrap();
    let turbo = catalog_model("chatterbox-turbo").unwrap();
    assert!(chatterbox.cloning && chatterbox.clone_experimental && turbo.cloning);
    assert_eq!(clone_voice_name(chatterbox, "anna-1"), "anna-1.wav");
    assert_eq!(
        clone_voice_name(catalog_model("tada-3b-ml").unwrap(), "anna-1"),
        "anna-1"
    );
}

#[test]
fn catalog_is_consistent() {
    for model in CATALOG {
        assert_eq!(
            model.files.iter().filter(|f| f.role == Role::Main).count(),
            1,
            "{}",
            model.id
        );
        for file in model.files {
            assert!(
                file.file.sha256.is_some_and(|s| s.len() == 64),
                "{}",
                file.file.path
            );
        }
        for voice in model.voices {
            if let Some(name) = voice.file {
                assert!(
                    model.files.iter().any(|f| f.file.file_name() == name),
                    "{} missing {}",
                    model.id,
                    name
                );
            }
        }
        // Without presets a model needs a clone, unless the voice is described (VoiceDesign).
        assert_eq!(
            model.needs_clone,
            model.voices.is_empty() && !model.voice_design,
            "{}",
            model.id
        );
        // Non-commercial weights must be flagged by their licence name.
        assert_eq!(
            model.noncommercial,
            model.license.contains("NC"),
            "{}",
            model.id
        );
    }
}

#[test]
fn resolves_voices_per_model() {
    let kokoro = catalog_model("kokoro-de").unwrap();
    assert_eq!(
        resolve_voice(kokoro, "preset:dm_bernd").unwrap(),
        VoiceChoice::Preset("kokoro-voice-dm_bernd.gguf".into())
    );
    // Unknown presets fall back to the model's first voice.
    assert_eq!(
        resolve_voice(kokoro, "").unwrap(),
        VoiceChoice::Preset("kokoro-voice-df_victoria.gguf".into())
    );
    // Built-in speakers go by name; the old 0.6B Base id maps to CustomVoice.
    let qwen = catalog_model("qwen3-tts-0.6b").unwrap();
    assert_eq!(qwen.id, "qwen3-tts-customvoice-0.6b");
    assert_eq!(
        resolve_voice(qwen, "preset:serena").unwrap(),
        VoiceChoice::Preset("serena".into())
    );
    assert_eq!(
        resolve_voice(qwen, "preset:default").unwrap(),
        VoiceChoice::Preset("vivian".into())
    );
    // Kokoro cannot clone; F5 and the 1.7B model need a clone.
    assert!(resolve_voice(kokoro, "clone:someone").is_err());
    assert!(resolve_voice(catalog_model("f5-tts-v1").unwrap(), "preset:default").is_err());
    assert!(resolve_voice(catalog_model("qwen3-tts-1.7b").unwrap(), "preset:vivian").is_err());
}

#[test]
fn resamples_references_to_24_khz() {
    let one_second_16k = vec![0.5f32; 16_000];
    let out = resample_linear(&one_second_16k, 16_000, REFERENCE_RATE);
    assert_eq!(out.len(), 24_000);
    assert!(out.iter().all(|s| (s - 0.5).abs() < 1e-6));
    assert_eq!(
        resample_linear(&one_second_16k, 16_000, 16_000).len(),
        16_000
    );
}

#[test]
fn slugs_voice_names() {
    let id = slug("Mein Stimm-Sample Nr. 1");
    assert!(id.starts_with("mein-stimm-sample-nr-1-"), "{id}");
    assert!(!id.contains(['/', '.', ' ']));
}
