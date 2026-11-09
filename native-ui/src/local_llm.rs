//! Startet und beendet ausschließlich den von der nativen GUI gewählten llama-server.
use crate::connection::{Secret, Settings};
use iced::futures::channel::mpsc;
use std::{
    fs::{self, File},
    io::Read,
    net::TcpListener,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

#[derive(Debug, Clone, Copy)]
pub enum FileKind {
    Executable,
    Model,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Config {
    pub binary: Option<PathBuf>,
    pub model: Option<PathBuf>,
    pub context: String,
    pub gpu_layers: String,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            binary: None,
            model: None,
            context: "4096".into(),
            gpu_layers: "0".into(),
        }
    }
}

#[derive(Debug, Clone)]
pub enum Event {
    Ready(Settings),
    Exited(Result<(), String>),
}

#[derive(Default)]
struct Process {
    stopped: bool,
    child: Option<Child>,
}

pub struct Server(Arc<Mutex<Process>>);

impl Server {
    pub fn launch(config: Config) -> (Self, mpsc::UnboundedReceiver<Event>) {
        let process = Arc::new(Mutex::new(Process::default()));
        let lease = Self(Arc::clone(&process));
        let (events, receiver) = mpsc::unbounded();
        std::thread::spawn(move || {
            let result = serve(config, &process, &events);
            let child = process
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .child
                .take();
            if let Some(mut child) = child {
                let _ = child.kill();
                let _ = child.wait();
            }
            let stopped = process
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .stopped;
            let _ = events.unbounded_send(Event::Exited(if stopped { Ok(()) } else { result }));
        });
        (lease, receiver)
    }

    pub fn stop(&self) {
        let mut process = self.0.lock().unwrap_or_else(|error| error.into_inner());
        process.stopped = true;
        if let Some(child) = &mut process.child {
            let _ = child.kill();
        }
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        self.stop();
    }
}

fn command(config: Config, port: u16, key: &str) -> Result<Command, String> {
    let binary = fs::canonicalize(
        config
            .binary
            .ok_or("Wähle zuerst die llama-server-Datei.")?,
    )
    .map_err(|_| "Die llama-server-Datei ist nicht zugänglich.")?;
    if !binary.is_file()
        || (cfg!(windows)
            && !binary
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("exe")))
    {
        return Err("Wähle eine ausführbare llama-server-Datei.".into());
    }
    let model = fs::canonicalize(config.model.ok_or("Wähle zuerst ein GGUF-Modell.")?)
        .map_err(|_| "Das GGUF-Modell ist nicht zugänglich.")?;
    let mut magic = [0; 4];
    if !model.is_file()
        || !model
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("gguf"))
        || File::open(&model)
            .and_then(|mut file| file.read_exact(&mut magic))
            .is_err()
        || &magic != b"GGUF"
    {
        return Err("Die gewählte Datei ist kein lesbares GGUF-Modell.".into());
    }
    let context = config
        .context
        .trim()
        .parse::<u32>()
        .ok()
        .filter(|value| (256..=1_048_576).contains(value))
        .ok_or("Der Kontext muss zwischen 256 und 1.048.576 Tokens liegen.")?;
    let layers = config
        .gpu_layers
        .trim()
        .parse::<u32>()
        .ok()
        .filter(|value| *value <= 999)
        .ok_or("Gib für GPU-Schichten eine ganze Zahl zwischen 0 und 999 ein.")?;
    let mut command = Command::new(&binary);
    command
        .args(["--host", "127.0.0.1", "--port"])
        .arg(port.to_string())
        .arg("-m")
        .arg(model)
        .arg("-c")
        .arg(context.to_string())
        .arg("-ngl")
        .arg(layers.to_string())
        .args(["--parallel", "1", "--api-key", key])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    if let Some(parent) = binary.parent() {
        command.current_dir(parent);
    }
    // Externe llama.cpp-Voreinstellungen dürfen keine Downloads oder einen anderen Modus aktivieren.
    for (name, _) in std::env::vars_os() {
        if name
            .to_string_lossy()
            .to_ascii_uppercase()
            .starts_with("LLAMA_")
        {
            command.env_remove(name);
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    Ok(command)
}

fn serve(
    config: Config,
    process: &Mutex<Process>,
    events: &mpsc::UnboundedSender<Event>,
) -> Result<(), String> {
    let port = TcpListener::bind(("127.0.0.1", 0))
        .and_then(|socket| socket.local_addr())
        .map_err(|_| "Kein lokaler Port verfügbar.")?
        .port();
    let key = format!("{:032x}", rand::random::<u128>());
    let mut command = command(config, port, &key)?;
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|_| "Der lokale Netzwerkdienst konnte nicht gestartet werden.")?;
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(1))
        .build()
        .map_err(|_| "Die Serverprüfung konnte nicht vorbereitet werden.")?;
    {
        let mut process = process.lock().unwrap_or_else(|error| error.into_inner());
        if process.stopped {
            return Ok(());
        }
        process.child = Some(
            command
                .spawn()
                .map_err(|_| "llama-server konnte nicht gestartet werden.")?,
        );
    }
    let base = format!("http://127.0.0.1:{port}");
    let started = Instant::now();
    let mut ready = false;
    loop {
        {
            let mut process = process.lock().unwrap_or_else(|error| error.into_inner());
            if process.stopped || events.is_closed() {
                return Ok(());
            }
            if let Some(status) = process
                .child
                .as_mut()
                .expect("gestarteter Prozess")
                .try_wait()
                .map_err(|_| "Der llama-server-Status konnte nicht gelesen werden.")?
            {
                return Err(format!(
                    "llama-server wurde beendet ({status}). Prüfe Modell, Laufzeit und GPU-Schichten."
                ));
            }
        }
        if !ready {
            ready = runtime.block_on(async {
                let health = client.get(format!("{base}/health")).send().await;
                if !health.is_ok_and(|response| response.status().is_success()) {
                    return false;
                }
                client
                    .get(format!("{base}/v1/models"))
                    .bearer_auth(&key)
                    .send()
                    .await
                    .is_ok_and(|response| response.status().is_success())
            });
            if ready {
                let _ = events.unbounded_send(Event::Ready(Settings {
                    endpoint: format!("{base}/v1/chat/completions"),
                    key: Secret(key.clone()),
                    ..Settings::default()
                }));
            } else if started.elapsed() >= Duration::from_secs(300) {
                return Err("llama-server wurde innerhalb von fünf Minuten nicht bereit.".into());
            }
        }
        std::thread::sleep(Duration::from_millis(400));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use iced::futures::StreamExt;

    #[test]
    fn local_llm_starts_waits_for_authentication_and_stops_the_owned_process() {
        let temporary = tempfile::tempdir().unwrap();
        let path = temporary.path();
        let fixture = path.join("server.rs");
        let binary = path.join(if cfg!(windows) {
            "server.exe"
        } else {
            "server"
        });
        let model = path.join("fixture.gguf");
        fs::write(&model, b"GGUF").unwrap();
        fs::write(&fixture, r#"
            use std::{io::{Read, Write}, net::TcpListener};
            fn main() {
                let args: Vec<_> = std::env::args().collect();
                let value = |key: &str| args.windows(2).find(|pair| pair[0] == key).unwrap()[1].as_str();
                assert_eq!(value("--host"), "127.0.0.1");
                assert_eq!(value("-c"), "4096");
                assert_eq!(value("-ngl"), "0");
                let key = format!("authorization: bearer {}", value("--api-key"));
                let listener = TcpListener::bind(("127.0.0.1", value("--port").parse::<u16>().unwrap())).unwrap();
                for mut stream in listener.incoming().map(Result::unwrap) {
                    let mut bytes = Vec::new();
                    let mut buffer = [0; 512];
                    loop {
                        let read = stream.read(&mut buffer).unwrap();
                        if read == 0 { break; }
                        bytes.extend_from_slice(&buffer[..read]);
                        if bytes.ends_with(b"\r\n\r\n") { break; }
                    }
                    let request = String::from_utf8_lossy(&bytes).to_ascii_lowercase();
                    let status = if request.starts_with("get /health ") ||
                        (request.starts_with("get /v1/models ") && request.contains(&key)) {
                        "200 OK"
                    } else {
                        "401 Unauthorized"
                    };
                    let _ = write!(stream, "HTTP/1.1 {status}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                }
            }
        "#).unwrap();
        let compiler = std::env::var_os("RUSTC").unwrap_or_else(|| "rustc".into());
        assert!(
            Command::new(compiler)
                .arg(fixture)
                .arg("-o")
                .arg(&binary)
                .status()
                .unwrap()
                .success()
        );
        let (server, mut events) = Server::launch(Config {
            binary: Some(binary),
            model: Some(model),
            ..Config::default()
        });
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async {
            let ready = tokio::time::timeout(Duration::from_secs(15), events.next())
                .await
                .unwrap();
            let Some(Event::Ready(settings)) = ready else {
                panic!("Testserver nicht bereit: {ready:?}")
            };
            assert!(settings.endpoint.starts_with("http://127.0.0.1:"));
            assert_eq!(settings.key.0.len(), 32);
            server.stop();
            let exit = tokio::time::timeout(Duration::from_secs(10), events.next())
                .await
                .unwrap();
            assert!(matches!(exit, Some(Event::Exited(Ok(())))));
        });
    }
}
