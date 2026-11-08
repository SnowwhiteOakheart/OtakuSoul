#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod appearance;
mod card_files;
mod character_draft;
mod connection;
mod icons;
mod library;
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum EditorTab {
    Fields,
    Greetings,
    Json,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct GreetingChoice(usize);
impl std::fmt::Display for GreetingChoice {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if self.0 == 0 {
            f.write_str("Hauptbegrüßung")
        } else {
            write!(f, "Alternative {}", self.0)
        }
    }
}

#[derive(Debug, Clone)]
enum Message {
    Navigate(Page),
    SelectCharacter(usize),
    LibrarySearch(String),
    LibraryTag(Option<String>),
    ResetLibraryFilters,
    EditCharacter(usize),
    NewCharacter,
    DuplicateCharacter(usize),
    InspectCharacter(usize),
    CopyCharacterDraft,
    ImportCharacter,
    CharacterImported(Result<Option<profile::ProfileCharacter>, String>),
    ExportDraft(card_files::Format),
    ExportCharacter(usize, card_files::Format),
    CharacterExported(Result<bool, String>),
    CharacterName(String),
    CharacterField(character_draft::Field),
    CharacterText(text_editor::Action),
    EditorTabChanged(EditorTab),
    EditorGreeting(GreetingChoice),
    AddGreeting,
    RemoveGreeting,
    ChatGreeting(GreetingChoice),
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
    library_tag: Option<String>,
    character_draft: Option<character_draft::Draft>,
    character_source: Option<usize>,
    character_field: character_draft::Field,
    editor_tab: EditorTab,
    editor_greeting: usize,
    character_text: text_editor::Content,
    character_error: String,
    next_character_id: u64,
    card_busy: bool,
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
        let variants = prompt_preview::greetings(preview.character(), &prompt_settings, &seed);
        let greeting_text = variants.first().cloned().unwrap_or_default();
        preview
            .current_mut()
            .greeting_variants
            .insert(prompt_settings.persona_name.trim().into(), variants);
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
            library_tag: None,
            character_draft: None,
            character_source: None,
            character_field: character_draft::Field::Description,
            editor_tab: EditorTab::Fields,
            editor_greeting: 0,
            character_text: text_editor::Content::new(),
            character_error: String::new(),
            next_character_id: 0,
            card_busy: false,
        }
    }
}

impl App {
    fn chat_greeting_choices(&self) -> Vec<GreetingChoice> {
        self.preview
            .current()
            .greeting_variants
            .get(self.prompt_settings.persona_name.trim())
            .map(|variants| {
                variants
                    .iter()
                    .enumerate()
                    .filter(|(_, text)| !text.trim().is_empty())
                    .map(|(index, _)| GreetingChoice(index))
                    .collect()
            })
            .unwrap_or_default()
    }
    fn sync_character_text(&mut self) {
        let Some(draft) = &self.character_draft else {
            return;
        };
        let text = match self.editor_tab {
            EditorTab::Fields => draft.get(self.character_field).to_owned(),
            EditorTab::Greetings => {
                if self.editor_greeting == 0 {
                    draft.get(character_draft::Field::FirstMessage).to_owned()
                } else {
                    draft
                        .alternate_greetings()
                        .get(self.editor_greeting - 1)
                        .cloned()
                        .unwrap_or_default()
                }
            }
            EditorTab::Json => match draft.apply(
                self.character_source
                    .and_then(|index| self.preview.characters.get(index)),
                "preview".into(),
            ) {
                Ok(character) => {
                    self.character_error.clear();
                    serde_json::to_string_pretty(&character.card).unwrap_or_default()
                }
                Err(error) => {
                    self.character_error = error;
                    String::new()
                }
            },
        };
        self.character_text = text_editor::Content::with_text(&text);
    }

    fn fresh_character_id(&mut self) -> String {
        loop {
            self.next_character_id += 1;
            let id = format!("native-character-{}", self.next_character_id);
            if !self
                .preview
                .characters
                .iter()
                .any(|character| character.id == id)
            {
                return id;
            }
        }
    }

    fn export_card(
        &mut self,
        export: card_files::Export,
        format: card_files::Format,
    ) -> Task<Message> {
        if self.profile_busy || self.card_busy {
            return Task::none();
        }
        if matches!(format, card_files::Format::Png) && export.portrait.is_none() {
            self.character_error =
                "Für einen PNG-Export benötigt der Charakter ein Porträt. Bitte JSON wählen."
                    .into();
            self.notice = self.character_error.clone();
            return Task::none();
        }
        self.card_busy = true;
        self.character_error.clear();
        self.notice = "Exportziel wählen …".into();
        let protected_home = self.profile_home.clone();
        Task::perform(
            async move {
                let (label, extension) = match format {
                    card_files::Format::Json => ("JSON-Charakterkarte", "json"),
                    card_files::Format::Png => ("PNG-Charakterkarte mit Porträt", "png"),
                };
                let Some(file) = rfd::AsyncFileDialog::new()
                    .set_title("Charakter exportieren")
                    .add_filter(label, &[extension])
                    .set_file_name(format!("charakter.{extension}"))
                    .save_file()
                    .await
                else {
                    return Ok(false);
                };
                // Die bestätigte Zieldatei unverändert verwenden. Nachträgliches Anhängen
                // könnte eine andere vorhandene Datei ohne Überschreibbestätigung treffen.
                let path = file.path().to_path_buf();
                if !path
                    .extension()
                    .is_some_and(|value| value.eq_ignore_ascii_case(extension))
                {
                    return Err(format!(
                        "Bitte eine Datei mit der Endung .{extension} wählen."
                    ));
                }
                background(move || {
                    card_files::write(&path, &export, format, protected_home.as_deref())
                })
                .await
                .map(|()| true)
            },
            Message::CharacterExported,
        )
    }

    fn open_character(&mut self, source: Option<usize>, duplicate: bool) {
        if self.profile_busy || self.card_busy {
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
            self.editor_tab = EditorTab::Fields;
            self.editor_greeting = 0;
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
                        if conversation.character_id == id
                            && conversation.messages.is_empty()
                            && !conversation.is_read_only()
                        {
                            conversation.greeting = None;
                            conversation.greeting_variants.clear();
                            conversation.greeting_index = 0;
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
                self.library_tag = None;
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
        let greeting_text = if self.preview.current().is_read_only() {
            String::new()
        } else if !self.preview.current().messages.is_empty()
            && self.preview.current().greeting.is_some()
        {
            self.preview.current().greeting.as_ref().unwrap().1.clone()
        } else {
            if !self
                .preview
                .current()
                .greeting_variants
                .contains_key(&persona)
            {
                let variants = prompt_preview::greetings(
                    self.preview.character(),
                    &self.prompt_settings,
                    &seed,
                );
                self.preview
                    .current_mut()
                    .greeting_variants
                    .insert(persona.clone(), variants);
            }
            let current = self.preview.current_mut();
            let variants = &current.greeting_variants[&persona];
            if variants
                .get(current.greeting_index)
                .is_none_or(|text| text.trim().is_empty())
            {
                current.greeting_index = variants
                    .iter()
                    .position(|text| !text.trim().is_empty())
                    .unwrap_or_default();
            }
            let text = variants
                .get(current.greeting_index)
                .cloned()
                .unwrap_or_default();
            current.greeting = Some((persona, text.clone()));
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
        if self.card_busy {
            self.notice = "Bitte den laufenden Kartenimport oder -export abwarten.".into();
            return Task::none();
        }
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
            Message::EditorTabChanged(tab) => {
                self.editor_tab = tab;
                self.character_error.clear();
                self.sync_character_text();
            }
            Message::EditorGreeting(choice) => {
                if self
                    .character_draft
                    .as_ref()
                    .is_some_and(|draft| choice.0 <= draft.alternate_greetings().len())
                {
                    self.editor_greeting = choice.0;
                    self.sync_character_text();
                }
            }
            Message::AddGreeting => {
                if let Some(draft) = &mut self.character_draft {
                    draft.add_greeting();
                    self.editor_greeting = draft.alternate_greetings().len();
                    self.sync_character_text();
                }
            }
            Message::RemoveGreeting => {
                if self.editor_greeting > 0
                    && let Some(draft) = &mut self.character_draft
                {
                    draft.remove_greeting(self.editor_greeting - 1);
                    self.editor_greeting = self
                        .editor_greeting
                        .saturating_sub(1)
                        .min(draft.alternate_greetings().len());
                    self.sync_character_text();
                }
            }
            Message::ChatGreeting(choice) => {
                if !self.preview.current().is_read_only()
                    && self.preview.current().messages.is_empty()
                    && self.chat_greeting_choices().contains(&choice)
                {
                    self.preview.current_mut().greeting_index = choice.0;
                    self.refresh_prompt();
                }
            }
            Message::ImportCharacter => {
                if self.card_busy || self.profile_busy {
                    return Task::none();
                }
                if self.character_draft.is_some() {
                    self.character_error =
                        "Bitte den offenen Entwurf zuerst übernehmen oder verwerfen.".into();
                    self.page = Page::CharacterEditor;
                    return Task::none();
                }
                self.card_busy = true;
                self.notice = "Charakterkarte auswählen …".into();
                return Task::perform(
                    async {
                        let Some(file) = rfd::AsyncFileDialog::new()
                            .set_title("Charakter importieren")
                            .add_filter("Charakterkarte", &["json", "png"])
                            .pick_file()
                            .await
                        else {
                            return Ok(None);
                        };
                        let path = file.path().to_path_buf();
                        background(move || profile::import_card_file(&path))
                            .await
                            .map(Some)
                    },
                    Message::CharacterImported,
                );
            }
            Message::CharacterImported(result) => {
                self.card_busy = false;
                self.notice = match result {
                    Ok(Some(character)) => {
                        let id = self.fresh_character_id();
                        self.preview.add_character(model::Character {
                            id,
                            name: character.name,
                            description: character.description,
                            first_message: character.first_message,
                            card: Some(character.card),
                            portrait: character.portrait,
                        });
                        self.portraits = Self::portraits(&self.preview);
                        self.library_search.clear();
                        self.library_tag = None;
                        self.page = Page::Characters;
                        "Charakter importiert. Er bleibt bis zum Export im Arbeitsspeicher.".into()
                    }
                    Ok(None) => "Import abgebrochen.".into(),
                    Err(error) => format!("Import fehlgeschlagen: {error}"),
                };
            }
            Message::ExportDraft(format) => {
                if let Some(draft) = &self.character_draft {
                    match draft.apply(
                        self.character_source
                            .and_then(|index| self.preview.characters.get(index)),
                        "export".into(),
                    ) {
                        Ok(character) => {
                            return self.export_card(
                                card_files::Export {
                                    card: character.card.unwrap(),
                                    portrait: character.portrait,
                                },
                                format,
                            );
                        }
                        Err(error) => self.character_error = error,
                    }
                }
            }
            Message::ExportCharacter(index, format) => {
                if let Some(character) = self.preview.characters.get(index) {
                    if let Some(card) = &character.card {
                        return self.export_card(
                            card_files::Export {
                                card: card.clone(),
                                portrait: character.portrait.clone(),
                            },
                            format,
                        );
                    }
                    self.notice =
                        "Zu diesem Charakter fehlt die Karte; bitte zuerst im Editor ergänzen."
                            .into();
                }
            }
            Message::CharacterExported(result) => {
                self.card_busy = false;
                self.notice = match result {
                    Ok(true) => {
                        "Charakterkarte exportiert. Die Profilkopie bleibt unverändert.".into()
                    }
                    Ok(false) => "Export abgebrochen.".into(),
                    Err(error) => format!("Export fehlgeschlagen: {error}"),
                };
            }
            Message::LibrarySearch(value) => self.library_search = value,
            Message::LibraryTag(tag) => self.library_tag = tag,
            Message::ResetLibraryFilters => {
                self.library_search.clear();
                self.library_tag = None;
            }
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
                if self.editor_tab == EditorTab::Json {
                    self.sync_character_text();
                }
            }
            Message::CharacterField(field) => {
                self.character_field = field;
                self.sync_character_text();
            }
            Message::CharacterText(action) => {
                if self.editor_tab == EditorTab::Json {
                    if !action.is_edit() {
                        self.character_text.perform(action);
                    }
                    return Task::none();
                }
                if let Some(draft) = &mut self.character_draft {
                    self.character_text.perform(action);
                    match self.editor_tab {
                        EditorTab::Fields => {
                            draft.set(self.character_field, self.character_text.text())
                        }
                        EditorTab::Greetings if self.editor_greeting == 0 => draft.set(
                            character_draft::Field::FirstMessage,
                            self.character_text.text(),
                        ),
                        EditorTab::Greetings => {
                            draft.set_greeting(self.editor_greeting - 1, self.character_text.text())
                        }
                        EditorTab::Json => unreachable!(),
                    }
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
                        self.library_search.clear();
                        self.library_tag = None;
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
    fn resetting_library_filters_preserves_chat_and_character_draft() {
        let mut app = App::default();
        let _ = app.update(Message::EditCharacter(0));
        let _ = app.update(Message::CharacterName("Offener Entwurf".into()));
        let _ = app.update(Message::LibrarySearch("keine Treffer".into()));
        let _ = app.update(Message::LibraryTag(Some("Unbekannt".into())));
        let selected = app.preview.selected;
        let _ = app.update(Message::ResetLibraryFilters);
        assert!(app.library_search.is_empty());
        assert!(app.library_tag.is_none());
        assert_eq!(app.preview.selected, selected);
        assert_eq!(
            app.character_draft
                .as_ref()
                .unwrap()
                .get(character_draft::Field::Name),
            "Offener Entwurf"
        );
    }

    #[test]
    fn saving_a_card_clears_filters_so_its_new_tags_do_not_hide_it() {
        let mut app = App::default();
        let _ = app.update(Message::EditCharacter(0));
        app.character_draft
            .as_mut()
            .unwrap()
            .set(character_draft::Field::Tags, "Neuer Tag".into());
        let _ = app.update(Message::LibrarySearch("Alte Suche".into()));
        let _ = app.update(Message::LibraryTag(Some("Alter Tag".into())));
        let _ = app.update(Message::SaveCharacter);
        assert!(app.library_search.is_empty());
        assert!(app.library_tag.is_none());
        assert!(library::matches(
            &app.preview.characters[0],
            "Neuer Tag",
            None
        ));
    }

    #[test]
    fn macros_that_expand_to_empty_are_not_chat_choices() {
        let mut app = with_alternate_greetings();
        app.preview.characters[0].first_message = "{{noop}}".into();
        app.preview.current_mut().greeting_variants.clear();
        app.refresh_prompt();
        assert_eq!(app.preview.current().greeting_index, 1);
        assert!(!app.chat_greeting_choices().contains(&GreetingChoice(0)));
        let _ = app.update(Message::ChatGreeting(GreetingChoice(0)));
        assert_eq!(app.preview.current().greeting_index, 1);
    }

    fn with_alternate_greetings() -> App {
        let mut app = App::default();
        app.preview.characters[0].card.as_mut().unwrap()["data"]["alternate_greetings"] =
            serde_json::json!(["Andere Begrüßung, {{user}}.", "Dritte Begrüßung."]);
        app.preview.current_mut().greeting_variants.clear();
        app.refresh_prompt();
        app
    }

    #[test]
    fn variants_are_cached_and_cannot_change_after_the_first_message() {
        let mut app = with_alternate_greetings();
        let original = app.preview.current().greeting.as_ref().unwrap().1.clone();
        app.preview.current_mut().draft = "Entwurf bleibt erhalten".into();
        let _ = app.update(Message::ChatGreeting(GreetingChoice(1)));
        assert_eq!(
            app.preview.current().greeting.as_ref().unwrap().1,
            "Andere Begrüßung, User."
        );
        assert_eq!(app.preview.current().draft, "Entwurf bleibt erhalten");
        let _ = app.update(Message::ChatGreeting(GreetingChoice(0)));
        assert_eq!(app.preview.current().greeting.as_ref().unwrap().1, original);
        let _ = app.update(Message::Submit);
        let _ = app.update(Message::ChatGreeting(GreetingChoice(1)));
        assert_eq!(app.preview.current().greeting_index, 0);
        assert_eq!(app.preview.current().greeting.as_ref().unwrap().1, original);
    }

    #[test]
    fn empty_main_greeting_uses_nonempty_alternative_and_archives_stay_untouched() {
        let mut app = with_alternate_greetings();
        app.preview.characters[0].first_message.clear();
        app.preview.characters[0].card.as_mut().unwrap()["data"]["alternate_greetings"] =
            serde_json::json!(["  ", "Hallo {{user}}"]);
        app.preview.current_mut().greeting_variants.clear();
        app.refresh_prompt();
        assert_eq!(app.preview.current().greeting_index, 2);
        assert_eq!(
            app.preview.current().greeting.as_ref().unwrap().1,
            "Hallo User"
        );
        app.preview.current_mut().source_id = Some("archive".into());
        let snapshot = app.preview.current().greeting.clone();
        let _ = app.update(Message::ChatGreeting(GreetingChoice(0)));
        assert_eq!(app.preview.current().greeting, snapshot);
    }

    #[test]
    fn card_edits_preserve_started_chat_greeting_and_clear_resets_selection() {
        let mut app = with_alternate_greetings();
        let _ = app.update(Message::ChatGreeting(GreetingChoice(1)));
        app.preview.current_mut().draft = "Test".into();
        let _ = app.update(Message::Submit);
        let original = app.preview.current().greeting.clone();
        let _ = app.update(Message::EditCharacter(0));
        app.character_draft.as_mut().unwrap().set(
            character_draft::Field::FirstMessage,
            "Neue Begrüßung".into(),
        );
        let _ = app.update(Message::SaveCharacter);
        assert_eq!(app.preview.current().greeting, original);
        let _ = app.update(Message::Clear);
        assert_eq!(app.preview.current().greeting_index, 0);
        assert_eq!(
            app.preview.current().greeting.as_ref().unwrap().1,
            "Neue Begrüßung"
        );
    }

    #[test]
    fn greeting_editor_and_readonly_json_keep_the_current_draft() {
        let mut app = App::default();
        let _ = app.update(Message::EditCharacter(0));
        let _ = app.update(Message::EditorTabChanged(EditorTab::Greetings));
        let _ = app.update(Message::AddGreeting);
        let index = app.editor_greeting;
        let _ = app.update(Message::CharacterText(text_editor::Action::Edit(
            text_editor::Edit::Insert('X'),
        )));
        let _ = app.update(Message::EditorTabChanged(EditorTab::Json));
        let json = app.character_text.text();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(
            parsed["data"]["alternate_greetings"][index - 1]
                .as_str()
                .unwrap()
                .contains('X')
        );
        let _ = app.update(Message::CharacterText(text_editor::Action::Edit(
            text_editor::Edit::Insert('Z'),
        )));
        assert_eq!(app.character_text.text(), json);
        let _ = app.update(Message::EditorTabChanged(EditorTab::Greetings));
        assert!(app.character_text.text().contains('X'));
        let _ = app.update(Message::RemoveGreeting);
        assert!(app.editor_greeting < index);
    }

    #[test]
    fn card_io_blocks_conflicting_profile_and_editor_operations() {
        let mut app = App {
            card_busy: true,
            ..App::default()
        };
        let _ = app.update(Message::LoadProfile);
        let _ = app.update(Message::NewCharacter);
        let _ = app.update(Message::ImportCharacter);
        assert!(!app.profile_busy);
        assert!(app.character_draft.is_none());
        assert!(app.card_busy);
    }

    #[test]
    fn repeated_single_card_imports_never_replace_existing_characters() {
        let mut app = App::default();
        let count = app.preview.characters.len();
        let source = &app.preview.characters[0];
        let imported = profile::ProfileCharacter {
            id: source.id.clone(),
            name: source.name.clone(),
            description: source.description.clone(),
            first_message: source.first_message.clone(),
            card: source.card.clone().unwrap(),
            portrait: source.portrait.clone(),
        };
        let _ = app.update(Message::CharacterImported(Ok(Some(imported.clone()))));
        let _ = app.update(Message::CharacterImported(Ok(Some(imported))));
        assert_eq!(app.preview.characters.len(), count + 2);
        assert_ne!(
            app.preview.characters[count].id,
            app.preview.characters[count + 1].id
        );
        let _ = app.update(Message::SelectCharacter(count + 1));
        assert!(!app.preview.current().is_read_only());
    }

    #[test]
    fn invalid_draft_or_missing_png_portrait_fails_before_a_dialog() {
        let mut app = App::default();
        let _ = app.update(Message::NewCharacter);
        let _ = app.update(Message::ExportDraft(card_files::Format::Json));
        assert!(!app.card_busy);
        assert!(!app.character_error.is_empty());
        let _ = app.update(Message::CharacterName("Neue Karte".into()));
        let _ = app.update(Message::ExportDraft(card_files::Format::Png));
        assert!(!app.card_busy);
        assert!(app.character_error.contains("Porträt"));
        assert!(app.character_draft.is_some());
    }

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
