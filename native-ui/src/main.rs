#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod appearance;
mod icons;
mod message_content;
mod model;
mod profile;
mod views;

use iced::keyboard::{Key, key::Named};
use iced::widget::{image, text_editor};
use iced::{Task, Theme};
use model::Preview;
use profile::{Profile, StoredMessage};
use std::collections::HashSet;
use std::path::PathBuf;

const MESSAGE_LIMIT: usize = 200;

fn ui_font() -> iced::Font {
    #[cfg(target_os = "windows")]
    {
        iced::Font::with_name("Segoe UI")
    }
    #[cfg(not(target_os = "windows"))]
    {
        iced::Font::DEFAULT
    }
}

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
    let brand =
        ::image::load_from_memory(include_bytes!("../../src/assets/brand/otakusoul-icon.png"))?
            .into_rgba8();
    let window_icon =
        iced::window::icon::from_rgba(brand.to_vec(), brand.width(), brand.height()).ok();
    iced::application(
        move || App::new(initial_profile.clone()),
        App::update,
        App::view,
    )
    .title("OtakuSoul · Native Vorschau")
    .theme(App::theme)
    .default_font(ui_font())
    .subscription(App::subscription)
    .window_size((1440.0, 900.0))
    .window(iced::window::Settings {
        icon: window_icon,
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
    Home,
    #[default]
    Chat,
    Characters,
    Details,
    Settings,
    Planned(&'static str),
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
    ToggleNavigation,
    ToggleAvatar,
    ToggleCompact,
    ToggleSessions,
    ToggleSearch,
    SearchChanged(String),
    InspectLink(String),
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
    collapsed: bool,
    show_avatar: bool,
    compact: bool,
    show_sessions: bool,
    show_search: bool,
    search: String,
    rendered: Vec<message_content::Content>,
    greeting: message_content::Content,
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
        let greeting = message_content::Content::new(
            &preview
                .character()
                .first_message
                .replace("{{char}}", &preview.character().name)
                .replace("{{user}}", "Du"),
        );
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
            collapsed: false,
            show_avatar: true,
            compact: false,
            show_sessions: false,
            show_search: false,
            search: String::new(),
            rendered: Vec::new(),
            greeting,
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
        appearance::theme(self.dark)
    }
    fn sync_editor(&mut self) {
        self.editor = text_editor::Content::with_text(&self.preview.current().draft);
        self.rendered = self
            .preview
            .current()
            .messages
            .iter()
            .map(|m| message_content::Content::new(&m.content))
            .collect();
        let character = self.preview.character();
        self.greeting = message_content::Content::new(
            &character
                .first_message
                .replace("{{char}}", &character.name)
                .replace("{{user}}", "Du"),
        );
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
                    self.show_sessions = false;
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
                self.show_sessions = false;
                self.preview.select_local();
                self.sync_editor();
            }
            Message::ToggleTheme => self.dark = !self.dark,
            Message::ToggleNavigation => self.collapsed = !self.collapsed,
            Message::ToggleAvatar => self.show_avatar = !self.show_avatar,
            Message::ToggleCompact => self.compact = !self.compact,
            Message::ToggleSessions => self.show_sessions = !self.show_sessions,
            Message::ToggleSearch => {
                self.show_search = !self.show_search;
                if !self.show_search {
                    self.search.clear();
                }
            }
            Message::SearchChanged(value) => self.search = value,
            Message::InspectLink(link) => self.notice = format!("Link aus der Nachricht: {link}"),
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
                        if index == self.preview.selected {
                            self.sync_editor();
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
