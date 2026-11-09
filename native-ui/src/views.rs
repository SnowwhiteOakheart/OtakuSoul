//! Native Ansichten nach Header, Sidebar und ChatView des Tauri-Frontends.
use super::{
    App, EditorTab, GreetingChoice, HubEntryState, LoreEntryChoice, Message, Page, appearance,
};
use crate::hub_appearance;
use crate::hub_catalog::{Entry as HubEntry, Kind as HubKind};
use crate::icons::{Icon, icon};
use crate::ui_text::{self, CONTENT_LANGUAGE};
use iced::keyboard::{Key, key::Named};
use iced::widget::{
    Space, button, column, container, image, row, scrollable, stack, text, text_editor, text_input,
    tooltip,
};
use iced::{Alignment, Background, Border, Color, Element, Fill, Length, Theme};

type NavItem = (Page, Icon, &'static str);
type NavGroup = (&'static str, &'static [NavItem]);

#[derive(Debug, Clone, PartialEq, Eq)]
struct RuleChoice(String, String);
impl std::fmt::Display for RuleChoice {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.1)
    }
}
fn rule_choices(
    current: String,
    options: &[(&str, &str)],
) -> (Vec<RuleChoice>, Option<RuleChoice>) {
    let mut choices = options
        .iter()
        .map(|(value, label)| RuleChoice((*value).into(), (*label).into()))
        .collect::<Vec<_>>();
    let selected = choices
        .iter()
        .find(|choice| choice.0 == current)
        .cloned()
        .unwrap_or_else(|| {
            let choice = RuleChoice(
                current.clone(),
                format!("Vorhanden: {}", shorten(&current, 40)),
            );
            choices.push(choice.clone());
            choice
        });
    (choices, Some(selected))
}

fn read_only_keys(press: text_editor::KeyPress) -> Option<text_editor::Binding<Message>> {
    if press.key == Key::Named(Named::Tab) {
        Some(text_editor::Binding::Custom(Message::Focus(
            press.modifiers.shift(),
        )))
    } else {
        text_editor::Binding::from_key_press(press)
    }
}

pub(super) fn muted<'a>(
    label: impl Into<std::borrow::Cow<'a, str>>,
    size: u32,
    theme: &Theme,
) -> iced::widget::Text<'a> {
    text(label.into())
        .size(size)
        .color(appearance::muted(theme))
}

pub(super) fn control<'a>(
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
            Page::Lorebooks => self.lorebooks_view(),
            Page::LorebookDetails => self.lorebook_details(),
            Page::LorebookEditor => self.lorebook_editor(),
            Page::Hub => self.hub_view(),
            Page::Stage => self.stage_view(),
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
                button(text(self.active_llm_label()).size(12))
                    .style(appearance::subtle_button)
                    .on_press(Message::Navigate(Page::Settings)),
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
                    (Page::Stage, Icon::Stage, "Stage"),
                    (Page::Planned("Companion"), Icon::Companion, "Companion"),
                ],
            ),
            (
                "BIBLIOTHEK",
                &[
                    (Page::Characters, Icon::Characters, "Charaktere"),
                    (Page::Planned("Avatare"), Icon::Avatars, "Avatare"),
                    (Page::Lorebooks, Icon::Lorebooks, "Lorebooks"),
                    (Page::Hub, Icon::Hub, "Hub"),
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
                    || (matches!(self.page, Page::LorebookDetails | Page::LorebookEditor)
                        && *page == Page::Lorebooks)
                    || (self.page == Page::Prompt && *page == Page::Chat);
                let hub_active = active && *page == Page::Hub;
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
                    .style(if hub_active {
                        hub_appearance::accent_badge
                    } else if active {
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
                    .style(move |theme, status| {
                        if hub_active {
                            hub_appearance::filter(theme, status, true)
                        } else if active {
                            appearance::selected_navigation(theme, status)
                        } else {
                            appearance::navigation(theme, status)
                        }
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
        let query_active = !self.search.trim().is_empty();
        let greeting = (!conversation.is_read_only())
            .then(|| {
                conversation
                    .greeting
                    .as_ref()
                    .map(|(_, text)| text.as_str())
            })
            .flatten();
        let matches = crate::chat_search::find(&conversation.messages, greeting, &self.search);
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
            if matches.greeting
                && conversation
                    .greeting
                    .as_ref()
                    .is_some_and(|(_, text)| !text.trim().is_empty())
                && !conversation.is_read_only()
            {
                let choices = self.chat_greeting_choices();
                if conversation.messages.is_empty()
                    && choices.len() > 1
                    && self.chat_request.is_none()
                {
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
            } else if conversation.messages.is_empty() && !query_active {
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
        if query_active && matches.count() == 0 && conversation.loaded {
            messages = messages.push(
                container(
                    column![
                        text("Keine passenden Nachrichten gefunden.").size(18),
                        muted(
                            "Die Suche umfasst nur den geladenen Verlauf.",
                            12,
                            &self.theme()
                        ),
                        control(Icon::Back, "Suche zurücksetzen", Message::ClearSearch)
                    ]
                    .spacing(12),
                )
                .padding(20)
                .width(Fill)
                .style(appearance::card),
            );
        }
        for &index in &matches.indices {
            let message = &conversation.messages[index];
            let selection = self
                .message_selection
                .as_ref()
                .filter(|(open, _)| *open == index)
                .map(|(_, content)| content);
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
                button(ui_text::text(if selection.is_some() {
                    "common.close"
                } else {
                    "chat.native.selectText"
                }))
                .style(appearance::subtle_button)
                .on_press(Message::SelectMessageText(index)),
                icon_control(
                    Icon::Copy,
                    "Nachricht kopieren",
                    Some(Message::Copy(message.content.clone()))
                )
            ]
            .align_y(Alignment::Center);
            let body: Element<'_, Message> = if let Some(content) = selection {
                text_editor(content)
                    .on_action(Message::MessageTextAction)
                    .height(140)
                    .padding(8)
                    .style(appearance::editor)
                    .into()
            } else if let Some(rendered) = self.rendered.get(index) {
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
                            .id("chat-search")
                            .on_input(Message::SearchChanged)
                            .padding(8),
                        muted(
                            if query_active {
                                format!("{} Treffer", matches.count())
                            } else {
                                "Geladener Verlauf".into()
                            },
                            11,
                            &self.theme()
                        ),
                        icon_control(
                            Icon::Back,
                            "Suche zurücksetzen",
                            (!self.search.is_empty()).then_some(Message::ClearSearch)
                        ),
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
        let busy = self.chat_request.is_some();
        let has_draft = !conversation.draft.trim().is_empty();
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
        if !readonly && !busy {
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
                (!readonly && !busy && has_draft).then_some(Message::Submit)
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
            let model_action = if busy {
                button("Antwort abbrechen").on_press(Message::CancelChat)
            } else {
                button("An Modell senden")
                    .on_press_maybe((has_draft && !self.profile_busy).then_some(Message::SendChat))
            };
            row![
                muted("Strg+Enter · lokal hinzufügen", 11, &self.theme()).width(Fill),
                model_action.style(appearance::subtle_button),
                button("Testchat leeren")
                    .style(appearance::navigation)
                    .on_press_maybe((!busy).then_some(Message::Clear))
            ]
            .spacing(8)
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

    fn hub_view(&self) -> Element<'_, Message> {
        if let Some(world) = &self.hub.world {
            return self.hub_world_view(world);
        }
        iced::widget::responsive(move |size| self.hub_catalog_view(size.width)).into()
    }

    fn hub_catalog_view(&self, width: f32) -> Element<'_, Message> {
        let hub = &self.hub;
        let kind = hub.kind;
        let loading = hub.loading.contains(&kind);
        let mut list = column![].spacing(12);
        if loading {
            list = list.push(text(ui_text::text("common.loading")).size(14));
        }
        if let Some(error) = hub.errors.get(&kind) {
            list = list.push(text(ui_text::format("hub.loadError", &[("error", error)])).size(14));
        }
        if !hub.notice.is_empty() {
            list = list.push(text(&hub.notice).size(14));
        }
        if !self.stage.hub_notice.is_empty() {
            list = list.push(text(&self.stage.hub_notice).size(14));
        }
        if !self.hub_library_notice().is_empty() {
            list = list.push(text(self.hub_library_notice()).size(14));
        }
        if let Some(entries) = hub.catalog.get(&kind) {
            let query = hub.query.trim().to_lowercase();
            let member_matches: std::collections::HashSet<_> =
                if kind == HubKind::Worlds && !query.is_empty() {
                    HubKind::WORLD_CONTENTS
                        .into_iter()
                        .flat_map(|kind| {
                            hub.catalog
                                .get(&kind)
                                .into_iter()
                                .flatten()
                                .filter(|entry| entry.matches(&query, CONTENT_LANGUAGE))
                                .map(move |entry| (kind, entry.id.as_str()))
                        })
                        .collect()
                } else {
                    Default::default()
                };
            let visible: Vec<_> = entries
                .iter()
                .filter(|entry| {
                    entry.matches(&query, CONTENT_LANGUAGE)
                        || entry.members.iter().any(|member| {
                            member_matches.contains(&(member.kind, member.id.as_str()))
                        })
                })
                .collect();
            if visible.is_empty() {
                list = list.push(text(ui_text::text("hub.noWorlds")));
            } else if kind == HubKind::Worlds {
                list = list.push(muted(
                    ui_text::text("hub.collections").to_uppercase(),
                    13,
                    &self.theme(),
                ));
            }
            if kind != HubKind::Worlds || !query.is_empty() {
                list = list.push(muted(
                    ui_text::format(
                        "hub.native.results",
                        &[
                            ("visible", &visible.len().to_string()),
                            ("total", &entries.len().to_string()),
                        ],
                    ),
                    12,
                    &self.theme(),
                ));
            }
            let content_width = (width - 48.0).max(1.0);
            let cols = if content_width >= 1120.0 {
                3
            } else if content_width >= 620.0 {
                2
            } else {
                1
            };
            let card_width = ((content_width - 16.0 * (cols - 1) as f32) / cols as f32).max(1.0);
            for chunk in visible.chunks(cols) {
                let mut cards = row![].spacing(16).align_y(Alignment::Start);
                for entry in chunk {
                    cards = cards.push(self.hub_card(kind, entry, card_width));
                }
                list = list.push(cards);
            }
        }
        column![
            self.hub_header(width),
            container(scroll(list.padding(24)).height(Fill).width(Fill))
                .width(Fill)
                .height(Fill)
                .style(hub_appearance::canvas)
        ]
        .height(Fill)
        .width(Fill)
        .into()
    }

    fn hub_header(&self, width: f32) -> Element<'_, Message> {
        let theme = self.theme();
        let accent = hub_appearance::accent(&theme);
        let kind = self.hub.kind;
        let title = row![
            container(tinted_icon(Icon::Hub, 23, accent))
                .padding(11)
                .style(hub_appearance::accent_badge),
            column![
                row![
                    text(ui_text::text("hub.title")).size(19).font(iced::Font {
                        weight: iced::font::Weight::Bold,
                        ..crate::ui_font()
                    }),
                    container(text(ui_text::text("hub.subtitleBadge")).size(11))
                        .padding([3, 8])
                        .style(hub_appearance::accent_badge),
                ]
                .spacing(8)
                .align_y(Alignment::Center)
                .wrap(),
                muted(ui_text::text("hub.native.intro"), 12, &theme),
            ]
            .spacing(4)
            .width(Fill),
        ]
        .spacing(12)
        .align_y(Alignment::Center)
        .width(Fill);
        let search = text_input(
            ui_text::text(match kind {
                HubKind::Worlds => "hub.searchWorlds",
                HubKind::Characters => "hub.searchGateway",
                HubKind::Scenes => "hub.searchScenes",
                HubKind::Lorebooks => "hub.searchLorebooks",
            }),
            &self.hub.query,
        )
        .on_input(Message::HubSearch)
        .padding([7, 8])
        .size(13)
        .style(|theme, status| {
            let mut style = appearance::input(theme, status);
            style.background = Background::Color(Color::TRANSPARENT);
            style.border = Border::default();
            style
        });
        let search = container(
            row![
                tinted_icon(Icon::Search, 17, appearance::muted(&theme)),
                search
            ]
            .align_y(Alignment::Center),
        )
        .padding([2, 10])
        .width(Fill)
        .style(appearance::card);
        let refresh_available = self.hub.loading.is_empty();
        let reload = tooltip(
            button(tinted_icon(
                Icon::Refresh,
                17,
                if refresh_available {
                    theme.palette().text
                } else {
                    appearance::muted(&theme)
                },
            ))
            .padding(8)
            .style(appearance::subtle_button)
            .on_press_maybe(refresh_available.then_some(Message::HubRefresh)),
            text(ui_text::text("hub.reload")).size(12),
            tooltip::Position::Bottom,
        )
        .style(appearance::card);
        let tools = row![search, reload].spacing(10).align_y(Alignment::Center);
        let heading: Element<'_, Message> = if width >= 900.0 {
            row![title, container(tools).width(360)]
                .spacing(18)
                .align_y(Alignment::Center)
                .into()
        } else {
            column![title, tools].spacing(10).into()
        };
        let heading = container(heading)
            .padding([16, 24])
            .width(Fill)
            .style(hub_appearance::header);

        let mut tab_label = row![
            tinted_icon(Icon::Library, 15, accent),
            text(ui_text::text("hub.tabWorlds")).size(13),
        ]
        .spacing(8)
        .align_y(Alignment::Center);
        if let Some(entries) = self.hub.catalog.get(&HubKind::Worlds) {
            tab_label = tab_label.push(
                container(text(entries.len().to_string()).size(11))
                    .padding([2, 6])
                    .style(hub_appearance::accent_badge),
            );
        }
        let tab = column![
            button(tab_label)
                .width(Fill)
                .padding([9, 12])
                .style(hub_appearance::world_tab)
                .on_press(Message::HubKind(HubKind::Worlds)),
            container(Space::new())
                .width(Fill)
                .height(2)
                .style(|theme| container::Style {
                    background: Some(hub_appearance::accent(theme).into()),
                    ..container::Style::default()
                }),
        ]
        .width(134);
        let mut filters = row![].spacing(6).align_y(Alignment::Center);
        for filter in HubKind::ALL {
            let name = if filter == HubKind::Worlds {
                ui_text::text("hub.worldsAll")
            } else {
                hub_kind_label(filter)
            };
            let mut content = row![
                tinted_icon(hub_kind_icon(filter), 15, hub_kind_color(filter, &theme)),
                text(name).size(12),
            ]
            .spacing(6)
            .align_y(Alignment::Center);
            if let Some(entries) = self.hub.catalog.get(&filter) {
                content = content.push(muted(entries.len().to_string(), 11, &theme));
            }
            filters = filters.push(
                button(content)
                    .padding([6, 10])
                    .style(move |theme, status| {
                        hub_appearance::filter(theme, status, kind == filter)
                    })
                    .on_press(Message::HubKind(filter)),
            );
        }
        let toolbar: Element<'_, Message> = if width >= 960.0 {
            row![tab, container(filters).align_right(Fill)]
                .spacing(12)
                .align_y(Alignment::Center)
                .into()
        } else {
            column![
                tab,
                scrollable(filters)
                    .direction(scrollable::Direction::Horizontal(
                        scrollable::Scrollbar::new().width(5).scroller_width(5),
                    ))
                    .height(36)
                    .width(Fill)
                    .style(appearance::scrollbar)
            ]
            .spacing(5)
            .into()
        };
        column![
            heading,
            container(toolbar)
                .padding([0, 24])
                .width(Fill)
                .style(hub_appearance::toolbar)
        ]
        .into()
    }

    fn hub_card<'a>(
        &'a self,
        kind: HubKind,
        entry: &'a HubEntry,
        width: f32,
    ) -> Element<'a, Message> {
        if kind == HubKind::Worlds {
            return self.hub_collection_card(entry, width);
        }
        let mut item = column![
            row![
                icon(hub_kind_icon(kind), 20),
                text(entry.title(CONTENT_LANGUAGE)).size(17)
            ]
            .spacing(8)
            .align_y(Alignment::Center),
            muted(hub_byline(entry), 12, &self.theme())
        ]
        .spacing(10)
        .width(Fill);
        let description = entry.description(CONTENT_LANGUAGE);
        if !description.is_empty() {
            item = item.push(text(description).size(13));
        }
        if entry.can_import() {
            item = item.push(self.hub_import_button(kind, entry));
        } else if entry.can_preview_scene() {
            item = item.push(self.hub_scene_button(entry));
        }
        container(item)
            .padding(16)
            .width(width)
            .style(appearance::card)
            .into()
    }

    fn hub_collection_card<'a>(&'a self, entry: &'a HubEntry, width: f32) -> Element<'a, Message> {
        let theme = self.theme();
        let height = width * 9.0 / 16.0;
        let collection_label = container(
            row![
                tinted_icon(Icon::Library, 13, Color::WHITE),
                text(ui_text::text("hub.collection")).size(12),
            ]
            .spacing(5)
            .align_y(Alignment::Center),
        )
        .padding([4, 7])
        .style(hub_appearance::cover_label);
        let title = container(
            text(entry.title(CONTENT_LANGUAGE))
                .size(18)
                .font(iced::Font {
                    weight: iced::font::Weight::Bold,
                    ..crate::ui_font()
                }),
        )
        .width(Fill)
        .padding([6, 8])
        .style(hub_appearance::cover_label);
        let banner = stack![
            self.hub_banner(entry, height),
            container(Space::new())
                .width(Fill)
                .height(Fill)
                .style(hub_appearance::cover_shade),
            container(column![collection_label, Space::new().height(Fill), title,])
                .padding(11)
                .width(Fill)
                .height(Fill),
        ]
        .width(Fill)
        .height(height);
        let banner: Element<'_, Message> = if let Some(address) = &entry.cover {
            let generation = self.hub.cover_generation;
            iced::widget::sensor(banner)
                .key((generation, entry.id.clone()))
                .anticipate(80)
                .on_show(move |_| {
                    Message::HubCoverVisible(generation, entry.id.clone(), address.clone(), true)
                })
                .on_hide(Message::HubCoverVisible(
                    generation,
                    entry.id.clone(),
                    address.clone(),
                    false,
                ))
                .into()
        } else {
            banner.into()
        };
        let mut counts = row![].spacing(6);
        for kind in HubKind::WORLD_CONTENTS {
            let count = entry
                .members
                .iter()
                .filter(|member| member.kind == kind)
                .count();
            if count == 0 {
                continue;
            }
            let chip = container(
                row![
                    tinted_icon(hub_kind_icon(kind), 14, hub_kind_color(kind, &theme)),
                    text(count.to_string()).size(12),
                ]
                .spacing(5)
                .align_y(Alignment::Center),
            )
            .padding([4, 8])
            .style(|theme| {
                let mut style = appearance::card(theme);
                style.border.radius = 20.0.into();
                style
            });
            counts = counts.push(
                tooltip(
                    chip,
                    text(hub_kind_label(kind)).size(11),
                    tooltip::Position::Top,
                )
                .style(appearance::card),
            );
        }
        let description = shorten(entry.description(CONTENT_LANGUAGE), (width / 3.5) as usize);
        let body = container(column![counts, muted(description, 13, &theme),].spacing(8))
            .padding(16)
            .width(Fill);
        button(column![banner, body])
            .padding(0)
            .width(width)
            .style(hub_appearance::collection)
            .on_press(Message::HubOpenWorld(entry.id.clone()))
            .into()
    }

    fn hub_scene_button<'a>(&self, entry: &HubEntry) -> Element<'a, Message> {
        let loading = self.stage.hub_loading.as_deref() == Some(entry.id.as_str());
        button(ui_text::text(if loading {
            "common.loading"
        } else {
            "gallery.look"
        }))
        .style(appearance::subtle_button)
        .on_press_maybe(
            self.stage
                .hub_loading
                .is_none()
                .then(|| Message::HubScenePreview(entry.id.clone())),
        )
        .into()
    }

    fn hub_import_button<'a>(&self, kind: HubKind, entry: &HubEntry) -> Element<'a, Message> {
        let key = (kind, entry.id.clone());
        let state = self.hub.entry_state(&key, entry.revision);
        let label = if self.hub.importing.as_ref() == Some(&key) {
            "hub.importing"
        } else {
            match state {
                HubEntryState::Available => "common.import",
                HubEntryState::Installed => "hub.native.imported",
                HubEntryState::UpdateAvailable => "hub.update",
                HubEntryState::PendingRestart => "hub.native.pendingRestart",
            }
        };
        let action = button(ui_text::text(label))
            .style(appearance::primary_button)
            .on_press_maybe(
                (self.hub.importing.is_none()
                    && !self.profile_busy
                    && !self.hub.library_loading
                    && self.hub.store.is_some()
                    && !self.hub.loading.contains(&kind)
                    && matches!(
                        state,
                        HubEntryState::Available | HubEntryState::UpdateAvailable
                    ))
                .then_some(Message::HubImport(kind, key.1)),
            );
        if state == HubEntryState::UpdateAvailable {
            column![
                muted(ui_text::text("hub.updateAvailable"), 11, &self.theme()),
                action
            ]
            .spacing(4)
            .into()
        } else {
            action.into()
        }
    }

    fn hub_library_notice(&self) -> &str {
        if self.hub.library_loading {
            ui_text::text("hub.native.storeLoading")
        } else {
            &self.hub.library_notice
        }
    }

    fn hub_banner<'a>(&'a self, entry: &HubEntry, height: f32) -> Element<'a, Message> {
        if let Some(handle) = entry
            .cover
            .as_ref()
            .and_then(|address| self.hub.covers.get(address))
        {
            image(handle.clone())
                .width(Fill)
                .height(height)
                .border_radius(iced::border::top(16.0))
                .content_fit(iced::ContentFit::Cover)
                .into()
        } else {
            container(icon(Icon::Hub, 54))
                .center_x(Fill)
                .center_y(height)
                .style(appearance::panel)
                .into()
        }
    }

    fn hub_world_view<'a>(&'a self, world: &'a super::HubWorld) -> Element<'a, Message> {
        let mut content = column![
            control(
                Icon::Back,
                ui_text::text("common.back"),
                Message::HubCloseWorld
            ),
            container(self.hub_banner(&world.entry, 176.0))
                .width(Fill)
                .clip(true)
                .style(appearance::card),
            muted(ui_text::text("hub.collection"), 12, &self.theme()),
            text(world.entry.title(CONTENT_LANGUAGE)).size(26),
            muted(hub_byline(&world.entry), 12, &self.theme()),
            text(world.entry.description(CONTENT_LANGUAGE)).size(14),
        ]
        .spacing(12);
        if !self.hub.notice.is_empty() {
            content = content.push(text(&self.hub.notice).size(14));
        }
        if !self.stage.hub_notice.is_empty() {
            content = content.push(text(&self.stage.hub_notice).size(14));
        }
        if !self.hub_library_notice().is_empty() {
            content = content.push(text(self.hub_library_notice()).size(14));
        }
        for kind in HubKind::WORLD_CONTENTS {
            let members: Vec<_> = world
                .entry
                .members
                .iter()
                .filter(|member| member.kind == kind)
                .collect();
            if members.is_empty() {
                continue;
            }
            content = content.push(
                row![
                    icon(hub_kind_icon(kind), 18),
                    text(hub_kind_label(kind)).size(17)
                ]
                .spacing(8)
                .align_y(Alignment::Center),
            );
            if self.hub.loading.contains(&kind) {
                content = content.push(text(ui_text::text("common.loading")).size(13));
            }
            if let Some(error) = self.hub.errors.get(&kind) {
                content = content.push(
                    row![
                        text(ui_text::format("hub.loadError", &[("error", error)]))
                            .size(13)
                            .width(Fill),
                        control(
                            Icon::Back,
                            ui_text::text("common.retry"),
                            Message::HubReload(kind)
                        ),
                    ]
                    .spacing(8)
                    .align_y(Alignment::Center),
                );
            }
            let Some(entries) = self.hub.catalog.get(&kind) else {
                continue;
            };
            let mut available = false;
            for member in members {
                let Some(entry) = entries.iter().find(|entry| entry.id == member.id) else {
                    continue;
                };
                available = true;
                let mut metadata = column![text(entry.title(CONTENT_LANGUAGE)).size(15)]
                    .width(Fill)
                    .spacing(4);
                let description = entry.description(CONTENT_LANGUAGE);
                if !description.is_empty() {
                    metadata = metadata.push(muted(description, 12, &self.theme()));
                }
                let mut item = row![metadata].spacing(12).align_y(Alignment::Center);
                if entry.can_import() {
                    item = item.push(self.hub_import_button(kind, entry));
                } else if entry.can_preview_scene() {
                    item = item.push(self.hub_scene_button(entry));
                } else {
                    item = item.push(muted(
                        ui_text::text("hub.native.stagePreview"),
                        11,
                        &self.theme(),
                    ));
                }
                content = content.push(
                    container(item)
                        .padding(12)
                        .width(Fill)
                        .style(appearance::card),
                );
            }
            if !available {
                content = content.push(muted(ui_text::text("hub.noWorlds"), 12, &self.theme()));
            }
        }
        scroll(container(content.padding(20).max_width(820)).center_x(Fill))
            .width(Fill)
            .height(Fill)
            .into()
    }

    fn lorebooks_view(&self) -> Element<'_, Message> {
        let mut content = column![
            row![text("Lorebooks").size(26).width(Fill),
                control(Icon::Plus,"Neu",Message::NewLorebook),
                control(Icon::Attachment,"JSON laden",Message::ImportLorebook)].align_y(Alignment::Center),
            muted("Katalog im Arbeitsspeicher. Im Charaktereditor bindest Du Bücher an eine Figur. In der Prompt-Vorschau prüfst Du globale und gebundene Bücher.",13,&self.theme()),
            muted(&self.notice,12,&self.theme()),
        ].spacing(16);
        if self.character_draft.is_some() {
            content = content.push(control(
                Icon::Back,
                "Charakterentwurf fortsetzen",
                Message::Navigate(Page::CharacterEditor),
            ));
        }
        if self.lore_draft.is_some() {
            content = content.push(control(
                Icon::Lorebooks,
                "Lorebookentwurf fortsetzen",
                Message::Navigate(Page::LorebookEditor),
            ));
        }
        if self.lorebooks.is_empty() {
            content = content.push(container(column![icon(Icon::Lorebooks,32),text("Noch keine Lorebooks geladen.").size(20),
                muted("Lade eine Lorebook-JSON-Datei. Vorhandene Bindungen bleiben auch ohne geladenes Buch erhalten.",13,&self.theme())].spacing(16)).padding(24).width(Fill).style(appearance::card));
        }
        for (index, book) in self.lorebooks.iter().enumerate() {
            content = content.push(
                container(
                    row![
                        icon(Icon::Lorebooks, 24),
                        column![
                            text(&book.name).size(20),
                            muted(shorten(&book.description, 180), 12, &self.theme()),
                            muted(
                                format!(
                                    "{} Einträge · Referenz: {}",
                                    book.entries.len(),
                                    book.binding_key()
                                ),
                                11,
                                &self.theme()
                            )
                        ]
                        .spacing(6)
                        .width(Fill),
                        column![
                            control(Icon::Eye, "Ansehen", Message::InspectLorebook(index)),
                            control(Icon::Characters, "Bearbeiten", Message::EditLorebook(index))
                        ]
                        .spacing(8)
                    ]
                    .spacing(14)
                    .align_y(Alignment::Center),
                )
                .padding(16)
                .width(Fill)
                .style(appearance::card),
            );
        }
        scroll(content.padding(24)).height(Fill).width(Fill).into()
    }

    fn lorebook_details(&self) -> Element<'_, Message> {
        let Some(index) = self.lorebook_selected else {
            return self.lorebooks_view();
        };
        let Some(book) = self.lorebooks.get(index) else {
            return self.lorebooks_view();
        };
        let query = self.lore_entry_search.trim().to_lowercase();
        let entries = book
            .entries
            .iter()
            .filter(|entry| {
                query.is_empty()
                    || entry.name.to_lowercase().contains(&query)
                    || entry.content.to_lowercase().contains(&query)
            })
            .collect::<Vec<_>>();
        let mut content = column![
            row![
                text(&book.name).size(26).width(Fill),
                control(Icon::Back, "Katalog", Message::Navigate(Page::Lorebooks)),
                control(Icon::Copy, "JSON kopieren", Message::CopyLorebook(index))
            ]
            .spacing(10)
            .align_y(Alignment::Center),
            row![
                control(Icon::Characters, "Bearbeiten", Message::EditLorebook(index)),
                control(
                    Icon::Attachment,
                    "Als JSON speichern",
                    Message::ExportLorebook(index)
                )
            ]
            .spacing(10),
            text(&book.description).size(14),
            muted(
                "Aktueller Katalogstand · keine Auswertung der Aktivierungsregeln.",
                12,
                &self.theme()
            ),
            muted(&self.notice, 12, &self.theme()),
            text_input("Einträge durchsuchen …", &self.lore_entry_search)
                .on_input(Message::LoreEntrySearch)
                .padding(10)
                .style(appearance::input),
            muted(
                format!(
                    "{} von {} Einträgen · maximal 200 Treffer gleichzeitig sichtbar",
                    entries.len(),
                    book.entries.len()
                ),
                12,
                &self.theme()
            ),
        ]
        .spacing(16);
        if entries.is_empty() {
            content = content.push(text("Keine passenden Einträge gefunden."));
        }
        for entry in entries.into_iter().take(200) {
            content = content.push(
                container(
                    column![
                        row![
                            text(&entry.name).size(18).width(Fill),
                            muted(
                                if entry.enabled {
                                    "In Datei aktiv"
                                } else {
                                    "In Datei deaktiviert"
                                },
                                11,
                                &self.theme()
                            )
                        ]
                        .spacing(10),
                        text(&entry.content).size(14).width(Fill)
                    ]
                    .spacing(10),
                )
                .padding(16)
                .width(Fill)
                .style(appearance::card),
            );
        }
        scroll(content.padding(24)).height(Fill).width(Fill).into()
    }

    fn lorebook_rules(&self) -> Element<'_, Message> {
        let Some(draft) = &self.lore_draft else {
            return text("Kein Entwurf geöffnet.").into();
        };
        let mut rules=column![
            row![column![muted("Suchbereich: letzte Nachrichten",12,&self.theme()),
                text_input("5",&self.lore_scan_depth).padding(10).style(appearance::input).on_input(Message::LoreScanDepth)].spacing(5).width(Fill),
                iced::widget::checkbox(draft.is_global()).label("Global (Dateieinstellung)").on_toggle(Message::LoreGlobal)
            ].spacing(16).align_y(Alignment::Center),
            muted("Die Prompt-Vorschau prüft Regeln anhand der letzten fünf angezeigten Nachrichten bei einem Spannungswert von null.",12,&self.theme())
        ].spacing(16);
        if self.lore_selected_entry < draft.count() {
            let index = self.lore_selected_entry;
            let (triggers, trigger) = rule_choices(
                draft.trigger(index),
                &[
                    ("keyword", "Schlüsselwörter"),
                    ("regex", "Reguläre Ausdrücke"),
                    ("always_on", "Immer aufnehmen"),
                    ("tension", "Spannung"),
                ],
            );
            let (behaviors, behavior) = rule_choices(
                draft.injection(index),
                &[("passive", "Hintergrundwissen"), ("active", "Anweisung")],
            );
            rules = rules.push(
                row![
                    column![
                        muted("Aktivierung", 12, &self.theme()),
                        iced::widget::pick_list(triggers, trigger, |choice| Message::LoreTrigger(
                            choice.0
                        ))
                        .padding(10)
                        .style(appearance::select)
                    ]
                    .spacing(5)
                    .width(Fill),
                    column![
                        muted("Einfügen als", 12, &self.theme()),
                        iced::widget::pick_list(behaviors, behavior, |choice| {
                            Message::LoreInjection(choice.0)
                        })
                        .padding(10)
                        .style(appearance::select)
                    ]
                    .spacing(5)
                    .width(Fill)
                ]
                .spacing(16),
            );
            let mut numbers = row![].spacing(12);
            for number in crate::lore_draft::Number::ALL {
                numbers = numbers.push(
                    column![
                        muted(number.to_string(), 12, &self.theme()),
                        text_input("Optional", &self.lore_numbers[number as usize])
                            .padding(10)
                            .style(appearance::input)
                            .on_input(move |value| Message::LoreNumber(number, value))
                    ]
                    .spacing(5)
                    .width(Fill),
                );
            }
            rules = rules.push(numbers);
            rules=rules.push(muted("Wahrscheinlichkeit und Spannung: 0–100, leer = kein eigener Wert. Priorität: ganze Zahl.",11,&self.theme()));
            rules = rules.push(
                column![
                    iced::widget::checkbox(draft.case_sensitive(index))
                        .label("Groß-/Kleinschreibung beachten")
                        .on_toggle(Message::LoreCaseSensitive),
                    iced::widget::checkbox(draft.whole_words(index))
                        .label("Nur ganze Wörter")
                        .on_toggle(Message::LoreWholeWords)
                ]
                .spacing(10),
            );
            rules = rules.push(
                row![
                    control(
                        Icon::Lorebooks,
                        "Benötigte Einträge",
                        Message::LoreField(crate::lore_draft::Field::ChainRequires)
                    ),
                    control(
                        Icon::Lorebooks,
                        "Aktivierte Einträge",
                        Message::LoreField(crate::lore_draft::Field::ChainActivates)
                    )
                ]
                .spacing(10),
            );
            rules=rules.push(muted("Verkettungen verweisen zeilenweise auf Namen oder UIDs. Vorhandene weitergehende Regeln bleiben erhalten.",11,&self.theme()));
        }
        scroll(rules).height(Fill).width(Fill).into()
    }

    fn lorebook_editor(&self) -> Element<'_, Message> {
        let Some(draft) = &self.lore_draft else {
            return self.lorebooks_view();
        };
        let choices = draft
            .entry_names()
            .into_iter()
            .enumerate()
            .map(|(index, name)| {
                LoreEntryChoice(index, format!("{}. {}", index + 1, shorten(&name, 36)))
            })
            .collect::<Vec<_>>();
        let selected = choices.get(self.lore_selected_entry).cloned();
        let mut content=column![
            row![text("Lorebook bearbeiten").size(26).width(Fill),control(Icon::Back,"Katalog",Message::Navigate(Page::Lorebooks))].align_y(Alignment::Center),
            muted("Entwurf im Arbeitsspeicher · übernommene Regeln kannst Du in der Prompt-Vorschau prüfen.",12,&self.theme()),
            row![text_input("Lorebook-Name",&draft.name).on_input(Message::LoreName).padding(10).style(appearance::input),
                text_input("Beschreibung (optional)",&draft.description).on_input(Message::LoreDescription).padding(10).style(appearance::input)].spacing(10),
            row![iced::widget::pick_list(choices,selected,Message::LoreSelectEntry).placeholder("Noch kein Eintrag").padding(8).style(appearance::select).width(Fill),
                control(Icon::Plus,"Eintrag",Message::AddLoreEntry),
                icon_control(Icon::Close,"Eintrag entfernen",(draft.count()>0).then_some(Message::RemoveLoreEntry))].spacing(10).align_y(Alignment::Center)
        ].spacing(10);
        content = content.push(
            row![
                button("Eintragstext")
                    .padding([6, 10])
                    .style(if self.lore_show_rules {
                        appearance::subtle_button
                    } else {
                        appearance::primary_button
                    })
                    .on_press(Message::LoreShowRules(false)),
                button("Regeln")
                    .padding([6, 10])
                    .style(if self.lore_show_rules {
                        appearance::primary_button
                    } else {
                        appearance::subtle_button
                    })
                    .on_press(Message::LoreShowRules(true))
            ]
            .spacing(8),
        );
        if self.lore_show_rules {
            content = content.push(self.lorebook_rules());
        } else if self.lore_selected_entry < draft.count() {
            content = content.push(
                text_input("Name des Eintrags", &self.lore_entry_name)
                    .on_input(Message::LoreEntryName)
                    .padding(10)
                    .style(appearance::input),
            );
            content = content.push(
                row![
                    iced::widget::checkbox(draft.enabled(self.lore_selected_entry))
                        .label("Eintrag eingeschaltet")
                        .on_toggle(Message::LoreEnabled),
                    iced::widget::checkbox(draft.always(self.lore_selected_entry))
                        .label("Immer aufnehmen")
                        .on_toggle(Message::LoreAlways)
                ]
                .spacing(20),
            );
            content = content.push(
                iced::widget::pick_list(
                    crate::lore_draft::Field::ALL,
                    Some(self.lore_field),
                    Message::LoreField,
                )
                .padding(8)
                .style(appearance::select),
            );
            content = content.push(
                text_editor(&self.lore_text)
                    .height(Fill)
                    .padding(12)
                    .size(14)
                    .style(appearance::editor)
                    .key_binding(read_only_keys)
                    .on_action(Message::LoreText),
            );
        } else {
            content = content.push(
                container(text("Füge den ersten Eintrag hinzu.").size(18))
                    .center_x(Fill)
                    .center_y(Fill),
            );
        }
        let error = self
            .lore_scan_error
            .as_deref()
            .or_else(|| self.lore_number_errors.iter().find_map(Option::as_deref))
            .unwrap_or(&self.lore_error);
        content = content.push(text(error).size(13));
        if self.lore_rules_invalid() {
            content = content.push(control(
                Icon::Back,
                "Ungültige Eingabe verwerfen",
                Message::ResetLoreRules,
            ));
        }
        content = content.push(
            row![
                button("Übernehmen")
                    .padding(10)
                    .style(appearance::primary_button)
                    .on_press_maybe((!self.lore_rules_invalid()).then_some(Message::SaveLorebook)),
                control(Icon::Close, "Entwurf verwerfen", Message::DiscardLorebook),
                Space::new().width(Fill),
                control(Icon::Attachment, "JSON speichern", Message::ExportLoreDraft)
            ]
            .spacing(10)
            .align_y(Alignment::Center),
        );
        content = content.push(muted(&self.notice, 11, &self.theme()));
        content=content.push(muted("Schlüssel: eine Zeile je Begriff. Übernehmen ändert nur RAM; JSON speichern exportiert den aktuellen Entwurf. ID bleibt stabil, reine Namens-/Pfadbindungen nach Umbenennen prüfen.",11,&self.theme()));
        container(content)
            .padding(24)
            .width(Fill)
            .height(Fill)
            .into()
    }

    fn lorebook_bindings(&self) -> Element<'_, Message> {
        let Some(draft) = &self.character_draft else {
            return text("Kein Entwurf geöffnet.").into();
        };
        let mut content = column![
            row![control(Icon::Attachment,"Lorebook-JSON laden",Message::ImportLorebook),control(Icon::Lorebooks,"Katalog",Message::Navigate(Page::Lorebooks))].spacing(10),
            muted("Geladene Lorebooks zuordnen oder eine bekannte ID/einen Namen eintragen. Die Bücher selbst werden dadurch nicht in die Charakterkarte eingebettet.",12,&self.theme()),
        ].spacing(12);
        for (index, book) in self.lorebooks.iter().enumerate() {
            let bound = draft
                .bound_lorebooks()
                .iter()
                .any(|reference| book.matches_reference(reference));
            content = content.push(
                container(
                    row![
                        iced::widget::checkbox(bound)
                            .label(format!("{} · {} Einträge", book.name, book.entries.len()))
                            .on_toggle(move |_| Message::ToggleLorebook(index))
                            .width(Fill),
                        control(Icon::Eye, "Ansehen", Message::InspectLorebook(index))
                    ]
                    .spacing(12)
                    .align_y(Alignment::Center),
                )
                .padding(12)
                .width(Fill)
                .style(appearance::card),
            );
        }
        content = content.push(
            row![
                text_input("Lorebook-ID oder Name", &self.lore_reference_input)
                    .on_input(Message::LoreReferenceInput)
                    .on_submit(Message::AddLoreReference)
                    .padding(10)
                    .style(appearance::input),
                control(Icon::Plus, "Hinzufügen", Message::AddLoreReference)
            ]
            .spacing(10),
        );
        for (index, reference) in draft.bound_lorebooks().iter().enumerate() {
            let resolved = self
                .lorebooks
                .iter()
                .any(|book| book.matches_reference(reference));
            content = content.push(
                row![
                    column![
                        text(reference).size(13),
                        muted(
                            if resolved {
                                "Im Katalog geladen"
                            } else {
                                "Nicht im Katalog geladen · Referenz bleibt erhalten"
                            },
                            11,
                            &self.theme()
                        )
                    ]
                    .spacing(4)
                    .width(Fill),
                    icon_control(
                        Icon::Close,
                        "Bindung entfernen",
                        Some(Message::RemoveLoreReference(index))
                    )
                ]
                .spacing(10)
                .align_y(Alignment::Center),
            );
        }
        if let Some(book) = self.embedded_lorebook() {
            let count = book.get("entries").and_then(|entries| {
                entries
                    .as_array()
                    .map(Vec::len)
                    .or_else(|| entries.as_object().map(serde_json::Map::len))
            });
            content = content.push(
                container(
                    column![
                        text("Eingebettetes Lorebook").size(16),
                        muted(
                            count
                                .map(|count| format!(
                                    "{count} Einträge · unverändert in der Karte enthalten"
                                ))
                                .unwrap_or_else(|| {
                                    "Eingebettete Daten vorhanden · Format noch nicht geprüft"
                                        .into()
                                }),
                            12,
                            &self.theme()
                        ),
                        control(
                            Icon::Copy,
                            "Eingebettetes JSON kopieren",
                            Message::CopyEmbeddedLorebook
                        )
                    ]
                    .spacing(8),
                )
                .padding(12)
                .width(Fill)
                .style(appearance::card),
            );
        }
        scroll(content).height(Fill).width(Fill).into()
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
            (EditorTab::Lorebooks, "Lorebooks"),
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
            EditorTab::Lorebooks => muted(
                format!(
                    "{} Bindungen · geladene Bücher lassen sich in der Prompt-Vorschau prüfen",
                    draft.bound_lorebooks().len()
                ),
                12,
                &self.theme(),
            )
            .into(),
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
        let editor: Element<'_, Message> = if self.editor_tab == EditorTab::Lorebooks {
            self.lorebook_bindings()
        } else if self.editor_tab == EditorTab::Expressions {
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
            muted("Lokale Vorschau der Charakterkarte und des Prompts. „Lore prüfen“ wertet geladene globale und gebundene Bücher anhand der letzten fünf angezeigten Nachrichten aus.",12,&self.theme()),
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
        let lore_status = if self.prompt_lore_pending {
            "Lore wird geprüft …".into()
        } else {
            match &self.prompt_lore {
                Some(Ok(report)) => format!(
                    "Geprüfte Bücher ({}) · Hintergrundtexte ({}) · Anweisungen ({})",
                    report.books,
                    report.passive.len(),
                    report.active.len()
                ),
                Some(Err(error)) => format!("Loreprüfung fehlgeschlagen: {error}"),
                None if !self.preview.current().loaded => "Der Verlauf wird noch geladen.".into(),
                None => "Lore für diesen Verlauf noch ungeprüft.".into(),
            }
        };
        content = content.push(
            row![
                button("Lore prüfen")
                    .padding([6, 10])
                    .style(appearance::subtle_button)
                    .on_press_maybe(
                        (self.preview.current().loaded && !self.prompt_lore_pending)
                            .then_some(Message::EvaluatePromptLore)
                    ),
                muted(lore_status, 12, &self.theme()).width(Fill)
            ]
            .spacing(10)
            .align_y(Alignment::Center),
        );
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

    fn settings(&self) -> Element<'_, Message> {
        let mut settings=column![text("Einstellungen").size(28),muted("Oberfläche und Profilkopien",14,&self.theme()),
            container(column![text("Erscheinungsbild").size(19),control(if self.dark {Icon::Sun} else {Icon::Moon},if self.dark {"Helles Design verwenden"} else {"Dunkles Design verwenden"},Message::ToggleTheme)].spacing(12)).padding(20).width(Fill).style(appearance::card),
            self.connection_settings(),
            self.hub_library_settings(),
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

    fn hub_library_settings(&self) -> Element<'_, Message> {
        let mut content = column![
            text(ui_text::text("hub.native.storeTitle")).size(19),
            text(ui_text::text("hub.native.storeInfo")).size(14),
        ]
        .spacing(10);
        if let Some(root) = &self.hub.store {
            content = content.push(muted(root.display().to_string(), 12, &self.theme()));
        }
        if !self.hub_library_notice().is_empty() {
            content = content.push(text(self.hub_library_notice()).size(13));
        }
        container(content)
            .padding(20)
            .width(Fill)
            .style(appearance::card)
            .into()
    }

    fn planned(&self, label: &'static str) -> Element<'_, Message> {
        let detail = if label == "Hilfe" {
            "Wähle eine Figur in der Bibliothek. Über den Titel oben im Chat öffnest Du die Verläufe. Strg+Enter fügt eine Testnachricht hinzu. Über „An Modell senden“ fragst Du den eingestellten Modell-Endpunkt nach einer Antwort."
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

pub(super) fn shorten(value: &str, limit: usize) -> String {
    let mut chars = value.chars();
    let shortened: String = chars.by_ref().take(limit).collect();
    if chars.next().is_some() {
        format!("{shortened}…")
    } else {
        shortened
    }
}

fn hub_kind_label(kind: HubKind) -> &'static str {
    ui_text::text(match kind {
        HubKind::Worlds => "hub.tabWorlds",
        HubKind::Characters => "hub.collectionCharacters",
        HubKind::Scenes => "hub.tabScenes",
        HubKind::Lorebooks => "hub.tabLorebooks",
    })
}

fn hub_kind_icon(kind: HubKind) -> Icon {
    match kind {
        HubKind::Worlds => Icon::Library,
        HubKind::Characters => Icon::Characters,
        HubKind::Scenes => Icon::Stage,
        HubKind::Lorebooks => Icon::Lorebooks,
    }
}

fn hub_kind_color(kind: HubKind, theme: &Theme) -> Color {
    match kind {
        HubKind::Worlds | HubKind::Characters => hub_appearance::accent(theme),
        HubKind::Scenes => theme.palette().success,
        HubKind::Lorebooks => theme.palette().warning,
    }
}

fn tinted_icon(symbol: Icon, size: u32, color: Color) -> iced::widget::svg::Svg<'static> {
    icon(symbol, size).style(move |_, _| iced::widget::svg::Style { color: Some(color) })
}

fn hub_byline(entry: &HubEntry) -> String {
    let revision = ui_text::format(
        "hub.native.revision",
        &[("revision", &entry.revision.to_string())],
    );
    if entry.author.is_empty() {
        revision
    } else {
        format!("{} · {revision}", entry.author)
    }
}

pub(super) fn scroll<'a>(
    content: impl Into<Element<'a, Message>>,
) -> iced::widget::Scrollable<'a, Message> {
    scrollable(content)
        .style(appearance::scrollbar)
        .direction(scrollable::Direction::Vertical(
            scrollable::Scrollbar::new()
                .width(6)
                .scroller_width(6)
                .margin(2),
        ))
}
