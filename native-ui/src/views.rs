//! Native Ansichten nach Header, Sidebar und ChatView des Tauri-Frontends.
use super::{App, EditorTab, GreetingChoice, Message, Page, appearance};
use crate::icons::{Icon, icon};
use iced::keyboard::{Key, key::Named};
use iced::widget::{
    Space, button, column, container, image, row, scrollable, stack, text, text_editor, text_input,
    tooltip,
};
use iced::{Alignment, Background, Border, Color, Element, Fill, Length, Theme};

type NavItem = (Page, Icon, &'static str);
type NavGroup = (&'static str, &'static [NavItem]);

fn read_only_keys(press: text_editor::KeyPress) -> Option<text_editor::Binding<Message>> {
    if press.key == Key::Named(Named::Tab) {
        Some(text_editor::Binding::Custom(Message::Focus(
            press.modifiers.shift(),
        )))
    } else {
        text_editor::Binding::from_key_press(press)
    }
}

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
            iced::gradient::Linear::new(std::f32::consts::FRAC_PI_2)
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
            Page::CharacterEditor => self.character_editor(),
            Page::Details => self.details(),
            Page::Settings => self.settings(),
            Page::Prompt => self.prompt_view(),
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
                let active = self.page == *page
                    || (matches!(self.page, Page::Details | Page::CharacterEditor)
                        && *page == Page::Characters)
                    || (self.page == Page::Prompt && *page == Page::Chat);
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
        container(column![scroll(navigation).height(Fill), collapse].spacing(12))
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
                control(Icon::Lorebooks, "Prompt", Message::Navigate(Page::Prompt)),
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
            if conversation
                .greeting
                .as_ref()
                .is_some_and(|(_, text)| !text.trim().is_empty())
                && !conversation.is_read_only()
            {
                let choices = self.chat_greeting_choices();
                if conversation.messages.is_empty() && choices.len() > 1 {
                    messages = messages.push(
                        row![
                            muted("Begrüßung", 11, &self.theme()),
                            iced::widget::pick_list(
                                choices,
                                Some(GreetingChoice(conversation.greeting_index)),
                                Message::ChatGreeting
                            )
                            .padding(6)
                            .style(appearance::select)
                        ]
                        .spacing(10)
                        .align_y(Alignment::Center),
                    );
                } else {
                    messages = messages.push(muted(
                        "Begrüßung · Vorschau aus der Charakterkarte",
                        11,
                        &self.theme(),
                    ));
                }
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
            scroll(messages.padding(if self.compact { 12 } else { 20 }))
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
                    .height(Length::Shrink)
                    .border_radius(22)
                    .content_fit(iced::ContentFit::Contain),
            )
            .padding(2)
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
                container(portrait).width(Fill).center_y(Fill),
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
        container(scroll(chats).height(Fill))
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
        iced::widget::responsive(move |size| self.character_library(size.width)).into()
    }

    fn character_library(&self, width: f32) -> Element<'_, Message> {
        let content_width = (width - 48.0).max(1.0);
        let cols = crate::library::columns(content_width);
        let card_width = ((content_width - 16.0 * (cols - 1) as f32) / cols as f32).max(1.0);
        let mut content = column![
            row![
                text("Deine Charaktere").size(26).width(Fill),
                control(Icon::Plus, "Neu", Message::NewCharacter),
                control(Icon::Attachment, "Importieren", Message::ImportCharacter),
                control(
                    Icon::Settings,
                    "Profilkopie laden",
                    Message::Navigate(Page::Settings)
                )
            ]
            .align_y(Alignment::Center),
            muted(&self.notice, 12, &self.theme()),
            text_input(
                "Name, Beschreibung, Persönlichkeit oder Tags …",
                &self.library_search
            )
            .on_input(Message::LibrarySearch)
            .padding(10)
            .style(appearance::input)
        ]
        .spacing(16);
        let mut tags = row![
            button(text("Alle").size(12))
                .padding([6, 10])
                .style(if self.library_tag.is_none() {
                    appearance::primary_button
                } else {
                    appearance::subtle_button
                })
                .on_press(Message::LibraryTag(None))
        ]
        .spacing(8);
        for tag in crate::library::available_tags(&self.preview.characters) {
            let selected = self.library_tag.as_ref() == Some(&tag);
            tags = tags.push(
                button(text(tag.clone()).size(12))
                    .padding([6, 10])
                    .style(if selected {
                        appearance::primary_button
                    } else {
                        appearance::subtle_button
                    })
                    .on_press(Message::LibraryTag(Some(tag))),
            );
        }
        content = content.push(
            scrollable(tags)
                .width(Fill)
                .style(appearance::scrollbar)
                .direction(scrollable::Direction::Horizontal(
                    scrollable::Scrollbar::new().width(6).scroller_width(6),
                ))
                .height(44),
        );
        let filtered = self
            .preview
            .characters
            .iter()
            .enumerate()
            .filter(|(_, character)| {
                crate::library::matches(
                    character,
                    &self.library_search,
                    self.library_tag.as_deref(),
                )
            })
            .map(|(index, _)| index)
            .collect::<Vec<_>>();
        let mut summary = row![
            muted(
                format!(
                    "{} von {} Charakteren",
                    filtered.len(),
                    self.preview.characters.len()
                ),
                12,
                &self.theme()
            )
            .width(Fill)
        ]
        .align_y(Alignment::Center);
        if !self.library_search.is_empty() || self.library_tag.is_some() {
            summary = summary.push(control(
                Icon::Close,
                "Filter zurücksetzen",
                Message::ResetLibraryFilters,
            ));
        }
        content = content.push(summary);
        if self.character_draft.is_some() {
            content = content.push(control(
                Icon::Characters,
                "Charakterentwurf fortsetzen",
                Message::Navigate(Page::CharacterEditor),
            ));
        }
        if filtered.is_empty() {
            content = content.push(
                container(
                    column![
                        icon(Icon::Search, 32),
                        text("Keine passenden Charaktere gefunden.").size(20),
                        muted(
                            "Ändere die Suche oder setze die Filter zurück.",
                            14,
                            &self.theme()
                        ),
                        control(
                            Icon::Back,
                            "Alle Charaktere anzeigen",
                            Message::ResetLibraryFilters
                        )
                    ]
                    .spacing(16),
                )
                .padding(32)
                .width(Fill)
                .style(appearance::card),
            );
        }
        for chunk in filtered.chunks(cols) {
            let mut cards = row![].spacing(16).align_y(Alignment::Start);
            for index in chunk {
                cards = cards.push(self.library_card(*index, card_width));
            }
            content = content.push(cards);
        }
        scroll(content.padding(24)).height(Fill).width(Fill).into()
    }

    fn library_card(&self, index: usize, width: f32) -> Element<'_, Message> {
        let character = &self.preview.characters[index];
        let active = character.id == self.preview.current().character_id;
        let portrait_height = width * 1.25;
        let portrait: Element<'_, Message> = if let Some(handle) = &self.portraits[index] {
            image(handle.clone())
                .width(Fill)
                .height(portrait_height)
                .content_fit(iced::ContentFit::Cover)
                .into()
        } else {
            container(text(character.name.chars().next().unwrap_or('?')).size(48))
                .center_x(Fill)
                .center_y(portrait_height)
                .style(appearance::panel)
                .into()
        };
        let cover = button(portrait)
            .padding(0)
            .width(Fill)
            .height(portrait_height)
            .style(appearance::subtle_button)
            .on_press(Message::InspectCharacter(index));
        let mut actions = row![].spacing(4).align_y(Alignment::Center);
        if active {
            actions = actions.push(
                container(text("Aktiv").size(11))
                    .padding([4, 8])
                    .style(appearance::selected_navigation_icon),
            );
        }
        actions = actions
            .push(Space::new().width(Fill))
            .push(icon_control(
                Icon::Characters,
                "Charakter bearbeiten",
                Some(Message::EditCharacter(index)),
            ))
            .push(icon_control(
                Icon::Copy,
                "Charakter duplizieren",
                Some(Message::DuplicateCharacter(index)),
            ))
            .push(icon_control(
                Icon::Attachment,
                "Als PNG exportieren",
                Some(Message::ExportCharacter(
                    index,
                    crate::card_files::Format::Png,
                )),
            ));
        let labels = container(
            column![
                text(shorten(&character.name, 32)).size(17),
                muted(
                    shorten(&crate::library::title(character), 42),
                    12,
                    &self.theme()
                )
            ]
            .spacing(4),
        )
        .padding(12)
        .width(Fill)
        .style(appearance::panel);
        let overlay = column![
            container(actions).padding(8),
            Space::new().height(Fill),
            labels
        ]
        .height(portrait_height);
        let tags = crate::library::tags(character);
        let mut badges = row![].spacing(4);
        let tag_limit = ((((width - 32.0) / 3.0 - 10.0) / 10.0) as usize)
            .saturating_sub(1)
            .max(1);
        for tag in tags.into_iter().take(3) {
            badges = badges.push(
                tooltip(
                    button(text(shorten(&tag, tag_limit)).size(10))
                        .padding([3, 5])
                        .style(appearance::subtle_button)
                        .on_press(Message::LibraryTag(Some(tag.clone()))),
                    text(tag).size(12),
                    tooltip::Position::Bottom,
                )
                .style(appearance::card),
            );
        }
        let description = character
            .description
            .replace("{{char}}", &character.name)
            .replace("{{user}}", self.prompt_settings.persona_name.trim());
        let body = column![
            muted(shorten(&description, 70), 12, &self.theme()).width(Fill),
            badges,
            Space::new().height(Fill),
            button(
                row![
                    icon(Icon::Chat, 15),
                    text(if active {
                        "Chat öffnen"
                    } else {
                        "Auswählen und chatten"
                    })
                    .size(12)
                ]
                .spacing(6)
                .align_y(Alignment::Center)
            )
            .padding([8, 10])
            .width(Fill)
            .style(if active {
                appearance::primary_button
            } else {
                appearance::subtle_button
            })
            .on_press(Message::SelectCharacter(index))
        ]
        .spacing(10)
        .padding(12)
        .height(176);
        container(column![stack![cover, overlay], body])
            .width(width)
            .clip(true)
            .style(move |theme| {
                let mut style = appearance::card(theme);
                if active {
                    style.border.color = Color::from_rgb8(168, 85, 247);
                }
                style
            })
            .into()
    }

    fn character_editor(&self) -> Element<'_, Message> {
        use crate::character_draft::Field;
        let Some(draft) = &self.character_draft else {
            return self.characters();
        };
        let fields = Field::ALL
            .iter()
            .copied()
            .filter(|field| *field != Field::Name)
            .collect::<Vec<_>>();
        let mut tabs = row![].spacing(8);
        for (tab, label) in [
            (EditorTab::Fields, "Kartentexte"),
            (EditorTab::Greetings, "Begrüßungen"),
            (EditorTab::Expressions, "Ausdrucksbilder"),
            (EditorTab::Json, "JSON"),
        ] {
            tabs = tabs.push(
                button(text(label).size(13))
                    .padding([8, 12])
                    .style(if self.editor_tab == tab {
                        appearance::primary_button
                    } else {
                        appearance::subtle_button
                    })
                    .on_press(Message::EditorTabChanged(tab)),
            );
        }
        let selector: Element<'_, Message> = match self.editor_tab {
            EditorTab::Expressions => row![
                iced::widget::pick_list(
                    crate::expressions::SLOTS,
                    Some(self.expression_slot),
                    Message::ExpressionSlot
                )
                .padding(10)
                .style(appearance::select),
                muted(self.expression_slot.group(), 12, &self.theme())
            ]
            .spacing(12)
            .align_y(Alignment::Center)
            .into(),
            EditorTab::Fields => row![
                text("Kartenfeld").size(14),
                iced::widget::pick_list(
                    fields,
                    Some(self.character_field),
                    Message::CharacterField
                )
                .padding(10)
                .style(appearance::select)
            ]
            .spacing(12)
            .align_y(Alignment::Center)
            .into(),
            EditorTab::Greetings => row![
                iced::widget::pick_list(
                    (0..=draft.alternate_greetings().len())
                        .map(GreetingChoice)
                        .collect::<Vec<_>>(),
                    Some(GreetingChoice(self.editor_greeting)),
                    Message::EditorGreeting
                )
                .padding(10)
                .style(appearance::select),
                control(Icon::Plus, "Hinzufügen", Message::AddGreeting),
                icon_control(
                    Icon::Close,
                    "Alternative entfernen",
                    (self.editor_greeting > 0).then_some(Message::RemoveGreeting)
                )
            ]
            .spacing(10)
            .align_y(Alignment::Center)
            .into(),
            EditorTab::Json => muted(
                "Vollständiger aktueller Entwurf · schreibgeschützt, auswählbar und kopierbar",
                12,
                &self.theme(),
            )
            .into(),
        };
        let editor: Element<'_, Message> = if self.editor_tab == EditorTab::Expressions {
            let preview: Element<'_, Message> = if let Some(handle) = &self.expression_image {
                image(handle.clone())
                    .width(Fill)
                    .height(Fill)
                    .content_fit(iced::ContentFit::Contain)
                    .into()
            } else {
                container(icon(Icon::Image, 48))
                    .center_x(Fill)
                    .center_y(Fill)
                    .into()
            };
            let reference = draft
                .expressions()
                .get(self.expression_slot.key())
                .and_then(serde_json::Value::as_str)
                .filter(|reference| !reference.trim().is_empty());
            let reference_label = match reference {
                Some(reference) if reference.starts_with("data:") => {
                    "Bild portabel in der Karte eingebettet".to_owned()
                }
                Some(reference) => shorten(reference, 120),
                None => "Kein eigenes Ausdrucksbild".into(),
            };
            let count = crate::expressions::SLOTS
                .iter()
                .filter(|slot| {
                    draft
                        .expressions()
                        .get(slot.key())
                        .and_then(serde_json::Value::as_str)
                        .is_some_and(|reference| !reference.trim().is_empty())
                })
                .count();
            let actions = column![
                text(format!("{count} von 15 Ausdrücken zugeordnet")).size(16),
                muted(reference_label,11,&self.theme()),
                muted(&self.expression_status,12,&self.theme()),
                button("PNG-/WebP-Bild wählen …").padding(8).style(appearance::primary_button)
                    .on_press_maybe((!self.card_busy).then_some(Message::PickExpression)),
                button("Zuordnung entfernen").padding(8).style(appearance::subtle_button)
                    .on_press_maybe((!self.card_busy && reference.is_some()).then_some(Message::RemoveExpression)),
                button("Als Hauptporträt verwenden").padding(8).style(appearance::subtle_button)
                    .on_press_maybe(self.expression_bytes.is_some().then_some(Message::ExpressionAsPortrait)),
                muted("PNG/WebP bis 1 MiB pro Bild. Kleine WebP-Dateien lassen mehr Platz für weitere Ausdrücke. Externe Verweise werden nicht automatisch geladen.",11,&self.theme())
            ].spacing(8).width(Fill);
            scroll(
                row![
                    container(preview)
                        .width(180)
                        .height(220)
                        .style(appearance::card),
                    actions
                ]
                .spacing(16),
            )
            .height(Fill)
            .into()
        } else {
            text_editor(&self.character_text)
                .height(Fill)
                .padding(14)
                .size(14)
                .font(if self.editor_tab == EditorTab::Json {
                    iced::Font::MONOSPACE
                } else {
                    super::ui_font()
                })
                .style(appearance::editor)
                .key_binding(read_only_keys)
                .on_action(Message::CharacterText)
                .into()
        };
        container(column![
            row![text("Charakter bearbeiten").size(26).width(Fill),
                control(Icon::Back,"Bibliothek",Message::Navigate(Page::Characters))].align_y(Alignment::Center),
            muted("Entwurf im Arbeitsspeicher · Profilkopien und importierte Verläufe werden nicht verändert.",12,&self.theme()),
            text_input("Name des Charakters",draft.get(Field::Name)).padding(10).style(appearance::input).on_input(Message::CharacterName),
            tabs,
            selector,
            editor,
            text(&self.character_error).size(13),
            row![
                button("Übernehmen").padding(10).style(appearance::primary_button).on_press(Message::SaveCharacter),
                control(Icon::Close,"Entwurf verwerfen",Message::DiscardCharacter),
                Space::new().width(Fill),
                control(Icon::Copy,"JSON kopieren",Message::CopyCharacterDraft),
            ].spacing(12).align_y(Alignment::Center),
            row![control(Icon::Attachment,"Als JSON speichern",Message::ExportDraft(crate::card_files::Format::Json)),
                control(Icon::Image,"Als PNG speichern",Message::ExportDraft(crate::card_files::Format::Png))].spacing(12),
            muted(&self.notice,12,&self.theme()),
            muted("Export sichert den aktuellen Entwurf als Datei, ohne ihn zu übernehmen. JSON enthält kein Porträt; PNG enthält Karte und Bild. Tags: eine Zeile je Tag. Bei bearbeiteten Feldern werden alte Kartenübersetzungen im Entwurf entfernt.",12,&self.theme())
        ].spacing(14)).padding(24).height(Fill).width(Fill).into()
    }

    fn details(&self) -> Element<'_, Message> {
        let character = self.preview.character();
        let index = self
            .preview
            .characters
            .iter()
            .position(|candidate| candidate.id == character.id)
            .unwrap_or_default();
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
        let draft = crate::character_draft::Draft::from_character(index, character);
        for field in [
            crate::character_draft::Field::Title,
            crate::character_draft::Field::Tags,
            crate::character_draft::Field::Personality,
            crate::character_draft::Field::Scenario,
            crate::character_draft::Field::ExampleMessages,
            crate::character_draft::Field::SystemPrompt,
            crate::character_draft::Field::PostHistory,
            crate::character_draft::Field::CreatorNotes,
        ] {
            if !draft.get(field).trim().is_empty() {
                details = details.push(text(field.to_string()).size(20));
                details = details.push(text(draft.get(field).to_owned()).width(Fill));
            }
        }
        for (number, greeting) in character.greeting_texts().iter().enumerate().skip(1) {
            if !greeting.trim().is_empty() {
                details = details.push(text(format!("Alternative Begrüßung {number}")).size(20));
                details = details.push(text((*greeting).to_owned()).width(Fill));
            }
        }
        if character.card.is_some() {
            details = details.push(
                row![
                    control(
                        Icon::Characters,
                        "Bearbeiten",
                        Message::EditCharacter(index)
                    ),
                    control(
                        Icon::Attachment,
                        "JSON speichern",
                        Message::ExportCharacter(index, crate::card_files::Format::Json)
                    ),
                    control(
                        Icon::Image,
                        "PNG speichern",
                        Message::ExportCharacter(index, crate::card_files::Format::Png)
                    )
                ]
                .spacing(10),
            );
            details = details.push(control(
                Icon::Copy,
                "Vollständige Karte als JSON kopieren",
                Message::CopyCard,
            ));
        }
        details = details.push(muted(&self.notice, 12, &self.theme()));
        scroll(details.padding(24).width(Fill))
            .height(Fill)
            .width(Fill)
            .into()
    }

    fn prompt_view(&self) -> Element<'_, Message> {
        use crate::prompt_preview::{ReplyLength, Template};
        let inputs = container(column![
            row![
                column![muted("Name Deiner Persona",12,&self.theme()),
                    text_input("Persona-Name",&self.prompt_settings.persona_name).style(appearance::input)
                        .on_input(Message::PersonaChanged).padding(10)].spacing(5).width(Fill),
                column![muted("Vorlage",12,&self.theme()),
                    iced::widget::pick_list([Template::Roleplay,Template::Narrator,Template::Companion],Some(self.prompt_settings.template),Message::TemplateChanged)
                        .style(appearance::select).padding(10)].spacing(5),
                column![muted("Antwortlänge",12,&self.theme()),
                    iced::widget::pick_list([ReplyLength::Standard,ReplyLength::Short,ReplyLength::Medium,ReplyLength::Long],Some(self.prompt_settings.reply_length),Message::ReplyLengthChanged)
                        .style(appearance::select).padding(10)].spacing(5),
            ].spacing(14).align_y(Alignment::End),
            text_input("Regieanweisung (optional)",&self.prompt_settings.author_note).style(appearance::input)
                .on_input(Message::AuthorNoteChanged).padding(10),
            muted("Charakterkarte und diese Vorgaben werden mit demselben Prompt-Renderer wie in Tauri verarbeitet. Automatische Lore- und Gedächtnisauswahl folgen noch. Es wird nichts an einen Server gesendet.",12,&self.theme()),
        ].spacing(12)).padding(16).width(Fill).style(appearance::card);
        let mut content = column![
            row![
                text("Prompt-Vorschau").size(26).width(Fill),
                control(Icon::Back, "Zum Chat", Message::Navigate(Page::Chat)),
                control(Icon::Chat, "Aktualisieren", Message::RefreshPrompt)
            ]
            .spacing(10)
            .align_y(Alignment::Center),
            muted(&self.preview.character().name, 14, &self.theme()),
            inputs
        ]
        .spacing(14);
        match &self.prompt {
            Ok(prompt) => {
                content = content.push(
                    row![
                        text("Systemteil").size(16).width(Fill),
                        control(Icon::Copy, "Kopieren", Message::CopyPrompt(false))
                    ]
                    .align_y(Alignment::Center),
                );
                content = content.push(
                    text_editor(&self.prompt_system)
                        .font(iced::Font::MONOSPACE)
                        .size(13)
                        .padding(12)
                        .height(Fill)
                        .style(appearance::editor)
                        .key_binding(read_only_keys)
                        .on_action(|action| Message::PromptAction(false, action)),
                );
                if prompt.post_history.is_some() {
                    content = content.push(
                        row![
                            text("Nachspann nach dem Verlauf").size(16).width(Fill),
                            control(Icon::Copy, "Kopieren", Message::CopyPrompt(true))
                        ]
                        .align_y(Alignment::Center),
                    );
                    content = content.push(
                        text_editor(&self.prompt_post)
                            .font(iced::Font::MONOSPACE)
                            .size(13)
                            .padding(12)
                            .height(100)
                            .style(appearance::editor)
                            .key_binding(read_only_keys)
                            .on_action(|action| Message::PromptAction(true, action)),
                    );
                }
            }
            Err(error) => content = content.push(text(error).size(14)),
        }
        container(content)
            .padding(24)
            .width(Fill)
            .height(Fill)
            .into()
    }

    fn connection_settings(&self) -> Element<'_, Message> {
        let editable = self.diagnostic.is_none();
        let format: Element<'_, Message> = if editable {
            iced::widget::pick_list(
                [
                    crate::connection::Format::OpenAi,
                    crate::connection::Format::Anthropic,
                ],
                Some(self.connection.format),
                Message::FormatChanged,
            )
            .padding(10)
            .style(appearance::select)
            .into()
        } else {
            text(self.connection.format.to_string()).size(14).into()
        };
        container(column![
            text("KI-Verbindung testen").size(19),
            text("Sendet eine kurze feste Testanfrage an den gewählten Server. Deine Charaktere und Chats werden dabei nicht übertragen. Bei Cloud-Anbietern kann die Anfrage kostenpflichtig sein.").size(14),
            row![text("Format").size(13), format].spacing(12).align_y(Alignment::Center),
            text_input("Vollständiger Streaming-Endpunkt", &self.connection.endpoint)
                .style(appearance::input)
                .on_input_maybe(editable.then_some(Message::EndpointChanged)).padding(10),
            text_input("Modellname (bei lokalen Servern häufig optional)", &self.connection.model)
                .style(appearance::input)
                .on_input_maybe(editable.then_some(Message::ModelChanged)).padding(10),
            text_input("API-Schlüssel (optional, nur im Arbeitsspeicher)", &self.connection.key.0).secure(true).style(appearance::input)
                .on_input_maybe(editable.then_some(|value| Message::KeyChanged(crate::connection::Secret(value)))).padding(10),
            row![button("Verbindung testen").padding(10).style(appearance::primary_button)
                .on_press_maybe(editable.then_some(Message::TestConnection)),
                button("Abbrechen").padding(10).style(appearance::subtle_button)
                .on_press_maybe((!editable).then_some(Message::CancelConnection))].spacing(10),
            text(&self.connection_status).size(13).width(Fill),
            muted("Dieser Test prüft Streaming und Erreichbarkeit. Die Charakter-Chat-Anbindung folgt separat.",12,&self.theme()),
        ].spacing(12)).padding(20).width(Fill).style(appearance::card).into()
    }

    fn settings(&self) -> Element<'_, Message> {
        let mut settings=column![text("Einstellungen").size(28),muted("Oberfläche und Profilkopien",14,&self.theme()),
            container(column![text("Erscheinungsbild").size(19),control(if self.dark {Icon::Sun} else {Icon::Moon},if self.dark {"Helles Design verwenden"} else {"Dunkles Design verwenden"},Message::ToggleTheme)].spacing(12)).padding(20).width(Fill).style(appearance::card),
            self.connection_settings(),
            container(column![text("Profilkopie laden").size(19),text("Wähle eine ruhende Kopie mit data/characters und optional data/otakusoul.db. Verläufe werden ausschließlich gelesen.").size(14),
                text_input("Pfad zur Profilkopie",&self.profile_input).style(appearance::input).on_input_maybe((!self.profile_busy).then_some(Message::ProfilePathChanged)).padding(12),
                row![button("Profilkopie laden").padding(10).style(appearance::primary_button).on_press_maybe((!self.profile_busy).then_some(Message::LoadProfile)),
                    button("Beispielprofil erstellen").padding(10).style(appearance::subtle_button).on_press_maybe((!self.profile_busy).then_some(Message::CreateDemo))].spacing(10),
                muted("Das Beispiel enthält vier mitgelieferte Figuren und erfundene Verläufe. Ein vorhandener nichtleerer Ordner wird nicht überschrieben.",12,&self.theme()),
            ].spacing(14)).padding(20).width(Fill).style(appearance::card),
            muted(&self.notice,12,&self.theme()),
        ].spacing(22);
        for warning in &self.warnings {
            settings = settings.push(text(warning).size(12));
        }
        scroll(settings.padding(26).max_width(1000))
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

fn scroll<'a>(content: impl Into<Element<'a, Message>>) -> iced::widget::Scrollable<'a, Message> {
    scrollable(content)
        .style(appearance::scrollbar)
        .direction(scrollable::Direction::Vertical(
            scrollable::Scrollbar::new()
                .width(6)
                .scroller_width(6)
                .margin(2),
        ))
}
