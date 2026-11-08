//! Native Ansichten nach Header, Sidebar und ChatView des Tauri-Frontends.
use super::{App, Message, Page, appearance};
use crate::icons::{Icon, icon};
use iced::keyboard::{Key, key::Named};
use iced::widget::{
    Space, button, column, container, image, row, scrollable, stack, text, text_editor, text_input,
    tooltip,
};
use iced::{Alignment, Background, Border, Color, Element, Fill, Length, Theme};

type NavItem = (Page, Icon, &'static str);
type NavGroup = (&'static str, &'static [NavItem]);

fn muted<'a>(
    label: impl Into<std::borrow::Cow<'a, str>>,
    size: u32,
    theme: &Theme,
) -> iced::widget::Text<'a> {
    text(label.into())
        .size(size)
        .color(appearance::muted(theme))
}

fn control<'a>(
    symbol: Icon,
    label: impl Into<std::borrow::Cow<'a, str>>,
    action: Message,
) -> Element<'a, Message> {
    button(
        row![icon(symbol, 15), text(label.into()).size(12)]
            .spacing(6)
            .align_y(Alignment::Center),
    )
    .padding([6, 10])
    .style(appearance::subtle_button)
    .on_press(action)
    .into()
}

fn icon_control(
    symbol: Icon,
    hint: &'static str,
    action: Option<Message>,
) -> Element<'static, Message> {
    tooltip(
        button(icon(symbol, 17))
            .padding(8)
            .style(if symbol == Icon::Send {
                appearance::primary_button
            } else {
                appearance::subtle_button
            })
            .on_press_maybe(action),
        text(hint).size(12),
        tooltip::Position::Bottom,
    )
    .style(appearance::card)
    .into()
}

fn bubble_style(theme: &Theme, user: bool) -> container::Style {
    let mut style = appearance::panel(theme);
    style.border.radius = 16.into();
    if user {
        style.background = Some(Background::Gradient(
            iced::gradient::Linear::new(0.0)
                .add_stop(0.0, Color::from_rgb8(147, 51, 234))
                .add_stop(1.0, Color::from_rgb8(79, 70, 229))
                .into(),
        ));
        style.text_color = Some(Color::WHITE);
        style.border.width = 0.0;
    }
    style
}

impl App {
    fn portrait(&self, index: usize, width: u32, height: u32) -> Element<'_, Message> {
        if let Some(handle) = &self.portraits[index] {
            container(
                image(handle.clone())
                    .width(width)
                    .height(height)
                    .content_fit(iced::ContentFit::Cover),
            )
            .style(|theme| container::Style {
                border: Border {
                    radius: 10.into(),
                    ..Default::default()
                },
                ..appearance::card(theme)
            })
            .clip(true)
            .into()
        } else {
            container(
                text(
                    self.preview.characters[index]
                        .name
                        .chars()
                        .next()
                        .unwrap_or('?'),
                )
                .size(22),
            )
            .center_x(width)
            .center_y(height)
            .style(appearance::card)
            .into()
        }
    }

    pub(super) fn view(&self) -> Element<'_, Message> {
        let content = match self.page {
            Page::Home => self.home(),
            Page::Chat => self.chat(),
            Page::Characters => self.characters(),
            Page::Details => self.details(),
            Page::Settings => self.settings(),
            Page::Planned(label) => self.planned(label),
        };
        column![self.header(), row![self.navigation(), content].height(Fill)]
            .width(Fill)
            .height(Fill)
            .into()
    }

    fn header(&self) -> Element<'_, Message> {
        let brand = button(
            row![
                image(image::Handle::from_bytes(
                    include_bytes!("../../src/assets/brand/otakusoul-icon.png").as_slice()
                ))
                .width(30)
                .height(30),
                text("OtakuSoul").size(22).color(if self.dark {
                    Color::from_rgb8(216, 180, 254)
                } else {
                    Color::from_rgb8(126, 34, 206)
                }),
            ]
            .spacing(10)
            .align_y(Alignment::Center),
        )
        .style(button::text)
        .on_press(Message::Navigate(Page::Home));
        container(
            row![
                brand,
                container(text("Native · 0.3").size(11))
                    .padding([4, 8])
                    .style(appearance::card),
                Space::new().width(Fill),
                muted("Vorschau ohne KI", 12, &self.theme()),
                icon_control(
                    if self.dark { Icon::Sun } else { Icon::Moon },
                    "Hell / Dunkel",
                    Some(Message::ToggleTheme)
                ),
                icon_control(
                    Icon::Settings,
                    "Einstellungen",
                    Some(Message::Navigate(Page::Settings))
                ),
                icon_control(
                    Icon::Help,
                    "Hilfe zum Prototyp",
                    Some(Message::Navigate(Page::Planned("Hilfe")))
                ),
            ]
            .spacing(10)
            .align_y(Alignment::Center),
        )
        .padding([8, 16])
        .height(56)
        .width(Fill)
        .style(appearance::header)
        .into()
    }

    fn navigation(&self) -> Element<'_, Message> {
        let groups: [NavGroup; 3] = [
            (
                "SPIELEN",
                &[
                    (Page::Home, Icon::Home, "Start"),
                    (Page::Chat, Icon::Chat, "Chat"),
                    (Page::Planned("Stage"), Icon::Stage, "Stage"),
                    (Page::Planned("Companion"), Icon::Companion, "Companion"),
                ],
            ),
            (
                "BIBLIOTHEK",
                &[
                    (Page::Characters, Icon::Characters, "Charaktere"),
                    (Page::Planned("Avatare"), Icon::Avatars, "Avatare"),
                    (Page::Planned("Lorebooks"), Icon::Lorebooks, "Lorebooks"),
                    (Page::Planned("Hub"), Icon::Hub, "Hub"),
                ],
            ),
            (
                "SYSTEM",
                &[
                    (
                        Page::Planned("Integrationen"),
                        Icon::Integrations,
                        "Integrationen",
                    ),
                    (Page::Settings, Icon::Settings, "Einstellungen"),
                ],
            ),
        ];
        let mut navigation = column![].spacing(12);
        for (group, entries) in groups {
            let mut section = column![].spacing(3);
            if !self.collapsed {
                section = section.push(muted(group, 10, &self.theme()));
            }
            for (page, symbol, label) in entries {
                let active =
                    self.page == *page || (self.page == Page::Details && *page == Page::Characters);
                let symbol =
                    container(
                        icon(*symbol, 18).style(move |theme, _| iced::widget::svg::Style {
                            color: Some(if active {
                                Color::WHITE
                            } else {
                                appearance::muted(theme)
                            }),
                        }),
                    )
                    .padding(7)
                    .style(if active {
                        appearance::selected_navigation_icon
                    } else {
                        appearance::card
                    });
                let item: Element<'_, Message> = if self.collapsed {
                    symbol.into()
                } else {
                    row![symbol, text(*label).size(14)]
                        .spacing(10)
                        .align_y(Alignment::Center)
                        .into()
                };
                let nav_button = button(item)
                    .width(Fill)
                    .padding(if self.collapsed { 4 } else { 6 })
                    .style(if active {
                        appearance::selected_navigation
                    } else {
                        appearance::navigation
                    })
                    .on_press(Message::Navigate(*page));
                section = section.push(tooltip(
                    nav_button,
                    text(*label).size(12),
                    tooltip::Position::Right,
                ));
            }
            navigation = navigation.push(
                container(section)
                    .padding(if self.collapsed { 2 } else { 8 })
                    .width(Fill)
                    .style(if self.collapsed {
                        container::transparent
                    } else {
                        appearance::card
                    }),
            );
        }
        let collapse = button(
            row![
                icon(
                    if self.collapsed {
                        Icon::Expand
                    } else {
                        Icon::Collapse
                    },
                    18
                ),
                text(if self.collapsed { "" } else { "Einklappen" }).size(12)
            ]
            .spacing(10)
            .align_y(Alignment::Center),
        )
        .width(Fill)
        .padding(10)
        .style(appearance::navigation)
        .on_press(Message::ToggleNavigation);
        container(column![scrollable(navigation).height(Fill), collapse].spacing(12))
            .padding(if self.collapsed { 6 } else { 10 })
            .width(if self.collapsed { 60 } else { 240 })
            .height(Fill)
            .style(appearance::panel)
            .into()
    }

    fn chat(&self) -> Element<'_, Message> {
        let character = self.preview.character();
        let conversation = self.preview.current();
        let index = self
            .preview
            .characters
            .iter()
            .position(|c| c.id == character.id)
            .unwrap_or(0);
        let toolbar = container(
            row![
                control(
                    Icon::Chat,
                    shorten(&conversation.title, 28),
                    Message::ToggleSessions
                ),
                Space::new().width(Fill),
                icon_control(
                    Icon::Search,
                    "Im geladenen Verlauf suchen",
                    Some(Message::ToggleSearch)
                ),
                control(Icon::Eye, "Avatar", Message::ToggleAvatar),
                control(Icon::Compact, "Kompakt", Message::ToggleCompact),
            ]
            .spacing(8)
            .align_y(Alignment::Center),
        )
        .padding([6, 16])
        .height(44)
        .style(appearance::header);
        let subtitle = character
            .card
            .as_ref()
            .and_then(|c| c.get("data").unwrap_or(c).get("personality"))
            .and_then(serde_json::Value::as_str)
            .unwrap_or("Charakterkarte und Gespräch");
        let heading = container(
            row![
                button(
                    row![
                        self.portrait(index, 38, 38),
                        column![
                            text(&character.name).size(17),
                            muted(shorten(subtitle, 45), 12, &self.theme())
                        ]
                        .spacing(3),
                        icon(Icon::Down, 14)
                    ]
                    .spacing(10)
                    .align_y(Alignment::Center)
                )
                .style(button::text)
                .on_press(Message::Navigate(Page::Characters)),
                Space::new().width(Fill),
                control(Icon::Lorebooks, "Karte", Message::Navigate(Page::Details)),
            ]
            .align_y(Alignment::Center),
        )
        .padding([10, 16])
        .width(Fill)
        .style(appearance::header);

        let mut messages = column![]
            .spacing(if self.compact { 10 } else { 20 })
            .width(Fill);
        if !conversation.loaded {
            messages = messages.push(
                row![
                    text(if self.pending.contains(&self.preview.selected) {
                        "Verlauf wird geladen …"
                    } else {
                        "Verlauf noch nicht geladen."
                    }),
                    button("Erneut laden")
                        .style(appearance::subtle_button)
                        .on_press(Message::SelectConversation(self.preview.selected))
                ]
                .spacing(8),
            );
        } else {
            if !character.first_message.is_empty() && !conversation.is_read_only() {
                messages = messages.push(muted(
                    "Begrüßung · Vorschau aus der Charakterkarte",
                    11,
                    &self.theme(),
                ));
                messages = messages.push(
                    container(self.greeting.view(&self.theme()).map(Message::InspectLink))
                        .padding([12, 16])
                        .width(Fill)
                        .style(|theme| bubble_style(theme, false)),
                );
            } else if conversation.messages.is_empty() {
                messages = messages.push(muted(
                    "Dieser Verlauf enthält noch keine Nachrichten.",
                    14,
                    &self.theme(),
                ));
            }
        }
        if conversation.message_count > conversation.messages.len() && conversation.loaded {
            messages = messages.push(muted(
                format!(
                    "Letzte {} von {} Nachrichten",
                    conversation.messages.len(),
                    conversation.message_count
                ),
                11,
                &self.theme(),
            ));
        }
        let query = self.search.to_lowercase();
        for (index, message) in conversation.messages.iter().enumerate() {
            if !query.is_empty() && !message.content.to_lowercase().contains(&query) {
                continue;
            }
            let user = message.role == "user";
            let label = match message.role.as_str() {
                "user" => "Du",
                "assistant" => character.name.as_str(),
                "system" => "System",
                other => other,
            };
            let header = row![
                muted(label, 12, &self.theme()),
                Space::new().width(Fill),
                icon_control(
                    Icon::Copy,
                    "Nachricht kopieren",
                    Some(Message::Copy(message.content.clone()))
                )
            ]
            .align_y(Alignment::Center);
            let body: Element<'_, Message> = if let Some(rendered) = self.rendered.get(index) {
                if user {
                    rendered
                        .view_for_user(&self.theme(), true)
                        .map(Message::InspectLink)
                } else {
                    rendered.view(&self.theme()).map(Message::InspectLink)
                }
            } else {
                text(&message.content).size(14).into()
            };
            let bubble = container(body)
                .padding(if self.compact { [8, 12] } else { [12, 16] })
                .width(Fill)
                .style(move |theme| bubble_style(theme, user));
            let message = column![header, bubble].spacing(4).width(Fill);
            messages = messages.push(if user {
                row![
                    Space::new().width(Length::FillPortion(1)),
                    container(message).width(Length::FillPortion(6))
                ]
            } else {
                row![
                    container(message).width(Length::FillPortion(6)),
                    Space::new().width(Length::FillPortion(1))
                ]
            });
        }
        let mut stream = column![].spacing(8);
        if self.show_search {
            stream = stream.push(
                container(
                    row![
                        icon(Icon::Search, 16),
                        text_input("Nachrichten durchsuchen …", &self.search)
                            .on_input(Message::SearchChanged)
                            .padding(8),
                        icon_control(Icon::Close, "Suche schließen", Some(Message::ToggleSearch))
                    ]
                    .spacing(8)
                    .align_y(Alignment::Center),
                )
                .padding([6, 16])
                .style(appearance::header),
            );
        }
        stream = stream.push(
            scrollable(messages.padding(if self.compact { 12 } else { 20 }))
                .id("conversation")
                .width(Fill)
                .height(Fill),
        );
        stream = stream.push(self.composer());
        let chat: Element<'_, Message> = if self.show_avatar {
            row![
                self.avatar_panel(index),
                container(stream).width(Length::FillPortion(2)).height(Fill)
            ]
            .height(Fill)
            .into()
        } else {
            stream.height(Fill).into()
        };
        let layout: Element<'_, Message> = column![toolbar, heading, chat]
            .height(Fill)
            .width(Fill)
            .into();
        if self.show_sessions {
            stack![
                layout,
                row![self.sessions_panel(), Space::new().width(Fill)].height(Fill)
            ]
            .into()
        } else {
            layout
        }
    }

    fn avatar_panel(&self, index: usize) -> Element<'_, Message> {
        let character = self.preview.character();
        let portrait: Element<'_, Message> = if let Some(handle) = &self.portraits[index] {
            container(
                image(handle.clone())
                    .width(Fill)
                    .height(Fill)
                    .content_fit(iced::ContentFit::Contain),
            )
            .height(Fill)
            .width(Fill)
            .style(|theme| {
                let mut style = appearance::card(theme);
                style.border.color = Color::from_rgb8(126, 34, 206);
                style.border.radius = 24.into();
                style
            })
            .clip(true)
            .into()
        } else {
            container(icon(Icon::Avatars, 64))
                .center_x(Fill)
                .center_y(Fill)
                .into()
        };
        let summary = character
            .card
            .as_ref()
            .and_then(|c| c.get("data").unwrap_or(c).get("personality"))
            .and_then(serde_json::Value::as_str)
            .unwrap_or("Statisches Charakterporträt");
        container(
            column![
                row![
                    Space::new().width(Fill),
                    container(row![icon(Icon::Image, 14), text("Bild").size(12)].spacing(6))
                        .padding([6, 10])
                        .style(appearance::selected_navigation_icon)
                ],
                portrait,
                container(text(&character.name).size(20)).center_x(Fill),
                container(muted(shorten(summary, 150), 12, &self.theme())).center_x(Fill),
            ]
            .spacing(16),
        )
        .padding(22)
        .width(Length::FillPortion(1))
        .height(Fill)
        .style(appearance::panel)
        .into()
    }

    fn composer(&self) -> Element<'_, Message> {
        let conversation = self.preview.current();
        let readonly = conversation.is_read_only();
        let mut editor = text_editor(&self.editor)
            .id("composer")
            .placeholder(if readonly {
                "Importierter Verlauf · schreibgeschützt"
            } else {
                "Schreibe eine Nachricht …"
            })
            .height(if self.compact { 60 } else { 82 })
            .padding([10, 14])
            .size(14)
            .style(appearance::editor);
        if !readonly {
            editor = editor.on_action(Message::Edit).key_binding(|press| {
                if press.key == Key::Named(Named::Enter) && press.modifiers.control() {
                    Some(text_editor::Binding::Custom(Message::Submit))
                } else if press.key == Key::Named(Named::Tab) {
                    Some(text_editor::Binding::Custom(Message::Focus(
                        press.modifiers.shift(),
                    )))
                } else {
                    text_editor::Binding::from_key_press(press)
                }
            });
        }
        let controls = row![
            icon_control(
                Icon::Attachment,
                "Anhänge sind im Prototyp noch nicht verfügbar",
                None
            ),
            editor,
            icon_control(
                Icon::Send,
                "Testnachricht hinzufügen · Strg+Enter",
                (!readonly && !conversation.draft.trim().is_empty()).then_some(Message::Submit)
            ),
            icon_control(
                Icon::Microphone,
                "Sprache ist im Prototyp noch nicht verfügbar",
                None
            ),
        ]
        .spacing(8)
        .align_y(Alignment::End);
        let secondary: Element<'_, Message> = if readonly {
            row![
                muted("Importierter Verlauf · nur lesen", 11, &self.theme()).width(Fill),
                button("Zum Testchat")
                    .style(appearance::primary_button)
                    .on_press(Message::LocalChat)
            ]
            .align_y(Alignment::Center)
            .into()
        } else {
            row![
                muted(
                    "Enter: neue Zeile · Strg+Enter: hinzufügen",
                    11,
                    &self.theme()
                )
                .width(Fill),
                button("Testchat leeren")
                    .style(appearance::navigation)
                    .on_press(Message::Clear)
            ]
            .align_y(Alignment::Center)
            .into()
        };
        container(column![controls, secondary, muted(&self.notice, 10, &self.theme())].spacing(8))
            .padding([12, 16])
            .width(Fill)
            .style(appearance::header)
            .into()
    }

    fn sessions_panel(&self) -> Element<'_, Message> {
        let mut chats = column![
            row![
                icon(Icon::Chat, 16),
                text("Gespräche").size(16).width(Fill),
                icon_control(Icon::Close, "Schließen", Some(Message::ToggleSessions))
            ]
            .spacing(8)
            .align_y(Alignment::Center),
            control(Icon::Plus, "Neuer Testchat", Message::LocalChat)
        ]
        .spacing(14);
        for (index, conversation) in self.preview.conversations.iter().enumerate() {
            let name = self
                .preview
                .characters
                .iter()
                .find(|c| c.id == conversation.character_id)
                .map(|c| c.name.as_str())
                .unwrap_or(&conversation.character_id);
            chats = chats.push(
                button(
                    column![
                        text(&conversation.title).size(13),
                        muted(
                            format!("{name} · {} Nachrichten", conversation.message_count),
                            11,
                            &self.theme()
                        )
                    ]
                    .spacing(5),
                )
                .width(Fill)
                .padding(12)
                .style(if self.preview.selected == index {
                    appearance::selected_navigation
                } else {
                    appearance::navigation
                })
                .on_press(Message::SelectConversation(index)),
            );
        }
        container(scrollable(chats).height(Fill))
            .padding(14)
            .width(300)
            .height(Fill)
            .style(appearance::panel)
            .into()
    }

    fn home(&self) -> Element<'_, Message> {
        container(
            column![
                text("Schön, dass Du da bist!").size(30),
                muted("Mit wem möchtest Du heute sprechen?", 16, &self.theme()),
                self.characters()
            ]
            .spacing(18),
        )
        .padding(24)
        .height(Fill)
        .width(Fill)
        .into()
    }

    fn characters(&self) -> Element<'_, Message> {
        let mut cards = column![row![
            text("Deine Charaktere").size(26).width(Fill),
            control(
                Icon::Settings,
                "Profilkopie laden",
                Message::Navigate(Page::Settings)
            )
        ]]
        .spacing(16);
        for (index, character) in self.preview.characters.iter().enumerate() {
            cards = cards.push(
                container(
                    row![
                        self.portrait(index, 76, 96),
                        column![
                            text(&character.name).size(20),
                            muted(
                                shorten(
                                    &character.description.replace("{{char}}", &character.name),
                                    140
                                ),
                                13,
                                &self.theme()
                            )
                        ]
                        .spacing(8)
                        .width(Fill),
                        button(row![icon(Icon::Chat, 16), text("Chat").size(13)].spacing(8))
                            .padding(10)
                            .style(appearance::primary_button)
                            .on_press(Message::SelectCharacter(index))
                    ]
                    .spacing(18)
                    .align_y(Alignment::Center),
                )
                .padding(16)
                .width(Fill)
                .style(appearance::card),
            );
        }
        scrollable(cards.padding(24))
            .height(Fill)
            .width(Fill)
            .into()
    }

    fn details(&self) -> Element<'_, Message> {
        let character = self.preview.character();
        let mut details = column![
            row![
                text(&character.name).size(28).width(Fill),
                control(Icon::Back, "Zurück zum Chat", Message::Navigate(Page::Chat))
            ],
            text("Beschreibung").size(20),
            text(&character.description).width(Fill),
            text("Begrüßung aus der Karte").size(20),
            text(&character.first_message).width(Fill)
        ]
        .spacing(18);
        if character.card.is_some() {
            details = details.push(control(
                Icon::Copy,
                "Vollständige Karte als JSON kopieren",
                Message::CopyCard,
            ));
        }
        scrollable(details.padding(24).width(Fill))
            .height(Fill)
            .width(Fill)
            .into()
    }

    fn settings(&self) -> Element<'_, Message> {
        let mut settings=column![text("Einstellungen").size(28),muted("Oberfläche und Profilkopien",14,&self.theme()),
            container(column![text("Erscheinungsbild").size(19),control(if self.dark {Icon::Sun} else {Icon::Moon},if self.dark {"Helles Design verwenden"} else {"Dunkles Design verwenden"},Message::ToggleTheme)].spacing(12)).padding(20).width(Fill).style(appearance::card),
            container(column![text("Profilkopie laden").size(19),text("Wähle eine ruhende Kopie mit data/characters und optional data/otakusoul.db. Verläufe werden ausschließlich gelesen.").size(14),
                text_input("Pfad zur Profilkopie",&self.profile_input).on_input_maybe((!self.profile_busy).then_some(Message::ProfilePathChanged)).padding(12),
                row![button("Profilkopie laden").padding(10).style(appearance::primary_button).on_press_maybe((!self.profile_busy).then_some(Message::LoadProfile)),
                    button("Beispielprofil erstellen").padding(10).style(appearance::subtle_button).on_press_maybe((!self.profile_busy).then_some(Message::CreateDemo))].spacing(10),
                muted("Das Beispiel enthält vier mitgelieferte Figuren und erfundene Verläufe. Ein vorhandener nichtleerer Ordner wird nicht überschrieben.",12,&self.theme()),
            ].spacing(14)).padding(20).width(Fill).style(appearance::card),
            muted(&self.notice,12,&self.theme()),
        ].spacing(22);
        for warning in &self.warnings {
            settings = settings.push(text(warning).size(12));
        }
        scrollable(settings.padding(26).max_width(1000))
            .height(Fill)
            .width(Fill)
            .into()
    }

    fn planned(&self, label: &'static str) -> Element<'_, Message> {
        let detail = if label == "Hilfe" {
            "Wähle eine Figur in der Bibliothek. Über den Titel oben im Chat öffnest Du die Verläufe. Avatar und Navigation lassen sich einklappen. Enter erzeugt eine neue Zeile, Strg+Enter fügt eine Testnachricht hinzu. Die Vorschau antwortet noch nicht mit KI."
        } else {
            "Dieser Bereich ist in der nativen Vorschau noch nicht angebunden. Charaktere, Profilkopien und die Chatansicht kannst Du bereits ausprobieren."
        };
        container(
            column![
                text(label).size(28),
                text(detail).size(15).width(Fill),
                control(Icon::Chat, "Zum Chat", Message::Navigate(Page::Chat))
            ]
            .spacing(20)
            .max_width(700),
        )
        .padding(32)
        .width(Fill)
        .height(Fill)
        .into()
    }
}

fn shorten(value: &str, limit: usize) -> String {
    let mut chars = value.chars();
    let shortened: String = chars.by_ref().take(limit).collect();
    if chars.next().is_some() {
        format!("{shortened}…")
    } else {
        shortened
    }
}
