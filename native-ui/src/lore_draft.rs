//! Verlustarmer Lorebook-Entwurf ohne Dateizugriff oder Auswertung von Aktivierungsregeln.
use crate::lore_catalog::Book;
use serde_json::{Map, Value, json};
use std::collections::BTreeSet;
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Field {
    Content,
    Keys,
    SecondaryKeys,
    ExcludeKeys,
    RegexKeys,
    ChainRequires,
    ChainActivates,
}

impl Field {
    pub const ALL: [Self; 7] = [
        Self::Content,
        Self::Keys,
        Self::SecondaryKeys,
        Self::ExcludeKeys,
        Self::RegexKeys,
        Self::ChainRequires,
        Self::ChainActivates,
    ];

    fn keys(self) -> (&'static str, Option<&'static str>) {
        match self {
            Self::Content => ("content", None),
            Self::Keys => ("key", Some("keys")),
            Self::SecondaryKeys => ("secondary_keys", Some("secondary_key")),
            Self::ExcludeKeys => ("exclude_key", None),
            Self::RegexKeys => ("regex_keys", None),
            Self::ChainRequires => ("chain_requires", None),
            Self::ChainActivates => ("chain_activates", None),
        }
    }
}

impl fmt::Display for Field {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::Content => "Inhalt",
            Self::Keys => "Schlüsselwörter (eine Zeile je Wort)",
            Self::SecondaryKeys => "Zusätzliche Schlüsselwörter",
            Self::ExcludeKeys => "Ausschlusswörter",
            Self::RegexKeys => "Reguläre Ausdrücke",
            Self::ChainRequires => "Benötigte Einträge (Name oder UID je Zeile)",
            Self::ChainActivates => "Zusätzlich aktivierte Einträge (Name oder UID je Zeile)",
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Number {
    Priority,
    Probability,
    Tension,
}

impl Number {
    pub const ALL: [Self; 3] = [Self::Priority, Self::Probability, Self::Tension];

    fn key(self) -> &'static str {
        match self {
            Self::Priority => "priority",
            Self::Probability => "probability",
            Self::Tension => "tension_threshold",
        }
    }
}

impl fmt::Display for Number {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::Priority => "Priorität",
            Self::Probability => "Wahrscheinlichkeit (%)",
            Self::Tension => "Spannungsschwelle (%)",
        })
    }
}

#[derive(Debug, Clone)]
pub struct Draft {
    pub target: Option<usize>,
    pub name: String,
    pub description: String,
    id: String,
    source: String,
    raw: Value,
    original_name: String,
    original_description: String,
    new: bool,
}

impl Draft {
    pub fn from_book(index: usize, book: &Book) -> Self {
        Self {
            target: Some(index),
            name: book.name.clone(),
            description: book.description.clone(),
            id: book.id.clone(),
            source: book.source.clone(),
            raw: book.raw.clone(),
            original_name: book.name.clone(),
            original_description: book.description.clone(),
            new: false,
        }
    }

    pub fn new(id: String) -> Self {
        Self {
            target: None,
            name: String::new(),
            description: String::new(),
            raw: json!({"id":id,"name":"","description":"","entries":[]}),
            id,
            source: String::new(),
            original_name: String::new(),
            original_description: String::new(),
            new: true,
        }
    }

    pub fn count(&self) -> usize {
        match self.raw.get("entries") {
            Some(Value::Array(entries)) => entries.len(),
            Some(Value::Object(entries)) => entries.len(),
            _ => 0,
        }
    }

    fn entry(&self, index: usize) -> Option<&Map<String, Value>> {
        match self.raw.get("entries")? {
            Value::Array(entries) => entries.get(index)?.as_object(),
            Value::Object(entries) => entries.values().nth(index)?.as_object(),
            _ => None,
        }
    }

    fn entry_mut(&mut self, index: usize) -> Result<&mut Map<String, Value>, String> {
        let entry = match self.raw.get_mut("entries") {
            Some(Value::Array(entries)) => entries.get_mut(index),
            Some(Value::Object(entries)) => entries.values_mut().nth(index),
            _ => None,
        };
        entry
            .and_then(Value::as_object_mut)
            .ok_or_else(|| "Der gewählte Lorebook-Eintrag ist nicht verfügbar.".into())
    }

    fn object_entries(&self) -> bool {
        self.raw.get("entries").is_some_and(Value::is_object)
    }

    pub fn entry_name(&self, index: usize) -> String {
        display_name(self.entry(index), index)
    }

    pub fn entry_names(&self) -> Vec<String> {
        match self.raw.get("entries") {
            Some(Value::Array(entries)) => entries
                .iter()
                .enumerate()
                .map(|(index, entry)| display_name(entry.as_object(), index))
                .collect(),
            Some(Value::Object(entries)) => entries
                .values()
                .enumerate()
                .map(|(index, entry)| display_name(entry.as_object(), index))
                .collect(),
            _ => Vec::new(),
        }
    }

    pub fn field(&self, index: usize, field: Field) -> String {
        let Some(entry) = self.entry(index) else {
            return String::new();
        };
        let (key, alias) = field.keys();
        if field == Field::Content {
            return entry
                .get(key)
                .and_then(Value::as_str)
                .unwrap_or_default()
                .into();
        }
        let mut values = strings(entry.get(key));
        if values.is_empty() {
            values = strings(alias.and_then(|alias| entry.get(alias)));
        }
        if values.is_empty()
            && field == Field::ChainRequires
            && let Some(uid) = entry
                .get("depends_on")
                .and_then(Value::as_i64)
                .filter(|uid| *uid >= 0)
        {
            values.push(uid.to_string());
        }
        values.join("\n")
    }

    pub fn enabled(&self, index: usize) -> bool {
        self.entry(index)
            .and_then(|entry| {
                entry.get("enabled").and_then(Value::as_bool).or_else(|| {
                    entry
                        .get("disable")
                        .and_then(Value::as_bool)
                        .map(|disabled| !disabled)
                })
            })
            .unwrap_or(true)
    }

    /// Nur Anzeige; auch fremde Rohwerte werden beim Lesen nicht verändert.
    pub fn number(&self, index: usize, number: Number) -> String {
        let value = self.entry(index).and_then(|entry| {
            entry.get(number.key()).or_else(|| {
                (number == Number::Priority)
                    .then(|| entry.get("order"))
                    .flatten()
            })
        });
        raw_number(value, if number == Number::Priority { "10" } else { "" })
    }

    pub fn set_number(&mut self, index: usize, number: Number, text: &str) -> Result<(), String> {
        if self.entry(index).is_none() {
            return Err("Der gewählte Lorebook-Eintrag ist nicht verfügbar.".into());
        }
        let text = text.trim();
        let value = match number {
            Number::Priority => Some(Value::from(text.parse::<i32>().map_err(|_| {
                "Die Priorität muss eine ganze Zahl zwischen −2147483648 und 2147483647 sein."
                    .to_owned()
            })?)),
            Number::Probability | Number::Tension if text.is_empty() => None,
            Number::Probability | Number::Tension => {
                let value = text
                    .parse::<u32>()
                    .ok()
                    .filter(|value| *value <= 100)
                    .ok_or(
                        "Bitte eine ganze Zahl zwischen 0 und 100 eingeben oder das Feld leeren.",
                    )?;
                Some(Value::from(value))
            }
        };
        if self.number(index, number) == text {
            return Ok(());
        }
        let entry = self.entry_mut(index)?;
        match value {
            Some(value) => {
                if number == Number::Priority && entry.contains_key("order") {
                    entry.insert("order".into(), value.clone());
                }
                entry.insert(number.key().into(), value);
            }
            None => {
                entry.remove(number.key());
            }
        }
        Ok(())
    }

    pub fn trigger(&self, index: usize) -> String {
        self.entry(index)
            .and_then(|entry| entry.get("trigger_type").and_then(Value::as_str))
            .map(str::to_owned)
            .unwrap_or_else(|| {
                if self.always(index) {
                    "always_on"
                } else {
                    "keyword"
                }
                .into()
            })
    }

    pub fn set_trigger(&mut self, index: usize, value: &str) -> Result<(), String> {
        if self.entry(index).is_none() {
            return Err("Der gewählte Lorebook-Eintrag ist nicht verfügbar.".into());
        }
        if self.trigger(index) == value {
            return Ok(());
        }
        let value = value.trim();
        if !["keyword", "regex", "always_on", "tension"].contains(&value) {
            return Err("Bitte eine bekannte Aktivierungsart auswählen.".into());
        }
        let entry = self.entry_mut(index)?;
        entry.insert("trigger_type".into(), value.into());
        entry.insert("constant".into(), (value == "always_on").into());
        Ok(())
    }

    pub fn injection(&self, index: usize) -> String {
        self.entry(index)
            .and_then(|entry| {
                entry
                    .get("injection_behavior")
                    .or_else(|| entry.get("position"))
                    .and_then(Value::as_str)
            })
            .unwrap_or("passive")
            .to_owned()
    }

    pub fn set_injection(&mut self, index: usize, value: &str) -> Result<(), String> {
        if self.entry(index).is_none() {
            return Err("Der gewählte Lorebook-Eintrag ist nicht verfügbar.".into());
        }
        if self.injection(index) == value {
            return Ok(());
        }
        if !["passive", "active"].contains(&value) {
            return Err("Bitte Kontext oder Anweisung auswählen.".into());
        }
        let entry = self.entry_mut(index)?;
        if entry.contains_key("position") {
            entry.insert("position".into(), value.into());
        }
        entry.insert("injection_behavior".into(), value.into());
        Ok(())
    }

    pub fn case_sensitive(&self, index: usize) -> bool {
        self.entry(index)
            .and_then(|entry| entry.get("case_sensitive").and_then(Value::as_bool))
            .unwrap_or(false)
    }

    pub fn set_case_sensitive(&mut self, index: usize, value: bool) -> Result<(), String> {
        if self.entry(index).is_none() {
            return Err("Der gewählte Lorebook-Eintrag ist nicht verfügbar.".into());
        }
        if self.case_sensitive(index) != value {
            self.entry_mut(index)?
                .insert("case_sensitive".into(), value.into());
        }
        Ok(())
    }

    pub fn whole_words(&self, index: usize) -> bool {
        self.entry(index)
            .and_then(|entry| entry.get("match_whole_words").and_then(Value::as_bool))
            .unwrap_or(false)
    }

    pub fn set_whole_words(&mut self, index: usize, value: bool) -> Result<(), String> {
        if self.entry(index).is_none() {
            return Err("Der gewählte Lorebook-Eintrag ist nicht verfügbar.".into());
        }
        if self.whole_words(index) != value {
            self.entry_mut(index)?
                .insert("match_whole_words".into(), value.into());
        }
        Ok(())
    }

    pub fn scan_depth(&self) -> String {
        raw_number(
            self.raw
                .get("scan_depth")
                .or_else(|| self.raw.get("n_depth")),
            "5",
        )
    }

    pub fn set_scan_depth(&mut self, text: &str) -> Result<(), String> {
        let text = text.trim();
        let value = text.parse::<u32>().map_err(|_| {
            "Der Suchbereich muss eine ganze Zahl zwischen 0 und 4294967295 sein.".to_owned()
        })?;
        if self.scan_depth() != text {
            let object = self
                .raw
                .as_object_mut()
                .ok_or("Das Lorebook enthält kein gültiges JSON-Objekt.")?;
            if object.contains_key("n_depth") {
                object.insert("n_depth".into(), value.into());
            }
            object.insert("scan_depth".into(), value.into());
        }
        Ok(())
    }

    pub fn is_global(&self) -> bool {
        self.raw
            .get("is_global")
            .and_then(Value::as_bool)
            .unwrap_or(false)
    }

    pub fn set_global(&mut self, value: bool) {
        if self.is_global() != value
            && let Some(object) = self.raw.as_object_mut()
        {
            object.insert("is_global".into(), value.into());
        }
    }

    pub fn always(&self, index: usize) -> bool {
        self.entry(index).is_some_and(|entry| {
            if let Some(trigger) = entry.get("trigger_type").and_then(Value::as_str) {
                trigger == "always_on"
            } else {
                entry
                    .get("constant")
                    .and_then(Value::as_bool)
                    .unwrap_or(false)
            }
        })
    }

    pub fn set_entry_name(&mut self, index: usize, name: String) -> Result<(), String> {
        if self.entry(index).is_none() {
            return Err("Der gewählte Lorebook-Eintrag ist nicht verfügbar.".into());
        }
        if self.entry_name(index) == name {
            return Ok(());
        }
        let object_entries = self.object_entries();
        let entry = self.entry_mut(index)?;
        if object_entries || entry.contains_key("comment") {
            entry.insert("comment".into(), name.clone().into());
        }
        entry.insert("name".into(), name.into());
        Ok(())
    }

    pub fn set_field(&mut self, index: usize, field: Field, text: String) -> Result<(), String> {
        if self.entry(index).is_none() {
            return Err("Der gewählte Lorebook-Eintrag ist nicht verfügbar.".into());
        }
        if self.field(index, field) == text {
            return Ok(());
        }
        let (key, alias) = field.keys();
        let entry = self.entry_mut(index)?;
        let value = if field == Field::Content {
            Value::String(text)
        } else {
            Value::Array(
                text.lines()
                    .map(|line| {
                        if field == Field::RegexKeys {
                            line
                        } else {
                            line.trim()
                        }
                    })
                    .filter(|line| !line.is_empty())
                    .map(|line| Value::String(line.into()))
                    .collect(),
            )
        };
        entry.insert(key.into(), value);
        if field == Field::ChainRequires {
            entry.remove("depends_on");
        }
        if let Some(alias) = alias {
            entry.remove(alias);
        }
        Ok(())
    }

    pub fn set_enabled(&mut self, index: usize, enabled: bool) -> Result<(), String> {
        if self.entry(index).is_none() {
            return Err("Der gewählte Lorebook-Eintrag ist nicht verfügbar.".into());
        }
        if self.enabled(index) == enabled {
            return Ok(());
        }
        let object_entries = self.object_entries();
        let entry = self.entry_mut(index)?;
        if object_entries || entry.contains_key("disable") {
            entry.insert("disable".into(), (!enabled).into());
        }
        entry.insert("enabled".into(), enabled.into());
        Ok(())
    }

    pub fn set_always(&mut self, index: usize, always: bool) -> Result<(), String> {
        if self.entry(index).is_none() {
            return Err("Der gewählte Lorebook-Eintrag ist nicht verfügbar.".into());
        }
        if self.always(index) == always {
            return Ok(());
        }
        let entry = self.entry_mut(index)?;
        entry.insert(
            "trigger_type".into(),
            (if always { "always_on" } else { "keyword" }).into(),
        );
        entry.insert("constant".into(), always.into());
        Ok(())
    }

    pub fn add_entry(&mut self) -> Result<usize, String> {
        if self.count() >= 10_000 {
            return Err("Ein Lorebook darf höchstens 10.000 Einträge enthalten.".into());
        }
        let mut used = BTreeSet::new();
        if let Some(Value::Object(entries)) = self.raw.get("entries") {
            used.extend(entries.keys().filter_map(|key| key.parse::<u64>().ok()));
        }
        for index in 0..self.count() {
            if let Some(uid) = self
                .entry(index)
                .and_then(|entry| entry.get("uid"))
                .and_then(|uid| uid.as_u64().or_else(|| uid.as_str()?.parse().ok()))
            {
                used.insert(uid);
            }
        }
        let uid = used
            .last()
            .and_then(|last| last.checked_add(1))
            .unwrap_or_else(|| {
                (0..=u64::MAX)
                    .find(|candidate| !used.contains(candidate))
                    .unwrap_or_default()
            });
        let mut entry = json!({"uid":uid,"name":"Neuer Eintrag","content":"","key":[],"enabled":true,"trigger_type":"keyword"});
        match self.raw.get_mut("entries") {
            Some(Value::Array(entries)) => {
                let index = entries.len();
                entries.push(entry);
                Ok(index)
            }
            Some(Value::Object(entries)) => {
                entry["comment"] = "Neuer Eintrag".into();
                entry["disable"] = false.into();
                entry["constant"] = false.into();
                let key = uid.to_string();
                entries.insert(key.clone(), entry);
                Ok(entries
                    .keys()
                    .position(|existing| *existing == key)
                    .expect("Gerade eingefügter Schlüssel muss vorhanden sein"))
            }
            _ => Err("Der Eintragsbereich des Lorebooks ist ungültig.".into()),
        }
    }

    pub fn remove_entry(&mut self, index: usize) -> Result<(), String> {
        match self.raw.get_mut("entries") {
            Some(Value::Array(entries)) if index < entries.len() => {
                entries.remove(index);
                Ok(())
            }
            Some(Value::Object(entries)) => {
                let key = entries
                    .keys()
                    .nth(index)
                    .cloned()
                    .ok_or("Der gewählte Lorebook-Eintrag ist nicht verfügbar.")?;
                entries.remove(&key);
                Ok(())
            }
            _ => Err("Der gewählte Lorebook-Eintrag ist nicht verfügbar.".into()),
        }
    }

    pub fn apply(&self) -> Result<Book, String> {
        let name = self.name.trim();
        if name.is_empty() {
            return Err("Bitte einen Namen für das Lorebook eingeben.".into());
        }
        if self.id.trim().is_empty() {
            return Err("Das Lorebook benötigt eine stabile ID.".into());
        }
        let mut raw = self.raw.clone();
        let object = raw
            .as_object_mut()
            .ok_or("Das Lorebook enthält kein gültiges JSON-Objekt.")?;
        object.insert("id".into(), self.id.clone().into());
        if self.new
            || name != self.original_name
            || object
                .get("name")
                .and_then(Value::as_str)
                .is_none_or(|name| name.trim().is_empty())
        {
            object.insert("name".into(), name.into());
        }
        if self.new || self.description != self.original_description {
            object.insert("description".into(), self.description.clone().into());
        }
        let size = serde_json::to_vec_pretty(&raw)
            .map_err(|_| "Das Lorebook konnte nicht als JSON aufbereitet werden.")?
            .len();
        if size > 4 * 1024 * 1024 {
            return Err("Das Lorebook überschreitet die Grenze von 4 MiB.".into());
        }
        Book::from_json(raw, self.source.clone(), name)
    }
}

fn raw_number(value: Option<&Value>, fallback: &str) -> String {
    match value {
        None | Some(Value::Null) => fallback.to_owned(),
        Some(Value::String(text)) => text.clone(),
        Some(value) => value.to_string(),
    }
}

fn display_name(entry: Option<&Map<String, Value>>, index: usize) -> String {
    entry
        .and_then(|entry| {
            entry
                .get("name")
                .and_then(Value::as_str)
                .filter(|name| !name.trim().is_empty())
                .or_else(|| {
                    entry
                        .get("comment")
                        .and_then(Value::as_str)
                        .filter(|name| !name.trim().is_empty())
                })
        })
        .map(str::to_owned)
        .unwrap_or_else(|| format!("Eintrag {}", index + 1))
}

fn strings(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::Array(values)) => values
            .iter()
            .filter_map(Value::as_str)
            .map(str::to_owned)
            .collect(),
        Some(Value::String(value)) => value
            .split(',')
            .map(str::trim)
            .filter(|part| !part.is_empty())
            .map(str::to_owned)
            .collect(),
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn legacy_rule_aliases_are_shown_and_explicit_changes_cannot_resurrect_them() {
        let original = book(
            json!({"id":"legacy","name":"Alt","n_depth":4,"entries":{"7":{
                "uid":7,"comment":"Ort","key":"A","content":"Text","position":"active","chain_requires":[],"depends_on":0
            }}}),
        );
        let mut draft = Draft::from_book(0, &original);
        assert_eq!(draft.scan_depth(), "4");
        assert_eq!(draft.injection(0), "active");
        assert_eq!(draft.field(0, Field::ChainRequires), "0");
        assert_eq!(draft.apply().unwrap().raw, original.raw);
        draft.set_scan_depth("5").unwrap();
        draft.set_injection(0, "passive").unwrap();
        draft
            .set_field(0, Field::ChainRequires, String::new())
            .unwrap();
        let edited = draft.apply().unwrap();
        assert_eq!(edited.raw["scan_depth"], 5);
        assert_eq!(edited.raw["n_depth"], 5);
        assert_eq!(edited.raw["entries"]["7"]["injection_behavior"], "passive");
        assert_eq!(edited.raw["entries"]["7"]["position"], "passive");
        assert!(edited.raw["entries"]["7"].get("depends_on").is_none());
        assert_eq!(edited.raw["entries"]["7"]["chain_requires"], json!([]));
    }
    #[test]
    fn numeric_rule_validation_preserves_raw_data_on_error_and_syncs_priority_alias() {
        let original = book(json!({"id":"id","name":"Buch","entries":[{
            "name":"Eintrag","content":"Text","order":7,"probability":null,"foreign":42
        }]}));
        let mut draft = Draft::from_book(0, &original);
        assert_eq!(draft.number(0, Number::Priority), "7");
        assert_eq!(draft.number(0, Number::Probability), "");
        let before = draft.raw.clone();
        for (number, text) in [
            (Number::Priority, "2147483648"),
            (Number::Priority, ""),
            (Number::Probability, "101"),
            (Number::Tension, "-1"),
            (Number::Tension, "1.5"),
        ] {
            assert!(draft.set_number(0, number, text).is_err());
            assert_eq!(draft.raw, before);
        }
        draft.set_number(0, Number::Probability, "").unwrap();
        assert_eq!(draft.raw, before);
        draft
            .set_number(0, Number::Priority, "-2147483648")
            .unwrap();
        draft.set_number(0, Number::Probability, "0").unwrap();
        draft.set_number(0, Number::Tension, "100").unwrap();
        let raw = draft.apply().unwrap().raw;
        assert_eq!(raw["entries"][0]["priority"], i32::MIN);
        assert_eq!(raw["entries"][0]["order"], i32::MIN);
        assert_eq!(raw["entries"][0]["probability"], 0);
        assert_eq!(raw["entries"][0]["tension_threshold"], 100);
        assert_eq!(raw["entries"][0]["foreign"], 42);
        draft.set_number(0, Number::Probability, "").unwrap();
        assert!(draft.raw["entries"][0].get("probability").is_none());
    }

    #[test]
    fn unknown_rules_and_malformed_values_survive_reading_until_explicitly_changed() {
        let original = book(
            json!({"id":"id","name":"Buch","scan_depth":"fremd","is_global":"fremd","entries":[{
                "content":"Text","trigger_type":"custom_rule","constant":true,"injection_behavior":"custom_injection",
                "priority":"kaputt","case_sensitive":"fremd","match_whole_words":null
            }]}),
        );
        let mut draft = Draft::from_book(0, &original);
        let before = draft.raw.clone();
        assert_eq!(draft.trigger(0), "custom_rule");
        assert_eq!(draft.injection(0), "custom_injection");
        assert_eq!(draft.number(0, Number::Priority), "kaputt");
        assert_eq!(draft.scan_depth(), "fremd");
        draft.set_trigger(0, "custom_rule").unwrap();
        draft.set_injection(0, "custom_injection").unwrap();
        draft.set_case_sensitive(0, false).unwrap();
        draft.set_whole_words(0, false).unwrap();
        draft.set_global(false);
        assert_eq!(draft.raw, before);
        assert!(draft.set_trigger(0, "other_unknown").is_err());
        assert!(draft.set_injection(0, "other_unknown").is_err());
        assert!(draft.set_scan_depth("fremd").is_err());
        assert_eq!(draft.raw, before);
        draft.set_trigger(0, "keyword").unwrap();
        assert_eq!(draft.raw["entries"][0]["constant"], false);
        draft.set_trigger(0, "always_on").unwrap();
        assert_eq!(draft.raw["entries"][0]["constant"], true);
        draft.set_injection(0, "active").unwrap();
        assert_eq!(draft.raw["entries"][0]["injection_behavior"], "active");
    }

    #[test]
    fn book_scope_flags_and_chain_fields_change_only_their_owned_metadata() {
        let original = book(
            json!({"id":"id","name":"Buch","foreign":true,"entries":[{"content":"Text","uid":9,"foreign":42}]}),
        );
        let mut draft = Draft::from_book(0, &original);
        assert_eq!(draft.scan_depth(), "5");
        draft.set_scan_depth("5").unwrap();
        assert!(draft.raw.get("scan_depth").is_none());
        assert!(draft.set_scan_depth("4294967296").is_err());
        assert!(draft.set_scan_depth("-1").is_err());
        draft.set_scan_depth("0").unwrap();
        draft.set_global(true);
        draft.set_case_sensitive(0, true).unwrap();
        draft.set_whole_words(0, true).unwrap();
        draft
            .set_field(0, Field::ChainRequires, " Erstes \n9\n".into())
            .unwrap();
        draft
            .set_field(0, Field::ChainActivates, "Zweites\n12".into())
            .unwrap();
        let raw = draft.apply().unwrap().raw;
        assert_eq!(raw["scan_depth"], 0);
        assert_eq!(raw["is_global"], true);
        assert_eq!(raw["entries"][0]["chain_requires"], json!(["Erstes", "9"]));
        assert_eq!(
            raw["entries"][0]["chain_activates"],
            json!(["Zweites", "12"])
        );
        assert_eq!(raw["entries"][0]["case_sensitive"], true);
        assert_eq!(raw["entries"][0]["match_whole_words"], true);
        assert_eq!(raw["entries"][0]["foreign"], 42);
        assert_eq!(raw["foreign"], true);
    }

    #[test]
    fn advanced_entry_updates_reject_missing_indices_without_mutation() {
        let original = book(json!({"id":"id","name":"Buch","entries":[]}));
        let mut draft = Draft::from_book(0, &original);
        let before = draft.raw.clone();
        assert!(draft.set_number(0, Number::Priority, "10").is_err());
        assert!(draft.set_trigger(0, "keyword").is_err());
        assert!(draft.set_injection(0, "passive").is_err());
        assert!(draft.set_case_sensitive(0, false).is_err());
        assert!(draft.set_whole_words(0, false).is_err());
        assert_eq!(draft.raw, before);
    }
    #[test]
    fn edited_object_book_keeps_identity_metadata_and_original_file_after_export() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("original-book.json");
        let original = serde_json::to_vec(&json!({"foreign":42,"entries":{
            "7":{"uid":7,"comment":"Ort","key":"A, B","content":"Alt","unknown":{"keep":true}},
            "12":{"uid":12,"comment":"Andere","content":"Unverändert"}
        }}))
        .unwrap();
        std::fs::write(&source, &original).unwrap();
        let book = Book::read(&source).unwrap();
        let mut draft = Draft::from_book(0, &book);
        let selected = draft
            .entry_names()
            .iter()
            .position(|name| name == "Ort")
            .unwrap();
        draft
            .set_field(selected, Field::Content, "Neue Zeile\n{{user}}".into())
            .unwrap();
        draft.set_number(selected, Number::Priority, "-10").unwrap();
        draft
            .set_number(selected, Number::Probability, "25")
            .unwrap();
        draft.set_number(selected, Number::Tension, "60").unwrap();
        draft.set_trigger(selected, "tension").unwrap();
        draft.set_scan_depth("8").unwrap();
        draft.set_global(true);
        let new = draft.add_entry().unwrap();
        draft.remove_entry(new).unwrap();
        let edited = draft.apply().unwrap();
        let output = directory.path().join("renamed-book.json");
        crate::file_export::write_json(&output, &edited.raw, None).unwrap();
        let loaded = Book::read(&output).unwrap();
        assert_eq!(loaded.id, "original-book");
        assert_eq!(loaded.name, "original-book");
        assert_eq!(loaded.raw["foreign"], 42);
        assert_eq!(loaded.raw["scan_depth"], 8);
        assert_eq!(loaded.raw["is_global"], true);
        assert_eq!(loaded.raw["entries"]["7"]["priority"], -10);
        assert_eq!(loaded.raw["entries"]["7"]["probability"], 25);
        assert_eq!(loaded.raw["entries"]["7"]["tension_threshold"], 60);
        assert_eq!(loaded.raw["entries"]["7"]["trigger_type"], "tension");
        assert_eq!(
            loaded.raw["entries"]["7"]["content"],
            "Neue Zeile\n{{user}}"
        );
        assert_eq!(loaded.raw["entries"]["7"]["unknown"]["keep"], true);
        assert_eq!(loaded.raw["entries"]["12"]["content"], "Unverändert");
        assert_eq!(std::fs::read(&source).unwrap(), original);
    }

    fn book(raw: Value) -> Book {
        Book::from_json(raw, "source.json".into(), "Fallback").unwrap()
    }

    #[test]
    fn array_edits_preserve_metadata_and_allocate_unique_uids() {
        let original = book(
            json!({"id":"stable","name":"Alt","foreign":42,"entries":[{"uid":7,"name":"Ort","content":"Alt","extension":{"keep":true},"trigger_type":"state_based"}]}),
        );
        let mut draft = Draft::from_book(2, &original);
        draft.name = "Neu".into();
        draft
            .set_field(0, Field::Content, "Neue Zeile\n{{user}}".into())
            .unwrap();
        let index = draft.add_entry().unwrap();
        assert_eq!(index, 1);
        let edited = draft.apply().unwrap();
        assert_eq!(edited.id, "stable");
        assert_eq!(edited.source, "source.json");
        assert_eq!(edited.raw["foreign"], 42);
        assert_eq!(edited.raw["entries"][0]["extension"]["keep"], true);
        assert_eq!(edited.raw["entries"][0]["trigger_type"], "state_based");
        assert_eq!(edited.raw["entries"][1]["uid"], 8);
        assert_eq!(original.raw["entries"][0]["content"], "Alt");
    }

    #[test]
    fn object_entry_aliases_stay_consistent_and_keys_are_preserved() {
        let original = book(
            json!({"id":"world","name":"Welt","entries":{"original":{"uid":3,"comment":"Alt","content":"Text","keys":"eins, zwei","secondary_key":["drei"],"disable":true,"constant":true,"trigger_type":"keyword","unknown":99}}}),
        );
        let mut draft = Draft::from_book(0, &original);
        assert_eq!(draft.field(0, Field::Keys), "eins\nzwei");
        assert!(!draft.always(0));
        draft.set_entry_name(0, "Neu".into()).unwrap();
        draft
            .set_field(0, Field::Keys, "vier\nfünf".into())
            .unwrap();
        draft
            .set_field(0, Field::SecondaryKeys, "sechs".into())
            .unwrap();
        draft.set_enabled(0, true).unwrap();
        draft.set_always(0, true).unwrap();
        let edited = draft.apply().unwrap();
        let entry = &edited.raw["entries"]["original"];
        assert_eq!(entry["name"], "Neu");
        assert_eq!(entry["comment"], "Neu");
        assert_eq!(entry["key"], json!(["vier", "fünf"]));
        assert!(entry.get("keys").is_none());
        assert_eq!(entry["secondary_keys"], json!(["sechs"]));
        assert!(entry.get("secondary_key").is_none());
        assert_eq!(entry["enabled"], true);
        assert_eq!(entry["disable"], false);
        assert_eq!(entry["trigger_type"], "always_on");
        assert_eq!(entry["constant"], true);
        assert_eq!(entry["unknown"], 99);
    }

    #[test]
    fn object_add_and_remove_return_the_actual_sorted_position() {
        let original = book(
            json!({"id":"x","name":"X","entries":{"z":{"uid":u64::MAX,"name":"Original"},"0":{"uid":0}}}),
        );
        let mut draft = Draft::from_book(0, &original);
        let index = draft.add_entry().unwrap();
        assert_eq!(draft.entry_name(index), "Neuer Eintrag");
        assert_eq!(draft.entry(index).unwrap()["uid"], 1);
        draft.remove_entry(index).unwrap();
        assert_eq!(draft.apply().unwrap().raw, original.raw);
        assert!(draft.remove_entry(99).is_err());
    }

    #[test]
    fn unchanged_fields_and_custom_rules_are_not_rewritten() {
        let original = book(
            json!({"id":"x","name":"X","description":42,"entries":[{"content":"Text","keys":" a, b ","disable":false,"trigger_type":"state_based","constant":true}]}),
        );
        let mut draft = Draft::from_book(0, &original);
        draft
            .set_field(0, Field::Keys, draft.field(0, Field::Keys))
            .unwrap();
        draft.set_enabled(0, true).unwrap();
        draft.set_always(0, false).unwrap();
        assert_eq!(draft.apply().unwrap().raw, original.raw);
    }

    #[test]
    fn new_books_validate_name_size_and_keep_their_stable_id() {
        let mut draft = Draft::new("new-book".into());
        assert!(draft.apply().is_err());
        draft.name = " Neues Buch ".into();
        draft.add_entry().unwrap();
        let book = draft.apply().unwrap();
        assert_eq!(book.name, "Neues Buch");
        assert_eq!(book.id, "new-book");
        draft
            .set_field(0, Field::Content, "x".repeat(4 * 1024 * 1024))
            .unwrap();
        assert!(draft.apply().is_err());
        assert!(draft.set_field(99, Field::Content, "Text".into()).is_err());
    }
}
