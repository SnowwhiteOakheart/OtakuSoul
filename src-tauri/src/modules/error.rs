//! Errors for the frontend as translation keys instead of German prose.
//!
//! Commands keep returning `Result<T, String>`; the string is a small JSON object
//! `{"code":"backend.…","params":{…}}` that the frontend (`utils/errors.ts`) translates into the
//! user's language. Build it with the [`err!`](crate::err) macro:
//!
//! ```ignore
//! .map_err(|e| err!("backend.backup.readFailed", path = path.display(), error = e))?
//! ```

use serde_json::{Map, Value};

/// Encodes `code` and its parameters as the JSON string the frontend understands.
pub fn coded(code: &str, params: &[(&str, String)]) -> String {
    let params: Map<String, Value> = params
        .iter()
        .map(|(name, value)| ((*name).to_string(), Value::String(value.clone())))
        .collect();
    serde_json::json!({ "code": code, "params": params }).to_string()
}

/// `err!("backend.key", name = value, …)` → coded error string; values need `Display`.
#[macro_export]
macro_rules! err {
    ($code:literal $(, $name:ident = $value:expr)* $(,)?) => {
        $crate::modules::error::coded($code, &[$((stringify!($name), ($value).to_string())),*])
    };
}

#[cfg(test)]
mod tests {
    #[test]
    fn encodes_code_and_params() {
        let path = std::path::Path::new("/tmp/x.json");
        let encoded = crate::err!("backend.test.failed", path = path.display(), count = 3);
        let value: serde_json::Value = serde_json::from_str(&encoded).unwrap();
        assert_eq!(value["code"], "backend.test.failed");
        assert_eq!(value["params"]["path"], "/tmp/x.json");
        assert_eq!(value["params"]["count"], "3");
    }

    #[test]
    fn works_without_params() {
        assert_eq!(
            crate::err!("backend.test.plain"),
            r#"{"code":"backend.test.plain","params":{}}"#
        );
    }
}
