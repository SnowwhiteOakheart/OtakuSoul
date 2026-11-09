use crate::connection::{Format, Secret};
use crate::llm_control::Backend;
use crate::local_llm::FileKind;
use crate::ui_text::text as label;
use crate::views::{muted, shorten};
use crate::{App, Message, appearance};
use iced::widget::{button, column, container, pick_list, row, text, text_input};
use iced::{Element, Fill};
use std::path::Path;

impl App {
    pub(super) fn active_llm_label(&self) -> String {
        if self.llm.profiles_loading {
            return label("llm.native.profilesLoading").into();
        }
        let backend = self.llm.backend;
        let status = if backend == Backend::Local && !self.llm.ready() {
            label(if self.llm.stopping {
                "llm.native.stopping"
            } else if self.llm.server.is_some() {
                "header.serverStarting"
            } else {
                "header.serverStopped"
            })
            .to_owned()
        } else {
            backend.to_string()
        };
        let name = if self.connection.model.trim().is_empty() && backend == Backend::Local {
            self.llm
                .local
                .model
                .as_deref()
                .and_then(Path::file_name)
                .and_then(|name| name.to_str())
                .unwrap_or_default()
        } else {
            self.connection.model.trim()
        };
        if name.is_empty() {
            status
        } else {
            format!("{status} · {}", shorten(name, 28))
        }
    }

    pub(super) fn connection_settings(&self) -> Element<'_, Message> {
        let editable = self.llm_settings_editable();
        let local = self.llm.backend == Backend::Local;
        let custom = self.llm.backend == Backend::Custom;
        let theme = self.theme();
        let mut content = column![text(label("settings.providerTitle")).size(20)].spacing(11);
        if editable {
            content = content.push(
                pick_list(Backend::ALL, Some(self.llm.backend), Message::LlmBackend)
                    .padding(9)
                    .style(appearance::select),
            );
        } else {
            content = content.push(text(self.llm.backend.to_string()).size(14));
        }
        if local {
            content = content.push(self.local_llm_settings());
        } else {
            if custom && editable {
                content = content.push(
                    pick_list(
                        [Format::OpenAi, Format::Anthropic],
                        Some(self.connection.format),
                        Message::FormatChanged,
                    )
                    .padding(9)
                    .style(appearance::select),
                );
            }
            content = content
                .push(muted(label("settings.endpoint"), 12, &theme))
                .push(
                    text_input(label("settings.endpoint"), &self.connection.endpoint)
                        .on_input_maybe((editable && custom).then_some(Message::EndpointChanged))
                        .style(appearance::input)
                        .padding(9),
                )
                .push(muted(label("llm.native.key"), 12, &theme))
                .push(
                    text_input(label("settings.apiKey"), &self.connection.key.0)
                        .secure(true)
                        .on_input_maybe(
                            editable.then_some(|value| Message::KeyChanged(Secret(value))),
                        )
                        .style(appearance::input)
                        .padding(9),
                );
        }
        content = content
            .push(muted(label("settings.modelId"), 12, &theme))
            .push(
                text_input(label("settings.modelId"), &self.connection.model)
                    .on_input_maybe((editable && self.llm.ready()).then_some(Message::ModelChanged))
                    .style(appearance::input)
                    .padding(9),
            );
        if !self.llm.models.is_empty() {
            let query = self.llm.filter.trim().to_lowercase();
            let options: Vec<_> = self
                .llm
                .models
                .iter()
                .filter(|model| query.is_empty() || model.to_lowercase().contains(&query))
                .take(150)
                .cloned()
                .collect();
            content = content.push(
                text_input(label("llm.native.findModel"), &self.llm.filter)
                    .on_input(Message::LlmFilter)
                    .padding(9)
                    .style(appearance::input),
            );
            if editable && !options.is_empty() {
                let selected = options
                    .contains(&self.connection.model)
                    .then(|| self.connection.model.clone());
                content = content.push(
                    pick_list(options, selected, Message::ModelChanged)
                        .placeholder(label("llm.native.chooseModel"))
                        .padding(9)
                        .style(appearance::select),
                );
            }
        }
        let ready = editable && self.llm.ready() && self.llm.catalog.is_none();
        content = content
            .push(
                row![
                    button(label("llm.native.fetchModels"))
                        .padding(9)
                        .style(appearance::subtle_button)
                        .on_press_maybe(ready.then_some(Message::LlmFetchCatalog)),
                    button(label("llm.native.test"))
                        .padding(9)
                        .style(appearance::primary_button)
                        .on_press_maybe(ready.then_some(Message::TestConnection)),
                    button(label("common.cancel"))
                        .padding(9)
                        .style(appearance::subtle_button)
                        .on_press_maybe(if self.llm.catalog.is_some() {
                            Some(Message::LlmCancelCatalog)
                        } else {
                            self.diagnostic
                                .is_some()
                                .then_some(Message::CancelConnection)
                        }),
                ]
                .spacing(8)
                .wrap(),
            )
            .push(text(&self.connection_status).size(13))
            .push(muted(label("llm.native.usage"), 12, &theme))
            .push(
                button(label("llm.native.saveProfiles"))
                    .padding(9)
                    .style(appearance::subtle_button)
                    .on_press_maybe(
                        (editable && !self.llm.picking).then_some(Message::LlmSaveProfiles),
                    ),
            )
            .push(muted(label("llm.native.profilesHint"), 12, &theme));
        if self.llm.profiles_loading {
            content = content.push(muted(label("llm.native.profilesLoading"), 13, &theme));
        } else if !self.llm.profiles_status.is_empty() {
            content = content.push(text(&self.llm.profiles_status).size(13));
        }
        container(content)
            .padding(20)
            .width(Fill)
            .style(appearance::card)
            .into()
    }

    fn local_llm_settings(&self) -> Element<'_, Message> {
        let theme = self.theme();
        let config = &self.llm.local;
        let editable =
            self.llm_settings_editable() && self.llm.server.is_none() && !self.llm.picking;
        let file = |key, path: Option<&Path>, kind| {
            column![
                muted(
                    path.map_or_else(|| label(key).into(), |path| path.display().to_string()),
                    12,
                    &theme
                ),
                button(label(key))
                    .padding(8)
                    .style(appearance::subtle_button)
                    .on_press_maybe(editable.then_some(Message::LlmPickFile(kind))),
            ]
            .spacing(4)
        };
        let status = if self.llm.server_status.is_empty() {
            label("settings.serverStopped")
        } else {
            &self.llm.server_status
        };
        container(
            column![
                text(label("settings.serverTitle")).size(16),
                muted(label("llm.native.localHint"), 12, &theme),
                file(
                    "llm.native.binary",
                    config.binary.as_deref(),
                    FileKind::Executable
                ),
                file(
                    "settings.modelPath",
                    config.model.as_deref(),
                    FileKind::Model
                ),
                row![
                    column![
                        muted(label("settings.contextSize"), 12, &theme),
                        text_input(label("settings.contextSize"), &config.context)
                            .on_input_maybe(editable.then_some(Message::LlmContext))
                            .padding(8)
                            .style(appearance::input)
                    ]
                    .spacing(4),
                    column![
                        muted(label("settings.gpuLayers"), 12, &theme),
                        text_input(label("settings.gpuLayers"), &config.gpu_layers)
                            .on_input_maybe(editable.then_some(Message::LlmGpuLayers))
                            .padding(8)
                            .style(appearance::input)
                    ]
                    .spacing(4),
                ]
                .spacing(8),
                row![
                    button(label("settings.startServer"))
                        .style(appearance::primary_button)
                        .on_press_maybe(
                            (editable && config.binary.is_some() && config.model.is_some())
                                .then_some(Message::LlmStart)
                        ),
                    button(label("settings.stopServer"))
                        .style(appearance::subtle_button)
                        .on_press_maybe(
                            (self.llm.server.is_some() && !self.llm.stopping)
                                .then_some(Message::LlmStop)
                        ),
                ]
                .spacing(8)
                .wrap(),
                text(status).size(13),
            ]
            .spacing(9),
        )
        .width(Fill)
        .into()
    }
}
