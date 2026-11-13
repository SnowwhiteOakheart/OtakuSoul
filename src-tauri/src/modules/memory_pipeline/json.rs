use super::models::RouterResponse;

/// Router answers as local models write them: a text field may come as a list, a list as
/// one text, a number as a string. Strict types threw away the whole reflection for that.
pub(super) mod lenient {
    use serde::{Deserialize, Deserializer};
    use serde_json::Value;

    fn flatten(value: Value) -> Vec<String> {
        match value {
            Value::Null => Vec::new(),
            Value::String(s) => vec![s],
            Value::Array(items) => items.into_iter().flat_map(flatten).collect(),
            Value::Object(map) => map.into_values().flat_map(flatten).collect(),
            other => vec![other.to_string()],
        }
    }

    pub fn opt_text<'de, D: Deserializer<'de>>(d: D) -> Result<Option<String>, D::Error> {
        let parts: Vec<String> = flatten(Value::deserialize(d)?)
            .into_iter()
            .map(|p| p.trim().to_string())
            .filter(|p| !p.is_empty())
            .collect();
        Ok((!parts.is_empty()).then(|| parts.join("; ")))
    }

    pub fn text<'de, D: Deserializer<'de>>(d: D) -> Result<String, D::Error> {
        Ok(opt_text(d)?.unwrap_or_default())
    }

    pub fn text_list<'de, D: Deserializer<'de>>(d: D) -> Result<Vec<String>, D::Error> {
        Ok(flatten(Value::deserialize(d)?)
            .into_iter()
            .map(|p| p.trim().to_string())
            .filter(|p| !p.is_empty())
            .collect())
    }

    pub fn opt_u32<'de, D: Deserializer<'de>>(d: D) -> Result<Option<u32>, D::Error> {
        Ok(match Value::deserialize(d)? {
            Value::Number(n) => n.as_f64().map(|f| f.round().max(0.0) as u32),
            Value::String(s) => s
                .trim()
                .parse::<f64>()
                .ok()
                .map(|f| f.round().max(0.0) as u32),
            _ => None,
        })
    }

    pub fn opt_bool<'de, D: Deserializer<'de>>(d: D) -> Result<Option<bool>, D::Error> {
        Ok(match Value::deserialize(d)? {
            Value::Bool(b) => Some(b),
            Value::String(s) => match s.trim().to_lowercase().as_str() {
                "true" | "yes" => Some(true),
                "false" | "no" => Some(false),
                _ => None,
            },
            _ => None,
        })
    }

    /// An id as a number, `"12"` or `"#12"`; 0 (never a real id) when unreadable.
    pub fn id<'de, D: Deserializer<'de>>(d: D) -> Result<i64, D::Error> {
        Ok(match Value::deserialize(d)? {
            Value::Number(n) => n.as_i64().unwrap_or(0),
            Value::String(s) => s.trim().trim_start_matches('#').parse().unwrap_or(0),
            _ => 0,
        })
    }
}

pub fn extract_json_object(raw: &str) -> Option<String> {
    let mut text = raw.trim();

    // Strip markdown codeblock ```json ... ``` or ``` ... ```
    if let Some(start) = text.find("```")
        && let Some(end) = text.rfind("```")
        && end > start
    {
        let inner = &text[start + 3..end];
        let inner_trimmed = inner.trim_start_matches("json").trim();
        text = inner_trimmed;
    }

    let first_brace = text.find('{')?;
    let last_brace = text.rfind('}')?;
    if last_brace > first_brace {
        Some(text[first_brace..=last_brace].to_string())
    } else {
        None
    }
}

pub fn parse_router_json(raw: &str) -> Result<RouterResponse, String> {
    let json_str = extract_json_object(raw).ok_or_else(|| {
        "Konnte kein valides JSON-Objekt in der Router-Antwort finden.".to_string()
    })?;

    serde_json::from_str::<RouterResponse>(&json_str).map_err(|e| {
        format!(
            "Fehler beim Parsen der Router-JSON: {} (Inhalt: {})",
            e, json_str
        )
    })
}
