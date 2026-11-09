//! Story-Galerie und Szenariovorschau nach dem Stage-Einstieg in Tauri.
use crate::appearance;
use crate::icons::{Icon, icon};
use crate::stage_preview::{Collection, Genre, Scene};
use crate::ui_text::{CONTENT_LANGUAGE, format, text as label};
use crate::views::{control, muted, scroll};
use crate::{App, Message, StageFilter};
use iced::widget::{Space, button, column, container, image, row, scrollable, stack, text};
use iced::{Alignment, Background, Color, Element, Fill, Radians};
use std::sync::LazyLock;

impl App {
    pub(super) fn stage_view(&self) -> Element<'_, Message> {
        if self.stage.editing
            && let Some(draft) = &self.stage.draft
        {
            return self.scene_editor(draft);
        }
        if let Some(scene) = self
            .stage
            .selected
            .and_then(|index| self.stage.scenes.get(index))
        {
            return self.scene_preview(scene);
        }
        if let Some(wizard) = &self.stage.wizard {
            return self.story_wizard_view(wizard);
        }
        if self.stage.lobby {
            return self.scene_lobby();
        }
        iced::widget::responsive(move |size| self.story_gallery(size.width)).into()
    }

    fn story_gallery(&self, width: f32) -> Element<'_, Message> {
        let mut gallery = column![
            column![
                text(label("gallery.title")).size(26),
                muted(label("gallery.native.intro"), 14, &self.theme()),
            ]
            .spacing(6),
            row![
                control(
                    Icon::Plus,
                    label(if self.stage.draft.is_some() {
                        "gallery.native.resumeScene"
                    } else {
                        "gallery.create"
                    }),
                    if self.stage.draft.is_some() {
                        Message::StageEdit(None)
                    } else {
                        Message::StageOpenWizard
                    }
                ),
                control(
                    Icon::Settings,
                    label("gallery.manage"),
                    Message::StageManage
                ),
                control(
                    Icon::Hub,
                    label("gallery.native.hub"),
                    Message::StageBrowseHub
                ),
            ]
            .spacing(12)
            .wrap(),
        ]
        .spacing(18);
        let width = (width - 48.0).max(1.0);
        if self.stage.filter == StageFilter::All {
            gallery = gallery.push(muted(label("gallery.collections"), 13, &self.theme()));
            let mut collections = column![].spacing(12);
            if width < 650.0 {
                collections = collections
                    .push(self.collection_card(Collection::Starter, width))
                    .push(self.collection_card(Collection::Crypt, width));
            } else {
                let card_width = (width - 12.0) / 2.0;
                collections = collections.push(
                    row![
                        self.collection_card(Collection::Starter, card_width),
                        self.collection_card(Collection::Crypt, card_width),
                    ]
                    .spacing(12)
                    .align_y(Alignment::Start),
                );
            }
            gallery = gallery.push(collections);
        }
        if let StageFilter::Collection(collection) = self.stage.filter {
            let (title, _, _) = collection_style(collection);
            gallery = gallery.push(
                row![
                    control(
                        Icon::Back,
                        label("gallery.collectionAll"),
                        Message::StageFilter(StageFilter::All)
                    ),
                    text(label(title)).size(19),
                ]
                .spacing(12)
                .align_y(Alignment::Center),
            );
        } else {
            let mut filters = row![].spacing(7);
            for (filter, name) in [
                (StageFilter::All, "gallery.filter.all"),
                (StageFilter::Beginner, "gallery.filter.beginner"),
            ] {
                filters = filters.push(self.story_filter(filter, name));
            }
            let mut seen = Vec::new();
            for scene in &self.stage.scenes {
                if !seen.contains(&scene.genre) {
                    seen.push(scene.genre);
                    filters = filters.push(
                        self.story_filter(StageFilter::Genre(scene.genre), scene.genre.key()),
                    );
                }
            }
            gallery = gallery.push(
                scrollable(filters)
                    .direction(scrollable::Direction::Horizontal(
                        scrollable::Scrollbar::new().width(5).scroller_width(5),
                    ))
                    .style(appearance::scrollbar)
                    .height(38)
                    .width(Fill),
            );
        }
        let first_act = self
            .stage
            .scenes
            .iter()
            .enumerate()
            .filter(|(_, scene)| scene.collection() == Some(Collection::Crypt))
            .min_by_key(|(_, scene)| &scene.id)
            .map(|(index, _)| index);
        let visible: Vec<_> = self
            .stage
            .scenes
            .iter()
            .enumerate()
            .filter(|(index, scene)| {
                if let StageFilter::Collection(collection) = self.stage.filter {
                    return scene.collection() == Some(collection);
                }
                if scene.collection() == Some(Collection::Crypt) && Some(*index) != first_act {
                    return false;
                }
                match self.stage.filter {
                    StageFilter::All => true,
                    StageFilter::Beginner => scene.beginner,
                    StageFilter::Genre(genre) => scene.genre == genre,
                    StageFilter::Collection(_) => unreachable!(),
                }
            })
            .collect();
        let cols = crate::library::columns(width).min(3);
        let card_width = ((width - 12.0 * (cols - 1) as f32) / cols as f32).max(1.0);
        for group in visible.chunks(cols) {
            let mut cards = row![].spacing(12).align_y(Alignment::Start);
            for (index, scene) in group {
                cards = cards.push(self.story_card(*index, scene, card_width));
            }
            gallery = gallery.push(cards);
        }
        scroll(gallery.padding(24)).width(Fill).height(Fill).into()
    }

    fn story_filter(&self, filter: StageFilter, name: &'static str) -> Element<'_, Message> {
        button(text(label(name)).size(12))
            .padding([6, 11])
            .style(if self.stage.filter == filter {
                appearance::primary_button
            } else {
                appearance::subtle_button
            })
            .on_press(Message::StageFilter(filter))
            .into()
    }

    fn collection_card(&self, collection: Collection, width: f32) -> Element<'_, Message> {
        let (title, description, cover) = collection_style(collection);
        let count = self
            .stage
            .scenes
            .iter()
            .filter(|scene| scene.collection() == Some(collection))
            .count();
        let details = column![
            muted(label("gallery.collection"), 11, &self.theme()),
            text(label(title)).size(19),
            muted(label(description), 13, &self.theme()),
            row![
                icon(Icon::Stage, 14),
                muted(
                    format!("{} {count}", label("gallery.collectionStories")),
                    12,
                    &self.theme()
                ),
                Space::new().width(Fill),
                control(
                    Icon::Eye,
                    label("gallery.look"),
                    Message::StageFilter(StageFilter::Collection(collection))
                ),
            ]
            .spacing(7)
            .align_y(Alignment::Center),
        ]
        .spacing(8);
        container(column![
            image(cover.clone())
                .width(Fill)
                .height(146)
                .content_fit(iced::ContentFit::Cover),
            container(details).padding(14).width(Fill),
        ])
        .width(width)
        .style(appearance::card)
        .clip(true)
        .into()
    }

    fn story_card<'a>(
        &'a self,
        index: usize,
        scene: &'a Scene,
        width: f32,
    ) -> Element<'a, Message> {
        let details = column![
            text(scene.title(CONTENT_LANGUAGE)).size(17),
            muted(
                crate::views::shorten(scene.description(CONTENT_LANGUAGE), 170),
                13,
                &self.theme()
            ),
            muted(story_meta(scene), 12, &self.theme()),
            control(
                Icon::Eye,
                label("gallery.look"),
                Message::StageSelect(index)
            ),
        ]
        .spacing(8);
        container(column![
            genre_banner(scene, 108),
            container(details).padding(14).width(Fill),
        ])
        .width(width)
        .style(appearance::card)
        .clip(true)
        .into()
    }

    fn scene_preview<'a>(&'a self, scene: &'a Scene) -> Element<'a, Message> {
        let location = [
            scene.location(CONTENT_LANGUAGE),
            scene.time_of_day(CONTENT_LANGUAGE),
        ]
        .into_iter()
        .filter(|field| !field.is_empty())
        .collect::<Vec<_>>()
        .join(" · ");
        let mut body = column![
            control(Icon::Back, label("common.back"), Message::StageBack),
            container(genre_banner(scene, 130))
                .width(Fill)
                .style(appearance::card)
                .clip(true),
            text(scene.title(CONTENT_LANGUAGE)).size(25),
            muted(story_meta(scene), 13, &self.theme()),
        ]
        .spacing(14);
        if !location.is_empty() {
            body = body.push(
                row![icon(Icon::Hub, 16), muted(location, 13, &self.theme())]
                    .spacing(8)
                    .align_y(Alignment::Center),
            );
        }
        if self.stage.opening {
            body = body.push(
                container(
                    column![
                        text(label("gallery.native.opening")).size(17),
                        text(scene.opening(CONTENT_LANGUAGE)).size(16),
                    ]
                    .spacing(10),
                )
                .padding(18)
                .width(Fill)
                .style(appearance::card),
            );
        } else {
            body = body.push(text(scene.description(CONTENT_LANGUAGE)).size(15));
            if !scene.party.is_empty() {
                body = body.push(muted(
                    format!("{} {}", label("stage.party"), scene.party.join(" · ")),
                    13,
                    &self.theme(),
                ));
            }
            if !scene.lorebooks.is_empty() {
                body = body.push(muted(
                    format!(
                        "{} · {}",
                        label("hub.tabLorebooks"),
                        scene.lorebooks.join(" · ")
                    ),
                    13,
                    &self.theme(),
                ));
            }
            if !scene.notes.is_empty() {
                body = body.push(muted(
                    scene
                        .notes
                        .iter()
                        .map(|key| label(key))
                        .collect::<Vec<_>>()
                        .join(" · "),
                    13,
                    &self.theme(),
                ));
            }
        }
        let choices = scene.choices(CONTENT_LANGUAGE);
        if !choices.is_empty() {
            let mut ideas = column![text(label("gallery.ideas")).size(14)].spacing(6);
            for choice in choices {
                ideas = ideas.push(text(format!("• {choice}")).size(14));
            }
            body = body.push(
                container(ideas)
                    .padding(14)
                    .width(Fill)
                    .style(appearance::card),
            );
        }
        if !self.stage.opening && !scene.opening(CONTENT_LANGUAGE).is_empty() {
            body = body.push(control(
                Icon::Eye,
                label("gallery.native.readOpening"),
                Message::StageOpening,
            ));
        }
        scroll(container(body.padding(24).max_width(760)).center_x(Fill))
            .width(Fill)
            .height(Fill)
            .into()
    }
}

fn story_meta(scene: &Scene) -> String {
    let mut parts = Vec::new();
    if let Some(minutes) = scene.minutes {
        parts.push(format(
            "gallery.minutes",
            &[("minutes", &minutes.to_string())],
        ));
    }
    if let Some(difficulty) = scene.difficulty {
        parts.push(label(difficulty).into());
    }
    if scene.genre == Genre::Adventure5e {
        parts.push(label("gallery.rules5e").into());
    }
    parts.join(" · ")
}

fn collection_style(
    collection: Collection,
) -> (&'static str, &'static str, &'static image::Handle) {
    static STARTER: LazyLock<image::Handle> = LazyLock::new(|| {
        image::Handle::from_bytes(&include_bytes!("../../presets/stories/cover.webp")[..])
    });
    static CRYPT: LazyLock<image::Handle> = LazyLock::new(|| {
        image::Handle::from_bytes(&include_bytes!("../../presets/crypt-of-shadows/cover.webp")[..])
    });
    match collection {
        Collection::Starter => (
            "gallery.collectionStarter",
            "gallery.collectionStarterText",
            &STARTER,
        ),
        Collection::Crypt => (
            "gallery.collectionCrypt",
            "gallery.collectionCryptText",
            &CRYPT,
        ),
    }
}

fn genre_banner(scene: &Scene, height: u32) -> Element<'static, Message> {
    let (symbol, start) = match scene.genre {
        Genre::Fantasy => (Icon::Sun, Color::from_rgb8(7, 89, 133)),
        Genre::Adventure => (Icon::Hub, Color::from_rgb8(6, 95, 70)),
        Genre::Comedy => (Icon::Sun, Color::from_rgb8(161, 98, 7)),
        Genre::Romance | Genre::SliceOfLife => (Icon::Characters, Color::from_rgb8(157, 23, 77)),
        Genre::Mystery => (Icon::Search, Color::from_rgb8(146, 64, 14)),
        Genre::SciFi => (Icon::Companion, Color::from_rgb8(21, 94, 117)),
        Genre::Horror => (Icon::Moon, Color::from_rgb8(76, 29, 149)),
        Genre::Adventure5e => (Icon::Stage, Color::from_rgb8(159, 18, 57)),
        Genre::Custom => (Icon::Lorebooks, Color::from_rgb8(51, 65, 85)),
    };
    let backdrop = container(icon(symbol, 44))
        .center_x(Fill)
        .center_y(height)
        .style(move |_| {
            let gradient = iced::gradient::Linear::new(Radians(2.1))
                .add_stop(0.0, start)
                .add_stop(1.0, Color::from_rgb8(2, 6, 23));
            container::Style {
                background: Some(Background::from(gradient)),
                ..Default::default()
            }
        });
    let mut chips = row![
        stage_badge(label(scene.genre.key()), Color::from_rgba8(2, 6, 23, 0.7)),
        Space::new().width(Fill)
    ]
    .spacing(8);
    if scene.beginner {
        chips = chips.push(stage_badge(
            label("gallery.beginner"),
            Color::from_rgb8(6, 95, 70),
        ));
    }
    stack![backdrop, container(chips).padding(10).width(Fill)]
        .width(Fill)
        .height(height)
        .into()
}

fn stage_badge(value: &'static str, background: Color) -> Element<'static, Message> {
    container(text(value).size(11).color(Color::WHITE))
        .padding([4, 7])
        .style(move |_| container::Style {
            background: Some(background.into()),
            border: iced::Border::default().rounded(12),
            ..Default::default()
        })
        .into()
}
