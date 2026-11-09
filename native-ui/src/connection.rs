//! HTTP-Transport für Verbindungstest und Charakterchat mit gemeinsamem SSE-Decoder.
use iced::futures::StreamExt;
use otakusoul_stream::{StreamDecoder, WireFormat};
use std::fmt;
use std::time::Duration;

#[derive(Clone, Default)]
pub struct Secret(pub String);
impl fmt::Debug for Secret {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("<vertraulich>")
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Format {
    OpenAi,
    Anthropic,
}
impl fmt::Display for Format {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::OpenAi => "OpenAI-kompatibel",
            Self::Anthropic => "Anthropic",
        })
    }
}

#[derive(Debug, Clone)]
pub struct Settings {
    pub endpoint: String,
    pub model: String,
    pub key: Secret,
    pub format: Format,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            endpoint: "http://127.0.0.1:48596/v1/chat/completions".into(),
            model: String::new(),
            key: Secret::default(),
            format: Format::OpenAi,
        }
    }
}

#[derive(Clone)]
pub struct Cancellation(tokio::sync::watch::Sender<bool>);
impl Cancellation {
    pub fn new() -> Self {
        Self(tokio::sync::watch::channel(false).0)
    }
    pub fn cancel(&self) {
        self.0.send_replace(true);
    }
    async fn cancelled(&self) {
        let mut receiver = self.0.subscribe();
        if *receiver.borrow() {
            return;
        }
        let _ = receiver.changed().await;
    }
}

pub struct ActiveRequest {
    pub id: u64,
    pub cancellation: Cancellation,
}
impl Drop for ActiveRequest {
    fn drop(&mut self) {
        self.cancellation.cancel();
    }
}

#[derive(Debug, Clone)]
pub struct Report {
    pub answer: String,
    pub segments: usize,
}

/// Ein eigener Hintergrundthread betreibt den Tokio-Client; keine Netzwerk-Polls im UI-Thread.
pub fn run(settings: Settings, cancellation: Cancellation) -> Result<Report, String> {
    let mut body = serde_json::json!({"messages":[{"role":"user","content":"Reply with the word OK."}],"max_tokens":32,"stream":true});
    if !settings.model.trim().is_empty() {
        body["model"] = settings.model.trim().into();
    }
    run_request(settings, cancellation, body, Duration::from_secs(30))
}

pub fn run_chat(
    settings: Settings,
    cancellation: Cancellation,
    request: crate::chat_request::Request,
) -> Result<String, String> {
    let body = request.body(settings.format, settings.model.trim());
    run_request(settings, cancellation, body, Duration::from_secs(120)).map(|report| report.answer)
}

fn run_request(
    settings: Settings,
    cancellation: Cancellation,
    body: serde_json::Value,
    timeout: Duration,
) -> Result<Report, String> {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|_| "Der Netzwerkdienst konnte nicht gestartet werden.".to_string())?
        .block_on(receive(settings, cancellation, body, timeout))
}

fn endpoint(value: &str) -> Result<url::Url, String> {
    let url = url::Url::parse(value.trim())
        .map_err(|_| "Bitte eine vollständige HTTP- oder HTTPS-Adresse eingeben.")?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Bitte HTTP/HTTPS ohne Zugangsdaten in der Adresse verwenden.".into());
    }
    Ok(url)
}

fn client(url: &url::Url, timeout: Duration) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .timeout(timeout);
    if url
        .host_str()
        .is_some_and(|host| matches!(host, "localhost" | "127.0.0.1" | "[::1]"))
    {
        builder = builder.no_proxy();
    }
    builder
        .build()
        .map_err(|_| "Der HTTP-Client konnte nicht vorbereitet werden.".into())
}

fn authenticate(
    mut request: reqwest::RequestBuilder,
    settings: &Settings,
) -> reqwest::RequestBuilder {
    match settings.format {
        Format::OpenAi => {
            if !settings.key.0.is_empty() {
                request = request.bearer_auth(&settings.key.0);
            }
        }
        Format::Anthropic => {
            request = request.header("anthropic-version", "2023-06-01");
            if !settings.key.0.is_empty() {
                request = request.header("x-api-key", &settings.key.0);
            }
        }
    }
    request
}

fn model_url(settings: &Settings) -> Result<url::Url, String> {
    let mut url = endpoint(&settings.endpoint)?;
    let suffix = match settings.format {
        Format::OpenAi => "/chat/completions",
        Format::Anthropic => "/messages",
    };
    let Some(prefix) = url.path().trim_end_matches('/').strip_suffix(suffix) else {
        return Err("Aus diesem Chat-Endpunkt lässt sich keine Modellliste ableiten. Gib die Modell-ID direkt ein.".into());
    };
    let path = format!("{prefix}/models");
    url.set_path(&path);
    url.set_query(None);
    url.set_fragment(None);
    Ok(url)
}

pub fn list_models(settings: Settings, cancellation: Cancellation) -> Result<Vec<String>, String> {
    let url = model_url(&settings)?;
    let client = client(&url, Duration::from_secs(20))?;
    let request = authenticate(client.get(url), &settings);
    tokio::runtime::Builder::new_current_thread().enable_all().build()
        .map_err(|_| "Der Netzwerkdienst konnte nicht gestartet werden.")?
        .block_on(async {
            let response = tokio::select! {
                biased;
                _ = cancellation.cancelled() => return Err("Anfrage abgebrochen.".into()),
                response = request.send() => response.map_err(|_| "Die Modellliste konnte nicht abgerufen werden.")?,
            };
            if !response.status().is_success() {
                return Err(format!("Modellliste nicht verfügbar (HTTP {}).", response.status().as_u16()));
            }
            let mut chunks = response.bytes_stream();
            let mut bytes = Vec::new();
            while let Some(chunk) = tokio::select! {
                biased;
                _ = cancellation.cancelled() => return Err("Anfrage abgebrochen.".into()),
                chunk = chunks.next() => chunk,
            } {
                let chunk = chunk.map_err(|_| "Die Modellliste wurde nicht vollständig übertragen.")?;
                if bytes.len().saturating_add(chunk.len()) > 8 * 1024 * 1024 {
                    return Err("Die Modellliste ist zu groß.".into());
                }
                bytes.extend_from_slice(&chunk);
            }
            let body: serde_json::Value = serde_json::from_slice(&bytes).map_err(|_| "Die Modellliste ist ungültig.")?;
            let models = body["data"].as_array().ok_or("Die Antwort enthält keine Modellliste.")?;
            let mut ids: Vec<String> = models.iter().filter_map(|model| {
                model["id"].as_str().filter(|id| !id.trim().is_empty() && id.len() <= 512).map(str::to_owned)
            }).collect();
            ids.sort_unstable();
            ids.dedup();
            Ok(ids)
        })
}

async fn receive(
    settings: Settings,
    cancellation: Cancellation,
    body: serde_json::Value,
    timeout: Duration,
) -> Result<Report, String> {
    let url = endpoint(&settings.endpoint)?;
    if settings.format == Format::Anthropic && settings.model.trim().is_empty() {
        return Err("Bitte den Modellnamen für Anthropic eingeben.".into());
    }
    let client = client(&url, timeout)?;
    let request = authenticate(client.post(url).json(&body), &settings);
    let response = tokio::select! {
        biased;
        _=cancellation.cancelled()=>return Err("Anfrage abgebrochen.".into()),
        response=request.send()=>response.map_err(|error| if error.is_timeout() {"Zeitüberschreitung beim Verbindungsaufbau."} else {"Keine Verbindung. Bitte Adresse prüfen und den Modellserver starten."})?,
    };
    if !response.status().is_success() {
        return Err(format!(
            "Der Server meldet HTTP {}. Bitte Adresse, Modell und Zugangsdaten prüfen.",
            response.status().as_u16()
        ));
    }
    let format = match settings.format {
        Format::OpenAi => WireFormat::OpenAi,
        Format::Anthropic => WireFormat::Anthropic,
    };
    let mut decoder = StreamDecoder::new(format);
    let mut chunks = response.bytes_stream();
    let mut answer = String::new();
    let mut segments = 0;
    let mut received_bytes = 0usize;
    loop {
        let chunk = tokio::select! {
            biased;
            _=cancellation.cancelled()=>return Err("Anfrage abgebrochen.".into()),
            chunk=chunks.next()=>chunk,
        };
        let Some(chunk) = chunk else {
            break;
        };
        let chunk = chunk.map_err(
            |_| "Der Antwortstream wurde unterbrochen oder hat zu lange nicht geantwortet.",
        )?;
        received_bytes = received_bytes.saturating_add(chunk.len());
        if received_bytes > 1024 * 1024 {
            return Err("Der Antwortstream ist unerwartet groß.".into());
        }
        for (thought, text) in decoder
            .push(&chunk)
            .map_err(|_| "Die Streaming-Antwort enthält ungültige Textdaten.")?
        {
            if !thought {
                answer.push_str(&text);
                segments += 1;
            }
        }
        if answer.len() > 16 * 1024 {
            return Err("Die Antwort überschreitet die Textgrenze.".into());
        }
        if decoder.is_done() {
            break;
        }
    }
    for (thought, text) in decoder
        .finish()
        .map_err(|_| "Die Streaming-Antwort ist unvollständig.")?
    {
        if !thought {
            answer.push_str(&text);
            segments += 1;
        }
    }
    if !decoder.is_done() {
        return Err(
            "Der Antwortstream endete ohne Abschlussmarker. Bitte Endpunkt und Server prüfen."
                .into(),
        );
    }
    if answer.trim().is_empty() {
        return Err("Der Server hat keine sichtbare Streaming-Textantwort geliefert. Bitte Endpunkt und Format prüfen.".into());
    }
    if answer.len() > 16 * 1024 {
        return Err("Die Antwort überschreitet die Textgrenze.".into());
    }
    Ok(Report {
        answer: answer.trim().into(),
        segments,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};

    fn server(status: &str, body: &str) -> String {
        server_with_request(status, body).0
    }

    fn server_with_request(
        status: &str,
        body: &str,
    ) -> (String, std::sync::mpsc::Receiver<Vec<u8>>) {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let endpoint = format!(
            "http://{}/v1/chat/completions",
            listener.local_addr().unwrap()
        );
        let response = format!(
            "HTTP/1.1 {status}\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        let (sent, received) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(3)))
                .unwrap();
            let mut bytes = Vec::new();
            let mut chunk = [0u8; 1024];
            loop {
                let count = stream.read(&mut chunk).unwrap();
                if count == 0 {
                    return;
                }
                bytes.extend_from_slice(&chunk[..count]);
                if let Some(end) = bytes.windows(4).position(|window| window == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&bytes[..end]).to_ascii_lowercase();
                    let length = headers
                        .lines()
                        .find_map(|line| {
                            line.strip_prefix("content-length:")
                                .and_then(|length| length.trim().parse::<usize>().ok())
                        })
                        .unwrap_or(0);
                    if bytes.len() >= end + 4 + length {
                        break;
                    }
                }
            }
            let _ = sent.send(bytes);
            stream.write_all(response.as_bytes()).unwrap();
        });
        (endpoint, received)
    }

    #[test]
    fn model_catalog_uses_the_same_origin_and_deduplicates_model_ids() {
        let (base, received) = server_with_request(
            "200 OK",
            r#"{"data":[{"id":"b"},{"id":"a"},{"id":"b"},{"id":""}]}"#,
        );
        let settings = Settings {
            endpoint: base.replace("/v1/", "/api/v1/") + "?chat=1",
            key: Secret("fixture-secret".into()),
            ..Settings::default()
        };
        assert_eq!(
            list_models(settings, Cancellation::new()).unwrap(),
            ["a", "b"]
        );
        let bytes = received.recv_timeout(Duration::from_secs(3)).unwrap();
        let request = String::from_utf8(bytes).unwrap().to_ascii_lowercase();
        assert!(request.starts_with("get /api/v1/models http/"));
        assert!(request.contains("authorization: bearer fixture-secret"));
    }

    #[test]
    fn model_chat_posts_prepared_context_and_returns_only_visible_text() {
        let (endpoint, received) = server_with_request(
            "200 OK",
            "data: {\"choices\":[{\"delta\":{\"content\":\"<think>intern</think>Antwort\"}}]}\n\ndata: [DONE]\n\n",
        );
        let request = crate::chat_request::Request::new(
            &otakusoul_prompt::AssembledPrompt {
                system: "Figurenprofil".into(),
                post_history: Some("Nachspann".into()),
            },
            Some("Begrüßung"),
            &[],
            "Neue Frage",
        );
        let answer = run_chat(
            Settings {
                endpoint,
                ..Settings::default()
            },
            Cancellation::new(),
            request,
        )
        .unwrap();
        let request = received.recv_timeout(Duration::from_secs(3)).unwrap();
        let body_offset = request
            .windows(4)
            .position(|window| window == b"\r\n\r\n")
            .unwrap()
            + 4;
        let body: serde_json::Value = serde_json::from_slice(&request[body_offset..]).unwrap();
        assert_eq!(body["messages"][0]["content"], "Figurenprofil");
        assert_eq!(body["messages"][1]["content"], "Begrüßung");
        assert_eq!(body["messages"][2]["content"], "Neue Frage\n\nNachspann");
        assert_eq!(answer, "Antwort");
    }

    #[test]
    fn network_test_uses_shared_stream_filter_and_ignores_thoughts() {
        let endpoint = server(
            "200 OK",
            "data: {\"choices\":[{\"delta\":{\"content\":\"<think>intern</think>Grüße\"}}]}\n\ndata: [DONE]\n\n",
        );
        let report = run(
            Settings {
                endpoint,
                ..Settings::default()
            },
            Cancellation::new(),
        )
        .unwrap();
        assert_eq!(report.answer, "Grüße");
        assert!(report.segments > 0);
    }
    #[test]
    fn failed_http_response_does_not_expose_response_body_or_secret() {
        let endpoint = server("401 Unauthorized", "private-server-details");
        let error = run(
            Settings {
                endpoint,
                key: Secret("fake-test-key".into()),
                ..Settings::default()
            },
            Cancellation::new(),
        )
        .unwrap_err();
        assert!(error.contains("401"));
        assert!(!error.contains("private"));
        assert!(!error.contains("fake-test-key"));
        assert!(!format!("{:?}", Secret("fake-test-key".into())).contains("fake-test-key"));
    }
    #[test]
    fn cancelled_test_does_not_contact_server() {
        let cancellation = Cancellation::new();
        cancellation.cancel();
        assert!(
            run(Settings::default(), cancellation)
                .unwrap_err()
                .contains("abgebrochen")
        );
    }
    #[test]
    fn credential_urls_are_rejected_before_network() {
        let settings = Settings {
            endpoint: "https://name:password@example.com/v1".into(),
            ..Settings::default()
        };
        assert!(
            run(settings, Cancellation::new())
                .unwrap_err()
                .contains("ohne Zugangsdaten")
        );
    }

    #[test]
    fn cancellation_interrupts_an_in_flight_response() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let endpoint = format!(
            "http://{}/v1/chat/completions",
            listener.local_addr().unwrap()
        );
        let (ready_tx, ready_rx) = std::sync::mpsc::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(3)))
                .unwrap();
            let mut bytes = [0u8; 4096];
            let _ = stream.read(&mut bytes).unwrap();
            stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: 9999\r\n\r\ndata: ").unwrap();
            ready_tx.send(()).unwrap();
            let _ = release_rx.recv_timeout(Duration::from_secs(3));
        });
        let cancellation = Cancellation::new();
        let trigger = cancellation.clone();
        let canceller = std::thread::spawn(move || {
            ready_rx.recv_timeout(Duration::from_secs(3)).unwrap();
            trigger.cancel();
        });
        let result = run(
            Settings {
                endpoint,
                ..Settings::default()
            },
            cancellation,
        );
        let _ = release_tx.send(());
        server.join().unwrap();
        canceller.join().unwrap();
        assert!(result.unwrap_err().contains("abgebrochen"));
    }

    #[test]
    fn redirects_are_not_followed_with_an_anthropic_key() {
        let endpoint = server(
            "307 Temporary Redirect\r\nLocation: http://127.0.0.1:9/redirect-target",
            "",
        );
        let error = run(
            Settings {
                endpoint,
                model: "test-model".into(),
                key: Secret("fake-test-key".into()),
                format: Format::Anthropic,
            },
            Cancellation::new(),
        )
        .unwrap_err();
        assert!(error.contains("307"), "{error}");
    }

    #[test]
    fn clean_eof_without_terminal_marker_is_not_a_successful_test() {
        let endpoint = server(
            "200 OK",
            "data: {\"choices\":[{\"delta\":{\"content\":\"OK\"}}]}\n\n",
        );
        let error = run(
            Settings {
                endpoint,
                ..Settings::default()
            },
            Cancellation::new(),
        )
        .unwrap_err();
        assert!(error.contains("ohne Abschlussmarker"));
    }
}
