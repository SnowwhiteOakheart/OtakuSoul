use serde::{Deserialize, Serialize};
use std::sync::LazyLock;
use ts_rs::TS;

/// The 28 standard GoEmotions labels
pub const GO_EMOTIONS: [&str; 28] = [
    "admiration",
    "amusement",
    "anger",
    "annoyance",
    "approval",
    "caring",
    "confusion",
    "curiosity",
    "desire",
    "disappointment",
    "disapproval",
    "disgust",
    "embarrassment",
    "excitement",
    "fear",
    "gratitude",
    "grief",
    "joy",
    "love",
    "nervousness",
    "optimism",
    "pride",
    "realization",
    "relief",
    "remorse",
    "sadness",
    "surprise",
    "neutral",
];

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct EmotionResult {
    /// The primary detected emotion out of the 28 GoEmotions
    pub emotion: String,
    /// Canonical VRM blendshape name: "happy" | "angry" | "sad" | "surprised" | "relaxed" | "neutral"
    pub vrm_expression: String,
    /// Live2D expression animation key (e.g. "joy_animation", "admiration_animation")
    pub live2d_expression: String,
    /// Confidence score between 0.0 and 1.0
    pub confidence: f32,
    /// Intensity between 0.0 and 1.0
    pub intensity: f32,
    /// An extra portrait slot this text calls for ([`EXTRA_PORTRAITS`]); empty = one of the six
    /// standard moods. A card without that picture falls back to the emotion and the mood.
    #[serde(default)]
    pub portrait: String,
}

/// Portrait slots a card may bring besides the six moods (`extensions.expressions`); usable by
/// every card, the last four are meant for romance and adult cards.
pub const EXTRA_PORTRAITS: [&str; 9] = [
    "blush",
    "teasing",
    "fear",
    "disgust",
    "crying",
    "seductive",
    "aroused",
    "ecstasy",
    "afterglow",
];

/// The GoEmotion an extra portrait stands for (drives VRM and Live2D, which have no such slot).
fn emotion_of_portrait(portrait: &str) -> &'static str {
    match portrait {
        "blush" => "embarrassment",
        "teasing" => "amusement",
        "fear" => "fear",
        "disgust" => "disgust",
        "crying" => "sadness",
        "seductive" | "aroused" => "desire",
        "ecstasy" => "excitement",
        "afterglow" => "relief",
        _ => "neutral",
    }
}

/// The extra portrait an emotion suggests when no cue named one.
fn portrait_of_emotion(emotion: &str) -> &'static str {
    match emotion {
        "embarrassment" => "blush",
        "fear" | "nervousness" => "fear",
        "disgust" => "disgust",
        "desire" => "seductive",
        _ => "",
    }
}

impl Default for EmotionResult {
    fn default() -> Self {
        Self {
            emotion: "neutral".to_string(),
            vrm_expression: "relaxed".to_string(),
            live2d_expression: "neutral_animation".to_string(),
            confidence: 1.0,
            intensity: 0.5,
            portrait: String::new(),
        }
    }
}

/// Maps any of the 28 GoEmotions to canonical VRM blendshape preset
pub fn map_go_emotion_to_vrm(emotion: &str) -> &'static str {
    match emotion {
        "joy" | "amusement" | "excitement" | "love" | "optimism" | "pride" | "gratitude"
        | "admiration" | "approval" | "caring" | "relief" => "happy",

        "anger" | "annoyance" | "disapproval" | "disgust" => "angry",

        "sadness" | "grief" | "disappointment" | "remorse" => "sad",

        "surprise" | "confusion" | "curiosity" | "realization" => "surprised",

        "fear" | "nervousness" | "embarrassment" => "sad", // or relaxed with blush

        _ => "relaxed",
    }
}

/// Maps any of the 28 GoEmotions to standard Live2D expression file name
pub fn map_go_emotion_to_live2d(emotion: &str) -> String {
    format!("{}_animation", emotion)
}

/// Roleplay actions written as `*…*`.
static ASTERISK_ACTION_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"\*([^*]+)\*").expect("static regex is valid"));

/// The six moods every portrait set, VRM and Live2D know; the chat prompt offers them as tags.
pub const MOODS: [&str; 6] = ["neutral", "happy", "sad", "angry", "surprised", "relaxed"];

/// The GoEmotion a mood tag stands for.
fn emotion_of_mood(mood: &str) -> &'static str {
    match mood {
        "happy" => "joy",
        "sad" => "sadness",
        "angry" => "anger",
        "surprised" => "surprise",
        _ => "neutral",
    }
}

/// The expression tag the model ends a chat reply with (`[emotion: blush]`, asked for by
/// `prompt_builder`); also `<emotion>…</emotion>`.
static EMOTION_TAG_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"\[emotion:\s*([a-z_]+)\s*\]|<emotion>\s*([a-z_]+)\s*</emotion>")
        .expect("static regex is valid")
});

/// Classifies the emotional tone of a reply: its expression tag first (language independent),
/// otherwise the cue words of all languages (`presets/cues/*.json`), roleplay actions weighted
/// higher.
pub fn classify_emotion(text: &str) -> EmotionResult {
    let lower = normalize(text);
    if let Some(tagged) = tagged_emotion(&lower) {
        return tagged;
    }
    let cues = cues();
    let portrait_cue = cues.strongest_portrait(&lower);

    // Roleplay actions (*lächelt sanft*) count three times, the whole text once per emotion.
    let actions: Vec<&str> = ASTERISK_ACTION_RE
        .captures_iter(&lower)
        .filter_map(|cap| cap.get(1).map(|m| m.as_str()))
        .collect();
    let mut best_emotion = "neutral";
    let mut highest_score = 0.0f32;
    for (emotion, list) in &cues.emotions {
        let in_actions = actions.iter().filter(|a| list.any(a)).count() as f32;
        let in_text = if list.any(&lower) {
            text_weight(emotion)
        } else {
            0.0
        };
        let score = in_actions * 3.0 + in_text;
        if score > highest_score {
            highest_score = score;
            best_emotion = emotion;
        }
    }

    if highest_score < 1.0 {
        // No emotion word, but a portrait cue ("*keucht*"): that picture with its emotion.
        return match portrait_cue {
            Some(portrait) => {
                let emotion = emotion_of_portrait(portrait);
                EmotionResult {
                    emotion: emotion.to_string(),
                    vrm_expression: map_go_emotion_to_vrm(emotion).to_string(),
                    live2d_expression: map_go_emotion_to_live2d(emotion),
                    confidence: 0.6,
                    intensity: 0.7,
                    portrait: portrait.to_string(),
                }
            }
            None => EmotionResult::default(),
        };
    }

    let confidence = (highest_score / (highest_score + 2.0)).min(0.95);
    let intensity = (0.4 + highest_score * 0.15).min(1.0);

    EmotionResult {
        emotion: best_emotion.to_string(),
        vrm_expression: map_go_emotion_to_vrm(best_emotion).to_string(),
        live2d_expression: map_go_emotion_to_live2d(best_emotion),
        confidence,
        intensity,
        portrait: portrait_cue
            .unwrap_or_else(|| portrait_of_emotion(best_emotion))
            .to_string(),
    }
}

/// The result an expression tag names: a portrait slot, a mood or a GoEmotion; unknown names are
/// ignored (the cue words decide).
fn tagged_emotion(lower: &str) -> Option<EmotionResult> {
    let tag = EMOTION_TAG_RE
        .captures_iter(lower)
        .filter_map(|cap| cap.get(1).or_else(|| cap.get(2)))
        .map(|m| m.as_str())
        .last()?;
    let (emotion, vrm, portrait) = if EXTRA_PORTRAITS.contains(&tag) {
        let emotion = emotion_of_portrait(tag);
        (emotion, map_go_emotion_to_vrm(emotion), tag)
    } else if MOODS.contains(&tag) {
        let emotion = emotion_of_mood(tag);
        // "relaxed" has no GoEmotion of its own: the portrait slot carries it.
        let portrait = if tag == "relaxed" { "relaxed" } else { "" };
        let vrm = if tag == "neutral" {
            map_go_emotion_to_vrm(emotion)
        } else {
            tag
        };
        (emotion, vrm, portrait)
    } else {
        let emotion = *GO_EMOTIONS.iter().find(|e| **e == tag)?;
        (
            emotion,
            map_go_emotion_to_vrm(emotion),
            portrait_of_emotion(emotion),
        )
    };
    Some(EmotionResult {
        emotion: emotion.to_string(),
        vrm_expression: vrm.to_string(),
        live2d_expression: map_go_emotion_to_live2d(emotion),
        confidence: 0.95,
        intensity: 0.8,
        portrait: portrait.to_string(),
    })
}

/// How much one emotion's cue words in the whole text count (actions count 3).
fn text_weight(emotion: &str) -> f32 {
    match emotion {
        "love" => 2.5,
        "amusement" | "gratitude" | "anger" | "surprise" => 2.0,
        "sadness" | "embarrassment" => 1.8,
        "curiosity" => 1.2,
        _ => 1.5,
    }
}

/// One cue word: whole words (`neckt` does not match `necken`), a trailing `*` for any ending
/// (`schluchz*`), a space for any whitespace. Word edges count for all scripts. Plain string search
/// (no regex to compile, so the first reply is not held up).
struct Cue {
    body: String,
    stem: bool,
}

impl Cue {
    fn parse(cue: &str) -> Option<Self> {
        let cue = normalize(cue);
        let (body, stem) = match cue.strip_suffix('*') {
            Some(body) => (body.trim_end().to_string(), true),
            None => (cue, false),
        };
        (!body.is_empty()).then_some(Self { body, stem })
    }

    /// Whether the cue occurs in `text` (lowercase, spaces collapsed: [`normalize`]).
    fn matches(&self, text: &str) -> bool {
        let check_start = self.body.starts_with(char::is_alphabetic);
        let check_end = !self.stem && self.body.ends_with(char::is_alphabetic);
        text.match_indices(self.body.as_str()).any(|(at, _)| {
            let before = text[..at].chars().next_back();
            let after = text[at + self.body.len()..].chars().next();
            !(check_start && before.is_some_and(char::is_alphabetic))
                && !(check_end && after.is_some_and(char::is_alphabetic))
        })
    }
}

/// Lowercase with every run of whitespace as one space (how cues and texts are compared).
fn normalize(text: &str) -> String {
    text.to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Cue words of one emotion or portrait slot from all language files.
struct CueList(Vec<Cue>);

impl CueList {
    fn any(&self, text: &str) -> bool {
        self.0.iter().any(|cue| cue.matches(text))
    }

    /// How many different cues of the list occur.
    fn count(&self, text: &str) -> usize {
        self.0.iter().filter(|cue| cue.matches(text)).count()
    }
}

/// One language file in `presets/cues/` (gestures are read by the frontend).
#[derive(Deserialize, Default)]
struct CueFile {
    #[serde(default)]
    emotions: std::collections::BTreeMap<String, Vec<String>>,
    #[serde(default)]
    portraits: std::collections::BTreeMap<String, Vec<String>>,
}

/// The cue words of all languages, in the order of [`GO_EMOTIONS`] and [`EXTRA_PORTRAITS`]
/// (ties go to the earlier one).
#[derive(Default)]
struct Cues {
    emotions: Vec<(&'static str, CueList)>,
    portraits: Vec<(&'static str, CueList)>,
}

impl Cues {
    fn from_files(files: &[CueFile]) -> Self {
        let collect = |keys: &[&'static str],
                       pick: &dyn Fn(
            &CueFile,
        )
            -> &std::collections::BTreeMap<String, Vec<String>>| {
            keys.iter()
                .filter_map(|key| {
                    let cues: Vec<Cue> = files
                        .iter()
                        .filter_map(|file| pick(file).get(*key))
                        .flatten()
                        .filter_map(|cue| Cue::parse(cue))
                        .collect();
                    (!cues.is_empty()).then_some((*key, CueList(cues)))
                })
                .collect()
        };
        Self {
            emotions: collect(&GO_EMOTIONS, &|file| &file.emotions),
            portraits: collect(&EXTRA_PORTRAITS, &|file| &file.portraits),
        }
    }

    /// The extra portrait the text points to most clearly, if any.
    fn strongest_portrait(&self, lower: &str) -> Option<&'static str> {
        let actions: Vec<&str> = ASTERISK_ACTION_RE
            .captures_iter(lower)
            .filter_map(|cap| cap.get(1).map(|m| m.as_str()))
            .collect();
        let mut best: Option<(&'static str, f32)> = None;
        for (portrait, list) in &self.portraits {
            let in_actions: usize = actions.iter().map(|a| list.count(a)).sum();
            let score = in_actions as f32 * 3.0 + list.count(lower) as f32;
            if score >= 1.0 && best.is_none_or(|(_, top)| score > top) {
                best = Some((portrait, score));
            }
        }
        best.map(|(portrait, _)| portrait)
    }
}

/// Folder of the language files: one `<lang>.json` per language plus `common.json` (emoticons).
/// A new language needs only a new file.
fn cues_dir() -> std::path::PathBuf {
    let paths = crate::modules::paths::resolve_app_paths();
    std::path::PathBuf::from(paths.bundled_presets_dir).join("cues")
}

fn read_cue_files(dir: &std::path::Path) -> Vec<CueFile> {
    let mut paths: Vec<_> = std::fs::read_dir(dir)
        .map(|entries| {
            entries
                .flatten()
                .map(|e| e.path())
                .filter(|p| p.extension().is_some_and(|ext| ext == "json"))
                .collect()
        })
        .unwrap_or_default();
    paths.sort();
    paths
        .iter()
        .filter_map(|path| {
            let parsed = std::fs::read_to_string(path)
                .map_err(|e| e.to_string())
                .and_then(|text| serde_json::from_str::<CueFile>(&text).map_err(|e| e.to_string()));
            parsed
                .map_err(|e| tracing::warn!("Hinweiswörter {} unlesbar: {e}", path.display()))
                .ok()
        })
        .collect()
}

fn cues() -> &'static Cues {
    static CUES: LazyLock<Cues> = LazyLock::new(|| Cues::from_files(&read_cue_files(&cues_dir())));
    &CUES
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_explicit_emotion_tag() {
        let result = classify_emotion("Ich bin so froh, dich zu sehen! [emotion: joy]");
        assert_eq!(result.emotion, "joy");
        assert_eq!(result.vrm_expression, "happy");
        assert_eq!(result.live2d_expression, "joy_animation");
    }

    #[test]
    fn test_roleplay_asterisk_laughter() {
        let result = classify_emotion(
            "*kichert leise und zwinkert dir zu* Du bist wirklich unverbesserlich!",
        );
        assert_eq!(result.emotion, "amusement");
        assert_eq!(result.vrm_expression, "happy");
    }

    #[test]
    fn test_blush_action() {
        let result = classify_emotion(
            "*wird rot und schaut verlegen zur Seite* D-das hättest du nicht sagen müssen...",
        );
        assert_eq!(result.emotion, "embarrassment");
    }

    #[test]
    fn russian_replies_and_misleading_english_words() {
        let ru = classify_emotion("*краснеет и смущённо отводит взгляд* Н-не говори так…");
        assert_eq!(
            (ru.emotion.as_str(), ru.portrait.as_str()),
            ("embarrassment", "blush")
        );
        assert_eq!(
            classify_emotion("*тихо плачет, слёзы текут*").portrait,
            "crying"
        );
        assert_eq!(
            classify_emotion("*улыбается* Я так рада тебя видеть!").vrm_expression,
            "happy"
        );
        assert_eq!(
            classify_emotion("*подмигивает* Попался!").portrait,
            "teasing"
        );
        // "neck", "winkt" (waves) and "crystal" are no teasing or crying cues.
        assert_eq!(classify_emotion("*kisses her neck softly*").portrait, "");
        assert_eq!(classify_emotion("*winkt dir zum Abschied*").portrait, "");
        assert_eq!(
            classify_emotion("*holds up the crystal*").emotion,
            "neutral"
        );
    }

    #[test]
    fn mood_tags_and_unknown_tags() {
        let happy = classify_emotion("*weint* Schon gut. [emotion: happy]");
        assert_eq!(
            (happy.emotion.as_str(), happy.vrm_expression.as_str()),
            ("joy", "happy")
        );
        let relaxed = classify_emotion("Schön ruhig hier. [emotion: Relaxed]");
        assert_eq!(
            (relaxed.vrm_expression.as_str(), relaxed.portrait.as_str()),
            ("relaxed", "relaxed")
        );
        let neutral = classify_emotion("[emotion: neutral] Ja.");
        assert_eq!(
            (neutral.emotion.as_str(), neutral.portrait.as_str()),
            ("neutral", "")
        );
        // An unknown name leaves it to the cue words; the last tag counts.
        assert_eq!(
            classify_emotion("*weint* [emotion: sparkly]").portrait,
            "crying"
        );
        assert_eq!(
            classify_emotion("[emotion: sad] … [emotion: blush]").portrait,
            "blush"
        );
    }

    #[test]
    fn cues_match_whole_words_or_stems() {
        let cue = |c: &str| Cue::parse(c).unwrap();
        let word = cue("neckt");
        assert!(
            word.matches("sie neckt dich")
                && !word.matches("necktie")
                && !word.matches("ich necke")
        );
        let stem = cue("schluchz*");
        assert!(stem.matches("*schluchzt leise*") && !stem.matches("aufschluchzen"));
        assert!(cue("Wird  Rot").matches(&normalize("sie wird\nrot.")));
        let ru = cue("плач*");
        assert!(ru.matches("она плачет") && !ru.matches("заплачет"));
        assert!(cue("^^").matches("hallo^^"));
        assert!(Cue::parse(" * ").is_none());
    }

    #[test]
    fn language_files_load_quickly() {
        let started = std::time::Instant::now();
        let cues = Cues::from_files(&read_cue_files(
            &std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../presets/cues"),
        ));
        eprintln!("Hinweiswörter geladen in {:?}", started.elapsed());
        assert!(cues.emotions.len() >= 12 && cues.portraits.len() == EXTRA_PORTRAITS.len());
    }

    #[test]
    fn language_files_use_known_keys() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../presets/cues");
        let mut languages = 0;
        for entry in std::fs::read_dir(&dir).unwrap().flatten() {
            let text = std::fs::read_to_string(entry.path()).unwrap();
            let file: serde_json::Value = serde_json::from_str(&text).unwrap();
            let name = entry.file_name().to_string_lossy().to_string();
            for (section, known) in [
                ("emotions", &GO_EMOTIONS[..]),
                ("portraits", &EXTRA_PORTRAITS[..]),
                ("gestures", &crate::modules::avatar_motions::ROLES[..]),
            ] {
                for (key, cues) in file
                    .get(section)
                    .and_then(|v| v.as_object())
                    .into_iter()
                    .flatten()
                {
                    assert!(
                        known.contains(&key.as_str()),
                        "{name}: {section}.{key} unbekannt"
                    );
                    for cue in cues.as_array().unwrap() {
                        assert!(
                            Cue::parse(cue.as_str().unwrap()).is_some(),
                            "{name}: {cue} ungültig"
                        );
                    }
                }
            }
            languages += 1;
        }
        assert!(languages >= 4);
    }

    #[test]
    fn extra_portraits_follow_cues_and_tags() {
        let blush = classify_emotion("*wird rot und schaut verlegen zur Seite* D-das…");
        assert_eq!(
            (blush.emotion.as_str(), blush.portrait.as_str()),
            ("embarrassment", "blush")
        );
        assert_eq!(
            classify_emotion("*schluchzt leise, Tränen laufen*").portrait,
            "crying"
        );
        assert_eq!(
            classify_emotion("*zwinkert dir frech zu* Erwischt!").portrait,
            "teasing"
        );
        assert_eq!(
            classify_emotion("*rümpft angewidert die Nase*").portrait,
            "disgust"
        );
        // Without an emotion word the cue decides, with the emotion behind that picture.
        let aroused = classify_emotion("*atmet schwer*");
        assert_eq!(
            (aroused.portrait.as_str(), aroused.emotion.as_str()),
            ("aroused", "desire")
        );
        let tagged = classify_emotion("Mmh. [emotion: afterglow]");
        assert_eq!(
            (
                tagged.portrait.as_str(),
                tagged.emotion.as_str(),
                tagged.vrm_expression.as_str()
            ),
            ("afterglow", "relief", "happy")
        );
        // The six moods need no extra picture.
        assert_eq!(
            classify_emotion("Ich bin so froh! [emotion: joy]").portrait,
            ""
        );
        assert_eq!(
            classify_emotion("Hier ist die Liste der Dateien.").portrait,
            ""
        );
    }

    #[test]
    fn test_default_neutral() {
        let result = classify_emotion("Hier ist die Liste der Dateien auf der Festplatte.");
        assert_eq!(result.emotion, "neutral");
        assert_eq!(result.vrm_expression, "relaxed");
    }
}
