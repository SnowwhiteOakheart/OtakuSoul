//! Tauri-kompatible 5e-Einstellungen unter Erhalt nicht bearbeiteter Regeln.
use serde_json::{Value, json};

#[derive(Debug, Clone)]
pub enum Edit {
    Enabled(bool),
    Map(String),
    Class { member: String, class: String },
    ControlCompanions(bool),
    HeroicDeath(bool),
}

pub struct Rules {
    pub enabled: bool,
    raw: Value,
}

impl Rules {
    pub fn new(raw: Value) -> Self {
        Self {
            enabled: is_five_e(&raw),
            raw,
        }
    }

    pub fn map(&self) -> &str {
        self.raw["map_id"].as_str().unwrap_or_default()
    }

    pub fn class(&self, member: &str) -> &str {
        self.raw["hero_classes"][member]
            .as_str()
            .unwrap_or_default()
    }

    pub fn control_companions(&self) -> bool {
        self.raw["control_companions"].as_bool().unwrap_or_default()
    }

    pub fn heroic_death(&self) -> bool {
        self.raw["heroic_death"].as_bool().unwrap_or_default()
    }

    pub fn edit(&mut self, edit: Edit) -> Result<(), String> {
        match edit {
            Edit::Enabled(enabled) => {
                self.enabled = enabled;
                if enabled && !self.raw.is_object() {
                    self.raw = json!({});
                }
            }
            _ if !self.enabled => return Ok(()),
            Edit::Map(map) => {
                if map.is_empty() {
                    self.raw
                        .as_object_mut()
                        .expect("aktives Regelobjekt")
                        .remove("map_id");
                } else {
                    self.raw["map_id"] = map.into();
                }
            }
            Edit::Class { member, class } => {
                if self.raw["hero_classes"].is_null() {
                    self.raw["hero_classes"] = json!({});
                }
                let classes = self.raw["hero_classes"].as_object_mut().ok_or_else(|| {
                    crate::ui_text::text("gallery.native.classesInvalid").to_owned()
                })?;
                if class.is_empty() {
                    classes.remove(&member);
                } else {
                    classes.insert(member, class.into());
                }
            }
            Edit::ControlCompanions(enabled) => self.raw["control_companions"] = enabled.into(),
            Edit::HeroicDeath(enabled) => self.raw["heroic_death"] = enabled.into(),
        }
        Ok(())
    }

    pub fn apply(&self, definition: &mut Value) {
        if self.enabled {
            let mut rules = self.raw.clone();
            rules["ruleset"] = "5e".into();
            definition["rules"] = rules;
        } else if is_five_e(&definition["rules"]) {
            definition["rules"] = Value::Null;
        }
    }
}

fn is_five_e(raw: &Value) -> bool {
    raw["ruleset"].as_str() == Some("5e")
}
