//! Farben und wiederverwendbare Iced-Stile passend zur Obsidian-Oberfläche.

use iced::widget::{button, container, text_editor};
use iced::{Background, Color, Theme};

const SLATE_950: Color = Color::from_rgb8(2, 6, 23);
const SLATE_900: Color = Color::from_rgb8(15, 23, 42);
const SLATE_800: Color = Color::from_rgb8(30, 41, 59);
const SLATE_700: Color = Color::from_rgb8(51, 65, 85);
const SLATE_600: Color = Color::from_rgb8(71, 85, 105);
const SLATE_500: Color = Color::from_rgb8(122, 138, 163);
const SLATE_200: Color = Color::from_rgb8(226, 232, 240);
const SLATE_50: Color = Color::from_rgb8(248, 250, 252);
const PURPLE_500: Color = Color::from_rgb8(168, 85, 247);
const PURPLE_600: Color = Color::from_rgb8(147, 51, 234);
const PURPLE_700: Color = Color::from_rgb8(126, 34, 206);

/// Erzeugt das Obsidian-Farbschema im dunklen oder hellen Modus.
pub fn theme(dark: bool) -> Theme {
    let palette = if dark {
        iced::theme::Palette {
            background: SLATE_950,
            text: SLATE_200,
            primary: PURPLE_600,
            success: Color::from_rgb8(16, 185, 129),
            warning: Color::from_rgb8(245, 158, 11),
            danger: Color::from_rgb8(244, 63, 94),
        }
    } else {
        iced::theme::Palette {
            background: SLATE_50,
            text: SLATE_950,
            primary: PURPLE_700,
            success: Color::from_rgb8(6, 95, 70),
            warning: Color::from_rgb8(146, 64, 14),
            danger: Color::from_rgb8(159, 18, 57),
        }
    };

    Theme::custom(
        if dark {
            "OtakuSoul Obsidian"
        } else {
            "OtakuSoul Hell"
        },
        palette,
    )
}

/// Dezente Sekundärtextfarbe mit ausreichendem Kontrast auf den Flächen.
pub fn muted(theme: &Theme) -> Color {
    if theme.extended_palette().is_dark {
        SLATE_500
    } else {
        SLATE_600
    }
}

/// Flächenstil für Seitenleisten und größere Bereiche.
pub fn panel(theme: &Theme) -> container::Style {
    let dark = is_dark(theme);
    container::Style {
        text_color: Some(theme.palette().text),
        background: Some(Background::Color(if dark {
            SLATE_900
        } else {
            Color::from_rgb8(241, 245, 249)
        })),
        border: iced::Border {
            color: if dark {
                SLATE_800
            } else {
                Color::from_rgb8(226, 232, 240)
            },
            width: 1.0,
            radius: 0.0.into(),
        },
        ..container::Style::default()
    }
}

/// Abgesetzte Karte mit halbtransparenter Slate-Fläche und runden Ecken.
pub fn card(theme: &Theme) -> container::Style {
    let dark = is_dark(theme);
    container::Style {
        text_color: Some(theme.palette().text),
        background: Some(Background::Color(if dark {
            Color::from_rgba8(30, 41, 59, 0.5)
        } else {
            Color::from_rgba8(226, 232, 240, 0.5)
        })),
        border: iced::Border {
            color: if dark {
                SLATE_700
            } else {
                Color::from_rgb8(203, 213, 225)
            },
            width: 1.0,
            radius: 12.0.into(),
        },
        ..container::Style::default()
    }
}

/// Flacher Stil für Kopfzeilen.
pub fn header(theme: &Theme) -> container::Style {
    panel(theme)
}

/// Zurückhaltender Navigationsknopf mit Hover-Rückmeldung.
pub fn navigation(theme: &Theme, status: button::Status) -> button::Style {
    let dark = is_dark(theme);
    let (text_color, background) = match status {
        button::Status::Hovered | button::Status::Pressed => (
            if dark { SLATE_200 } else { SLATE_900 },
            Some(Background::Color(if dark {
                Color::from_rgba8(30, 41, 59, 0.4)
            } else {
                Color::from_rgba8(226, 232, 240, 0.75)
            })),
        ),
        button::Status::Disabled => (
            muted(theme),
            Some(Background::Color(if dark { SLATE_900 } else { SLATE_50 })),
        ),
        button::Status::Active => (muted(theme), None),
    };

    button::Style {
        background,
        text_color,
        border: iced::Border::default().rounded(8.0),
        ..button::Style::default()
    }
}

/// Hervorgehobener Navigationspunkt im aktiven Bereich.
pub fn selected_navigation(theme: &Theme, status: button::Status) -> button::Style {
    let dark = is_dark(theme);
    let (text_color, fill, border_color) = match status {
        button::Status::Hovered | button::Status::Pressed => (
            if dark { Color::WHITE } else { SLATE_950 },
            if dark {
                PURPLE_600
            } else {
                Color::from_rgb8(233, 213, 255)
            },
            if dark { PURPLE_500 } else { PURPLE_700 },
        ),
        button::Status::Disabled => (
            muted(theme),
            if dark {
                SLATE_800
            } else {
                Color::from_rgb8(241, 245, 249)
            },
            if dark {
                SLATE_700
            } else {
                Color::from_rgb8(203, 213, 225)
            },
        ),
        button::Status::Active => (
            if dark {
                Color::from_rgb8(216, 180, 254)
            } else {
                PURPLE_700
            },
            if dark {
                Color::from_rgba8(168, 85, 247, 0.22)
            } else {
                Color::from_rgba8(147, 51, 234, 0.12)
            },
            if dark {
                Color::from_rgba8(168, 85, 247, 0.45)
            } else {
                Color::from_rgba8(126, 34, 206, 0.35)
            },
        ),
    };

    button::Style {
        background: Some(Background::Color(fill)),
        text_color,
        border: iced::Border {
            color: border_color,
            width: 1.0,
            radius: 12.0.into(),
        },
        ..button::Style::default()
    }
}

/// Container-Stil für das violette Symbol eines ausgewählten Navigationspunkts.
pub fn selected_navigation_icon(theme: &Theme) -> container::Style {
    container::Style {
        text_color: Some(Color::WHITE),
        background: Some(Background::Color(if is_dark(theme) {
            PURPLE_600
        } else {
            PURPLE_700
        })),
        border: iced::Border {
            color: PURPLE_500,
            width: 1.0,
            radius: 8.0.into(),
        },
        ..container::Style::default()
    }
}

/// Dunkler Eingabebereich mit violettem Fokusrahmen und sichtbarer Auswahl.
pub fn editor(theme: &Theme, status: text_editor::Status) -> text_editor::Style {
    let disabled = matches!(status, text_editor::Status::Disabled);
    let focused = matches!(status, text_editor::Status::Focused { .. });
    let border_color = if focused {
        PURPLE_500
    } else if disabled {
        SLATE_800
    } else {
        SLATE_700
    };

    text_editor::Style {
        background: Background::Color(if is_dark(theme) { SLATE_950 } else { SLATE_50 }),
        border: iced::Border {
            color: border_color,
            width: if focused { 2.0 } else { 1.0 },
            radius: 12.0.into(),
        },
        placeholder: muted(theme),
        value: if disabled {
            muted(theme)
        } else {
            theme.palette().text
        },
        selection: if is_dark(theme) {
            PURPLE_600
        } else {
            PURPLE_700
        },
    }
}

/// Neutraler Aktionsknopf, etwa für Abbrechen oder weitere Optionen.
pub fn subtle_button(theme: &Theme, status: button::Status) -> button::Style {
    let mut style = navigation(theme, status);
    if matches!(status, button::Status::Active) {
        style.background = Some(Background::Color(if is_dark(theme) {
            Color::from_rgba8(30, 41, 59, 0.7)
        } else {
            Color::from_rgb8(241, 245, 249)
        }));
    }
    style.border.width = 1.0;
    style.border.color = if is_dark(theme) {
        SLATE_700
    } else {
        Color::from_rgb8(203, 213, 225)
    };
    style
}

/// Akzentknopf mit dunklerem, kontrastreich lesbarem Violett in beiden Modi.
pub fn primary_button(theme: &Theme, status: button::Status) -> button::Style {
    let dark = is_dark(theme);
    let (background, text_color) = match status {
        button::Status::Hovered | button::Status::Pressed => (
            if dark {
                PURPLE_700
            } else {
                Color::from_rgb8(107, 33, 168)
            },
            Color::WHITE,
        ),
        button::Status::Disabled => (
            if dark {
                SLATE_700
            } else {
                Color::from_rgb8(203, 213, 225)
            },
            if dark { SLATE_200 } else { SLATE_600 },
        ),
        button::Status::Active => (if dark { PURPLE_600 } else { PURPLE_700 }, Color::WHITE),
    };

    button::Style {
        background: Some(Background::Color(background)),
        text_color,
        border: iced::Border::default().rounded(8.0),
        ..button::Style::default()
    }
}

fn is_dark(theme: &Theme) -> bool {
    theme.extended_palette().is_dark
}
