//! HTML replay of a played act or a chat: one self-contained page (no scripts, no outside
//! requests) that reads like a story and prints well. Portraits are embedded once per figure.

use crate::modules::content_lang::ContentLang;
use regex::Regex;
use std::fmt::Write as _;
use std::sync::LazyLock;

/// Who speaks, which decides how the line looks.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Voice {
    /// Game master or narrator: prose without a bubble.
    Narrator,
    /// The player: bubble on the right.
    Player,
    /// A figure (companion, NPC, chat partner): bubble on the left with the portrait.
    Figure,
    /// Notes of the system.
    System,
}

#[derive(Debug, Clone)]
pub struct ReplayLine {
    pub speaker: String,
    pub voice: Voice,
    pub text: String,
    /// `HH:MM` or empty.
    pub time: String,
    /// How the player acts (`say`, `do`, `think`, `whisper`, …) or empty.
    pub mode: String,
}

#[derive(Debug, Clone)]
pub struct ReplayCast {
    pub name: String,
    /// `data:image/…` portrait.
    pub portrait: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct Replay {
    pub title: String,
    pub subtitle: String,
    /// Short facts under the title (place, time, …).
    pub facts: Vec<(String, String)>,
    /// Lists after the facts (objectives, inventory, consequences): heading and items.
    pub lists: Vec<(String, Vec<String>)>,
    pub cast: Vec<ReplayCast>,
    pub lines: Vec<ReplayLine>,
}

static THINK_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?is)<think>.*?</think>").expect("static regex is valid"));
static EMOTION_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\[emotion:\s*[a-z_]+\s*\]|<emotion>\s*[a-z_]+\s*</emotion>")
        .expect("static regex is valid")
});

/// The text as the story shows it: without reasoning blocks and expression tags.
pub fn clean_text(text: &str) -> String {
    let without_think = THINK_RE.replace_all(text, "");
    EMOTION_RE
        .replace_all(&without_think, "")
        .trim()
        .to_string()
}

fn escape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(c),
        }
    }
    out
}

/// Escaped text with `*action*` as italics, `**strong**` as bold and line breaks kept.
fn rich(text: &str) -> String {
    let mut out = String::new();
    for (i, paragraph) in text.split("\n\n").enumerate() {
        if i > 0 {
            out.push_str("<br><br>");
        }
        let mut bold = false;
        let mut italic = false;
        let escaped = escape(paragraph.trim()).replace('\n', "<br>");
        let mut chars = escaped.chars().peekable();
        while let Some(c) = chars.next() {
            if c == '*' {
                if chars.peek() == Some(&'*') {
                    chars.next();
                    out.push_str(if bold { "</strong>" } else { "<strong>" });
                    bold = !bold;
                } else {
                    out.push_str(if italic { "</em>" } else { "<em>" });
                    italic = !italic;
                }
            } else {
                out.push(c);
            }
        }
        // A paragraph ends every open mark.
        if italic {
            out.push_str("</em>");
        }
        if bold {
            out.push_str("</strong>");
        }
    }
    out
}

/// Only picture data URLs go into the page (they end up in a CSS `url()`), and none with quotes.
fn safe_portrait(portrait: &str) -> bool {
    portrait.starts_with("data:image/") && !portrait.contains(['"', '\'', ')', '(', '\\', ' ', '<'])
}

const STYLE: &str = r#"
:root { --bg: #f7f5f2; --ink: #1f2430; --muted: #6b7280; --card: #ffffff; --line: #e4e0da; --accent: #7c3aed; --me: #ede9fe; --gm: #f1ede6; }
@media (prefers-color-scheme: dark) { :root { --bg: #11141b; --ink: #e7e9ee; --muted: #9aa3b2; --card: #1a1f2a; --line: #2b3242; --accent: #a78bfa; --me: #2a2447; --gm: #171c26; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 17px/1.6 Georgia, "Iowan Old Style", "Noto Serif", serif; }
main { max-width: 46rem; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
header h1 { margin: 0 0 .25rem; font-size: 2rem; line-height: 1.2; }
.sub { color: var(--muted); margin: 0 0 1.25rem; font-style: italic; }
.facts { display: flex; flex-wrap: wrap; gap: .5rem; margin: 0 0 1.5rem; padding: 0; list-style: none; font: 14px/1.4 system-ui, sans-serif; }
.facts li { padding: .25rem .7rem; border: 1px solid var(--line); border-radius: 999px; background: var(--card); }
.facts b { color: var(--muted); font-weight: 600; margin-right: .3rem; }
.cast { display: flex; flex-wrap: wrap; gap: .9rem; margin: 0 0 1.75rem; font: 14px system-ui, sans-serif; }
.cast span { display: inline-flex; align-items: center; gap: .5rem; }
.av { flex: none; width: 2.4rem; height: 2.4rem; border-radius: 50%; background: var(--accent) center / cover no-repeat; color: #fff; display: inline-flex; align-items: center; justify-content: center; font: 700 1rem system-ui, sans-serif; border: 2px solid var(--card); box-shadow: 0 0 0 1px var(--line); }
section.list { margin: 0 0 1.5rem; font: 15px/1.5 system-ui, sans-serif; }
section.list h2 { margin: 0 0 .4rem; font-size: .8rem; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
section.list ul { margin: 0; padding-left: 1.2rem; }
hr { border: 0; border-top: 1px solid var(--line); margin: 1.5rem 0 2rem; }
.line { margin: 0 0 1.1rem; display: flex; gap: .7rem; align-items: flex-start; }
.line .who { font: 600 13px/1.3 system-ui, sans-serif; color: var(--muted); margin: 0 0 .2rem; }
.line .who time { font-weight: 400; margin-left: .5rem; opacity: .8; }
.line .body { min-width: 0; max-width: calc(100% - 3.1rem); }
.bubble { padding: .6rem .9rem; border-radius: 1rem; background: var(--card); border: 1px solid var(--line); overflow-wrap: anywhere; }
.line.player { flex-direction: row-reverse; }
.line.player .bubble { background: var(--me); border-color: transparent; }
.line.player .who { text-align: right; }
.line.narrator { display: block; }
.line.narrator .body { max-width: none; }
.line.narrator .bubble { background: var(--gm); border: 0; border-left: 3px solid var(--accent); border-radius: .3rem; padding: .7rem 1rem; }
.line.system .bubble { background: transparent; border: 1px dashed var(--line); color: var(--muted); font: 14px/1.5 system-ui, sans-serif; }
.line.think .bubble { font-style: italic; opacity: .85; }
.line.whisper .bubble { border-style: dashed; }
.tag { font: 600 11px system-ui, sans-serif; text-transform: uppercase; letter-spacing: .06em; color: var(--accent); margin-right: .4rem; }
footer { margin-top: 3rem; text-align: center; color: var(--muted); font: 13px system-ui, sans-serif; }
@media print { body { background: #fff; color: #000; font-size: 11pt; } main { max-width: none; padding: 0; } .bubble { break-inside: avoid; } }
"#;

/// The replay as one HTML page.
pub fn render_html(replay: &Replay, lang: &ContentLang, language_code: &str) -> String {
    let mut portraits: Vec<(&str, &str)> = Vec::new();
    let mut classes: Vec<(String, Option<usize>)> = Vec::new();
    for member in &replay.cast {
        let index = member
            .portrait
            .as_deref()
            .filter(|p| safe_portrait(p))
            .map(|p| {
                portraits.push((&member.name, p));
                portraits.len() - 1
            });
        classes.push((member.name.to_lowercase(), index));
    }
    let portrait_of = |name: &str| {
        classes
            .iter()
            .find(|(n, _)| *n == name.to_lowercase())
            .and_then(|(_, i)| *i)
    };
    let avatar = |name: &str| -> String {
        match portrait_of(name) {
            Some(i) => format!(
                "<span class=\"av p{i}\" role=\"img\" aria-label=\"{}\"></span>",
                escape(name)
            ),
            None => format!(
                "<span class=\"av\" aria-hidden=\"true\">{}</span>",
                escape(
                    &name
                        .chars()
                        .next()
                        .map(|c| c.to_uppercase().to_string())
                        .unwrap_or_default()
                )
            ),
        }
    };

    let mut out = String::new();
    let _ = write!(
        out,
        "<!DOCTYPE html>\n<html lang=\"{}\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<meta name=\"generator\" content=\"OtakuSoul\">\n<title>{}</title>\n<style>{STYLE}",
        escape(language_code),
        escape(&replay.title)
    );
    for (i, (_, portrait)) in portraits.iter().enumerate() {
        let _ = write!(out, ".p{i} {{ background-image: url({portrait}); }}\n");
    }
    out.push_str("</style>\n</head>\n<body>\n<main>\n<header>\n");
    let _ = write!(out, "<h1>{}</h1>\n", escape(&replay.title));
    if !replay.subtitle.trim().is_empty() {
        let _ = write!(out, "<p class=\"sub\">{}</p>\n", rich(&replay.subtitle));
    }
    out.push_str("</header>\n");
    if !replay.facts.is_empty() {
        out.push_str("<ul class=\"facts\">\n");
        for (label, value) in replay.facts.iter().filter(|(_, v)| !v.trim().is_empty()) {
            let _ = write!(out, "<li><b>{}</b>{}</li>\n", escape(label), escape(value));
        }
        out.push_str("</ul>\n");
    }
    if !replay.cast.is_empty() {
        out.push_str("<div class=\"cast\">");
        for member in &replay.cast {
            let _ = write!(
                out,
                "<span>{}{}</span>",
                avatar(&member.name),
                escape(&member.name)
            );
        }
        out.push_str("</div>\n");
    }
    for (heading, items) in replay.lists.iter().filter(|(_, items)| !items.is_empty()) {
        let _ = write!(
            out,
            "<section class=\"list\"><h2>{}</h2><ul>",
            escape(heading)
        );
        for item in items {
            let _ = write!(out, "<li>{}</li>", rich(item));
        }
        out.push_str("</ul></section>\n");
    }
    out.push_str("<hr>\n");
    for line in replay.lines.iter().filter(|l| !l.text.trim().is_empty()) {
        let class = match line.voice {
            Voice::Narrator => "narrator",
            Voice::Player => "player",
            Voice::Figure => "figure",
            Voice::System => "system",
        };
        let mode_class = match line.mode.as_str() {
            "think" => " think",
            "whisper" => " whisper",
            _ => "",
        };
        let mode_label = match line.mode.as_str() {
            "think" => Some(lang.t("Thinks")),
            "whisper" => Some(lang.t("Whispers")),
            _ => None,
        };
        let _ = write!(out, "<div class=\"line {class}{mode_class}\">");
        if matches!(line.voice, Voice::Figure | Voice::Player) {
            out.push_str(&avatar(&line.speaker));
        }
        out.push_str("<div class=\"body\">");
        if line.voice != Voice::Narrator || !line.time.is_empty() {
            let _ = write!(out, "<div class=\"who\">{}", escape(&line.speaker));
            if !line.time.is_empty() {
                let _ = write!(out, "<time>{}</time>", escape(&line.time));
            }
            out.push_str("</div>");
        }
        out.push_str("<div class=\"bubble\">");
        if let Some(label) = mode_label {
            let _ = write!(out, "<span class=\"tag\">{}</span>", escape(&label));
        }
        out.push_str(&rich(&line.text));
        out.push_str("</div></div></div>\n");
    }
    let _ = write!(
        out,
        "<footer>{}</footer>\n</main>\n</body>\n</html>\n",
        escape(&lang.t("Made with OtakuSoul"))
    );
    out
}

const MAX_PORTRAIT_BYTES: u64 = 6 * 1024 * 1024;

/// The figure's picture as a data URL: the one the profile carries, else the card's PNG.
fn portrait_data_url(profile: &crate::modules::characters::CharacterProfile) -> Option<String> {
    if let Some(url) = profile
        .avatar_data_url
        .as_deref()
        .filter(|u| u.starts_with("data:image/"))
    {
        return Some(url.to_string());
    }
    let path = std::path::Path::new(profile.avatar_path.as_deref()?);
    if std::fs::metadata(path).ok()?.len() > MAX_PORTRAIT_BYTES {
        return None;
    }
    let mime = match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "png" => "image/png",
        "webp" => "image/webp",
        "jpg" | "jpeg" => "image/jpeg",
        _ => return None,
    };
    use base64::Engine as _;
    Some(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(std::fs::read(path).ok()?)
    ))
}

fn local_time(seconds: i64) -> String {
    chrono::DateTime::from_timestamp(seconds, 0)
        .map(|t| t.with_timezone(&chrono::Local).format("%H:%M").to_string())
        .unwrap_or_default()
}

fn cast_member(
    name: &str,
    characters: &[crate::modules::characters::CharacterProfile],
) -> ReplayCast {
    ReplayCast {
        name: name.to_string(),
        portrait: crate::modules::characters::find_by_name(characters, name)
            .and_then(portrait_data_url),
    }
}

/// An act of the Stage: header, goals and inventory, then the whole log.
pub fn scene_replay(
    state: &crate::modules::stage::SceneState,
    characters: &[crate::modules::characters::CharacterProfile],
    lang: &ContentLang,
) -> Replay {
    let def = &state.definition;
    let mut cast: Vec<ReplayCast> = Vec::new();
    let mut add = |name: &str| {
        if !name.trim().is_empty() && !cast.iter().any(|c| c.name.eq_ignore_ascii_case(name)) {
            cast.push(cast_member(name, characters));
        }
    };
    for name in &def.party {
        add(name);
    }
    let mut lines = Vec::new();
    for message in &state.chat_log {
        let voice = match message.sender_role.as_str() {
            "gm" => Voice::Narrator,
            "player" => Voice::Player,
            "companion" | "npc" => Voice::Figure,
            _ => Voice::System,
        };
        let speaker = if voice == Voice::Narrator {
            lang.t("Game master").into_owned()
        } else {
            message.sender_name.clone()
        };
        if matches!(voice, Voice::Player | Voice::Figure) {
            add(&speaker);
        }
        lines.push(ReplayLine {
            speaker,
            voice,
            text: clean_text(&message.content),
            time: local_time(message.timestamp as i64),
            mode: message.turn_mode.clone(),
        });
    }
    let objectives = state
        .objectives
        .iter()
        .map(|o| {
            let mark = if o.status == "completed" {
                "✔"
            } else {
                "○"
            };
            format!(
                "{mark} **{}** ({}/{}) {}",
                o.title, o.current, o.max, o.description
            )
        })
        .collect();
    let inventory = state
        .inventory
        .iter()
        .map(|i| format!("**{}** ×{} {}", i.name, i.quantity, i.description))
        .collect();
    let consequences = state
        .consequence_ledger
        .iter()
        .map(|c| c.text.clone())
        .collect();
    Replay {
        title: def.title.clone(),
        subtitle: def.description.clone(),
        facts: vec![
            (lang.t("Place").into_owned(), state.world.location.clone()),
            (lang.t("Time").into_owned(), state.world.time_of_day.clone()),
        ],
        lists: vec![
            (lang.t("Goals").into_owned(), objectives),
            (lang.t("Inventory").into_owned(), inventory),
            (lang.t("Lasting consequences").into_owned(), consequences),
        ],
        cast,
        lines,
    }
}

/// A chat; `speaker_names` maps the guests of a group chat (IDs) to their names.
pub fn chat_replay(
    title: &str,
    messages: &[crate::modules::memory::StoredChatMessage],
    char_name: &str,
    user_name: &str,
    speaker_names: &std::collections::HashMap<String, String>,
    characters: &[crate::modules::characters::CharacterProfile],
    lang: &ContentLang,
) -> Replay {
    let mut cast: Vec<ReplayCast> = vec![cast_member(char_name, characters)];
    let mut lines = Vec::new();
    for message in messages {
        let (speaker, voice) = match message.role.as_str() {
            "user" => (user_name.to_string(), Voice::Player),
            "assistant" => (
                speaker_names
                    .get(&message.speaker_id)
                    .cloned()
                    .unwrap_or_else(|| char_name.to_string()),
                Voice::Figure,
            ),
            _ => (String::new(), Voice::System),
        };
        if voice == Voice::Figure && !cast.iter().any(|c| c.name.eq_ignore_ascii_case(&speaker)) {
            cast.push(cast_member(&speaker, characters));
        }
        lines.push(ReplayLine {
            speaker,
            voice,
            text: clean_text(&message.content),
            time: local_time(message.created_at as i64),
            mode: String::new(),
        });
    }
    let date = messages
        .first()
        .and_then(|m| chrono::DateTime::from_timestamp(m.created_at as i64, 0))
        .map(|t| {
            t.with_timezone(&chrono::Local)
                .format("%Y-%m-%d")
                .to_string()
        })
        .unwrap_or_default();
    Replay {
        title: title.to_string(),
        subtitle: String::new(),
        facts: vec![(lang.t("Date").into_owned(), date)],
        lists: Vec::new(),
        cast,
        lines,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn replay() -> Replay {
        Replay {
            title: "Frostweiler <1>".into(),
            subtitle: "Ein *stiller* Abend".into(),
            facts: vec![("Ort".into(), "Turm".into())],
            lists: vec![("Ziele".into(), vec!["Glocke läuten".into()])],
            cast: vec![
                ReplayCast {
                    name: "Lirwen".into(),
                    portrait: Some("data:image/png;base64,AAAA".into()),
                },
                ReplayCast {
                    name: "Faelion".into(),
                    portrait: Some("javascript:alert(1)".into()),
                },
            ],
            lines: vec![
                ReplayLine {
                    speaker: "GM".into(),
                    voice: Voice::Narrator,
                    text: "Der Schnee fällt.".into(),
                    time: "".into(),
                    mode: "".into(),
                },
                ReplayLine {
                    speaker: "Du".into(),
                    voice: Voice::Player,
                    text: "**Ich** gehe <b>hinein</b>.".into(),
                    time: "21:04".into(),
                    mode: "do".into(),
                },
                ReplayLine {
                    speaker: "Lirwen".into(),
                    voice: Voice::Figure,
                    text: "*lächelt* Komm mit.".into(),
                    time: "".into(),
                    mode: "".into(),
                },
                ReplayLine {
                    speaker: "Du".into(),
                    voice: Voice::Player,
                    text: "Ob sie mir traut?".into(),
                    time: "".into(),
                    mode: "think".into(),
                },
            ],
        }
    }

    #[test]
    fn the_page_is_self_contained_and_escapes_everything_it_was_given() {
        let html = render_html(&replay(), &ContentLang::current(), "de");
        assert!(html.contains("<title>Frostweiler &lt;1&gt;</title>"));
        assert!(
            html.contains("&lt;b&gt;hinein&lt;/b&gt;"),
            "markup in a message stays text"
        );
        assert!(!html.contains("<script"));
        assert!(
            !html.contains("http://") && !html.contains("https://"),
            "no outside requests"
        );
        assert!(html.contains("<em>lächelt</em>") && html.contains("<strong>Ich</strong>"));
        assert!(html.contains("<em>stiller</em>"));
    }

    #[test]
    fn portraits_are_embedded_once_and_only_as_picture_data_urls() {
        let html = render_html(&replay(), &ContentLang::current(), "de");
        assert_eq!(html.matches("data:image/png;base64,AAAA").count(), 1);
        assert!(!html.contains("javascript:"));
        // Lirwen has a picture, Faelion falls back to the initial.
        assert!(html.contains("class=\"av p0\""));
        assert!(html.contains(">F</span>"));
    }

    #[test]
    fn thoughts_get_their_own_look_and_a_label() {
        let html = render_html(&replay(), &ContentLang::current(), "de");
        assert!(html.contains("line player think"));
        assert!(
            html.contains("<span class=\"tag\">Thinks</span>") || html.contains("class=\"tag\"")
        );
    }

    #[test]
    fn reasoning_and_expression_tags_are_not_part_of_the_story() {
        assert_eq!(
            clean_text("<think>plan</think>Hallo. [emotion: blush]"),
            "Hallo."
        );
        assert_eq!(clean_text("Ja <emotion>joy</emotion>"), "Ja");
    }

    #[test]
    fn open_marks_end_with_their_paragraph() {
        assert_eq!(rich("*offen"), "<em>offen</em>");
        assert_eq!(rich("a\n\n**b"), "a<br><br><strong>b</strong>");
    }

    #[test]
    fn an_act_becomes_a_story_with_its_header_cast_and_log() {
        use crate::modules::stage::{SceneDefinition, SceneTurnMessage, build_initial_scene_state};
        let def: SceneDefinition = serde_json::from_str(include_str!(
            "../../../presets/stories/scenes/story_frozen_bells.json"
        ))
        .unwrap();
        let mut state = build_initial_scene_state(&def);
        let message = |role: &str, name: &str, text: &str, mode: &str| SceneTurnMessage {
            id: "m".into(),
            sender_id: name.into(),
            sender_name: name.into(),
            sender_role: role.into(),
            avatar_url: None,
            content: text.into(),
            turn_mode: mode.into(),
            whisper_target: None,
            event_card: None,
            timestamp: 1_760_000_000,
        };
        state.chat_log = vec![
            message("gm", "GM", "<think>x</think>Es schneit. [emotion: calm]", "do"),
            message("player", "Du", "Ich klopfe.", "do"),
            message("companion", "Lirwen", "*lächelt*", "say"),
        ];
        let lang = ContentLang::current();
        let replay = scene_replay(&state, &[], &lang);
        assert_eq!(replay.title, def.title);
        assert_eq!(replay.lines.len(), 3);
        assert_eq!(replay.lines[0].voice, Voice::Narrator);
        assert_eq!(replay.lines[0].text, "Es schneit.");
        assert!(replay.cast.iter().any(|c| c.name == "Lirwen"), "the speakers are in the cast");
        let html = render_html(&replay, &lang, lang.code());
        assert!(html.contains("line narrator") && html.contains("line figure"));
        assert!(!html.contains("&lt;think&gt;") && !html.contains("emotion:"), "reasoning does not leak into the page");
    }
}
