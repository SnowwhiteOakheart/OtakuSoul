//! Soul Stage: tabletop roleplay with a language model as game master.

use base64::prelude::*;
use chrono::Utc;
use parking_lot::RwLock;
use rand::RngExt;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

use crate::modules::inference::{ChatMessage, ChatRequest, InferenceClient, SamplingParams};
use crate::modules::paths::{resolve_app_paths, scan_available_characters};
use crate::modules::settings::load_app_settings;

mod dice;
mod engine;
mod models;
mod plan;
mod scenes;
#[cfg(test)]
mod tests;
mod turn;

pub use dice::*;
pub use engine::*;
pub use models::*;
pub use plan::*;
pub use scenes::*;
pub use turn::*;
