use crate::{
    App, Message, background, connection, llm_profiles, local_llm, ui_text::text as label,
};
use iced::Task;
use std::{collections::HashMap, path::PathBuf};

#[derive(
    Debug,
    Clone,
    Copy,
    Default,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
    serde::Serialize,
    serde::Deserialize,
)]
#[serde(rename_all = "snake_case")]
pub enum Backend {
    Local,
    OpenRouter,
    OpenAi,
    Anthropic,
    Gemini,
    DeepSeek,
    Mistral,
    #[default]
    Custom,
}

impl Backend {
    pub const ALL: [Self; 8] = [
        Self::Local,
        Self::OpenRouter,
        Self::OpenAi,
        Self::Anthropic,
        Self::Gemini,
        Self::DeepSeek,
        Self::Mistral,
        Self::Custom,
    ];

    fn settings(self) -> connection::Settings {
        let endpoint = match self {
            Self::Local => "",
            Self::OpenRouter => "https://openrouter.ai/api/v1/chat/completions",
            Self::OpenAi => "https://api.openai.com/v1/chat/completions",
            Self::Anthropic => "https://api.anthropic.com/v1/messages",
            Self::Gemini => {
                "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
            }
            Self::DeepSeek => "https://api.deepseek.com/chat/completions",
            Self::Mistral => "https://api.mistral.ai/v1/chat/completions",
            Self::Custom => return connection::Settings::default(),
        };
        connection::Settings {
            endpoint: endpoint.into(),
            format: if self == Self::Anthropic {
                connection::Format::Anthropic
            } else {
                connection::Format::OpenAi
            },
            ..connection::Settings::default()
        }
    }
}

impl std::fmt::Display for Backend {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(label(match self {
            Self::Local => "settings.localServer",
            Self::OpenRouter => "settings.providerOpenRouter",
            Self::OpenAi => "settings.providerOpenAi",
            Self::Anthropic => "settings.providerAnthropic",
            Self::Gemini => "settings.providerGemini",
            Self::DeepSeek => "settings.providerDeepSeek",
            Self::Mistral => "settings.providerMistral",
            Self::Custom => "llm.native.custom",
        }))
    }
}

#[derive(Default)]
pub struct Control {
    pub backend: Backend,
    configs: HashMap<Backend, connection::Settings>,
    pub models: Vec<String>,
    pub filter: String,
    pub catalog: Option<connection::ActiveRequest>,
    catalog_id: u64,
    pub local: local_llm::Config,
    pub picking: bool,
    pub server: Option<local_llm::Server>,
    local_settings: Option<connection::Settings>,
    pub stopping: bool,
    pub server_status: String,
    pub profile_store: Option<PathBuf>,
    pub profiles_loading: bool,
    pub profiles_saving: bool,
    pub profiles_status: String,
    profiles_revision: u64,
}

impl Control {
    pub fn ready(&self) -> bool {
        !self.profiles_loading
            && (self.backend != Backend::Local || (self.local_settings.is_some() && !self.stopping))
    }

    pub fn clear_catalog(&mut self) {
        self.catalog = None;
        self.models.clear();
        self.filter.clear();
    }
}

impl App {
    pub(super) fn llm_settings_editable(&self) -> bool {
        self.diagnostic.is_none() && !self.llm.profiles_loading && !self.llm.profiles_saving
    }

    pub(super) fn llm_preferences(&self) -> llm_profiles::Preferences {
        let settings = |backend| {
            if backend == self.llm.backend {
                Some(&self.connection)
            } else {
                self.llm.configs.get(&backend)
            }
        };
        let default = connection::Settings::default();
        let custom = settings(Backend::Custom).unwrap_or(&default);
        let models = Backend::ALL
            .into_iter()
            .filter(|backend| *backend != Backend::Local)
            .filter_map(|backend| {
                let model = settings(backend)?.model.trim();
                (!model.is_empty()).then(|| (backend, model.to_owned()))
            })
            .collect();
        llm_profiles::Preferences {
            active: self.llm.backend,
            models,
            custom_endpoint: custom.endpoint.trim().to_owned(),
            custom_format: custom.format,
            local: self.llm.local.clone(),
        }
    }

    pub(super) fn save_llm_preferences(&mut self) -> Task<Message> {
        if !self.llm_settings_editable() || self.llm.picking {
            return Task::none();
        }
        let Some(root) = self.llm.profile_store.clone() else {
            self.llm.profiles_status = label("llm.native.profilesUnavailable").into();
            return Task::none();
        };
        let preferences = self.llm_preferences();
        let revision = self.llm.profiles_revision;
        self.llm.profiles_saving = true;
        self.llm.profiles_status = label("llm.native.profilesSaving").into();
        Task::perform(
            background(move || llm_profiles::save(&root, preferences, revision)),
            Message::LlmProfilesSaved,
        )
    }

    pub(super) fn finish_llm_preferences_save(&mut self, result: Result<u64, String>) {
        self.llm.profiles_saving = false;
        self.llm.profiles_status = match result {
            Ok(revision) => {
                self.llm.profiles_revision = revision;
                label("llm.native.profilesSaved").into()
            }
            Err(error) => error,
        };
    }

    pub(super) fn restore_llm_preferences(
        &mut self,
        result: Result<Option<llm_profiles::Saved>, String>,
    ) {
        if !self.llm.profiles_loading {
            return;
        }
        self.llm.profiles_loading = false;
        let saved = match result {
            Ok(Some(saved)) => saved,
            Ok(None) => return,
            Err(error) => {
                self.llm.profiles_status = error;
                return;
            }
        };
        self.llm.profiles_revision = saved.revision;
        let preferences = saved.preferences;
        self.llm.local = preferences.local;
        self.llm.configs = Backend::ALL
            .into_iter()
            .filter(|backend| *backend != Backend::Local)
            .map(|backend| {
                let mut settings = backend.settings();
                if backend == Backend::Custom {
                    settings.endpoint = preferences.custom_endpoint.clone();
                    settings.format = preferences.custom_format;
                }
                if let Some(model) = preferences.models.get(&backend) {
                    settings.model = model.clone();
                }
                (backend, settings)
            })
            .collect();
        self.llm.backend = preferences.active;
        self.connection = self
            .llm
            .configs
            .remove(&preferences.active)
            .unwrap_or_else(|| preferences.active.settings());
    }

    pub(super) fn select_llm_backend(&mut self, backend: Backend) {
        if !self.llm_settings_editable() || self.llm.backend == backend {
            return;
        }
        let previous = self.llm.backend;
        if previous == Backend::Local && self.llm.ready() {
            self.llm.local_settings = Some(self.connection.clone());
        } else if previous != Backend::Local {
            self.llm.configs.insert(previous, self.connection.clone());
        }
        self.llm.clear_catalog();
        self.llm.backend = backend;
        self.connection = if backend == Backend::Local {
            self.llm
                .local_settings
                .clone()
                .unwrap_or_else(|| backend.settings())
        } else {
            self.llm
                .configs
                .remove(&backend)
                .unwrap_or_else(|| backend.settings())
        };
        self.connection_status.clear();
        self.llm.profiles_status.clear();
    }

    pub(super) fn request_model_catalog(&mut self) -> Task<Message> {
        if self.llm.catalog.is_some() || self.diagnostic.is_some() || !self.llm.ready() {
            return Task::none();
        }
        self.llm.catalog_id += 1;
        let id = self.llm.catalog_id;
        let cancellation = connection::Cancellation::new();
        self.llm.catalog = Some(connection::ActiveRequest {
            id,
            cancellation: cancellation.clone(),
        });
        self.connection_status = label("llm.native.loadingModels").into();
        let settings = self.connection.clone();
        Task::perform(
            background(move || connection::list_models(settings, cancellation)),
            move |result| Message::LlmCatalogLoaded(id, result),
        )
    }

    pub(super) fn finish_model_catalog(&mut self, id: u64, result: Result<Vec<String>, String>) {
        if self.llm.catalog.as_ref().map(|request| request.id) != Some(id) {
            return;
        }
        self.llm.catalog = None;
        match result {
            Ok(models) => {
                self.llm.models = models;
                self.llm.filter.clear();
                self.connection_status = crate::ui_text::format(
                    "llm.native.modelsLoaded",
                    &[("count", &self.llm.models.len().to_string())],
                );
            }
            Err(error) => self.connection_status = error,
        }
    }

    pub(super) fn cancel_model_catalog(&mut self) {
        if self.llm.catalog.take().is_some() {
            self.connection_status.clear();
        }
    }

    pub(super) fn pick_local_llm(&mut self, kind: local_llm::FileKind) -> Task<Message> {
        if !self.llm_settings_editable()
            || self.llm.backend != Backend::Local
            || self.llm.picking
            || self.llm.server.is_some()
        {
            return Task::none();
        }
        self.llm.picking = true;
        let dialog = match kind {
            local_llm::FileKind::Executable => {
                let dialog = rfd::AsyncFileDialog::new().set_title(label("llm.native.binary"));
                if cfg!(windows) {
                    dialog.add_filter("EXE", &["exe"])
                } else {
                    dialog
                }
            }
            local_llm::FileKind::Model => rfd::AsyncFileDialog::new()
                .set_title(label("settings.modelPath"))
                .add_filter("GGUF", &["gguf"]),
        };
        Task::perform(
            async move {
                dialog
                    .pick_file()
                    .await
                    .map(|file| file.path().to_path_buf())
            },
            move |path| Message::LlmFilePicked(kind, path),
        )
    }

    pub(super) fn finish_local_llm_pick(
        &mut self,
        kind: local_llm::FileKind,
        path: Option<PathBuf>,
    ) {
        self.llm.picking = false;
        if let Some(path) = path {
            self.llm.profiles_status.clear();
            match kind {
                local_llm::FileKind::Executable => self.llm.local.binary = Some(path),
                local_llm::FileKind::Model => self.llm.local.model = Some(path),
            }
        }
    }

    pub(super) fn start_local_llm(&mut self) -> Task<Message> {
        if !self.llm_settings_editable()
            || self.llm.backend != Backend::Local
            || self.llm.server.is_some()
            || self.llm.picking
        {
            return Task::none();
        }
        let (server, events) = local_llm::Server::launch(self.llm.local.clone());
        self.llm.server = Some(server);
        self.llm.server_status = label("settings.serverStarting").into();
        Task::run(events, Message::LlmServerEvent)
    }

    pub(super) fn stop_local_llm(&mut self) {
        if let Some(server) = &self.llm.server {
            server.stop();
            self.llm.stopping = true;
            self.llm.server_status = label("llm.native.stopping").into();
            if self.llm.backend == Backend::Local {
                self.cancel_chat();
                self.stage.turn = None;
                self.stage.wizard_music_request = None;
                self.diagnostic = None;
                self.llm.clear_catalog();
            }
        }
    }

    pub(super) fn local_llm_event(&mut self, event: local_llm::Event) {
        match event {
            local_llm::Event::Ready(settings) if !self.llm.stopping => {
                self.llm.server_status = label("header.serverRunning").into();
                if self.llm.backend == Backend::Local {
                    self.connection = settings.clone();
                    self.connection_status.clear();
                }
                self.llm.local_settings = Some(settings);
            }
            local_llm::Event::Ready(_) => {}
            local_llm::Event::Exited(result) => {
                self.llm.server = None;
                self.llm.local_settings = None;
                self.llm.stopping = false;
                self.llm.server_status = result
                    .err()
                    .unwrap_or_else(|| label("settings.serverStopped").into());
                if self.llm.backend == Backend::Local {
                    self.connection = Backend::Local.settings();
                    self.llm.clear_catalog();
                    self.diagnostic = None;
                    self.connection_status.clear();
                }
            }
        }
    }
}
