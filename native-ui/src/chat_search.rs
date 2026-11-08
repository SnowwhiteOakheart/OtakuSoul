//! Suche nur in den geladenen Nachrichten und dem lokalen Begrüßungssnapshot.
use crate::profile::StoredMessage;

pub struct Matches {
    pub greeting: bool,
    pub indices: Vec<usize>,
}

impl Matches {
    pub fn count(&self) -> usize {
        self.indices.len() + usize::from(self.greeting)
    }
}

pub fn find(messages: &[StoredMessage], greeting: Option<&str>, query: &str) -> Matches {
    let query = query.trim().to_lowercase();
    let matches = |text: &str| query.is_empty() || text.to_lowercase().contains(&query);
    Matches {
        greeting: greeting.is_some_and(|text| !text.trim().is_empty() && matches(text)),
        indices: messages
            .iter()
            .enumerate()
            .filter(|(_, message)| matches(&message.content))
            .map(|(index, _)| index)
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unicode_query_includes_greeting_and_keeps_original_message_indices() {
        let messages = vec![
            StoredMessage {
                role: "user".into(),
                content: "Hallo".into(),
            },
            StoredMessage {
                role: "assistant".into(),
                content: "Eine Ärztin wartet.".into(),
            },
        ];
        let found = find(&messages, Some("Die Ärztin begrüßt Dich."), " ÄRZTIN ");
        assert!(found.greeting);
        assert_eq!(found.indices, [1]);
        assert_eq!(found.count(), 2);
        assert_eq!(find(&messages, None, "Ärztin").count(), 1);
    }
    #[test]
    fn empty_search_restores_all_messages_and_no_match_is_empty() {
        let messages = vec![StoredMessage {
            role: "system".into(),
            content: "Hinweis".into(),
        }];
        assert_eq!(find(&messages, Some(" "), " \n ").indices, [0]);
        assert_eq!(find(&messages, Some("Hallo"), "nicht vorhanden").count(), 0);
    }
}
