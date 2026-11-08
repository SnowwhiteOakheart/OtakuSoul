#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod model;
mod profile;

use iced::keyboard::{Key, key::Named};
use iced::widget::{
    button, column, container, image, row, scrollable, text, text_editor, text_input,
};
use iced::{Alignment, Element, Fill, Task, Theme};
use model::Preview;
use profile::{Profile, StoredMessage};
use std::collections::HashSet;
use std::path::PathBuf;

const MESSAGE_LIMIT: usize = 200;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    let mut initial_profile = None;
    if !args.is_empty() {
        if args.len() != 2 {
            return Err("Aufruf: otakusoul-native [--profile|--create-demo-profile|--check-profile <Ordner>]".into());
        }
        let home = PathBuf::from(&args[1]);
        match args[0].to_str() {
            Some("--create-demo-profile") => {
                profile::create_demo_profile(&home)?;
                println!("Beispielprofil erstellt.");
                return Ok(());
            }
            Some("--check-profile") => {
                let profile = profile::load_profile(&home)?;
                let mut loaded = 0;
                for session in &profile.sessions {
                    loaded += profile::load_messages(&home, &session.id, MESSAGE_LIMIT)?.len();
                }
                println!(
                    "{} Figuren, {} Verläufe, {} geladene Nachrichten, {} Hinweise.",
                    profile.characters.len(),
                    profile.sessions.len(),
                    loaded,
                    profile.warnings.len()
                );
                return Ok(());
            }
            Some("--profile") => initial_profile = Some(home),
            _ => return Err("Unbekanntes Argument.".into()),
        }
    }
    iced::application(
        move || App::new(initial_profile.clone()),
        App::update,
        App::view,
    )
    .title("OtakuSoul · Native Vorschau")
    .theme(App::theme)
    .subscription(App::subscription)
    .window_size((1180.0, 780.0))
    .window(iced::window::Settings {
        min_size: Some(iced::Size::new(900.0, 680.0)),
        ..Default::default()
    })
    .run()?;
    Ok(())
}

/// Auch Dateizugriffe und SQLite laufen außerhalb des UI-Threads.
async fn background<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    let (sender, receiver) = iced::futures::channel::oneshot::channel();
    std::thread::spawn(move || {
        let _ = sender.send(work());
    });
    receiver
        .await
        .map_err(|_| "Der Ladevorgang wurde unerwartet beendet.".to_string())?
}

#[derive(Debug, Clone, Copy, Default, PartialEq)]
enum Page {
    #[default]
    Chat,
    Characters,
    Details,
    Settings,
}

#[derive(Debug, Clone)]
enum Message {
    Navigate(Page),
    SelectCharacter(usize),
    SelectConversation(usize),
    Edit(text_editor::Action),
    Submit,
    Clear,
    LocalChat,
    ToggleTheme,
    Copy(String),
    CopyCard,
    Focus(bool),
    ProfilePathChanged(String),
    LoadProfile,
    CreateDemo,
    ProfileLoaded(PathBuf, Result<Profile, String>),
    MessagesLoaded {
        epoch: u64,
        index: usize,
        result: Result<Vec<StoredMessage>, String>,
    },
}

struct App {
    preview: Preview,
    page: Page,
    dark: bool,
    portraits: Vec<Option<image::Handle>>,
    editor: text_editor::Content,
    profile_input: String,
    profile_home: Option<PathBuf>,
    profile_busy: bool,
    epoch: u64,
    pending: HashSet<usize>,
    notice: String,
    warnings: Vec<String>,
}

impl Default for App {
    fn default() -> Self {
        let preview = Preview::default();
        let portraits = Self::portraits(&preview);
        let demo_home = std::env::var_os("OTAKUSOUL_HOME")
            .filter(|value| !value.is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                directories::ProjectDirs::from("com", "snowwhite", "otakusoul-native")
                    .map(|dirs| dirs.data_dir().join("preview-profile"))
                    .unwrap_or_else(|| PathBuf::from("native-ui-demo"))
            });
        Self {
            preview,
            page: Page::Chat,
            dark: true,
            portraits,
            editor: text_editor::Content::new(),
            profile_input: demo_home.to_string_lossy().into_owned(),
            profile_home: None,
            profile_busy: false,
            epoch: 0,
            pending: HashSet::new(),
            notice: "Vorschau ohne KI · Testnachrichten bleiben im Arbeitsspeicher.".into(),
            warnings: Vec::new(),
        }
    }
}

impl App {
    fn subscription(&self) -> iced::Subscription<Message> {
        iced::event::listen_with(|event, status, _| {
            if status == iced::event::Status::Ignored
                && let iced::Event::Keyboard(iced::keyboard::Event::KeyPressed {
                    key: Key::Named(Named::Tab),
                    modifiers,
                    ..
                }) = event
            {
                Some(Message::Focus(modifiers.shift()))
            } else {
                None
            }
        })
    }
    fn new(profile: Option<PathBuf>) -> (Self, Task<Message>) {
        let mut app = Self::default();
        let task = if let Some(home) = profile {
            app.profile_input = home.to_string_lossy().into_owned();
            app.load(false)
        } else {
            Task::none()
        };
        (app, task)
    }
    fn portraits(preview: &Preview) -> Vec<Option<image::Handle>> {
        preview
            .characters
            .iter()
            .map(|c| c.portrait.clone().map(image::Handle::from_bytes))
            .collect()
    }
    fn theme(&self) -> Theme {
        if self.dark {
            Theme::TokyoNight
        } else {
            Theme::Light
        }
    }
    fn sync_editor(&mut self) {
        self.editor = text_editor::Content::with_text(&self.preview.current().draft);
    }
    fn load(&mut self, create: bool) -> Task<Message> {
        if self.profile_busy {
            return Task::none();
        }
        if self.profile_input.trim().is_empty() {
            self.notice = "Bitte einen Ordner mit einer Profilkopie auswählen.".into();
            return Task::none();
        }
        let home = PathBuf::from(self.profile_input.trim());
        let returned_home = home.clone();
        self.profile_busy = true;
        self.notice = "Profilkopie wird geladen …".into();
        Task::perform(
            background(move || {
                if create {
                    profile::create_demo_profile(&home)?;
                }
                profile::load_profile(&home)
            }),
            move |result| Message::ProfileLoaded(returned_home.clone(), result),
        )
    }
    fn load_current(&mut self) -> Task<Message> {
        let index = self.preview.selected;
        let current = self.preview.current();
        if current.loaded || self.pending.contains(&index) {
            return Task::none();
        }
        let Some(id) = current.source_id.clone() else {
            return Task::none();
        };
        let Some(home) = self.profile_home.clone() else {
            return Task::none();
        };
        let epoch = self.epoch;
        self.pending.insert(index);
        Task::perform(
            background(move || profile::load_messages(&home, &id, MESSAGE_LIMIT)),
            move |result| Message::MessagesLoaded {
                epoch,
                index,
                result,
            },
        )
    }
    fn update(&mut self, message: Message) -> Task<Message> {
        match message {
            Message::Navigate(page) => self.page = page,
            Message::SelectCharacter(index) => {
                self.preview.select_character(index);
                self.page = Page::Chat;
                self.sync_editor();
                return self.load_current();
            }
            Message::SelectConversation(index) => {
                if index < self.preview.conversations.len() {
                    self.preview.selected = index;
                    self.sync_editor();
                    return self.load_current();
                }
            }
            Message::Edit(action) => {
                if !self.preview.current().is_read_only() {
                    self.editor.perform(action);
                    self.preview.current_mut().draft = self.editor.text();
                }
            }
            Message::Submit => {
                self.preview.submit();
                self.sync_editor();
                return iced::widget::operation::snap_to_end("conversation");
            }
            Message::Clear => {
                self.preview.clear();
                self.sync_editor();
            }
            Message::LocalChat => {
                self.preview.select_local();
                self.sync_editor();
            }
            Message::ToggleTheme => self.dark = !self.dark,
            Message::Copy(value) => return iced::clipboard::write(value),
            Message::Focus(backwards) => {
                return if backwards {
                    iced::widget::operation::focus_previous()
                } else {
                    iced::widget::operation::focus_next()
                };
            }
            Message::CopyCard => {
                if let Some(card) = &self.preview.character().card {
                    return iced::clipboard::write(
                        serde_json::to_string_pretty(card).unwrap_or_default(),
                    );
                }
            }
            Message::ProfilePathChanged(value) => {
                if !self.profile_busy {
                    self.profile_input = value;
                }
            }
            Message::LoadProfile => return self.load(false),
            Message::CreateDemo => return self.load(true),
            Message::ProfileLoaded(home, result) => {
                self.profile_busy = false;
                match result {
                    Ok(profile) => {
                        self.notice = format!(
                            "Profilkopie geladen: {} Figuren, {} Verläufe. Nur lesender Zugriff.",
                            profile.characters.len(),
                            profile.sessions.len()
                        );
                        self.warnings = profile.warnings.clone();
                        self.preview = Preview::from_profile(profile);
                        self.portraits = Self::portraits(&self.preview);
                        self.profile_home = Some(home);
                        self.epoch += 1;
                        self.pending.clear();
                        self.sync_editor();
                        self.page = Page::Chat;
                        return self.load_current();
                    }
                    Err(error) => {
                        self.notice = format!("Profil konnte nicht geladen werden: {error}")
                    }
                }
            }
            Message::MessagesLoaded {
                epoch,
                index,
                result,
            } => {
                if epoch != self.epoch {
                    return Task::none();
                }
                self.pending.remove(&index);
                match result {
                    Ok(messages) => {
                        if let Some(conversation) = self.preview.conversations.get_mut(index) {
                            conversation.messages = messages;
                            conversation.loaded = true;
                        }
                    }
                    Err(error) => {
                        if index == self.preview.selected {
                            self.notice = format!("Verlauf konnte nicht geladen werden: {error}");
                        }
                    }
                }
            }
        }
        Task::none()
    }
    fn portrait(&self, index: usize, width: u32, height: u32) -> Element<'_, Message> {
        if let Some(handle) = &self.portraits[index] {
            image(handle.clone())
                .width(width)
                .height(height)
                .content_fit(iced::ContentFit::Cover)
                .into()
        } else {
            container(text("?").size(24))
                .center_x(width)
                .center_y(height)
                .style(container::rounded_box)
                .into()
        }
    }
    fn view(&self) -> Element<'_, Message> {
        let mut navigation = column![
            text("OtakuSoul").size(28),
            text("Deine Geschichten. Dein Raum.").size(13),
            text("")
        ]
        .spacing(10);
        for (page, label) in [
            (Page::Chat, "Gespräche"),
            (Page::Characters, "Charaktere"),
            (Page::Settings, "Einstellungen"),
        ] {
            navigation = navigation.push(
                button(text(label).size(16))
                    .width(Fill)
                    .padding(12)
                    .style(if self.page == page {
                        button::primary
                    } else {
                        button::text
                    })
                    .on_press(Message::Navigate(page)),
            );
        }
        navigation = navigation.push(text("DEINE FIGUREN").size(12));
        for (index, character) in self.preview.characters.iter().enumerate() {
            navigation = navigation.push(
                button(
                    row![self.portrait(index, 38, 46), text(&character.name).size(14)]
                        .spacing(10)
                        .align_y(Alignment::Center),
                )
                .width(Fill)
                .padding(8)
                .style(if character.id == self.preview.current().character_id {
                    button::secondary
                } else {
                    button::text
                })
                .on_press(Message::SelectCharacter(index)),
            );
        }
        let sidebar = container(
            column![
                scrollable(navigation).height(Fill),
                text("NATIVE VORSCHAU · 0.2").size(12),
                text("Ohne KI · Profilkopien nur lesen").size(12)
            ]
            .spacing(12),
        )
        .padding(18)
        .width(245)
        .height(Fill)
        .style(container::rounded_box);
        let content = match self.page {
            Page::Chat => self.chat(),
            Page::Characters => self.characters(),
            Page::Details => self.details(),
            Page::Settings => self.settings(),
        };
        container(
            row![
                sidebar,
                container(column![content, text(&self.notice).size(12)].spacing(12))
                    .padding(20)
                    .width(Fill)
                    .height(Fill)
            ]
            .spacing(4),
        )
        .padding(12)
        .width(Fill)
        .height(Fill)
        .into()
    }
    fn chat(&self) -> Element<'_, Message> {
        let character = self.preview.character();
        let conversation = self.preview.current();
        let index = self
            .preview
            .characters
            .iter()
            .position(|c| c.id == character.id)
            .unwrap_or(0);
        let heading = row![
            self.portrait(index, 48, 58),
            text(&character.name).size(27).width(Fill),
            button("Charakterkarte")
                .style(button::text)
                .on_press(Message::Navigate(Page::Details))
        ]
        .spacing(12)
        .align_y(Alignment::Center);
        let mut sessions = row![].spacing(8);
        for (index, candidate) in self
            .preview
            .conversations
            .iter()
            .enumerate()
            .filter(|(_, c)| c.character_id == character.id)
        {
            sessions = sessions.push(
                button(text(&candidate.title).size(13))
                    .style(if self.preview.selected == index {
                        button::primary
                    } else {
                        button::secondary
                    })
                    .on_press(Message::SelectConversation(index)),
            );
        }
        let mut messages = column![].spacing(14).width(Fill);
        if !conversation.loaded {
            messages = messages.push(
                row![
                    text(if self.pending.contains(&self.preview.selected) {
                        "Verlauf wird geladen …"
                    } else {
                        "Verlauf noch nicht geladen."
                    }),
                    button("Erneut laden")
                        .on_press(Message::SelectConversation(self.preview.selected))
                ]
                .spacing(12),
            );
        } else if conversation.messages.is_empty() {
            messages = messages.push(container(column![text("Ein Raum für Deine Geschichten").size(20),
                text(if conversation.is_read_only() { "Dieser importierte Verlauf enthält keine Nachrichten." } else { "Hier kannst Du die Eingabe testen. Die KI-Anbindung folgt in der nächsten Etappe." }).size(15)].spacing(10))
                .padding(18).width(Fill).style(container::rounded_box));
        }
        if conversation.message_count > conversation.messages.len() && conversation.loaded {
            messages = messages.push(
                text(format!(
                    "Die letzten {} von {} Nachrichten werden angezeigt.",
                    conversation.messages.len(),
                    conversation.message_count
                ))
                .size(13),
            );
        }
        for message in &conversation.messages {
            let label = match message.role.as_str() {
                "user" => "Du",
                "assistant" => character.name.as_str(),
                "system" => "System",
                other => other,
            };
            messages = messages.push(
                container(
                    column![
                        row![
                            text(label).size(13).width(Fill),
                            button("Kopieren")
                                .style(button::text)
                                .on_press(Message::Copy(message.content.clone()))
                        ]
                        .align_y(Alignment::Center),
                        text(&message.content).size(16),
                    ]
                    .spacing(8),
                )
                .padding(14)
                .width(Fill)
                .style(container::rounded_box),
            );
        }
        let footer: Element<'_, Message> = if conversation.is_read_only() {
            row![
                text("Importierter Verlauf · schreibgeschützt")
                    .size(13)
                    .width(Fill),
                button("Zum Testchat").on_press(Message::LocalChat)
            ]
            .align_y(Alignment::Center)
            .into()
        } else {
            let editor = text_editor(&self.editor)
                .id("composer")
                .placeholder("Schreibe eine Testnachricht …")
                .on_action(Message::Edit)
                .height(100)
                .padding(12)
                .size(16)
                .key_binding(|press| {
                    if press.key == Key::Named(Named::Enter) && press.modifiers.control() {
                        Some(text_editor::Binding::Custom(Message::Submit))
                    } else if press.key == Key::Named(Named::Tab) {
                        Some(text_editor::Binding::Custom(Message::Focus(
                            press.modifiers.shift(),
                        )))
                    } else {
                        text_editor::Binding::from_key_press(press)
                    }
                });
            column![
                editor,
                row![
                    text("Enter: neue Zeile · Strg+Enter: hinzufügen")
                        .size(12)
                        .width(Fill),
                    button("Leeren")
                        .style(button::text)
                        .on_press(Message::Clear),
                    button("Hinzufügen").on_press_maybe(
                        (!conversation.draft.trim().is_empty()).then_some(Message::Submit)
                    ),
                ]
                .spacing(8)
                .align_y(Alignment::Center)
            ]
            .spacing(8)
            .into()
        };
        column![
            heading,
            scrollable(sessions).direction(scrollable::Direction::Horizontal(
                scrollable::Scrollbar::new()
            )),
            scrollable(messages).id("conversation").height(Fill),
            footer
        ]
        .spacing(16)
        .height(Fill)
        .into()
    }
    fn characters(&self) -> Element<'_, Message> {
        let mut cards = column![
            text("Deine Charaktere").size(30),
            text("Charakterkarten und Profilkopien erkunden.")
        ]
        .spacing(16);
        for (index, character) in self.preview.characters.iter().enumerate() {
            cards = cards.push(
                container(
                    row![
                        self.portrait(index, 70, 88),
                        text(&character.name).size(22).width(Fill),
                        button("Gespräch öffnen").on_press(Message::SelectCharacter(index))
                    ]
                    .spacing(16)
                    .align_y(Alignment::Center),
                )
                .padding(16)
                .width(Fill)
                .style(container::rounded_box),
            );
        }
        scrollable(cards).height(Fill).into()
    }
    fn details(&self) -> Element<'_, Message> {
        let character = self.preview.character();
        let mut details = column![
            row![
                text(&character.name).size(28).width(Fill),
                button("Zurück zum Chat").on_press(Message::Navigate(Page::Chat))
            ],
            text("Beschreibung").size(20),
            text(&character.description).width(Fill),
            text("Begrüßung aus der Karte").size(20),
            text(&character.first_message).width(Fill)
        ]
        .spacing(16);
        if character.card.is_some() {
            details = details
                .push(button("Vollständige Karte als JSON kopieren").on_press(Message::CopyCard));
        }
        scrollable(details.width(Fill).padding([0, 10]))
            .width(Fill)
            .height(Fill)
            .into()
    }
    fn settings(&self) -> Element<'_, Message> {
        let mut settings = column![text("Einstellungen").size(30),
            button(if self.dark {"Helles Design verwenden"} else {"Dunkles Design verwenden"}).padding(12).on_press(Message::ToggleTheme),
            text("Profilkopie laden").size(22),
            text("Wähle einen separaten Profilordner mit data/characters und optional data/otakusoul.db. Die Kopie muss vollständig und die Datenbank geschlossen sein. Es werden keine Einstellungen oder Zugangsdaten geladen."),
            text_input("Pfad zur Profilkopie",&self.profile_input).on_input_maybe((!self.profile_busy).then_some(Message::ProfilePathChanged)).padding(12),
            row![button("Profilkopie laden").on_press_maybe((!self.profile_busy).then_some(Message::LoadProfile)),
                button("Beispielprofil erstellen").on_press_maybe((!self.profile_busy).then_some(Message::CreateDemo))].spacing(12),
            text("Das Beispielprofil enthält nur mitgelieferte Figuren und erfundene Testnachrichten. Es wird ausschließlich in einem neuen oder leeren Ordner angelegt."),
        ].spacing(18);
        for warning in &self.warnings {
            settings = settings.push(text(warning).size(13));
        }
        scrollable(settings).height(Fill).into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn late_message_results_cannot_replace_a_new_profile() {
        let mut app = App {
            epoch: 2,
            ..App::default()
        };
        let _ = app.update(Message::MessagesLoaded {
            epoch: 1,
            index: 0,
            result: Ok(vec![StoredMessage {
                role: "assistant".into(),
                content: "Alter Verlauf".into(),
            }]),
        });
        assert!(app.preview.current().messages.is_empty());
    }

    #[test]
    fn background_chat_error_does_not_replace_current_status() {
        let mut app = App::default();
        app.preview.select_character(1);
        let notice = app.notice.clone();
        let _ = app.update(Message::MessagesLoaded {
            epoch: 0,
            index: 0,
            result: Err("Altes Gespräch".into()),
        });
        assert_eq!(app.notice, notice);
    }

    #[test]
    fn profile_path_is_locked_until_import_finishes() {
        let mut app = App {
            profile_busy: true,
            ..App::default()
        };
        let path = app.profile_input.clone();
        let _ = app.update(Message::ProfilePathChanged("anderer Ordner".into()));
        assert_eq!(app.profile_input, path);
    }
}
