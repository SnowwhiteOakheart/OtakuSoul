//! The deterministic fight flow of a 5e scene on a [`Table`]: starting and ending encounters,
//! turns, the player's actions, the engine's turns for monsters and companions, rests. The
//! language model is not part of it: where a companion may choose (on the desktop the model
//! picks), [`engine_plan`] hands out a [`CompanionChoice`] with the legal options and the
//! engine's fallback. Randomness, the language of monster names and the stamp for new ids come
//! from the caller.
//!
//! A round as the desktop plays it: the player's input ([`parse_player_action`] →
//! [`apply_player_action`], when the turn is over [`next_turn`]), then
//! [`play_until_player`] (or step by step [`engine_turn_prelude`] → [`engine_plan`] →
//! [`play_turn`] → [`next_turn`]), then [`record_round`]; the app ends a decided fight with
//! [`end_encounter`].

mod actions;
mod encounter;
mod loop_plan;
mod setup;
mod spells_features;
#[cfg(test)]
pub(crate) mod tests;

pub use actions::{
    PlayerAction, act, apply_player_action, cast_options, combat_options, move_current, next_turn,
    parse_player_action, play_board_plan, settle, urgent_cast,
};
pub use encounter::{
    EncounterStart, begin_turn, end_encounter, place_on_map, remove_enemies, start_encounter_at,
};
pub use loop_plan::{
    CompanionChoice, EnginePlan, PlannedTurn, engine_plan, engine_turn, engine_turn_prelude,
    play_turn, play_until_player, record_round,
};
pub use setup::{
    MAX_COMBAT_EVENTS, MAX_ENEMIES, MAX_TURNS_PER_CALL, TURN_UNDEAD_FT, URGENT_CAST, card_class,
    default_class, ensure_party_stats, party_levels, rest_party,
};
pub use spells_features::{cast_budget, feature_options, player_controls, use_feature};
