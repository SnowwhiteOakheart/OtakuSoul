//! Group chats: who answers next. Someone addressed by name answers first; otherwise a short
//! routing request to the chat model decides (the same rules as Stage's director, without the
//! game master).

use crate::modules::inference::{ChatMessage, ChatRequest, InferenceClient, SamplingParams};
use crate::modules::stage::{
    detect_direct_address, detect_direct_addresses, parse_routing, routing_prompt_with,
};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Answer meaning "it is the user's turn".
pub const PLAYER: &str = "PLAYER";

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GroupRouteRequest {
    /// Name of who wrote the last message (the user's or a character's).
    pub last_speaker: String,
    pub last_text: String,
    /// Names of the characters present.
    pub candidates: Vec<String>,
    /// Characters who already answered since the user's message, in order.
    pub this_turn: Vec<String>,
    /// Speakers of the last messages, oldest first.
    pub recent: Vec<String>,
    pub endpoint_url: String,
    pub api_key: Option<String>,
    pub model: Option<String>,
    pub provider: Option<crate::modules::providers::LlmProviderType>,
    /// The user's message that started this round: everyone it addresses gets a turn.
    #[serde(default)]
    #[ts(optional)]
    pub user_text: Option<String>,
}

/// The name of the next speaker or [`PLAYER`]. A failed routing request means the user's turn.
pub async fn route(client: &InferenceClient, req: GroupRouteRequest) -> String {
    // Nobody answers themselves.
    let others: Vec<String> = req
        .candidates
        .iter()
        .filter(|name| !name.eq_ignore_ascii_case(req.last_speaker.trim()))
        .cloned()
        .collect();
    if others.is_empty() {
        return PLAYER.to_string();
    }
    if let Some(name) = detect_direct_address(&req.last_text, &others) {
        return name;
    }
    // "Lirwen, … ! Faelion, …?" – whoever the user addressed and has not answered yet.
    if let Some(name) = req.user_text.as_deref().and_then(|text| {
        detect_direct_addresses(text, &others)
            .into_iter()
            .find(|name| {
                !req.this_turn
                    .iter()
                    .any(|done| done.eq_ignore_ascii_case(name))
            })
    }) {
        return name;
    }
    let prompt = routing_prompt_with(
        "[CHAT — ROUTING]",
        &req.last_speaker,
        &req.last_text,
        &others,
        &req.this_turn,
        &req.recent,
    );
    let request = ChatRequest {
        endpoint_url: req.endpoint_url,
        api_key: req.api_key,
        model: req.model,
        messages: vec![ChatMessage {
            role: "user".into(),
            content: prompt,
            attachments: Vec::new(),
        }],
        sampling: Some(SamplingParams {
            temperature: Some(0.2),
            max_tokens: Some(60),
            ..SamplingParams::default()
        }),
        reasoning_mode: Some(false),
        provider: req.provider,
    };
    let answer = tokio::time::timeout(
        std::time::Duration::from_secs(60),
        client.generate_direct(request),
    )
    .await;
    match answer {
        Ok(Ok(raw)) => parse_routing(&raw, &others).unwrap_or_else(|| PLAYER.to_string()),
        _ => PLAYER.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(last_speaker: &str, last_text: &str) -> GroupRouteRequest {
        GroupRouteRequest {
            last_speaker: last_speaker.into(),
            last_text: last_text.into(),
            candidates: vec!["Ayu".into(), "Sora".into()],
            this_turn: Vec::new(),
            recent: Vec::new(),
            // Nothing listens here: a routing request fails at once.
            endpoint_url: "http://127.0.0.1:9/v1/chat/completions".into(),
            api_key: None,
            model: None,
            provider: None,
            user_text: None,
        }
    }

    #[tokio::test]
    async fn the_addressed_character_answers_first_and_nobody_answers_themselves() {
        let client = InferenceClient::new();
        assert_eq!(
            route(&client, request("Kai", "Sora, was meinst du?")).await,
            "Sora"
        );
        // Sora addressing herself does not make her speak twice; the failed request means the user.
        assert_eq!(
            route(&client, request("Sora", "Sora, reiß dich zusammen.")).await,
            PLAYER
        );
        assert_eq!(
            route(&client, request("Ayu", "Hey Sora, komm!")).await,
            "Sora"
        );
    }

    #[tokio::test]
    async fn everyone_the_user_addressed_gets_a_turn() {
        let client = InferenceClient::new();
        let user_text = "Ayu, die Idee ist toll! Sora, was meinst du?";
        let mut req = request("Kai", user_text);
        req.user_text = Some(user_text.into());
        // The question goes first …
        assert_eq!(route(&client, req.clone()).await, "Sora");
        // … then Ayu, who was addressed too.
        req.last_speaker = "Sora".into();
        req.last_text = "Klingt gefährlich.".into();
        req.this_turn = vec!["Sora".into()];
        assert_eq!(route(&client, req.clone()).await, "Ayu");
        // Both answered: the (failed) routing request means the user's turn.
        req.last_speaker = "Ayu".into();
        req.this_turn.push("Ayu".into());
        assert_eq!(route(&client, req).await, PLAYER);
    }
}
