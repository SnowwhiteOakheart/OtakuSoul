//! Content for adults: what came from the adult hub source carries the mark
//! `extensions.otakusoul_nsfw` (cards, scenes, lorebooks) and stays hidden while adult content is
//! off. Nothing is deleted; turning it on shows it again.

/// Key in `extensions` that marks content for adults (cards may also bring it themselves).
pub const MARK: &str = "otakusoul_nsfw";

/// Adult content may be shown: NSFW on and the age confirmed (`settings::nsfw_allowed`).
pub fn allowed() -> bool {
    crate::modules::settings::nsfw_allowed()
}

/// Whether `extensions` mark the content as adult content.
pub fn is_marked(extensions: &serde_json::Value) -> bool {
    extensions
        .get(MARK)
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false)
}

/// Marks content as adult content (`extensions` becomes an object when it was none).
pub fn mark(extensions: &mut serde_json::Value) {
    if !extensions.is_object() {
        *extensions = serde_json::json!({});
    }
    extensions[MARK] = serde_json::Value::Bool(true);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn marks_and_recognizes_adult_content() {
        let mut extensions = serde_json::Value::Null;
        assert!(!is_marked(&extensions));
        mark(&mut extensions);
        assert!(is_marked(&extensions));
        let mut card = serde_json::json!({"custom_title": "x"});
        mark(&mut card);
        assert_eq!(card["custom_title"], "x");
        assert!(is_marked(&card));
        assert!(!is_marked(&serde_json::json!({MARK: false})));
    }
}
