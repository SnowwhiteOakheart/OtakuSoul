use crate::stage_draft::{Draft, Field};
use crate::stage_lobby::Choice;
use crate::stage_rules::Edit;
use crate::ui_text::{UI_LANGUAGE, text as label};
use crate::views::muted;
use crate::{Message, appearance};
use iced::widget::{checkbox, column, pick_list, text};
use iced::{Element, Fill, Theme};
use serde_json::Value;
use std::collections::HashSet;
use std::sync::LazyLock;

#[derive(Clone, Copy, PartialEq)]
enum Mode {
    Narrative,
    FiveE,
}

impl std::fmt::Display for Mode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(label(match self {
            Self::Narrative => "sceneRules.standard",
            Self::FiveE => "sceneRules.fiveE",
        }))
    }
}

static MAPS: LazyLock<Vec<Choice>> = LazyLock::new(|| {
    [
        include_str!("../../presets/srd5/maps/forest_road.json"),
        include_str!("../../presets/srd5/maps/crypt_hall.json"),
        include_str!("../../presets/srd5/maps/shadow_sanctum.json"),
    ]
    .into_iter()
    .map(|source| {
        let map: Value = serde_json::from_str(source).expect("Mitgeliefertes Spielbrett");
        let id = map["id"].as_str().expect("Kennung des Spielbretts");
        let name = map["name"][UI_LANGUAGE]
            .as_str()
            .or_else(|| map["name"]["en"].as_str());
        Choice::new(id, name.unwrap_or(id))
    })
    .collect()
});

pub fn fields(draft: &Draft, theme: &Theme) -> Element<'static, Message> {
    let rules = &draft.rules;
    let mode = if rules.enabled {
        Mode::FiveE
    } else {
        Mode::Narrative
    };
    let mut fields = column![
        text(label("sceneRules.title")).size(16),
        muted(label("sceneRules.ruleset"), 12, theme),
        pick_list([Mode::Narrative, Mode::FiveE], Some(mode), |mode| {
            Message::StageRule(Edit::Enabled(mode == Mode::FiveE))
        })
        .padding(8)
        .style(appearance::select),
    ]
    .spacing(9);
    if !rules.enabled {
        return fields.into();
    }
    fields = fields.push(muted(label("sceneRules.fiveEHint"), 12, theme));
    let mut seen = HashSet::new();
    for member in std::iter::once("player")
        .chain(
            draft
                .get(Field::Party)
                .lines()
                .map(str::trim)
                .filter(|name| !name.is_empty()),
        )
        .filter(|name| seen.insert(*name))
    {
        let mut options = [
            ("", "sceneRules.classAuto"),
            ("fighter", "sceneRules.class.fighter"),
            ("wizard", "sceneRules.class.wizard"),
            ("rogue", "sceneRules.class.rogue"),
            ("cleric", "sceneRules.class.cleric"),
        ]
        .into_iter()
        .map(|(id, key)| Choice::new(id, label(key)))
        .collect();
        let selected = Choice::include_current(&mut options, rules.class(member));
        let title = if member == "player" {
            label("sceneRules.you")
        } else {
            member
        };
        let member = member.to_owned();
        fields = fields.push(
            column![
                muted(title.to_owned(), 12, theme),
                pick_list(options, Some(selected), move |choice| Message::StageRule(
                    Edit::Class {
                        member: member.clone(),
                        class: choice.value,
                    }
                ))
                .padding(8)
                .style(appearance::select),
            ]
            .spacing(4),
        );
    }
    let mut maps = vec![Choice::new("", label("sceneRules.noMap"))];
    maps.extend(MAPS.iter().cloned());
    let selected = Choice::include_current(&mut maps, rules.map());
    fields
        .push(muted(label("sceneRules.map"), 12, theme))
        .push(
            pick_list(maps, Some(selected), |choice| {
                Message::StageRule(Edit::Map(choice.value))
            })
            .padding(8)
            .style(appearance::select),
        )
        .push(
            checkbox(rules.control_companions())
                .label(label("sceneRules.controlCompanions"))
                .on_toggle(|enabled| Message::StageRule(Edit::ControlCompanions(enabled))),
        )
        .push(
            checkbox(rules.heroic_death())
                .label(label("sceneRules.heroicDeath"))
                .on_toggle(|enabled| Message::StageRule(Edit::HeroicDeath(enabled))),
        )
        .push(muted(label("sceneRules.heroicDeathHint"), 12, theme))
        .width(Fill)
        .into()
}
