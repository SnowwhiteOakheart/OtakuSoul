use crate::stage_draft::Draft;
use crate::stage_lobby::new_scene_id;
use crate::story_music::{self, Edit as MusicEdit, MOODS};
use crate::story_wizard::{self, Edit, GENRES, MAX_COMPANIONS, Premise, Step, Wizard};
use crate::ui_text::{CONTENT_LANGUAGE, format, text as label};
use crate::views::{muted, scroll};
use crate::{App, Message, Page, StageWrite, appearance, background, connection};
use iced::widget::{button, checkbox, column, container, row, text, text_editor, text_input};
use iced::{Element, Fill, Task};
use std::collections::HashSet;

impl App {
    pub(super) fn open_story_wizard(&mut self) {
        if self.page == Page::Stage && !self.stage.file_busy && self.stage.draft.is_none() {
            self.stage
                .wizard
                .get_or_insert_with(|| Wizard::new(&self.prompt_settings.persona_name));
            self.stage.lobby = false;
            self.stage.selected = None;
            self.stage.opening = false;
            self.stage.editing = false;
            self.stage.playing = false;
            self.stage.edit_error.clear();
        }
    }

    pub(super) fn finish_story_wizard(&mut self, advanced: bool) -> Task<Message> {
        if self.page != Page::Stage
            || self.stage.file_busy
            || self.stage.loading
            || self.stage.draft.is_some()
            || self.stage.selected.is_some()
        {
            return Task::none();
        }
        let Some(wizard) = self
            .stage
            .wizard
            .as_ref()
            .filter(|wizard| wizard.step == Step::Review)
        else {
            return Task::none();
        };
        let scene = match wizard.scene(&new_scene_id()) {
            Ok(scene) => scene,
            Err(error) => {
                self.stage.edit_error = error;
                return Task::none();
            }
        };
        if advanced {
            self.set_scene_draft(Draft::from_scene(None, &scene));
            self.stage.wizard = None;
            self.open_scene_editor(None);
            Task::none()
        } else {
            self.persist_scene(StageWrite::Wizard, scene)
        }
    }

    pub(super) fn suggest_story_music(&mut self) -> Task<Message> {
        if self.page != Page::Stage
            || self.stage.file_busy
            || self.stage.selected.is_some()
            || self.stage.wizard_music_request.is_some()
        {
            return Task::none();
        }
        if !self.llm.ready() {
            self.stage.edit_error = label("llm.native.startFirst").into();
            return Task::none();
        }
        let Some(wizard) = self
            .stage
            .wizard
            .as_ref()
            .filter(|wizard| wizard.step == Step::Music && wizard.music.enabled)
        else {
            return Task::none();
        };
        let Ok(scene) = wizard.scene("music-context") else {
            return Task::none();
        };
        let genre = story_wizard::genre_id(wizard.genre);
        let request = story_music::request(&scene, genre, &wizard.music.requested_moods(genre));
        let settings = self.connection.clone();
        self.stage.wizard_music_id += 1;
        let id = self.stage.wizard_music_id;
        let cancellation = connection::Cancellation::new();
        self.stage.wizard_music_request = Some(connection::ActiveRequest {
            id,
            cancellation: cancellation.clone(),
        });
        self.stage.edit_error.clear();
        Task::perform(
            background(move || {
                let answer = connection::run_chat(settings, cancellation, request)?;
                story_music::parse_suggestion(&answer)
            }),
            move |result| Message::StageWizardMusicSuggested(id, result),
        )
    }

    pub(super) fn finish_story_music(
        &mut self,
        id: u64,
        result: Result<story_music::Suggestion, String>,
    ) {
        if self
            .stage
            .wizard_music_request
            .as_ref()
            .map(|active| active.id)
            != Some(id)
        {
            return;
        }
        self.stage.wizard_music_request = None;
        if let Some(wizard) = &mut self.stage.wizard {
            let result = result.and_then(|suggestion| {
                wizard
                    .music
                    .apply_suggestion(story_wizard::genre_id(wizard.genre), suggestion)
            });
            self.stage.edit_error = result.err().unwrap_or_default();
        }
    }

    fn story_music_fields<'a>(&self, wizard: &'a Wizard) -> Element<'a, Message> {
        let theme = self.theme();
        let music = &wizard.music;
        let edit = |action| Message::StageWizardEdit(Edit::Music(action));
        let mut fields = column![
            text(label("storyWizard.music.question")).size(16),
            checkbox(music.enabled)
                .label(label("storyWizard.music.enable"))
                .on_toggle(move |enabled| edit(MusicEdit::Enabled(enabled))),
        ]
        .spacing(10);
        if !music.enabled {
            return fields.into();
        }
        let suggestion = if self.stage.wizard_music_request.is_some() {
            button(label("common.cancel")).on_press(Message::StageWizardCancelMusic)
        } else {
            button(label("storyWizard.music.suggest")).on_press(Message::StageWizardSuggestMusic)
        }
        .style(appearance::subtle_button);
        fields = fields.push(
            row![
                suggestion,
                button(label("storyWizard.music.reset"))
                    .style(appearance::subtle_button)
                    .on_press(edit(MusicEdit::Reset)),
            ]
            .spacing(8)
            .wrap(),
        );
        if self.stage.wizard_music_request.is_some() {
            fields = fields.push(muted(label("storyWizard.music.suggesting"), 13, &theme));
        }
        fields = fields
            .push(muted(label("storyWizard.music.style"), 12, &theme))
            .push(
                text_input(label("storyWizard.music.style"), &music.style)
                    .on_input(move |style| edit(MusicEdit::Style(style)))
                    .padding(9)
                    .style(appearance::input),
            )
            .push(text(label("storyWizard.music.moods")).size(15));
        for (mood, key) in MOODS {
            let caption = music.captions.get(mood);
            fields = fields.push(
                checkbox(caption.is_some())
                    .label(label(key))
                    .on_toggle(move |enabled| edit(MusicEdit::Mood(mood, enabled))),
            );
            if let Some(caption) = caption {
                let prompt = format("storyWizard.music.caption", &[("mood", label(key))]);
                fields = fields.push(
                    text_input(&prompt, caption)
                        .on_input(move |caption| edit(MusicEdit::Caption(mood, caption)))
                        .padding(8)
                        .style(appearance::input),
                );
            }
        }
        fields
            .push(
                checkbox(music.vocals)
                    .label(label("storyWizard.music.vocals"))
                    .on_toggle(move |enabled| edit(MusicEdit::Vocals(enabled))),
            )
            .push(muted(label("storyWizard.music.vocalsHint"), 12, &theme))
            .push(muted(label("storyWizard.native.musicPlanHint"), 12, &theme))
            .into()
    }

    pub(super) fn story_wizard_view<'a>(&'a self, wizard: &'a Wizard) -> Element<'a, Message> {
        let theme = self.theme();
        let mut progress = row![].spacing(12);
        for (index, step) in Step::ALL.into_iter().enumerate() {
            let title = format!("{}. {}", index + 1, label(step.key()));
            progress = if wizard.step == step {
                progress.push(text(title).size(13).color(theme.palette().primary))
            } else {
                progress.push(muted(title, 13, &theme))
            };
        }
        let choice = |title, detail, active, edit| {
            button(column![text(title).size(15), muted(detail, 12, &theme)].spacing(4))
                .style(if active {
                    appearance::primary_button
                } else {
                    appearance::subtle_button
                })
                .padding(10)
                .width(Fill)
                .on_press(Message::StageWizardEdit(edit))
        };
        let input = |key, value, edit: fn(String) -> Edit| {
            column![
                muted(label(key), 12, &theme),
                text_input(label(key), value)
                    .on_input(move |value| Message::StageWizardEdit(edit(value)))
                    .padding(9)
                    .style(appearance::input),
            ]
            .spacing(4)
        };
        let mut fields = column![].spacing(10);
        match wizard.step {
            Step::Genre => {
                fields = fields.push(text(label("storyWizard.genreQuestion")).size(16));
                for &[left, right] in GENRES.as_chunks::<2>().0 {
                    let genre = |genre: crate::stage_preview::Genre| {
                        choice(
                            label(genre.key()),
                            story_wizard::genre_hint(genre),
                            wizard.genre == genre,
                            Edit::Genre(genre),
                        )
                    };
                    fields = fields.push(row![genre(left), genre(right)].spacing(8));
                }
            }
            Step::Player => {
                fields = fields
                    .push(text(label("storyWizard.youQuestion")).size(16))
                    .push(input(
                        "storyWizard.playerName",
                        &wizard.player,
                        Edit::Player,
                    ))
                    .push(input(
                        "storyWizard.playerDescription",
                        &wizard.player_description,
                        Edit::PlayerDescription,
                    ));
            }
            Step::Companions => {
                fields = fields.push(
                    text(format(
                        "storyWizard.companionsQuestion",
                        &[("max", &MAX_COMPANIONS.to_string())],
                    ))
                    .size(16),
                );
                let mut seen = HashSet::new();
                for name in self
                    .preview
                    .characters
                    .iter()
                    .map(|character| character.name.as_str())
                    .chain(wizard.party.iter().map(String::as_str))
                    .filter(|name| !name.trim().is_empty() && seen.insert(*name))
                {
                    let selected = wizard.party.iter().any(|member| member == name);
                    let on_toggle =
                        move |_| Message::StageWizardEdit(Edit::Companion(name.to_owned()));
                    fields = fields.push(checkbox(selected).label(name).on_toggle_maybe(
                        (selected || wizard.party.len() < MAX_COMPANIONS).then_some(on_toggle),
                    ));
                }
                fields = fields.push(muted(
                    if wizard.party.is_empty() {
                        label("gallery.solo").into()
                    } else {
                        wizard.party.join(" · ")
                    },
                    13,
                    &theme,
                ));
            }
            Step::Premise => {
                fields = fields.push(text(label("storyWizard.startQuestion")).size(16));
                for premise in [Premise::First, Premise::Second] {
                    fields = fields.push(choice(
                        story_wizard::premise_text(wizard.genre, premise, "title"),
                        story_wizard::premise_text(wizard.genre, premise, "hook"),
                        wizard.premise == premise,
                        Edit::Premise(premise),
                    ));
                }
                fields = fields
                    .push(choice(
                        label("storyWizard.ownIdea"),
                        label("storyWizard.ownIdeaHint"),
                        wizard.premise == Premise::Own,
                        Edit::Premise(Premise::Own),
                    ))
                    .push(
                        button(label("storyWizard.roll"))
                            .style(appearance::subtle_button)
                            .on_press(Message::StageWizardEdit(Edit::Roll)),
                    );
                if wizard.premise == Premise::Own {
                    fields = fields
                        .push(
                            text_editor(&wizard.idea)
                                .placeholder(label("storyWizard.ownIdeaPlaceholder"))
                                .on_action(|action| Message::StageWizardEdit(Edit::Idea(action)))
                                .height(100)
                                .padding(8)
                                .style(appearance::editor),
                        )
                        .push(input(
                            "storyWizard.ownLocation",
                            &wizard.location,
                            Edit::Location,
                        ));
                }
            }
            Step::Music => fields = fields.push(self.story_music_fields(wizard)),
            Step::Review => match wizard.scene("wizard-preview") {
                Ok(scene) => {
                    fields = fields
                        .push(text(scene.title(CONTENT_LANGUAGE).to_owned()).size(20))
                        .push(muted(
                            scene.location(CONTENT_LANGUAGE).to_owned(),
                            13,
                            &theme,
                        ))
                        .push(text(scene.description(CONTENT_LANGUAGE).to_owned()).size(14))
                        .push(muted(
                            scene.opening(CONTENT_LANGUAGE).to_owned(),
                            13,
                            &theme,
                        ));
                }
                Err(error) => fields = fields.push(text(error).size(13)),
            },
        }
        let available = !self.stage.file_busy;
        let mut actions = row![
            button(label("common.cancel"))
                .style(appearance::subtle_button)
                .on_press_maybe(available.then_some(Message::StageWizardClose)),
        ]
        .spacing(8);
        if wizard.step != Step::Genre {
            actions = actions.push(
                button(label("storyWizard.back"))
                    .style(appearance::subtle_button)
                    .on_press_maybe(available.then_some(Message::StageWizardEdit(Edit::Back))),
            );
        }
        if wizard.step == Step::Review {
            let ready = available && !self.stage.loading && wizard.ready();
            actions = actions
                .push(
                    button(label("storyWizard.advanced"))
                        .style(appearance::subtle_button)
                        .on_press_maybe(
                            ready.then_some(Message::StageWizardFinish { advanced: true }),
                        ),
                )
                .push(
                    button(label("storyWizard.native.save"))
                        .style(appearance::primary_button)
                        .on_press_maybe(
                            ready.then_some(Message::StageWizardFinish { advanced: false }),
                        ),
                );
        } else {
            actions = actions.push(
                button(label("storyWizard.next"))
                    .style(appearance::primary_button)
                    .on_press_maybe(
                        (wizard.step != Step::Premise || wizard.ready())
                            .then_some(Message::StageWizardEdit(Edit::Next)),
                    ),
            );
        }
        let mut content = column![
            text(label("storyWizard.title")).size(25),
            progress.wrap(),
            container(fields)
                .padding(16)
                .width(Fill)
                .style(appearance::card),
            actions.wrap(),
        ]
        .spacing(12);
        if self.stage.file_busy {
            content = content.push(muted(label("common.loading"), 13, &theme));
        }
        if !self.stage.edit_error.is_empty() {
            content = content.push(
                text(&self.stage.edit_error)
                    .size(13)
                    .color(theme.palette().danger),
            );
        }
        scroll(container(content.padding(24).max_width(850)).center_x(Fill))
            .width(Fill)
            .height(Fill)
            .into()
    }
}
