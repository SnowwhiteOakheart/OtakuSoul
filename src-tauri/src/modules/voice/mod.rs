//! Text-to-speech, speech-to-text, text filtering and per-character voice settings.

mod config;
mod edge;
mod filter;
mod models;
mod stt;
#[cfg(test)]
mod tests;
mod tts;

pub use config::{
    NARRATOR_VOICE_ID, load_character_voice_config, narrator_default_config,
    save_character_voice_config,
};
pub use edge::{list_edge_tts_voices, synthesize_edge_tts};
pub use filter::{actions_to_sound_tags, clean_text_for_tts};
pub use models::{RvcConfig, ScannedVoice, SttConfig, SttEngine, TtsEngine, TtsFilterMode, VoiceConfig, VoiceEffects};
pub use stt::transcribe_speech;
pub use tts::{
    list_available_voices, synthesize_elevenlabs, synthesize_openai_tts, synthesize_speech,
};

#[cfg(test)]
use config::{load_voice_config_from_path, save_voice_config_to_path};
#[cfg(test)]
use edge::{
    build_edge_tts_request, clock_skew_from_date, edge_tts_websocket_url,
    generate_edge_sec_ms_gec,
};
#[cfg(test)]
use models::uuid_v4;
#[cfg(test)]
use stt::{decode_pcm_f32, pcm_to_wav};
#[cfg(test)]
use tts::local_speaking_style;
