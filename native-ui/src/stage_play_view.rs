use crate::stage_play::{Mode, Pending, Play, Round, player_name};
use crate::stage_preview::{Genre, Scene};
use crate::stage_progress::{self, Key, Saved, Source};
use crate::ui_text::{CONTENT_LANGUAGE, text as label};
use crate::views::{control, muted, scroll};
use crate::{App, Message, Page, appearance, background, connection, icons::Icon};
use iced::widget::{button, column, container, pick_list, row, text, text_editor};
use iced::{Alignment, Element, Fill, Task};

const TURNS: &str = "stage-turns";

impl App {
    pub(super) fn start_stage_play(&mut self) {
        if self.page != Page::Stage || self.stage.editing || self.stage.progress_loading {
            return;
        }
        let Some(index) = self.stage.selected else {
            return;
        };
        if self
            .stage
            .scenes
            .get(index)
            .is_none_or(|scene| scene.genre == Genre::Adventure5e)
        {
            return;
        }
        if !self.stage.plays.contains_key(&index) {
            let key = self.stage_progress_key(index);
            let mut play = Play::default();
            if let Some(saved) = self
                .stage
                .saved_plays
                .iter()
                .position(|save| save.key == key)
            {
                play.rounds = self.stage.saved_plays.swap_remove(saved).rounds;
                play.persisted = play.rounds.len();
                if let Some(round) = play.rounds.last() {
                    play.mode = round.mode;
                }
            }
            self.stage.plays.insert(index, play);
        }
        self.stage.opening = false;
        self.stage.playing = true;
    }

    pub(super) fn editable_stage_play(&mut self) -> Option<&mut Play> {
        if self.page != Page::Stage || !self.stage.playing || self.stage.turn.is_some() {
            return None;
        }
        self.stage.plays.get_mut(&self.stage.selected?)
    }

    pub(super) fn send_stage_turn(&mut self) -> Task<Message> {
        if self.page != Page::Stage
            || !self.stage.playing
            || self.stage.turn.is_some()
            || self.profile_busy
        {
            return Task::none();
        }
        let Some(index) = self.stage.selected else {
            return Task::none();
        };
        let (Some(scene), Some(play)) = (
            self.stage.scenes.get(index),
            self.stage.plays.get_mut(&index),
        ) else {
            return Task::none();
        };
        let draft = play.editor.text();
        if !self.llm.ready() {
            play.error = label("llm.native.startFirst").into();
            return Task::none();
        }
        let input = draft.trim();
        if input.is_empty() || play.saving || scene.genre == Genre::Adventure5e {
            return Task::none();
        }
        let request = play.request(scene, input);
        play.error.clear();
        let settings = self.connection.clone();
        self.stage.turn_id += 1;
        let id = self.stage.turn_id;
        let cancellation = connection::Cancellation::new();
        self.stage.turn = Some(Pending {
            scene: index,
            request: connection::ActiveRequest {
                id,
                cancellation: cancellation.clone(),
            },
            mode: play.mode,
            input: input.into(),
        });
        Task::perform(
            background(move || connection::run_chat(settings, cancellation, request)),
            move |result| Message::StageTurnFinished(id, result),
        )
    }

    pub(super) fn finish_stage_turn(
        &mut self,
        id: u64,
        result: Result<String, String>,
    ) -> Task<Message> {
        if self.stage.turn.as_ref().map(|turn| turn.request.id) != Some(id) {
            return Task::none();
        }
        let turn = self.stage.turn.take().expect("aktiver Stage-Zug");
        let Some(play) = self.stage.plays.get_mut(&turn.scene) else {
            return Task::none();
        };
        match result {
            Ok(reply) if !reply.trim().is_empty() => {
                play.rounds.push(Round {
                    mode: turn.mode,
                    input: turn.input,
                    reply,
                });
                play.editor = text_editor::Content::new();
                Task::batch([
                    iced::widget::operation::snap_to_end(TURNS),
                    self.save_stage_progress(turn.scene),
                ])
            }
            Ok(_) => {
                play.error = label("stage.native.emptyReply").into();
                Task::none()
            }
            Err(error) => {
                play.error = error;
                Task::none()
            }
        }
    }

    fn stage_progress_key(&self, index: usize) -> Key {
        let scene = &self.stage.scenes[index];
        let source = if self.stage.own.contains(&index) {
            Source::Own
        } else if scene.collection().is_some() {
            Source::Preset
        } else {
            Source::Hub
        };
        Key {
            source,
            id: scene.id.clone(),
        }
    }

    pub(super) fn stage_has_progress(&self, index: usize) -> bool {
        self.stage.plays.contains_key(&index)
            || self
                .stage
                .saved_plays
                .iter()
                .any(|save| save.key == self.stage_progress_key(index))
    }

    pub(super) fn restore_stage_progress(&mut self, result: Result<Vec<Saved>, String>) {
        self.stage.progress_loading = false;
        let saved = match result {
            Ok(saved) => saved,
            Err(error) => {
                self.stage.progress_error = error;
                return;
            }
        };
        for play in &saved {
            if let Some(definition) = &play.hub_definition
                && !self.stage.from_hub.contains_key(&play.key.id)
                && let Ok(scene) = crate::stage_preview::parse(definition.clone())
            {
                self.stage
                    .from_hub
                    .insert(play.key.id.clone(), self.stage.scenes.len());
                self.stage.scenes.push(scene);
            }
        }
        self.stage.saved_plays = saved;
    }

    pub(super) fn save_stage_progress(&mut self, index: usize) -> Task<Message> {
        let key = self.stage_progress_key(index);
        let Some(play) = self.stage.plays.get_mut(&index) else {
            return Task::none();
        };
        if play.saving || play.persisted >= play.rounds.len() {
            return Task::none();
        }
        let Some(root) = self.stage.store.clone() else {
            play.save_error = label("gallery.native.storeUnavailable").into();
            return Task::none();
        };
        let pending = Saved {
            hub_definition: (key.source == Source::Hub)
                .then(|| self.stage.scenes[index].definition()),
            key,
            rounds: play.rounds[play.persisted..].to_vec(),
        };
        let expected = play.persisted;
        play.saving = true;
        play.save_error.clear();
        Task::perform(
            background(move || stage_progress::append(&root, pending, expected)),
            move |result| Message::StageProgressSaved(index, result),
        )
    }

    pub(super) fn finish_stage_progress(&mut self, index: usize, result: Result<usize, String>) {
        if let Some(play) = self.stage.plays.get_mut(&index).filter(|play| play.saving) {
            play.saving = false;
            match result {
                Ok(count) => {
                    play.persisted = count;
                    self.stage.progress_error.clear();
                }
                Err(error) => play.save_error = error,
            }
        }
    }

    pub(super) fn stage_play_view<'a>(
        &'a self,
        scene: &'a Scene,
        play: &'a Play,
    ) -> Element<'a, Message> {
        let theme = self.theme();
        let busy = self.stage.turn.is_some();
        let narrator = label("stage.native.narrator");
        let bubble = |name: String, content: &'a str| {
            container(column![muted(name, 12, &theme), text(content).size(15)].spacing(5))
                .padding(12)
                .width(Fill)
                .style(appearance::card)
        };
        let mut transcript = column![].spacing(8);
        let opening = scene.opening(CONTENT_LANGUAGE);
        if !opening.is_empty() {
            transcript = transcript.push(bubble(narrator.into(), opening));
        }
        for round in &play.rounds {
            transcript = transcript
                .push(bubble(
                    format!("{} · {}", player_name(scene), label(round.mode.key())),
                    &round.input,
                ))
                .push(bubble(narrator.into(), &round.reply));
        }
        if play.rounds.is_empty() {
            let mut ideas = row![].spacing(6);
            for choice in scene.choices(CONTENT_LANGUAGE) {
                ideas = ideas.push(
                    button(text(choice).size(13))
                        .style(appearance::subtle_button)
                        .on_press_maybe(
                            (!busy).then(|| Message::StageTurnChoice(choice.to_owned())),
                        ),
                );
            }
            transcript = transcript.push(ideas.wrap());
        }
        let mut composer = column![
            row![
                muted(label("stage.modeLabel"), 12, &theme),
                pick_list(Mode::ALL, Some(play.mode), Message::StageTurnMode)
                    .style(appearance::select)
                    .padding(7),
            ]
            .spacing(8)
            .align_y(Alignment::Center),
            text_editor(&play.editor)
                .placeholder(label("stage.native.turnPlaceholder"))
                .on_action(Message::StageTurnEdit)
                .height(85)
                .padding(9)
                .style(appearance::editor),
        ]
        .spacing(8);
        if busy {
            composer = composer.push(
                row![
                    muted(label("stage.native.waiting"), 13, &theme),
                    button(label("stage.stopTurn"))
                        .style(appearance::subtle_button)
                        .on_press(Message::StageCancelTurn),
                ]
                .spacing(8)
                .align_y(Alignment::Center),
            );
        } else {
            composer = composer.push(
                button(label("stage.sendTurn"))
                    .style(appearance::primary_button)
                    .on_press_maybe(
                        (!play.editor.text().trim().is_empty()
                            && !play.saving
                            && !self.profile_busy)
                            .then_some(Message::StageSendTurn),
                    ),
            );
        }
        if !play.error.is_empty() {
            composer = composer.push(text(&play.error).size(13).color(theme.palette().danger));
        }
        if play.saving {
            composer = composer.push(muted(label("stage.native.savingProgress"), 13, &theme));
        } else if !play.save_error.is_empty() {
            composer = composer.push(
                row![
                    text(crate::ui_text::format(
                        "stage.native.progressError",
                        &[("error", &play.save_error)]
                    ))
                    .color(theme.palette().danger)
                    .size(13),
                    button(label("stage.native.retryProgress"))
                        .style(appearance::subtle_button)
                        .on_press(Message::StageRetryProgress),
                ]
                .spacing(8)
                .wrap(),
            );
        } else if !self.stage.progress_error.is_empty() {
            composer = composer.push(
                text(&self.stage.progress_error)
                    .size(13)
                    .color(theme.palette().danger),
            );
        }
        column![
            control(Icon::Back, label("common.back"), Message::StageBack),
            text(scene.title(CONTENT_LANGUAGE)).size(25),
            muted(scene.location(CONTENT_LANGUAGE), 13, &theme),
            muted(label("stage.native.roundHint"), 12, &theme),
            scroll(transcript).id(TURNS).height(Fill),
            composer,
        ]
        .spacing(12)
        .padding(24)
        .height(Fill)
        .into()
    }
}
