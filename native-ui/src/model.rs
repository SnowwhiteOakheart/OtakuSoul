//! Flüchtiger Vorschauzustand. Absichtlich kein Zugriff auf das produktive Profil.

pub struct Character {
    pub name: &'static str,
    pub description: &'static str,
    pub portrait: &'static [u8],
}

pub const CHARACTERS: [Character; 4] = [
    Character {
        name: "Shiori Amane",
        description: "Bücher, leise Gespräche und neue Geschichten.",
        portrait: include_bytes!("../../presets/characters/shiori_amane.png"),
    },
    Character {
        name: "Sota Minase",
        description: "Zeit für eine neue Begegnung.",
        portrait: include_bytes!("../../presets/characters/sota_minase.png"),
    },
    Character {
        name: "Lirwen",
        description: "Ein neuer Weg durch fantastische Welten.",
        portrait: include_bytes!("../../presets/characters/lirwen.png"),
    },
    Character {
        name: "Faelion",
        description: "Dein nächstes Abenteuer wartet.",
        portrait: include_bytes!("../../presets/characters/faelion.png"),
    },
];

#[derive(Default)]
pub struct Conversation {
    pub draft: String,
    pub messages: Vec<String>,
}

pub struct Preview {
    pub selected: usize,
    pub conversations: [Conversation; 4],
}

impl Default for Preview {
    fn default() -> Self {
        Self {
            selected: 0,
            conversations: std::array::from_fn(|_| Conversation::default()),
        }
    }
}

impl Preview {
    pub fn current(&self) -> &Conversation {
        &self.conversations[self.selected]
    }

    pub fn current_mut(&mut self) -> &mut Conversation {
        &mut self.conversations[self.selected]
    }

    pub fn submit(&mut self) {
        let conversation = self.current_mut();
        let value = conversation.draft.trim().to_owned();
        if !value.is_empty() {
            conversation.messages.push(value);
            conversation.draft.clear();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::Preview;

    #[test]
    fn switching_character_keeps_drafts_and_messages_separate() {
        let mut preview = Preview::default();
        preview.current_mut().draft = "Hallo Shiori".into();
        preview.submit();
        preview.current_mut().draft = "Entwurf".into();
        preview.selected = 1;
        assert!(preview.current().messages.is_empty());
        assert!(preview.current().draft.is_empty());
        preview.selected = 0;
        assert_eq!(preview.current().messages, ["Hallo Shiori"]);
        assert_eq!(preview.current().draft, "Entwurf");
    }

    #[test]
    fn empty_submission_does_not_create_a_message() {
        let mut preview = Preview::default();
        preview.current_mut().draft = "  \n ".into();
        preview.submit();
        assert!(preview.current().messages.is_empty());
    }
}
