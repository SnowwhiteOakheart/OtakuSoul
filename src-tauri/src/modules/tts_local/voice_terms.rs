//! Free voice descriptions → OmniVoice's closed voice-design vocabulary.
//!
//! OmniVoice was trained on 48 fixed items (gender, age, pitch, whisper, English accent) and
//! CrispASR rejects anything else, so a card description like "A cheerful young woman with a
//! bright voice" must become `female, young adult, high pitch`. At most one item per category;
//! the earliest mention in the text wins. German words are understood too, because users may
//! write their own descriptions in German (only unambiguous ones: "junge" is young, not a boy).

/// One item per category, in the spelling OmniVoice expects (lowercase, comma-separated).
pub(super) fn omnivoice_instruct(description: &str) -> String {
    let text = description.to_lowercase();
    let words: Vec<(usize, &str)> = word_spans(&text);
    let mut items = Vec::new();
    for category in CATEGORIES {
        let found = category
            .iter()
            .filter_map(|(item, cues)| first_cue(&text, &words, cues).map(|at| (at, *item)))
            .min_by_key(|(at, _)| *at);
        if let Some((_, item)) = found {
            items.push(item);
        }
    }
    // An accent only when the description talks about one ("Japanese girl" is not an accent).
    let accent = (text.contains("accent") || text.contains("akzent"))
        .then(|| {
            ACCENTS
                .iter()
                .filter_map(|(item, cue)| find_word(&words, cue).map(|at| (at, *item)))
                .min_by_key(|(at, _)| *at)
        })
        .flatten();
    if let Some((_, item)) = accent {
        items.push(item);
    }
    items.join(", ")
}

type Category = &'static [(&'static str, &'static [&'static str])];

const CATEGORIES: &[Category] = &[
    &[
        (
            "female",
            &[
                "female", "woman", "women", "girl", "lady", "feminine", "she", "her", "weiblich",
                "frau", "mädchen",
            ],
        ),
        (
            "male",
            &[
                "male",
                "man",
                "men",
                "boy",
                "guy",
                "masculine",
                "he",
                "his",
                "männlich",
                "mann",
            ],
        ),
    ],
    &[
        (
            "child",
            &[
                "child",
                "kid",
                "little girl",
                "little boy",
                "kind",
                "kindlich",
            ],
        ),
        (
            "teenager",
            &[
                "teenager",
                "teen",
                "teenage",
                "adolescent",
                "jugendlich",
                "jugendliche",
                "teenagerin",
            ],
        ),
        (
            "elderly",
            &[
                "elderly",
                "old",
                "aged",
                "senior",
                "grandmother",
                "grandfather",
                "alt",
                "alte",
                "alter",
                "älter",
                "ältere",
                "älterer",
                "greis",
            ],
        ),
        (
            "middle-aged",
            &[
                "middle-aged",
                "middle aged",
                "mature",
                "mittleren alters",
                "mittelalt",
            ],
        ),
        (
            "young adult",
            &[
                "young",
                "youthful",
                "jung",
                "junge frau",
                "junger mann",
                "junge",
                "jungen",
            ],
        ),
    ],
    &[
        (
            "very high pitch",
            &[
                "very high",
                "very high-pitched",
                "squeaky",
                "sehr hoch",
                "sehr hohe",
                "piepsig",
            ],
        ),
        (
            "very low pitch",
            &["very low", "very deep", "sehr tief", "sehr tiefe"],
        ),
        (
            "high pitch",
            &[
                "high-pitched",
                "high pitch",
                "high",
                "bright",
                "hoch",
                "hohe",
                "hoher",
                "hohen",
                "hell",
                "helle",
                "heller",
                "hellen",
            ],
        ),
        (
            "low pitch",
            &[
                "low-pitched",
                "low pitch",
                "low",
                "deep",
                "bass",
                "baritone",
                "tief",
                "tiefe",
                "tiefer",
                "tiefen",
            ],
        ),
    ],
    &[(
        "whisper",
        &[
            "whisper",
            "whispering",
            "whispered",
            "whispery",
            "flüstern",
            "flüsternd",
            "geflüstert",
        ],
    )],
];

const ACCENTS: &[(&str, &str)] = &[
    ("american accent", "american"),
    ("australian accent", "australian"),
    ("british accent", "british"),
    ("canadian accent", "canadian"),
    ("chinese accent", "chinese"),
    ("indian accent", "indian"),
    ("japanese accent", "japanese"),
    ("korean accent", "korean"),
    ("portuguese accent", "portuguese"),
    ("russian accent", "russian"),
];

/// Words with their byte offsets (letters, digits and inner hyphens/apostrophes).
fn word_spans(text: &str) -> Vec<(usize, &str)> {
    let mut out = Vec::new();
    let mut start = None;
    for (i, c) in text.char_indices() {
        let part = c.is_alphanumeric() || c == '-' || c == '\'';
        match (part, start) {
            (true, None) => start = Some(i),
            (false, Some(s)) => {
                out.push((s, text[s..i].trim_matches(['-', '\''])));
                start = None;
            }
            _ => {}
        }
    }
    if let Some(s) = start {
        out.push((s, text[s..].trim_matches(['-', '\''])));
    }
    out
}

fn find_word(words: &[(usize, &str)], cue: &str) -> Option<usize> {
    words.iter().find(|(_, w)| *w == cue).map(|(at, _)| *at)
}

/// Earliest position of any cue: single words match whole words, phrases match as text at
/// word boundaries (so "her" never fires inside "other", "man" never inside "woman").
fn first_cue(text: &str, words: &[(usize, &str)], cues: &[&str]) -> Option<usize> {
    cues.iter()
        .filter_map(|cue| {
            if cue.contains(' ') {
                text.match_indices(cue)
                    .find(|(at, _)| boundary(text, *at, cue.len()))
                    .map(|(at, _)| at)
            } else {
                find_word(words, cue)
            }
        })
        .min()
}

fn boundary(text: &str, at: usize, len: usize) -> bool {
    let before = text[..at].chars().next_back();
    let after = text[at + len..].chars().next();
    !before.is_some_and(char::is_alphanumeric) && !after.is_some_and(char::is_alphanumeric)
}

#[cfg(test)]
mod tests {
    use super::omnivoice_instruct;

    #[test]
    fn maps_card_descriptions() {
        assert_eq!(
            omnivoice_instruct("A cheerful young woman with a bright, warm voice."),
            "female, young adult, high pitch"
        );
        assert_eq!(
            omnivoice_instruct("An old man with a deep, rough and slow voice"),
            "male, elderly, low pitch"
        );
        assert_eq!(
            omnivoice_instruct("A shy teenage girl who speaks in a soft whisper"),
            "female, teenager, whisper"
        );
        assert_eq!(
            omnivoice_instruct("Middle-aged man, very deep voice, British accent"),
            "male, middle-aged, very low pitch, british accent"
        );
    }

    #[test]
    fn no_false_hits_inside_words() {
        // "woman" holds "man", "other" holds "her", "Japanese" without "accent" is no accent.
        assert_eq!(omnivoice_instruct("A woman from another world"), "female");
        assert_eq!(omnivoice_instruct("A Japanese shrine maiden"), "");
        assert_eq!(omnivoice_instruct("A warm, clear and friendly voice"), "");
    }

    #[test]
    fn understands_german() {
        assert_eq!(
            omnivoice_instruct("Eine junge Frau mit heller, freundlicher Stimme"),
            "female, young adult, high pitch"
        );
        assert_eq!(
            omnivoice_instruct("Ein alter Mann mit tiefer Stimme"),
            "male, elderly, low pitch"
        );
    }
}
