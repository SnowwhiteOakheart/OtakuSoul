//! Makro-Adapter: Die dynamische Inhalts-Sprachauflösung bleibt im Backend.
//! Der gemeinsame Kern enthält keine Profil-, Dateisystem- oder GUI-Abhängigkeit.

pub use otakusoul_macros::MacroInput;

pub fn expand(text: &str, input: &MacroInput) -> String {
    expand_with(text, input, chrono::Local::now(), &mut rand::rng())
}

pub fn expand_all(texts: &[String], input: &MacroInput) -> Vec<String> {
    if !texts.iter().any(|text| text.contains("{{")) {
        return texts.to_vec();
    }
    let now = chrono::Local::now();
    let mut rng = rand::rng();
    texts
        .iter()
        .map(|text| expand_with(text, input, now, &mut rng))
        .collect()
}

pub fn expand_with<R: rand::Rng + ?Sized>(
    text: &str,
    input: &MacroInput,
    now: chrono::DateTime<chrono::Local>,
    rng: &mut R,
) -> String {
    if !text.contains("{{") {
        return text.to_string();
    }
    let language = crate::modules::content_lang::language_code(&input.language);
    otakusoul_macros::expand_with(text, input, &language, now, rng)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use rand::SeedableRng;

    #[test]
    fn adapter_resolves_reply_language_names_before_expanding() {
        let now = chrono::Local
            .with_ymd_and_hms(2026, 10, 18, 9, 5, 7)
            .unwrap();
        for (language, expected) in [("Deutsch", "Sonntag"), ("English", "Sunday")] {
            let input = MacroInput {
                language: language.into(),
                ..Default::default()
            };
            assert_eq!(
                expand_with(
                    "{{weekday}}",
                    &input,
                    now,
                    &mut rand::rngs::StdRng::seed_from_u64(7)
                ),
                expected
            );
        }
    }
}
