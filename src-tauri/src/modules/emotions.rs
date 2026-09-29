use serde::{Deserialize, Serialize};
use std::sync::LazyLock;

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

#[derive(Debug, Clone, Serialize, Deserialize)]
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
}

impl Default for EmotionResult {
    fn default() -> Self {
        Self {
            emotion: "neutral".to_string(),
            vrm_expression: "relaxed".to_string(),
            live2d_expression: "neutral_animation".to_string(),
            confidence: 1.0,
            intensity: 0.5,
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

/// Classifies the emotional tone of text using tags, roleplay asterisks, and a rich bilingual lexicon.
/// Roleplay actions written as `*…*`.
static ASTERISK_ACTION_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"\*([^*]+)\*").expect("static regex is valid"));

pub fn classify_emotion(text: &str) -> EmotionResult {
    let lower = text.to_lowercase();

    // 1. Check for explicit emotion directives or tags (e.g. [emotion: joy], <emotion:happy>)
    if let Some(explicit) = extract_explicit_emotion(&lower) {
        let vrm = map_go_emotion_to_vrm(&explicit);
        let l2d = map_go_emotion_to_live2d(&explicit);
        return EmotionResult {
            emotion: explicit,
            vrm_expression: vrm.to_string(),
            live2d_expression: l2d,
            confidence: 0.95,
            intensity: 0.8,
        };
    }

    // 2. Scan for roleplay actions inside asterisks, e.g. *lächelt sanft*, *weint leise*, *blushes*
    let mut scores = std::collections::HashMap::new();
    for cap in ASTERISK_ACTION_RE.captures_iter(&lower) {
        let action = &cap[1];
        score_action_segment(action, &mut scores);
    }

    // 3. Scan the full dialogue text for keyword cues and emoticons
    score_text_tokens(&lower, &mut scores);

    // 4. Find the highest scored emotion
    let mut best_emotion = "neutral";
    let mut highest_score = 0.0f32;

    for (em, score) in &scores {
        if *score > highest_score {
            highest_score = *score;
            best_emotion = em;
        }
    }

    if highest_score < 1.0 {
        return EmotionResult::default();
    }

    let confidence = (highest_score / (highest_score + 2.0)).min(0.95);
    let intensity = (0.4 + highest_score * 0.15).min(1.0);

    EmotionResult {
        emotion: best_emotion.to_string(),
        vrm_expression: map_go_emotion_to_vrm(best_emotion).to_string(),
        live2d_expression: map_go_emotion_to_live2d(best_emotion),
        confidence,
        intensity,
    }
}

fn extract_explicit_emotion(text: &str) -> Option<String> {
    for em in GO_EMOTIONS {
        if text.contains(&format!("[emotion: {}]", em))
            || text.contains(&format!("[emotion:{}]", em))
            || text.contains(&format!("<emotion>{}</emotion>", em))
        {
            return Some(em.to_string());
        }
    }
    None
}

fn score_action_segment(action: &str, scores: &mut std::collections::HashMap<&'static str, f32>) {
    let weight = 3.0; // Asterisk actions are weighted heavily

    if action.contains("lächel")
        || action.contains("grins")
        || action.contains("smile")
        || action.contains("smirk")
    {
        *scores.entry("joy").or_insert(0.0) += weight;
    }
    if action.contains("kicher")
        || action.contains("lachen")
        || action.contains("lacht")
        || action.contains("giggle")
        || action.contains("chuckle")
    {
        *scores.entry("amusement").or_insert(0.0) += weight;
    }
    if action.contains("erröt")
        || action.contains("rot werd")
        || action.contains("wird rot")
        || action.contains("verlegen")
        || action.contains("blush")
        || action.contains("embarrass")
    {
        *scores.entry("embarrassment").or_insert(0.0) += weight;
    }
    if action.contains("wein")
        || action.contains("träne")
        || action.contains("cry")
        || action.contains("tear")
        || action.contains("schluchz")
    {
        *scores.entry("sadness").or_insert(0.0) += weight;
    }
    if action.contains("wütend")
        || action.contains("knurr")
        || action.contains("funkel")
        || action.contains("angry")
        || action.contains("frown")
    {
        *scores.entry("anger").or_insert(0.0) += weight;
    }
    if action.contains("überrascht")
        || action.contains("augen weit")
        || action.contains("gasp")
        || action.contains("keuch")
    {
        *scores.entry("surprise").or_insert(0.0) += weight;
    }
    if action.contains("umarm")
        || action.contains("streichel")
        || action.contains("kuschel")
        || action.contains("hug")
        || action.contains("cuddle")
    {
        *scores.entry("love").or_insert(0.0) += weight;
    }
    if action.contains("zwinker") || action.contains("wink") {
        *scores.entry("amusement").or_insert(0.0) += weight;
    }
    if action.contains("seufz") || action.contains("sigh") {
        *scores.entry("relief").or_insert(0.0) += weight;
    }
    if action.contains("zitter")
        || action.contains("schauder")
        || action.contains("tremble")
        || action.contains("shiver")
    {
        *scores.entry("fear").or_insert(0.0) += weight;
    }
}

fn score_text_tokens(text: &str, scores: &mut std::collections::HashMap<&'static str, f32>) {
    // Joy / Amusement
    if text.contains("haha")
        || text.contains("hehe")
        || text.contains("hihi")
        || text.contains("lol")
        || text.contains("xd")
        || text.contains("^-^")
        || text.contains("^^")
    {
        *scores.entry("amusement").or_insert(0.0) += 2.0;
    }
    if text.contains("freue")
        || text.contains("wunderbar")
        || text.contains("toll")
        || text.contains("glücklich")
        || text.contains("happy")
        || text.contains("yay")
    {
        *scores.entry("joy").or_insert(0.0) += 1.5;
    }

    // Love / Caring
    if text.contains("ich liebe dich")
        || text.contains("hab dich lieb")
        || text.contains("love you")
        || text.contains("<3")
        || text.contains("liebling")
        || text.contains("schatz")
    {
        *scores.entry("love").or_insert(0.0) += 2.5;
    }
    if text.contains("pass auf dich auf")
        || text.contains("sorge")
        || text.contains("beschützen")
        || text.contains("care")
    {
        *scores.entry("caring").or_insert(0.0) += 1.5;
    }

    // Gratitude / Admiration
    if text.contains("danke")
        || text.contains("vielen dank")
        || text.contains("thank")
        || text.contains("dankbar")
    {
        *scores.entry("gratitude").or_insert(0.0) += 2.0;
    }
    if text.contains("beeindruckend")
        || text.contains("großartig")
        || text.contains("faszinierend")
        || text.contains("amazing")
        || text.contains("wow")
    {
        *scores.entry("admiration").or_insert(0.0) += 1.5;
    }

    // Anger / Annoyance
    if text.contains("verdammt")
        || text.contains("hasserfüllt")
        || text.contains("scheiße")
        || text.contains("idiot")
        || text.contains("nerv")
        || text.contains("shut up")
    {
        *scores.entry("anger").or_insert(0.0) += 2.0;
    }

    // Sadness / Grief
    if text.contains("traurig")
        || text.contains("schade")
        || text.contains("tut mir leid")
        || text.contains("einsam")
        || text.contains("sad")
        || text.contains(":(")
    {
        *scores.entry("sadness").or_insert(0.0) += 1.8;
    }

    // Surprise / Curiosity
    if text.contains("was?!")
        || text.contains("wie bitte?")
        || text.contains("wirklich?!")
        || text.contains("o_o")
        || text.contains("omg")
    {
        *scores.entry("surprise").or_insert(0.0) += 2.0;
    }
    if text.contains("warum?")
        || text.contains("wieso?")
        || text.contains("neugierig")
        || text.contains("interessant")
    {
        *scores.entry("curiosity").or_insert(0.0) += 1.2;
    }

    // Embarrassment / Nervousness
    if text.contains("peinlich")
        || text.contains("nervös")
        || text.contains("uhm")
        || text.contains("äh...")
        || text.contains("stotter")
    {
        *scores.entry("embarrassment").or_insert(0.0) += 1.8;
    }
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
    fn test_default_neutral() {
        let result = classify_emotion("Hier ist die Liste der Dateien auf der Festplatte.");
        assert_eq!(result.emotion, "neutral");
        assert_eq!(result.vrm_expression, "relaxed");
    }
}
