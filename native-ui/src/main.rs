#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod appearance;
mod character_draft;
mod connection;
mod icons;
mod message_content;
mod model;
mod profile;
mod prompt_preview;
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
    CharacterEditor,
    Details,
    Settings,
    Prompt,
    Planned(&'static str),
}

#[derive(Debug, Clone)]
enum Message {
    Navigate(Page),
    SelectCharacter(usize),
    LibrarySearch(String),
    EditCharacter(usize),
    NewCharacter,
    DuplicateCharacter(usize),
    InspectCharacter(usize),
    CopyCharacterDraft,
    CharacterName(String),
    CharacterField(character_draft::Field),
    CharacterText(text_editor::Action),
    SaveCharacter,
    DiscardCharacter,
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
    PersonaChanged(String),
    AuthorNoteChanged(String),
    TemplateChanged(prompt_preview::Template),
    ReplyLengthChanged(prompt_preview::ReplyLength),
    RefreshPrompt,
    CopyPrompt(bool),
    PromptAction(bool, text_editor::Action),
    EndpointChanged(String),
    ModelChanged(String),
    KeyChanged(connection::Secret),
    FormatChanged(connection::Format),
    TestConnection,
    CancelConnection,
    ConnectionFinished {
        id: u64,
        result: Result<connection::Report, String>,
    },
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
    connection: connection::Settings,
    diagnostic: Option<connection::ActiveTest>,
    diagnostic_id: u64,
    connection_status: String,
    prompt_settings: prompt_preview::Settings,
    prompt: Result<otakusoul_prompt::AssembledPrompt, String>,
    prompt_system: text_editor::Content,
    prompt_post: text_editor::Content,
    library_search: String,
    character_draft: Option<character_draft::Draft>,
    character_source: Option<usize>,
    character_field: character_draft::Field,
    character_text: text_editor::Content,
    character_error: String,
    next_character_id: u64,
}

impl Default for App {
    fn default() -> Self {
        let mut preview = Preview::default();
        let portraits = Self::portraits(&preview);
        let demo_home = std::env::var_os("OTAKUSOUL_HOME")
            .filter(|value| !value.is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                directories::ProjectDirs::from("com", "snowwhite", "otakusoul-native")
                    .map(|dirs| dirs.data_dir().join("preview-profile"))
                    .unwrap_or_else(|| PathBuf::from("native-ui-demo"))
            });
        let prompt_settings = prompt_preview::Settings::default();
        let seed = format!("native-test:{}", preview.current().character_id);
        let greeting_text = prompt_preview::greeting(preview.character(), &prompt_settings, &seed);
        preview.current_mut().greeting = Some((
            prompt_settings.persona_name.trim().into(),
            greeting_text.clone(),
        ));
        let greeting = message_content::Content::new(&greeting_text);
        let prompt = prompt_preview::build(preview.character(), &prompt_settings, &seed);
        let prompt_system = text_editor::Content::with_text(
            prompt
                .as_ref()
                .map(|prompt| prompt.system.as_str())
                .unwrap_or_default(),
        );
        let prompt_post = text_editor::Content::with_text(
            prompt
                .as_ref()
                .ok()
                .and_then(|prompt| prompt.post_history.as_deref())
                .unwrap_or_default(),
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
            connection: connection::Settings::default(),
            diagnostic: None,
            diagnostic_id: 0,
            connection_status: "Noch kein Verbindungstest ausgeführt.".into(),
            prompt_settings,
            prompt,
            prompt_system,
            prompt_post,
            library_search: String::new(),
            character_draft: None,
            character_source: None,
            character_field: character_draft::Field::Description,
            character_text: text_editor::Content::new(),
            character_error: String::new(),
            next_character_id: 0,
        }
    }
}

impl App {
    fn open_character(&mut self, source: Option<usize>, duplicate: bool) {
        if self.profile_busy {
            self.notice = "Bitte zuerst das Laden der Profilkopie abwarten.".into();
            return;
        }
        if self.character_draft.is_none() {
            let mut draft = match source {
                Some(index) => {
                    let Some(character) = self.preview.characters.get(index) else {
                        return;
                    };
                    character_draft::Draft::from_character(index, character)
                }
                None => character_draft::Draft::new(),
            };
            if duplicate {
                draft.target = None;
                let base = format!("{} – Kopie", draft.get(character_draft::Field::Name));
                let mut name = base.clone();
                let mut number = 2;
                while self
                    .preview
                    .characters
                    .iter()
                    .any(|character| character.name == name)
                {
                    name = format!("{base} {number}");
                    number += 1;
                }
                draft.set(character_draft::Field::Name, name);
            }
            self.character_field = character_draft::Field::Description;
            self.character_text = text_editor::Content::with_text(draft.get(self.character_field));
            self.character_draft = Some(draft);
            self.character_source = source;
            self.character_error.clear();
        }
        self.page = Page::CharacterEditor;
    }

    fn save_character(&mut self) {
        let Some(draft) = &self.character_draft else {
            return;
        };
        let target = draft.target;
        let id = if let Some(index) = target {
            let Some(character) = self.preview.characters.get(index) else {
                return;
            };
            character.id.clone()
        } else {
            loop {
                self.next_character_id += 1;
                let id = format!("native-character-{}", self.next_character_id);
                if !self
                    .preview
                    .characters
                    .iter()
                    .any(|character| character.id == id)
                {
                    break id;
                }
            }
        };
        match draft.apply(
            self.character_source
                .and_then(|index| self.preview.characters.get(index)),
            id,
        ) {
            Ok(character) => {
                let id = character.id.clone();
                if let Some(index) = target {
                    self.preview.characters[index] = character;
                    for conversation in &mut self.preview.conversations {
                        if conversation.character_id == id {
                            conversation.greeting = None;
                        }
                    }
                } else {
                    self.preview.add_character(character);
                }
                self.portraits = Self::portraits(&self.preview);
                self.sync_editor();
                self.character_draft = None;
                self.character_source = None;
                self.character_error.clear();
                self.library_search.clear();
                self.page = Page::Characters;
                self.notice =
                    "Charakter im Arbeitsspeicher übernommen. Die Profilkopie bleibt unverändert."
                        .into();
            }
            Err(error) => self.character_error = error,
        }
    }

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
        self.refresh_prompt();
    }

    fn refresh_prompt(&mut self) {
        let seed = self
            .preview
            .current()
            .source_id
            .clone()
            .unwrap_or_else(|| format!("native-test:{}", self.preview.current().character_id));
        let persona = self.prompt_settings.persona_name.trim().to_owned();
        let greeting_text = if let Some((_, text)) = self
            .preview
            .current()
            .greeting
            .as_ref()
            .filter(|(name, _)| *name == persona)
        {
            text.clone()
        } else {
            let text =
                prompt_preview::greeting(self.preview.character(), &self.prompt_settings, &seed);
            self.preview.current_mut().greeting = Some((persona, text.clone()));
            text
        };
        self.greeting = message_content::Content::new(&greeting_text);
        self.prompt = prompt_preview::build(self.preview.character(), &self.prompt_settings, &seed);
        self.prompt_system = text_editor::Content::with_text(
            self.prompt
                .as_ref()
                .map(|prompt| prompt.system.as_str())
                .unwrap_or_default(),
        );
        self.prompt_post = text_editor::Content::with_text(
            self.prompt
                .as_ref()
                .ok()
                .and_then(|prompt| prompt.post_history.as_deref())
                .unwrap_or_default(),
        );
    }
    fn load(&mut self, create: bool) -> Task<Message> {
        if self.character_draft.is_some() {
            self.character_error = "Bitte den Charakterentwurf zuerst übernehmen oder verwerfen, bevor Du ein anderes Profil lädst.".into();
            self.page = Page::CharacterEditor;
            return Task::none();
        }
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
            Message::LibrarySearch(value) => self.library_search = value,
            Message::NewCharacter => self.open_character(None, false),
            Message::EditCharacter(index) => self.open_character(Some(index), false),
            Message::DuplicateCharacter(index) => self.open_character(Some(index), true),
            Message::InspectCharacter(index) => {
                self.preview.select_character(index);
                self.sync_editor();
                self.page = Page::Details;
                return self.load_current();
            }
            Message::CopyCharacterDraft => {
                if let Some(draft) = &self.character_draft {
                    match draft.apply(
                        self.character_source
                            .and_then(|index| self.preview.characters.get(index)),
                        "draft".into(),
                    ) {
                        Ok(character) => {
                            return iced::clipboard::write(
                                serde_json::to_string_pretty(&character.card).unwrap_or_default(),
                            );
                        }
                        Err(error) => self.character_error = error,
                    }
                }
            }
            Message::CharacterName(value) => {
                if let Some(draft) = &mut self.character_draft {
                    draft.set(character_draft::Field::Name, value);
                }
            }
            Message::CharacterField(field) => {
                self.character_field = field;
                if let Some(draft) = &self.character_draft {
                    self.character_text = text_editor::Content::with_text(draft.get(field));
                }
            }
            Message::CharacterText(action) => {
                if let Some(draft) = &mut self.character_draft {
                    self.character_text.perform(action);
                    draft.set(self.character_field, self.character_text.text());
                }
            }
            Message::DiscardCharacter => {
                self.character_draft = None;
                self.character_error.clear();
                self.page = Page::Characters;
            }
            Message::SaveCharacter => self.save_character(),
            Message::Navigate(page) => {
                if page == Page::Prompt {
                    self.refresh_prompt();
                }
                self.page = page;
            }
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
            Message::PersonaChanged(value) => {
                self.prompt_settings.persona_name = value;
                self.refresh_prompt();
            }
            Message::AuthorNoteChanged(value) => {
                self.prompt_settings.author_note = value;
                self.refresh_prompt();
            }
            Message::TemplateChanged(value) => {
                self.prompt_settings.template = value;
                self.refresh_prompt();
            }
            Message::ReplyLengthChanged(value) => {
                self.prompt_settings.reply_length = value;
                self.refresh_prompt();
            }
            Message::RefreshPrompt => self.refresh_prompt(),
            Message::CopyPrompt(post) => {
                if let Ok(prompt) = &self.prompt {
                    return iced::clipboard::write(if post {
                        prompt.post_history.clone().unwrap_or_default()
                    } else {
                        prompt.system.clone()
                    });
                }
            }
            Message::PromptAction(post, action) => {
                if !action.is_edit() {
                    if post {
                        self.prompt_post.perform(action);
                    } else {
                        self.prompt_system.perform(action);
                    }
                }
            }
            Message::EndpointChanged(value) => {
                if self.diagnostic.is_none() {
                    self.connection.endpoint = value;
                }
            }
            Message::ModelChanged(value) => {
                if self.diagnostic.is_none() {
                    self.connection.model = value;
                }
            }
            Message::KeyChanged(value) => {
                if self.diagnostic.is_none() {
                    self.connection.key = value;
                }
            }
            Message::FormatChanged(value) => {
                if self.diagnostic.is_none() {
                    self.connection.format = value;
                }
            }
            Message::TestConnection => {
                if self.diagnostic.is_some() {
                    return Task::none();
                }
                self.diagnostic_id += 1;
                let id = self.diagnostic_id;
                let cancellation = connection::Cancellation::new();
                self.diagnostic = Some(connection::ActiveTest {
                    id,
                    cancellation: cancellation.clone(),
                });
                self.connection_status = "Testanfrage läuft …".into();
                let settings = self.connection.clone();
                return Task::perform(
                    background(move || connection::run(settings, cancellation)),
                    move |result| Message::ConnectionFinished { id, result },
                );
            }
            Message::CancelConnection => {
                if let Some(active) = &self.diagnostic {
                    active.cancellation.cancel();
                    self.connection_status = "Verbindungstest wird abgebrochen …".into();
                }
            }
            Message::ConnectionFinished { id, result } => {
                if self.diagnostic.as_ref().map(|active| active.id) != Some(id) {
                    return Task::none();
                }
                self.diagnostic = None;
                self.connection_status = match result {
                    Ok(report) => format!(
                        "Verbindung erfolgreich · {} Textsegmente\nAntwort: {}",
                        report.segments, report.answer
                    ),
                    Err(error) => error,
                };
            }
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
    fn greeting_stays_stable_when_submitting_and_switching_chats() {
        let mut app = App::default();
        app.preview.current_mut().greeting =
            Some(("User".into(), "Einmalig expandierte Begrüßung".into()));
        app.preview.current_mut().draft = "Eine Testnachricht".into();
        let _ = app.update(Message::Submit);
        let _ = app.update(Message::SelectCharacter(1));
        let _ = app.update(Message::SelectCharacter(0));
        assert_eq!(
            app.preview.current().greeting.as_ref().unwrap().1,
            "Einmalig expandierte Begrüßung"
        );
    }

    #[test]
    fn stale_connection_report_cannot_finish_the_active_test() {
        let mut app = App {
            diagnostic: Some(connection::ActiveTest {
                id: 2,
                cancellation: connection::Cancellation::new(),
            }),
            connection_status: "Aktueller Test".into(),
            ..App::default()
        };
        let _ = app.update(Message::ConnectionFinished {
            id: 1,
            result: Ok(connection::Report {
                answer: "Alter Test".into(),
                segments: 1,
            }),
        });
        assert_eq!(app.connection_status, "Aktueller Test");
        assert_eq!(app.diagnostic.as_ref().unwrap().id, 2);
    }

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
#[cfg(test)]
mod character_editor_tests {
    use super::*;
    #[test]
    fn inspecting_a_card_also_prepares_its_unloaded_archive_chat() {
        let mut app = App::default();
        app.preview.current_mut().source_id = Some("archive".into());
        app.preview.current_mut().loaded = false;
        app.profile_home = Some(PathBuf::from("unused-test-profile"));
        let _ = app.update(Message::InspectCharacter(0));
        assert_eq!(app.page, Page::Details);
        assert!(app.pending.contains(&0));
    }
    #[test]
    fn character_edit_keeps_its_target_after_chat_navigation() {
        let mut app = App::default();
        let old_second = app.preview.characters[1].name.clone();
        let _ = app.update(Message::EditCharacter(0));
        let _ = app.update(Message::CharacterName("Bearbeitete Figur".into()));
        let _ = app.update(Message::SelectCharacter(1));
        let _ = app.update(Message::SaveCharacter);
        assert_eq!(app.preview.characters[0].name, "Bearbeitete Figur");
        assert_eq!(app.preview.characters[1].name, old_second);
        assert!(app.character_draft.is_none());
    }

    #[test]
    fn draft_blocks_profile_changes_and_other_edits_until_resolved() {
        let mut app = App::default();
        let _ = app.update(Message::EditCharacter(0));
        let _ = app.update(Message::CharacterName("Mein Entwurf".into()));
        let _ = app.update(Message::EditCharacter(1));
        let _ = app.update(Message::LoadProfile);
        assert!(!app.profile_busy);
        assert_eq!(app.page, Page::CharacterEditor);
        assert_eq!(
            app.character_draft
                .as_ref()
                .unwrap()
                .get(character_draft::Field::Name),
            "Mein Entwurf"
        );
        let _ = app.update(Message::DiscardCharacter);
        assert!(app.character_draft.is_none());
        assert_ne!(app.preview.characters[0].name, "Mein Entwurf");
    }

    #[test]
    fn duplicates_have_distinct_names_ids_and_local_chats() {
        let mut app = App::default();
        let count = app.preview.characters.len();
        for _ in 0..2 {
            let _ = app.update(Message::DuplicateCharacter(0));
            let _ = app.update(Message::SaveCharacter);
        }
        let first = &app.preview.characters[count];
        let second = &app.preview.characters[count + 1];
        assert_ne!(first.id, second.id);
        assert_ne!(first.name, second.name);
        assert_eq!(first.portrait, app.preview.characters[0].portrait);
        let _ = app.update(Message::SelectCharacter(count + 1));
        assert!(!app.preview.current().is_read_only());
        assert!(
            app.prompt
                .as_ref()
                .unwrap()
                .system
                .contains(&app.preview.characters[count + 1].name)
        );
    }
}
