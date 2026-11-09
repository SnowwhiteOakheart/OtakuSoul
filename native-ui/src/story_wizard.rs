//! Offline-Entwurf aus Tauris lokalisierten Geschichtenvorlagen.
use crate::{
    stage_preview::{self, Genre, Scene},
    story_music::{self, Music},
    ui_text::{UI_LANGUAGE, format, lookup_existing, text as label},
};
use iced::widget::text_editor;
use serde_json::json;

pub const GENRES: [Genre; 8] = [
    Genre::Fantasy,
    Genre::Adventure,
    Genre::SliceOfLife,
    Genre::Comedy,
    Genre::Romance,
    Genre::Mystery,
    Genre::SciFi,
    Genre::Horror,
];
pub const MAX_COMPANIONS: usize = 4;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    Genre,
    Player,
    Companions,
    Premise,
    Music,
    Review,
}

impl Step {
    pub const ALL: [Self; 6] = [
        Self::Genre,
        Self::Player,
        Self::Companions,
        Self::Premise,
        Self::Music,
        Self::Review,
    ];

    pub fn key(self) -> &'static str {
        match self {
            Self::Genre => "storyWizard.step.genre",
            Self::Player => "storyWizard.step.you",
            Self::Companions => "storyWizard.step.companions",
            Self::Premise => "storyWizard.step.start",
            Self::Music => "storyWizard.step.music",
            Self::Review => "storyWizard.native.review",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Premise {
    First,
    Second,
    Own,
}

#[derive(Debug, Clone)]
pub enum Edit {
    Genre(Genre),
    Player(String),
    PlayerDescription(String),
    Companion(String),
    Premise(Premise),
    Roll,
    Idea(text_editor::Action),
    Location(String),
    Music(story_music::Edit),
    Next,
    Back,
}

pub struct Wizard {
    pub step: Step,
    pub genre: Genre,
    pub player: String,
    pub player_description: String,
    pub party: Vec<String>,
    pub premise: Premise,
    pub idea: text_editor::Content,
    pub location: String,
    pub music: Music,
}

impl Wizard {
    pub fn new(player: &str) -> Self {
        Self {
            step: Step::Genre,
            genre: Genre::Fantasy,
            player: if player.trim() == "User" {
                String::new()
            } else {
                player.trim().into()
            },
            player_description: String::new(),
            party: Vec::new(),
            premise: Premise::First,
            idea: text_editor::Content::new(),
            location: String::new(),
            music: Music::for_genre("fantasy", true),
        }
    }

    pub fn edit(&mut self, edit: Edit) {
        match edit {
            Edit::Genre(genre) if GENRES.contains(&genre) => {
                if self.genre != genre {
                    self.genre = genre;
                    self.premise = Premise::First;
                    self.music = Music::for_genre(genre_id(genre), self.music.enabled);
                }
            }
            Edit::Player(value) => self.player = value,
            Edit::PlayerDescription(value) => self.player_description = value,
            Edit::Companion(name) => {
                if let Some(index) = self.party.iter().position(|member| *member == name) {
                    self.party.remove(index);
                } else if self.party.len() < MAX_COMPANIONS && !name.trim().is_empty() {
                    self.party.push(name);
                }
            }
            Edit::Premise(premise) => self.premise = premise,
            Edit::Roll => {
                self.premise = if rand::random::<bool>() {
                    Premise::First
                } else {
                    Premise::Second
                }
            }
            Edit::Idea(action) => self.idea.perform(action),
            Edit::Location(value) => self.location = value,
            Edit::Music(edit) => self.music.edit(edit, genre_id(self.genre)),
            Edit::Next if self.step != Step::Premise || self.ready() => {
                if let Some(next) = Step::ALL.get(self.step as usize + 1) {
                    self.step = *next;
                }
            }
            Edit::Back if self.step != Step::Genre => self.step = Step::ALL[self.step as usize - 1],
            _ => {}
        }
    }

    pub fn ready(&self) -> bool {
        self.premise != Premise::Own || !self.idea.text().trim().is_empty()
    }

    pub fn scene(&self, id: &str) -> Result<Scene, String> {
        if !self.ready() {
            return Err(label("storyWizard.native.ideaRequired").into());
        }
        let (title, location, hook, opening) = match self.premise {
            Premise::Own => {
                let location = nonempty(&self.location)
                    .unwrap_or_else(|| label("sceneNew.startLocationDefault"));
                (
                    format(
                        "storyWizard.ownTitle",
                        &[("genre", label(self.genre.key()))],
                    ),
                    location,
                    self.idea.text().trim().to_owned(),
                    format("sceneNew.defaultOpening", &[("location", location)]),
                )
            }
            premise => (
                premise_text(self.genre, premise, "title").into(),
                premise_text(self.genre, premise, "location"),
                premise_text(self.genre, premise, "hook").into(),
                premise_text(self.genre, premise, "opening").into(),
            ),
        };
        let player = nonempty(&self.player).unwrap_or_else(|| label("sceneNew.personaDefault"));
        let mut world_context = hook.clone();
        if let Some(description) = nonempty(&self.player_description) {
            world_context.push_str("\n\n");
            world_context.push_str(&format(
                "storyWizard.playerContext",
                &[("name", player), ("description", description)],
            ));
        }
        let style_key = format!("storyWizard.style.{}", genre_id(self.genre));
        let mut definition = json!({
            "id": id,
            "title": title,
            "description": hook,
            "world_context": world_context,
            "starting_location": location,
            "opening_narration": opening,
            "gm_tone": label(self.genre.key()),
            "narrator_style": lookup_existing(UI_LANGUAGE, &style_key).unwrap_or_default(),
            "persona": player,
            "party": self.party,
            "solo_mode": self.party.is_empty(),
            "max_actor_depth": 2,
            "extensions": {
                "otakusoul_story": {
                    "genre": genre_id(self.genre), "minutes": 30, "difficulty": "easy"
                }
            }
        });
        if let Some(music) = self.music.section(id) {
            definition["extensions"]["otakusoul_music"] = music;
        }
        stage_preview::parse(definition)
    }
}

pub fn genre_hint(genre: Genre) -> &'static str {
    lookup_existing(
        UI_LANGUAGE,
        &format!("storyWizard.genreHint.{}", genre_id(genre)),
    )
    .unwrap_or_default()
}

pub fn premise_text(genre: Genre, premise: Premise, field: &str) -> &'static str {
    let index = match premise {
        Premise::First => 0,
        Premise::Second => 1,
        Premise::Own => return "",
    };
    let key = format!("storyWizard.premise.{}.{index}.{field}", genre_id(genre));
    lookup_existing(UI_LANGUAGE, &key).unwrap_or_default()
}

pub fn genre_id(genre: Genre) -> &'static str {
    genre
        .key()
        .strip_prefix("gallery.filter.")
        .expect("Stage-Genreschlüssel")
}

fn nonempty(text: &str) -> Option<&str> {
    let text = text.trim();
    (!text.is_empty()).then_some(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn story_wizard_resolves_all_shared_premises_as_scenes() {
        for genre in GENRES {
            let mut wizard = Wizard::new("User");
            wizard.edit(Edit::Genre(genre));
            assert!(!genre_hint(genre).is_empty());
            for premise in [Premise::First, Premise::Second] {
                wizard.edit(Edit::Premise(premise));
                let scene = wizard.scene("story").unwrap();
                assert_eq!(scene.genre, genre);
                assert!(!scene.location(UI_LANGUAGE).is_empty());
                assert!(!scene.description(UI_LANGUAGE).is_empty());
                assert!(!scene.opening(UI_LANGUAGE).is_empty());
                assert_eq!(scene.definition()["solo_mode"], true);
            }
        }
    }

    #[test]
    fn story_wizard_validates_own_premise_and_keeps_four_companions() {
        let mut wizard = Wizard::new("Kai");
        wizard.edit(Edit::PlayerDescription("Kundschafter".into()));
        for name in ["Ada", "Bela", "Cora", "Dora", "Eri"] {
            wizard.edit(Edit::Companion(name.into()));
        }
        wizard.step = Step::Premise;
        wizard.edit(Edit::Premise(Premise::Own));
        wizard.edit(Edit::Next);
        assert_eq!(wizard.step, Step::Premise);
        assert!(wizard.scene("story").is_err());
        wizard.idea = text_editor::Content::with_text("  Wir finden eine Tür. ");
        wizard.edit(Edit::Location("  Alte Bibliothek  ".into()));
        wizard.edit(Edit::Next);
        assert_eq!(wizard.step, Step::Music);
        let scene = wizard.scene("story").unwrap();
        assert_eq!(scene.party, ["Ada", "Bela", "Cora", "Dora"]);
        assert_eq!(scene.location(UI_LANGUAGE), "Alte Bibliothek");
        assert_eq!(scene.description(UI_LANGUAGE), "Wir finden eine Tür.");
        assert_eq!(scene.definition()["persona"], "Kai");
        assert!(
            scene.definition()["world_context"]
                .as_str()
                .unwrap()
                .contains("Kundschafter")
        );
        assert_eq!(scene.definition()["solo_mode"], false);
    }
}
