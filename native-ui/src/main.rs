#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod model;

use iced::widget::{button, column, container, image, row, scrollable, text, text_input};
use iced::{Alignment, Element, Fill, Length, Task, Theme};
use model::{CHARACTERS, Preview};

fn main() -> iced::Result {
    iced::application(App::default, App::update, App::view)
        .title("OtakuSoul · Native Vorschau")
        .theme(App::theme)
        .window_size((1180.0, 780.0))
        .window(iced::window::Settings {
            min_size: Some(iced::Size::new(850.0, 600.0)),
            ..Default::default()
        })
        .run()
}

#[derive(Debug, Clone, Copy, Default, PartialEq)]
enum Page {
    #[default]
    Chat,
    Characters,
    Settings,
}

#[derive(Debug, Clone)]
enum Message {
    Navigate(Page),
    SelectCharacter(usize),
    DraftChanged(String),
    Submit,
    Clear,
    ToggleTheme,
}

struct App {
    preview: Preview,
    page: Page,
    dark: bool,
    portraits: Vec<image::Handle>,
}

impl Default for App {
    fn default() -> Self {
        Self {
            preview: Preview::default(),
            page: Page::Chat,
            dark: true,
            portraits: CHARACTERS
                .iter()
                .map(|character| image::Handle::from_bytes(character.portrait))
                .collect(),
        }
    }
}

impl App {
    fn theme(&self) -> Theme {
        if self.dark {
            Theme::TokyoNight
        } else {
            Theme::Light
        }
    }

    fn update(&mut self, message: Message) -> Task<Message> {
        match message {
            Message::Navigate(page) => self.page = page,
            Message::SelectCharacter(index) => {
                if index < CHARACTERS.len() {
                    self.preview.selected = index;
                    self.page = Page::Chat;
                }
            }
            Message::DraftChanged(value) => self.preview.current_mut().draft = value,
            Message::Submit => {
                self.preview.submit();
                return iced::widget::operation::snap_to_end("conversation");
            }
            Message::Clear => *self.preview.current_mut() = Default::default(),
            Message::ToggleTheme => self.dark = !self.dark,
        }
        Task::none()
    }

    fn view(&self) -> Element<'_, Message> {
        let mut navigation = column![
            text("OtakuSoul").size(28),
            text("Deine Geschichten. Dein Raum.").size(13),
            text(""),
        ]
        .spacing(10);
        for (page, label) in [
            (Page::Chat, "Gespräche"),
            (Page::Characters, "Charaktere"),
            (Page::Settings, "Einstellungen"),
        ] {
            navigation = navigation.push(
                button(text(label).size(16))
                    .width(Fill)
                    .padding(12)
                    .style(if self.page == page {
                        button::primary
                    } else {
                        button::text
                    })
                    .on_press(Message::Navigate(page)),
            );
        }
        navigation = navigation.push(text("DEINE FIGUREN").size(12));
        for (index, character) in CHARACTERS.iter().enumerate() {
            navigation = navigation.push(
                button(
                    row![
                        image(self.portraits[index].clone())
                            .width(38)
                            .height(46)
                            .content_fit(iced::ContentFit::Cover),
                        text(character.name).size(14),
                    ]
                    .spacing(10)
                    .align_y(Alignment::Center),
                )
                .width(Fill)
                .padding(8)
                .style(if index == self.preview.selected {
                    button::secondary
                } else {
                    button::text
                })
                .on_press(Message::SelectCharacter(index)),
            );
        }
        let sidebar = container(
            column![
                scrollable(navigation).height(Fill),
                text("NATIVE VORSCHAU · 0.1").size(12),
                text("Lokale Testnachrichten\nwerden nicht gespeichert.").size(12),
            ]
            .spacing(12),
        )
        .padding(20)
        .width(245)
        .height(Fill)
        .style(container::rounded_box);

        let content = match self.page {
            Page::Chat => self.chat(),
            Page::Characters => self.characters(),
            Page::Settings => self.settings(),
        };
        container(
            row![
                sidebar,
                container(content).padding(24).width(Fill).height(Fill)
            ]
            .spacing(4),
        )
        .padding(12)
        .width(Fill)
        .height(Fill)
        .into()
    }

    fn chat(&self) -> Element<'_, Message> {
        let character = &CHARACTERS[self.preview.selected];
        let conversation = self.preview.current();
        let heading = row![
            image(self.portraits[self.preview.selected].clone())
                .width(60)
                .height(72)
                .content_fit(iced::ContentFit::Cover),
            column![
                text(character.name).size(28),
                text(character.description).size(14)
            ]
            .spacing(8),
        ]
        .spacing(16)
        .align_y(Alignment::Center);
        let notice = container(
            column![
                text("Ein erster Raum für Deine Geschichten").size(18),
                text("Teste die Oberfläche: Wähle eine Figur und schreibe eine Nachricht. Die KI-Anbindung folgt im nächsten Schritt.").size(14),
            ].spacing(8),
        ).padding(18).width(Fill).style(container::rounded_box);
        let mut messages = column![notice].spacing(16).width(Fill);
        for message in &conversation.messages {
            messages = messages.push(
                container(
                    column![text("Du · Testnachricht").size(12), text(message).size(17)].spacing(8),
                )
                .padding(16)
                .width(Fill)
                .style(container::rounded_box),
            );
        }
        let input = text_input("Schreibe eine Testnachricht …", &conversation.draft)
            .on_input(Message::DraftChanged)
            .on_submit(Message::Submit)
            .padding(14)
            .size(16);
        let send = button("Hinzufügen")
            .padding(14)
            .on_press_maybe((!conversation.draft.trim().is_empty()).then_some(Message::Submit));
        column![
            heading,
            scrollable(messages).id("conversation").height(Fill),
            row![input, send].spacing(10).align_y(Alignment::Center),
            row![
                text("Vorschau ohne KI · Nur im Arbeitsspeicher")
                    .size(12)
                    .width(Fill),
                button("Testchat leeren")
                    .style(button::text)
                    .on_press(Message::Clear),
            ]
            .align_y(Alignment::Center),
        ]
        .spacing(20)
        .into()
    }

    fn characters(&self) -> Element<'_, Message> {
        let mut cards = column![
            text("Deine Charaktere").size(30),
            text("Mitgelieferte Figuren für die Oberflächenvorschau.")
        ]
        .spacing(18);
        for (index, character) in CHARACTERS.iter().enumerate() {
            cards = cards.push(
                container(
                    row![
                        image(self.portraits[index].clone())
                            .width(80)
                            .height(96)
                            .content_fit(iced::ContentFit::Cover),
                        column![text(character.name).size(22), text(character.description)]
                            .spacing(10)
                            .width(Fill),
                        button("Gespräch öffnen").on_press(Message::SelectCharacter(index)),
                    ]
                    .spacing(18)
                    .align_y(Alignment::Center),
                )
                .padding(16)
                .width(Fill)
                .style(container::rounded_box),
            );
        }
        scrollable(cards).height(Fill).into()
    }

    fn settings(&self) -> Element<'_, Message> {
        column![
            text("Einstellungen").size(30),
            text("Gestalte Deinen Arbeitsbereich.").size(16),
            container(column![
                text("Erscheinungsbild").size(20),
                button(if self.dark { "Helles Design verwenden" } else { "Dunkles Design verwenden" })
                    .padding(12).on_press(Message::ToggleTheme),
            ].spacing(14)).padding(20).width(Fill).style(container::rounded_box),
            text("Diese Vorschau greift noch nicht auf Dein OtakuSoul-Profil zu. Anbieter, Modelle und gespeicherte Einstellungen werden später angebunden.").size(15),
        ].spacing(24).width(Length::Fill).into()
    }
}
