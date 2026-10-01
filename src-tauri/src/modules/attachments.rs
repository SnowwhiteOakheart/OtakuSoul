//! Files attached to chat messages, stored under `attachments/<chat_id>/` in the data folder.
//! Images go to the model as image blocks (vision models); text and PDF files are extracted
//! once and go along as text.

use crate::modules::paths::base_dirs;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use ts_rs::TS;

/// Longest side of a stored image; larger photos only cost tokens and upload time.
const MAX_IMAGE_SIDE: u32 = 1568;
/// Text sent per attachment; the rest is cut off with a note.
const MAX_TEXT_CHARS: usize = 30_000;
/// Largest file accepted before decoding.
const MAX_FILE_BYTES: usize = 25 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Attachment {
    pub id: String,
    /// `image` or `text`.
    pub kind: String,
    /// Original file name, shown in the chat.
    pub name: String,
    pub mime: String,
    /// Stored file relative to the attachments folder (`<chat_id>/<id>.<ext>`).
    pub file: String,
    /// Extracted text of text/PDF attachments.
    #[serde(default)]
    pub text: Option<String>,
    /// The text was longer than what is sent.
    #[serde(default)]
    pub truncated: bool,
}

pub fn root() -> PathBuf {
    base_dirs().1.join("attachments")
}

fn safe_segment(value: &str) -> String {
    value
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-'))
        .collect()
}

fn extension(name: &str) -> String {
    name.rsplit_once('.')
        .map(|(_, ext)| ext.to_ascii_lowercase())
        .unwrap_or_default()
}

fn image_mime(ext: &str) -> Option<&'static str> {
    match ext {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        _ => None,
    }
}

fn truncate(text: &str) -> (String, bool) {
    let text = text.trim();
    match text.char_indices().nth(MAX_TEXT_CHARS) {
        Some((cut, _)) => (text[..cut].to_string(), true),
        None => (text.to_string(), false),
    }
}

/// Stores `bytes` for a message of `chat_id`. Images are scaled down and saved as PNG/JPEG,
/// PDFs and text files are reduced to their text.
pub fn save(chat_id: &str, name: &str, bytes: &[u8]) -> Result<Attachment, String> {
    if bytes.len() > MAX_FILE_BYTES {
        return Err(crate::err!("backend.attachment.tooLarge", name = name));
    }
    let chat = safe_segment(chat_id);
    if chat.is_empty() {
        return Err(crate::err!("backend.chat.notFound"));
    }
    let id = format!(
        "att_{}_{:08x}",
        chrono::Utc::now().timestamp(),
        rand::random::<u32>()
    );
    let ext = extension(name);
    let dir = root().join(&chat);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    if image_mime(&ext).is_some() || bytes.starts_with(b"\x89PNG") || bytes.starts_with(b"\xff\xd8")
    {
        let image = image::load_from_memory(bytes)
            .map_err(|e| crate::err!("backend.attachment.unreadable", name = name, error = e))?;
        let image = if image.width().max(image.height()) > MAX_IMAGE_SIDE {
            image.resize(
                MAX_IMAGE_SIDE,
                MAX_IMAGE_SIDE,
                image::imageops::FilterType::Lanczos3,
            )
        } else {
            image
        };
        // Photos as JPEG, everything with transparency as PNG.
        let (format, out_ext, mime) = if image.color().has_alpha() {
            (image::ImageFormat::Png, "png", "image/png")
        } else {
            (image::ImageFormat::Jpeg, "jpg", "image/jpeg")
        };
        let file = format!("{chat}/{id}.{out_ext}");
        let image = if format == image::ImageFormat::Jpeg {
            image::DynamicImage::ImageRgb8(image.to_rgb8())
        } else {
            image
        };
        image
            .save_with_format(root().join(&file), format)
            .map_err(|e| e.to_string())?;
        return Ok(Attachment {
            id,
            kind: "image".into(),
            name: name.to_string(),
            mime: mime.into(),
            file,
            text: None,
            truncated: false,
        });
    }

    let text = if ext == "pdf" || bytes.starts_with(b"%PDF") {
        // pdf-extract panics on some unusual fonts; treat that like an unreadable file.
        let bytes = bytes.to_vec();
        std::panic::catch_unwind(move || pdf_extract::extract_text_from_mem(&bytes))
            .map_err(|_| crate::err!("backend.attachment.unreadable", name = name, error = "PDF"))?
            .map_err(|e| crate::err!("backend.attachment.unreadable", name = name, error = e))?
    } else {
        String::from_utf8(bytes.to_vec())
            .map_err(|_| crate::err!("backend.attachment.unsupported", name = name))?
    };
    if text.trim().is_empty() {
        return Err(crate::err!("backend.attachment.empty", name = name));
    }
    let (text, truncated) = truncate(&text);
    let file = format!("{chat}/{id}.txt");
    fs::write(root().join(&file), &text).map_err(|e| e.to_string())?;
    Ok(Attachment {
        id,
        kind: "text".into(),
        name: name.to_string(),
        mime: if ext == "pdf" {
            "application/pdf"
        } else {
            "text/plain"
        }
        .into(),
        file,
        text: Some(text),
        truncated,
    })
}

/// Path of a stored attachment; `None` if `file` points outside the attachments folder.
pub fn path_of(file: &str) -> Option<PathBuf> {
    let (chat, name) = file.split_once('/')?;
    if safe_segment(chat) != chat || name.contains(['/', '\\']) || name.starts_with('.') {
        return None;
    }
    Some(root().join(chat).join(name))
}

/// `data:` URL of an image attachment, for the model and for showing it in the chat.
pub fn data_url(attachment: &Attachment) -> Option<String> {
    let bytes = fs::read(path_of(&attachment.file)?).ok()?;
    Some(format!(
        "data:{};base64,{}",
        attachment.mime,
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

/// Text attachments as they are appended to the message text.
pub fn text_block(attachment: &Attachment) -> Option<String> {
    let text = attachment.text.as_deref()?;
    let note = if attachment.truncated {
        "\n[… truncated]"
    } else {
        ""
    };
    Some(format!(
        "[Attached file: {}]\n```\n{}{}\n```",
        attachment.name, text, note
    ))
}

/// Images stay as images only in this many of the latest messages that have some; older ones
/// become a short note, so a long chat doesn't resend every photo each turn.
const IMAGE_MESSAGES_SENT: usize = 3;

/// Turns attachments into what the model gets: text files are appended to the message text,
/// images stay as attachments when the model can see them (`vision`) and recent enough,
/// otherwise they become a note in the text.
pub fn prepare(messages: &mut [crate::modules::inference::ChatMessage], vision: bool) {
    let mut image_messages = 0usize;
    for msg in messages.iter_mut().rev() {
        if msg.attachments.is_empty() {
            continue;
        }
        let keep_images = vision && msg.attachments.iter().any(|a| a.kind == "image") && {
            image_messages += 1;
            image_messages <= IMAGE_MESSAGES_SENT
        };
        let mut extra = Vec::new();
        msg.attachments.retain(|a| {
            if a.kind == "image" {
                if !keep_images {
                    extra.push(format!("[Image attached: {} (not shown to you)]", a.name));
                }
                keep_images
            } else {
                extra.extend(text_block(a));
                false
            }
        });
        if !extra.is_empty() {
            let text = msg.content.trim();
            msg.content = if text.is_empty() {
                extra.join("\n\n")
            } else {
                format!("{text}\n\n{}", extra.join("\n\n"))
            };
        }
    }
}

/// Deletes all attachments of a chat.
pub fn remove_chat(chat_id: &str) {
    let chat = safe_segment(chat_id);
    if !chat.is_empty() {
        let _ = fs::remove_dir_all(root().join(chat));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::inference::ChatMessage;

    fn attachment(kind: &str, name: &str) -> Attachment {
        Attachment {
            id: name.into(),
            kind: kind.into(),
            name: name.into(),
            mime: "image/png".into(),
            file: format!("c/{name}"),
            text: (kind == "text").then(|| "Inhalt".to_string()),
            truncated: false,
        }
    }

    fn with(attachments: Vec<Attachment>) -> ChatMessage {
        ChatMessage {
            role: "user".into(),
            content: "Schau mal".into(),
            attachments,
        }
    }

    #[test]
    fn prepares_attachments_for_the_model() {
        let mut messages: Vec<ChatMessage> = (0..5)
            .map(|i| with(vec![attachment("image", &format!("bild{i}.png"))]))
            .collect();
        messages.push(with(vec![attachment("text", "notiz.txt")]));
        prepare(&mut messages, true);
        // Text goes into the message, only the last three images stay images.
        assert!(messages[5].attachments.is_empty());
        assert!(
            messages[5]
                .content
                .contains("[Attached file: notiz.txt]\n```\nInhalt\n```")
        );
        assert_eq!(
            messages
                .iter()
                .filter(|m| !m.attachments.is_empty())
                .count(),
            3
        );
        assert!(
            messages[0]
                .content
                .ends_with("[Image attached: bild0.png (not shown to you)]")
        );

        let mut blind = vec![with(vec![attachment("image", "foto.jpg")])];
        prepare(&mut blind, false);
        assert!(blind[0].attachments.is_empty());
        assert!(blind[0].content.contains("foto.jpg"));
    }

    #[test]
    fn rejects_paths_outside_the_folder() {
        assert!(path_of("chat_1/att_1.png").is_some());
        assert!(path_of("../secret/att.png").is_none());
        assert!(path_of("chat_1/../../x").is_none());
        assert!(path_of("chat_1/.hidden").is_none());
        assert!(path_of("noslash").is_none());
    }

    #[test]
    fn truncates_long_text_on_a_char_boundary() {
        let long = "ä".repeat(MAX_TEXT_CHARS + 5);
        let (text, cut) = truncate(&long);
        assert!(cut);
        assert_eq!(text.chars().count(), MAX_TEXT_CHARS);
        assert_eq!(truncate("kurz"), ("kurz".to_string(), false));
    }

    #[test]
    fn formats_text_attachments() {
        let a = Attachment {
            id: "a".into(),
            kind: "text".into(),
            name: "notes.md".into(),
            mime: "text/plain".into(),
            file: "c/a.txt".into(),
            text: Some("Hallo".into()),
            truncated: true,
        };
        assert_eq!(
            text_block(&a).unwrap(),
            "[Attached file: notes.md]\n```\nHallo\n[… truncated]\n```"
        );
    }
}
