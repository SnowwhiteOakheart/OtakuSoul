#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod appearance;
mod card_files;
mod character_draft;
mod chat_request;
mod chat_search;
mod connection;
mod expressions;
mod file_export;
mod home_view;
mod hub_appearance;
mod hub_catalog;
mod hub_cover;
mod hub_store;
mod icons;
mod library;
mod lore_catalog;
mod lore_draft;
mod message_content;
mod model;
mod profile;
mod prompt_preview;
mod stage_preview;
mod stage_views;
mod ui_text;
mod views;

use iced::keyboard::{Key, key::Named};
use iced::widget::{image, text_editor};
use iced::{Task, Theme};
use model::Preview;
use profile::{Profile, StoredMessage};
use std::collections::{HashMap, HashSet};
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
    Lorebooks,
    LorebookDetails,
    LorebookEditor,
    Hub,
    Stage,
    Planned(&'static str),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum EditorTab {
    Fields,
    Greetings,
    Expressions,
    Lorebooks,
    Json,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct GreetingChoice(usize);
#[derive(Debug, Clone, PartialEq, Eq)]
struct LoreEntryChoice(usize, String);
impl std::fmt::Display for LoreEntryChoice {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.1)
    }
}
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
    StageFilter(StageFilter),
    StageSelect(usize),
    StageBack,
    StageOpening,
    StageBrowseHub,
    HubScenePreview(String),
    HubSceneLoaded(String, u64, Result<stage_preview::Scene, String>),
    HubKind(hub_catalog::Kind),
    HubSearch(String),
    HubReload(hub_catalog::Kind),
    HubRefresh,
    HubLoaded(hub_catalog::Kind, Result<Vec<hub_catalog::Entry>, String>),
    HubOpenWorld(String),
    HubCloseWorld,
    HubCoverVisible(u64, String, url::Url, bool),
    HubCoverLoaded(url::Url, Option<image::Handle>),
    HubLibraryLoaded(Result<HubLibrary, String>),
    HubImport(hub_catalog::Kind, String),
    HubImported(Result<HubImportResult, String>),
    ImportLorebook,
    NewLorebook,
    EditLorebook(usize),
    LoreName(String),
    LoreDescription(String),
    LoreSelectEntry(LoreEntryChoice),
    LoreEntryName(String),
    LoreField(lore_draft::Field),
    LoreText(text_editor::Action),
    LoreEnabled(bool),
    LoreAlways(bool),
    LoreShowRules(bool),
    LoreNumber(lore_draft::Number, String),
    LoreScanDepth(String),
    LoreGlobal(bool),
    LoreTrigger(String),
    LoreInjection(String),
    LoreCaseSensitive(bool),
    LoreWholeWords(bool),
    ResetLoreRules,
    AddLoreEntry,
    RemoveLoreEntry,
    SaveLorebook,
    DiscardLorebook,
    ExportLoreDraft,
    ExportLorebook(usize),
    LorebookExported(Result<bool, String>),
    LorebookImported(Result<Option<lore_catalog::Book>, String>),
    InspectLorebook(usize),
    CopyLorebook(usize),
    CopyEmbeddedLorebook,
    LoreEntrySearch(String),
    ToggleLorebook(usize),
    LoreReferenceInput(String),
    AddLoreReference,
    RemoveLoreReference(usize),
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
    ExpressionSlot(expressions::Slot),
    PickExpression,
    RemoveExpression,
    ExpressionAsPortrait,
    ExpressionPicked {
        draft_id: u64,
        slot: expressions::Slot,
        result: Result<Option<String>, String>,
    },
    ExpressionPreview {
        id: u64,
        result: Result<Vec<u8>, String>,
    },
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
    SendChat,
    CancelChat,
    ChatFinished {
        id: u64,
        result: Result<String, String>,
    },
    Clear,
    LocalChat,
    ToggleTheme,
    ToggleNavigation,
    ToggleAvatar,
    ToggleCompact,
    ToggleSessions,
    ToggleSearch,
    OpenSearch,
    ClearSearch,
    SearchChanged(String),
    InspectLink(String),
    PersonaChanged(String),
    AuthorNoteChanged(String),
    TemplateChanged(prompt_preview::Template),
    ReplyLengthChanged(prompt_preview::ReplyLength),
    RefreshPrompt,
    EvaluatePromptLore,
    PromptLoreEvaluated {
        id: u64,
        result: Result<prompt_preview::LoreReport, String>,
    },
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

#[derive(Debug, Clone)]
enum HubContent {
    Character(profile::ProfileCharacter),
    Lorebook(lore_catalog::Book),
}

impl HubContent {
    fn parse(
        kind: hub_catalog::Kind,
        title: &str,
        filename: &str,
        bytes: Vec<u8>,
    ) -> Result<Self, String> {
        match kind {
            hub_catalog::Kind::Characters => profile::import_hub_card(bytes).map(Self::Character),
            hub_catalog::Kind::Lorebooks => {
                let raw = serde_json::from_slice(&bytes)
                    .map_err(|_| "Die Hub-Datei enthält kein gültiges Lorebook-JSON.")?;
                profile::check_public_hub_content(&raw)?;
                lore_catalog::Book::from_json(raw, format!("Hub/{filename}"), title)
                    .map(Self::Lorebook)
            }
            _ => Err("Dieser Inhalt kann noch nicht übernommen werden.".into()),
        }
    }
}

#[derive(Debug, Clone)]
struct HubInstalledContent {
    revision: u32,
    content: HubContent,
}

#[derive(Debug, Clone)]
enum HubImportResult {
    Installed(HubInstalledContent),
    UpdateStored(u32),
}

fn import_hub_content(
    root: &std::path::Path,
    protected_home: Option<&std::path::Path>,
    kind: hub_catalog::Kind,
    entry: &hub_catalog::Entry,
    update: bool,
) -> Result<HubImportResult, String> {
    if protected_home.is_some_and(|home| profile::hub_store_overlaps(root, home)) {
        return Err(
            "Der native Hub-Speicher überschneidet sich mit der geladenen Profilkopie.".into(),
        );
    }
    profile::validate_hub_store(root)?;
    let item = hub_store::Item {
        kind,
        id: entry.id.clone(),
        revision: entry.revision,
        title: entry.original_title().into(),
        filename: entry
            .download_filename()
            .ok_or("Die Hub-Datei fehlt.")?
            .into(),
        bytes: hub_catalog::download(entry)?,
    };
    let content = HubContent::parse(kind, &item.title, &item.filename, item.bytes.clone())?;
    if update {
        return hub_store::update(root, &item).map(HubImportResult::UpdateStored);
    }
    let installed = match hub_store::install(root, &item)? {
        hub_store::Install::Added => HubInstalledContent {
            revision: item.revision,
            content,
        },
        hub_store::Install::Existing(stored) => HubInstalledContent {
            revision: stored.revision,
            content: HubContent::parse(stored.kind, &stored.title, &stored.filename, stored.bytes)?,
        },
    };
    Ok(HubImportResult::Installed(installed))
}

#[derive(Debug, Clone)]
struct HubLibrary {
    entries: Vec<((hub_catalog::Kind, String), HubInstalledContent)>,
    unreadable: usize,
}

impl HubLibrary {
    fn read(root: &std::path::Path) -> Result<Self, String> {
        let mut library = Self {
            entries: Vec::new(),
            unreadable: 0,
        };
        for item in hub_store::list(root)? {
            match HubContent::parse(item.kind, &item.title, &item.filename, item.bytes) {
                Ok(content) => library.entries.push((
                    (item.kind, item.id),
                    HubInstalledContent {
                        revision: item.revision,
                        content,
                    },
                )),
                Err(_) => library.unreadable += 1,
            }
        }
        Ok(library)
    }
}

struct HubWorld {
    entry: hub_catalog::Entry,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum HubEntryState {
    Available,
    Installed,
    UpdateAvailable,
    PendingRestart,
}

struct HubInstallation {
    revision: u32,
    pending_restart: bool,
}

struct Hub {
    kind: hub_catalog::Kind,
    query: String,
    catalog: HashMap<hub_catalog::Kind, Vec<hub_catalog::Entry>>,
    loading: HashSet<hub_catalog::Kind>,
    errors: HashMap<hub_catalog::Kind, String>,
    world: Option<HubWorld>,
    covers: hub_cover::Gallery,
    cover_generation: u64,
    visible_covers: HashMap<String, url::Url>,
    store: Option<PathBuf>,
    library_loading: bool,
    library_notice: String,
    installed_character_ids: HashSet<String>,
    importing: Option<(hub_catalog::Kind, String)>,
    installed: HashMap<(hub_catalog::Kind, String), HubInstallation>,
    notice: String,
}

impl Default for Hub {
    fn default() -> Self {
        Self {
            kind: hub_catalog::Kind::Worlds,
            query: String::new(),
            catalog: HashMap::new(),
            loading: HashSet::new(),
            errors: HashMap::new(),
            world: None,
            covers: hub_cover::Gallery::default(),
            cover_generation: 0,
            visible_covers: HashMap::new(),
            store: None,
            library_loading: false,
            library_notice: String::new(),
            installed_character_ids: HashSet::new(),
            importing: None,
            installed: HashMap::new(),
            notice: String::new(),
        }
    }
}

impl Hub {
    fn contains_visible_entry(&self, kind: hub_catalog::Kind, id: &str) -> bool {
        self.world.as_ref().map_or(self.kind == kind, |world| {
            world
                .entry
                .members
                .iter()
                .any(|member| member.kind == kind && member.id == id)
        })
    }

    fn entry_state(&self, key: &(hub_catalog::Kind, String), revision: u32) -> HubEntryState {
        match self.installed.get(key) {
            None => HubEntryState::Available,
            Some(installed) if installed.revision < revision => HubEntryState::UpdateAvailable,
            Some(installed) if installed.pending_restart => HubEntryState::PendingRestart,
            Some(_) => HubEntryState::Installed,
        }
    }

    fn reset_cover_requests(&mut self) {
        self.covers.clear_pending();
        self.visible_covers.clear();
        self.cover_generation += 1;
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
enum StageFilter {
    #[default]
    All,
    Beginner,
    Genre(stage_preview::Genre),
    Collection(stage_preview::Collection),
}

struct Stage {
    scenes: Vec<stage_preview::Scene>,
    filter: StageFilter,
    selected: Option<usize>,
    opening: bool,
    from_hub: HashMap<String, usize>,
    hub_loading: Option<String>,
    hub_notice: String,
}

fn download_hub_scene(entry: &hub_catalog::Entry) -> Result<stage_preview::Scene, String> {
    let bytes = hub_catalog::download(entry)?;
    let raw = serde_json::from_slice(&bytes)
        .map_err(|_| "Das Hub-Szenario enthält kein gültiges JSON.")?;
    stage_preview::parse_hub(raw, &entry.id, entry.original_title())
}

impl Default for Stage {
    fn default() -> Self {
        Self {
            scenes: stage_preview::bundled(),
            filter: StageFilter::All,
            selected: None,
            opening: false,
            from_hub: HashMap::new(),
            hub_loading: None,
            hub_notice: String::new(),
        }
    }
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
    diagnostic: Option<connection::ActiveRequest>,
    diagnostic_id: u64,
    connection_status: String,
    chat_request: Option<connection::ActiveRequest>,
    chat_request_id: u64,
    prompt_settings: prompt_preview::Settings,
    prompt: Result<otakusoul_prompt::AssembledPrompt, String>,
    prompt_lore: Option<Result<prompt_preview::LoreReport, String>>,
    prompt_lore_id: u64,
    prompt_lore_pending: bool,
    prompt_system: text_editor::Content,
    prompt_post: text_editor::Content,
    library_search: String,
    library_tag: Option<String>,
    hub: Hub,
    stage: Stage,
    lorebooks: Vec<lore_catalog::Book>,
    lorebook_selected: Option<usize>,
    lore_entry_search: String,
    lore_reference_input: String,
    lore_draft: Option<lore_draft::Draft>,
    lore_selected_entry: usize,
    lore_entry_name: String,
    lore_field: lore_draft::Field,
    lore_text: text_editor::Content,
    lore_error: String,
    lore_show_rules: bool,
    lore_numbers: [String; 3],
    lore_number_errors: [Option<String>; 3],
    lore_scan_depth: String,
    lore_scan_error: Option<String>,
    next_lore_id: u64,
    character_draft: Option<character_draft::Draft>,
    character_draft_id: u64,
    expression_slot: expressions::Slot,
    expression_image: Option<image::Handle>,
    expression_bytes: Option<Vec<u8>>,
    expression_status: String,
    expression_epoch: u64,
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
        let prompt = prompt_preview::build(preview.character(), &prompt_settings, &seed, None);
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
            notice: "Testnachrichten bleiben im Arbeitsspeicher.".into(),
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
            chat_request: None,
            chat_request_id: 0,
            prompt_settings,
            prompt,
            prompt_lore: None,
            prompt_lore_id: 0,
            prompt_lore_pending: false,
            prompt_system,
            prompt_post,
            library_search: String::new(),
            library_tag: None,
            hub: Hub::default(),
            stage: Stage::default(),
            lorebooks: Vec::new(),
            lorebook_selected: None,
            lore_entry_search: String::new(),
            lore_reference_input: String::new(),
            lore_draft: None,
            lore_selected_entry: 0,
            lore_entry_name: String::new(),
            lore_field: lore_draft::Field::Content,
            lore_text: text_editor::Content::new(),
            lore_error: String::new(),
            lore_show_rules: false,
            lore_numbers: Default::default(),
            lore_number_errors: Default::default(),
            lore_scan_depth: String::new(),
            lore_scan_error: None,
            next_lore_id: 0,
            character_draft: None,
            character_draft_id: 0,
            expression_slot: expressions::SLOTS[0],
            expression_image: None,
            expression_bytes: None,
            expression_status: String::new(),
            expression_epoch: 0,
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
    fn lore_rules_invalid(&self) -> bool {
        self.lore_scan_error.is_some() || self.lore_number_errors.iter().any(Option::is_some)
    }
    fn sync_lore_rule_error(&mut self) {
        self.lore_error = self
            .lore_scan_error
            .clone()
            .or_else(|| self.lore_number_errors.iter().flatten().next().cloned())
            .unwrap_or_default();
    }
    fn sync_lore_rules(&mut self) {
        if let Some(draft) = &self.lore_draft {
            self.lore_numbers = lore_draft::Number::ALL
                .map(|number| draft.number(self.lore_selected_entry, number));
            self.lore_scan_depth = draft.scan_depth();
        }
        self.lore_number_errors = Default::default();
        self.lore_scan_error = None;
    }
    fn sync_lore_text(&mut self) {
        self.lore_entry_name = self
            .lore_draft
            .as_ref()
            .map(|draft| draft.entry_name(self.lore_selected_entry))
            .unwrap_or_default();
        let text = self
            .lore_draft
            .as_ref()
            .map(|draft| draft.field(self.lore_selected_entry, self.lore_field))
            .unwrap_or_default();
        self.lore_text = text_editor::Content::with_text(&text);
    }
    fn open_lorebook(&mut self, target: Option<usize>) {
        if self.card_busy || self.profile_busy {
            return;
        }
        if self.lore_draft.is_none() {
            let draft = if let Some(index) = target {
                let Some(book) = self.lorebooks.get(index) else {
                    return;
                };
                lore_draft::Draft::from_book(index, book)
            } else {
                let id = loop {
                    self.next_lore_id += 1;
                    let id = format!("native-lorebook-{}", self.next_lore_id);
                    if !self
                        .lorebooks
                        .iter()
                        .any(|book| book.matches_reference(&id))
                    {
                        break id;
                    }
                };
                lore_draft::Draft::new(id)
            };
            self.lore_draft = Some(draft);
            self.lore_selected_entry = 0;
            self.lore_field = lore_draft::Field::Content;
            self.lore_error.clear();
            self.sync_lore_text();
            self.sync_lore_rules();
            self.lore_show_rules = false;
        }
        self.page = Page::LorebookEditor;
    }
    fn save_lorebook(&mut self) {
        if self.lore_rules_invalid() {
            self.sync_lore_rule_error();
            return;
        }
        let Some(draft) = &self.lore_draft else {
            return;
        };
        let target = draft.target;
        match draft.apply() {
            Ok(book) => {
                if self.lorebooks.iter().enumerate().any(|(index, existing)| {
                    Some(index) != target && existing.matches_reference(book.binding_key())
                }) {
                    self.lore_error = "Diese Lorebook-ID ist bereits im Katalog vorhanden.".into();
                    return;
                }
                let index = if let Some(index) = target {
                    self.lorebooks[index] = book;
                    index
                } else {
                    let index = self.lorebooks.len();
                    self.lorebooks.push(book);
                    index
                };
                self.lorebook_selected = Some(index);
                self.lore_draft = None;
                self.invalidate_prompt_lore();
                self.lore_error.clear();
                self.lore_entry_search.clear();
                self.page = Page::LorebookDetails;
                self.notice = "Lorebook im Arbeitsspeicher übernommen. Erst der Dateiexport sichert Änderungen dauerhaft. Namens-/Pfadbindungen nach Umbenennen prüfen; die ID bleibt gleich.".into();
            }
            Err(error) => self.lore_error = error,
        }
    }
    fn export_lorebook(&mut self, book: lore_catalog::Book) -> Task<Message> {
        if self.card_busy || self.profile_busy {
            return Task::none();
        }
        self.card_busy = true;
        self.lore_error.clear();
        self.notice = "Lorebook-Exportziel wählen …".into();
        let home = self.profile_home.clone();
        Task::perform(
            async move {
                let Some(file) = rfd::AsyncFileDialog::new()
                    .set_title("Lorebook exportieren")
                    .add_filter("Lorebook-JSON", &["json"])
                    .set_file_name("lorebook.json")
                    .save_file()
                    .await
                else {
                    return Ok(false);
                };
                let path = file.path().to_path_buf();
                if !path
                    .extension()
                    .is_some_and(|extension| extension.eq_ignore_ascii_case("json"))
                {
                    return Err("Bitte eine Datei mit der Endung .json wählen.".into());
                }
                background(move || file_export::write_json(&path, &book.raw, home.as_deref()))
                    .await
                    .map(|()| true)
            },
            Message::LorebookExported,
        )
    }
    fn embedded_lorebook(&self) -> Option<&serde_json::Value> {
        let card = self
            .character_source
            .and_then(|index| self.preview.characters.get(index))?
            .card
            .as_ref()?;
        let data = card.get("data").unwrap_or(card);
        data.get("character_book")
            .filter(|book| !book.is_null())
            .or_else(|| data.get("extensions")?.get("character_book"))
            .or_else(|| data.get("extensions")?.get("embedded_lorebook"))
    }
    fn load_expression_preview(&mut self) -> Task<Message> {
        self.expression_epoch += 1;
        let id = self.expression_epoch;
        self.expression_image = None;
        self.expression_bytes = None;
        let Some(draft) = &self.character_draft else {
            return Task::none();
        };
        let reference = draft
            .expressions()
            .get(self.expression_slot.key())
            .and_then(serde_json::Value::as_str)
            .filter(|reference| !reference.trim().is_empty())
            .map(str::to_owned);
        let Some(reference) = reference else {
            if self.expression_slot.key() == "neutral" {
                self.expression_bytes =
                    draft.portrait_override().map(<[u8]>::to_vec).or_else(|| {
                        self.character_source
                            .and_then(|index| self.preview.characters.get(index))
                            .and_then(|character| character.portrait.clone())
                    });
                self.expression_image =
                    self.expression_bytes.clone().map(image::Handle::from_bytes);
                self.expression_status = if self.expression_image.is_some() {
                    "Kein eigenes Bild · Hauptporträt als Vorschau."
                } else {
                    "Noch kein Hauptporträt. Wähle ein Bild und übernimm es bei Bedarf als Hauptporträt."
                }.into();
            } else {
                self.expression_status = "Diesem Ausdruck ist noch kein Bild zugeordnet.".into();
            }
            return Task::none();
        };
        self.expression_status = "Bildvorschau wird geladen …".into();
        Task::perform(
            background(move || expressions::preview(&reference)),
            move |result| Message::ExpressionPreview { id, result },
        )
    }

    fn set_draft_expression(
        &mut self,
        slot: expressions::Slot,
        reference: Option<String>,
    ) -> Result<(), String> {
        let adding = reference.is_some();
        let mut candidate = self
            .character_draft
            .clone()
            .ok_or("Kein Charakterentwurf geöffnet.")?;
        candidate.set_expression(slot.key(), reference)?;
        let mut budget = candidate.clone();
        if budget.get(character_draft::Field::Name).trim().is_empty() {
            budget.set(character_draft::Field::Name, "Charakter".into());
        }
        let character = budget.apply(
            self.character_source
                .and_then(|index| self.preview.characters.get(index)),
            "budget".into(),
        )?;
        let portable =
            expressions::portable_card(character.card.as_ref().ok_or("Die Charakterkarte fehlt.")?);
        let json = serde_json::to_vec_pretty(&portable)
            .map_err(|_| "Die Kartengröße konnte nicht geprüft werden.")?;
        if adding && json.len().div_ceil(3) * 4 > 4 * 1024 * 1024 {
            return Err("Die eingebetteten Bilder überschreiten die Kartengrenze. Bitte ein kleineres PNG-/WebP-Bild wählen.".into());
        }
        self.character_draft = Some(candidate);
        self.character_error.clear();
        Ok(())
    }
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
            EditorTab::Expressions => String::new(),
            EditorTab::Lorebooks => String::new(),
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

    fn add_imported_character(&mut self, character: profile::ProfileCharacter) -> String {
        let id = self.fresh_character_id();
        self.portraits
            .push(character.portrait.clone().map(image::Handle::from_bytes));
        self.preview.add_character(model::Character {
            id: id.clone(),
            name: character.name,
            description: character.description,
            first_message: character.first_message,
            card: Some(character.card),
            portrait: character.portrait,
        });
        id
    }

    fn existing_lorebook(&self, book: &lore_catalog::Book) -> Option<usize> {
        self.lorebooks.iter().position(|existing| {
            existing.matches_reference(book.binding_key()) || existing.source == book.source
        })
    }

    fn add_lorebook(&mut self, book: lore_catalog::Book) {
        self.lorebooks.push(book);
        self.invalidate_prompt_lore();
        if self.page == Page::Prompt {
            self.refresh_prompt();
        }
    }

    fn register_hub_content(
        &mut self,
        key: (hub_catalog::Kind, String),
        installed: HubInstalledContent,
    ) -> String {
        let std::collections::hash_map::Entry::Vacant(slot) = self.hub.installed.entry(key) else {
            return String::new();
        };
        slot.insert(HubInstallation {
            revision: installed.revision,
            pending_restart: false,
        });
        match installed.content {
            HubContent::Character(character) => {
                let name = character.name.clone();
                let id = self.add_imported_character(character);
                self.hub.installed_character_ids.insert(id);
                ui_text::format("hub.importedChar", &[("name", &name)])
            }
            HubContent::Lorebook(book) => {
                if self.existing_lorebook(&book).is_some() {
                    return ui_text::text("hub.native.alreadyLoaded").into();
                }
                let notice = ui_text::format(
                    "hub.importedLorebook",
                    &[
                        ("name", &book.name),
                        ("count", &book.entries.len().to_string()),
                    ],
                );
                self.add_lorebook(book);
                notice
            }
        }
    }

    fn load_hub(&mut self, kind: hub_catalog::Kind) -> Task<Message> {
        if !self.hub.loading.insert(kind) {
            return Task::none();
        }
        self.hub.errors.remove(&kind);
        Task::perform(background(move || hub_catalog::load(kind)), move |result| {
            Message::HubLoaded(kind, result)
        })
    }

    fn load_hub_catalogs(&mut self, refresh: bool) -> Task<Message> {
        let mut tasks = Vec::new();
        for kind in hub_catalog::Kind::ALL {
            if refresh || !self.hub.catalog.contains_key(&kind) {
                tasks.push(self.load_hub(kind));
            }
        }
        Task::batch(tasks)
    }

    fn open_hub_world(&mut self, id: &str) -> Task<Message> {
        use hub_catalog::Kind;
        if self.page != Page::Hub || self.hub.kind != Kind::Worlds || self.hub.world.is_some() {
            return Task::none();
        }
        let Some(entry) = self
            .hub
            .catalog
            .get(&Kind::Worlds)
            .and_then(|worlds| worlds.iter().find(|world| world.id == id))
            .cloned()
        else {
            return Task::none();
        };
        self.hub.reset_cover_requests();
        let mut tasks = Vec::new();
        for kind in Kind::WORLD_CONTENTS {
            if !self.hub.catalog.contains_key(&kind)
                && entry.members.iter().any(|member| member.kind == kind)
            {
                tasks.push(self.load_hub(kind));
            }
        }
        if let Some(address) = entry.cover.clone() {
            self.hub.covers.prioritize(address);
        }
        self.hub.world = Some(HubWorld { entry });
        tasks.push(self.load_hub_covers());
        Task::batch(tasks)
    }

    fn load_hub_covers(&mut self) -> Task<Message> {
        let mut tasks = Vec::new();
        while let Some(address) = self.hub.covers.next() {
            let request = address.clone();
            tasks.push(Task::perform(
                background(move || hub_cover::load(request)),
                move |result| Message::HubCoverLoaded(address.clone(), result.ok()),
            ));
        }
        Task::batch(tasks)
    }

    fn import_hub(&mut self, kind: hub_catalog::Kind, id: String) -> Task<Message> {
        let key = (kind, id);
        if self.page != Page::Hub
            || !self.hub.contains_visible_entry(kind, &key.1)
            || self.profile_busy
            || self.hub.library_loading
            || self.hub.loading.contains(&kind)
            || self.hub.importing.is_some()
        {
            return Task::none();
        }
        let Some(root) = self.hub.store.clone() else {
            return Task::none();
        };
        let protected_home = self.profile_home.clone();
        let Some(entry) = self
            .hub
            .catalog
            .get(&kind)
            .and_then(|entries| {
                entries
                    .iter()
                    .find(|entry| entry.id == key.1 && entry.can_import())
            })
            .cloned()
        else {
            return Task::none();
        };
        let update = match self.hub.entry_state(&key, entry.revision) {
            HubEntryState::Available => false,
            HubEntryState::UpdateAvailable => true,
            HubEntryState::Installed | HubEntryState::PendingRestart => return Task::none(),
        };
        self.hub.notice = ui_text::text("hub.importing").into();
        self.hub.importing = Some(key);
        Task::perform(
            background(move || {
                import_hub_content(&root, protected_home.as_deref(), kind, &entry, update)
            }),
            Message::HubImported,
        )
    }

    fn show_hub_scene(&mut self, index: usize) {
        self.hub.world = None;
        self.hub.reset_cover_requests();
        self.stage.filter = StageFilter::All;
        self.stage.selected = Some(index);
        self.stage.opening = false;
        self.page = Page::Stage;
    }

    fn preview_hub_scene(&mut self, id: String) -> Task<Message> {
        let kind = hub_catalog::Kind::Scenes;
        if self.page != Page::Hub
            || !self.hub.contains_visible_entry(kind, &id)
            || self.stage.hub_loading.is_some()
        {
            return Task::none();
        }
        let Some(entry) = self
            .hub
            .catalog
            .get(&kind)
            .and_then(|entries| {
                entries
                    .iter()
                    .find(|entry| entry.id == id && entry.can_preview_scene())
            })
            .cloned()
        else {
            return Task::none();
        };
        self.stage.hub_notice.clear();
        if let Some(&index) = self.stage.from_hub.get(&id) {
            self.show_hub_scene(index);
            return Task::none();
        }
        self.stage.hub_loading = Some(id.clone());
        let generation = self.hub.cover_generation;
        Task::perform(
            background(move || download_hub_scene(&entry)),
            move |result| Message::HubSceneLoaded(id.clone(), generation, result),
        )
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
            self.lore_reference_input.clear();
            self.character_draft_id += 1;
            self.expression_slot = expressions::SLOTS[0];
            self.expression_image = None;
            self.expression_bytes = None;
            self.expression_status.clear();
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
                self.character_draft_id += 1;
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
                    key,
                    modifiers,
                    ..
                }) = event
            {
                match key {
                    Key::Named(Named::Tab) => Some(Message::Focus(modifiers.shift())),
                    Key::Character(value)
                        if modifiers.control() && value.eq_ignore_ascii_case("f") =>
                    {
                        Some(Message::OpenSearch)
                    }
                    _ => None,
                }
            } else {
                None
            }
        })
    }
    fn new(profile: Option<PathBuf>) -> (Self, Task<Message>) {
        let mut app = Self::default();
        let library = match otakusoul_paths::native_data_dir() {
            Some(data) => {
                let root = data.join("hub");
                app.hub.store = Some(root.clone());
                app.hub.library_loading = true;
                Task::perform(
                    background(move || HubLibrary::read(&root)),
                    Message::HubLibraryLoaded,
                )
            }
            None => {
                app.hub.library_notice = ui_text::text("hub.native.storeUnavailable").into();
                Task::none()
            }
        };
        let task = if let Some(home) = profile {
            app.profile_input = home.to_string_lossy().into_owned();
            app.load(false)
        } else {
            Task::none()
        };
        (app, Task::batch([library, task]))
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
        self.cancel_chat();
        self.invalidate_prompt_lore();
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

    fn prompt_seed(&self) -> String {
        let conversation = self.preview.current();
        conversation
            .source_id
            .clone()
            .unwrap_or_else(|| format!("native-test:{}", conversation.character_id))
    }

    fn refresh_prompt(&mut self) {
        let previous_greeting = self
            .preview
            .current()
            .greeting
            .as_ref()
            .map(|(_, text)| text.clone())
            .unwrap_or_default();
        let seed = self.prompt_seed();
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
        if previous_greeting != greeting_text {
            self.invalidate_prompt_lore();
        }
        self.greeting = message_content::Content::new(&greeting_text);
        self.prompt = prompt_preview::build(
            self.preview.character(),
            &self.prompt_settings,
            &seed,
            self.prompt_lore
                .as_ref()
                .and_then(|result| result.as_ref().ok()),
        );
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
    fn invalidate_prompt_lore(&mut self) {
        self.prompt_lore_id += 1;
        self.prompt_lore = None;
        self.prompt_lore_pending = false;
    }

    fn evaluate_prompt_lore(&mut self) -> Task<Message> {
        if self.prompt_lore_pending || !self.preview.current().loaded {
            return Task::none();
        }
        self.prompt_lore_pending = true;
        self.prompt_lore_id += 1;
        let id = self.prompt_lore_id;
        let books = prompt_preview::candidate_books(self.preview.character(), &self.lorebooks)
            .into_iter()
            .map(|book| book.raw.clone())
            .collect();
        let context = prompt_preview::recent_lore_context(self.preview.current(), None);
        Task::perform(
            background(move || Ok(prompt_preview::evaluate_lore(books, &context))),
            move |result| Message::PromptLoreEvaluated { id, result },
        )
    }

    fn send_chat(&mut self) -> Task<Message> {
        let conversation = self.preview.current();
        let draft = conversation.draft.trim();
        if self.page != Page::Chat
            || conversation.is_read_only()
            || draft.is_empty()
            || self.chat_request.is_some()
            || self.profile_busy
        {
            return Task::none();
        }
        let character = self.preview.character();
        let prompt =
            match prompt_preview::prepare(character, &self.prompt_settings, &self.prompt_seed()) {
                Ok(prompt) => prompt,
                Err(error) => {
                    self.notice = error;
                    return Task::none();
                }
            };
        let settings = self.connection.clone();
        let books = prompt_preview::candidate_books(character, &self.lorebooks)
            .into_iter()
            .map(|book| book.raw.clone())
            .collect();
        let lore_context = prompt_preview::recent_lore_context(conversation, Some(draft));
        let draft = draft.to_owned();
        let greeting = conversation.greeting.as_ref().map(|(_, text)| text.clone());
        let messages = conversation.messages.clone();
        self.chat_request_id += 1;
        let id = self.chat_request_id;
        let cancellation = connection::Cancellation::new();
        self.chat_request = Some(connection::ActiveRequest {
            id,
            cancellation: cancellation.clone(),
        });
        self.notice = "Modellantwort wird abgerufen …".into();
        Task::perform(
            background(move || {
                let lore = prompt_preview::evaluate_lore(books, &lore_context);
                let prompt = prompt_preview::render(prompt, Some(&lore));
                let request =
                    chat_request::Request::new(&prompt, greeting.as_deref(), &messages, &draft);
                connection::run_chat(settings, cancellation, request)
            }),
            move |result| Message::ChatFinished { id, result },
        )
    }

    fn cancel_chat(&mut self) {
        if self.chat_request.take().is_some() {
            self.notice = "Modellanfrage abgebrochen. Der Entwurf ist weiterhin verfügbar.".into();
        }
    }
    fn load(&mut self, create: bool) -> Task<Message> {
        if self.card_busy || self.hub.importing.is_some() {
            self.notice = "Bitte den laufenden Import oder Export abwarten.".into();
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
        if self
            .hub
            .store
            .as_ref()
            .is_some_and(|root| profile::hub_store_overlaps(root, &home))
        {
            self.notice =
                "Bitte wähle eine Profilkopie außerhalb des nativen Hub-Speichers.".into();
            return Task::none();
        }
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
            Message::LoreShowRules(value) => self.lore_show_rules = value,
            Message::LoreNumber(number, value) => {
                let index = number as usize;
                self.lore_numbers[index] = value.clone();
                if let Some(draft) = &mut self.lore_draft {
                    self.lore_number_errors[index] = draft
                        .set_number(self.lore_selected_entry, number, &value)
                        .err();
                    self.sync_lore_rule_error();
                }
            }
            Message::LoreScanDepth(value) => {
                self.lore_scan_depth = value.clone();
                if let Some(draft) = &mut self.lore_draft {
                    self.lore_scan_error = draft.set_scan_depth(&value).err();
                    self.sync_lore_rule_error();
                }
            }
            Message::LoreGlobal(value) => {
                if let Some(draft) = &mut self.lore_draft {
                    draft.set_global(value);
                }
            }
            Message::LoreTrigger(value) => {
                if let Some(draft) = &mut self.lore_draft {
                    self.lore_error = draft
                        .set_trigger(self.lore_selected_entry, &value)
                        .err()
                        .unwrap_or_default();
                }
            }
            Message::LoreInjection(value) => {
                if let Some(draft) = &mut self.lore_draft {
                    self.lore_error = draft
                        .set_injection(self.lore_selected_entry, &value)
                        .err()
                        .unwrap_or_default();
                }
            }
            Message::LoreCaseSensitive(value) => {
                if let Some(draft) = &mut self.lore_draft {
                    self.lore_error = draft
                        .set_case_sensitive(self.lore_selected_entry, value)
                        .err()
                        .unwrap_or_default();
                }
            }
            Message::LoreWholeWords(value) => {
                if let Some(draft) = &mut self.lore_draft {
                    self.lore_error = draft
                        .set_whole_words(self.lore_selected_entry, value)
                        .err()
                        .unwrap_or_default();
                }
            }
            Message::ResetLoreRules => {
                self.sync_lore_rules();
                self.lore_error.clear();
            }
            Message::NewLorebook => self.open_lorebook(None),
            Message::EditLorebook(index) => self.open_lorebook(Some(index)),
            Message::LoreName(value) => {
                if let Some(draft) = &mut self.lore_draft {
                    draft.name = value;
                }
            }
            Message::LoreDescription(value) => {
                if let Some(draft) = &mut self.lore_draft {
                    draft.description = value;
                }
            }
            Message::LoreSelectEntry(choice) => {
                if self.lore_rules_invalid() {
                    self.sync_lore_rule_error();
                    return Task::none();
                }
                if self
                    .lore_draft
                    .as_ref()
                    .is_some_and(|draft| choice.0 < draft.count())
                {
                    self.lore_selected_entry = choice.0;
                    self.sync_lore_text();
                    self.sync_lore_rules();
                }
            }
            Message::LoreField(field) => {
                self.lore_field = field;
                self.lore_show_rules = false;
                self.sync_lore_text();
            }
            Message::LoreEntryName(value) => {
                self.lore_entry_name = value.clone();
                if let Some(draft) = &mut self.lore_draft {
                    self.lore_error = draft
                        .set_entry_name(self.lore_selected_entry, value)
                        .err()
                        .unwrap_or_default();
                }
            }
            Message::LoreText(action) => {
                if let Some(draft) = &mut self.lore_draft
                    && self.lore_selected_entry < draft.count()
                {
                    let editing = action.is_edit();
                    self.lore_text.perform(action);
                    if editing {
                        self.lore_error = draft
                            .set_field(
                                self.lore_selected_entry,
                                self.lore_field,
                                self.lore_text.text(),
                            )
                            .err()
                            .unwrap_or_default();
                    }
                }
            }
            Message::LoreEnabled(value) => {
                if let Some(draft) = &mut self.lore_draft {
                    self.lore_error = draft
                        .set_enabled(self.lore_selected_entry, value)
                        .err()
                        .unwrap_or_default();
                }
            }
            Message::LoreAlways(value) => {
                if let Some(draft) = &mut self.lore_draft {
                    self.lore_error = draft
                        .set_always(self.lore_selected_entry, value)
                        .err()
                        .unwrap_or_default();
                }
            }
            Message::AddLoreEntry => {
                if self.lore_rules_invalid() {
                    self.sync_lore_rule_error();
                    return Task::none();
                }
                if let Some(draft) = &mut self.lore_draft {
                    match draft.add_entry() {
                        Ok(index) => {
                            self.lore_selected_entry = index;
                            self.lore_error.clear();
                            self.sync_lore_text();
                            self.sync_lore_rules();
                        }
                        Err(error) => self.lore_error = error,
                    }
                }
            }
            Message::RemoveLoreEntry => {
                if self.lore_rules_invalid() {
                    self.sync_lore_rule_error();
                    return Task::none();
                }
                if let Some(draft) = &mut self.lore_draft {
                    match draft.remove_entry(self.lore_selected_entry) {
                        Ok(()) => {
                            self.lore_selected_entry = self
                                .lore_selected_entry
                                .min(draft.count().saturating_sub(1));
                            self.lore_error.clear();
                            self.sync_lore_text();
                            self.sync_lore_rules();
                        }
                        Err(error) => self.lore_error = error,
                    }
                }
            }
            Message::SaveLorebook => self.save_lorebook(),
            Message::DiscardLorebook => {
                self.lore_draft = None;
                self.lore_error.clear();
                self.page = Page::Lorebooks;
            }
            Message::ExportLoreDraft => {
                if self.lore_rules_invalid() {
                    self.sync_lore_rule_error();
                    return Task::none();
                }
                if let Some(draft) = &self.lore_draft {
                    match draft.apply() {
                        Ok(book) => return self.export_lorebook(book),
                        Err(error) => self.lore_error = error,
                    }
                }
            }
            Message::ExportLorebook(index) => {
                if let Some(book) = self.lorebooks.get(index) {
                    match lore_draft::Draft::from_book(index, book).apply() {
                        Ok(book) => return self.export_lorebook(book),
                        Err(error) => self.notice = error,
                    }
                }
            }
            Message::LorebookExported(result) => {
                self.card_busy = false;
                self.notice = match result {
                    Ok(true) => {
                        "Lorebook-Datei exportiert. Die geladene Profilkopie bleibt unverändert."
                            .into()
                    }
                    Ok(false) => "Lorebook-Export abgebrochen.".into(),
                    Err(error) => format!("Lorebook-Export fehlgeschlagen: {error}"),
                };
            }
            Message::ImportLorebook => {
                if self.card_busy || self.profile_busy {
                    return Task::none();
                }
                self.card_busy = true;
                self.notice = "Lorebook-Datei auswählen …".into();
                return Task::perform(
                    async {
                        let Some(file) = rfd::AsyncFileDialog::new()
                            .set_title("Lorebook lesend laden")
                            .add_filter("Lorebook-JSON", &["json"])
                            .pick_file()
                            .await
                        else {
                            return Ok(None);
                        };
                        let path = file.path().to_path_buf();
                        background(move || lore_catalog::Book::read(&path))
                            .await
                            .map(Some)
                    },
                    Message::LorebookImported,
                );
            }
            Message::LorebookImported(result) => {
                self.card_busy = false;
                self.notice = match result {
                    Ok(Some(book)) => {
                        if let Some(index) = self.existing_lorebook(&book) {
                            self.lorebook_selected = Some(index);
                            "Ein Lorebook mit dieser Referenz ist bereits geladen; es wurde nicht ersetzt.".into()
                        } else {
                            self.lorebook_selected = Some(self.lorebooks.len());
                            self.add_lorebook(book);
                            "Lorebook lesend in den Arbeitsspeicher geladen. Keine automatische Bindung oder Promptaktivierung.".into()
                        }
                    }
                    Ok(None) => "Lorebook-Auswahl abgebrochen.".into(),
                    Err(error) => format!("Lorebook konnte nicht geladen werden: {error}"),
                };
            }
            Message::InspectLorebook(index) => {
                if index < self.lorebooks.len() {
                    self.lorebook_selected = Some(index);
                    self.lore_entry_search.clear();
                    self.page = Page::LorebookDetails;
                }
            }
            Message::CopyLorebook(index) => {
                if let Some(book) = self.lorebooks.get(index) {
                    return iced::clipboard::write(
                        serde_json::to_string_pretty(&book.raw).unwrap_or_default(),
                    );
                }
            }
            Message::CopyEmbeddedLorebook => {
                if let Some(book) = self.embedded_lorebook() {
                    return iced::clipboard::write(
                        serde_json::to_string_pretty(book).unwrap_or_default(),
                    );
                }
            }
            Message::LoreEntrySearch(value) => self.lore_entry_search = value,
            Message::LoreReferenceInput(value) => self.lore_reference_input = value,
            Message::AddLoreReference => {
                let reference = self.lore_reference_input.trim();
                if !reference.is_empty()
                    && reference != "None"
                    && let Some(draft) = &mut self.character_draft
                {
                    let mut bindings = draft.bound_lorebooks().to_vec();
                    bindings.push(reference.to_owned());
                    draft.set_bound_lorebooks(bindings);
                    self.lore_reference_input.clear();
                }
            }
            Message::RemoveLoreReference(index) => {
                if let Some(draft) = &mut self.character_draft {
                    let mut bindings = draft.bound_lorebooks().to_vec();
                    if index < bindings.len() {
                        bindings.remove(index);
                        draft.set_bound_lorebooks(bindings);
                    }
                }
            }
            Message::ToggleLorebook(index) => {
                if let (Some(book), Some(draft)) =
                    (self.lorebooks.get(index), &mut self.character_draft)
                {
                    let mut bindings = draft.bound_lorebooks().to_vec();
                    if bindings
                        .iter()
                        .any(|reference| book.matches_reference(reference))
                    {
                        bindings.retain(|reference| !book.matches_reference(reference));
                    } else {
                        bindings.push(book.binding_key().to_owned());
                    }
                    draft.set_bound_lorebooks(bindings);
                }
            }
            Message::ExpressionSlot(slot) => {
                self.expression_slot = slot;
                return self.load_expression_preview();
            }
            Message::PickExpression => {
                if self.card_busy || self.profile_busy || self.character_draft.is_none() {
                    return Task::none();
                }
                self.card_busy = true;
                let draft_id = self.character_draft_id;
                let slot = self.expression_slot;
                return Task::perform(
                    async move {
                        let Some(file) = rfd::AsyncFileDialog::new()
                            .set_title("Ausdrucksbild auswählen")
                            .add_filter("PNG-/WebP-Bild", &["png", "webp"])
                            .pick_file()
                            .await
                        else {
                            return Ok(None);
                        };
                        let path = file.path().to_path_buf();
                        background(move || expressions::pick_image(&path))
                            .await
                            .map(Some)
                    },
                    move |result| Message::ExpressionPicked {
                        draft_id,
                        slot,
                        result,
                    },
                );
            }
            Message::ExpressionPicked {
                draft_id,
                slot,
                result,
            } => {
                self.card_busy = false;
                if draft_id != self.character_draft_id || self.character_draft.is_none() {
                    return Task::none();
                }
                match result {
                    Ok(Some(reference)) => match self.set_draft_expression(slot, Some(reference)) {
                        Ok(()) => {
                            self.sync_character_text();
                            if self.editor_tab == EditorTab::Expressions {
                                return self.load_expression_preview();
                            }
                        }
                        Err(error) => self.character_error = error,
                    },
                    Ok(None) => self.notice = "Bildauswahl abgebrochen.".into(),
                    Err(error) => self.character_error = error,
                }
            }
            Message::RemoveExpression => {
                if !self.card_busy {
                    match self.set_draft_expression(self.expression_slot, None) {
                        Ok(()) => return self.load_expression_preview(),
                        Err(error) => self.character_error = error,
                    }
                }
            }
            Message::ExpressionAsPortrait => {
                if let (Some(draft), Some(bytes)) =
                    (&mut self.character_draft, &self.expression_bytes)
                {
                    draft.set_portrait(bytes.clone());
                    self.notice = "Hauptporträt im Entwurf geändert. PNG-Export enthält dieses Bild; JSON enthält nur die Ausdruckszuordnung.".into();
                }
            }
            Message::ExpressionPreview { id, result } => {
                if id != self.expression_epoch
                    || self.editor_tab != EditorTab::Expressions
                    || self.character_draft.is_none()
                {
                    return Task::none();
                }
                match result {
                    Ok(bytes) => {
                        self.expression_image = Some(image::Handle::from_bytes(bytes.clone()));
                        self.expression_bytes = Some(bytes);
                        self.expression_status =
                            "Ausdrucksbild · lokale Vorschau ohne Netzwerk.".into();
                    }
                    Err(error) => self.expression_status = error,
                }
            }
            Message::EditorTabChanged(tab) => {
                self.editor_tab = tab;
                self.character_error.clear();
                if tab == EditorTab::Expressions {
                    return self.load_expression_preview();
                }
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
                    && self.chat_request.is_none()
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
                        self.add_imported_character(character);
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
            Message::StageFilter(filter) => {
                self.stage.filter = filter;
                self.stage.selected = None;
                self.stage.opening = false;
            }
            Message::StageSelect(index) => {
                if self.stage.scenes.get(index).is_some() {
                    self.stage.selected = Some(index);
                    self.stage.opening = false;
                }
            }
            Message::StageBack => {
                if self.stage.opening {
                    self.stage.opening = false;
                } else {
                    self.stage.selected = None;
                }
            }
            Message::StageOpening => {
                if self.stage.selected.is_some() {
                    self.stage.opening = true;
                }
            }
            Message::StageBrowseHub => {
                self.hub.kind = hub_catalog::Kind::Scenes;
                return self.update(Message::Navigate(Page::Hub));
            }
            Message::HubScenePreview(id) => return self.preview_hub_scene(id),
            Message::HubSceneLoaded(id, generation, result) => {
                if self.stage.hub_loading.as_deref() != Some(&id) {
                    return Task::none();
                }
                self.stage.hub_loading = None;
                match result {
                    Ok(scene) => {
                        let index = self.stage.scenes.len();
                        self.stage.scenes.push(scene);
                        if self.page == Page::Hub
                            && self.hub.cover_generation == generation
                            && self
                                .hub
                                .contains_visible_entry(hub_catalog::Kind::Scenes, &id)
                        {
                            self.show_hub_scene(index);
                        }
                        self.stage.from_hub.insert(id, index);
                    }
                    Err(error) => {
                        self.stage.hub_notice =
                            ui_text::format("hub.loadError", &[("error", &error)]);
                    }
                }
            }
            Message::HubKind(kind) => {
                self.hub.kind = kind;
                self.hub.world = None;
                self.hub.reset_cover_requests();
                if !self.hub.catalog.contains_key(&kind) {
                    return self.load_hub(kind);
                }
            }
            Message::HubSearch(query) => {
                self.hub.query = query;
                self.hub.reset_cover_requests();
            }
            Message::HubReload(kind) => {
                if kind == hub_catalog::Kind::Worlds {
                    self.hub.covers.retry_failed();
                    self.hub.reset_cover_requests();
                }
                return self.load_hub(kind);
            }
            Message::HubRefresh => {
                self.hub.covers.retry_failed();
                self.hub.reset_cover_requests();
                return self.load_hub_catalogs(true);
            }
            Message::HubLoaded(kind, result) => {
                self.hub.loading.remove(&kind);
                match result {
                    Ok(entries) => {
                        self.hub.catalog.insert(kind, entries);
                        if kind == hub_catalog::Kind::Worlds && self.hub.world.is_none() {
                            self.hub.reset_cover_requests();
                        }
                    }
                    Err(error) => {
                        self.hub.errors.insert(kind, error);
                    }
                }
            }
            Message::HubOpenWorld(id) => return self.open_hub_world(&id),
            Message::HubCloseWorld => {
                self.hub.world = None;
                self.hub.reset_cover_requests();
            }
            Message::HubCoverVisible(generation, id, address, visible) => {
                if generation != self.hub.cover_generation
                    || self.page != Page::Hub
                    || self.hub.kind != hub_catalog::Kind::Worlds
                    || self.hub.world.is_some()
                {
                    return Task::none();
                }
                if visible {
                    self.hub.visible_covers.insert(id, address.clone());
                    self.hub.covers.request(address);
                    return self.load_hub_covers();
                }
                self.hub.visible_covers.remove(&id);
                if !self
                    .hub
                    .visible_covers
                    .values()
                    .any(|visible| visible == &address)
                {
                    self.hub.covers.hide(&address);
                }
            }
            Message::HubCoverLoaded(address, cover) => {
                self.hub.covers.complete(address, cover);
                return self.load_hub_covers();
            }
            Message::HubLibraryLoaded(result) => {
                self.hub.library_loading = false;
                self.hub.library_notice = match result {
                    Ok(library) => {
                        for (key, content) in library.entries {
                            self.register_hub_content(key, content);
                        }
                        if library.unreadable == 0 {
                            String::new()
                        } else {
                            ui_text::format(
                                "hub.native.storePartial",
                                &[("count", &library.unreadable.to_string())],
                            )
                        }
                    }
                    Err(error) => ui_text::format("hub.loadError", &[("error", &error)]),
                };
            }
            Message::HubImport(kind, id) => return self.import_hub(kind, id),
            Message::HubImported(result) => {
                let Some(key) = self.hub.importing.take() else {
                    return Task::none();
                };
                self.hub.notice = match result {
                    Ok(HubImportResult::Installed(content)) => {
                        self.register_hub_content(key, content)
                    }
                    Ok(HubImportResult::UpdateStored(revision)) => {
                        if let Some(installed) = self.hub.installed.get_mut(&key) {
                            installed.revision = revision;
                            installed.pending_restart = true;
                        }
                        ui_text::text("hub.native.updateStored").into()
                    }
                    Err(error) => ui_text::format("hub.importFailed", &[("error", &error)]),
                };
            }
            Message::NewCharacter => self.open_character(None, false),
            Message::EditCharacter(index) => self.open_character(Some(index), false),
            Message::DuplicateCharacter(index) => self.open_character(Some(index), true),
            Message::InspectCharacter(index) => {
                let previous = self.preview.selected;
                self.preview.select_character(index);
                if previous != self.preview.selected {
                    self.search.clear();
                }
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
                if matches!(
                    self.editor_tab,
                    EditorTab::Expressions | EditorTab::Lorebooks
                ) {
                    return Task::none();
                }
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
                        EditorTab::Expressions => unreachable!(),
                        EditorTab::Lorebooks => unreachable!(),
                    }
                }
            }
            Message::DiscardCharacter => {
                self.character_draft = None;
                self.character_draft_id += 1;
                self.expression_image = None;
                self.expression_bytes = None;
                self.character_error.clear();
                self.page = Page::Characters;
            }
            Message::SaveCharacter => self.save_character(),
            Message::Navigate(page) => {
                self.hub.world = None;
                self.hub.reset_cover_requests();
                if page != Page::Chat {
                    self.cancel_chat();
                }
                if page == Page::Prompt {
                    self.refresh_prompt();
                }
                if page == Page::Stage {
                    self.stage.selected = None;
                    self.stage.opening = false;
                }
                self.page = page;
                if page == Page::Hub {
                    return self.load_hub_catalogs(false);
                }
            }
            Message::SelectCharacter(index) => {
                let previous = self.preview.selected;
                self.preview.select_character(index);
                if previous != self.preview.selected {
                    self.search.clear();
                }
                self.page = Page::Chat;
                self.sync_editor();
                return self.load_current();
            }
            Message::SelectConversation(index) => {
                if index < self.preview.conversations.len() {
                    if index != self.preview.selected {
                        self.search.clear();
                    }
                    self.preview.selected = index;
                    self.show_sessions = false;
                    self.sync_editor();
                    return self.load_current();
                }
            }
            Message::Edit(action) => {
                if !self.preview.current().is_read_only() && self.chat_request.is_none() {
                    self.editor.perform(action);
                    self.preview.current_mut().draft = self.editor.text();
                }
            }
            Message::Submit => {
                if self.chat_request.is_some() {
                    return Task::none();
                }
                self.preview.submit();
                self.sync_editor();
                return iced::widget::operation::snap_to_end("conversation");
            }
            Message::SendChat => return self.send_chat(),
            Message::CancelChat => self.cancel_chat(),
            Message::ChatFinished { id, result } => {
                if self.chat_request.as_ref().map(|active| active.id) != Some(id) {
                    return Task::none();
                }
                self.chat_request = None;
                match result {
                    Ok(answer) => {
                        self.preview.submit();
                        let conversation = self.preview.current_mut();
                        conversation.messages.push(StoredMessage {
                            role: "assistant".into(),
                            content: answer,
                        });
                        conversation.message_count = conversation.messages.len();
                        self.notice =
                            "Modellantwort erhalten. Der Testchat bleibt im Arbeitsspeicher."
                                .into();
                        self.sync_editor();
                        return iced::widget::operation::snap_to_end("conversation");
                    }
                    Err(error) => self.notice = error,
                }
            }
            Message::Clear => {
                if self.chat_request.is_some() {
                    return Task::none();
                }
                self.preview.clear();
                self.search.clear();
                self.sync_editor();
            }
            Message::LocalChat => {
                self.show_sessions = false;
                let previous = self.preview.selected;
                self.preview.select_local();
                if previous != self.preview.selected {
                    self.search.clear();
                }
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
            Message::OpenSearch => {
                if self.page == Page::Chat {
                    self.show_search = true;
                    return iced::widget::operation::focus("chat-search");
                }
            }
            Message::ClearSearch => {
                self.search.clear();
                return iced::widget::operation::focus("chat-search");
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
            Message::EvaluatePromptLore => return self.evaluate_prompt_lore(),
            Message::PromptLoreEvaluated { id, result } => {
                if self.prompt_lore_pending && id == self.prompt_lore_id {
                    self.prompt_lore_pending = false;
                    self.prompt_lore = Some(result);
                    self.refresh_prompt();
                }
            }
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
                self.diagnostic = Some(connection::ActiveRequest {
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
                        let installed = std::mem::take(&mut self.preview.characters)
                            .into_iter()
                            .filter(|character| {
                                self.hub.installed_character_ids.contains(&character.id)
                            });
                        self.preview = Preview::from_profile(profile);
                        let installed = installed.collect::<Vec<_>>();
                        self.hub.installed_character_ids.clear();
                        for mut character in installed {
                            if self
                                .preview
                                .characters
                                .iter()
                                .any(|existing| existing.id == character.id)
                            {
                                character.id = self.fresh_character_id();
                            }
                            self.hub
                                .installed_character_ids
                                .insert(character.id.clone());
                            self.preview.add_character(character);
                        }
                        self.search.clear();
                        self.show_search = false;
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
    #[ignore = "benötigt Zugriff auf den öffentlichen OtakuSoul-Katalog"]
    fn public_hub_registries_and_imports_work_live() {
        use hub_catalog::Kind;
        let directory = tempfile::tempdir().unwrap();
        let mut app = App {
            page: Page::Hub,
            ..App::default()
        };
        app.hub.store = Some(directory.path().to_path_buf());
        for kind in Kind::ALL {
            let entries = hub_catalog::load(kind).unwrap();
            assert!(!entries.is_empty(), "{kind:?}");
            if kind == Kind::Scenes {
                let entry = entries
                    .iter()
                    .find(|entry| entry.can_preview_scene())
                    .unwrap();
                let scene = download_hub_scene(entry).unwrap();
                assert_eq!(scene.id, entry.id);
                assert!(!scene.title("de").is_empty());
            }
            if let Some(entry) = entries.iter().find(|entry| entry.can_import()) {
                let HubImportResult::Installed(installed) =
                    import_hub_content(directory.path(), None, kind, entry, false).unwrap()
                else {
                    panic!("Erstimport muss einen Bibliothekseintrag liefern");
                };
                assert_eq!(installed.revision, entry.revision);
                match installed.content {
                    HubContent::Character(character) => {
                        assert!(!character.name.is_empty());
                        assert!(character.portrait.is_some());
                    }
                    HubContent::Lorebook(book) => assert!(!book.entries.is_empty()),
                }
                if kind == Kind::Lorebooks && entry.revision > 1 {
                    let update_directory = tempfile::tempdir().unwrap();
                    let mut earlier = hub_store::list(directory.path())
                        .unwrap()
                        .into_iter()
                        .find(|item| item.kind == kind && item.id == entry.id)
                        .unwrap();
                    earlier.revision -= 1;
                    hub_store::install(update_directory.path(), &earlier).unwrap();
                    assert!(matches!(
                        import_hub_content(update_directory.path(), None, kind, entry, true).unwrap(),
                        HubImportResult::UpdateStored(revision) if revision == entry.revision
                    ));
                    println!(
                        "Lorebook-Update von Revision {} auf {}",
                        earlier.revision, entry.revision
                    );
                }
            } else {
                assert!(matches!(
                    kind,
                    hub_catalog::Kind::Worlds | hub_catalog::Kind::Scenes
                ));
            }
            println!("{kind:?}: {} Katalogeinträge", entries.len());
            app.hub.catalog.insert(kind, entries);
        }
        let world = app.hub.catalog[&Kind::Worlds]
            .iter()
            .find(|world| world.cover.is_some() && !world.members.is_empty())
            .unwrap();
        let id = world.id.clone();
        let address = world.cover.clone().unwrap();
        let cover = hub_cover::load(address.clone()).unwrap();
        let gallery_generation = app.hub.cover_generation;
        let _ = app.update(Message::HubCoverVisible(
            gallery_generation,
            id.clone(),
            address.clone(),
            true,
        ));
        let _ = app.update(Message::HubOpenWorld(id.clone()));
        let selected = app.hub.world.as_ref().unwrap();
        assert_eq!(selected.entry.id, id);
        let member = selected
            .entry
            .members
            .iter()
            .find(|member| {
                app.hub.catalog[&member.kind]
                    .iter()
                    .any(|entry| entry.id == member.id && entry.can_import())
            })
            .unwrap()
            .clone();
        let _ = app.update(Message::HubCoverVisible(
            gallery_generation,
            id,
            address.clone(),
            true,
        ));
        assert!(app.hub.visible_covers.is_empty());
        let _ = app.update(Message::HubCoverLoaded(address.clone(), Some(cover)));
        assert!(app.hub.covers.get(&address).is_some());
        let _ = app.update(Message::HubImport(member.kind, member.id.clone()));
        assert_eq!(app.hub.importing, Some((member.kind, member.id)));
        let _ = app.update(Message::HubCloseWorld);
        assert!(app.hub.covers.get(&address).is_some());
        let restored = HubLibrary::read(directory.path()).unwrap();
        assert_eq!(restored.unreadable, 0);
        assert_eq!(restored.entries.len(), 2);
        let mut reopened = App::default();
        let _ = reopened.update(Message::HubLibraryLoaded(Ok(restored)));
        assert_eq!(reopened.hub.installed.len(), 2);
        assert_eq!(reopened.preview.characters.len(), 5);
        assert_eq!(reopened.lorebooks.len(), 1);
    }

    #[test]
    fn opening_and_refreshing_hub_loads_all_counts_without_discarding_the_catalog() {
        use hub_catalog::Kind;
        let mut app = App::default();
        let _ = app.update(Message::Navigate(Page::Hub));
        assert_eq!(app.hub.loading.len(), Kind::ALL.len());
        for kind in Kind::ALL {
            let _ = app.update(Message::HubLoaded(kind, Ok(Vec::new())));
        }
        assert!(app.hub.loading.is_empty());
        let _ = app.update(Message::HubRefresh);
        assert_eq!(app.hub.loading.len(), Kind::ALL.len());
        assert_eq!(app.hub.catalog.len(), Kind::ALL.len());
    }

    #[test]
    fn stage_opening_returns_to_the_same_story_and_collection() {
        let mut app = App::default();
        let _ = app.update(Message::Navigate(Page::Stage));
        let collection = StageFilter::Collection(stage_preview::Collection::Starter);
        let _ = app.update(Message::StageFilter(collection));
        let _ = app.update(Message::StageSelect(0));
        let _ = app.update(Message::StageOpening);
        assert!(app.stage.opening);
        let _ = app.update(Message::StageBack);
        assert_eq!(app.stage.selected, Some(0));
        assert!(!app.stage.opening);
        let _ = app.update(Message::StageBack);
        assert_eq!(app.stage.selected, None);
        assert_eq!(app.stage.filter, collection);
    }

    #[test]
    fn late_hub_scene_is_cached_without_leaving_the_current_page() {
        let mut app = App::default();
        let _ = app.update(Message::Navigate(Page::Hub));
        let id = "hub-scene".to_owned();
        app.stage.hub_loading = Some(id.clone());
        let generation = app.hub.cover_generation;
        let _ = app.update(Message::Navigate(Page::Chat));
        let scene = stage_preview::parse_hub(
            serde_json::json!({"title": "Hub-Szene", "description": "Vorschau"}),
            &id,
            "",
        )
        .unwrap();
        let _ = app.update(Message::HubSceneLoaded(id.clone(), generation, Ok(scene)));
        assert_eq!(app.page, Page::Chat);
        assert_eq!(app.stage.scenes[app.stage.from_hub[&id]].id, id);
    }

    #[test]
    fn imported_hub_characters_survive_loading_a_profile_copy_with_a_colliding_id() {
        use hub_catalog::Kind;
        let mut app = App::default();
        let character = |id: &str, name: &str| profile::ProfileCharacter {
            id: id.into(),
            name: name.into(),
            description: String::new(),
            first_message: String::new(),
            card: serde_json::json!({"name":name}),
            portrait: None,
        };
        let key = (Kind::Characters, "Hub-Figur".into());
        let _ = app.update(Message::HubLibraryLoaded(Ok(HubLibrary {
            entries: vec![(
                key.clone(),
                HubInstalledContent {
                    revision: 1,
                    content: HubContent::Character(character("registry", "Hub-Figur")),
                },
            )],
            unreadable: 0,
        })));
        let hub_id = app
            .hub
            .installed_character_ids
            .iter()
            .next()
            .unwrap()
            .clone();
        let _ = app.update(Message::ProfileLoaded(
            "isolierte-kopie".into(),
            Ok(Profile {
                characters: vec![character(&hub_id, "Figur aus Profilkopie")],
                sessions: Vec::new(),
                warnings: Vec::new(),
            }),
        ));
        assert_eq!(app.preview.characters.len(), 2);
        assert_eq!(app.preview.characters[0].id, hub_id);
        let stored = &app.preview.characters[1];
        assert_eq!(stored.name, "Hub-Figur");
        assert_ne!(stored.id, hub_id);
        assert!(app.hub.installed_character_ids.contains(&stored.id));
        assert!(app.hub.installed.contains_key(&key));
    }

    #[test]
    fn hub_import_does_not_replace_an_existing_lorebook() {
        let mut app = App::default();
        let kind = hub_catalog::Kind::Lorebooks;
        app.hub.importing = Some((kind, "Welt".into()));
        let make_book = |content| {
            lore_catalog::Book::from_json(
                serde_json::json!({"id":"welt","name":"Welt","entries":[{"content":content}]}),
                "Hub/welt.json".into(),
                "Welt",
            )
            .unwrap()
        };
        app.lorebooks.push(make_book("Eigener Entwurf"));
        let _ = app.update(Message::HubImported(Ok(HubImportResult::Installed(
            HubInstalledContent {
                revision: 1,
                content: HubContent::Lorebook(make_book("Serverversion")),
            },
        ))));
        assert_eq!(app.lorebooks.len(), 1);
        assert_eq!(app.lorebooks[0].entries[0].content, "Eigener Entwurf");
        assert!(app.hub.installed.contains_key(&(kind, "Welt".into())));
    }

    #[test]
    fn hub_update_keeps_the_active_editor_and_loads_the_new_revision_on_restart() {
        let store = tempfile::tempdir().unwrap();
        let kind = hub_catalog::Kind::Lorebooks;
        let key = (kind, String::from("Welt"));
        let item = |revision, name| hub_store::Item {
            kind,
            id: key.1.clone(),
            revision,
            title: "Welt".into(),
            filename: "welt.json".into(),
            bytes: serde_json::to_vec(&serde_json::json!({
                "id":"welt", "name": name, "entries":[]
            }))
            .unwrap(),
        };
        hub_store::install(store.path(), &item(1, "Original")).unwrap();
        let mut app = App::default();
        let _ = app.update(Message::HubLibraryLoaded(HubLibrary::read(store.path())));
        assert_eq!(app.hub.entry_state(&key, 1), HubEntryState::Installed);
        assert_eq!(app.hub.entry_state(&key, 2), HubEntryState::UpdateAvailable);
        let _ = app.update(Message::EditLorebook(0));
        let _ = app.update(Message::LoreName("Eigener Entwurf".into()));
        app.hub.importing = Some(key.clone());
        let revision = hub_store::update(store.path(), &item(2, "Neue Fassung")).unwrap();
        let _ = app.update(Message::HubImported(Ok(HubImportResult::UpdateStored(
            revision,
        ))));
        assert_eq!(app.hub.entry_state(&key, 2), HubEntryState::PendingRestart);
        assert_eq!(app.page, Page::LorebookEditor);
        assert_eq!(app.lorebooks[0].name, "Original");
        let _ = app.update(Message::SaveLorebook);
        assert_eq!(app.lorebooks[0].name, "Eigener Entwurf");

        let mut reopened = App::default();
        let _ = reopened.update(Message::HubLibraryLoaded(HubLibrary::read(store.path())));
        assert_eq!(reopened.hub.entry_state(&key, 2), HubEntryState::Installed);
        assert_eq!(reopened.lorebooks[0].name, "Neue Fassung");
    }

    #[test]
    fn model_chat_only_commits_the_draft_and_reply_on_success() {
        let mut app = App::default();
        app.preview.current_mut().draft = "  Neue Frage ".into();
        let _ = app.update(Message::SendChat);
        let id = app.chat_request.as_ref().unwrap().id;
        let _ = app.update(Message::Submit);
        assert!(app.preview.current().messages.is_empty());
        let _ = app.update(Message::ChatFinished {
            id,
            result: Err("Testfehler".into()),
        });
        assert_eq!(app.preview.current().draft, "  Neue Frage ");
        assert!(app.preview.current().messages.is_empty());
        assert_eq!(app.notice, "Testfehler");

        let _ = app.update(Message::SendChat);
        let id = app.chat_request.as_ref().unwrap().id;
        let _ = app.update(Message::ChatFinished {
            id,
            result: Ok("Antwort".into()),
        });
        let chat = app.preview.current();
        assert!(chat.draft.is_empty());
        assert_eq!(chat.message_count, 2);
        assert_eq!(chat.messages[0].role, "user");
        assert_eq!(chat.messages[0].content, "Neue Frage");
        assert_eq!(chat.messages[1].role, "assistant");
        assert_eq!(chat.messages[1].content, "Antwort");
    }

    #[test]
    fn switching_chat_cancels_the_request_and_ignores_its_late_answer() {
        let mut app = App::default();
        app.preview.current_mut().draft = "Entwurf für Shiori".into();
        let _ = app.update(Message::SendChat);
        let id = app.chat_request.as_ref().unwrap().id;
        let _ = app.update(Message::SelectCharacter(1));
        let _ = app.update(Message::ChatFinished {
            id,
            result: Ok("Verspätete Antwort".into()),
        });
        assert!(app.chat_request.is_none());
        assert!(app.preview.current().messages.is_empty());
        let _ = app.update(Message::SelectCharacter(0));
        assert_eq!(app.preview.current().draft, "Entwurf für Shiori");
        assert!(app.preview.current().messages.is_empty());
    }

    #[test]
    fn archived_conversations_cannot_start_model_requests() {
        let mut app = App::default();
        let archive = app.preview.current_mut();
        archive.source_id = Some("archiv".into());
        archive.draft = "Darf nicht gesendet werden".into();
        let _ = app.update(Message::SendChat);
        assert!(app.chat_request.is_none());
    }

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
            diagnostic: Some(connection::ActiveRequest {
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
    fn lore_evaluation_for_a_previous_chat_is_discarded() {
        let mut app = App::default();
        let _ = app.update(Message::EvaluatePromptLore);
        let previous_id = app.prompt_lore_id;
        assert!(app.prompt_lore_pending);
        let _ = app.update(Message::SelectCharacter(1));
        let _ = app.update(Message::EvaluatePromptLore);
        let _ = app.update(Message::PromptLoreEvaluated {
            id: previous_id,
            result: Ok(prompt_preview::LoreReport {
                books: 1,
                passive: vec![],
                active: vec![],
            }),
        });
        assert!(app.prompt_lore_pending);
        assert!(app.prompt_lore.is_none());
    }
    #[test]
    fn resetting_search_preserves_messages_draft_and_nonchat_views() {
        let mut app = App::default();
        app.preview.current_mut().draft = "Offener Entwurf".into();
        app.preview.current_mut().messages.push(StoredMessage {
            role: "user".into(),
            content: "Nachricht".into(),
        });
        let _ = app.update(Message::OpenSearch);
        let _ = app.update(Message::SearchChanged("nicht gefunden".into()));
        let _ = app.update(Message::ClearSearch);
        assert!(app.show_search);
        assert!(app.search.is_empty());
        assert_eq!(app.preview.current().draft, "Offener Entwurf");
        assert_eq!(app.preview.current().messages.len(), 1);
        app.page = Page::Lorebooks;
        app.show_search = false;
        let _ = app.update(Message::OpenSearch);
        assert_eq!(app.page, Page::Lorebooks);
        assert!(!app.show_search);
    }

    #[test]
    fn search_resets_only_when_switching_to_another_conversation() {
        let mut app = App::default();
        let _ = app.update(Message::SearchChanged("alte Suche".into()));
        let _ = app.update(Message::SelectCharacter(1));
        assert!(app.search.is_empty());
        let _ = app.update(Message::SearchChanged("neue Suche".into()));
        let _ = app.update(Message::SelectCharacter(1));
        assert_eq!(app.search, "neue Suche");
        let _ = app.update(Message::ToggleSearch);
        let _ = app.update(Message::ToggleSearch);
        assert!(app.search.is_empty());
    }
    #[test]
    fn invalid_rule_numbers_block_save_export_and_entry_changes_until_reset() {
        let mut app = App::default();
        app.lorebooks.push(lorebook_fixture("Original"));
        let _ = app.update(Message::EditLorebook(0));
        let _ = app.update(Message::LoreNumber(
            lore_draft::Number::Priority,
            "-9".into(),
        ));
        let _ = app.update(Message::LoreNumber(
            lore_draft::Number::Probability,
            "101".into(),
        ));
        let _ = app.update(Message::SaveLorebook);
        let _ = app.update(Message::ExportLoreDraft);
        let _ = app.update(Message::AddLoreEntry);
        assert!(!app.card_busy);
        assert!(app.lore_draft.is_some());
        assert_eq!(app.lore_draft.as_ref().unwrap().count(), 1);
        assert_eq!(
            app.lore_numbers[lore_draft::Number::Probability as usize],
            "101"
        );
        let _ = app.update(Message::ResetLoreRules);
        assert!(!app.lore_rules_invalid());
        let _ = app.update(Message::SaveLorebook);
        assert_eq!(app.lorebooks[0].raw["entries"][0]["priority"], -9);
        assert!(
            app.lorebooks[0].raw["entries"][0]
                .get("probability")
                .is_none()
        );
    }

    #[test]
    fn scan_errors_survive_other_valid_inputs_and_cannot_be_lost_on_entry_switch() {
        let mut app = App::default();
        app.lorebooks.push(lorebook_fixture("Original"));
        let _ = app.update(Message::EditLorebook(0));
        let _ = app.update(Message::AddLoreEntry);
        assert_eq!(app.lore_selected_entry, 1);
        let _ = app.update(Message::LoreScanDepth("-1".into()));
        let _ = app.update(Message::LoreNumber(
            lore_draft::Number::Probability,
            "10".into(),
        ));
        let _ = app.update(Message::LoreSelectEntry(LoreEntryChoice(0, "Ort".into())));
        assert_eq!(app.lore_selected_entry, 1);
        assert!(app.lore_rules_invalid());
        let _ = app.update(Message::LoreScanDepth("0".into()));
        assert!(!app.lore_rules_invalid());
        let _ = app.update(Message::LoreSelectEntry(LoreEntryChoice(0, "Ort".into())));
        assert_eq!(app.lore_selected_entry, 0);
        let _ = app.update(Message::SaveLorebook);
        assert_eq!(app.lorebooks[0].raw["scan_depth"], 0);
        assert_eq!(app.lorebooks[0].raw["entries"][1]["probability"], 10);
    }

    #[test]
    fn rule_controls_store_metadata_without_activating_chat_context() {
        let mut app = App::default();
        app.lorebooks.push(lorebook_fixture("Original"));
        let _ = app.update(Message::EditLorebook(0));
        let _ = app.update(Message::LoreTrigger("regex".into()));
        let _ = app.update(Message::LoreInjection("active".into()));
        let _ = app.update(Message::LoreCaseSensitive(true));
        let _ = app.update(Message::LoreWholeWords(true));
        let _ = app.update(Message::LoreGlobal(true));
        let _ = app.update(Message::LoreField(lore_draft::Field::ChainRequires));
        let _ = app.update(Message::LoreText(text_editor::Action::Edit(
            text_editor::Edit::Insert('7'),
        )));
        let _ = app.update(Message::SaveLorebook);
        let raw = &app.lorebooks[0].raw;
        assert_eq!(raw["is_global"], true);
        assert_eq!(raw["entries"][0]["trigger_type"], "regex");
        assert_eq!(raw["entries"][0]["injection_behavior"], "active");
        assert_eq!(raw["entries"][0]["case_sensitive"], true);
        assert_eq!(raw["entries"][0]["match_whole_words"], true);
        assert_eq!(
            raw["entries"][0]["chain_requires"],
            serde_json::json!(["7"])
        );
        assert!(app.preview.current().messages.is_empty());
    }

    #[test]
    fn lorebook_edits_stay_with_their_target_until_saved() {
        let mut app = App::default();
        app.lorebooks.push(lorebook_fixture("Original"));
        let _ = app.update(Message::EditLorebook(0));
        let _ = app.update(Message::LoreText(text_editor::Action::SelectAll));
        let _ = app.update(Message::LoreText(text_editor::Action::Edit(
            text_editor::Edit::Insert('X'),
        )));
        assert_eq!(app.lorebooks[0].entries[0].content, "Original");
        let _ = app.update(Message::SelectCharacter(1));
        let _ = app.update(Message::SaveLorebook);
        assert!(app.lorebooks[0].entries[0].content.contains('X'));
        assert_eq!(app.lorebooks[0].id, "book-1");
    }

    #[test]
    fn selecting_text_does_not_normalize_legacy_keyword_fields() {
        let mut app = App::default();
        let raw = serde_json::json!({"id":"legacy","name":"Legacy","entries":[{"name":"Ort","key":"A, B","content":"Text","foreign":42}]});
        app.lorebooks
            .push(lore_catalog::Book::from_json(raw, "legacy.json".into(), "Fallback").unwrap());
        let _ = app.update(Message::EditLorebook(0));
        let _ = app.update(Message::LoreField(lore_draft::Field::Keys));
        let _ = app.update(Message::LoreText(text_editor::Action::SelectAll));
        let projected = app.lore_draft.as_ref().unwrap().apply().unwrap();
        assert_eq!(projected.raw["entries"][0]["key"], "A, B");
        assert_eq!(projected.raw["entries"][0]["foreign"], 42);
    }

    #[test]
    fn invalid_or_colliding_lorebook_drafts_do_not_open_exports_or_replace_books() {
        let mut app = App::default();
        let _ = app.update(Message::NewLorebook);
        let _ = app.update(Message::ExportLoreDraft);
        assert!(!app.card_busy);
        assert!(!app.lore_error.is_empty());
        let _ = app.update(Message::LoreName("Neues Buch".into()));
        let duplicate = lore_catalog::Book::from_json(
            serde_json::json!({"id":"native-lorebook-1","name":"Importiert","entries":[]}),
            "import.json".into(),
            "Fallback",
        )
        .unwrap();
        let _ = app.update(Message::LorebookImported(Ok(Some(duplicate))));
        let _ = app.update(Message::SaveLorebook);
        assert_eq!(app.lorebooks.len(), 1);
        assert_eq!(app.lorebooks[0].name, "Importiert");
        assert!(app.lore_draft.is_some());
        assert!(!app.lore_error.is_empty());
    }

    #[test]
    fn opening_another_book_keeps_the_existing_draft_and_discard_preserves_catalog() {
        let mut app = App::default();
        app.lorebooks.push(lorebook_fixture("Original"));
        let _ = app.update(Message::EditLorebook(0));
        let _ = app.update(Message::LoreName("Entwurf".into()));
        let _ = app.update(Message::NewLorebook);
        assert_eq!(app.lore_draft.as_ref().unwrap().name, "Entwurf");
        let _ = app.update(Message::DiscardLorebook);
        assert_eq!(app.lorebooks[0].name, "Mein Buch");
        assert!(app.lore_draft.is_none());
    }

    fn lorebook_fixture(content: &str) -> lore_catalog::Book {
        lore_catalog::Book::from_json(serde_json::json!({"id":"book-1","name":"Mein Buch","entries":[{"name":"Ort","content":content}]}),"fixture.json".into(),"Fallback").unwrap()
    }

    #[test]
    fn viewing_a_lorebook_does_not_bind_or_replace_it() {
        let mut app = App::default();
        let _ = app.update(Message::EditCharacter(0));
        let _ = app.update(Message::LorebookImported(Ok(Some(lorebook_fixture(
            "Original",
        )))));
        let _ = app.update(Message::InspectLorebook(0));
        assert!(
            app.character_draft
                .as_ref()
                .unwrap()
                .bound_lorebooks()
                .is_empty()
        );
        let _ = app.update(Message::LorebookImported(Ok(Some(lorebook_fixture(
            "Anderer Inhalt",
        )))));
        assert_eq!(app.lorebooks.len(), 1);
        assert_eq!(app.lorebooks[0].entries[0].content, "Original");
    }

    #[test]
    fn unbinding_a_loaded_book_removes_all_aliases_but_preserves_unknown_refs() {
        let mut app = App::default();
        app.preview.characters[0].card.as_mut().unwrap()["data"]["extensions"]["bound_lorebooks"] =
            serde_json::json!(["Mein Buch", "BOOK-1", "fixture.json", "nicht-geladen"]);
        let _ = app.update(Message::EditCharacter(0));
        let _ = app.update(Message::LorebookImported(Ok(Some(lorebook_fixture(
            "Original",
        )))));
        let _ = app.update(Message::ToggleLorebook(0));
        assert_eq!(
            app.character_draft.as_ref().unwrap().bound_lorebooks(),
            ["nicht-geladen"]
        );
        let _ = app.update(Message::SaveCharacter);
        let card = app.preview.characters[0].card.as_ref().unwrap();
        assert_eq!(
            card["data"]["extensions"]["selected_lorebook"],
            "nicht-geladen"
        );
    }

    #[test]
    fn lorebook_binding_stays_with_its_draft_after_chat_navigation() {
        let mut app = App::default();
        let _ = app.update(Message::EditCharacter(0));
        let _ = app.update(Message::LorebookImported(Ok(Some(lorebook_fixture(
            "Original",
        )))));
        let _ = app.update(Message::ToggleLorebook(0));
        let _ = app.update(Message::SelectCharacter(1));
        let _ = app.update(Message::SaveCharacter);
        assert_eq!(
            app.preview.characters[0].card.as_ref().unwrap()["data"]["extensions"]["bound_lorebooks"],
            serde_json::json!(["book-1"])
        );
        assert!(
            app.preview.characters[1].card.as_ref().unwrap()["data"]["extensions"]
                .get("bound_lorebooks")
                .is_none()
        );
    }

    #[test]
    fn empty_neutral_reference_uses_the_main_portrait() {
        let mut app = App::default();
        let _ = app.update(Message::EditCharacter(0));
        app.character_draft
            .as_mut()
            .unwrap()
            .set_expression("neutral", Some(String::new()))
            .unwrap();
        let _ = app.update(Message::EditorTabChanged(EditorTab::Expressions));
        assert_eq!(app.expression_bytes, app.preview.characters[0].portrait);
        assert!(app.expression_status.contains("Hauptporträt"));
    }
    #[test]
    fn late_expression_preview_cannot_replace_the_selected_slot() {
        let mut app = App::default();
        let _ = app.update(Message::EditCharacter(0));
        let _ = app.update(Message::EditorTabChanged(EditorTab::Expressions));
        let old = app.expression_epoch;
        let _ = app.update(Message::ExpressionSlot(expressions::Slot::Happy));
        let id = app.expression_epoch;
        let _ = app.update(Message::ExpressionPreview {
            id: old,
            result: Ok(vec![1]),
        });
        assert!(app.expression_bytes.is_none());
        let _ = app.update(Message::ExpressionPreview {
            id,
            result: Ok(vec![2]),
        });
        assert_eq!(app.expression_bytes, Some(vec![2]));
    }

    #[test]
    fn completed_image_pick_cannot_restore_a_discarded_draft() {
        let mut app = App::default();
        let _ = app.update(Message::EditCharacter(0));
        let draft_id = app.character_draft_id;
        let _ = app.update(Message::DiscardCharacter);
        let _ = app.update(Message::NewCharacter);
        let _ = app.update(Message::ExpressionPicked {
            draft_id,
            slot: expressions::Slot::Happy,
            result: Ok(Some("old reference".into())),
        });
        assert!(
            app.character_draft
                .as_ref()
                .unwrap()
                .expressions()
                .is_empty()
        );
    }

    #[test]
    fn over_budget_expression_does_not_modify_the_existing_mapping() {
        let mut app = App::default();
        let _ = app.update(Message::EditCharacter(0));
        let before = app.character_draft.as_ref().unwrap().expressions().clone();
        assert!(
            app.set_draft_expression(expressions::Slot::Happy, Some("x".repeat(3 * 1024 * 1024)))
                .is_err()
        );
        assert_eq!(app.character_draft.as_ref().unwrap().expressions(), &before);
        assert!(
            app.set_draft_expression(expressions::Slot::Happy, None)
                .is_ok()
        );
    }

    #[test]
    fn preview_image_can_become_a_new_cards_main_portrait() {
        let mut app = App::default();
        let _ = app.update(Message::NewCharacter);
        let _ = app.update(Message::CharacterName("Neue Karte".into()));
        let _ = app.update(Message::EditorTabChanged(EditorTab::Expressions));
        let _ = app.update(Message::ExpressionPreview {
            id: app.expression_epoch,
            result: Ok(vec![1, 2, 3]),
        });
        let _ = app.update(Message::ExpressionAsPortrait);
        let _ = app.update(Message::SaveCharacter);
        assert_eq!(
            app.preview.characters.last().unwrap().portrait,
            Some(vec![1, 2, 3])
        );
    }

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
