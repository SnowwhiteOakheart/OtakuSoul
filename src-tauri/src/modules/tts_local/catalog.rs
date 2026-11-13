//! Model catalog, paths and installation checks for local TTS.

use std::path::PathBuf;

use crate::modules::model_files::RemoteFile;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Role {
    Main,
    /// Companion GGUF (`--codec-model`).
    Codec,
    /// Voice packs and other files that only need to sit next to the model.
    Extra,
}

pub(super) struct TtsFile {
    pub(super) role: Role,
    pub(super) file: RemoteFile,
}

pub(super) struct PresetVoice {
    pub(super) id: &'static str,
    pub(super) label: &'static str,
    /// Voice pack in the models folder; `None` for the model's built-in voice.
    pub(super) file: Option<&'static str>,
    pub(super) language: &'static str,
}

pub(super) struct TtsModel {
    pub(super) id: &'static str,
    pub(super) name: &'static str,
    pub(super) backend: &'static str,
    pub(super) license: &'static str,
    /// Weights may only be used non-commercially; locked until the user allows it.
    pub(super) noncommercial: bool,
    pub(super) languages: &'static [&'static str],
    /// Can speak with a voice cloned from a recording.
    pub(super) cloning: bool,
    /// Needs a cloned voice (no preset of its own).
    pub(super) needs_clone: bool,
    /// Cloning works but CrispASR marks it experimental (Chatterbox: native WAV path, 24 kHz).
    pub(super) clone_experimental: bool,
    /// The voice comes from a description (`instructions`) instead of a preset or clone.
    pub(super) voice_design: bool,
    /// A preset voice that takes a speaking style (`instructions`): manner and feeling of a line.
    pub(super) style_control: bool,
    pub(super) vram_mb: u64,
    pub(super) files: &'static [TtsFile],
    pub(super) voices: &'static [PresetVoice],
    /// Language the server is started with (kokoro picks its German backbone this way).
    pub(super) start_language: Option<&'static str>,
}

const QWEN_LANGS: &[&str] = &["de", "en", "ru", "ja", "zh", "ko", "fr", "es", "it", "pt"];
const CHATTERBOX_LANGS: &[&str] = &[
    "ar", "da", "de", "el", "en", "es", "fi", "fr", "he", "hi", "it", "ja", "ko", "ms", "nl", "no",
    "pl", "pt", "ru", "sv", "sw", "tr", "zh",
];

/// The nine built-in speakers of Qwen3-TTS CustomVoice (0.6B and 1.7B).
const QWEN_PRESET_VOICES: &[PresetVoice] = &[
    PresetVoice {
        id: "vivian",
        label: "Vivian",
        file: None,
        language: "multi",
    },
    PresetVoice {
        id: "serena",
        label: "Serena",
        file: None,
        language: "multi",
    },
    PresetVoice {
        id: "ono_anna",
        label: "Ono Anna",
        file: None,
        language: "multi",
    },
    PresetVoice {
        id: "sohee",
        label: "Sohee",
        file: None,
        language: "multi",
    },
    PresetVoice {
        id: "ryan",
        label: "Ryan",
        file: None,
        language: "multi",
    },
    PresetVoice {
        id: "aiden",
        label: "Aiden",
        file: None,
        language: "multi",
    },
    PresetVoice {
        id: "dylan",
        label: "Dylan",
        file: None,
        language: "multi",
    },
    PresetVoice {
        id: "eric",
        label: "Eric",
        file: None,
        language: "multi",
    },
    PresetVoice {
        id: "uncle_fu",
        label: "Uncle Fu",
        file: None,
        language: "multi",
    },
];

pub(super) const CATALOG: &[TtsModel] = &[
    // The 0.6B *Base* GGUF lacks the codec language table, so every language but English ran
    // in "auto" and produced gibberish (e2e test 2026-10-01). Built-in voices therefore use
    // CustomVoice (has the table) and cloning the 1.7B Base model.
    TtsModel {
        id: "qwen3-tts-customvoice-0.6b",
        name: "Qwen3-TTS 0.6B (eingebaute Stimmen)",
        backend: "qwen3-tts-customvoice",
        license: "Apache-2.0",
        noncommercial: false,
        languages: QWEN_LANGS,
        cloning: false,
        needs_clone: false,
        clone_experimental: false,
        voice_design: false,
        style_control: false,
        vram_mb: 3_200,
        files: &[
            TtsFile {
                role: Role::Main,
                file: RemoteFile {
                    repo: "cstr/qwen3-tts-0.6b-customvoice-GGUF",
                    path: "qwen3-tts-12hz-0.6b-customvoice-q8_0.gguf",
                    size: 967_980_192,
                    sha256: Some(
                        "5227dcbc4df7c5533341d111cc469fa491a48e722b23dd10f553181b52dff2d9",
                    ),
                },
            },
            TtsFile {
                role: Role::Codec,
                file: RemoteFile {
                    repo: "cstr/qwen3-tts-tokenizer-12hz-GGUF",
                    path: "qwen3-tts-tokenizer-12hz.gguf",
                    size: 358_453_280,
                    sha256: Some(
                        "70dc95dbfdd9aa5d9d406236ff771d061bf17b0cda02a72513953355606e719b",
                    ),
                },
            },
        ],
        voices: QWEN_PRESET_VOICES,
        start_language: None,
    },
    // Same speakers as the 0.6B, but they take a speaking style (`instructions`): manner and
    // feeling per line. Age or gender in the style bend the voice (tested 23.10.2026).
    TtsModel {
        id: "qwen3-tts-customvoice-1.7b",
        name: "Qwen3-TTS 1.7B (eingebaute Stimmen mit Sprechstil)",
        backend: "qwen3-tts-1.7b-customvoice",
        license: "Apache-2.0",
        noncommercial: false,
        languages: QWEN_LANGS,
        cloning: false,
        needs_clone: false,
        clone_experimental: false,
        voice_design: false,
        style_control: true,
        vram_mb: 3_600,
        files: &[
            TtsFile {
                role: Role::Main,
                file: RemoteFile {
                    repo: "cstr/qwen3-tts-1.7b-customvoice-GGUF",
                    path: "qwen3-tts-12hz-1.7b-customvoice-q8_0.gguf",
                    size: 2_042_225_952,
                    sha256: Some(
                        "3985813e21a3f27407110ba3afcd8f12ebc19734a5160ec31992637cd62aa67e",
                    ),
                },
            },
            TtsFile {
                role: Role::Codec,
                file: RemoteFile {
                    repo: "cstr/qwen3-tts-tokenizer-12hz-GGUF",
                    path: "qwen3-tts-tokenizer-12hz.gguf",
                    size: 358_453_280,
                    sha256: Some(
                        "70dc95dbfdd9aa5d9d406236ff771d061bf17b0cda02a72513953355606e719b",
                    ),
                },
            },
        ],
        voices: QWEN_PRESET_VOICES,
        start_language: None,
    },
    TtsModel {
        id: "qwen3-tts-1.7b",
        name: "Qwen3-TTS 1.7B (Stimmklon)",
        backend: "qwen3-tts-1.7b-base",
        license: "Apache-2.0",
        noncommercial: false,
        languages: QWEN_LANGS,
        cloning: true,
        needs_clone: true,
        clone_experimental: false,
        voice_design: false,
        style_control: false,
        vram_mb: 3_600,
        files: &[
            TtsFile {
                role: Role::Main,
                file: RemoteFile {
                    repo: "cstr/qwen3-tts-1.7b-base-GGUF",
                    path: "qwen3-tts-12hz-1.7b-base-q8_0.gguf",
                    size: 2_066_258_176,
                    sha256: Some(
                        "bbb93ab1f4a3f771f94fc6f68404b2b969bdf3b14c6303473dbf64c63011520d",
                    ),
                },
            },
            TtsFile {
                role: Role::Codec,
                file: RemoteFile {
                    repo: "cstr/qwen3-tts-tokenizer-12hz-GGUF",
                    path: "qwen3-tts-tokenizer-12hz.gguf",
                    size: 358_453_280,
                    sha256: Some(
                        "70dc95dbfdd9aa5d9d406236ff771d061bf17b0cda02a72513953355606e719b",
                    ),
                },
            },
        ],
        voices: &[],
        start_language: None,
    },
    // VoiceDesign: the voice is described in words (character card or voice settings).
    TtsModel {
        id: "qwen3-tts-1.7b-voicedesign",
        name: "Qwen3-TTS 1.7B VoiceDesign (Stimme per Beschreibung)",
        backend: "qwen3-tts-1.7b-voicedesign",
        license: "Apache-2.0",
        noncommercial: false,
        languages: QWEN_LANGS,
        cloning: false,
        needs_clone: false,
        clone_experimental: false,
        voice_design: true,
        style_control: false,
        vram_mb: 3_600,
        files: &[
            TtsFile {
                role: Role::Main,
                file: RemoteFile {
                    repo: "cstr/qwen3-tts-1.7b-voicedesign-GGUF",
                    path: "qwen3-tts-12hz-1.7b-voicedesign-q8_0.gguf",
                    size: 2_042_225_536,
                    sha256: Some(
                        "ce9c6d69146891f7854ac46be3bf4e40f803fbebbfe7cdbd12ae3a4b24777295",
                    ),
                },
            },
            TtsFile {
                role: Role::Codec,
                file: RemoteFile {
                    repo: "cstr/qwen3-tts-tokenizer-12hz-GGUF",
                    path: "qwen3-tts-tokenizer-12hz.gguf",
                    size: 358_453_280,
                    sha256: Some(
                        "70dc95dbfdd9aa5d9d406236ff771d061bf17b0cda02a72513953355606e719b",
                    ),
                },
            },
        ],
        voices: &[],
        start_language: None,
    },
    // HumeAI TADA 3B multilingual (Llama 3.2 backbone): one reference voice per language from
    // FLEURS (CC-BY-4.0); clones from a WAV with the German/English aligner next to the model.
    TtsModel {
        id: "tada-3b-ml",
        name: "TADA 3B (mehrsprachig, Stimmklon)",
        backend: "tada-3b-ml",
        license: "Llama 3.2 Community License",
        noncommercial: false,
        languages: &["de", "en", "fr", "es", "it", "pl", "pt", "ja", "ar", "zh"],
        cloning: true,
        needs_clone: false,
        clone_experimental: false,
        voice_design: false,
        style_control: false,
        vram_mb: 7_500,
        files: &[
            TtsFile {
                role: Role::Main,
                file: RemoteFile {
                    repo: "cstr/tada-tts-3b-ml-GGUF",
                    path: "tada-tts-3b-ml-q8_0.gguf",
                    size: 5_579_404_608,
                    sha256: Some(
                        "23da2b8230c2e7b1f8753b80200d059c75e0752ef37626917078952e5363cf2d",
                    ),
                },
            },
            TtsFile {
                role: Role::Codec,
                file: RemoteFile {
                    repo: "cstr/tada-tts-3b-ml-GGUF",
                    path: "tada-codec-f16.gguf",
                    size: 250_173_056,
                    sha256: Some(
                        "adfb353a0e529bbef61fe062b9fde3a0e99f01f6ffd21dde610a6b2bffd12720",
                    ),
                },
            },
            TtsFile {
                role: Role::Extra,
                file: RemoteFile {
                    // Encoder and aligners: the server clones a WAV next to the model (CRISPASR_TADA_WAV_CLONE).
                    repo: "cstr/tada-tts-3b-ml-GGUF",
                    path: "tada-encoder-f16.gguf",
                    size: 186_781_600,
                    sha256: Some(
                        "f441f17eaf6ad8b8c95fd26e04f38133d677f0812496301c682fe7411bcaabee",
                    ),
                },
            },
            TtsFile {
                role: Role::Extra,
                file: RemoteFile {
                    repo: "cstr/tada-tts-3b-ml-GGUF",
                    path: "tada-aligner-de.gguf",
                    size: 520_459_264,
                    sha256: Some(
                        "ada8d0c45a13301980b5deee236e1c704a7bc85d61f720aeda0e950c69e36efb",
                    ),
                },
            },
            TtsFile {
                role: Role::Extra,
                file: RemoteFile {
                    repo: "cstr/tada-tts-3b-ml-GGUF",
                    path: "tada-aligner-en.gguf",
                    size: 520_459_232,
                    sha256: Some(
                        "a7bbda1b61a09c17e947346a7da57621e4dd954fdc51e01eeb8f7692b8862ad6",
                    ),
                },
            },
            TtsFile {
                role: Role::Extra,
                file: RemoteFile {
                    repo: "cstr/tada-tts-3b-ml-GGUF",
                    path: "tada-ref-de.gguf",
                    size: 117_664,
                    sha256: Some(
                        "ea7cac563039be3b96107f92c34a0a0fce406952b5c5a5821bb0c7b37c210b39",
                    ),
                },
            },
            TtsFile {
                role: Role::Extra,
                file: RemoteFile {
                    repo: "cstr/tada-tts-3b-ml-GGUF",
                    path: "tada-ref.gguf",
                    size: 466_464,
                    sha256: Some(
                        "7efcc96795dd2b27577a4a81eb52d0c3add5ffa67f325fba5a938f3f98067ace",
                    ),
                },
            },
            TtsFile {
                role: Role::Extra,
                file: RemoteFile {
                    repo: "cstr/tada-tts-3b-ml-GGUF",
                    path: "tada-ref-fr.gguf",
                    size: 136_160,
                    sha256: Some(
                        "3415f1224001008b6c2e41593c46dd76745e9c6445edf5e08fc2f33408f7cdd6",
                    ),
                },
            },
            TtsFile {
                role: Role::Extra,
                file: RemoteFile {
                    repo: "cstr/tada-tts-3b-ml-GGUF",
                    path: "tada-ref-es.gguf",
                    size: 37_504,
                    sha256: Some(
                        "63555406ffef0b9a423cc86be8b97f197c5073ce5fb77f45bd80f2c49b9d6b22",
                    ),
                },
            },
            TtsFile {
                role: Role::Extra,
                file: RemoteFile {
                    repo: "cstr/tada-tts-3b-ml-GGUF",
                    path: "tada-ref-it.gguf",
                    size: 72_448,
                    sha256: Some(
                        "1de683086be2a7e9758246ce06420759279139ab731dcd1ab949c3d6b2fe79f8",
                    ),
                },
            },
            TtsFile {
                role: Role::Extra,
                file: RemoteFile {
                    repo: "cstr/tada-tts-3b-ml-GGUF",
                    path: "tada-ref-pl.gguf",
                    size: 140_224,
                    sha256: Some(
                        "aac0934f55ad19c9d3315aade614cef694533830da534a3edd9ecb0bf60eb55b",
                    ),
                },
            },
            TtsFile {
                role: Role::Extra,
                file: RemoteFile {
                    repo: "cstr/tada-tts-3b-ml-GGUF",
                    path: "tada-ref-pt.gguf",
                    size: 136_224,
                    sha256: Some(
                        "ca81bb527cf008a9c116a876dc8cdfb99ee082ff58f811a78a644581fc7b7453",
                    ),
                },
            },
            TtsFile {
                role: Role::Extra,
                file: RemoteFile {
                    repo: "cstr/tada-tts-3b-ml-GGUF",
                    path: "tada-ref-ja.gguf",
                    size: 72_448,
                    sha256: Some(
                        "2b9ea59472273f876e93ea75478bffe0e2a20f27bf1bf48e7548f341380e7e29",
                    ),
                },
            },
            TtsFile {
                role: Role::Extra,
                file: RemoteFile {
                    repo: "cstr/tada-tts-3b-ml-GGUF",
                    path: "tada-ref-ar.gguf",
                    size: 82_752,
                    sha256: Some(
                        "f20e6193ab1de6f7a23e7a9aa128cc247f42520bf4c786bae4e0d9cbb976ac7c",
                    ),
                },
            },
            TtsFile {
                role: Role::Extra,
                file: RemoteFile {
                    repo: "cstr/tada-tts-3b-ml-GGUF",
                    path: "tada-ref-ch.gguf",
                    size: 97_088,
                    sha256: Some(
                        "ac272583a52d5b13c0caad9e0b844f3c202270c1889637c3753c9afffab80a10",
                    ),
                },
            },
        ],
        voices: &[
            PresetVoice {
                id: "tada-ref-de",
                label: "Deutsch",
                file: Some("tada-ref-de.gguf"),
                language: "de",
            },
            PresetVoice {
                id: "tada-ref",
                label: "English",
                file: Some("tada-ref.gguf"),
                language: "en",
            },
            PresetVoice {
                id: "tada-ref-fr",
                label: "Français",
                file: Some("tada-ref-fr.gguf"),
                language: "fr",
            },
            PresetVoice {
                id: "tada-ref-es",
                label: "Español",
                file: Some("tada-ref-es.gguf"),
                language: "es",
            },
            PresetVoice {
                id: "tada-ref-it",
                label: "Italiano",
                file: Some("tada-ref-it.gguf"),
                language: "it",
            },
            PresetVoice {
                id: "tada-ref-pl",
                label: "Polski",
                file: Some("tada-ref-pl.gguf"),
                language: "pl",
            },
            PresetVoice {
                id: "tada-ref-pt",
                label: "Português",
                file: Some("tada-ref-pt.gguf"),
                language: "pt",
            },
            PresetVoice {
                id: "tada-ref-ja",
                label: "日本語",
                file: Some("tada-ref-ja.gguf"),
                language: "ja",
            },
            PresetVoice {
                id: "tada-ref-ar",
                label: "العربية",
                file: Some("tada-ref-ar.gguf"),
                language: "ar",
            },
            PresetVoice {
                id: "tada-ref-ch",
                label: "中文",
                file: Some("tada-ref-ch.gguf"),
                language: "zh",
            },
        ],
        start_language: None,
    },
    TtsModel {
        id: "chatterbox-multilingual",
        name: "Chatterbox Multilingual",
        backend: "chatterbox",
        license: "MIT",
        noncommercial: false,
        languages: CHATTERBOX_LANGS,
        cloning: true,
        needs_clone: false,
        clone_experimental: true,
        voice_design: false,
        style_control: false,
        vram_mb: 2_300,
        files: &[
            TtsFile {
                role: Role::Main,
                file: RemoteFile {
                    repo: "cstr/chatterbox-GGUF",
                    path: "chatterbox-v3-t3-q8_0.gguf",
                    size: 639_286_176,
                    sha256: Some(
                        "c896a0d882aedd61083e5ea1b6764e52fa09a5734cba54b55fdcec18036e8211",
                    ),
                },
            },
            TtsFile {
                role: Role::Codec,
                file: RemoteFile {
                    repo: "cstr/chatterbox-GGUF",
                    path: "chatterbox-v3-s3gen-q8_0.gguf",
                    size: 364_590_688,
                    sha256: Some(
                        "ad2d99210a469e7d5ee66780a1e2e8604473e2dcc2ee09cef3409dbed2015c83",
                    ),
                },
            },
        ],
        voices: &[PresetVoice {
            id: "default",
            label: "Standard",
            file: None,
            language: "multi",
        }],
        start_language: None,
    },
    // Chatterbox Turbo speaks [laugh], [sigh], [whispering] … as sounds (see `voice_tags`).
    TtsModel {
        id: "chatterbox-turbo",
        name: "Chatterbox Turbo (Englisch, Gefühls-Tags)",
        backend: "chatterbox-turbo",
        license: "MIT",
        noncommercial: false,
        languages: &["en"],
        cloning: true,
        needs_clone: false,
        clone_experimental: true,
        voice_design: false,
        style_control: false,
        vram_mb: 2_000,
        files: &[
            TtsFile {
                role: Role::Main,
                file: RemoteFile {
                    repo: "cstr/chatterbox-turbo-GGUF",
                    path: "chatterbox-turbo-t3-q8_0.gguf",
                    size: 658_897_472,
                    sha256: Some(
                        "35520ec377209a55e064464996f71694546eb8fdf793c719a24d44729e098d57",
                    ),
                },
            },
            TtsFile {
                role: Role::Codec,
                file: RemoteFile {
                    repo: "cstr/chatterbox-turbo-GGUF",
                    path: "chatterbox-turbo-s3gen-q8_0.gguf",
                    size: 366_820_384,
                    sha256: Some(
                        "a77e3ef2559e8c4411b06a2692eb35646a43b0e5eef899633271aa281122e750",
                    ),
                },
            },
        ],
        voices: &[PresetVoice {
            id: "default",
            label: "Standard",
            file: None,
            language: "en",
        }],
        start_language: None,
    },
    TtsModel {
        id: "kokoro-de",
        name: "Kokoro (Deutsch)",
        backend: "kokoro",
        license: "Apache-2.0",
        noncommercial: false,
        languages: &["de"],
        cloning: false,
        needs_clone: false,
        clone_experimental: false,
        voice_design: false,
        style_control: false,
        vram_mb: 600,
        files: &[
            TtsFile {
                role: Role::Main,
                file: RemoteFile {
                    repo: "cstr/kokoro-82m-GGUF",
                    path: "kokoro-82m-q8_0.gguf",
                    size: 141_322_336,
                    sha256: Some(
                        "3c8b60064b287a10abd35396a59c9981675c618db8bc91bd290db63f55eb492d",
                    ),
                },
            },
            TtsFile {
                role: Role::Extra,
                file: RemoteFile {
                    // CrispASR only picks the German backbone up under this f16 name.
                    repo: "cstr/kokoro-de-hui-base-GGUF",
                    path: "kokoro-de-hui-base-f16.gguf",
                    size: 163_728_096,
                    sha256: Some(
                        "af1b5339f936635e711fcb1e2aa0f60fb505ff00f55743bc11708d98d4dabaa5",
                    ),
                },
            },
            TtsFile {
                role: Role::Extra,
                file: RemoteFile {
                    repo: "cstr/kokoro-voices-GGUF",
                    path: "kokoro-voice-df_victoria.gguf",
                    size: 522_784,
                    sha256: Some(
                        "ef7b5021f1f2c77c12d4423a22a31b214c3bfc7eb36c615ca54d5f13ccdba8d1",
                    ),
                },
            },
            TtsFile {
                role: Role::Extra,
                file: RemoteFile {
                    repo: "cstr/kokoro-voices-GGUF",
                    path: "kokoro-voice-df_eva.gguf",
                    size: 524_832,
                    sha256: Some(
                        "3942404617a4a77728a46b54ead8bbc4dd799128784e071ee37c941a08acc674",
                    ),
                },
            },
            TtsFile {
                role: Role::Extra,
                file: RemoteFile {
                    repo: "cstr/kokoro-voices-GGUF",
                    path: "kokoro-voice-dm_bernd.gguf",
                    size: 524_832,
                    sha256: Some(
                        "b2c075a3d78b35d169ae0839228705a6aa05c0d66cabe9d5f4a841f32a4b2050",
                    ),
                },
            },
            TtsFile {
                role: Role::Extra,
                file: RemoteFile {
                    repo: "cstr/kokoro-voices-GGUF",
                    path: "kokoro-voice-dm_martin.gguf",
                    size: 522_784,
                    sha256: Some(
                        "7eda2f6da5571e041b2d737f73bad4fdcebd939759de4d1b075b841543e53a29",
                    ),
                },
            },
        ],
        voices: &[
            PresetVoice {
                id: "df_victoria",
                label: "Victoria",
                file: Some("kokoro-voice-df_victoria.gguf"),
                language: "de",
            },
            PresetVoice {
                id: "df_eva",
                label: "Eva",
                file: Some("kokoro-voice-df_eva.gguf"),
                language: "de",
            },
            PresetVoice {
                id: "dm_bernd",
                label: "Bernd",
                file: Some("kokoro-voice-dm_bernd.gguf"),
                language: "de",
            },
            PresetVoice {
                id: "dm_martin",
                label: "Martin",
                file: Some("kokoro-voice-dm_martin.gguf"),
                language: "de",
            },
        ],
        start_language: Some("de"),
    },
    TtsModel {
        id: "f5-tts-v1",
        // ~1 min per second of audio on CUDA in CrispASR 0.8.39 (e2e test 2026-10-01).
        name: "F5-TTS v1 (experimentell, sehr langsam)",
        backend: "f5-tts",
        license: "CC-BY-NC-4.0",
        noncommercial: true,
        languages: &["en", "zh"],
        cloning: true,
        needs_clone: true,
        clone_experimental: false,
        voice_design: false,
        style_control: false,
        vram_mb: 2_000,
        files: &[TtsFile {
            role: Role::Main,
            file: RemoteFile {
                repo: "cstr/f5-tts-GGUF",
                path: "f5-tts-v1-base-f16.gguf",
                size: 999_097_152,
                sha256: Some("25a4d273048dad072774ff139cf19b96fe442bebda8392c08009d73256cf1e81"),
            },
        }],
        voices: &[],
        start_language: None,
    },
];

pub(super) fn catalog_model(id: &str) -> Result<&'static TtsModel, String> {
    // Settings saved with the withdrawn 0.6B Base model use the built-in-voice model instead.
    let id = if id == "qwen3-tts-0.6b" {
        "qwen3-tts-customvoice-0.6b"
    } else {
        id
    };
    CATALOG
        .iter()
        .find(|m| m.id == id)
        .ok_or_else(|| crate::err!("backend.tts.unknownModel", model = id))
}

pub(super) fn data_dir() -> PathBuf {
    PathBuf::from(crate::modules::paths::resolve_app_paths().data_dir)
}

pub(super) fn models_dir() -> PathBuf {
    data_dir().join("tts-models")
}

pub(super) fn voices_dir() -> PathBuf {
    data_dir().join("voices")
}

pub(super) fn is_installed(model: &TtsModel) -> bool {
    let dir = models_dir();
    model.files.iter().all(|f| f.file.is_complete(&dir))
}

/// Models that voice `[laugh]`, `[sigh]` … as sounds instead of reading them (Chatterbox Turbo).
pub fn speaks_sound_tags(model_id: Option<&str>) -> bool {
    matches!(model_id, Some("chatterbox-turbo"))
}
