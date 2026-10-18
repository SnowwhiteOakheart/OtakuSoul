//! SillyTavern-style macros in cards, templates, lorebooks and notes: `{{char}}`, `{{user}}`,
//! chance (`{{random:a,b}}`, `{{pick:a,b}}`, `{{roll:2d6+1}}`), time (`{{time}}`, `{{date}}`,
//! `{{weekday}}`, `{{isotime}}`, `{{isodate}}`, `{{idle_duration}}`) and formatting
//! (`{{newline}}`, `{{trim}}`, `{{// comment}}`, `{{noop}}`). Unknown macros stay as written,
//! so `{{original}}` and texts with braces pass through.
//!
//! `{{random}}` rolls anew every time the text is expanded (every reply), `{{pick}}` stays the
//! same within a chat (seeded by the chat and its position in the text).

use chrono::{DateTime, Datelike, Local, Timelike};
use rand::{Rng, RngExt, SeedableRng, rngs::StdRng};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// What the macros of one text need to know.
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MacroInput {
    pub char_name: String,
    pub user_name: String,
    /// Reply language as a name or code ("Deutsch", "en"); date words follow it.
    #[serde(default)]
    pub language: String,
    /// Keeps `{{pick}}` stable, e.g. the chat ID (empty = a new pick every time).
    #[serde(default)]
    #[ts(optional)]
    pub pick_seed: Option<String>,
    /// Seconds since the user's previous message, for `{{idle_duration}}`.
    #[serde(default)]
    #[ts(optional)]
    pub idle_seconds: Option<u64>,
}

/// Expands the macros of `text` now, with the thread's random numbers.
pub fn expand(text: &str, input: &MacroInput) -> String {
    expand_with(text, input, Local::now(), &mut rand::rng())
}

/// Expands every text with the same clock (a greeting and its swipes agree on the time).
pub fn expand_all(texts: &[String], input: &MacroInput) -> Vec<String> {
    let now = Local::now();
    let mut rng = rand::rng();
    texts
        .iter()
        .map(|text| expand_with(text, input, now, &mut rng))
        .collect()
}

pub fn expand_with<R: Rng + ?Sized>(
    text: &str,
    input: &MacroInput,
    now: DateTime<Local>,
    rng: &mut R,
) -> String {
    if !text.contains("{{") {
        return text.to_string();
    }
    let lang = crate::modules::content_lang::language_code(&input.language);
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    let mut position = 0u64;
    while let Some(start) = rest.find("{{") {
        out.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        let Some(end) = after.find("}}") else {
            out.push_str(&rest[start..]);
            return finish(out);
        };
        let body = &after[..end];
        position += 1;
        match value(body, input, &lang, now, rng, position) {
            Some(value) => out.push_str(&value),
            None => out.push_str(&rest[start..start + 4 + end]),
        }
        rest = &after[end + 2..];
    }
    out.push_str(rest);
    finish(out)
}

/// Marker `{{trim}}` leaves behind; it eats the whitespace around it at the end.
const TRIM: char = '\u{E000}';

fn finish(text: String) -> String {
    if !text.contains(TRIM) {
        return text;
    }
    let mut out = String::with_capacity(text.len());
    for (i, piece) in text.split(TRIM).enumerate() {
        let piece = if i > 0 { piece.trim_start() } else { piece };
        out.truncate(out.trim_end().len());
        out.push_str(piece);
    }
    out
}

fn value<R: Rng + ?Sized>(
    body: &str,
    input: &MacroInput,
    lang: &str,
    now: DateTime<Local>,
    rng: &mut R,
    position: u64,
) -> Option<String> {
    let trimmed = body.trim();
    if trimmed.starts_with("//") {
        return Some(String::new());
    }
    // `{{random:a,b}}` and `{{random::a::b}}` (the latter allows commas inside the options).
    let (name, args) = match trimmed.split_once(':') {
        Some((name, args)) => (name.trim().to_lowercase(), Some(args)),
        None => (trimmed.to_lowercase(), None),
    };
    match (name.as_str(), args) {
        ("char", None) => Some(input.char_name.clone()),
        ("user", None) => Some(input.user_name.clone()),
        ("newline", None) => Some("\n".into()),
        ("trim", None) => Some(TRIM.to_string()),
        ("noop", None) => Some(String::new()),
        ("time", None) => Some(format!("{:02}:{:02}", now.hour(), now.minute())),
        ("isotime", None) => Some(now.format("%H:%M:%S").to_string()),
        ("isodate", None) => Some(now.format("%Y-%m-%d").to_string()),
        ("date", None) => Some(date(now, lang)),
        ("weekday", None) => Some(weekday(now, lang).to_string()),
        ("idle_duration", None) => Some(duration(input.idle_seconds.unwrap_or(0), lang)),
        ("random", Some(args)) => {
            let options = options(args);
            (!options.is_empty()).then(|| options[rng.random_range(0..options.len())].clone())
        }
        ("pick", Some(args)) => {
            let options = options(args);
            if options.is_empty() {
                return None;
            }
            let index = match &input.pick_seed {
                Some(seed) => {
                    let mut stable =
                        StdRng::seed_from_u64(stable_hash(&format!("{seed}|{position}|{args}")));
                    stable.random_range(0..options.len())
                }
                None => rng.random_range(0..options.len()),
            };
            Some(options[index].clone())
        }
        ("roll", Some(args)) => roll(args, rng).map(|total| total.to_string()),
        _ => None,
    }
}

fn options(args: &str) -> Vec<String> {
    let args = args.strip_prefix(':').unwrap_or(args);
    if args.trim().is_empty() {
        return Vec::new();
    }
    let parts: Vec<&str> = if args.contains("::") {
        args.split("::").collect()
    } else {
        args.split(',').collect()
    };
    parts
        .into_iter()
        .map(|part| part.trim().to_string())
        .collect()
}

/// `20`, `d20`, `2d6`, `2d6+3`, `1d8-1` → the total; `None` for anything else (or absurd sizes).
fn roll<R: Rng + ?Sized>(formula: &str, rng: &mut R) -> Option<i64> {
    let formula: String = formula
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect::<String>()
        .to_lowercase();
    let (dice, modifier) = match formula.find(['+', '-']) {
        Some(pos) => {
            let modifier: i64 = formula[pos + 1..].parse().ok()?;
            (
                &formula[..pos],
                if &formula[pos..pos + 1] == "-" {
                    -modifier
                } else {
                    modifier
                },
            )
        }
        None => (formula.as_str(), 0),
    };
    let (count, faces) = match dice.split_once('d') {
        Some((count, faces)) => (
            if count.is_empty() {
                1
            } else {
                count.parse().ok()?
            },
            faces.parse().ok()?,
        ),
        None => (1u32, dice.parse::<u32>().ok()?),
    };
    if count == 0 || count > 100 || faces == 0 || faces > 10_000 {
        return None;
    }
    let total: i64 = (0..count)
        .map(|_| i64::from(rng.random_range(1..=faces)))
        .sum();
    Some(total + modifier)
}

fn date(now: DateTime<Local>, lang: &str) -> String {
    match lang {
        "en" => now.format("%B %-d, %Y").to_string(),
        "de" | "ru" => now.format("%d.%m.%Y").to_string(),
        _ => now.format("%Y-%m-%d").to_string(),
    }
}

fn weekday(now: DateTime<Local>, lang: &str) -> &'static str {
    let day = now.weekday().num_days_from_monday() as usize;
    match lang {
        "de" => [
            "Montag",
            "Dienstag",
            "Mittwoch",
            "Donnerstag",
            "Freitag",
            "Samstag",
            "Sonntag",
        ][day],
        "ru" => [
            "понедельник",
            "вторник",
            "среда",
            "четверг",
            "пятница",
            "суббота",
            "воскресенье",
        ][day],
        _ => [
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
            "Sunday",
        ][day],
    }
}

/// A rough, readable span ("3 hours"), in the reply language where known.
fn duration(seconds: u64, lang: &str) -> String {
    let (n, unit) = match seconds {
        0..60 => {
            return match lang {
                "de" => "einen Moment".into(),
                "ru" => "мгновение".into(),
                _ => "a moment".into(),
            };
        }
        60..3_600 => (seconds / 60, 0),
        3_600..86_400 => (seconds / 3_600, 1),
        _ => (seconds / 86_400, 2),
    };
    let word = match lang {
        "de" => [
            ["Minute", "Minuten"],
            ["Stunde", "Stunden"],
            ["Tag", "Tagen"],
        ][unit][usize::from(n != 1)],
        "ru" => {
            let forms = [
                ["минуту", "минуты", "минут"],
                ["час", "часа", "часов"],
                ["день", "дня", "дней"],
            ][unit];
            let (last, tens) = (n % 10, n % 100);
            forms[if last == 1 && tens != 11 {
                0
            } else if (2..=4).contains(&last) && !(12..=14).contains(&tens) {
                1
            } else {
                2
            }]
        }
        _ => [["minute", "minutes"], ["hour", "hours"], ["day", "days"]][unit][usize::from(n != 1)],
    };
    format!("{n} {word}")
}

/// FNV-1a: the same on every run and platform (unlike `DefaultHasher`'s guarantees).
fn stable_hash(text: &str) -> u64 {
    text.bytes().fold(0xcbf2_9ce4_8422_2325, |hash, byte| {
        (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn input(lang: &str) -> MacroInput {
        MacroInput {
            char_name: "Ayu".into(),
            user_name: "Kai".into(),
            language: lang.into(),
            pick_seed: Some("chat_1".into()),
            idle_seconds: Some(7_300),
        }
    }

    fn at() -> DateTime<Local> {
        Local.with_ymd_and_hms(2026, 10, 18, 9, 5, 7).unwrap()
    }

    fn run(text: &str, lang: &str) -> String {
        expand_with(text, &input(lang), at(), &mut StdRng::seed_from_u64(7))
    }

    #[test]
    fn names_time_and_formatting() {
        assert_eq!(
            run("{{Char}} grüßt {{ user }}.", "Deutsch"),
            "Ayu grüßt Kai."
        );
        assert_eq!(
            run(
                "{{weekday}}, {{date}} um {{time}} ({{isodate}} {{isotime}})",
                "Deutsch"
            ),
            "Sonntag, 18.10.2026 um 09:05 (2026-10-18 09:05:07)"
        );
        assert_eq!(
            run("{{weekday}}, {{date}}", "English"),
            "Sunday, October 18, 2026"
        );
        assert_eq!(run("{{idle_duration}}", "de"), "2 Stunden");
        assert_eq!(run("{{idle_duration}}", "ru"), "2 часа");
        assert_eq!(run("{{idle_duration}}", "en"), "2 hours");
        assert_eq!(run("a{{newline}}b {{// Notiz}}c{{noop}}", "en"), "a\nb c");
        assert_eq!(run("Hallo   {{trim}}\n  Welt", "de"), "HalloWelt");
    }

    #[test]
    fn unknown_and_broken_macros_stay() {
        assert_eq!(
            run("{{original}} {{random:}} {{roll:abc}} {{user", "de"),
            "{{original}} {{random:}} {{roll:abc}} {{user"
        );
        assert_eq!(run("{\"a\": {{\"b\": 1}}}", "de"), "{\"a\": {{\"b\": 1}}}");
    }

    #[test]
    fn chance_macros() {
        let options = ["rot", "grün, hell", "blau"];
        let picked = run("{{random::rot::grün, hell::blau}}", "de");
        assert!(options.contains(&picked.as_str()), "{picked}");
        assert!(["a", "b"].contains(&run("{{random: a , b}}", "de").as_str()));
        for _ in 0..50 {
            let total: i64 = run("{{roll:2d6+3}}", "de").parse().unwrap();
            assert!((5..=15).contains(&total));
            let d20: i64 = expand("{{roll:20}}", &input("de")).parse().unwrap();
            assert!((1..=20).contains(&d20));
        }
        assert_eq!(run("{{roll:1d1-4}}", "de"), "-3");
        assert_eq!(
            run("{{roll:0d6}} {{roll:1000d6}}", "de"),
            "{{roll:0d6}} {{roll:1000d6}}"
        );
    }

    #[test]
    fn pick_stays_within_a_chat_and_random_does_not() {
        let text = "{{pick:a,b,c,d,e,f,g,h}}";
        let first = expand(text, &input("de"));
        assert!((0..20).all(|_| expand(text, &input("de")) == first));
        let randoms: std::collections::HashSet<String> = (0..40)
            .map(|_| expand("{{random:a,b,c,d,e,f,g,h}}", &input("de")))
            .collect();
        assert!(randoms.len() > 1);
        // Two picks with the same options in one text are independent of each other's result.
        let other_chat = MacroInput {
            pick_seed: Some("chat_2".into()),
            ..input("de")
        };
        let differs = (0..8).any(|i| {
            let text = format!("{{{{pick:{i}a,b,c,d,e,f,g,h}}}}");
            expand(&text, &input("de")) != expand(&text, &other_chat)
        });
        assert!(differs);
    }
}
