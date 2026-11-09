//! Farben und Komponenten des Community Hubs.

use crate::appearance;
use iced::widget::{button, container};
use iced::{Background, Border, Color, Theme};

pub fn accent(theme: &Theme) -> Color {
    if dark(theme) {
        Color::from_rgb8(56, 189, 248)
    } else {
        Color::from_rgb8(3, 105, 161)
    }
}

pub fn canvas(theme: &Theme) -> container::Style {
    container::Style {
        background: Some(
            surface_color(theme, Color::BLACK, Color::from_rgb8(248, 250, 252)).into(),
        ),
        ..Default::default()
    }
}

pub fn header(theme: &Theme) -> container::Style {
    strip(
        theme,
        Color::from_rgb8(15, 23, 42),
        Color::from_rgb8(241, 245, 249),
    )
}

pub fn toolbar(theme: &Theme) -> container::Style {
    strip(theme, Color::from_rgb8(8, 12, 20), Color::WHITE)
}

pub fn accent_badge(theme: &Theme) -> container::Style {
    container::Style {
        text_color: Some(accent(theme)),
        background: Some(accent_background(theme, false).into()),
        border: Border::default().rounded(16.0),
        ..Default::default()
    }
}

pub fn filter(theme: &Theme, status: button::Status, selected: bool) -> button::Style {
    let highlight = hovered(status);
    let fill = if selected {
        accent_background(theme, highlight)
    } else if highlight {
        surface_color(
            theme,
            Color::from_rgb8(30, 41, 59),
            Color::from_rgb8(226, 232, 240),
        )
    } else {
        surface_color(
            theme,
            Color::from_rgb8(17, 24, 39),
            Color::from_rgb8(248, 250, 252),
        )
    };
    button::Style {
        background: Some(fill.into()),
        text_color: if selected {
            accent(theme)
        } else {
            appearance::muted(theme)
        },
        border: Border {
            color: if selected || highlight {
                Color {
                    a: 0.56,
                    ..accent(theme)
                }
            } else {
                outline(theme)
            },
            width: 1.0,
            radius: 16.0.into(),
        },
        ..Default::default()
    }
}

pub fn world_tab(theme: &Theme, status: button::Status) -> button::Style {
    button::Style {
        background: hovered(status).then(|| accent_background(theme, false).into()),
        text_color: accent(theme),
        border: Border::default().rounded(6.0),
        ..Default::default()
    }
}

pub fn collection(theme: &Theme, status: button::Status) -> button::Style {
    button::Style {
        background: Some(surface_color(theme, Color::from_rgb8(12, 18, 30), Color::WHITE).into()),
        text_color: theme.palette().text,
        border: Border {
            color: if hovered(status) {
                accent(theme)
            } else {
                outline(theme)
            },
            width: 1.0,
            radius: 16.0.into(),
        },
        ..Default::default()
    }
}

pub fn cover_shade(_theme: &Theme) -> container::Style {
    let fade = iced::gradient::Linear::new(std::f32::consts::PI)
        .add_stop(0.0, Color::TRANSPARENT)
        .add_stop(0.40, Color::TRANSPARENT)
        .add_stop(1.0, Color::from_rgba8(0, 0, 0, 0.80));
    container::Style {
        background: Some(Background::Gradient(fade.into())),
        border: Border::default().rounded(iced::border::top(16.0)),
        ..Default::default()
    }
}

pub fn cover_label(_theme: &Theme) -> container::Style {
    container::Style {
        text_color: Some(Color::WHITE),
        background: Some(Color::from_rgba8(0, 0, 0, 0.72).into()),
        border: Border::default().rounded(8.0),
        ..Default::default()
    }
}

fn strip(theme: &Theme, dark_color: Color, light_color: Color) -> container::Style {
    container::Style {
        background: Some(surface_color(theme, dark_color, light_color).into()),
        border: Border {
            color: outline(theme),
            width: 1.0,
            ..Default::default()
        },
        ..Default::default()
    }
}

fn outline(theme: &Theme) -> Color {
    surface_color(
        theme,
        Color::from_rgb8(27, 41, 60),
        Color::from_rgb8(203, 213, 225),
    )
}

fn accent_background(theme: &Theme, highlighted: bool) -> Color {
    Color {
        a: if highlighted { 0.24 } else { 0.16 },
        ..accent(theme)
    }
}

fn hovered(status: button::Status) -> bool {
    matches!(status, button::Status::Hovered | button::Status::Pressed)
}

fn surface_color(theme: &Theme, dark_color: Color, light_color: Color) -> Color {
    if dark(theme) { dark_color } else { light_color }
}

fn dark(theme: &Theme) -> bool {
    theme.extended_palette().is_dark
}
