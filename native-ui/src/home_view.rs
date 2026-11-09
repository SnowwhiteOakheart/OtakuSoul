//! Startansicht nach dem React-HomeView mit direkten Einstiegen in die drei Hauptbereiche.

use super::{App, Message, Page, appearance};
use crate::icons::{Icon, icon};
use crate::ui_text;
use crate::views::{control, muted, scroll};
use iced::widget::{button, column, container, image, row, svg, text};
use iced::{Alignment, Background, Border, Color, Element, Fill, Theme};
use std::borrow::Cow;

struct CardCopy<'a> {
    title: Cow<'a, str>,
    hint: &'static str,
    action: &'static str,
}

impl App {
    pub(super) fn home(&self) -> Element<'_, Message> {
        iced::widget::responsive(move |size| self.home_content(size.width)).into()
    }

    fn home_content(&self, available_width: f32) -> Element<'_, Message> {
        let width = (available_width - 48.0).clamp(1.0, 1000.0);
        let columns = if width >= 820.0 {
            3
        } else if width >= 560.0 {
            2
        } else {
            1
        };
        let card_width = (width - 16.0 * (columns - 1) as f32) / columns as f32;
        let theme = self.theme();
        let dark = theme.extended_palette().is_dark;
        let chat_accent = if dark {
            Color::from_rgb8(216, 180, 254)
        } else {
            Color::from_rgb8(109, 40, 217)
        };
        let stage_accent = if dark {
            Color::from_rgb8(253, 164, 175)
        } else {
            Color::from_rgb8(159, 18, 57)
        };
        let hub_accent = if dark {
            Color::from_rgb8(110, 231, 183)
        } else {
            Color::from_rgb8(6, 95, 70)
        };
        let persona = self.prompt_settings.persona_name.trim();
        let greeting = if persona.is_empty() || persona == "User" {
            ui_text::text("home.greeting").into()
        } else {
            ui_text::format("home.greetingName", &[("name", persona)])
        };
        let character = self.preview.character();
        let chat_title = ui_text::format("home.chatWith", &[("name", &character.name)]);
        let chat_symbol = self
            .preview
            .characters
            .iter()
            .position(|item| item.id == character.id)
            .and_then(|index| self.portraits.get(index))
            .and_then(Option::as_ref)
            .map_or_else(
                || home_symbol(Icon::Chat, chat_accent),
                |portrait| {
                    image(portrait.clone())
                        .width(46)
                        .height(46)
                        .content_fit(iced::ContentFit::Cover)
                        .border_radius(10)
                        .into()
                },
            );
        let cards = row![
            home_card(
                chat_symbol,
                CardCopy {
                    title: chat_title.into(),
                    hint: "home.native.chatHint",
                    action: "home.chatContinue",
                },
                Page::Chat,
                card_width,
                chat_accent,
                &theme,
            ),
            home_card(
                home_symbol(Icon::Stage, stage_accent),
                CardCopy {
                    title: ui_text::text("home.storyTitle").into(),
                    hint: "home.native.stageHint",
                    action: "home.storyChoose",
                },
                Page::Stage,
                card_width,
                stage_accent,
                &theme,
            ),
            home_card(
                home_symbol(Icon::Hub, hub_accent),
                CardCopy {
                    title: ui_text::text("home.discoverTitle").into(),
                    hint: "home.discoverHint",
                    action: "home.discover",
                },
                Page::Hub,
                card_width,
                hub_accent,
                &theme,
            ),
        ]
        .spacing(16)
        .wrap();
        let settings = container(
            row![
                icon(Icon::Settings, 18),
                muted(ui_text::text("home.native.modelHint"), 13, &theme).width(Fill),
                control(
                    Icon::Settings,
                    ui_text::text("nav.settings"),
                    Message::Navigate(Page::Settings),
                ),
            ]
            .spacing(12)
            .align_y(Alignment::Center),
        )
        .padding([12, 16])
        .width(Fill)
        .style(appearance::card);
        let shortcuts = row![
            control(
                Icon::Characters,
                ui_text::text("nav.characters"),
                Message::Navigate(Page::Characters),
            ),
            control(
                Icon::Lorebooks,
                ui_text::text("home.lorebooks"),
                Message::Navigate(Page::Lorebooks),
            ),
        ]
        .spacing(8)
        .wrap();
        let content = column![
            column![
                text(greeting).size(28),
                muted(ui_text::text("home.question"), 14, &theme),
            ]
            .spacing(5),
            settings,
            cards,
            shortcuts,
        ]
        .spacing(22)
        .width(width);
        scroll(container(content).center_x(Fill).padding(24))
            .height(Fill)
            .width(Fill)
            .into()
    }
}

fn home_symbol(symbol: Icon, accent: Color) -> Element<'static, Message> {
    container(icon(symbol, 23).style(move |_, _| svg::Style {
        color: Some(accent),
    }))
    .center_x(46)
    .center_y(46)
    .style(move |_| container::Style {
        background: Some(Background::Color(Color { a: 0.15, ..accent })),
        border: Border::default().rounded(10),
        ..container::Style::default()
    })
    .into()
}

fn home_card<'a>(
    symbol: Element<'a, Message>,
    copy: CardCopy<'a>,
    page: Page,
    width: f32,
    accent: Color,
    theme: &Theme,
) -> Element<'a, Message> {
    button(
        column![
            row![symbol, text(copy.title).size(17)]
                .spacing(10)
                .align_y(Alignment::Center),
            muted(ui_text::text(copy.hint), 13, theme),
            row![
                text(ui_text::text(copy.action)).size(13).color(accent),
                text("→").size(16).color(accent),
            ]
            .spacing(6)
            .align_y(Alignment::Center),
        ]
        .spacing(12),
    )
    .padding(18)
    .width(width)
    .style(move |theme, status| {
        let card = appearance::card(theme);
        let mut border = card.border;
        if matches!(status, button::Status::Hovered | button::Status::Pressed) {
            border.color = accent;
        }
        button::Style {
            background: card.background,
            text_color: theme.palette().text,
            border,
            ..button::Style::default()
        }
    })
    .on_press(Message::Navigate(page))
    .into()
}
