//! Out-of-character directions: text in `((double parentheses))` in a chat message is a note to
//! the AI as the author ("make the scene darker"), not part of the story. The chat model sees it
//! with a rule in the system prompt; summaries and memories leave it out.

/// The rule for the system prompt.
pub fn prompt_rule(user_name: &str) -> String {
    format!(
        "- Text from {user_name} in ((double parentheses)) is an out-of-character direction to you as \
         the author: follow it in your next replies, but never answer it in character, quote it or \
         mention it."
    )
}

/// The message without its `((…))` directions (an unclosed `((` stays as written).
pub fn strip(text: &str) -> String {
    if !text.contains("((") {
        return text.trim().to_string();
    }
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find("((") {
        let Some(len) = rest[start + 2..].find("))") else {
            break;
        };
        out.push_str(&rest[..start]);
        rest = &rest[start + 2 + len + 2..];
    }
    out.push_str(rest);
    // Removing a note in the middle leaves double spaces behind.
    out.split('\n')
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_directions_and_keeps_the_story() {
        assert_eq!(strip("((mach es düsterer))"), "");
        assert_eq!(
            strip("*geht los* ((spannend bitte)) \"Komm!\""),
            "*geht los* \"Komm!\""
        );
        assert_eq!(
            strip("Zeile eins\n((Notiz))\nZeile zwei"),
            "Zeile eins\n\nZeile zwei"
        );
        assert_eq!(
            strip("Lächeln (ganz leicht) und ((offen"),
            "Lächeln (ganz leicht) und ((offen"
        );
        assert!(prompt_rule("Kai").contains("Text from Kai in ((double parentheses))"));
    }
}
