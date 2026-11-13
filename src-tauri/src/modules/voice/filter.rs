use std::sync::LazyLock;

use super::models::TtsFilterMode;

/// Removes markdown, think blocks and filters text based on mode.
fn regex(pattern: &str) -> regex::Regex {
    regex::Regex::new(pattern).expect("static TTS regex is valid")
}

static THINK_RE: LazyLock<regex::Regex> = LazyLock::new(|| regex(r"(?is)<think>.*?</think>"));
static CODE_BLOCK_RE: LazyLock<regex::Regex> = LazyLock::new(|| regex(r"(?s)```.*?```"));
static INLINE_CODE_RE: LazyLock<regex::Regex> = LazyLock::new(|| regex(r"`[^`]+`"));
static URL_RE: LazyLock<regex::Regex> = LazyLock::new(|| regex(r"https?://\S+"));
/// Tags the chat reply carries for the app, not the listener: HUD values and the expression tag
/// (also unfinished ones at the end of a streamed piece).
static REPLY_TAG_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex(r"(?is)<state>.*?(?:</state>|$)|\[emotion:[^\]]*(?:\]|$)|<emotion>.*?(?:</emotion>|$)")
});
static HEADER_RE: LazyLock<regex::Regex> = LazyLock::new(|| regex(r"(?m)^#{1,6}\s+"));
/// Spoken text inside "…", “…”, „…“, »…«, «…» or 「…」.
static DIALOGUE_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex(r#"["“”„»«「]([^"“”„»«「」]+)["“”»«」]"#));
static ACTION_RE: LazyLock<regex::Regex> = LazyLock::new(|| regex(r"(?s)\*{1,3}[^*]*?\*{1,3}"));
static DANGLING_ACTION_RE: LazyLock<regex::Regex> = LazyLock::new(|| regex(r"(?s)\*{1,3}[^*]*$"));
static WHITESPACE_RE: LazyLock<regex::Regex> = LazyLock::new(|| regex(r"\s+"));

/// Roleplay actions that Chatterbox Turbo can voice as a sound, by keyword (German and English,
/// lower case, matched as part of the action). The first hit wins, so the more specific ones
/// come first.
const SOUND_TAGS: &[(&[&str], &str)] = &[
    (&["kicher", "schmunzel", "chuckl", "giggl"], "[chuckle]"),
    (&["lach", "laugh"], "[laugh]"),
    (&["seufz", "sigh"], "[sigh]"),
    (&["keuch", "japs", "schnapp", "gasp"], "[gasp]"),
    (&["räusper", "throat"], "[clear throat]"),
    (&["hust", "cough"], "[cough]"),
    (&["schnief", "schniff", "sniff"], "[sniff]"),
    (&["stöhn", "ächz", "groan"], "[groan]"),
    (&["psst", "pscht", "shush"], "[shush]"),
    (&["flüster", "whisper"], "[whispering]"),
];

/// Turns actions such as `*lacht leise*` into Chatterbox Turbo's sound tags (`[laugh]`), so
/// the voice laughs instead of skipping the action. Other actions stay for the filter.
pub fn actions_to_sound_tags(text: &str) -> String {
    ACTION_RE
        .replace_all(text, |caps: &regex::Captures| {
            let action = caps[0].to_lowercase();
            SOUND_TAGS
                .iter()
                .find(|(keys, _)| keys.iter().any(|key| action.contains(key)))
                .map(|(_, tag)| format!(" {tag} "))
                .unwrap_or_else(|| caps[0].to_string())
        })
        .to_string()
}

pub fn clean_text_for_tts(raw: &str, filter_mode: &TtsFilterMode, custom_regex: &str) -> String {
    let mut text = raw.to_string();

    // 1. Remove <think>…</think> blocks (greedy within each match) and the reply's tags
    text = THINK_RE.replace_all(&text, "").to_string();
    text = REPLY_TAG_RE.replace_all(&text, "").to_string();

    // 2. Remove markdown code blocks
    text = CODE_BLOCK_RE.replace_all(&text, "").to_string();

    // 3. Remove inline code
    text = INLINE_CODE_RE.replace_all(&text, "").to_string();

    // 4. Remove URLs
    text = URL_RE.replace_all(&text, "").to_string();

    // 5. Remove markdown headers and underscore emphasis markers. Asterisks
    // remain until the action filter has had a chance to inspect them.
    text = HEADER_RE.replace_all(&text, "").to_string();
    text = text.replace("__", "");

    // 6. Apply filter mode
    text = match filter_mode {
        TtsFilterMode::All => text,
        TtsFilterMode::DialogueOnly => {
            let matches: Vec<String> = DIALOGUE_RE
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
            let without_actions = ACTION_RE.replace_all(&text, "");
            DANGLING_ACTION_RE.replace(&without_actions, "").to_string()
        }
    };

    // 7. Apply custom regex exclusion if set
    if !custom_regex.is_empty()
        && let Ok(custom_re) = regex::Regex::new(custom_regex)
    {
        text = custom_re.replace_all(&text, "").to_string();
    }

    // 8. Never pass Markdown asterisks to a speech engine. In "Alles"
    // mode their content remains, but Edge-TTS must not pronounce "Stern".
    text = text.replace('*', "");

    // 9. Collapse whitespace
    text = WHITESPACE_RE.replace_all(&text, " ").to_string();

    text.trim().to_string()
}
