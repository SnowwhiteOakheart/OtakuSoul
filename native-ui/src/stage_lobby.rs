//! Szenenverwaltung und Dateifluss nach Tauris Szenen-Lobby.
use crate::icons::{Icon, icon};
use crate::stage_draft::{Draft, Field};
use crate::stage_media::{self, Imported, Kind};
use crate::stage_store::{FolderChange, Library};
use crate::ui_text::{CONTENT_LANGUAGE, format, text as label};
use crate::views::{control, muted, scroll, shorten};
use crate::{
    App, Message, Page, StageFolder, StageSource, StageWrite, appearance, background, file_export,
    profile, stage_preview, stage_rule_view, stage_store,
};
use iced::widget::{
    button, checkbox, column, container, pick_list, row, text, text_editor, text_input,
};
use iced::{Alignment, Element, Fill, Task};
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

fn new_scene_id() -> String {
    static NEXT_ID: AtomicU64 = AtomicU64::new(0);
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let sequence = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    format!("native-scene-{millis}-{}-{sequence}", std::process::id())
}

impl std::fmt::Display for Field {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(label(self.label_key()))
    }
}

#[derive(Clone, PartialEq)]
pub(super) struct Choice {
    pub value: String,
    title: String,
}

impl Choice {
    pub fn new(value: &str, title: &str) -> Self {
        Self {
            value: value.into(),
            title: title.into(),
        }
    }

    pub fn include_current(options: &mut Vec<Self>, value: &str) -> Self {
        if let Some(choice) = options.iter().find(|choice| choice.value == value) {
            return choice.clone();
        }
        let choice = Self::new(value, value);
        options.push(choice.clone());
        choice
    }
}

impl std::fmt::Display for Choice {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.title)
    }
}

fn tone_options(value: &str) -> (Vec<Choice>, Choice) {
    let mut options: Vec<_> = [
        ("Epic Fantasy", "sceneNew.tone.epic"),
        ("Dark Fantasy", "sceneNew.tone.dark"),
        ("Sci-Fi Cyberpunk", "sceneNew.tone.scifi"),
        ("Anime Comedy", "sceneNew.tone.comedy"),
        ("Eldritch Mystery", "sceneNew.tone.eldritch"),
        ("Isekai Adventure", "sceneNew.tone.isekai"),
    ]
    .into_iter()
    .map(|(value, key)| Choice::new(value, label(key)))
    .collect();
    let selected = Choice::include_current(&mut options, value);
    (options, selected)
}

impl App {
    pub(super) fn open_scene_editor(&mut self, target: Option<usize>) {
        if self.page != Page::Stage || self.stage.file_busy {
            return;
        }
        if self.stage.draft.is_none() {
            let draft = if let Some(index) = target {
                let Some(scene) = self.stage.scenes.get(index) else {
                    return;
                };
                if !self.stage.own.contains(&index) {
                    return;
                }
                Draft::from_scene(Some(index), scene)
            } else {
                let mut draft = Draft::new();
                if let StageFolder::Named(key) = &self.stage.lobby_folder
                    && let Some(name) = self
                        .stage
                        .folders
                        .iter()
                        .find(|name| &name.to_lowercase() == key)
                {
                    draft.set(Field::Folder, name.into());
                }
                draft
            };
            self.stage.editor = text_editor::Content::with_text(draft.get(Field::Description));
            self.stage.edit_field = Field::Description;
            self.stage.draft = Some(draft);
            self.stage.background_preview = None;
            self.stage.edit_error.clear();
        }
        self.stage.lobby = true;
        self.stage.selected = None;
        self.stage.editing = true;
        self.stage.folder_form = None;
    }

    pub(super) fn save_scene_draft(&mut self) -> Task<Message> {
        if self.stage.file_busy || self.stage.loading {
            return Task::none();
        }
        let Some(draft) = self.stage.draft.as_ref().filter(|_| self.stage.editing) else {
            return Task::none();
        };
        let id = draft
            .target
            .map_or_else(new_scene_id, |index| self.stage.scenes[index].id.clone());
        match draft.apply(&id) {
            Ok(scene) => self.persist_scene(StageWrite::Editor(draft.target), scene),
            Err(error) => {
                self.stage.edit_error = error;
                Task::none()
            }
        }
    }

    pub(super) fn persist_scene(
        &mut self,
        write: StageWrite,
        scene: stage_preview::Scene,
    ) -> Task<Message> {
        let Some(root) = self.stage.store.clone() else {
            self.finish_stage_write(write, Err(label("gallery.native.storeUnavailable").into()));
            return Task::none();
        };
        let previous = match write {
            StageWrite::Editor(Some(index)) => Some(self.stage.scenes[index].definition()),
            _ => None,
        };
        self.stage.file_busy = true;
        self.stage.edit_error.clear();
        Task::perform(
            background(move || {
                let folders = stage_store::save(&root, &scene, previous.as_ref())?;
                Ok((scene, folders))
            }),
            move |result| Message::StageStored(write, result),
        )
    }

    pub(super) fn finish_stage_load(&mut self, result: Result<Library, String>) {
        self.stage.loading = false;
        match result {
            Ok(library) => {
                self.stage.folders = library.folders;
                for scene in library.scenes {
                    if self
                        .stage
                        .scenes
                        .iter()
                        .any(|known| known.collection().is_some() && known.id == scene.id)
                    {
                        self.stage.notice = label("gallery.native.duplicateScene").into();
                    } else if let Some(&index) = self
                        .stage
                        .own
                        .iter()
                        .find(|&&index| self.stage.scenes[index].id == scene.id)
                    {
                        self.stage.scenes[index] = scene;
                    } else {
                        self.add_local_scene(scene);
                    }
                }
            }
            Err(error) => {
                self.stage.notice = format("gallery.native.storeError", &[("error", &error)])
            }
        }
    }

    pub(super) fn finish_stage_write(
        &mut self,
        write: StageWrite,
        result: Result<(stage_preview::Scene, Vec<String>), String>,
    ) {
        self.stage.file_busy = false;
        let (scene, folders) = match result {
            Ok(saved) => saved,
            Err(error) => {
                let error = format("gallery.native.storeError", &[("error", &error)]);
                match write {
                    StageWrite::Import => self.stage.notice = error,
                    StageWrite::Editor(_) => self.stage.edit_error = error,
                }
                return;
            }
        };
        self.stage.folders = folders;
        let folder = StageFolder::for_scene(&scene);
        match write {
            StageWrite::Editor(target) => {
                if let Some(index) = target {
                    self.stage.scenes[index] = scene;
                } else {
                    self.add_local_scene(scene);
                }
                self.stage.draft = None;
                self.stage.background_preview = None;
                self.stage.editing = false;
                self.stage.notice = label("gallery.native.sceneApplied").into();
            }
            StageWrite::Import => {
                self.stage.notice = format(
                    "gallery.native.sceneImported",
                    &[("title", scene.title(CONTENT_LANGUAGE))],
                );
                self.add_local_scene(scene);
            }
        }
        if self.stage.lobby && !self.stage.editing && self.stage.selected.is_none() {
            self.stage.lobby_source = StageSource::Own;
            self.stage.lobby_query.clear();
            if self.stage.lobby_folder != StageFolder::All {
                self.stage.lobby_folder = folder;
            }
        }
    }

    pub(super) fn change_stage_folder(&mut self) -> Task<Message> {
        if self.stage.file_busy || self.stage.loading || self.stage.draft.is_some() {
            return Task::none();
        }
        let Some(change) = self.stage.folder_form.clone() else {
            return Task::none();
        };
        let Some(root) = self.stage.store.clone() else {
            self.stage.notice = label("gallery.native.storeUnavailable").into();
            return Task::none();
        };
        self.stage.file_busy = true;
        self.stage.notice.clear();
        let request = change.clone();
        Task::perform(
            background(move || stage_store::change_folder(&root, &request)),
            move |result| Message::StageFoldersStored(change, result),
        )
    }

    pub(super) fn finish_folder_change(
        &mut self,
        change: FolderChange,
        result: Result<Library, String>,
    ) {
        self.stage.file_busy = false;
        let library = match result {
            Ok(library) => library,
            Err(error) => {
                self.stage.notice = format("gallery.native.storeError", &[("error", &error)]);
                return;
            }
        };
        self.finish_stage_load(Ok(library));
        self.stage.folder_form = None;
        self.stage.lobby_source = StageSource::Own;
        self.stage.lobby_query.clear();
        self.stage.lobby_folder = match change {
            FolderChange::Create(name) => StageFolder::Named(name.trim().to_lowercase()),
            FolderChange::Delete(_) => StageFolder::Unfiled,
        };
    }

    fn add_local_scene(&mut self, scene: stage_preview::Scene) {
        self.stage.own.insert(self.stage.scenes.len());
        self.stage.scenes.push(scene);
    }

    pub(super) fn import_stage_media(&mut self, kind: Kind) -> Task<Message> {
        if !self.stage.editing || self.stage.file_busy || self.profile_busy {
            return Task::none();
        }
        let Some(root) = self.stage.store.clone() else {
            self.stage.edit_error = label("gallery.native.storeUnavailable").into();
            return Task::none();
        };
        self.stage.file_busy = true;
        self.stage.edit_error.clear();
        Task::perform(
            async move {
                let Some(file) = rfd::AsyncFileDialog::new()
                    .set_title(kind.import_label())
                    .add_filter(kind.import_label(), kind.extensions())
                    .pick_file()
                    .await
                else {
                    return Ok(None);
                };
                let source = file.path().to_path_buf();
                background(move || stage_media::import(&root, kind, &source))
                    .await
                    .map(Some)
            },
            move |result| Message::StageMediaImported(kind, result),
        )
    }

    pub(super) fn finish_stage_media_import(
        &mut self,
        kind: Kind,
        result: Result<Option<Imported>, String>,
    ) {
        self.stage.file_busy = false;
        let imported = match result {
            Ok(Some(imported)) => imported,
            Ok(None) => return,
            Err(error) => {
                self.stage.edit_error = error;
                return;
            }
        };
        let (names, field) = match kind {
            Kind::Background => (&mut self.stage.native_media.backgrounds, Field::Background),
            Kind::Ambient => (&mut self.stage.native_media.ambient, Field::Ambient),
        };
        names.push(imported.name.clone());
        names.sort_unstable();
        names.dedup();
        if let Some(draft) = &mut self.stage.draft {
            draft.set(field, imported.name);
            if let Kind::Background = kind {
                self.stage.background_preview = imported.image;
            }
        }
    }

    pub(super) fn preview_stage_background(&mut self) -> Task<Message> {
        if !self.stage.editing || self.stage.file_busy || self.profile_busy {
            return Task::none();
        }
        let Some(draft) = &self.stage.draft else {
            return Task::none();
        };
        let name = draft.get(Field::Background).trim().to_owned();
        let root = self.stage.store.clone();
        let profile = self.profile_home.clone();
        self.stage.file_busy = true;
        self.stage.edit_error.clear();
        self.stage.background_preview = None;
        Task::perform(
            background(move || stage_media::preview(root.as_deref(), profile.as_deref(), &name)),
            Message::StageBackgroundLoaded,
        )
    }

    pub(super) fn import_scene_file(&mut self) -> Task<Message> {
        if self.stage.file_busy || self.stage.loading {
            return Task::none();
        }
        self.stage.file_busy = true;
        self.stage.notice.clear();
        Task::perform(
            async {
                let Some(file) = rfd::AsyncFileDialog::new()
                    .set_title(label("lobby.importJson"))
                    .add_filter("JSON", &["json"])
                    .pick_file()
                    .await
                else {
                    return Ok(None);
                };
                let path = file.path().to_path_buf();
                background(move || {
                    stage_preview::parse_file(
                        profile::read_standalone_json(&path)?,
                        &new_scene_id(),
                    )
                })
                .await
                .map(Some)
            },
            Message::StageImported,
        )
    }

    pub(super) fn export_scene_file(&mut self, index: usize) -> Task<Message> {
        if self.stage.file_busy || self.stage.loading || self.profile_busy {
            return Task::none();
        }
        let Some(scene) = self.stage.scenes.get(index) else {
            return Task::none();
        };
        let definition = scene.definition();
        let protected = self.profile_home.clone();
        let store = self.stage.store.clone();
        self.stage.file_busy = true;
        self.stage.notice.clear();
        Task::perform(
            async move {
                let Some(file) = rfd::AsyncFileDialog::new()
                    .set_title(label("lobby.exportJson"))
                    .add_filter("JSON", &["json"])
                    .set_file_name("szene.json")
                    .save_file()
                    .await
                else {
                    return Ok(false);
                };
                let path = file.path().to_path_buf();
                if !path
                    .extension()
                    .is_some_and(|value| value.eq_ignore_ascii_case("json"))
                {
                    return Err(label("gallery.native.jsonExtension").into());
                }
                background(move || {
                    if store
                        .as_ref()
                        .is_some_and(|root| profile::native_store_overlaps(root, &path))
                    {
                        return Err(label("gallery.native.storeExport").into());
                    }
                    file_export::write_json(&path, &definition, protected.as_deref())
                })
                .await
                .map(|()| true)
            },
            Message::StageExported,
        )
    }

    pub(super) fn scene_lobby(&self) -> Element<'_, Message> {
        let theme = self.theme();
        let available = !self.stage.file_busy && !self.stage.loading;
        let tools = row![
            button(label("lobby.importJson"))
                .style(appearance::subtle_button)
                .on_press_maybe(available.then_some(Message::StageImport)),
            control(Icon::Hub, label("lobby.browseHub"), Message::StageBrowseHub),
            button(label(if self.stage.draft.is_some() {
                "gallery.native.resumeScene"
            } else {
                "lobby.newScene"
            }))
            .style(appearance::primary_button)
            .on_press(Message::StageEdit(None)),
        ]
        .spacing(8)
        .wrap();
        let query = self.stage.lobby_query.trim().to_lowercase();
        let source_for = |index: usize, scene: &stage_preview::Scene| {
            if self.stage.own.contains(&index) {
                StageSource::Own
            } else if scene.collection().is_some() {
                StageSource::Presets
            } else {
                StageSource::Hub
            }
        };
        let matches_query = |scene: &stage_preview::Scene| {
            query.is_empty()
                || [
                    scene.title(CONTENT_LANGUAGE),
                    scene.description(CONTENT_LANGUAGE),
                    scene.location(CONTENT_LANGUAGE),
                    scene.folder().unwrap_or_default(),
                    &scene.id,
                ]
                .into_iter()
                .any(|text| text.to_lowercase().contains(&query))
        };
        let matching: Vec<_> = self
            .stage
            .scenes
            .iter()
            .enumerate()
            .filter(|(_, scene)| matches_query(scene))
            .map(|(index, scene)| (index, scene, source_for(index, scene)))
            .collect();
        let mut filters = row![].spacing(7);
        for (source, key) in [
            (StageSource::All, "lobby.filterAll"),
            (StageSource::Presets, "lobby.filterPresets"),
            (StageSource::Own, "lobby.filterCustom"),
            (StageSource::Hub, "gallery.native.hubScenes"),
        ] {
            let count = matching
                .iter()
                .filter(|(_, _, candidate)| source == StageSource::All || source == *candidate)
                .count();
            filters = filters.push(
                button(text(format(key, &[("count", &count.to_string())])).size(12))
                    .style(if self.stage.lobby_source == source {
                        appearance::primary_button
                    } else {
                        appearance::subtle_button
                    })
                    .on_press(Message::StageLobbySource(source)),
            );
        }
        let mut content = column![
            control(Icon::Back, label("common.back"), Message::StageBack),
            text(label("lobby.title")).size(25),
            muted(label("gallery.native.lobbyIntro"), 13, &theme),
            tools,
            text_input(label("lobby.search"), &self.stage.lobby_query)
                .on_input(Message::StageLobbySearch)
                .padding(9)
                .style(appearance::input),
            filters.wrap(),
        ]
        .spacing(12);
        content = content.push(self.scene_folder_filters(available));
        if let Some(form) = &self.stage.folder_form {
            content = content.push(self.scene_folder_form(form, available));
        }
        if !available {
            content = content.push(muted(label("common.loading"), 13, &theme));
        } else if !self.stage.notice.is_empty() {
            content = content.push(text(&self.stage.notice).size(13));
        }
        let mut visible = matching
            .into_iter()
            .filter(|(_, scene, source)| {
                (self.stage.lobby_source == StageSource::All || *source == self.stage.lobby_source)
                    && (self.stage.lobby_folder == StageFolder::All
                        || (*source == StageSource::Own
                            && self.stage.lobby_folder == StageFolder::for_scene(scene)))
            })
            .peekable();
        if visible.peek().is_none() {
            content = content.push(muted(label("gallery.native.noScenes"), 13, &theme));
        }
        for (index, scene, source) in visible {
            let tag = label(match source {
                StageSource::Presets => "lobby.officialPreset",
                StageSource::Own => "lobby.customScene",
                StageSource::Hub => "gallery.native.hubScene",
                StageSource::All => unreachable!(),
            });
            let folder = if source == StageSource::Own {
                scene.folder().unwrap_or_default()
            } else {
                ""
            };
            let meta = [tag, folder, scene.location(CONTENT_LANGUAGE)]
                .into_iter()
                .filter(|text| !text.is_empty())
                .collect::<Vec<_>>()
                .join(" · ");
            let mut actions = row![
                control(
                    Icon::Eye,
                    label("gallery.look"),
                    Message::StageSelect(index)
                ),
                button(label("lobby.exportJson"))
                    .style(appearance::subtle_button)
                    .on_press_maybe(
                        (available && !self.profile_busy).then_some(Message::StageExport(index))
                    ),
            ]
            .spacing(7);
            if source == StageSource::Own {
                actions = actions.push(control(
                    Icon::Settings,
                    label("sceneEdit.title"),
                    Message::StageEdit(Some(index)),
                ));
            }
            content = content.push(
                container(
                    column![
                        row![
                            icon(Icon::Stage, 18),
                            text(scene.title(CONTENT_LANGUAGE)).size(16)
                        ]
                        .spacing(8)
                        .align_y(Alignment::Center),
                        muted(meta, 12, &theme),
                        muted(
                            shorten(scene.description(CONTENT_LANGUAGE), 170),
                            13,
                            &theme
                        ),
                        actions.wrap(),
                    ]
                    .spacing(7),
                )
                .padding(14)
                .width(Fill)
                .style(appearance::card),
            );
        }
        scroll(content.padding(24)).width(Fill).height(Fill).into()
    }

    fn scene_folder_filters(&self, available: bool) -> Element<'_, Message> {
        let mut named: BTreeMap<_, _> = self
            .stage
            .folders
            .iter()
            .map(|name| (name.to_lowercase(), (name.as_str(), 0)))
            .collect();
        let mut unfiled = 0;
        for (index, scene) in self.stage.scenes.iter().enumerate() {
            if !self.stage.own.contains(&index) {
                continue;
            }
            if let Some(name) = scene.folder() {
                let (_, count) = named.entry(name.to_lowercase()).or_insert((name, 0));
                *count += 1;
            } else {
                unfiled += 1;
            }
        }
        let filter = |name, count, folder| {
            button(text(format!("{name} ({count})")).size(12))
                .style(
                    if self.stage.lobby_source == StageSource::Own
                        && self.stage.lobby_folder == folder
                    {
                        appearance::primary_button
                    } else {
                        appearance::subtle_button
                    },
                )
                .on_press_maybe(available.then_some(Message::StageLobbyFolder(folder)))
        };
        let mut filters = row![
            text(label("lobby.folders")).size(13),
            filter(
                label("lobby.folderAll"),
                self.stage.own.len(),
                StageFolder::All
            ),
            filter(
                label("gallery.native.unfiled"),
                unfiled,
                StageFolder::Unfiled
            ),
        ]
        .spacing(7)
        .align_y(Alignment::Center);
        let selected = match &self.stage.lobby_folder {
            StageFolder::Named(key) => named.get(key).map(|(name, _)| *name),
            _ => None,
        };
        for (key, (name, count)) in named {
            filters = filters.push(filter(name, count, StageFolder::Named(key)));
        }
        let can_manage = available && self.stage.draft.is_none();
        filters =
            filters.push(
                button(label("lobby.newFolderTitle"))
                    .style(appearance::subtle_button)
                    .on_press_maybe(can_manage.then(|| {
                        Message::StageFolderForm(Some(FolderChange::Create(String::new())))
                    })),
            );
        if let Some(name) = selected {
            filters = filters.push(
                button(label("lobby.deleteFolder"))
                    .style(appearance::subtle_button)
                    .on_press_maybe(can_manage.then(|| {
                        Message::StageFolderForm(Some(FolderChange::Delete(name.into())))
                    })),
            );
        }
        filters.wrap().into()
    }

    fn scene_folder_form<'a>(
        &'a self,
        form: &'a FolderChange,
        available: bool,
    ) -> Element<'a, Message> {
        let mut fields = column![].spacing(8);
        let (action, valid) = match form {
            FolderChange::Create(name) => {
                fields = fields
                    .push(text(label("lobby.newFolderTitle")).size(15))
                    .push(
                        text_input(label("lobby.folderPlaceholder"), name)
                            .on_input(|name| {
                                Message::StageFolderForm(Some(FolderChange::Create(name)))
                            })
                            .style(appearance::input)
                            .padding(9),
                    );
                ("lobby.createFolder", !name.trim().is_empty())
            }
            FolderChange::Delete(name) => {
                fields = fields
                    .push(text(format("confirm.deleteFolderTitle", &[("name", name)])).size(15))
                    .push(text(label("gallery.native.deleteFolderHint")).size(13));
                ("lobby.deleteFolder", true)
            }
        };
        fields = fields.push(
            row![
                button(label(action))
                    .style(appearance::primary_button)
                    .on_press_maybe(
                        (available && valid && self.stage.draft.is_none())
                            .then_some(Message::StageApplyFolder)
                    ),
                button(label("common.cancel"))
                    .style(appearance::subtle_button)
                    .on_press_maybe(available.then_some(Message::StageFolderForm(None))),
            ]
            .spacing(8),
        );
        container(fields)
            .padding(12)
            .width(Fill)
            .style(appearance::card)
            .into()
    }

    pub(super) fn scene_editor<'a>(&'a self, draft: &'a Draft) -> Element<'a, Message> {
        let theme = self.theme();
        let input = |field: Field| {
            let label_key = label(field.label_key());
            column![
                muted(label_key, 12, &theme),
                text_input(label_key, draft.get(field))
                    .on_input(move |value| Message::StageSet(field, value))
                    .padding(9)
                    .style(appearance::input),
            ]
            .spacing(4)
            .width(Fill)
        };
        let toggle = |field: Field| {
            checkbox(draft.get(field) == "true")
                .label(label(field.label_key()))
                .on_toggle(move |enabled| Message::StageSet(field, enabled.to_string()))
        };
        let asset = |field: Field, names: &[String]| -> Element<'a, Message> {
            if names.is_empty() {
                return input(field).into();
            }
            let value = draft.get(field);
            let empty = if value.eq_ignore_ascii_case("none") {
                value
            } else {
                ""
            };
            let mut options = vec![Choice::new(empty, label("sceneEdit.none"))];
            options.extend(names.iter().map(|name| Choice::new(name, name)));
            let selected = Choice::include_current(&mut options, value);
            column![
                muted(label(field.label_key()), 12, &theme),
                pick_list(options, Some(selected), move |choice| Message::StageSet(
                    field,
                    choice.value
                ))
                .padding(8)
                .style(appearance::select),
            ]
            .spacing(4)
            .width(Fill)
            .into()
        };
        let available = !self.stage.file_busy && !self.profile_busy;
        let mut names = self.stage.media.clone();
        names.merge(self.stage.native_media.clone());
        let import = |kind: Kind| {
            button(kind.import_label())
                .style(appearance::subtle_button)
                .on_press_maybe(available.then_some(Message::StageImportMedia(kind)))
        };
        let mut media = column![
            text(label("sceneEdit.sectionMedia")).size(16),
            muted(label("gallery.native.mediaHint"), 12, &theme),
            asset(Field::Background, &names.backgrounds),
            row![
                import(Kind::Background),
                button(label("gallery.native.previewBackground"))
                    .style(appearance::subtle_button)
                    .on_press_maybe(
                        (available && !draft.get(Field::Background).trim().is_empty())
                            .then_some(Message::StagePreviewBackground)
                    ),
            ]
            .spacing(8)
            .wrap(),
            asset(Field::Ambient, &names.ambient),
            import(Kind::Ambient),
            toggle(Field::LockBackground),
            toggle(Field::DisableAmbient),
        ]
        .spacing(9);
        if let Some(preview) = &self.stage.background_preview {
            media = media.push(
                iced::widget::image(preview.clone())
                    .height(200)
                    .width(Fill)
                    .content_fit(iced::ContentFit::Contain),
            );
        }
        let (tones, tone) = tone_options(draft.get(Field::GmTone));
        let advanced = column![
            text(label("sceneEdit.sectionAdvanced")).size(16),
            muted(label(Field::GmTone.label_key()), 12, &theme),
            pick_list(tones, Some(tone), |tone| Message::StageSet(
                Field::GmTone,
                tone.value
            ))
            .padding(8)
            .style(appearance::select),
            input(Field::NarratorStyle),
            input(Field::ActorDepth),
            toggle(Field::DisableOffscreen),
            toggle(Field::Dice),
        ]
        .spacing(9);
        let mut content = column![
            control(Icon::Back, label("common.back"), Message::StageBack),
            text(label(if draft.target.is_some() {
                "sceneEdit.title"
            } else {
                "sceneNew.title"
            }))
            .size(25),
            muted(label("gallery.native.editorIntro"), 13, &theme),
            container(
                column![
                    text(label("sceneEdit.sectionStory")).size(16),
                    input(Field::Title),
                    input(Field::Folder),
                    muted(label("gallery.native.folderHint"), 12, &theme),
                    row![input(Field::Location), input(Field::Time)].spacing(12),
                    input(Field::Persona),
                    pick_list(
                        Field::MULTILINE,
                        Some(self.stage.edit_field),
                        Message::StageEditField
                    )
                    .padding(8)
                    .style(appearance::select),
                    text_editor(&self.stage.editor)
                        .placeholder(label("gallery.native.sceneField"))
                        .on_action(Message::StageText)
                        .height(180)
                        .padding(10)
                        .style(appearance::editor),
                ]
                .spacing(12)
            )
            .padding(16)
            .width(Fill)
            .style(appearance::card),
            container(media)
                .padding(16)
                .width(Fill)
                .style(appearance::card),
            container(advanced)
                .padding(16)
                .width(Fill)
                .style(appearance::card),
            container(stage_rule_view::fields(draft, &theme))
                .padding(16)
                .width(Fill)
                .style(appearance::card),
            row![
                button(label("gallery.native.applyScene"))
                    .style(appearance::primary_button)
                    .on_press_maybe(
                        (!self.stage.file_busy && !self.stage.loading)
                            .then_some(Message::StageApply)
                    ),
                button(label("gallery.native.discardScene"))
                    .style(appearance::subtle_button)
                    .on_press_maybe((!self.stage.file_busy).then_some(Message::StageDiscard)),
            ]
            .spacing(8),
        ]
        .spacing(12);
        if matches!(self.stage.edit_field, Field::Party | Field::Lorebooks) {
            content = content.push(muted(label("gallery.native.onePerLine"), 12, &theme));
        }
        if self.stage.file_busy || self.stage.loading {
            content = content.push(muted(label("common.loading"), 13, &theme));
        }
        if !self.stage.edit_error.is_empty() {
            content = content.push(
                text(&self.stage.edit_error)
                    .color(theme.palette().danger)
                    .size(13),
            );
        }
        scroll(container(content.padding(24).max_width(850)).center_x(Fill))
            .width(Fill)
            .height(Fill)
            .into()
    }
}
