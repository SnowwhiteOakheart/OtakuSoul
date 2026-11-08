//! Flüchtige Ansichten für Vorschauchats und unveränderliche importierte Verläufe.

use crate::profile::{Profile, StoredMessage};

pub struct Character {
    pub id: String,
    pub name: String,
    pub description: String,
    pub first_message: String,
    pub card: Option<serde_json::Value>,
    pub portrait: Option<Vec<u8>>,
}

pub struct Conversation {
    pub greeting: Option<(String, String)>,
    pub source_id: Option<String>,
    pub character_id: String,
    pub title: String,
    pub draft: String,
    pub messages: Vec<StoredMessage>,
    pub message_count: usize,
    pub loaded: bool,
}

impl Conversation {
    fn local(character_id: &str) -> Self {
        Self {
            greeting: None,
            source_id: None,
            character_id: character_id.into(),
            title: "Testchat".into(),
            draft: String::new(),
            messages: Vec::new(),
            message_count: 0,
            loaded: true,
        }
    }
    pub fn is_read_only(&self) -> bool {
        self.source_id.is_some()
    }
}

pub struct Preview {
    pub selected: usize,
    pub characters: Vec<Character>,
    pub conversations: Vec<Conversation>,
}

impl Default for Preview {
    fn default() -> Self {
        let sources: [(&str, &str, &[u8]); 4] = [
            (
                "shiori_amane",
                include_str!("../../presets/characters/shiori_amane.json"),
                include_bytes!("../../presets/characters/shiori_amane.png"),
            ),
            (
                "sota_minase",
                include_str!("../../presets/characters/sota_minase.json"),
                include_bytes!("../../presets/characters/sota_minase.png"),
            ),
            (
                "lirwen",
                include_str!("../../presets/characters/lirwen.json"),
                include_bytes!("../../presets/characters/lirwen.png"),
            ),
            (
                "faelion",
                include_str!("../../presets/characters/faelion.json"),
                include_bytes!("../../presets/characters/faelion.png"),
            ),
        ];
        let characters: Vec<_> = sources
            .into_iter()
            .map(|(id, json, portrait)| {
                let card: serde_json::Value =
                    serde_json::from_str(json).expect("Gebündelte Charakterkarte muss gültig sein");
                let data = &card["data"];
                Character {
                    id: id.into(),
                    name: data["name"].as_str().unwrap_or(id).into(),
                    description: data["description"].as_str().unwrap_or_default().into(),
                    first_message: data["first_mes"].as_str().unwrap_or_default().into(),
                    portrait: Some(portrait.to_vec()),
                    card: Some(card),
                }
            })
            .collect();
        let conversations = characters
            .iter()
            .map(|c| Conversation::local(&c.id))
            .collect();
        Self {
            selected: 0,
            characters,
            conversations,
        }
    }
}

impl Preview {
    pub fn add_character(&mut self, character: Character) {
        self.conversations.push(Conversation::local(&character.id));
        self.characters.push(character);
    }

    pub fn from_profile(profile: Profile) -> Self {
        let mut characters: Vec<_> = profile
            .characters
            .into_iter()
            .map(|c| Character {
                id: c.id,
                name: c.name,
                description: c.description,
                first_message: c.first_message,
                card: Some(c.card),
                portrait: c.portrait,
            })
            .collect();
        let mut conversations = Vec::new();
        for session in profile.sessions {
            if !characters.iter().any(|c| c.id == session.character_id) {
                characters.push(Character {
                    id: session.character_id.clone(),
                    name: session.character_id.clone(),
                    description: "Zu diesem Verlauf fehlt die Charakterkarte in der Profilkopie."
                        .into(),
                    first_message: String::new(),
                    card: None,
                    portrait: None,
                });
            }
            conversations.push(Conversation {
                greeting: None,
                source_id: Some(session.id),
                character_id: session.character_id,
                title: session.title,
                draft: String::new(),
                messages: Vec::new(),
                message_count: session.message_count,
                loaded: false,
            });
        }
        for character in &characters {
            conversations.push(Conversation::local(&character.id));
        }
        Self {
            selected: 0,
            characters,
            conversations,
        }
    }
    pub fn current(&self) -> &Conversation {
        &self.conversations[self.selected]
    }
    pub fn current_mut(&mut self) -> &mut Conversation {
        &mut self.conversations[self.selected]
    }
    pub fn character(&self) -> &Character {
        self.characters
            .iter()
            .find(|c| c.id == self.current().character_id)
            .expect("Jeder Verlauf besitzt eine Figur")
    }
    pub fn select_character(&mut self, index: usize) {
        if let Some(character) = self.characters.get(index)
            && let Some(index) = self
                .conversations
                .iter()
                .position(|c| c.character_id == character.id)
        {
            self.selected = index;
        }
    }
    pub fn select_local(&mut self) {
        let id = self.current().character_id.clone();
        if let Some(index) = self
            .conversations
            .iter()
            .position(|c| c.character_id == id && !c.is_read_only())
        {
            self.selected = index;
        }
    }
    pub fn submit(&mut self) {
        let conversation = self.current_mut();
        if conversation.is_read_only() {
            return;
        }
        let value = conversation.draft.trim().to_owned();
        if !value.is_empty() {
            conversation.messages.push(StoredMessage {
                role: "user".into(),
                content: value,
            });
            conversation.message_count = conversation.messages.len();
            conversation.draft.clear();
        }
    }
    pub fn clear(&mut self) {
        if !self.current().is_read_only() {
            let id = self.current().character_id.clone();
            *self.current_mut() = Conversation::local(&id);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::Preview;
    use crate::profile::{Profile, Session};
    #[test]
    fn switching_character_keeps_drafts_and_messages_separate() {
        let mut preview = Preview::default();
        preview.current_mut().draft = "Hallo Shiori".into();
        preview.submit();
        preview.current_mut().draft = "Entwurf".into();
        preview.select_character(1);
        assert!(preview.current().messages.is_empty());
        assert!(preview.current().draft.is_empty());
        preview.select_character(0);
        assert_eq!(preview.current().messages[0].content, "Hallo Shiori");
        assert_eq!(preview.current().draft, "Entwurf");
    }
    #[test]
    fn empty_submission_does_not_create_a_message() {
        let mut preview = Preview::default();
        preview.current_mut().draft = "  \n ".into();
        preview.submit();
        assert!(preview.current().messages.is_empty());
    }
    #[test]
    fn imported_session_is_read_only_even_without_a_character_card() {
        let mut preview = Preview::from_profile(Profile {
            characters: vec![],
            warnings: vec![],
            sessions: vec![Session {
                id: "chat-1".into(),
                character_id: "missing-card".into(),
                title: "Archiv".into(),
                message_count: 4,
            }],
        });
        assert_eq!(preview.character().name, "missing-card");
        preview.current_mut().draft = "darf nicht hinzugefügt werden".into();
        preview.submit();
        preview.clear();
        assert_eq!(preview.current().message_count, 4);
        assert!(preview.current().is_read_only());
        preview.select_local();
        preview.current_mut().draft = "Lokaler Test".into();
        preview.submit();
        assert_eq!(preview.current().messages.len(), 1);
        preview.selected = 0;
        assert_eq!(preview.current().message_count, 4);
    }
}
