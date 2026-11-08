//! Einmalig geparste Nachrichten für die native Chatdarstellung.
//!
//! Normale Rollenspieltexte folgen `src/components/chat/RoleplayMessage.tsx`:
//! Sternchen bleiben sichtbar, Handlungen werden kursiv/violett und gesprochene
//! Passagen warm hervorgehoben. Strukturierte Markdown-Texte nutzen Iced direkt.
//! HTML, OOC-Badges (`((…))`), Vorlesen und Tauri-spezifische Tags sind noch nicht
//! portiert. Markdown-Bilder bleiben Alttext; dieses Modul lädt keine Ressourcen.

use iced::widget::{container, markdown, rich_text, span, text};
use iced::{Element, Fill, Font, Theme, color, font};

#[derive(Debug, Clone)]
pub struct Content {
    parsed: Parsed,
}

#[derive(Debug, Clone)]
enum Parsed {
    Roleplay(Vec<Segment>),
    Markdown(Vec<markdown::Item>),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Kind {
    Action,
    Dialogue,
    Narration,
    Newline,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Segment {
    kind: Kind,
    text: String,
}

impl Content {
    pub fn new(raw: &str) -> Self {
        let parsed = if structured_markdown(raw) {
            Parsed::Markdown(markdown::parse(raw).collect())
        } else {
            Parsed::Roleplay(parse_roleplay(raw))
        };
        Self { parsed }
    }

    pub fn view(&self, theme: &Theme) -> Element<'_, String> {
        self.view_for_user(theme, false)
    }

    /// `is_user` berücksichtigt die hellere Schrift der violetten Nutzerblase.
    /// Linkereignisse sind Iced-URIs (`String`); die Anwendung entscheidet über sie.
    pub fn view_for_user(&self, theme: &Theme, is_user: bool) -> Element<'_, String> {
        match &self.parsed {
            Parsed::Markdown(items) => {
                let mut settings = markdown::Settings::with_text_size(16, theme);
                settings.spacing = 10.into();
                if is_user {
                    // Die Nutzerblase bleibt auch im hellen App-Theme violett.
                    // Markdown-Normaltext erbt seine Vordergrundfarbe; Links und
                    // Inline-Code besitzen dagegen eigene Farben in Settings.
                    settings.style.link_color = color!(0xfef3c7);
                    settings.style.inline_code_color = color!(0xfaf5ff);
                    settings.style.inline_code_highlight.background = color!(0x3b0764).into();
                    container(markdown::view(items, settings))
                        .width(Fill)
                        .style(|_| container::Style {
                            text_color: Some(color!(0xfaf5ff)),
                            ..Default::default()
                        })
                        .into()
                } else {
                    markdown::view(items, settings)
                }
            }
            Parsed::Roleplay(segments) => {
                let dark = theme.extended_palette().is_dark;
                let spans: Vec<text::Span<'_, String>> = segments
                    .iter()
                    .map(|segment| {
                        let base = span(segment.text.as_str());
                        match segment.kind {
                            Kind::Action => base
                                .font(Font {
                                    style: font::Style::Italic,
                                    ..crate::ui_font()
                                })
                                .color(if is_user {
                                    color!(0xe9d5ff)
                                } else if dark {
                                    color!(0xd8b4fe)
                                } else {
                                    color!(0x7e22ce)
                                }),
                            Kind::Dialogue => base
                                .font(Font {
                                    weight: font::Weight::Medium,
                                    ..crate::ui_font()
                                })
                                .color(if is_user {
                                    color!(0xffffff)
                                } else if dark {
                                    color!(0xfef3c7)
                                } else {
                                    color!(0x92400e)
                                }),
                            Kind::Narration | Kind::Newline => {
                                if is_user {
                                    base.color(color!(0xfaf5ff))
                                } else {
                                    base.color(theme.palette().text)
                                }
                            }
                        }
                    })
                    .collect();
                rich_text(spans)
                    .size(16)
                    .line_height(1.625)
                    .width(Fill)
                    .wrapping(text::Wrapping::WordOrGlyph)
                    .into()
            }
        }
    }
}

/// Die Unterscheidung verhindert, dass ein Markdown-Parser gewöhnliche
/// Rollenspiel-Sternchen und unveränderte Zeilenumbrüche verschluckt.
fn structured_markdown(raw: &str) -> bool {
    if raw.contains("**") || raw.contains("__") || raw.contains('`') || raw.contains("](") {
        return true;
    }
    raw.lines().any(|line| {
        let line = line.trim_start();
        if line.starts_with("~~~")
            || line.starts_with("> ")
            || line.starts_with("- ")
            || line.starts_with("+ ")
            || line.starts_with("* ")
        {
            return true;
        }
        let heading = line.bytes().take_while(|byte| *byte == b'#').count();
        if (1..=6).contains(&heading) && line.as_bytes().get(heading) == Some(&b' ') {
            return true;
        }
        let number = line.bytes().take_while(u8::is_ascii_digit).count();
        number > 0
            && matches!(line.as_bytes().get(number), Some(b'.' | b')'))
            && line.as_bytes().get(number + 1) == Some(&b' ')
    })
}

fn flush(segments: &mut Vec<Segment>, current: &mut String, kind: Kind) {
    if !current.is_empty() {
        segments.push(Segment {
            kind,
            text: std::mem::take(current),
        });
    }
}

/// Port der Tauri-Segmentierung, einschließlich offener Streaming-Delimiter,
/// deutscher/französischer Anführungszeichen und Handlungen innerhalb von Rede.
fn parse_roleplay(input: &str) -> Vec<Segment> {
    let mut segments = Vec::new();
    let mut current = String::new();
    let mut in_action = false;
    let mut in_dialogue = false;
    let mut saved_dialogue = false;
    for character in input.chars() {
        let current_kind = if in_action {
            Kind::Action
        } else if in_dialogue {
            Kind::Dialogue
        } else {
            Kind::Narration
        };
        if character == '\n' {
            flush(&mut segments, &mut current, current_kind);
            segments.push(Segment {
                kind: Kind::Newline,
                text: "\n".into(),
            });
        } else if character == '*' {
            if in_action {
                current.push(character);
                flush(&mut segments, &mut current, Kind::Action);
                in_action = false;
                if saved_dialogue {
                    in_dialogue = true;
                    saved_dialogue = false;
                }
            } else {
                flush(&mut segments, &mut current, current_kind);
                if in_dialogue {
                    saved_dialogue = true;
                    in_dialogue = false;
                }
                in_action = true;
                current.push(character);
            }
        } else if !in_action && !in_dialogue && matches!(character, '"' | '„' | '“' | '«') {
            flush(&mut segments, &mut current, Kind::Narration);
            in_dialogue = true;
            current.push(character);
        } else if !in_action && in_dialogue && matches!(character, '"' | '”' | '“' | '»') {
            current.push(character);
            flush(&mut segments, &mut current, Kind::Dialogue);
            in_dialogue = false;
        } else {
            current.push(character);
        }
    }
    let final_kind = if in_action {
        Kind::Action
    } else if in_dialogue {
        Kind::Dialogue
    } else {
        Kind::Narration
    };
    flush(&mut segments, &mut current, final_kind);
    segments
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unicode_quotes_actions_and_line_breaks_keep_original_text() {
        let raw = "Erzählung.\n*lächelt* „Grüße, 世界!“";
        let segments = parse_roleplay(raw);
        assert_eq!(
            segments
                .iter()
                .map(|segment| segment.text.as_str())
                .collect::<String>(),
            raw
        );
        assert!(
            segments
                .iter()
                .any(|segment| segment.kind == Kind::Action && segment.text == "*lächelt*")
        );
        assert!(
            segments
                .iter()
                .any(|segment| segment.kind == Kind::Dialogue && segment.text == "„Grüße, 世界!“")
        );
        assert_eq!(
            segments
                .iter()
                .filter(|segment| segment.kind == Kind::Newline)
                .count(),
            1
        );
    }

    #[test]
    fn an_action_inside_dialogue_resumes_dialogue_afterwards() {
        let segments = parse_roleplay("\"Hallo *winkt* zurück!\"");
        assert_eq!(
            segments
                .iter()
                .map(|segment| segment.kind)
                .collect::<Vec<_>>(),
            vec![Kind::Dialogue, Kind::Action, Kind::Dialogue]
        );
        assert_eq!(segments[2].text, " zurück!\"");
    }

    #[test]
    fn open_streaming_delimiters_keep_their_style_across_lines() {
        let action = parse_roleplay("*Eine Handlung\nnoch nicht beendet");
        assert_eq!(action.last().unwrap().kind, Kind::Action);
        let dialogue = parse_roleplay("«Eine offene\nRede");
        assert_eq!(dialogue.last().unwrap().kind, Kind::Dialogue);
    }

    #[test]
    fn ordinary_actions_use_roleplay_but_structured_messages_use_markdown() {
        assert!(!structured_markdown("*lächelt*\n\"Hallo!\""));
        for raw in [
            "**Wichtig**",
            "# Überschrift",
            "- Eintrag",
            "1. Erster",
            "```rust\nlet x = 1;\n```",
            "[Link](https://example.com)",
        ] {
            assert!(structured_markdown(raw), "Nicht erkannt: {raw}");
        }
        assert!(!structured_markdown(
            "2026 ist ein Jahr.\n#keinTitel\n*Handlung*"
        ));
    }
}
