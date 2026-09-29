//! Language of story content the app writes itself (stage narration, suggestions, memory
//! defaults, bot replies). It follows the character's reply language, not the interface
//! language, so text inserted into a conversation matches the story.
//!
//! Only German, English and Russian texts exist; other reply languages get English, while the
//! language model still answers in the chosen language.

use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContentLang {
    De,
    En,
    Ru,
}

impl ContentLang {
    /// Maps a reply language as stored in the settings ("Deutsch", "English", "Русский", …).
    pub fn from_reply_language(name: &str) -> Self {
        match name.trim().to_lowercase().as_str() {
            "deutsch" | "german" | "de" => Self::De,
            "русский" | "russian" | "ru" => Self::Ru,
            _ => Self::En,
        }
    }

    /// The reply language from settings.json, read without loading the full settings.
    pub fn current() -> Self {
        // Tests must not depend on the developer's own settings.
        if cfg!(test) {
            return Self::De;
        }
        let path = crate::modules::settings::get_settings_file_path();
        Self::from_settings_file(&path)
    }

    /// The reply language exactly as the user chose it (e.g. "English", "日本語"), for prompts.
    pub fn reply_language_name() -> String {
        reply_language_in(&crate::modules::settings::get_settings_file_path())
            .unwrap_or_else(|| "Deutsch".to_string())
    }

    fn from_settings_file(path: &Path) -> Self {
        reply_language_in(path)
            .map(|name| Self::from_reply_language(&name))
            // The app's default reply language is German.
            .unwrap_or(Self::De)
    }

    /// Picks the text for this language.
    pub fn pick<'a>(self, de: &'a str, en: &'a str, ru: &'a str) -> &'a str {
        match self {
            Self::De => de,
            Self::En => en,
            Self::Ru => ru,
        }
    }

    /// Picks the template for this language and fills its `{}` placeholders in order.
    pub fn fill(self, de: &str, en: &str, ru: &str, args: &[&dyn std::fmt::Display]) -> String {
        let mut parts = self.pick(de, en, ru).split("{}");
        let mut out = parts.next().unwrap_or_default().to_string();
        for (index, part) in parts.enumerate() {
            if let Some(arg) = args.get(index) {
                out.push_str(&arg.to_string());
            }
            out.push_str(part);
        }
        out
    }

    /// Placeholder for "nothing to report" in memory fields.
    pub fn none_marker(self) -> &'static str {
        self.pick("Keine.", "None.", "Нет.")
    }
}

fn reply_language_in(path: &Path) -> Option<String> {
    let content = std::fs::read_to_string(path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&content).ok()?;
    value.get("reply_language")?.as_str().map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_reply_languages() {
        assert_eq!(ContentLang::from_reply_language("Deutsch"), ContentLang::De);
        assert_eq!(ContentLang::from_reply_language("English"), ContentLang::En);
        assert_eq!(ContentLang::from_reply_language("Русский"), ContentLang::Ru);
        assert_eq!(ContentLang::from_reply_language("日本語"), ContentLang::En);
    }

    #[test]
    fn fills_placeholders_in_order() {
        assert_eq!(
            ContentLang::En.fill("{} x {}", "{} of {}", "{} из {}", &[&3, &"five"]),
            "3 of five"
        );
    }

    #[test]
    fn reads_the_reply_language_from_settings() {
        let dir =
            std::env::temp_dir().join(format!("otakusoul-content-lang-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("settings.json");
        std::fs::write(&path, r#"{"reply_language":"English"}"#).unwrap();
        assert_eq!(ContentLang::from_settings_file(&path), ContentLang::En);
        assert_eq!(
            ContentLang::from_settings_file(&dir.join("missing.json")),
            ContentLang::De
        );
        let _ = std::fs::remove_dir_all(dir);
    }
}
