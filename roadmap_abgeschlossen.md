# ✅ OtakuSoul – Abgeschlossene Roadmap

> Zusammengeführt am 05.10.2026 aus `Roadmap_abgeschlossen.md`, `ROADMAP_ABGESCHLOSSEN.md`, `ROADMAP.md`,
> `Roadmap_TTS.md`, `Roadmap_rename.md`, `roadmap_optional_content.md` und `roadmap_chatgpt.md`.
> Offene Punkte stehen in `roadmap.md`. Die Abschnitte geben den jeweiligen Stand ihrer Entstehung wieder
> (Testzahlen, Dateinamen und Bezeichnungen wie „Soul Stage“ sind teils historisch).

## Inhalt

1. Portierung Soul of Waifu → Rust/Tauri (Phasen 1–18)
2. Verbesserungen: Sicherheit, Abhängigkeiten, Oberfläche, i18n, Barrierefreiheit, Tests, lokale Bilder
3. Sprachausgabe (TTS)
4. Neutrale Modul-Architektur & SoW-Entkopplung
5. Optionale Inhalte (`otakusoul-data`)
6. Qualität & Bedienung (unabhängige App-Durchsicht, Abschnitte 1–9 mit Arbeitsprotokoll)
7. Abgearbeitet aus `roadmap.md` (ab 05.10.2026)

---

## 1. Portierung Soul of Waifu → Rust/Tauri (Phasen 1–18)

> Stand: 2026-09-26 · Vergleichsbasis: `Soul-of-Waifu-linux` (Branch `linux`, Upstream v2.5.1)
>
> Diese Roadmap listet alles, was aus dem Python-Original noch **fehlt** oder in OtakuSoul bisher nur
> **als Gerüst/Simulation** existiert. Abgeschlossene Punkte werden abgehakt und mit Commit-Hash versehen.

---

### 📊 1. Ist-Zustand im Überblick

| | Soul of Waifu (Python) | OtakuSoul (Rust + React) |
|---|---|---|
| Eigener Code | ~85.000 Zeilen (ohne venv & Qt-Ressourcen) | ~5.000 Zeilen Rust/TS |
| Laufzeit-Abhängigkeiten | Python 3.11 venv mit PyQt6, torch, transformers, … (~260 Pakete) | Tauri v2, reqwest, rusqlite, React 19, three-vrm |

#### Was in OtakuSoul schon da ist (Phase 1–7)

| Bereich | Status | Anmerkung |
|---|---|---|
| Hardware-Probe & GPU-Layer-Rechner | ✅ solide | NVIDIA-only (`nvidia-smi`), automatische Schicht-Zuteilung |
| llama-server Prozessmanager | ✅ solide | PDEATHSIG, Health-Polling, Port-Freigabe, zero-zombie |
| SSE-Streaming + `<think>`-Filter | ✅ solide | Unified Provider-Schnittstelle für lokal & Cloud (OpenRouter, Anthropic, OpenAI, etc.) |
| Character Card V2 (PNG/JSON) | ✅ vollständig | Galerie-Bibliothek, V2-Editor, SillyTavern-PNG/JSON Import & Export, Personas |
| Lorebook 2.0 | ✅ vollständig | Editor, Multi-Binding, Trigger-Engine (OR/AND/NOT/Regex), Tension Accumulator, Chains |
| Prompt Builder | ✅ solide | Dynamische Injektion von Kognition, Lorebooks, Direktiven und {{char}}/{{user}}-Makros |
| Soul Memory 2.0 (SQLite) | ✅ vollständig | 4 Schichten, autonomer Router/Archivist/Diary-Agent, Markdown-Sync & Backups |
| Soul Stage | 🟡 Kern vollständig | Zweistufiger KI-Game-Master, Szenen-Lobby, Party-/Kampagnen-HUD, Inventar, Rast/Bindungen, Taktik & Undo; erweiterte SoW-Parität siehe Phase 15 |
| Soul Companion | 🟡 Gerüst | Neurohormone + 25s Safety-Banner – echte Tool-Ausführung folgt in Phase 16 |
| VRM-Avatar (3D) | ✅ vollständig | Three.js VRM, Emotions-Morphs, Audio-FFT LipSync, Blinzeln, Atmung |
| Live2D (2D) | ✅ vollständig | PixiJS + Cubism 4/2, 28-Emotionen-Klassifikator, Motion-Trigger, LipSync, Import & Downloader |
| Chat-System | ✅ vollständig | SQLite Multi-Sessions, Swipes (< 1/3 >), Author's Note, Inline-Edit, JSONL Import/Export, 11 HUD-Presets |
| Soul Hub & Gateways | ✅ vollständig | 4 Bereiche: Soul Gateway, Chub AI (Suche, Sortierung, Tags, NSFW, Import), Welt-Lorebooks, Soul-Stage-Szenarien |

---

### 🚨 2. Technische Schulden (vor neuen Features erledigen)

- [x] **Hartkodierte Pfade entfernen** – `useAppStore.ts` und `SettingsView.tsx` von absoluten Pfaden befreit; Datenverzeichnis via `directories::ProjectDirs` (`paths.rs`), Assets per dynamischem Scan (`scan_characters`, `scan_models`, `scan_vrm_models`).
- [x] **Persistente Konfiguration** – `settings.json` im Config-Verzeichnis (`settings.rs`) + Rust-Commands `load_settings`/`save_settings`.
- [x] **Sampling konfigurierbar** – `temperature`, `min_p`, `max_tokens` im Settings-UI anpassbar und persistent gespeichert.
- [x] **Antwortsprache konfigurierbar** – `reply_language` im Settings-UI editierbar und persistent gespeichert.
- [x] **Lorebook-Scan-Tiefe** – `lorebook_scan_depth` begrenzt den Keyword-Scan auf die letzten N Nachrichten (Standard: 5).
- [x] **Datei-Dialoge** – `tauri-plugin-dialog` integriert für Modelle (.gguf), 3D-Avatare (.vrm) sowie Import/Export (.png/.json).
- [x] **Hardware-Probe für AMD/Intel** – NVIDIA über `nvidia-smi`, AMD/Intel/iGPUs über eine Vulkan-Abfrage, Apple; Metal-Feinheit siehe `roadmap.md`.

---

### 🧭 3. Phasen

Die Reihenfolge ist nach Abhängigkeit und Nutzen sortiert: erst das, was jede andere Funktion braucht
(Daten, Chat, Provider), dann Stimme/Avatar, dann Stage/Companion, zuletzt Ökosystem.

#### Phase 8 – Datenfundament & Charakterbibliothek ✅ abgeschlossen

- [x] **Einheitliches Datenverzeichnis** (`characters/`, `lorebooks/`, `personas/`, `scenes/`, `.trash/`) via `paths.rs`.
- [x] **Charakterbibliothek** – Responsive Kachel-Ansicht, Suche, Tag-Filter, Sortierung, Avatar-Vorschau (`CharacterLibraryView.tsx`).
- [x] **Charakter-Editor** – alle V2-Felder, Avatar-Upload/Picker, Tags, Beispieldialoge, alternative Begrüßungen (`CharacterEditorModal.tsx`).
- [x] **Import** von V2-PNG/JSON per nativem Dateidialog.
- [x] **Export** als SillyTavern V2-PNG (mit `chara` tEXt-Chunk und CRC32) und JSON (`export_character_card`).
- [x] **Charakter löschen** (mit Papierkorb/Backup `.trash/` statt Hard-Delete).
- ~~**SoW-Konfigurationsimport**~~ – *(Entfällt; durch Entkopplung und Ausbau des modularen Systems obsolet)*
- [x] **User-Personas** – mehrere Personas anlegen, bearbeiten, löschen, Schnellwechsel im Chat & HUD (`PersonaManagerModal.tsx`).

#### Phase 9 – Vollwertiger Chat ✅ Kernfunktionen abgeschlossen

- [x] **Chat-Persistenz** – mehrere Chats pro Charakter in SQLite (`chat_sessions`, `chat_messages`), Chat-Liste, Umbenennen, Löschen
- [x] **Chat-Import/Export** (SillyTavern & SoW JSONL mit Metadaten und allen Swipes)
- [x] **Nachricht bearbeiten / löschen / neu generieren** (Inline-Editing, Delete, Regenerate)
- [x] **Swipes / Varianten** – SillyTavern-Style Antwortvarianten in `swipes_json`, Pagination `< 1/3 >`, Wechsel per Pfeil
- [x] **Weiter-Generieren** (Continue) einer Nachricht
- [x] **Author's Note** pro Chat mit konfigurierbarer Injektionstiefe (Depth-Slider & System-Prompt-Injektion)
- [x] **State Variables aus LLM-Antworten parsen** – robuster `<state>`-JSON-Interceptor (`stateParser.ts`), Tag-Stripping aus Chatblasen + **11 Rollenspiel-HUD-Presets** (Romance, Fantasy RPG, Survival, Horror, Cyberpunk, Slice of Life, Detektiv, Space Opera, Cultivation, Comedy, Tabletop Tactical)
- [x] **Kontextfenster-Management** *(umgesetzt, siehe Abschnitt 2)* – Token-Zählung (`tiktoken-rs` oder `/tokenize` des llama-servers), Response-Reserve, älteste Nachrichten abschneiden (SoW: `PromptEngine._get_max_context_tokens`)
- [x] **Automatische Zusammenfassung** *(umgesetzt, siehe Abschnitt 2)* alter Nachrichten + Summary-Editor (SoW: `build_summary_prompt_blocks`, `open_summary_editor`, `save_interval_summary`)
- [x] **System-Prompt-Editor** & Prompt-Vorlagen *(umgesetzt, siehe Abschnitt 2)*
- [x] **Datei-Anhänge** (Text, PDF, Bilder für Vision-Modelle) *(umgesetzt, siehe Abschnitt 2)* (SoW: `open_attach_file_dialog`)
- [x] **Chat-Übersetzung** einzelner Nachrichten *(umgesetzt, siehe Abschnitt 2)* (SoW: `translator.py`)

#### Phase 10 – LLM-Provider & llama.cpp-Tuning ✅ Abgeschlossen

- [x] **Provider-Abstraktion in Rust** (`LlmProviderType`, `ProviderRegistry`) mit nativer Unterstützung für Streaming
- [x] **Provider**: OpenRouter (Modellkatalog abrufen & 1-Klick-Auswahl), **Anthropic** (natives Messages-API-Format mit `x-api-key`, `anthropic-version`, separatem `system`-Prompt & `content_block_delta` SSE-Parsing), OpenAI, DeepSeek, Gemini, Mistral, Custom Endpoints
- [x] **Vollständige Sampler-Einstellungen** – Temperature, Top-P, Min-P, Repeat Penalty, Top-K, **Dynamic Temperature** (`dynatemp_range`, `dynatemp_exponent`), **DRY** (`dry_multiplier`, `dry_base`, `dry_allowed_length`, `dry_penalty_last_n`), **XTC** (`xtc_threshold`, `xtc_probability`), Stop-Strings, Max Tokens
- [x] **LLM-Presets** speichern / laden / löschen (5 vordefinierte Presets: Storytelling/Kreativ, Rollenspiel Standard, Stage GM / Logik, XTC Wild, Fast Chat + Benutzer-Presets in `llm_presets.json`)
- [x] **llama-server-Optionen** – Kontextgröße, Batch-Size (`-b`), UBatch (`-ub`), CPU-Threads, Flash Attention (`-fa`), RAM Lock (`--mlock`), no-mmap (`--no-mmap`), KV-Cache-Quantisierung (`--cache-type-k`, `--cache-type-v` für `q8_0` / `q4_0`), **CPU-MoE-Layer** (`--cpu-moe`), Thinking-Budget
- [x] **Models Hub** – Hugging-Face-API-Suche (`filter=gguf`), Dateibaum-Inspektion mit Quantisierungs-Erkennung (Q4_K_M, Q8_0 etc.), async GGUF-Downloader mit Live-Fortschrittsbalken und Download-Geschwindigkeit (`model-download-progress`)
- [x] **Backend-Auswahl** über die Laufzeitkarten (`runtimes.rs`): CUDA, Vulkan, Metal, CPU; HIP/SYCL siehe `roadmap.md`.
- [x] **llama.cpp-Updater** – neuester stabiler Build von GitHub mit SHA-256-Prüfung, Installieren/Aktualisieren in der Laufzeitkarte; Rollback siehe `roadmap.md`.

#### Phase 11 – Soul Memory 2.0 (echte kognitive Pipeline) ✅ Abgeschlossen

- [x] **Router-Agent** – autonomer LLM-Call evaluiert jüngste Dialog-Turns, erkennt No-Op (`no_significant_change: true`), erzeugt JSON Field-Patches (`character_memory_patch`, `user_memory_patch`), löst Widersprüche und plant Topics
- [x] **Archivist-Agent** – extrahiert Fakten/Themen in dichte, kompakte Lore-Einträge (<300 Wörter) und aktualisiert episodische Topic-Dateien
- [x] **Tagebuch automatisch & manuell** – Ich-Perspektiven-Reflexion (4–6 prägnante Sätze) über das Geschehen und die Gefühle gegenüber {user_name}
- [x] **User-Profil & Beziehungsgedächtnis** – Rolle in der Story, bekannte Attribute, dynamische Beziehungsbeschreibung, Vorlieben und gemeinsame Meilensteine als eigene Schicht
- [x] **Markdown-Ansicht & Bidirektionaler Sync** – Render-Funktionen (`render_character_markdown`, `render_user_markdown`), integrierter Code-Editor für `MEMORY.md` und `USER.md` mit 1-Klick-Sync zurück nach SQLite
- [x] **Backups & Snapshots** – automatische Snapshots vor jedem Schreibvorgang, Snapshot-Manager mit Verlauf und 1-Klick-Wiederherstellung
- [x] ~~**Import bestehender SoW-Memory-Dateien**~~ – *(Historisch umgesetzt; in der neutralen Architektur durch Phase 1 vollständig bereinigt und abgelöst)*
- [x] **Prompt-Builder-Integration** – Unumstößliche Glaubenssätze, kognitive Dissonanz, Story-Rolle und Beziehungsdynamik fließen reaktiv in den System-Prompt ein

#### Phase 12 – Lorebook 2.0 ✅ Abgeschlossen

- [x] **Lorebook-Editor** – Vollständiger Editor für Lorebooks und Einträge (Name, Content, Primär-/Sekundärschlüssel, Exclude-Keys, Regex, Priorität, Wahrscheinlichkeit, Wortgrenzen, Case-Sensitivity)
- [x] **Multi-Binding & globale Lorebooks** – Beliebig viele Lorebooks an Charaktere binden (`bound_lorebooks`) sowie globale Universum-Lorebooks für alle Chats (`is_global` / `global_lorebooks`)
- [x] **Erweiterte Trigger-Engine** – Primärschlüssel (ODER), Sekundärschlüssel (UND), Ausschlusswörter (NICHT), Wortgrenzen-Regex (`\b`), Reguläre Ausdrücke und Always-On
- [x] **Scene Tension Accumulator** – Dynamischer Spannungsaufbau im Gespräch mit Auslösung von Krisen-/Zufallsevents bei Schwellenwert (`tension_threshold`) und Spannungsabbau
- [x] **Chain Dependencies** – Einträge schalten andere frei (`chain_activates`) oder verlangen erfüllte Vorbedingungen (`chain_requires`)
- [x] **Getrennte Injection-Modi** – Passiv (Weltwissen / Kontext) vs. Aktiv (Strikte Regie- und Verhaltensdirektiven im System-Prompt)
- [x] **Lorebook-Import & Export** – SillyTavern-, World-Info- und OtakuSoul-kompatibler JSON-Import/-Export mit nativem Datei-Dialog

#### Phase 13 – Stimme: TTS, STT & Voice Call ✅ abgeschlossen

Die Kernlaufzeit bleibt Python-frei: Whisper läuft nativ über whisper.cpp, Kokoro 82M direkt über ONNX Runtime;
weitere stark variierende oder schwere TTS-/RVC-Modelle werden über klar konfigurierte, optionale Sidecar-Endpunkte angebunden.

- [x] **Audio-Ausgabe & Gerätewahl** – unterbrechungssichere Web Audio API Queue, Gain, Ausgabegerät, AnalyserNode & FFT-Amplitude
- [x] **Satzweises Streaming** – TTS startet beim ersten fertigen Satz; geordnete Synthese, Warteschlange und sofortiger Abbruch bei Unterbrechung
- [x] **TTS-Engines**
  - [x] Edge-TTS (WebSocket-Protokoll direkt in Rust – kein Python nötig)
  - [x] Kokoro 82M nativ/offline (Rust + ONNX Runtime, gecachte Session, In-App-Installer mit SHA-256-Prüfung, acht US-/UK-Stimmen und eigene Modellpfade; englische G2P)
  - [x] ElevenLabs (HTTP inkl. Live-Stimmenliste)
  - [x] OpenAI & OpenAI-kompatibel (`/v1/audio/speech`)
  - [x] Qwen3-TTS, XTTSv2, Silero TTS & AllTalk über frei konfigurierbare lokale Sidecars
- [x] **RVC Voice Conversion** – optionaler Multipart-Sidecar mit Modell, Pitch, Index-Rate und Protect
- [x] **Stimmen-Dialog pro Charakter** – TTS/STT/RVC, Ein-/Ausgabegeräte und Custom-Regex (`CharacterVoiceModal`)
- [x] **Vorlesen-Button** an jeder Chatblase + Auto-TTS Toggle
- [x] **STT** – natives `whisper-rs`/whisper.cpp (offline) sowie OpenAI-kompatible Transkriptions-Endpunkte; Web-Audio-RMS-VAD mit konfigurierbarer Schwelle/Stillezeit
- [x] **SoW System / Voice Call** – Zustände Listening/Transcribing/Thinking/Speaking, automatischer Turn-Wechsel, Push-to-talk und Unterbrechung durch den Nutzer
- [x] **Echtes LipSync** – Amplitude aus dem TTS-Audio an VRM-Avatar (`aa` Blendshape) gekoppelt

#### Phase 14 – Avatare & Emotionen ✅ abgeschlossen

- [x] **Live2D-Renderer** einbinden (`Live2DViewer.tsx` via `pixi.js` + `pixi-live2d-display` mit Cubism 4 & 2 Runtime, Zoom, Pan, Mouse-Look & LipSync)
- [x] **Motion Mapper & Live2D-Ausdrücke** – Emotion → Live2D-Motion/Expression (`joy_animation`, `amusement_animation` etc.)
- [x] **28-Emotionen-Klassifikator** – GoEmotions-Mapping + deutsches/englisches Actions-/Affekt-Lexikon (`classify_text_emotion`)
- [x] **Expression-Bilder & GIFs** als flexibler 2D-Avatar-Modus mit Emotions-Overlays
- [x] **VRM-Emotionen & Motions** aus dem Klassifikator steuern; VRM- & Live2D-Modellauswahl pro Charakter
- [x] **Live2D-Downloader & Scanner** portiert (`modules/live2d.rs`: Scan lokaler/gebündelter Modelle + Cubism Sample Download)

#### Phase 15 – Soul Stage: KI-Game-Master 🟡 Kernumfang abgeschlossen

Die Soul Stage Engine ist nun ein vollwertiges Tabletop-Rollenspiel-Erlebnis mit einem zweistufigen KI-Game-Master, automatischen Würfelprüfungen und reichhaltiger Benutzeroberfläche.

- [x] **Szenen-Format & Szenen-Bibliothek** – Szenen laden/importieren, Lobby-Modal (Presets: `sakura-succubus-3/scenes`, `no-game-no-life/scenes`, eigene Szenen in `data/scenes`)
- [x] **GM-Orchestrator** – Zweistufige Pipeline: Planner → Mechanics & Dice → Executor → Actor Turn mit robustem JSON-Reparatur-Parser (`repair_and_parse_gm_plan`)
- [x] **Party-System & HUD** – Live-Leiste für LP und Stress aller Gefährten, dynamische Status-Effekte mit Rundendauer (`PartyHeader.tsx`)
- [x] **Turn-Control-Bar** – Modi 💬 Sagen, ⚔️ Tun, 💭 Denken, 🎬 Regie, 🤫 Flüstern; nächsten Sprecher wählen (`TurnControlBar.tsx`)
- [x] **WorldState** – Tageszeit, Wetter, Ort, Gefahrenstufe, aktive Quest, Key-Facts
- [x] **Story Arcs** – Fortschritt und Enthüllung von Arcs
- [x] **Kampagnenziele & Chronik** – persistente Objectives, Key Facts und dauerhafte Konsequenzen mit eigener Kampagnenansicht (`StageCampaignPanel.tsx`)
- [x] **Tagged Choices** – Klickbare Antwortoptionen mit Skill-/DC-Badges
- [x] **Interaktives Inventar** – Verbrauchsgegenstände heilen LP/Stress, kurieren Zustände, werden verbraucht und erzeugen Event-Cards
- [x] **Rast/Camp & Bindungen** – Kurze/Lange Rast, Zeitfortschritt, Lagerfeuer-Interlude, Affinitätszuwachs und Meilensteine bei 25/50/75
- [x] **Event-Cards** im Chatverlauf – Würfelproben mit Erfolgs-/Patzer-Hervorhebung, Uhren-Updates, Entdeckungen, Konsequenzen und Rast-Karten (`StageEventCardView.tsx`)
- [x] **Spielstände & Snapshots** – Szenen persistieren, automatische Snapshots für 1-Klick-Undo (`undo_stage_turn`)
- [x] **Markdown-Export** – Vollständiges Abenteuer-Protokoll als `.md` exportieren (`export_stage_markdown`)
- [x] **3 Ansichts-Modi** – 📜 *Abenteuer & Spielleiter*, ⚔️ *Taktik, Clocks & Würfel* sowie 🎒 *Kampagne & Inventar*
- [x] **Taktischer Begegnungsmodus** – GM-gesteuerter Kampfbeginn/-fortschritt/-abschluss, Initiative, Gegner-LP, Schnellaktionen und Zug verschieben
- [x] **Live-Zuganzeige** – zeigt Spielerzug bzw. laufende GM-Planung; erzwungener nächster Sprecher wird korrekt an Rust übertragen
- [x] **Stage-Vertragsfixes** – Frontend/Rust-Feldnamen vereinheitlicht, Kampf-Tracker auf `combat` korrigiert, `key_facts` bei Weltänderungen erhalten und manuelle Würfe an den Stage-GM statt an den normalen Chat übergeben

##### Erreichte SoW-Referenzparität (Abgeschlossen)

- [x] **Mehrere Akteure pro GM-Zug & dynamische NPCs** – `max_actor_depth` Schleife mit sequentiellen Gefährten-Reaktionen, Party-Dialog-Ketten und Persönlichkeits-Overlays (`stage.rs`)
- [x] **Stage-Lore & private Informationen** – Automatische Bindung von Lorebooks, Trigger-Evaluation über `evaluate_lorebooks` und Injektion in GM-Planner & Gefährten-Prompts
- [x] **Stage-Nachrichtenwerkzeuge** – Bearbeiten (Inline-Editor), Löschen, Regenerieren und Vorlesen (TTS) per Hover-Leiste direkt im Stage-Chatverlauf (`StageChatLog.tsx`, `stage.rs`)
- [x] **Szenen-Zuverlässigkeit** – Rotierende `.json.bak`-Sicherheitskopien, automatische Wiederherstellung und modales „Fortsetzen vs. Neu starten“-Fenster bei vorhandenem Fortschritt (`SceneLobbyModal.tsx`)
- [x] **Dynamische Bühnenatmosphäre** – Dynamische Hintergrund-Backdrop-Layer (`bg_image` aus GM-Plan), Hintergrund-Auflösung über `get_stage_background_image`, Background-Lock-Toggle (`lock_bg`) in der Menüleiste (`StageView.tsx`)
- [x] **Szenenordner & No Game No Life Defaults** – Ordner-Verwaltung (`list_stage_folders`, `create_stage_folder`, `move_stage_scene_to_folder`, `delete_stage_folder`), Ordner-Filter-Pills mit Szenen-Zähler, automatische Bereitstellung aller 12 Kapitel von *No Game No Life* im Ordner „No Game No Life“ in natürlicher Kapitelreihenfolge sowie *Sakura Succubus 3*
- [x] **Szenen-JSON-Import/-Export** – Direkter JSON-Import mit Ordner-Zuweisung und 1-Klick-JSON-Export (`stage_import_scene_json`, `stage_export_scene_json`, `SceneLobbyModal.tsx`)

#### Phase 16 – Soul Companion: echter Desktop-Agent 🟢

- [x] **Transparentes Overlay-Fenster** – Dediziertes rahmenloses Floating-Companion-Fenster (`FloatingCompanionOverlay.tsx`, Tauri WebviewWindowBuilder mit `transparent(true)`, `decorations(false)`, `always_on_top(true)` und nativer Click-Through-Umschaltung via `set_ignore_cursor_events`).
- [x] **Companion-LLM-Schleife & Proaktivität** – Heartbeat-Evaluation, Begrüßungs-Check, Idle/AFK-Erkennung und proaktive Trigger (`evaluate_companion_proactive`).
- [x] **Event-Bus für OS-Ereignisse** – Aktive Fenstererkennung via X11/Wayland/Windows (`detect_desktop_window`) mit konfigurierbarem Datenschutzfilter für sensitive Anwendungen (Passwortmanager, Banking, Incognito).
- [x] **Emotion-State aus Neurohormonen & Gedächtnis** – 10 diskrete Emotionen via EMA (Alpha = 0.30) berechnet aus Neurohormonen (Dopamin, Cortisol, Oxytocin, Erschöpfung), Schlaf- und Einsamkeits-Modellierung, persistentes Gedankenspeicher-Scratchpad (`scratchpad.json`) und Versprechen-/Ziele-Tracker (`goals.json`) mit DE/EN Regex-Extraktion, Fälligkeitsprüfung und Retention-Cleanup.
- [x] **Echte Desktop- & System-Tools (`companion_tools.rs`)**:
  - [x] Websuche (DuckDuckGo HTML-Scraping / Instant-Answer)
  - [x] URL öffnen im Standard-Webbrowser (`xdg-open` / `open` / Windows `start`)
  - [x] System- & Hardware-Info via `sysinfo::System`
  - [x] Screenshot-Erfassung via `xcap` (Cross-Platform, Base64 PNG)
  - [x] Zwischenablage lesen & schreiben via `arboard::Clipboard` mit Wayland/X11-Fallback (`wl-paste`, `xclip`, `xsel`)
  - [x] Mediensteuerung über MPRIS/D-Bus (`playerctl play-pause / next / previous / stop`)
  - [x] App-Steuerung (`launch`, `focus`, `close`, `list` mit Desktop-Aliasen)
  - [x] GUI-Action (Mausklicks, Tippen, Hotkeys, Scrollen via `ydotool` / `xdotool` / PowerShell)
  - [x] Autonomer Webseiten-Reader (`fetch_web_content` via `reqwest` & Tag-Stripper)
  - [x] Sandboxed Code-Ausführung (Multiplattform: native PowerShell & Batch unter Windows, Bash unter Linux/macOS, optionales Python 3 mit konfigurierbarem Timeout 20s–60s im isolierten Verzeichnis)
  - [x] File Organizer (Dateien listen, suchen, anzeigen & nach Kategorien organisieren mit Systempfad-Schutz)
  - [x] System-Vitals-Watchdog (Live-Snapshot mit CPU, RAM, Disks, GPU Temp/Util via `nvidia-smi`, Uptime)
- [x] **Plugin-System** – Erweiterbares JSON-Plugin-Manifest-System (`companion/plugins/*.json`) für benutzerdefinierte Skripte & Binaries mit parametrisierter Ausführung.
- [x] **Model Context Protocol (MCP) Client (`mcp_client.rs`)** – Standardkonformer JSON-RPC 2.0 Client für stdio (z. B. Node.js MCP Server) und HTTP/SSE mit Server-Management (`mcp_servers.json`), Tool-Discovery (`tools/list`) und Tool-Ausführung (`tools/call`).
- [x] **Sicherheitsflow & Human-in-the-Loop** – 25s Countdown-Banner für gefährliche Aktionen, manuelle Genehmigung und Fokus-Rückgabe an die Zielanwendung nach Ausführung.

#### Phase 17 – Ökosystem & Integrationen 🟢 (Abgeschlossen)

- [x] **Lokaler Web-Client für Smartphone & Tablet** – Autarker `axum` HTTP- und WebSocket-Server (`web_server.rs`), Token-Auth, Host-Header-Prüfung gegen DNS-Rebinding, Vektor-SVG-QR-Code (`qrcode`) zum direkten Scannen per Handykamera, Link-Kopieren, dynamische IP-Erkennung, integrierter responsiver HTML5/Tailwind Web-Client mit SSE/WebSocket-Streaming, Sprachausgabe (TTS) und STT-Upload.
- [x] **Discord Rich Presence & Gateway-Bot** – Nativer Unix-Domain-Socket / Windows-Named-Pipe RPC-Client (`discord.rs`) für Live-Status ("Im Gespräch mit {character}"), autarker Discord Gateway WebSocket Bot (`wss://gateway.discord.gg`) mit Heartbeat-Loop (Opcode 1/10) und Befehlen (`!ask`, `!character`, `!status`, `!reset`).
- [x] **KI-Bildgenerierung & Live-Studio** – Multi-Provider-Engine (`image_generator.rs`) für Automatic1111 (`/sdapi/v1/txt2img`), ComfyUI (`/prompt`), OpenAI DALL-E 3 (`/v1/images/generations`), NovelAI (`/ai/generate-image`) und FLUX. Automatischer Kontext-Prompt-Synthesizer (`build_character_prompt`), Situations-Schnellaufnahme im Chat-HUD (`AdaptiveHud.tsx`) und Galerie-Feed.
- [x] **Soul Hub & Gateways** – Vollwertiger 4-teiliger Community-Hub mit Live-Suche, Tags, Sortierungen, NSFW-Filter, Chub AI API/CDN-Import inkl. automatischer Extraktion eingebetteter Lorebooks (`character_book`), URL-Direktimport, kuratiertem Soul Gateway, Welt-Lorebooks-Registry und Soul-Stage-Szenarien-Registry (`soul_hub.rs`, `SoulHubView.tsx`).
- [x] **KI-Charakterassistent** – Geführter 5-Schritte Creation Wizard (`CharacterAiAssistantModal.tsx`, `characters.rs`): Konzept & Name (mit Archetyp-Pills), Aussehen, Persönlichkeit, Welt & Beziehung zu `{{user}}`, Begrüßung/Szenario. Direkte LLM-Synthese in SillyTavern V2 Format (`generate_character_draft_llm`), Review-Editor und 1-Klick-Speicherung in die Bibliothek.
- [x] **Profil-Backup & Restore mit Schutzgarantie** – Vollständiger ZIP-Archiv-Manager (`profile_backup.rs`) mit Gruppen-Auswahl (Charaktere, Lorebooks, Personas, Seelengedächtnis, Soul Stage, Companion, Settings), Manifest (`manifest.json`), 5-facher rotierender Sicherheits-Snapshot-Erstellung (`pre_restore_...`) vor jeder Wiederherstellung und selectivem Rollback.

#### Phase 18 – UI-Politur, i18n & Auslieferung 🟢 (Abgeschlossen)

- [x] **Internationalisierung (i18n)** – Typsicheres Wörterbuch in `src/i18n/index.ts` mit vollständiger Abdeckung für `de` (Deutsch), `en` (English) und `ru` (Русский). Reaktiv über `useTranslation()`-Hook, Sprachwechsler in Header und `SettingsView.tsx`.
- [x] **Themes & UI-Politur** – 5 Farbwelten (`obsidian` [Default], `cyberpunk`, `sakura`, `midnight`, `emerald`), dynamisches DOM-Attribut `data-theme`, CSS-Theme-Variablen in `src/App.css`, Persistierung in App-Settings.
- [x] **Updater-Dialog** – `src-tauri/src/modules/updater.rs`, Backend-Command `check_for_updates` mit GitHub Releases SemVer-Vergleich, Modal `src/components/updater/UpdaterModal.tsx` mit Versionsvergleich & Release-Notes.
- [x] **Logging & Log-Viewer** – Datei-Logger (`src-tauri/src/modules/logger.rs`) mit In-Memory-Ringpuffer (1000 Einträge), Dateipersistenz in `~/.local/share/otakusoul/logs/otakusoul.log`, Commands `get_app_logs`, `clear_app_logs`, `export_app_logs`, Modal `src/components/logging/LogViewerModal.tsx` mit Level-Filtern und Suchfunktion.
- [x] **Paketierung & Installer für Linux, Windows & macOS** – Universelle Ein-Klick-Installer & Launcher:
  - Linux: `install.sh` (Binary, 512x512 Icon, `.desktop`-Menüeintrag), `.deb`, `AppImage`, Arch AUR `PKGBUILD`.
  - Windows: `install.ps1` (PowerShell-Installer nach `%LOCALAPPDATA%`, Startmenü- & Desktop-Verknüpfungen mit `.ico`), NSIS-Setup `.exe`.
  - macOS: `install-macos.sh` (Installation nach `/Applications/OtakuSoul.app`, Quarantäne-Bereinigung), `.dmg` Disk Image Installer.
- [x] **Lokale Verifikation & Packaging** – Tests (`npm run test`, `cargo test`) und Paketierungs-Builds laufen lokal (keine automatischen GitHub Actions).
- [x] **Frontend-Tests (Vitest)** – 16 Unit-Tests (`npm run test`) für Wörterbuch-Vollständigkeit (`src/test/i18n.test.ts`), State-Tags-Parser & Roleplay-Splitter (`src/test/stateParser.test.ts`), und Sound-Synthesizer (`src/test/soundFx.test.ts`).
- [x] **Mobile Readiness** – Responsives Web-Interface via integriertem `axum` Web-Server (Phase 17) für Smartphones & Tablets; Desktop Tauri-Core bereit für spätere native Mobile-Targets.

---

#### Kürzlich abgeschlossene Verbesserungen (OtakuSoul v0.2.0)

- [x] Kontrast prüfen: `text-slate-500` auf `slate-950` erreicht bei kleiner Schrift das WCAG-AA-Kontrastverhältnis nicht.
- [x] Virtualisierte Listen für große Charakter- und Lorebook-Bibliotheken.
1. ✅ **P0 komplett**: Regex-Bug, CSP/Scope, Schlüsselbund, Webserver-Absicherung.
2. ✅ **Tauri-Minor-Updates + lokale Checks + Clippy-Bereinigung.** Geringes Risiko, schafft ein Sicherheitsnetz.
3. ✅ *(Bausteine teilweise)* **Design-Tokens + UI-Bausteine** (`Button`, `Modal`, `ConfirmDialog`, `Toast`, `EmptyState`), danach **Navigation neu**.
4. ✅ **i18n flächendeckend** (lässt sich gut mit Schritt 3 kombinieren, weil ohnehin jede Komponente angefasst wird).
6. ✅ **Große Upgrades:** Live2D-Stack/pixi v8, rusqlite, reqwest, TypeScript 7.

### ⚖️ 4. Architektur-Entscheidungen

| Frage | Status & Entscheidung |
|---|---|
| Schwere ML-Modelle (Kokoro, XTTS, Qwen3-TTS, RVC) | Whisper nativ via whisper.cpp; Kokoro 82M nativ via ONNX Runtime; übrige TTS-/RVC-Systeme über optionale, austauschbare HTTP-Sidecars. Damit bleibt die OtakuSoul-Kernlaufzeit schlank und Python-frei. |
| Embeddings | llama-server `/embedding` oder ONNX Runtime für semantischen Vektor-Search. |
| Chat-Speicherung | SQLite-Datenbank mit JSONL-Export/Import und automatischem Snapshot-Backup. |
| Wayland-Automation (Companion) | Portals und `ydotool`/`xdotool` mit Sicherheits-Countdown und Human-in-the-Loop Bestätigung. |
| Internationalisierung | Typsicheres Dreisprachen-System (`de`, `en`, `ru`) mit Direktumschaltung im Frontend. |
| Log-Persistenz | Ringpuffer im RAM + rotierendes File-Logging in `data_dir/logs/otakusoul.log`. |

---

### 📌 5. Meilenstein-Status

🎉 **Alle 18 Phasen der Roadmap sind vollständig implementiert, verifiziert und dokumentiert!**
OtakuSoul v0.1.0 ist als produktionsreifes Desktop- und Web-Ökosystem mit lokalem KI-Inferenz-Stack, Live2D/VRM-Rendering, Sprachausgabe, Soul Stage TTRPG-Engine, Companion-Agent und Multi-Language-Support fertiggestellt.

---

## 2. Verbesserungen

- [x] **Panic im Companion-Web-Fetch behoben.** Der Regex mit Rückreferenz `\1` wurde in Einzel-Alternativen aufgeteilt, alle Regexe
  sind per `LazyLock` vorkompiliert, die Logik steckt testbar in `html_to_text()`. Zusätzlich behoben: Die Vorschau schnitt
  Bytes statt Zeichen ab (`&text[..3000]`) und panicte bei Umlauten und Emoji. Derselbe Fehler steckte in `DiscordBotManager::split_message`.
- [x] **CSP aktiv, Asset-Scope eingeschränkt.** Strikte `csp` und `devCsp` ohne `unsafe-eval`. Der statische Scope ist leer, zur Laufzeit
  werden nur App-Daten-, Konfigurations- und gebündelte Asset-Verzeichnisse freigegeben (`allow_app_asset_dirs` in `lib.rs`).
  Über den Dialog gewählte Dateien gibt das Dialog-Plugin selbst frei.
- [x] **API-Keys im Schlüsselbund.** Neues Modul `secrets.rs` (`keyring` 4). Betroffen sind Cloud-Key, Voice-Keys (ElevenLabs, OpenAI,
  RVC, STT je Charakter), Discord-Bot-Token und der Key des Bildgenerators. Vorhandene Klartext-Keys werden beim ersten Laden migriert.
  Ohne Secret Service bleibt als Fallback die Datei, mit Warnung im Log.
- [x] **Mobiler Webserver abgesichert.** Der Token war vorher **auf jeder Installation identisch** (Xorshift mit festem Seed).
  Jetzt: 256-Bit-Token aus CSPRNG, vorhersagbare Alt-Tokens werden automatisch ersetzt, Vergleich in konstanter Zeit,
  der Client sendet den Token per Header und entfernt ihn aus der Adresszeile, dazu ein Warnhinweis in der UI bei LAN-Betrieb.
- [x] **Sicherheitslücke in `pixi-live2d-display` beseitigt.** Das Paket ist ersetzt, `npm audit` meldet 0 Lücken.
- [x] *Zusätzlich gefunden:* Das **Profil-Backup** sicherte weder Einstellungen noch Soul Memory (falsche Pfade und Dateinamen).
  Die Datenbank wird jetzt per `VACUUM INTO` konsistent gesichert und beim nächsten Start wiederhergestellt statt im laufenden Betrieb.
- [x] *Zusätzlich gefunden:* Ein fest eingetragener Pfad `/home/<user>/...` im Live2D-Viewer wurde entfernt.
- [x] Tauri 2.12 (npm und Cargo), plugin-dialog 2.8, plugin-opener 2.6.
- [x] **Live2D-Stack modernisiert:** `pixi-live2d-display` (tot, pixi 6) → **`untitled-pixi-live2d-engine` 1.4** mit **pixi.js 8.21**
  (Cubism 3–5). Cubism Core auf 5.1 aktualisiert (offizielle Live2D-Quelle). Die Core wird erst bei Bedarf im Viewer geladen statt blockierend
  im `<head>`, `live2d.min.js` (Cubism 2, ungenutzt) ist entfernt. Alle 7 mitgelieferten Modelle wurden getestet.
  *Zusätzlich behoben:* Live2D-Emotionen wurden nie angewendet, weil der Viewer `joy_animation` statt `joy` anforderte.
- [x] TypeScript 7.0 (Go-Compiler, etwa 10× schneller), `target` ES2022, `noUncheckedIndexedAccess` aktiv.
- [x] `@types/*` nach `devDependencies` verschoben, Vite-Template-Reste entfernt.
- [x] Crates: reqwest 0.13 (rustls), rusqlite 0.40, sysinfo 0.39, zip 8, tokio-tungstenite 0.30, rand 0.10, png 0.18, base64 0.23, sha2 0.11.
- [x] Doppelte `src-tauri/Cargo.lock` entfernt.
- [x] Rust-Edition **2024**, `rust-version = "1.88"`.
- [x] Vendorte Alt-Kopien in `assets/emotions/vrm/modules/` gelöscht (die FBX-Animationen bleiben).
- [x] `npm run check`: oxlint + `tsc` + Vitest + `cargo fmt --check` + `cargo clippy -- -D warnings` + `cargo test`. Clippy ist komplett warnungsfrei (vorher 50 Warnungen und 1 Fehler).
- [x] `cargo fmt` einmalig über das ganze Projekt, `cargo fmt --check` ist Teil von `npm run check`.
- [x] **Der Header läuft über.** → Erledigt: einklappbare Seitenleiste (`Sidebar.tsx`), der Header zeigt nur noch Branding, Status und globale Aktionen.
  *Ursprünglicher Befund:* Schon bei 1280 px brechen „Soul Hub“ und „Soul Stage“ zweizeilig um. Bei der Mindestbreite von 960 px
  sind *Einstellungen*, der Serverstatus und die Aktionsknöpfe nicht erreichbar. Beim Tab-Wechsel verschiebt sich außerdem der Inhalt,
  und das Logo wird abgeschnitten.
  → **Vorschlag:** schmale, einklappbare **Seitenleiste links** (Icon + Label, eingeklappt nur Icon + Tooltip) statt 8 Tabs oben.
  Der Header behält dann nur Branding, Status und globale Aktionen. Mindestens aber `whitespace-nowrap` setzen und
  unter ca. 1200 px auf reine Icons mit Tooltip umschalten.
- [x] **Navigation logisch gruppieren:** *Spielen* (Chat, Soul Stage, Companion) · *Bibliothek* (Charaktere, Lorebooks, Soul Hub) ·
  *System* (Integrationen, Einstellungen).
- [x] Die 8 fast identischen Tab-Buttons in eine `NAV_GROUPS`-Konfiguration mit `.map()` überführen.
- [x] Tastaturkürzel für die Navigation (`Strg+1…8`, `Strg+,` für Einstellungen).
- [x] **Befehlspalette** (`Strg+K` / `Cmd+K`): durchsuchbare Ansichten und globale Aktionen, Maus- und
  Pfeiltastensteuerung, Fokus-Trap sowie ein kompakter Einstieg im Header. Seitenleiste und Palette teilen sich dieselbe
  `NAV_GROUPS`-Konfiguration.
- [x] Das Status-Pill („Server gestoppt“) ist ein `<div onClick>`. → Echten `<button>` verwenden und einen klaren Handlungsaufruf anbieten („Server starten“).
- [x] **Hardware-Polling alle 2 s** startete jedes Mal `nvidia-smi` als Prozess. → Jetzt alle 10 s, pausiert bei verstecktem Fenster.
- [x] **i18n greift kaum.** → Erledigt: alle Komponenten übersetzt (de/en/ru, ~1.540 Schlüssel), Wörterbücher pro Sprache in
  `src/i18n/locales/`, typisiert gegen Deutsch als Referenz, mit Interpolation und Pluralformen (`Intl.PluralRules`).
  *Ursprünglicher Befund:* Nur 4 von 36 Komponenten nutzen `useTranslation` (Header, Settings, LogViewer, Updater).
  Wer in den Einstellungen *English* oder *Русский* wählt, sieht trotzdem fast alles auf Deutsch: Chat, Stage, Lorebooks, Hub,
  Companion, Modals, `confirm()`-Dialoge, Ladetexte (z. B. „Ansicht wird geladen…“ in `App.tsx`) und Rust-Fehlermeldungen.
  → Alle UI-Texte in Wörterbücher überführen. Das eine große `DICTIONARY`-Objekt in `src/i18n/index.ts` in JSON-Dateien pro Sprache
  und Bereich aufteilen, optional mit `i18next` / `react-i18next` (Pluralisierung, Interpolation, Fallback).
- [x] Einen Test ergänzen, der fehlende Übersetzungsschlüssel meldet (plus Platzhalter- und Pluraltests).
- [x] Rust-Fehler als Fehlercodes: `err!`-Makro (`modules/error.rs`) liefert `{"code","params"}`, `errorMessage()` übersetzt in die
  Oberflächensprache. Alle Module außer `companion_tools.rs` umgestellt (dessen Meldungen gehen als Werkzeug-Ergebnis an das
  Sprachmodell); ein Test prüft jeden Code gegen die drei Wörterbücher.
- [x] **Backend-Inhalte sind deutsch.** → Erledigt: Prompts (Chat, Stage-Spielleiter, Gedächtnis-Pipeline, Tagebuch,
  Charakter-Assistent, Companion) sind englisch und geben die Antwortsprache ausdrücklich vor. Erzähltexte, Vorschläge,
  Kampflog, Szenen-Standardwerte, Gedächtnis-Platzhalter, Discord- und Web-Antworten folgen der Antwortsprache
  (`modules/content_lang.rs`, De/En/Ru, sonst Englisch). Mitgelieferte Presets, Stimmungs-Labels und das Hardware-Profil
  übersetzt das Frontend über ID/Code (`tOptional`).
- [x] Die Oberfläche des mobilen Web-Clients (`web_server.rs`, eingebettetes HTML) ist noch deutsch. → Erledigt: Die Seite
  folgt der Browsersprache des Handys (De/En/Ru, sonst Englisch); das Stimmungs-Label kommt als Code.
- [x] `<html lang="de">` beim Sprachwechsel dynamisch setzen.
- [x] **Mehrsprachige Charakterkarten:** Übersetzungen liegen in `extensions.otakusoul_i18n` (die Karte bleibt gültiges V2).
  Die Bibliothek zeigt die Oberflächensprache, Prompt und Begrüßung nutzen die Antwortsprache, fehlende Felder fallen auf
  die Grundsprache zurück; importierte Karten ohne Übersetzung funktionieren unverändert. Die 13 mitgelieferten Karten
  haben Englisch und Russisch. `{{char}}`/`{{user}}` werden in der Bibliothek durch Namen ersetzt.
- [x] Übersetzungen einer Karte im Charakter-Editor bearbeiten (bisher nur in der JSON-Datei); Szenen, Lorebooks und
  Personas der Presets sind noch nur deutsch.
- [x] **Themes wirken nur teilweise.** → Erledigt: `@theme`-Tokens `accent`/`accent2`/`app`, fest verdrahtete Lila-Töne umgestellt
  (ein Rest von ~25 bewusst farbigen Stellen, z. B. Emotionen, bleibt).
  *Ursprünglicher Befund:* `App.css` definiert `--theme-accent`, es wird aber nur 6-mal verwendet, während im Code
  **777 Mal** `purple-/violet-/fuchsia-*` fest verdrahtet ist. Wählt man „Cyberpunk“ oder „Emerald“, bleiben Buttons, Tabs und Rahmen lila.
  → In Tailwind v4 per `@theme` semantische Tokens definieren (`--color-accent`, `--color-surface`, `--color-border`, `--color-muted` …)
  und die festen Farbklassen auf `bg-accent`, `text-accent` usw. umstellen.
- [x] **Wiederverwendbare UI-Bausteine** unter `src/components/ui/`: `Button` (primary/secondary/ghost/danger), `IconButton`,
  `Modal`/`Dialog`, `Tabs`, `Select`, `Toggle`, `Slider`, `EmptyState`, `Toast`, `ConfirmDialog`, `Tooltip`.
  Alle neuen Primitive sind typisiert, theme-fähig und barrierefrei getestet; `SettingsView` nutzt bereits gemeinsame `Button`- und
  `Tabs`-Komponenten. Bestehende Fachansichten können schrittweise migriert werden.
- [x] **Zu kleine Schrift:** 9/10 px sind komplett entfernt, 11 px nur noch für Badges (~135 Stellen). Ursprünglich 333 Stellen mit `text-[9px]`, `text-[10px]` oder `text-[11px]`. Auf HiDPI- und Linux-Systemen schwer lesbar.
  → Untergrenze 12 px (`text-xs`) für Text, 11 px höchstens für Badges.
- [x] Veraltete Tailwind-v3-Klassen modernisieren: `bg-gradient-to-*` → `bg-linear-to-*`, `flex-shrink-0` → `shrink-0`, `flex-grow` → `grow` (48 Stellen).
- [x] Emojis in UI-Texten und Wörterbüchern durch `lucide-react`-Icons bzw. klare Textkennzeichnungen ersetzt.
  Status, Gedanken, Tipps, Backup-Gruppen, Bewertungen, Warnungen und Pfeile rendern damit auf Linux, Windows und macOS konsistent.
- [x] **Heller Modus und System-Theme:** Separate Auswahl `System / Hell / Dunkel`, persistiert in den App-Einstellungen.
  `System` reagiert live auf `prefers-color-scheme`; alle fünf Akzent-Themes besitzen in beiden Modi lesbare Oberflächen und Auswahlzustände.
- [x] `body { select-none }` global verhindert, dass man Chat-Nachrichten, Logs oder Fehlermeldungen kopieren kann.
  → Nur auf Chrome-Elemente (Header, Buttons) beschränken, Inhaltsbereiche selektierbar machen.
- [x] **Modals sind nicht barrierefrei:** → `ModalOverlay` mit Fokus-Trap, Escape, Fokus-Rückgabe und Dialog-Stapel. 18 Overlays mit `fixed inset-0`, aber nur 1× `role="dialog"`, 2× Escape-Behandlung und kein Fokus-Trap.
  → Gemeinsame `Modal`-Komponente auf Basis von `<dialog>` oder Radix/Headless UI: Escape schließt, Fokus wird gefangen und
  zurückgegeben, `aria-modal`, Klick auf den Hintergrund konfigurierbar.
- [x] **Native `confirm()`/`alert()` ersetzen** (keine Vorkommen mehr; „Rückgängig“-Toast noch offen) (20 Stellen, z. B. `ChatView.tsx:496`, `ChatSidebar.tsx:253`, `SceneLobbyModal.tsx:141`)
  durch einen gestalteten `ConfirmDialog`. Das passt besser zum Look und lässt sich übersetzen. Bei destruktiven Aktionen zusätzlich **„Rückgängig“-Toast** statt Rückfrage.
- [x] **Globales Toast-/Benachrichtigungssystem** für Erfolg und Fehler, statt verstreuter Inline-Banner und `console.error`.
- [x] **Leere Zustände verbessern.**
  - *Chat* ohne Charakter zeigt eine leere dunkle Fläche. → Onboarding-Karte: „Charakter wählen / importieren / Server starten“.
  - *Charakterbibliothek* zeigt „Keine Charaktere gefunden – passe deine Suche an“, auch wenn gar keine Suche aktiv ist.
    → Zwischen „leer“ (mit großem CTA „Ersten Charakter erstellen / importieren“) und „keine Treffer“ unterscheiden.
- [x] **Ersteinrichtungs-Assistent** (`FirstRunWizard.tsx`, erscheint nur bei Neuinstallation; bestehende `settings.json` gelten als eingerichtet) (First-Run): Sprache → Modellquelle (lokales GGUF herunterladen oder Cloud-Key) → erster Charakter.
  Heute landet man auf einer leeren Chat-Ansicht mit dem Hinweis „Lokaler Server ist offline“.
- [x] Die Toolbar der Charakterbibliothek hat 6 gleich gewichtete Buttons. → Primäraktion hervorheben, den Rest in ein „Mehr“-Menü verschieben.
- [x] **Error Boundary** um jede lazy geladene Ansicht, damit ein Fehler in einer Ansicht nicht die ganze App weiß schaltet.
- [x] **Skelett-Loader statt reinem Text:** Gemeinsame, barrierefreie Skeletons für lazy Hauptansichten, Avatar-Chunks,
  Hub-Kartenraster, Chub-Details und Companion-Systemwerte; kompakte laufende Aktionen behalten ihre Spinner.
- [x] Nur 5 `aria-label` bei rund 377 Buttons (jetzt über 150, alle Icon-Buttons beschriftet), viele davon reine Icon-Buttons. → Jedem Icon-Button ein `aria-label` geben.
- [x] Sichtbare Fokus-Ringe (`focus-visible:ring-…`) einheitlich über die `Button`-Komponente. `outline-none` kommt 118-mal vor.
- [x] 11 `<img>` ohne `alt`.
- [x] Klickbare `<div>` (z. B. Logo und Status im Header) in `<button>` umwandeln. Karten mit eigenen Buttons nutzen `pressable()`,
  oxlint (`jsx-a11y`) meldet neue Fälle.
- [x] `prefers-reduced-motion` respektieren (Pulse-Animationen, Konfetti, Avatar-Idle).
- [x] `tauri-plugin-window-state` einbinden, damit Fenstergröße und -position gespeichert werden.
- [x] `tauri-plugin-single-instance`, um doppelte Starts (und doppelte llama-server-Prozesse) zu verhindern.
- [x] Fest eingetragene Pfade `/home/<user>/...` entfernt (Live2D, Stage, MCP). Mitgelieferte Ordner werden relativ zu
  Arbeitsverzeichnis, Programmordner und (Debug) Quellcode gesucht; Soul of Waifu wird automatisch gefunden
  (oder per `SOUL_OF_WAIFU_DIR`).
- [x] **Ressourcen im Paket:** `bundle.resources` liefert `presets/`, `assets/emotions/`, `assets/live2d/` und die VRMs
  *Anime Girl*/*Anime Man* mit; die App findet sie über Tauris Ressourcenordner. Weitere VRMs kommen als separates
  Avatar-Paket ins GitHub-Release (`tools/package_avatar_pack.sh`, prüft `lizenzen.txt`), GGUF-Modelle über den Modell-Hub.
- [x] llama.cpp wird nicht gebündelt, sondern in der App geladen (Einstellungen → llama-server): offizielle Builds des
  aktuellen *stabilen* Releases (`v0.5.0` → `b11146`), Varianten je System (CUDA/Vulkan/ROCm/CPU/Metal) mit Empfehlung
  nach GPU, SHA-256-Prüfung, Installation im Datenordner (`modules/llama_runtime.rs`).
- [x] Tray-Icon für den Companion (minimieren in den Tray statt beenden).
- [x] **Updater:** `tauri-plugin-updater` installiert signierte Updates direkt (AppImage, deb, rpm, NSIS/MSI, macOS) mit
  Fortschritt und Neustart; ohne signiertes Release bleibt der Link zur Release-Seite. Schlüssel lokal in `.tauri-signing/`
  (nicht versioniert), `build-linux-packages.sh` signiert und erzeugt `latest.json` (`tools/make_latest_json.py`).
- [x] **`useAppStore.ts` hatte 3.047 Zeilen.** → Aufgeteilt in 10 Slices unter `src/store/slices/` (app, avatar, llm, character,
  lorebook, memory, stage, companion, chat, ecosystem), gemeinsame Helfer in `helpers.ts`, Typen in `storeTypes.ts`.
  `useAppStore` bleibt der einzige Einstiegspunkt.
- [x] **Unnötige Re-Renders:** → Alle Komponenten abonnieren nur noch ihre Felder (`useStoreFields(...)` bzw. Selektoren).
  *Ursprünglich:* 29 Komponenten holen den ganzen Store (`const { … } = useAppStore()`), nur eine nutzt einen Selektor.
  Jeder Status-Poll (alle 2 s) rendert dadurch fast die gesamte App neu. → Selektoren mit `useShallow` verwenden.
- [x] Riesige Komponenten aufgeteilt: `SettingsView` → `settings/sections/`, `SoulHubView` → `hub/tabs/` (mit eigenem Hub-Store),
  `CompanionView` → `companion/tabs/`, `IntegrationsView` → `integrations/tabs/`, `CognitiveMemoryDrawer` → `chat/memory/`,
  `LorebookView` → Seitenleiste, Eintragskarte und Eintragsdialog. Keine Datei liegt mehr über 800 Zeilen.
- [x] Typen aus Rust: **ts-rs** (stabil; `tauri-specta` ist weiterhin nur RC) erzeugt 137 Typen nach `src/types/generated/`.
  49 identische Typen kommen direkt daher, `wireCheck.ts` vergleicht die Feldnamen der übrigen 59 mit Rust (tsc schlägt bei
  Abweichung fehl). `npm run check` baut Rust zuerst, damit tsc immer gegen aktuelle Typen prüft. Dabei gefunden: Download-
  Restzeit wurde nie gesendet (ergänzt), OpenRouter-/Sampler-Feldnamen stimmten nicht.
- [x] `any` ist vollständig beseitigt (35 → 0). Frontend-Warnungen und -Fehler (`console.warn/error`, unbehandelte Fehler
  und Promise-Ablehnungen) landen über `log_frontend` im Log-Viewer und in der Logdatei (gedrosselt, Ziel `frontend`).
- [x] `tsconfig`: `target`/`lib` von ES2020 auf ES2022+ anheben, `noUncheckedIndexedAccess` aktivieren.
- [x] Linter eingerichtet: **oxlint** mit React-Hooks-, `jsx-a11y`- und TypeScript-Regeln (typescript-eslint unterstützt TS 7 noch nicht).
  Oxlint läuft ohne Warnungen; unsichere `any`-Typen, Effekt-Abhängigkeiten und unnötige synchrone Effekt-Updates sind bereinigt.
  Prettier fehlt noch.
- [x] React 19: `useActionState` für die Formulare mit Speichern-/Fehlerzustand (Szene erstellen, Charakter-Editor); dabei gefunden,
  dass eine fehlgeschlagene Szenen-Erstellung stillschweigend nichts tat. `useOptimistic` bringt beim Chat nichts, weil der
  Store Nachrichten ohnehin sofort einfügt; `use()` passt nicht zum Store-basierten Laden.
- [x] Navigation ohne Router-Bibliothek: Bereichswechsel sind History-Einträge, „Zurück“/„Vorwärts“ per Maustasten 4/5 und
  Alt+←/→ (`useTabHistory`). Einzige URL-Nutzung ist das Overlay-Fenster (`?overlay=true`, jetzt über `URLSearchParams`);
  ein Router würde darüber hinaus nichts bringen.
- [x] 50 Clippy-Warnungen beheben (`map_or`, fehlende `Default`-Impls, `sort_by_key`, unnötige Klone …) und danach `-D warnings` in der CI erzwingen.
- [x] `unwrap()` im Rust-Code: 87 außerhalb von Tests (nicht 221). 62 Lock-`unwrap()` entfallen durch `parking_lot` (keine
  Lock-Vergiftung mehr nach einem Panic), 15 Regexe sind statisch, die übrigen sind durch Längenprüfungen abgesichert.
  Ein gemeinsamer `thiserror`-Fehlertyp ist durch die `err!`-Codes nicht mehr nötig.
- [x] `commands.rs` (1.760 Z., 180 Commands) nach Themen aufgeteilt: `src/commands/{app,llm,chat,lorebook,characters,memory,
  stage,companion,voice,avatar,hub,ecosystem}.rs`.
- [x] `stage.rs` (3.500 Z.) und `memory.rs` (2.500 Z.) modularisiert: `modules/stage/{models,plan,engine,dice,scenes,turn}.rs`
  und `modules/memory/{models,schema,soul,markdown,snapshots,chats}.rs`; öffentliche Pfade bleiben über Re-Exporte gleich.
- [x] Regexe per `std::sync::LazyLock` statt `Regex::new` pro Aufruf (dynamische Nutzer-Muster ausgenommen).
- [x] Logging: Alle `tracing`-Meldungen gehen jetzt auch in den Log-Viewer und die Logdatei (vorher kamen dort nur
  „Logdatei geleert“-Einträge an). Level per `RUST_LOG` (`env-filter`), Rotation bei 5 MB mit drei älteren Dateien.
- [x] Datenbank-Migrationen versioniert (`PRAGMA user_version`, `MIGRATIONS` in `memory.rs`, eine Transaktion pro Schritt).
  v1 hebt Datenbanken von vor der Versionierung verlustfrei an (an einer Kopie der echten Datenbank geprüft); Datenbanken
  einer neueren App-Version bleiben unangetastet.
- [x] E2E-Rauchtest mit WebdriverIO + `tauri-driver` (`npm run e2e`, `e2e/`): startet die Debug-Build mit Wegwerf-Profil
  (`OTAKUSOUL_HOME`, ohne Einzelinstanz-Sperre) gegen ein Mock-LLM, chattet bis zum Kontext-Überlauf und prüft
  Kontextanzeige, automatische Zusammenfassung (Seitenleiste und System-Prompt); Screenshots in `e2e/screenshots/`.
  Fand gleich einen Fehler: Die Charakterleiste (z-40) verdeckte die Tabs der Chat-Seitenleiste.
- [x] Rust: Tests für `companion_tools`, `web_server` (Auth) und `profile_backup` (Round-Trip inkl. Datenbank, Gruppenauswahl, Rotation) vorhanden.
  Der Stage-Test für Nachrichtenbearbeitung/-löschung nutzt einen injizierten No-op-Speicher und berührt kein echtes App-Datenverzeichnis mehr.
  *Ursprünglich:* Tests für `companion_tools` (Web-Fetch, Shell-Freigaben), `web_server` (Auth) und `profile_backup` (Round-Trip).
- [x] Laufzeiten in der App herunterladen (`modules/runtimes.rs`): llama.cpp, der PrismML-Fork für Ternary Bonsai
  (PQ2_0/PTQ1_0) und stable-diffusion.cpp (`sd-server`, ohne Python). Netzwerktest lädt und startet alle drei CPU-Builds.
- [x] Bildmodell-Katalog je VRAM-Stufe mit SHA-256 von Hugging Face, Download fortsetzbar und abbrechbar:
  Animagine XL 4.0 / Illustrious XL 0.1 (SDXL, ~7,5 GB), FLUX.1 dev Q5_K_S (~10 GB), Qwen-Image 2.1 Q4_K (~9,5 GB),
  FLUX.2 dev Q4_K_S (~21,5 GB; FP16 wären 64 GB, nicht 24).
- [x] VRAM-Planer (`local_image::plan`, getestet): parallel, Chat-Modell mit weniger GPU-Layern (Layer-Zahl aus dem
  GGUF-Header) oder tauschen (llama-server stoppen → Bild → sd-server stoppen → llama-server im Hintergrund mit gleichen
  Einstellungen neu starten). Die App verwaltet beide Server selbst; ComfyUI-Nodes wie „Release llama.cpp VRAM“ braucht es nicht.
- [x] Gestuftes Entladen: Vor jedem Bild wird geprüft, ob der VRAM reicht (gemessen per `nvidia-smi`, sonst geschätzt,
  inklusive geladenem Sprachmodell). Passt alles, bleibt alles geladen (typisch bei 24 GB); sonst macht zuerst das kleine
  Sprachmodell Platz und erst danach das Chat-Modell.
- [x] ~~Anbieter „Bonsai Image (PrismML)“~~ wieder entfernt (01.10.2026): existiert nur als Python-Server, und Python
  ist in der App ausgeschlossen. Gespeicherte Einstellungen werden auf „Lokal“ umgestellt.
- [x] Dabei behoben: Die Anbieter-Auswahl (`comfy_ui`, `dall_e_3`, …) passte nicht zu den Namen im Backend, alles lief
  über den A1111-Fallback. Die Galerie zeigt jetzt die Bilder statt Platzhaltern.
- [x] Chat und Stage: Das Kamera-Symbol im Chat und ein neuer Knopf in der Stage lassen das Chat-Modell (noch vor einem
  VRAM-Tausch) aus Charakter- bzw. Szenenbeschreibung und den letzten Nachrichten einen englischen Bild-Prompt schreiben
  (Tags für SDXL, Sätze für FLUX/Qwen/Bonsai; ohne laufendes LLM greift die Vorlage). Das Bild erscheint als Szenenbild-Karte
  über dem Chat bzw. wird Szenenhintergrund der Stage. Bilder bleiben bewusst außerhalb des Chatverlaufs, damit sie nicht
  ans LLM oder in die Gedächtnis-Pipeline gehen.
- [x] **GPU-Tests auf echter Hardware** (01.10.2026, RTX 4070 Ti SUPER 16 GB + Radeon 890M iGPU, sd.cpp Vulkan,
  Ternary Bonsai 27B PQ2_0 als Chat-Modell mit 16k Kontext ≈ 8,5 GB, Qwen3-TTS geladen; `src-tauri/tests/gpu_e2e.rs`):
- [x] Freier VRAM auch auf AMD/Intel: Grafikkarten werden zusätzlich über Vulkan erkannt (`ash`, Loader erst zur
  Laufzeit geladen) – Name, Hersteller, VRAM, freier Speicher (`VK_EXT_memory_budget`) und ob es eine iGPU ist.
  Geplant und festgelegt wird immer auf der größten dedizierten GPU; iGPUs nur, wenn es keine andere gibt.
   - [x] Fertigkeitswerte als Würfelbonus.
3. [x] **Kontext & Zusammenfassung für die Stage** (`stage/history.rs`): Planer, Erzähler und Gefährten nutzen
   `context_window` (lokal echte Tokenzählung, Cloud-Schätzung samt Antwortreserve). Ältere Beiträge werden in
   laufende, im Spielstand gespeicherte Zusammenfassungen gefaltet, getrennt nach Publikum: Gedanken nur für den
   Planer, Flüstern nur für Planer/Empfänger. Der Originalverlauf bleibt vollständig; Bearbeiten, Löschen und
   Neugenerieren verwerfen Zusammenfassungen, Undo stellt sie wieder her. Fehlgeschlagene Zusammenfassungen
   werden erneut versucht. E2E-Test mit 45 Beiträgen prüft Budget, Geheimhaltung, Wiederladen und Änderungen.
4. [x] **NPC-System** (`stage/npc.rs`): Der Planer lässt NPCs erscheinen, sprechen und die Szene verlassen; manuelles
   Anlegen/Bearbeiten und Zurückholen über „NPCs“. Acht mitgelieferte Archetyp-Avatare, Auswahl als Sprecher und
   Flüsterziel. Szenengebundenes Gedächtnis (bis zu 200 beobachtete Beiträge, Abruf der fünf passendsten nach
   Textrelevanz); Erinnerungen bleiben bei Abwesenheit und Wiederladen erhalten. Fremde Geheimnisse und Ereignisse
   während der Abwesenheit bleiben verborgen, auch nach der Beförderung. „Zum Charakter befördern“ erstellt eine
   V2-PNG-Karte mit Avatar, überträgt Erinnerungen ins Soul Memory und ergänzt die Party; vorhandene Karten werden
   nicht überschrieben. Rust- und Desktop-Tests prüfen Rückkehr, Relevanz, Geheimhaltung, Speicherung und Beförderung,
   Screenshots auch bei 960×640.
5. [x] **Szenen-Editor vollständig:** Bearbeiten über die Szenen-Lobby, auch bei Presets (eigene Kopie).
   Verlauf, Welt, NPC-Gedächtnis und Spielwerte bleiben erhalten. Startbild mit Vorschau, Import eigener Bilder und
   MP3/WAV/OGG-Dateien, Hintergrundsperre und Ambient-Schalter, Lorebook-Auswahl und 1–6 Akteure pro Runde.
   Fehlende Charakter-/Lorebook-Bindungen bleiben erhalten; Startort, Startzeit, Eröffnung und Startbild gelten beim
   Neustart. Dynamische Hintergründe überschreiben das Startbild nicht mehr. Ambient-Wiedergabe folgt in Punkt 7.
   Rust-, Frontend- und Desktop-Tests prüfen Fortschritt, Speicherung, Neustart, Lore und Akteur-Grenze;
   Screenshots auch bei 960×640.
6. [x] **Regie & Ablauf** (`stage/director.rs`): Direkte Ansprache per Name („Ayu, …“, „Hey Sora“, „@Shiro“, „…, Sora?“)
   lässt die Figur zuerst antworten, auch zwischen Figuren; bloße Erwähnungen zählen nicht. Nach jedem Beitrag entscheidet
   ein kurzer Routing-Aufruf (Regeln aus SoW: Ansprache, offene Frage, Reaktion, kein Pingpong, faire Redezeit), wer aus
   Party und anwesenden NPCs reagiert oder ob der Spieler dran ist; ohne Kandidaten kein Aufruf, bei unbrauchbarer Antwort
   die alte Reihenfolge. „Weiter“ setzt den Plot ohne eigene Aktion fort, Auto-Play spielt bis zu 5 Runden selbst
   (Stopp, eigene Eingabe oder Ausschalten beendet es). Test: `e2e/stage-director.mjs`.
7. [x] **Stimme & Atmosphäre:** Vorlesen mit den Stimmen der App statt Browser-TTS – Gefährten mit ihrer Charakterstimme,
   Spielleiter und NPCs mit einer eigenen, einstellbaren Erzählerstimme (`services/stageVoice.ts`, Stimmen-Dialog für
   beliebige Ziele); Schalter „Vorlesen“ liest neue Beiträge der Reihe nach vor, Auto-Play wartet darauf. Ambient-Ton der
   Szene läuft in Schleife (`get_stage_ambient_audio`, `current_ambient`), der Planer wechselt ihn aus den vorhandenen
   Dateien, „Atmosphäre“ und Stummschalten schalten ihn; ohne Datei bleibt das synthetische Lagerfeuer.
   Test: `e2e/stage-voice.mjs` (Stimme je Sprecher, Ambient-Wechsel, Stummschalten).
8. [x] **Gedächtnis & Welt:**
   - [x] Weltzustand vollständig bearbeitbar (`StageWorldEditor.tsx`: Fakten, Story-Arcs inkl. verborgener mit
     Spoiler-Schalter, Ziele, Beziehungen, Inventar), Chronik-Einträge löschbar, Übersetzung von Stage-Nachrichten.
     Dabei behoben: Fakten und Chronik erreichten den Planer nie; jetzt stehen sie im Planer-Kontext, und der Planer
     pflegt Fakten per `fact_updates` (`stage/world.rs`). Test: `e2e/stage-world.mjs`.
   - [x] Story-Arcs beim Auflösen archivieren: abgeschlossene Arcs (Planer oder Editor) fasst das Modell am Rundenende
     zusammen (`arc_archive`, ohne Antwort die Beschreibung); der Planer sieht nur offene Arcs plus Archiv, die Kampagne
     zeigt die Zusammenfassung. Konsistenzprüfung alle 8 Runden: entfernt veraltete Fakten und korrigiert widersprochene,
     erfindet keine neuen. Beides entfällt nach „Stopp“. Test: `e2e/stage-memory.mjs`.
   - [x] Charakter-Overlays (Rolle, Arc-Stand, Fakten je Figur; nur im Prompt der Figur) und Lorekarten mit Zielgruppe:
     „Gruppe“ erreicht Gefährten und Erzähler bei passendem Stichwort, „Nur Spielleiter“ bleibt im Planer-Kontext.
     Der Planer pflegt beides (`overlay_updates`, `lore_card_updates`), der Weltzustand-Editor ebenso.
   - [x] Szenen-Erlebnisse ins Soul Memory der Party: alle 10 neuen Zeilen läuft die gefilterte Sicht jedes
     Mitglieds (ohne fremdes Flüstern, ohne Gedanken anderer) im Hintergrund durch die Gedächtnis-Pipeline
     (`take_memory_sync_batches`, `transcript` in `SoulMemoryPipelineRequest`). Test: `e2e/stage-memory.mjs`.
- [x] Hardware-Probe für AMD und Intel (Linux und Windows über Vulkan, siehe Bildgenerierung).
- [x] Kontextfenster-Management (`modules/context_window.rs`): Vor jeder Chat-Anfrage werden die ältesten Nachrichten
  weggelassen, bis Verlauf + Antwortreserve (`max_tokens`, höchstens halber Kontext) hineinpassen; System-Prompt,
  Author's Note und die letzte Nachricht bleiben immer drin. Lokal exakt über `/props` (echte Kontextgröße) und
  `/tokenize` (pro Nachricht gecacht, 200 Nachrichten in ~30 ms), Cloud geschätzt mit einstellbarer Kontextgröße
  (Standard 32k, begrenzt auch die Kosten). Anzeige unter dem Eingabefeld: belegter Kontext und weggelassene Nachrichten.
- [x] Automatische Zusammenfassung (`modules/chat_summary.rs`): Sobald mindestens 6 Nachrichten aus dem Kontext gefallen
  sind, faltet das Chat-Modell sie im Hintergrund in eine laufende Zusammenfassung pro Chat (Abschnitte von höchstens
  halbem Kontext, Fortschritt nach jedem Abschnitt gespeichert). Sie steht als „Story So Far“ im System-Prompt und ist
  in der Chat-Seitenleiste (Tab Author's Note) editier- und zurücksetzbar. Getestet mit Gemma 12B: Versprechen,
  Geheimnisse und Verabredungen bleiben erhalten.
- [x] System-Prompt-Editor (Einstellungen → Prompt): Rolle, Stilregeln und Nachspann (nach dem Verlauf) bearbeitbar,
  Vorlagen Rollenspiel/Erzähler/Companion, Vorschau für den aktiven Charakter. Dabei behoben: `system_prompt` und
  `post_history_instructions` aus V2-Karten wurden eingelesen, aber nie verwendet; jetzt ersetzen sie Rolle bzw.
  Nachspann, `{{original}}` bindet die Vorlage ein.
- [x] Datei-Anhänge im Chat (Büroklammer oder Bild einfügen, bis zu 6 pro Nachricht; `modules/attachments.rs`): Bilder
  (auf 1568 px verkleinert) gehen als Bild-Blöcke an Vision-Modelle (OpenAI-Format/llama-server, Anthropic), Text- und
  PDF-Dateien als Text (bis 30.000 Zeichen). Nur die letzten drei Nachrichten mit Bildern schicken die Bilder mit,
  ältere werden zu einem Hinweis. Lokal sieht das Modell Bilder nur mit gewählter `mmproj`-Datei (Einstellungen →
  llama-server, `--mmproj`); `mmproj`-Dateien erscheinen nicht mehr fälschlich als startbare Modelle.
  Ablage unter `attachments/<chat>/`, wird mit dem Chat gelöscht. Rauchtest prüft Bild und Textdatei.
- [x] Übersetzung einzelner Nachrichten (Knopf an der Nachricht, `modules/translate.rs`): übersetzt mit dem gewählten
  Chat-Modell in die App-Sprache, Sternchen-Aktionen und Rede bleiben erhalten; kein externer Übersetzungsdienst.
  Die Übersetzung erscheint unter dem Original und wird für die Sitzung zwischengespeichert. Dabei: Der Chat bleibt am
  Ende, wenn eine Nachricht wächst (Übersetzung, nachladendes Bild), sofern man dort stand.
- [x] Migrationsimport aus einer bestehenden Soul-of-Waifu-Installation.
- [x] Lange Chats virtualisiert (`@tanstack/react-virtual`, `chat/MessageList.tsx`); Eingabefeld (`ChatComposer`) und
  Verlauf sind getrennt und memoisiert, Tippen und Streaming rendern den Verlauf nicht mehr neu. Gemessen mit
  `npm run e2e:perf` (1000 Nachrichten): Öffnen 2,5 s → 0,4–0,75 s, pro Tastendruck 43 ms → ≤ 3 ms,
  DOM-Knoten 37.400 → 850.
1. [x] **Gestreamte Ausgabe:** Erzähler- und Gefährtentext erscheinen live (Event `stage-stream`, `InferenceClient::stream_text`)
   statt erst am Rundenende; die eigene Eingabe steht sofort im Verlauf; „Stopp“ beendet die Runde nach dem aktuellen Text
   und überspringt weitere Sprecher. Rauchtest prüft den Live-Text.
2. [x] **Flüstern wirklich privat** (`stage/party.rs`): Nur der Empfänger erfährt den Inhalt (auch später als
   Privatwissen im Prompt) und antwortet als Erster; Erzähler und andere sehen nur „flüstert etwas“, Gedanken kennt nur der
   Spielleiter. Ziel ist eine Auswahl aus der Party statt Freitext. **Echte Spielerwerte:** Spieler und Gefährten haben
   dauerhaft HP, Stress und Zustände (mit Dauer in Zügen), auch ohne Kampf; der Planer bekommt sie und ändert sie per
   `resource_delta`/`condition_updates`; Kämpfe fügen nur Gegner hinzu. Die Platzhalter im Party-HUD sind weg.
   Rauchtest prüft Geheimhaltung, HP und Zustand.

### Ergänzungen aus der Verbesserungs-Roadmap

**Gesamtbild (Ausgangslage):** Funktional ist das Projekt weit. `tsc` läuft sauber, 63 Vitest- sowie 104 aktive Cargo-Tests sind grün
(zwei weitere Cargo-Tests benötigen Netzwerk bzw. lokale Modelldateien und bleiben standardmäßig ignoriert).
Die Schwächen liegen vor allem hier:

1. **Ein echter Laufzeit-Bug:** Das Web-Fetch-Tool des Companions stürzt ab.
2. **Veraltete Abhängigkeiten:** Einige Pakete sind hinterher, das Live2D-Paket ist ein Blocker mit Sicherheitslücke.
3. **Uneinheitliche Oberfläche:** i18n greift kaum, Themes wirken nur teilweise, es gibt keine Barrierefreiheit, der Header läuft über.

---

#### Tests

- [x] Frontend-Abdeckung ausbauen: Store-Tests mit API-Mock (`src/test/mockApi.ts`) und Komponenten-Tests mit Testing
  Library/jsdom für UI-Primitive, Dialoge, Einrichtungsassistent, Chat (Generierung, Stream, Sitzungen, Bearbeiten),
  Memory, Stage (`stageTurns`: Runden, Flüstern, Vorlesen, Auto-Play; `stageWorldEditor`) und Charakter-Editor –
  220 Tests in 38 Suites. Dabei behoben: Speicherfehler der Stage gingen verloren (Weltzustand-Editor meldete
  „gespeichert“ und verwarf den Entwurf); Feldbeschriftungen im Charakter-Editor sind jetzt mit den Feldern verknüpft.

---

#### 🖼️ Lokale Bildgenerierung (offline, mit VRAM-Handling)

  | Modell | Zeit (Tausch) | VRAM nur Bild (gemessen) | Modus „Chat verkleinern“ |
  |---|---|---|---|
  | Animagine XL 4.0 (SDXL) | 28 s | ~7,6 GB | 44 GPU-Layer, 31 s |
  | FLUX.1 dev Q5_K_S | 48 s | ~9 GB | 26 GPU-Layer |
  | Qwen-Image 2.1 Q4_K (`--offload-to-cpu`) | 73 s | ~5,6 GB (Schätzung 9,5 → 7 GB) | parallel, 72 s |
  | FLUX.2 dev Q4_K_S | 248 s | ~14,4 GB (mit Auslagerung) | Tausch (passt nicht) |

  Der Chat antwortet nach jedem Bild 1–4 s nach dem Neustart; FLUX.2 entlädt gestuft erst das Sprachmodell, dann
  das Chat-Modell; bei SDXL bleibt das Sprachmodell geladen. Die Bilder wurden gesichtet.

  **Gefundener und behobener Fehler:** Mit zwei GPUs verteilen sd.cpp und llama.cpp (Vulkan) nach freiem Speicher –
  die iGPU meldet 52 GB geteilten RAM und bekam FLUX.1 ab (350 s statt 48 s). `sd-server` bekommt jetzt per
  `--backend` und `llama-server` per `--device` die größte dedizierte GPU, wenn mehr als ein Gerät gelistet ist.

- [x] Anime-LoRAs und SD-1.5-Stufe (`image_loras.rs`, `LocalLoraSettings.tsx`): Katalog mit SHA-256 (SDXL: Anime
  Detailer, Style Enhancer, Pastel Anime; FLUX.1: GHIBSKY, nicht-kommerziell) plus eigene Dateien in `loras/`, Auswahl
  mit Stärke je Modellfamilie, Auslösewörter automatisch. Counterfeit V3.0 (SD 1.5, 2,1 GB) als 4-GB-Stufe.
  Auf RTX 4070 Ti SUPER getestet (`gpu_e2e loras`): SD 1.5 in 15 s, alle LoRA-Tensoren angewendet, fremde Familie
  wird nicht mitgeschickt. Gefunden: `sd-server` ignoriert `<lora:…>` im Prompt und kennt neue Dateien erst nach
  `GET /sdapi/v1/loras`; XLabs' FLUX-Anime-LoRA wirkt im Original gar nicht und konvertiert verwaschen (nicht im
  Katalog). Pony V6 bleibt draußen (nur über Civitai mit Login).

---

#### 🎲 Stage: Modulare TTRPG-Bühne

Die Stage verbindet die Stärken lokaler Bildgenerierung, Lorebook-Engine, Kampf-Tracker mit Stress und Zuständen,
Tabs Abenteuer/Taktik/Kampagne sowie JSON/MD-Export mit interaktiven TTRPG-Mechaniken.

---

#### ✨ P3 – Nice-to-have

- [x] E2E-Isolation: Mit `OTAKUSOUL_HOME` bekommt das Hauptfenster (in `lib.rs` erzeugt, `create: false`) einen
  eigenen Webview-Datenordner `<home>/webview`; `localStorage` wird nicht mehr zwischen Testläufen und mit der echten
  App geteilt. Der Harness prüft das bei jedem Start per Marker (macOS: WKWebView ignoriert den Ordner).

- [x] Bundle-Analyse (`npm run analyze` → `target/bundle-stats.html`): Der Start-Chunk enthielt alle drei Sprachen
  (~450 kB Rohtext). Englisch und Russisch laden jetzt bei Bedarf (`i18n/registry.ts`), Deutsch bleibt als Rückfall:
  Start-Chunk 552 → 247 kB (gzip 160 → 74 kB). `chunkSizeWarningLimit: 800` bleibt begründet für den nur bei
  sichtbarem Avatar geladenen three.js-Chunk (nicht weiter teilbar).

---

## 3. Sprachausgabe (TTS)

Ziel: Lokale, mehrsprachige Sprachausgabe (Deutsch, Englisch, Russisch …) ohne Python, mit optionalem Stimmklonen
aus einer eigenen Aufnahme. Grundlage ist die Recherche vom 30.09.2026.

**Veröffentlichung:** Das Repository wird öffentlich. Deshalb gilt:

- Standardmodelle haben freie Lizenzen (Apache-2.0/MIT) und dürfen auch kommerziell genutzt werden.
- Modelle mit Einschränkungen (z. B. F5-TTS, CC-BY-NC-4.0) sind **aus**, bis man sie in den Einstellungen ausdrücklich
  freischaltet, und tragen überall einen Hinweis „nur nicht-kommerziell“.
- Die App liefert keine Modelle mit, sondern lädt sie von den Originalquellen; die Lizenz steht in der Oberfläche.
- Stimmklonen nur mit Einwilligungsbestätigung; erzeugtes Audio wird gekennzeichnet (EU AI Act, Art. 50).

### Ist-Zustand

- Edge-TTS (online), Kokoro (lokal, ONNX in Rust, nur Englisch), ElevenLabs, OpenAI, RVC-Anschluss.
- Spracherkennung lokal mit Whisper (`whisper-rs`).
- Stimmklonen nur über ElevenLabs bzw. RVC.

### Reihenfolge

1. [x] **Laufzeit CrispASR** (MIT, C++/ggml, keine Python-Abhängigkeit) als vierte Laufzeitart in `modules/runtimes.rs`:
   Download des passenden Builds (Linux CUDA/Vulkan/HIP/CPU, Windows CUDA/Vulkan/CPU, macOS), SHA-256-Prüfung,
   Karte in den Spracheinstellungen. *(Download und Start aller vier CPU-Builds im Netzwerktest geprüft; die
   Download-Logik für Modelle ist jetzt gemeinsam in `modules/model_files.rs`, mit Test für Fortsetzen/Prüfsumme/Abbruch.)*
2. [x] **TTS-Modellkatalog** mit fortsetzbarem, geprüftem Download (gemeinsame Download-Logik mit den Bildmodellen):
   - Qwen3-TTS 0.6B Base (Apache-2.0, ~1 GB + Codec): Standard, 10 Sprachen, Stimmklonen aus WAV + Transkript.
   - Chatterbox Multilingual (MIT, ~0,9 GB): 23 Sprachen, eingebaute Stimme (Klonen braucht bisher ein Python-Skript).
   - Kokoro mit deutschem Modell (Apache-2.0): klein und schnell, feste Stimmen.
   - F5-TTS v1 (Gewichte CC-BY-NC-4.0): nur nach Freischaltung, mit Hinweis.
3. [x] **Lokaler TTS-Server:** `crispasr --server` wird von der App gestartet/gestoppt (wie `sd-server`),
   neue Engine „Lokal (CrispASR)“ in der Sprachausgabe über `POST /v1/audio/speech` (Sprache aus der Antwortsprache).
4. [x] **Stimmklonen pro Charakter:** Aufnahme hochladen oder aufnehmen (5–15 s), Transkript automatisch per Whisper,
   Pflicht-Häkchen „Ich habe die Rechte/Einwilligung“, Speicherung unter `voices/` im Datenordner, Auswahl im
   Stimmen-Dialog des Charakters. Die Einwilligung wird als `consent_attestation` mitgeschickt.
5. [x] **Kennzeichnung:** CrispASR setzt Wasserzeichen/C2PA; im UI ein Hinweis, dass Audio KI-generiert ist.
6. [x] **Freischaltung eingeschränkter Modelle:** Schalter „Nicht-kommerzielle Modelle erlauben“ (Standard: aus),
   Lizenzhinweis im Katalog, README-Abschnitt zu Modell-Lizenzen.
   *Umsetzung:* `modules/tts_local.rs` (Katalog, `crispasr --server` auf Port 48598, Synthese, geklonte Stimmen unter
   `voices/<id>.wav|.txt|.json`), Oberfläche `components/voice/LocalTtsSettings.tsx` im Stimmen-Dialog. Chatterbox
   läuft vorerst nur mit eingebauter Stimme; Kokoro-DE bringt vier deutsche Stimmen mit. Aufnahmen werden mit 16 kHz
   gespeichert (so liefert die vorhandene Aufnahmefunktion).
5a. [x] Gesprochener KI-Hinweis vor geklonten Stimmen ist einstellbar (Standard an); das Wasserzeichen bleibt immer an.
7. [x] **VRAM:** TTS-Modelle im VRAM-Planer berücksichtigen (klein, meist parallel zum Chat-Modell).
   *Umgesetzt:* Der Bild-Planer rechnet ein geladenes Sprachmodell mit ein (gemessen oder geschätzt) und entlädt gestuft:
   nichts, wenn alles passt; sonst zuerst `crispasr` (startet beim nächsten Satz neu), erst danach das Chat-Modell.
8. [x] **Tests auf echter Hardware** (01.10.2026, RTX 4070 Ti SUPER 16 GB, CUDA 13; `src-tauri/tests/gpu_e2e.rs`,
   Verständlichkeit per Whisper-Rückerkennung):

   | Modell | Stimme | DE | RU | EN | RTF (warm) | VRAM |
   |---|---|---|---|---|---|---|
   | Qwen3-TTS 0.6B CustomVoice | Vivian/Ryan | 100 % | 90 % | 100 % | 0,12–0,13 | +2,3–3,2 GB |
   | Qwen3-TTS 1.7B Base | Klon (16-kHz-Aufnahme) | 100 % | 100 % | 100 % | 0,15 | +3,3–3,6 GB |
   | Chatterbox Multilingual | Standard | 92 % | 70 % | – | 0,3–0,55 | +1,8–2,3 GB |
   | Kokoro DE | Victoria/Bernd/Eva | 77 % | – | – | 0,06–0,23 | +1,0–1,8 GB |
   | F5-TTS v1 | Klon | – | – | 100 % | ~55 (!) | +3 GB |

   **Gefundene und behobene Fehler:**
   - Linux-CUDA-Builds (CrispASR, PrismML) bringen keine CUDA-Laufzeit mit und fallen ohne passende
     `libcudart` still auf die CPU zurück. Die App empfiehlt CUDA jetzt nur, wenn die CUDA-Hauptversion im System
     vorhanden ist (`ldconfig`), sonst Vulkan.
   - Das GGUF von Qwen3-TTS 0.6B **Base** hat keine Sprachtabelle: alles außer Englisch wurde Kauderwelsch bzw. lief
     62 s weiter. Ersetzt durch 0.6B **CustomVoice** (9 eingebaute Stimmen) und 1.7B Base (Klonen); alte Einstellungen
     werden umgeleitet.
   - Der Server akzeptiert Stimmen nur als Namen, keine Pfade; Kokoro sucht sie zudem im Arbeitsverzeichnis →
     `crispasr` läuft im Stimmen-Ordner, Voice-Packs werden dorthin kopiert.
   - Kokoros deutsches Grundmodell wird nur unter dem f16-Dateinamen erkannt (vorher englisches Modell mit deutscher
     Stimme).
   - Qwen3-TTS verlangt 24-kHz-Referenzen; Klone wurden mit 16 kHz gespeichert → Backend rechnet auf 24 kHz um,
     Aufnahme/Upload liefern 24 kHz.
   - Abschalten des gesprochenen KI-Hinweises braucht `--accept-marking-responsibility` und pro Anfrage eine
     `marking_attestation`; Stimmen realer Sprecher (Kokoro Eva/Bernd) behalten ihn.

Weitere Ideen (Streaming, VoiceDesign, Chatterbox-Klonen, STT über CrispASR) stehen in `roadmap.md`.

### Quellen

- F5-TTS: https://github.com/SWivid/F5-TTS (Code MIT, Gewichte CC-BY-NC-4.0)
- CrispASR: https://github.com/CrispStrobe/CrispASR (MIT; TTS-Doku `docs/tts.md`, Server `docs/server.md`)
- Qwen3-TTS GGUF: https://huggingface.co/cstr/qwen3-tts-0.6b-base-GGUF (Apache-2.0)
- Chatterbox GGUF: https://huggingface.co/cstr/chatterbox-GGUF (MIT)
- EU AI Act, Kennzeichnung: CrispASR `docs/eu-ai-act.md`

---

## 4. Neutrale Modul-Architektur & SoW-Entkopplung

> Stand: Oktober 2026  
> **Kernprinzip: Maximale Neutralität & Entkopplung (White-Label-Ready)**  
> OtakuSoul wird vollständig von *Soul of Waifu (SoW)* entkoppelt und der veraltete SoW-Import wird gestrichen. Gleichzeitig erhalten alle Kernmodule **neutrale, funktionale Namen** (ohne feste Markenvorsätze wie „Soul“ oder „Otaku“). Der Anwendungsname und die Logos werden zentralisiert, sodass ein späterer Rebrand jederzeit mit minimalem Aufwand (1 Konstante + Logos) möglich ist.

---

### 🎯 1. Das neutrale Namensschema

Statt Markenpräfixe tief im Code zu verankern, benennen wir Subsysteme rein nach ihrer Funktion. In der Benutzeroberfläche werden sie als eigenständige Bereiche präsentiert:

| Bisheriger Begriff | Neuer neutraler Begriff | UI-Bezeichnung (DE) | Zweck / Modulbereich |
|---|---|---|---|
| **Soul Stage** | **Stage** (bzw. *Adventure Stage*) | **Stage** (oder *Abenteuer*) | TTRPG-Engine & KI-Spielleiter |
| **Soul Memory** | **Cognitive Memory** (bzw. *Memory*) | **Kognitives Gedächtnis** | 4 kognitive Schichten & SQLite-Pipeline |
| **Soul Companion** | **Companion** | **Companion** (oder *Desktop-Agent*) | Autonomes Desktop-Overlay & MCP |
| **Soul Hub** | **Community Hub** (oder *Hub*) | **Hub** | Chub AI, Szenarien, Lorebooks |
| **Soul Gateway** | **Character Gateway** (oder *Gateway*) | **Kuratierte Charaktere** | Kuratierte Karten-Kollektion |
| **`sow_*` Extensions** | **`custom_*`** oder **`app_*`** | Metadaten | `custom_title`, `custom_vrm`, `custom_live2d` |
| **App-Titel & Logos** | `APP_NAME` Konstante | Dynamisch | Zentrale Konfigurationsstelle |

---

### 🧭 Übersicht der Phasen

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        NEUTRALE REFAKTORISIERUNGS-ROADMAP                              │
└───────┬───────────────────┬────────────────────┬───────────────────┬───────────────────┘
        │                   │                    │                   │
        ▼                   ▼                    ▼                   ▼
   [Phase 1]           [Phase 2]            [Phase 3]           [Phase 4]           [Phase 5]
   SoW-Import &        Neutrale Karten-     Zentrales Branding  Neutrale Code-      Doku, Hygiene
   Altlasten tilgen    Metadaten            & UI (i18n)         Prompts & Mocks     & Verifikation
```

---

### 📌 Phase 1: Vollständige Entfernung des SoW-Imports & der Altlasten
> **Ziel:** Da das Modell- und Datensystem stark erweitert wird, wird die alte SoW-Importlogik ersatzlos entfernt. Kein toter Code, keine alten Pfad-Scanner.

- [x] **1.1 Backend: Rust-Commands & Suchroutinen entfernen**
  - [x] Rust-Command `import_sow_memory_files` in `src-tauri/src/commands/memory.rs` und `src-tauri/src/modules/memory/` löschen.
  - [x] Rust-Command `import_sow_live2d_models` in `src-tauri/src/commands/live2d.rs` löschen.
  - [x] Hilfsfunktionen `find_sow_live2d_dir()` und `sow_live2d_in_parents()` in `src-tauri/src/modules/live2d.rs` entfernen (inklusive Unit-Tests).
  - [x] Command-Registrierungen in `src-tauri/src/lib.rs` bereinigen.
- [x] **1.2 Frontend: API-Wrapper & Store-Aktionen bereinigen**
  - [x] `api.importSowMemoryFiles` und `api.importSowLive2dModels` in `src/services/api.ts` entfernen.
  - [x] Store-Aktion `importSowFolder` in `src/store/slices/memorySlice.ts` entfernen.
- [x] **1.3 UI-Komponenten bereinigen**
  - [x] `MemoryBackupsTab.tsx`: Bereich „Import aus Soul of Waifu“ (Card, Dialog, Handler `handleImportSow`) vollständig entfernen.
  - [x] `GeneralSettings.tsx`: Bereich „Migration (Soul of Waifu)“ und Button „Import aus Soul of Waifu (Live2D)“ entfernen.
- [x] **1.4 Lokalisierung (i18n) & Tests bereinigen**
  - [x] Veraltete Übersetzungsschlüssel aus `src/i18n/locales/{de,en,ru}.ts` löschen:
    - `settings.importSowLive2d`, `settings.importSowLive2dHint`, `settings.sowLive2dImported`
    - `memory.sowTitle`, `memory.sowText`, `memory.sowPick`, `memory.sowDialogTitle`, `memory.sowImported`
    - `backend.live2d.sowRead`, `backend.live2d.sowMissing`
    - `memory.tabBackups`: Beschriftung neutralisieren („Snapshots & Backups“).
  - [x] Unit-Tests in `src/test/` bereinigen (Mock-Aufrufe von `importSowFolder` entfernen).

---

### 📌 Phase 2: Neutrale Charakterkarten-Metadaten (`sow_*` → `custom_*`)
> **Ziel:** V2-Karten-Extensions werden markenneutral benannt. Bestehende Karten werden beim Lesen tolerant toleriert, beim Speichern wird nur noch der neutrale Standard geschrieben.

- [x] **2.1 Typsystem aktualisieren (`src/types/index.ts`)**
  - [x] `CharacterCardV2Data.extensions`:
    - `custom_title?: string` (Fallback beim Lesen: `sow_title`)
    - `custom_vrm?: string` (Fallback beim Lesen: `sow_vrm`)
    - `custom_live2d?: string` (Fallback beim Lesen: `sow_live2d`)
    - `custom_avatar?: string` (Fallback beim Lesen: `sow_avatar`)
    - `custom_expressions?: Record<string, string>` (Fallback beim Lesen: `sow_expressions`)
    - `custom_i18n?: { ... }` (Fallback beim Lesen: `sow_i18n`)
- [x] **2.2 Charakter-Editor anpassen (`CharacterEditorModal.tsx` & `CharacterTranslationsTab.tsx`)**
  - [x] Tolerante Lese-Logik: `card.data.extensions?.custom_title || card.data.extensions?.sow_title`.
  - [x] Saubere Schreib-Logik: Beim Speichern nur noch `custom_*` setzen und Altlast-Schlüssel bereinigen.
  - [x] Feldname im Übersetzungs-Tab von `sow_title` auf `custom_title` umstellen.
- [x] **2.3 Rendering-Komponenten anpassen**
  - [x] `CharacterLibraryView.tsx`: Titelauflösung auf `custom_title` umstellen.
  - [x] `AdaptiveHud.tsx`: Titelauflösung auf `custom_title` umstellen.
  - [x] `AvatarCanvas.tsx`: VRM- und Live2D-Pfadauflösung auf `custom_vrm` / `custom_live2d` umstellen.
- [x] **2.4 Rust-Export anpassen (`src-tauri/src/modules/characters.rs`)**
  - [x] V2-PNG-Export (`chara` Chunk) schreibt saubere `custom_*`-Felder in die Extensions.

---

### 📌 Phase 3: Zentrales Branding & neutrale UI-Begriffe
> **Ziel:** Kein statisch hardcodierter App-Name mehr in Texten. Subsysteme heißen in der UI rein funktional. Ein zukünftiger Titelwechsel ändert nur noch 1 Konstante.

- [x] **3.1 Zentrale Branding-Konstante etablieren**
  - [x] Frontend-Konstante anlegen (in `src/constants/branding.ts`):
    ```typescript
    export const APP_NAME = 'OtakuSoul'; // Zukünftig mit 1 Änderung austauschbar
    export const APP_DEFAULT_COMPANION_NAME = 'Companion';
    ```
  - [x] Rust-Backend Konstante (in `src-tauri/src/modules/mod.rs`): App-Titel für Fallbacks und Default-Companion-Name definiert.
- [x] **3.2 Navigation & Hauptmenü neutralisieren**
  - [x] `src/components/navigation.ts` & Locales:
    - Tab-Labels: **Stage**, **Hub**, **Companion**, **Chat**, **Charaktere**, **Einstellungen**.
  - [x] `src/components/Sidebar.tsx` & `Header.tsx`: Neutrale Tooltips und dynamisches Rendering von `{APP_NAME}`.
- [x] **3.3 Modul-Ansichten neutralisieren**
  - [x] `SoulHubView.tsx`: Umbenennung des Headers in **Community Hub** (`hub.title`).
  - [x] Tabs: „Kuratierte Charaktere“ (Gateway), „Chub AI“, „Lorebooks“, „Stage-Szenarien“.
  - [x] `CognitiveMemoryDrawer.tsx`: Header-Titel neutral auf **Kognitives Gedächtnis** / **Cognitive Memory** (`memory.title`).
  - [x] `StageView.tsx`: Überschriften rein auf **Stage** / **Spielleiter** ausgerichtet.
  - [x] `CompanionView.tsx` & `FloatingCompanionOverlay.tsx`: Standard-Name auf **Companion** (`APP_DEFAULT_COMPANION_NAME`).
- [x] **3.4 Wörterbücher (i18n) aktualisieren (`de.ts`, `en.ts`, `ru.ts`)**
  - [x] Alle Modul-Schlüssel neutral formuliert (Stage, Cognitive Memory, Companion, Hub).
  - [x] Dynamische Platzhalter wie `{{appName}}` und `{APP_NAME}` für flexible Wiederverwendbarkeit.

---

### 📌 Phase 4: Neutrale Code-Internals, Prompts & Mocks
> **Ziel:** Prompts, Moduldateien und Test-Mocks von Markenpräfixen befreien.

- [x] **4.1 System-Prompts & E2E-Mocks neutralisieren**
  - [x] In `src-tauri/src/modules/stage/turn.rs`, `world.rs`, `director.rs`, `history.rs`:
    - `[SOUL STAGE — GAME MASTER PLANNER]` → `[STAGE — GAME MASTER PLANNER]`
    - `[SOUL STAGE — GAME MASTER NARRATOR]` → `[STAGE — GAME MASTER NARRATOR]`
    - `[SOUL STAGE — NPC]` → `[STAGE — NPC]`
    - `[SOUL STAGE — ROUTING]` → `[STAGE — ROUTING]`
    - `[SOUL STAGE — ARC ARCHIVE]` → `[STAGE — ARC ARCHIVE]`
    - `[SOUL STAGE — CONSISTENCY]` → `[STAGE — CONSISTENCY]`
    - `[SOUL STAGE — SUMMARY]` → `[STAGE — SUMMARY]`
  - [x] Erkennungs-Strings in den Test-Mocks (E2E / Mock-LLM) synchron auf `[STAGE — ...]` angepasst.
- [x] **4.2 Dateinamen & Rust-Module neutralisieren**
  - [x] `src-tauri/src/modules/soul_hub.rs` → `src-tauri/src/modules/hub.rs`.
  - [x] `src-tauri/src/modules/soul_memory_pipeline.rs` → `src-tauri/src/modules/memory_pipeline.rs`.
  - [x] `src/components/hub/SoulHubView.tsx` → `src/components/hub/HubView.tsx`.
  - [x] Generierte TS-Typen aktualisiert (`npm run types:gen`).
- [x] **4.3 Backup-Manifest neutralisieren (`profile_backup.rs`)**
  - [x] Gruppen im Manifest: `memory: bool`, `stage: bool`, `companion: bool`.
  - [x] Abwärtskompatibilität: Alte Backups mit `soul_memory` oder `soul_stage` beim Einlesen weiterhin über Serde-Aliase korrekt zugeordnet.

---

### 📌 Phase 5: Dokumentation, Hygiene & Finale Verifikation
> **Ziel:** Vollständige Bereinigung der Dokumente und Absicherung der Funktionsfähigkeit.

- [x] **5.1 Dokumentation neutralisieren**
  - [x] `AI.md`: Historische Bindung entfernen; Architektur modular beschreiben; Mock-Signalstrings aktualisieren.
  - [x] `README.md`: Modulübersicht auf funktionale Begriffe umstellen.
  - [x] `ROADMAP.md` & `Roadmap_abgeschlossen.md`: Überschriften harmonisieren.
- [x] **5.2 Code-Kommentare bereinigen**
  - [x] Historische SoW-Kommentare entfernen oder neutral formulieren.
- [x] **5.3 Vollständiger Prüflauf**
  - [x] `npm run check` (oxlint, tsc, vitest, cargo fmt, clippy, cargo test).
  - [x] `npm run e2e` (E2E-Rauchtest mit Mock-LLM).
  - [x] Sichtprüfung bei unterschiedlichen Bildschirmauflösungen.

---

### 🚀 Vorteil dieser neutralen Struktur

Wenn Du Dich später für einen finalen Namen (oder ein Rebranding mit neuem Logo) entscheidest:
1. **App-Name:** Nur die zentrale Konstante `APP_NAME` in Frontend & Backend anpassen.
2. **Logos & Icons:** Bilddateien in `assets/` / `public/` austauschen.
3. **Null Code-Refaktorisierung:** Keine Modulnamen, keine System-Prompts, keine E2E-Mocks und keine Datenbankfelder müssen je wieder angefasst werden.

---

## 5. Optionale Inhalte (`otakusoul-data`)

Dieses Dokument koordiniert die Erstellung und schrittweise Implementierung von modularen, optionalen Inhalten für **OtakuSoul**. Alle hier definierten Charaktere, Lorebooks und Soul-Stage-Kampagnen werden im Repository **[`SnowwhiteOakheart/otakusoul-data`](https://github.com/SnowwhiteOakheart/otakusoul-data)** gepflegt und stehen lokal in der App zur Verfügung, ohne das Basis-Release der Anwendung aufzublähen.

---

### 💎 Qualitätsstandards je Inhalt

Jeder Charakter und jedes Kampagnenpaket folgt den etablierten Standards:
1. **Charakterkarten:**
   - Format: **Tavern / OtakuSoul Character Card V2** (PNG mit integrierter JSON-Metadaten-Payload & Standalone-JSON).
   - Ausführliche Persönlichkeits-, Welt- und Sprachmuster-Definitionen (inkl. typischer Ticks, Eigenheiten und Beziehungsdynamiken).
   - Mindestens eine stimmungsvolle Einstiegsnachricht (`first_mes`) + 2 alternative Begrüßungen (`alternate_greetings`).
   - Mehrteilige Dialogbeispiele (`mes_example`), die die Reaktionsbreite der Figur verankern.
   - Mehrsprachigkeit über `extensions.otakusoul_i18n` (Deutsch als Basis, Englisch und Russisch integriert).
2. **Bildgenerierung & Expressions:**
   - Hochauflösender Haupt-Avatar (700×937 PNG, passend zum Anime-Stil der Vorlage).
   - Mindestens 5–6 abgestimmte Mimik-Porträts (640×800 WebP) für die automatische Emotionserkennung im Chat:
     - `neutral` (Standard / Ruhe-Ausdruck)
     - `happy` (Lachen / Frech / Begeistert)
     - `relaxed` / `smug` (Gelassen / Schelmisch / Selbstsicher)
     - `surprised` (Errötet / Verblüfft / Ertappt)
     - `angry` (Schmollend / Wütend / Fokussiert)
     - `sad` (Betrübt / Nachdenklich / Pout)
3. **Kampagnen & Lorebooks:**
   - Strukturierte Soul-Stage-Szenarien mit Ziel-SG, GM-Tonalität, Anfangsort, Weltkontext und passenden `party`-Zusammenstellungen.
   - Passende 16:9-Szenenhintergründe (1376×768 PNG) ohne Figuren im Bild für freie Avatar-Darstellung.
   - Detaillierte Welten-, Regel- und Orts-Lorebooks mit Keyword-Triggern.

---

### 🌸 Phase 1: Beliebte Einzel-Charaktere (Chat & Soul Memory)

- [x] **1.1 Hayase Nagatoro** (*Neck mich nicht, Nagatoro-san*)
  - *Status:* **Vollständig abgeschlossen.**
  - *Bilder:* Avatar + 6 Expressions (neutral, happy, relaxed, surprised, angry, sad) vollständig neu generiert.
  - *Dateien:* V2-PNG in `cards_gateway`, Preset in `presets/nagatoro/`, in `soul_registry.json` und lokal in `~/.local/share/otakusoul/characters`.
- [x] **1.2 Marin Kitagawa** (*My Dress-Up Darling*)
  - *Status:* **Vollständig abgeschlossen.**
  - *Bilder:* Avatar + 6 Expressions (neutral, happy, relaxed, surprised, angry, sad) vollständig neu generiert.
  - *Dateien:* V2-PNG in `cards_gateway`, Preset in `presets/marin-kitagawa/`, in `soul_registry.json` und lokal in `~/.local/share/otakusoul/characters`.
- [x] **1.3 Frieren** (*Sousou no Frieren*)
  - *Status:* **Implementiert & spielbar.**
  - *Bilder:* Haupt-Avatar (Bibliothek), Grimoire-Pose und 6 Expressions vollständig neu generiert, einschließlich Mimic-Face, Pout und Sleepy.
  - *Dateien:* V2-PNG in `cards_gateway`, Preset in `presets/frieren/`, in `soul_registry.json` und lokal in `~/.local/share/otakusoul/characters`.
- [x] **1.4 Yor Forger** (*Spy x Family*)
  - *Status:* **Text, Avatar und 6 Expressions fertig.**
  - *Dateien:* V2-Definition in `presets/yor-forger/yor_forger.json` mit voller deutscher Persönlichkeit, First Message & Szenario.
  - *Bilder:* Avatar und 6 Expressions neu generiert; V2-PNG mit eingebetteter Definition vorhanden.
- [x] **1.5 Megumin** (*KonoSuba*)
  - *Status:* **Text, Avatar und 6 Expressions fertig.**
  - *Dateien:* V2-Definition in `presets/megumin/megumin.json` mit Chuunibyou-Beschwörungen, First Message & Szenario.
  - *Bilder:* Avatar und 6 Expressions neu generiert; V2-PNG mit eingebetteter Definition vorhanden.
- [x] **1.6 Kaguya Shinomiya** (*Kaguya-sama: Love Is War*)
  - *Status:* **Text, Avatar und 6 Expressions fertig.**
  - *Dateien:* V2-Definition in `presets/kaguya-shinomiya/kaguya_shinomiya.json` mit psychologischem Liebeskrieg & Szenario.
  - *Bilder:* Avatar und 6 Expressions neu generiert; V2-PNG mit eingebetteter Definition vorhanden.

---

### 🗺️ Phase 2: Umfassende Serien-Kampagnen (Soul Stage, Lorebooks & Party-Cast)

---

#### 🍲 Kampagne 2.1: *Dungeon Meshi* (*Delicious in Dungeon*)
*Ein tödlicher Dungeon-Crawl, bei dem das Überleben davon abhängt, wie meisterhaft man Monster zerlegt und kocht.*

- **Lorebooks:** *(Alle 3 in `lorebooks_gateway` & `lorebooks_registry.json` registriert)*
  - [x] *Dungeon-Ökologie:* Manafluss, Geister-Kreislauf, Labyrinth-Regeln (`dungeon_meshi_ecology.json`).
  - [x] *Monster-Küche & Rezepte:* Zubereitung von Riesen-Skorpionen, Basilisken (`dungeon_meshi_recipes.json`).
  - [x] *Figuren & Goldene Dynastie:* Labyrinth-Geschichte, Fallin-Rettung (`dungeon_meshi_world.json`).
- **Soul-Stage-Szenarien (Episoden):** *(Alle 5 in `stages_gateway` & `stages_registry.json` registriert)*
  - [x] *Episode 1: Skorpionsuppe & Pilze* (`dungeon_meshi_ep1_skorpionsuppe.json`)
  - [x] *Episode 2: Der Klingen-Basilisk* (`dungeon_meshi_ep2_klingenbasilisk.json`)
  - [x] *Episode 3: Alraunen-Ernte* (`dungeon_meshi_ep3_alraunenernte.json`)
  - [x] *Episode 4: Die Wassergeister* (`dungeon_meshi_ep4_wassergeister.json`)
  - [x] *Episode 5: Der Rote Drache* (`dungeon_meshi_ep5_roter_drache.json`)
- **Charaktere (V2-Karten in `presets/dungeon-meshi/`):**
  - [x] Laios Touden, Marcille Donato, Chilchuck Tims, Senshi (JSONs angelegt).
- **Bilder:**
  - [x] Neu generiert: 4 Charakter-Avatare & 5 Dungeon-Hintergründe.

---

#### ⏳ Kampagne 2.2: *Steins;Gate* (*Zukunftsgadget-Labor & Weltlinien*)
*Zeitreisen, Paranoia und das Schicksal in Akihabara.*

- **Lorebooks:** *(Alle 3 in `lorebooks_gateway` & `lorebooks_registry.json` registriert)*
  - [x] *Weltlinien & Divergenz:* Alpha/Beta-Attraktorfelder, Reading Steiner (`steins_gate_divergence.json`).
  - [x] *Labor-Gadgets & D-Mails:* Telefon-Mikrowelle, IBN 5100 (`steins_gate_gadgets.json`).
  - [x] *Akihabara 2010 & SERN:* Zukunftsgadget-Labor, Radiogebäude (`steins_gate_akihabara.json`).
- **Soul-Stage-Szenarien (Episoden):** *(Alle 5 in `stages_gateway` & `stages_registry.json` registriert)*
  - [x] *Episode 1: Die erste D-Mail* (`steins_gate_ep1_erste_dmail.json`)
  - [x] *Episode 2: Suche nach dem IBN 5100* (`steins_gate_ep2_ibn5100_suche.json`)
  - [x] *Episode 3: Operation Urd* (`steins_gate_ep3_operation_urd.json`)
  - [x] *Episode 4: Der Schmetterlingseffekt* (`steins_gate_ep4_schmetterlingseffekt.json`)
  - [x] *Episode 5: Das Tor zu Steins Gate* (`steins_gate_ep5_tor_zu_steins_gate.json`)
- **Charaktere (V2-Karten in `presets/steins-gate/`):**
  - [x] Okabe Rintarou (Hououin Kyouma), Mayuri Shiina, Itaru Hashida (Daru), Suzuha Amane (JSONs angelegt; Kurisu existiert bereits im Gateway).
- **Bilder:**
  - [x] Neu generiert: 4 Charakter-Avatare & 5 Akiba-Hintergründe.

---

#### ☕ Kampagne 2.3: *Lycoris Recoil* (*Café LycoReco*)
*Charmantes Café-Leben am Tag, geheime Anti-Terror-Einsätze bei Nacht.*

- **Lorebooks:** *(Alle 3 in `lorebooks_gateway` & `lorebooks_registry.json` registriert)*
  - [x] *DA & Alan Institute:* Organisation, Lycoris-Agentinnen (`lycoris_recoil_da.json`).
  - [x] *Café LycoReco:* Café in Sumida, Menü, Stammkunden (`lycoris_recoil_cafe.json`).
  - [x] *Ausrüstung & Taktik:* Nicht-tödliche Munition, Chisatos Ausweichen (`lycoris_recoil_tactics.json`).
- **Soul-Stage-Szenarien (Episoden):** *(Alle 4 in `stages_gateway` & `stages_registry.json` registriert)*
  - [x] *Episode 1: Willkommen im Café LycoReco* (`lycoris_recoil_ep1_willkommen_im_cafe.json`)
  - [x] *Episode 2: Geleitschutz durch Tokio* (`lycoris_recoil_ep2_geleitschutz_tokio.json`)
  - [x] *Episode 3: Jagd nach Walnut* (`lycoris_recoil_ep3_jagd_nach_walnut.json`)
  - [x] *Episode 4: Duell im Morgengrauen* (`lycoris_recoil_ep4_duell_im_morgengrauen.json`)
- **Charaktere (V2-Karten in `presets/lycoris-recoil/`):**
  - [x] Chisato Nishikigi, Takina Inoue, Mizuki Nakahara, Kurumi (JSONs angelegt).
- **Bilder:**
  - [x] Neu generiert: 4 Charakter-Avatare & 4 Café-/Tokio-Hintergründe.

---

#### ⚔️ Kampagne 2.4: *Sword Art Online* (*Aincrad – 100 Ebenen des Todes*)
*Der Überlebenskampf im legendären VRMMO.*

- **Lorebooks:** *(Alle 3 in `lorebooks_gateway` & `lorebooks_registry.json` registriert)*
  - [x] *Aincrad-Systemregeln:* Sword Skills, HP-Regeln, Permadeath (`sao_system_rules.json`).
  - [x] *Gilden & Fraktionen:* KoB, Fuurinkazan, Laughing Coffin (`sao_guilds_factions.json`).
  - [x] *Aincrad-Geografie:* Die 100 Ebenen, Startstadt, Labyrinthzonen (`sao_aincrad_geography.json`).
- **Soul-Stage-Szenarien (Episoden):** *(Alle 5 in `stages_gateway` & `stages_registry.json` registriert)*
  - [x] *Episode 1: Die Verkündung* (`sao_ep1_die_verkuendung.json`)
  - [x] *Episode 2: Der Herrscher der ersten Ebene* (`sao_ep2_boss_ebene1.json`)
  - [x] *Episode 3: Wärme des Herzens* (`sao_ep3_waerme_des_herzens.json`)
  - [x] *Episode 4: Duell in den Schatten* (`sao_ep4_duell_in_den_schatten.json`)
  - [x] *Episode 5: Der Glänzende Blick* (`sao_ep5_der_glaenzende_blick.json`)
- **Charaktere (V2-Karten in `presets/sword-art-online/`):**
  - [x] Kirito, Asuna, Klein, Lisbeth (JSONs angelegt).
- **Bilder:**
  - [x] Neu generiert: 4 Charakter-Avatare & 5 Aincrad-Hintergründe.

---

### 📈 Aktueller Status

1. **Phase 1 (Einzel-Charaktere):**
   - [x] **Hayase Nagatoro** *(fertig inkl. 6 neuen Expressions, 2 Alternate Greetings & vollständiger i18n DE/EN/RU)*
   - [x] **Marin Kitagawa** *(fertig inkl. 6 neuen Expressions, 2 Alternate Greetings & vollständiger i18n DE/EN/RU)*
   - [x] **Frieren** *(tiefgründige Lore ~2400 Zeichen, 2 Alternate Greetings, i18n DE/EN/RU; neuer Avatar, neue Grimoire-Pose und 6 Expressions vorhanden)*
   - [x] **Yor Forger** *(tiefgründige Lore ~2800 Zeichen, 2 Alternate Greetings, Dialogbeispiele & vollständige i18n DE/EN/RU; Bilder vollständig neu generiert)*
   - [x] **Megumin** *(tiefgründige Lore ~2500 Zeichen, 2 Alternate Greetings, Dialogbeispiele & vollständige i18n DE/EN/RU; Bilder vollständig neu generiert)*
   - [x] **Kaguya Shinomiya** *(tiefgründige Lore ~2300 Zeichen, 2 Alternate Greetings, Dialogbeispiele & vollständige i18n DE/EN/RU; Bilder vollständig neu generiert)*
2. **Phase 2 (Kampagnen – Alle 12 Lorebooks, 19 Episoden & 16 Cast-Karten fertig implementiert):**
   - [x] **Kampagne 2.1: Dungeon Meshi** *(Lorebooks, Szenarien & 4 Cast-Karten komplett mit voller Lore, 2 Alt-Greetings, Beispielen & i18n DE/EN/RU; Bilder vollständig neu generiert)*
   - [x] **Kampagne 2.2: Steins;Gate** *(Lorebooks, Szenarien & 4 Cast-Karten komplett mit voller Lore, 2 Alt-Greetings, Beispielen & i18n DE/EN/RU; Bilder vollständig neu generiert)*
   - [x] **Kampagne 2.3: Lycoris Recoil** *(Lorebooks, Szenarien & 4 Cast-Karten komplett mit voller Lore, 2 Alt-Greetings, Beispielen & i18n DE/EN/RU; Bilder vollständig neu generiert)*
   - [x] **Kampagne 2.4: Sword Art Online** *(Lorebooks, Szenarien & 4 Cast-Karten komplett mit voller Lore, 2 Alt-Greetings, Beispielen & i18n DE/EN/RU; Bilder vollständig neu generiert)*

### Bildbestand vom 04.10.2026

22 neue Avatare (700×937 PNG mit V2-Payload), 36 Expressions (640×800 WebP), eine zusätzliche Grimoire-Pose und 19 leere Szenenhintergründe (1376×768 PNG). Alle Avatare wurden ausschließlich aus Text generiert. Die Expressions und Grimoire-Pose verwenden nur die jeweils neu generierten Avatare als Referenz. Vorhandene Roadmap-Bilder wurden ersetzt.

Die Hintergründe liegen im jeweiligen Preset unter `backgrounds/`; Szenen referenzieren ihren Dateinamen über `starting_bg`. Zur lokalen Nutzung die gewünschten Hintergründe über Soul Stage importieren. Expressions liegen unter `presets/<paket>/expressions/`; die Karten-Zuordnung verwendet `expressions/<paket>/<emotion>.webp` für das lokale Expressions-Verzeichnis. Bereits importierte lokale Karten bei Bedarf erneut importieren.

---

## 6. Qualität & Bedienung

Stand: 04.10.2026. Grundlage: Quellcode, Funktionsstruktur und vorhandene E2E-Screenshots;
kein vollständiger Praxistest. Die damalige Verbesserungs-Roadmap (Abschnitt 2) wurde nicht als Grundlage verwendet.

Die Reihenfolge priorisiert Sicherheit und Verlässlichkeit vor zusätzlichen Funktionen.
Abgehakte Punkte sind umgesetzt und geprüft; offene Punkte sind noch keine zugesagten Features.

### 1. Companion-Berechtigungen (höchste Priorität)

- [x] Automatische Freigabe auf eine ausdrückliche Liste bekannter interner Werkzeuge begrenzen.
- [x] MCP-Werkzeuge und unbekannte Werkzeuge grundsätzlich zur Bestätigung vorlegen.
- [x] Schreibende Dateiaktionen auch bei Großschreibung und umgebenden Leerzeichen bestätigen lassen.
- [x] Screenshots und Zwischenablagezugriffe wegen ihrer sensiblen Inhalte bestätigen lassen.
- [x] Regressionstests für Freigabe, Ablehnung, unbekannte Tools und Varianten der Dateiaktionen ergänzen.
- [x] Echte Betriebssystem-Isolation für Skripte mit begrenzten Datei-, Netzwerk- und Prozessrechten entwerfen und umsetzen. *(Ersetzt durch Neuzuschnitt, umgesetzt 04.10.: `allow_code_execution`, standardmäßig aus und nur bis zum Neustart; Backend prüft bei Anfrage und Ausführung; Banner zeigt den vollständigen Code.)*
  *Neuzuschnitt (04.10.):* Eine plattformübergreifende Sandbox (bubblewrap/Landlock, AppContainer, macOS) ist
  unverhältnismäßig. Stattdessen Skript-Ausführung standardmäßig aus, nur per Schalter mit Warnung; vor der
  Bestätigung den vollständigen Skripttext zeigen.
- [x] Berechtigungen und Auswirkungen pro Werkzeug verständlich anzeigen; die Grenzen der Skript-Ausführung klar benennen (`companion/toolEffects.ts`: Wirkungs-Chips im Freigabe-Banner; Hinweis „ohne Sandbox“ am Schalter).

Abnahme: Ohne Bestätigung wird kein unbekanntes oder externes Werkzeug ausgeführt;
Schreibaktionen umgehen die Prüfung nicht durch anders formatierte Argumente.
Arbeitsverzeichnis und Timeout allein gelten nicht als Betriebssystem-Sandbox.

### 2. Speichern und Fehlerrückmeldungen

- [x] Manuelle Erinnerungen und Tagebucheinträge: Schreibfehler weitergeben, Eingaben erhalten und Wiederholen ermöglichen.
- [x] Tagebuchgenerierung und Memory-Backup-Erstellung: Fehler sichtbar anzeigen.
- [x] Psychologie und Beziehung als explizit speicherbare Entwürfe bearbeiten; Schreibfehler erhalten Änderungen.
- [x] Markdown-Editor: Lade- und Schreibfehler erhalten Entwürfe; laufende Vorgänge sperren die Bearbeitung.
- [x] Reflexionsfehler sichtbar halten; SoW-Import und Snapshot-Wiederherstellung bei Schreibfehlern vollständig zurückrollen.
- [x] Memory-Übersicht und Snapshot-Liste: Lesefehler sichtbar anzeigen, geladene Daten erhalten und Wiederholen ermöglichen.
- [x] Chat-Seitenleiste: Titel, Author's Note und Zusammenfassung erhalten Entwürfe und melden Schreibfehler.
- [x] Inline-Nachrichteneditor: Schreibfehler erhalten den Entwurf; Wiederholen übernimmt erst nach erfolgreichem Schreiben.
- [x] Speicherfehler vom Store an die Oberfläche weitergeben und verständlich anzeigen (`store/reportFailure.ts`; Aktionen mit eigener Rückmeldung werfen weiter).
- [x] Erfolgsmeldungen ausschließlich nach erfolgreichem Speichern anzeigen (u. a. Backup, Bild-/Discord-/Web-Einstellungen, Chat-Import, Szenenimport, KI-Charakterentwurf).
- [x] Eingaben bei Fehlern erhalten und Wiederholen anbieten (Formulare bleiben offen, Entwürfe erhalten).
- [x] Memory-, Psychologie-, Beziehungs-, Tagebuch- und Chat-Editoren auf verschluckte Fehler prüfen.
  *Erledigt (04.10.):* Durchgang durch alle Store-Aktionen: Vom Nutzer ausgelöste Aktionen zeigen Fehler an (v. a. Stage-Store, Companion, Ökosystem);
  Hintergrundabrufe dürfen weiter nur protokollieren.
- [x] Fehlgeschlagenes Speichern mit Tests absichern, insbesondere manuell angelegte Erinnerungen.

Abnahme: Ein fehlgeschlagener Speichervorgang leert keine Eingabe und meldet keinen Erfolg.

### 3. Chat senden, abbrechen und wiederholen

- [x] Promptaufbau und alle nachfolgenden Schritte in eine gemeinsame Fehlerbehandlung aufnehmen.
- [x] Generierungszustand bei jedem Fehler und Abbruch zuverlässig zurücksetzen (Arbeitspakete 9, 12–16: `finally`, getrennte Sperren und Abbruchkanäle).
- [x] Bereits gespeicherte Nutzernachrichten beim Wiederholen erkennen; Duplikate vermeiden.
- [x] Stage-Routing, Archivierung und Konsistenzprüfung abbrechen und offene Arbeit später nachholen.
- [x] Stage-Planung und Kontextvorbereitung einschließlich interner Zusammenfassung abbrechen können.
- [x] Abbruchkanäle von Chat und Soul Stage trennen, einschließlich Stage-Stopp im Frontend.
- [x] Parallele native Chat-Anfragen und konkurrierende Stage-Runden, Neu-Generieren und Rast vor ihrem Start ablehnen.
- [x] Warten auf Frontend-Promptvorbereitung und Datei-Lesen nach erfolgreichem Abbruch sofort beenden; späte Resultate verwerfen.
- [x] Native Text-, Gedanken- und Abschlussereignisse an eine eindeutige Generierungs-ID binden.
- [x] Sitzungsabrufe ordnen, alte Verläufe während des Ladens ausblenden und Lesefehler wiederholbar anzeigen.
- [x] Wartende HTTP-Anfragen und inaktive SSE-Streams bei Backend-Abbruch beenden.
- [x] Gleichzeitiges Senden, Sitzungswechsel und verspätete Antworten eindeutig einer Sitzung zuordnen (Arbeitspakete 10, 11, 15: Abrufnummern, `generation_id`, native Sperren).
- [x] Fehler bei Upload, Promptaufbau, Streaming und Antwortspeicherung gezielt testen.

Abnahme: Kein Fehler lässt den Chat dauerhaft beschäftigt zurück; Wiederholen erzeugt keine doppelte Nutzernachricht.

### 4. Konsistenz nach Verlaufsänderungen

- [x] Zusammenfassungen nach Bearbeiten, Löschen und Swipe-Wechsel gezielt verwerfen oder neu erstellen (`discard_stale_summary`: Änderung im zusammengefassten Teil verwirft sie, sie entsteht beim nächsten Überlauf neu).
- [x] Aus geänderten Nachrichten abgeleitete Erinnerungen erkennen und abgleichen (Bearbeiten, Variante, Löschen markieren sie `needs_review`; Prüfen per „Passt so“, Korrigieren oder Vergessen).
- [x] Auswirkungen einer Verlaufsänderung auf die Figur verständlich anzeigen (Hinweis nach Bearbeiten/Löschen mit Anzahl und „Prüfen“, der den Memory-Drawer öffnet).
- [x] Regressionstests für korrigierte und entfernte Ereignisse ergänzen (Rust: alle Änderungswege; Store: Bearbeiten/Swipe).

Abnahme: Entfernte oder ersetzte Ereignisse gelangen nicht über veraltete Zusammenfassungen erneut in den Prompt.

### 5. Soul Memory nachvollziehbar korrigieren

- [x] Erinnerungen mit Ursprungsunterhaltung und Quellnachrichten verknüpfen (Migration v4; die Pipeline speichert Chat und Nachrichten, „Quelle“ springt dorthin).
  *Neuzuschnitt (04.10.):* In Etappen. Zuerst Bearbeiten/Vergessen einzelner Erinnerungen samt Quelle (Chat,
  Nachricht), dann Schutz wichtiger Erinnerungen; Tatsache/Deutung und Änderungshistorie zuletzt.
- [x] Bestätigte Tatsachen von Modellinterpretationen unterscheiden (Herkunft: vom Modell abgeleitet / von dir angelegt / von dir bestätigt; ältere ohne Angabe „Herkunft unbekannt“).
- [x] Einzelne Erinnerungen bearbeiten und gezielt vergessen können.
- [x] Wichtige Erinnerungen vor automatischer Überschreibung schützen (Anheften: steht immer zuerst im Gedächtnis-Kontext; automatische Abläufe ändern Inhalte nicht). Snapshot-Wiederherstellung übernimmt Herkunft, Quelle, Anheftung und Prüf-Markierung.
- [x] Automatische Änderungen mit einer nachvollziehbaren Änderungshistorie versehen (`soul_memory_history`: entstanden, Quelle geändert, korrigiert, bestätigt, angeheftet, vergessen).

Abnahme: Der Nutzer kann Herkunft und Änderungen einer Erinnerung nachvollziehen und sie gezielt korrigieren.

### 6. Einstieg bis zur ersten Antwort

- [x] Cloud-Verbindung und Modell im Wizard tatsächlich testen („Verbindung testen“ über `quick_reply`, 90 s Obergrenze).
- [x] Lokalen Modelldownload, Laufzeitinstallation und Serverstart durchgehend begleiten (Laufzeitkarte und Einstiegsmodelle im Wizard; die erste Antwort startet den Server).
- [x] Hardwaregerechte Auswahl und verständliche Fehlerbehebung anbieten (`models_hub::starter_models`: Qwen3 4B/8B, Mistral Nemo 12B, Mistral Small 24B mit SHA-256, Empfehlung nach VRAM; Fehler mit Ursache und Hinweis).
- [x] Mit einer erfolgreichen ersten Charakterantwort abschließen (letzter Schritt holt eine echte Begrüßung des gewählten Charakters).

Abnahme: Eine frische Installation führt ohne Suche in mehreren Einstellungsseiten zum funktionierenden Chat.

### 7. Oberfläche und Orientierung

- [x] Kompakte Chatansicht und einklappbare Zusatzinformationen anbieten (Schalter „Kompakt“: dichtere Nachrichten und schmalere HUD-Leiste; Zustandswerte im HUD einklappbar; beides und die Avatar-Anzeige bleiben pro Gerät gespeichert).
- [x] Werkzeugleisten, HUD und Avatarsteuerung auf das aktuelle Erlebnis fokussieren (Stimme anpassen und Chat löschen im Menü „Weitere Chat-Aktionen“; doppelte Persona-Anzeige aus dem HUD entfernt; HUD bricht in kleinen Fenstern um statt abzuschneiden).
- [x] Statusanzeige an das tatsächlich gewählte Backend anpassen (Cloud zeigt Anbieter-Modell, Klick öffnet die passenden Einstellungen; vor dem Laden der Einstellungen kein Status).
- [x] Einstellungssuche mit direktem Sprung zur passenden Option ergänzen (Befehlspalette: Einstellungsseiten, einzelne Optionen mit Hervorhebung, Integrationsreiter; Suchwörter dreisprachig). *(Neuzuschnitt: Befehlspalette Strg+K um Einstellungsabschnitte erweitern statt eigener Suche; 89/90/93 erst bei konkretem Anlass.)*
- [x] Kleine Fenster, Tastaturbedienung und verschiedene Themes anhand von E2E-Screenshots prüfen (`e2e/ui-layout.mjs`, Screenshots 48–50). Gefunden und behoben: abgeschnittenes HUD bei 820 px, kaum lesbare wörtliche Rede und dunkle Statusflächen im hellen Modus.

Abnahme: Ein funktionierender Cloud-Chat erscheint nicht wegen eines gestoppten lokalen Servers als gestört.

### 8. Lange Geschichten navigieren

- [x] Volltextsuche im Chat mit Sprung zur Fundstelle ergänzen (Strg+F, `ChatSearchBar`, Sprung und Hervorhebung über `requestChatJump`).
- [x] Wichtige Szenen mit Lesezeichen markieren können (Tabelle `chat_bookmarks`, Migration v3; Liste in der Seitenleiste springt zur Szene).
- [x] Ab einer Nachricht einen alternativen Handlungsverlauf beginnen können (`branch_chat`). *(Neuzuschnitt: „Ab hier als neuen Chat fortsetzen“ statt Verzweigungsbaum. Soul Memory gehört zum Charakter; die Grenze wird benannt statt vollständig getrennt.)*
- [x] Bei Verzweigungen Verlauf, Zusammenfassung und Erinnerungen konsistent trennen (Verlauf, Varianten, Anhänge als Kopie, Lesezeichen; Zusammenfassung nur, wenn sie nichts nach dem Abzweig enthält; die gemeinsame Soul Memory nennt die Rückfrage ausdrücklich).

Abnahme: Alternative Geschichten beeinflussen sich nicht unbeabsichtigt über gemeinsame abgeleitete Erinnerungen.

### 9. Hintergrundaufgaben sichtbar machen

- [x] Gemeinsame Aufgabenanzeige für Downloads, Reflexion, Zusammenfassung, Bilder und Modellwechsel schaffen (`taskSlice` + `TaskCenter` im Kopf; erscheint, sobald es eine Aufgabe gibt).
- [x] Laufend, wartend, erfolgreich, fehlgeschlagen und abgebrochen unterscheiden (Fehlerursache sichtbar, neue Fehler markieren den Knopf rot).
- [x] Abbrechen und Wiederholen anbieten, soweit der jeweilige Vorgang es unterstützt (Abbrechen: Bild-/LoRA-/TTS-Downloads, Modellstart; Wiederholen: Downloads, Reflexion, Bild, Modellstart. GGUF-Downloads und Zusammenfassungen haben keinen Abbruch im Backend.)
- [x] Wartezeiten durch Modellbelegung oder VRAM-Wechsel erklären (Modellstart wartet bis „läuft“; lokale Bilder zeigen die VRAM-Phasen Planen/Entladen/Verkleinern/Laden als „wartet“).

Abnahme: Der Nutzer erkennt, woran die App arbeitet und warum eine Aufgabe wartet.

### Umsetzung und Prüfung

- Erstes Arbeitspaket: Companion-Freigabeprüfung und Regressionstests; Betriebssystem-Isolation bleibt separat offen.
- Vor jedem Commit: `npm run check`; bei UI-Änderungen zusätzlich `npm run e2e` und visuelle Screenshot-Prüfung.
- Nur eigene Änderungen committen. Ergebnisse und verbleibende Grenzen hier festhalten.

#### Erstes Arbeitspaket – 03.10.2026

Die automatische Freigabe nutzt jetzt eine ausdrückliche Liste interner Werkzeuge.
Externe und unbekannte Tools sowie sensible Desktopzugriffe warten auf Bestätigung.
Dateiaktionen werden wie bei der Ausführung normalisiert; ungültige Aktionswerte werden nicht automatisch freigegeben.
Die Beschriftungen für Screenshot und Zwischenablage wurden in Deutsch, Englisch und Russisch angepasst.

`npm run check` bestanden: 358 Rust-Tests und 101 Frontend-Tests; Modell-/GPU-Tests bleiben bewusst ignoriert.
Der erste Lauf in der Sandbox scheiterte am lokalen HTTP-Testserver eines vorhandenen Download-Tests.
Der vollständige Wiederholungslauf mit isoliertem Profil außerhalb der Sandbox bestand.
E2E-Prüfung bestanden: alle acht bisherigen Szenarien sowie der neue Companion-Freigabetest.
Screenshot `e2e/screenshots/28-companion-freigabe.png` visuell geprüft: Freigabehinweis,
Werkzeugargumente und Ablehnen-/Freigeben-Schaltflächen sind vollständig sichtbar.
Der Companion-Test wurde nach dem bereits laufenden Gesamtlauf separat ausgeführt und ist künftig
in `npm run e2e` und `npm run e2e:run` integriert.
Betriebssystem-Isolation und detaillierte Berechtigungsanzeigen bleiben offen.

#### Zweites Arbeitspaket – 03.10.2026

Manuelle Erinnerungen und Tagebucheinträge geben Schreibfehler an die Formulare weiter.
Bei einem Fehler bleiben Text, Titel, Kategorie, Bedeutung und Stimmung erhalten; erneutes Speichern ist möglich.
Erfolgsmeldungen und das Leeren der Eingaben erfolgen erst nach erfolgreichem Schreiben.
Während des Schreibens sind die jeweiligen Felder und der Speicherknopf gesperrt.
Fehler bei Tagebuchgenerierung und Memory-Backup-Erstellung werden ebenfalls angezeigt.

Zusätzlich wurde ein im E2E-Test gefundener Layoutfehler behoben: Der Memory-Drawer rendert
per Portal in `document.body`, statt durch den `backdrop-filter` der HUD-Leiste begrenzt zu werden.
Ein Regressionstest prüft die Platzierung außerhalb des HUD.

Sieben neue Frontend-Regressionstests prüfen unter anderem Fehler, Wiederholen, Doppelsenden und Drawer-Platzierung.
Der neue E2E-Test erzwingt echte SQLite-Schreibfehler mit temporären Triggern ausschließlich im Wegwerfprofil.
Er prüft erhaltene Eingaben, ausbleibende Erfolgsmeldungen und genau einen gespeicherten Eintrag nach Wiederholung.
Screenshot `e2e/screenshots/29-erinnerung-speicherfehler.png` wurde visuell geprüft.

Offen in Abschnitt 2: Psychologie-/Beziehungsfelder mit Entwürfen statt Speichern bei jedem Tastendruck,
Fehler bei Markdown-Nachladen und weiteren Chat-Editoren sowie konsistente Rückmeldungen bei Aktualisierungsfehlern.
`npm run check` bestanden: 358 Rust-Tests und 108 Frontend-Tests.
Der aktuelle Build wurde mit `npm run e2e` erstellt; anschließend bestand die gesamte Suite
mit `npm run e2e:run` (zehn Szenarien einschließlich Companion-Freigabe und Memory-Schreibfehlern).
Die Screenshot-Prüfung bestätigt den vollständigen Drawer, die sichtbare Fehlermeldung und den erhaltenen Entwurf.

#### Drittes Arbeitspaket – 03.10.2026

Psychologie und Beziehung schreiben jetzt erst beim ausdrücklichen Speichern statt bei jeder Eingabe.
Texte, Intensität, Glaubenssätze, Vorlieben und Meilensteine bilden einen gemeinsamen Entwurf pro Reiter.
Ein sichtbarer Hinweis kennzeichnet ungespeicherte Änderungen; Verwerfen stellt die gespeicherten Werte wieder her.
Schreibfehler werden angezeigt, ohne den Entwurf zu löschen oder Erfolg zu melden.

Entwürfe überleben Reiterwechsel und das Schließen des Inspectors, solange die Chatansicht gemountet bleibt.
Sie werden nach Charakter und Persona getrennt. Laufende Speichervorgänge sperren die Felder auch nach Wiederöffnen.
Beim Charakter-/Personawechsel wird die alte Übersicht entfernt; verspätete Antworten für einen anderen Kontext werden ignoriert.
Nach erfolgreichem Schreiben bleibt der gespeicherte Wert auch dann verfügbar, wenn das anschließende Nachladen fehlschlägt.

Neun zusätzliche Frontend-Tests prüfen unter anderem Fehler/Wiederholen, Verwerfen, Kontextwechsel,
Schließen während eines Speichervorgangs und fehlgeschlagenes Nachladen nach erfolgreichem Schreiben.
Der neue E2E-Test prüft ausbleibende Datenbankänderungen beim Tippen und erzwingt echte SQLite-Schreibfehler
für beide Reiter ausschließlich im Wegwerfprofil.

Offen in Abschnitt 2 bleiben Markdown-Nachladen, weitere Chat-Editoren und sichtbare Rückmeldungen für reine Lesefehler.
Entwürfe werden noch nicht dauerhaft auf der Festplatte gesichert.

`npm run check` bestanden: 358 Rust-Tests und 117 Frontend-Tests.
Der aktuelle Build wurde mit `npm run e2e` erstellt; der abschließende Gesamtlauf mit `npm run e2e:run`
bestand alle elf Szenarien. WebKit-spezifische Textauswahl und die Auswahl des sichtbaren Verwerfen-Knopfs
wurden im neuen Test korrigiert. Screenshots 30–31 wurden visuell geprüft: Entwurf, Speicheraktionen
und Fehlerhinweis sind vollständig sichtbar.

#### Viertes Arbeitspaket – 03.10.2026

`fetchMemoryMarkdown` gibt Lesefehler weiter und ersetzt den Zustand nicht durch leere Inhalte.
Der manuelle Nachladevorgang verwirft Entwürfe und meldet Erfolg ausschließlich nach erfolgreichem Lesen beider Dateien.
Lade-/Schreibfehler werden angezeigt; Wiederholen bleibt möglich. Dateiauswahl, Text und Aktionen sind währenddessen gesperrt.
Der kurzlebige, dateiübergreifende „Gespeichert!“-Knopf wurde durch die Erfolgsmeldung nach dem jeweiligen Schreibvorgang ersetzt.

Markdown-Entwürfe und laufende Vorgänge liegen wie die anderen Editoren im Drawer und überleben Reiterwechsel und Schließen.
Charakter und Persona erhalten getrennte Entwürfe; verspätete Lese-/Schreibergebnisse überschreiben keinen anderen Kontext.
Beim Kontextwechsel werden die gespeicherten Markdown-Texte geleert, bis die richtigen Inhalte geladen wurden.
Hintergrund-Nachladefehler nach bereits abgeschlossener Reflexion, Wiederherstellung oder Import bleiben protokolliert;
sie ändern das Ergebnis des bereits erfolgreichen Hauptvorgangs nicht nachträglich.

Sieben zusätzliche Frontend-Regressionstests prüfen Fehler/Wiederholen, Sperren, Reiterwechsel, Schließen und verspätete Ergebnisse.
Der zusätzliche E2E-Test prüft echte SQLite-Lese- und Schreibfehler, erhaltene Texte, fehlende Erfolgsmeldungen
und erneutes Speichern/Nachladen im Wegwerfprofil.

Offen bleiben weitere Chat-Editoren und einheitlich sichtbare Fehler beim Nachladen der übrigen Memory-Daten.
Sämtliche Entwürfe bleiben nur während der gemounteten Chatansicht erhalten; eine dauerhafte Entwurfssicherung ist weiterhin offen.

Der abschließende aktuelle Build bestand `npm run e2e` auf einem separaten Xvfb-Display mit allen zwölf Szenarien.
Die gesperrte Desktop-Sitzung hatte zuvor WebKit-Screenshots und Animationsabfragen blockiert;
Xvfb wurde ausschließlich als temporäres Testwerkzeug verwendet. Ein veralteter WebDriver-Elementverweis
im Entwurfstest wurde durch Auswahl des aktuellen Felds behoben.
Screenshot `e2e/screenshots/32-markdown-ladefehler.png` wurde visuell geprüft: Der Entwurf und die tatsächliche
Ladefehlerursache sind sichtbar. Ein dabei gefundener Übersetzungs-Platzhalterfehler wurde in allen drei Sprachen
korrigiert und durch Prüfung der konkreten Fehlermeldung abgesichert.

#### Fünftes Arbeitspaket – 03.10.2026

Der Inline-Nachrichteneditor schließt erst nach erfolgreichem Schreiben. Der Store gibt Schreibfehler weiter,
und die Oberfläche zeigt sie mit der konkreten Ursache an. Bei Fehlern bleibt der bearbeitete Text erhalten,
während der gespeicherte Nachrichtentext unverändert bleibt. Erneutes Speichern übernimmt die Korrektur.
Leere Entwürfe schließen den Editor nicht und werden nicht geschrieben.

Text, Speichern und Abbrechen sind während des Schreibens gesperrt. Die Swipe-Navigation ist während
geöffneter Bearbeitung gesperrt, damit der Entwurf nicht versehentlich eine andere Antwortvariante korrigiert.
Ein verspätetes Ergebnis nach einem Chatwechsel aktualisiert den aktuell sichtbaren Verlauf nicht.

Sechs zusätzliche Frontend-Tests prüfen Fehler/Wiederholen, Sperren und Doppelsenden, leere Entwürfe,
Abbrechen, Variantenwechsel und verspätete Speicherergebnisse. Ein neuer E2E-Test erzwingt einen echten
SQLite-Schreibfehler im Wegwerfprofil und prüft ursprünglichen Datenbanktext, erhaltenen Entwurf und Wiederholung.

Offen bleiben Umbenennen, Author's Note und Zusammenfassung in der Chat-Seitenleiste sowie einheitliche
Lesefehler der übrigen Memory-Daten. Inline-Entwürfe sind noch nicht über Virtualisierung oder Chatwechsel hinweg gesichert.
Das Abgleichen abgeleiteter Zusammenfassungen und Erinnerungen nach Nachrichtenkorrekturen bleibt in Abschnitt 4 offen.

`npm run check` bestanden: 358 Rust-Tests und 130 Frontend-Tests.
Der aktuelle Build bestand `npm run e2e` unter Xvfb mit allen 13 Szenarien.
Screenshot `e2e/screenshots/33-chat-bearbeitungsfehler.png` wurde visuell geprüft: Entwurf,
erneut verfügbare Speicheraktionen und die konkrete Fehlerursache sind vollständig sichtbar.
Die erste Prüfung in der Sandbox scheiterte an gesperrten lokalen Testports;
mit erweitertem Zugriff liefen die Prüfungen erfolgreich durch.

#### Sechstes Arbeitspaket – 03.10.2026

Titelbearbeitung schließt erst nach erfolgreichem Speichern. Author's Note, Zusammenfassung und Zurücksetzen
melden Schreibfehler mit konkreter Ursache; Erfolgsmeldungen erscheinen ausschließlich nach Erfolg.
Die betroffenen Felder und Aktionen sind während des Schreibens gesperrt, auch nach Wiederöffnen.

Notiz- und Zusammenfassungsentwürfe liegen nach Chat-ID getrennt in der Seitenleiste. Schließen, Reiterwechsel,
Chatwechsel und externe Änderungen an Sitzungsdaten überschreiben offene Entwürfe nicht.
Ein verspäteter Speichervorgang entfernt ausschließlich den Entwurf des ursprünglichen Chats und Felds.
Die Notiztiefe 0 wird beim Laden und Speichern erhalten; zuvor ersetzte ein Fallback sie durch 2.

Umbenennen und Author's Note geben Fehler weiter. Nach erfolgreichem Schreiben wird nur die betroffene
Sitzung im Store angepasst, ohne einen zweiten Ladevorgang, der den Schreibstatus verfälschen könnte.
Sieben Frontend-Regressionstests prüfen Fehler/Wiederholen, Sperren, leere Titel, Entwurfserhalt,
Chatwechsel, verspätete Ergebnisse und Zusammenfassungs-Reset.
Ein E2E-Test erzwingt echte SQLite-Schreibfehler für alle drei Editoren und das Zurücksetzen im Wegwerfprofil.

Offen bleiben einheitlich sichtbare Lesefehler für übrige Memory-Daten sowie die weiteren offenen Punkte
in Abschnitt 2. Entwürfe sind nicht dauerhaft gesichert und überleben kein Unmount der Chatansicht.
Konflikte mit laufender automatischer Zusammenfassung und das Abgleichen abgeleiteter Daten bleiben gesonderte Arbeit.

`npm run check` bestanden: 358 Rust-Tests und 137 Frontend-Tests.
Der aktuelle Build bestand `npm run e2e` unter Xvfb mit allen 14 Szenarien.
Screenshots `34-chat-titelfehler.png`, `35-chat-notizfehler.png` und
`36-chat-zusammenfassungsfehler.png` wurden visuell geprüft: Die erhaltenen Entwürfe,
Speicheraktionen und konkreten Fehlerursachen sind vollständig sichtbar.

#### Siebtes Arbeitspaket – 03.10.2026

Memory-Übersicht (Psychologie, Beziehung, Episoden, Tagebuch, Heilungsprotokoll) und Snapshot-Liste
halten Lesefehler im Store fest und zeigen sie mit konkreter Ursache im Drawer an. Bereits geladene
Daten und offene Entwürfe bleiben erhalten; ein Hinweis erklärt, dass die Daten veraltet sein können.
Leere Listen werden bei einem Ladefehler oder laufendem Abruf nicht als fehlende Einträge dargestellt.
Übersicht und Snapshots können unabhängig erneut geladen werden; Erfolg entfernt den jeweiligen Fehlerhinweis.

Nur der neueste Abruf im noch passenden Kontext darf Daten, Fehler und Ladezustand aktualisieren.
Charakterwechsel leert auch die Snapshot-Liste und alte Fehler; Personawechsel leert den Fehler der Übersicht.
Erfolgreiche Schreibvorgänge bleiben erfolgreich, wenn das anschließende Nachladen fehlschlägt.
Das verhindert, dass Wiederholen eines vermeintlich gescheiterten Schreibvorgangs doppelte Einträge anlegt.

Die Snapshot-Auflistung im Backend behandelt ausschließlich ein fehlendes Verzeichnis als leere Liste.
Fehler bei Verzeichnis- oder Metadatenzugriff werden weitergegeben statt eine unvollständige Liste anzuzeigen.
Elf Frontend-Tests prüfen Ladefehler/Wiederholen, erhaltene Daten und Entwürfe, leere Erstladeansichten,
überholte Antworten, Kontextwechsel und erfolgreiche Schreibvorgänge mit fehlgeschlagenem Nachladen.
Zwei Rust-Tests prüfen fehlendes versus ungültiges Backup-Verzeichnis und fehlerhafte Snapshot-Metadaten.
Ein neuer E2E-Test erzwingt SQLite- und Dateisystem-Lesefehler im Wegwerfprofil und prüft auch einen erfolgreichen
Erinnerungseintrag bei fehlgeschlagenem Nachladen.

Offen bleiben weitere Fehlerpfade bei Reflexion/Import/Wiederherstellung sowie allgemeine Entwurfssicherung,
Generierungsfehler und Konsistenz nach Verlaufsänderungen. Entwürfe sind weiterhin nur im gemounteten Chat gesichert.

`npm run check` bestanden: 360 Rust-Tests und 148 Frontend-Tests.
Der aktuelle Build bestand `npm run e2e` unter Xvfb mit allen 15 Szenarien.
Screenshots `37-memory-uebersicht-ladefehler.png` und `38-memory-snapshot-ladefehler.png`
wurden visuell geprüft: Entwurf bzw. gecachte Snapshot-Liste, konkrete Ursache,
Hinweis auf möglicherweise veraltete Daten und Wiederholen sind vollständig sichtbar.

#### Achtes Arbeitspaket – 03.10.2026

SoW-Import liest alle vorhandenen Dateien vor dem Schreiben. Fehlende optionale Dateien bleiben erlaubt;
ungültige UTF-8-Dateien, falsche Verzeichnisarten und Zugriffsfehler werden weitergegeben. Import und
Snapshot-Wiederherstellung schreiben Psychologie, Beziehung, Episoden, Tagebuch und Heilungsprotokoll
jeweils in einer SQLite-Transaktion. Auch ein später Fehler rollt alle Änderungen dieses Vorgangs zurück.
Die verbindungsgebundenen SQL-/Markdown-Helfer werden ebenfalls von den bisherigen einzelnen APIs verwendet.

Die Wiederherstellung löst den Dateinamen aus der Oberfläche jetzt im Backup-Verzeichnis des ausgewählten
Charakters auf; zuvor wurde der Dateiname als Pfad im Arbeitsverzeichnis gesucht.
Psychologie und Beziehung werden übernommen, Sammlungen werden ergänzt. Der Bestätigungstext benennt dies
nun korrekt. Wiederholte erfolgreiche Wiederherstellungen können weiterhin Tagebucheinträge duplizieren;
ein vollständiger Austausch der Sammlungen oder weitere Deduplizierung ist nicht Teil dieses Pakets.
Snapshot-Erstellung gibt Leseprobleme weiter und schreibt kein unvollständiges Backup bei SQL-Lesefehlern.

Reflexion gibt Fehler weiter, setzt ihren Beschäftigtzustand zuverlässig zurück und hält Fehler auch für
automatische Vorgänge sichtbar. Lese-, Snapshot-, Heilungsprotokoll-, Themen- und Tagebuch-Schreibfehler
werden nicht mehr verschluckt. Der automatische Snapshot muss vor dem Anwenden der Patches erstellt werden.
Die mehrstufige Reflexion ist weiterhin nicht atomar: Spätere Fehler können bereits gespeicherte Änderungen
zurücklassen. Der Fehlerhinweis fordert deshalb zur Prüfung der Daten und des Snapshots vor erneutem Start auf.

Import, Wiederherstellung, Snapshot-Erstellung und Reflexion sind gegenseitig gesperrt, solange ein Vorgang läuft,
auch über Reiterwechsel und Schließen hinweg. Verspätete Reflexionsresultate und Nachladevorgänge wechseln nicht
in einen anderen Charakter-/Persona-Kontext. Markdown-Lesefehler nach erfolgreichem Schreiben bleiben separat
sichtbar; Wiederholen lädt nur die Texte und erhält Entwürfe.

Vier Rust-Regressionstests prüfen späte Rollbacks und Wiederholen, ungültige Importdateien/-verzeichnisse
und das Verhindern eines unvollständigen Snapshots. Zehn Frontend-Tests prüfen sichtbare Reflexionsfehler,
Wiederholen, Sperren, Kontextwechsel, Import-/Wiederherstellungsfehler und erfolgreiches Schreiben bei
fehlgeschlagenem Markdown-Nachladen. Ein E2E-Test prüft reale Reflexionsfehler sowie Transaktions-Rollbacks
und Wiederholen für Import und Wiederherstellung im Wegwerfprofil.

Offen bleiben atomare Reflexion, vollständige Snapshot-/Wiederherstellungssemantik, allgemeine Entwurfssicherung,
Chat-Generierungsfehler und Konsistenz nach Verlaufsänderungen.

`npm run check` bestanden: 364 Rust-Tests und 158 Frontend-Tests.
Der abschließende aktuelle Build bestand `npm run e2e` unter Xvfb mit allen 16 Szenarien.
Der erste Lauf stoppte an einer reservierten `error`-Eigenschaft in der Rückgabe des Import-Testcodes;
nach Änderung der Test-Rückgabe und Ergänzung des Schutzes für Kontextwechsel wurde der aktuelle Build erneut geprüft.
Screenshots `39-memory-reflexionsfehler.png` und `40-memory-wiederherstellungsfehler.png` wurden visuell geprüft:
Die konkreten Fehlerursachen, erneute Aktionen und der Hinweis auf mögliche Teiländerungen sind sichtbar.

#### Neuntes Arbeitspaket – 04.10.2026

Senden, Neu generieren und Fortsetzen behandeln Promptaufbau und Antwortspeicherung im selben Fehlerpfad.
Der Generierungszustand wird in `finally` zurückgesetzt; die Sperre gilt beim Senden bereits während
Sitzungserstellung, Upload und Nutzernachricht-Speicherung. Parallele Generierungsaufrufe werden ignoriert.
Upload-/Nutzernachricht-Schreibfehler geben den ungespeicherten Text und Dateien an den Composer zurück,
ohne inzwischen neu getippte Eingaben zu überschreiben. Eine fehlende aktive Sitzung wird ausdrücklich gemeldet.

Fehler nach Speicherung der Nutzernachricht werden separat und sichtbar im Composer gehalten, statt eine
ungespeicherte Fehlermeldung als vermeintliche Assistentenantwort einzufügen. Wiederholen verwendet die ID der
bereits gespeicherten Nutzernachricht. Swipe und Fortsetzen wiederholen ebenfalls ihre ursprüngliche Aktion.
Ein fehlgeschlagener Antwort-Schreibvorgang verändert HUD, Kontextanzeige und Zusammenfassung nicht.
Wiederholen nach einem Antwort-Schreibfehler erzeugt eine neue Modellantwort; die gescheiterte Antwort wird noch nicht zwischengespeichert.

Abbruch verhindert eine Anfrage nach noch laufendem Upload/Promptaufbau und verwirft eine noch nicht
zur Speicherung übergebene Antwort. Bereits laufende Datenbankschreibvorgänge bleiben wirksam.
Die Sperre bleibt bis zum Abschluss des ursprünglichen Vorgangs bestehen, damit kein zweiter Chatlauf den
gemeinsamen nativen Abbruch-Merker zurücksetzt. Abbruchfehler werden angezeigt. Stream-Puffer werden nach
Fehler/Abbruch geleert; native Chat-Ereignisse werden nur für den zugehörigen aktiven Chat angezeigt.
Verspätete Prompt-, Modell- und Speicherresultate überschreiben keinen anderen sichtbaren Chat.
Fehlgeschlagenes Nachladen der Sitzungsliste nach erfolgreichem Schreiben wird separat protokolliert.

Fünfzehn Frontend-Tests prüfen Prompt-/Upload-/Streaming-/Schreibfehler, sichtbares Wiederholen ohne doppelte
Nutzernachricht, Vorbereitungssperren, Abbruchfehler, Abbruch während Prompt-/Nutzernachricht-Speicherung
und verspätete Modell-/Schreibergebnisse nach Chatwechsel. Ein E2E-Test erzwingt echte SQLite-Schreibfehler
für Nutzer- und Assistentennachricht im Wegwerfprofil und prüft Entwurfserhalt und Wiederholen.

Offen bleiben vollständig geordnete Sitzungswechsel, ein Generationstoken in nativen Ereignissen,
Abbruch bei blockierenden Netzwerk-/Vorbereitungsschritten und die Wiederaufnahme einer abgebrochenen
Antwort. Upload-Dateien können nach einem späteren Fehler verwaist zurückbleiben. Der gesamte Punkt zu
Sitzungswechseln sowie die umfassende Abbruch-Abnahme bleiben deshalb offen.

`npm run check` bestanden: 367 Rust-Tests im aktuellen Arbeitsstand und 173 Frontend-Tests.
Der aktuelle Build wurde mit `npm run e2e` erstellt. Der erste Gesamtlauf stoppte im neuen Test,
weil der Fehler-Toast den Senden-Knopf überlagerte. Der Test schließt den Hinweis jetzt ausdrücklich,
bevor er den nächsten Fehlerpfad prüft. Der korrigierte Einzeltest und der anschließende vollständige
Lauf mit `npm run e2e:run` unter Xvfb bestanden alle 17 Szenarien.
Screenshot `41-chat-generierungsfehler.png` wurde visuell geprüft: Die Nutzernachricht steht genau einmal
im Verlauf; konkrete Antwort-Schreibfehlerursache und Wiederholen-Knopf sind vollständig sichtbar.
Die parallel entstandenen Änderungen an optionalen Inhalten gehören nicht zu diesem Arbeitspaket.

#### Zehntes Arbeitspaket – 04.10.2026

Sitzungsauswahl, Sitzungsliste und Chat-Erstellung prüfen nach jedem asynchronen Schritt eine Abrufnummer
und den Charakter-Kontext. Nur der zuletzt gestartete Vorgang darf den sichtbaren Zustand ändern.
Der Verlauf wird beim Wechsel sofort ausgeblendet, statt unter einem anderen Sitzungstitel stehen zu bleiben.
`isChatLoading` kennzeichnet die Ladephase; `chatLoadError` hält die Ursache sichtbar. Wiederholen lädt nur
den Verlauf bzw. die Sitzungsliste. Der Composer behält seinen Entwurf und sperrt Senden bis zum erfolgreichen Laden.
Fehler der automatischen Chat-Erstellung geben ihre Ursache an den Composer weiter, bevor eine Nutzernachricht geschrieben wird.
Späte Stimmenkonfigurationen eines anderen Charakters und Sitzungslisten eines früheren Navigationszustands werden ignoriert.

Navigation stoppt ausstehende Chat-Sprachausgabe und fordert den Abbruch der laufenden Generierung an. Generierungsresultate prüfen zusätzlich die
Abrufnummer; auch A → B → A kann eine alte Modellantwort nicht in den aktuellen Verlauf übernehmen.
Ein bereits laufender Datenbankschreibvorgang bleibt wirksam, aber sein spätes Ergebnis überschreibt keinen
neu geladenen Verlauf. Ein nach Navigation erstellter Chat wird nicht durch ein älteres Hintergrund-Listenresultat verdrängt.

Das Backend meldet Abbruch über einen Watch-Signalzähler. `with_abort` beendet wartende asynchrone Vorbereitung,
HTTP-Anfragen ohne Antwortheader und SSE-Streams ohne weitere Daten, indem deren Futures fallen gelassen werden.
Der Abbruch-Merker wird am Anfang des Chat-Commands zurückgesetzt; eine spätere Stream-Initialisierung
löscht ihn nicht erneut. Das Zurücksetzen für eine neue Runde macht alte Wartevorgänge nicht wieder gültig.
Abbruch spült auch keine unvollständigen Thought-Tags aus dem Stream-Puffer als Nachrichtentext nach.
Direkte interne Generierungen und synchrone Datei-/Datenbankvorgänge behalten ihre bisherige Semantik.

Drei Rust-Tests prüfen antwortlose HTTP-Anfragen, inaktive Streams mit unvollständigem Tag und Abbruch
mit unmittelbar folgendem Zurücksetzen. Dreizehn zusätzliche Frontend-Tests prüfen überlappende Abrufe,
Lesefehler/Wiederholen, Sendesperren, Charakterwechsel, automatische Erstellung, verspätete Stimmenkonfiguration
und A → B → A bei fehlgeschlagenem Navigationsabbruch. Ein neuer E2E-Test prüft reale SQLite-Lesefehler,
Entwurfserhalt, geschlossene HTTP-Verbindungen beim Abbruch/Chatwechsel und Antworten im richtigen neuen Chat.

Offen bleiben IDs in nativen Stream-Ereignissen, sofortiges Beenden noch laufender Frontend-Prompt-/Upload-
Vorbereitung, Wiederaufnahme abgebrochener Antworten und die Koordination paralleler Chat-/Stage-Vorgänge.
Chat-Erstellung ist mehrstufig; Fehler nach der ersten Datenbankanlage können eine leere Sitzung zurücklassen.
Die umfassende Generierungs-/Abbruch-Abnahme bleibt deshalb offen.

Validierung: Der vollständige Check besteht mit 370 Rust-Tests (6 absichtlich ignoriert) und 186 Frontend-Tests.
Alle 18 E2E-Szenarien bestehen unter Xvfb mit dem frisch gebauten aktuellen App-Stand. Der vorhandene
Nachrichten-Editor-Test wartet nun auf den klickbaren Bearbeiten-Knopf und den tatsächlich geöffneten Editor;
damit bleibt die Prüfung auch bei verzögertem Hover-/Layout-Update stabil. Screenshot
`e2e/screenshots/42-chat-verlauf-ladefehler.png` wurde geprüft: Ursache und Wiederholen sind sichtbar,
der Entwurf bleibt erhalten und der alte Verlauf wird ausgeblendet. Parallel entstandene Änderungen
an optionalen Inhalten gehören nicht zu diesem Arbeitspaket.

#### Elftes Arbeitspaket – 04.10.2026

Jeder Lauf beim Senden, Neu-Generieren, Fortsetzen oder Wiederholen erhält eine neue UUID im Store.
Der Chat-Command reicht sie separat von der Modell-Payload an die Inferenz weiter. Native Tokens,
Gedanken, Abschlussereignisse und das Command-Ergebnis enthalten dieselbe `generation_id`.
Die API-Listener nutzen die aus Rust generierten Ereignistypen. Interne Modell-Anfragen und Stage
behalten ihre eigenen bisherigen Ereignisse; die ID wird nicht an den Modellanbieter gesendet.

ChatView nimmt Ereignisse nur bei laufender Generierung, passender ID und passender Sitzung an.
Fremde Abschlüsse dürfen weder den aktuellen Stream leeren noch Sprachausgabe oder Emotionserkennung
starten. Navigation und Abbruch verwerfen die ID; scheitert der Abbruch im unveränderten Kontext,
wird die ursprüngliche ID wieder eingesetzt. Eine neue Anfrage im selben Chat erhält trotzdem eine neue ID.
Nach Anfrageende bleibt die letzte ID für noch laufende Emotionserkennung erhalten; deren
Resultat prüft nach dem Await erneut ID und Sitzung, damit ein neuer Lauf es zuverlässig entwertet.

Die zuletzt übernommenen Stream-Tests wurden um die Anfrage-IDs erweitert: Fremde Ereignisse,
anonyme/abgebrochene Ereignisse sowie passende und verspätete Emotionserkennung werden geprüft.
Ein weiterer Frontend-Test prüft unterschiedliche IDs im selben Chat. Ein Rust-Test prüft die
ID im serialisierten Ereignisvertrag. Der Sitzungs-E2E-Test injiziert zusätzlich alte native Ereignisse
während einer antwortlosen Anfrage und prüft, dass sie nicht angezeigt werden.

Die zunächst uncommittete Umsetzung wurde nach den zwischenzeitlichen Übersetzungsänderungen
auf dem aktuellen Stand erneut integriert. Ergebnisse des vorherigen Builds gelten deshalb
nicht als Abnahme dieses neuen Stands.

Offen bleiben sofortiges Beenden der Frontend-Prompt-/Upload-Vorbereitung, Wiederaufnahme abgebrochener
Antworten und die Koordination paralleler Chat-/Stage-Vorgänge mit ihrem gemeinsamen Abbruch-Merker.
Die ID filtert native Chat-Ereignisse; sie ersetzt keine getrennten Abbruchkanäle dieser Bereiche.

Validierung auf dem aktuellen Stand: 371 Rust-Tests (6 im Bibliothekslauf absichtlich ignoriert)
und 191 Frontend-Tests bestehen; Formatierung, Clippy, Lint und TypeScript sind geprüft.
`npm run e2e` hat den aktuellen Build erstellt; der erste Lauf stoppte im vorhandenen
Seitenleisten-Test, weil der Hover-Klick das Umbenennen-Feld noch nicht geöffnet hatte.
Der Test wartet nun auf den klickbaren Knopf und das tatsächlich geöffnete Feld.
Der korrigierte Einzeltest und der vollständige Lauf mit `npm run e2e:run` unter Xvfb
bestehen alle 18 Szenarien. Screenshot `e2e/screenshots/43-chat-stream-identitaet.png`
wurde visuell geprüft: Keine fremden Tokens/Gedanken erscheinen, Abbruch bleibt verfügbar.
Die bereits committeten Übersetzungsänderungen bleiben erhalten; optionale Inhalte werden nicht mitcommittet.

#### Zwölftes Arbeitspaket – 04.10.2026

Chat und Soul Stage besitzen im AppState getrennte Inferenz-Clients und damit eigene Abbruch-Merker
und Watch-Signalzähler. Stage-Runden, Neu-Generieren und Rast nutzen den Stage-Client; der Chat
behält seinen Client. Der neue Command `abort_stage_turn` beendet nur Stage-Anfragen. Der
Stage-Stoppknopf ruft diesen Befehl auf, statt den Chat-Abbruch zu verwenden. Autoplay und
Stage-Sprachausgabe werden beim Stage-Stopp weiterhin abgeschaltet.

Ein Rust-Test startet wartende Futures in beiden Bereichen und prüft, dass weder Abbruch noch
Zurücksetzen den jeweils anderen Bereich beeinflussen. Zwei Frontend-Tests prüfen die Befehlswahl,
Autoplay/Sprachausgabe und Weitergabe eines Stage-Abbruchfehlers ohne Chat-Abbruch.
Der bestehende Sitzungs-E2E-Test prüft zusätzlich echte wartende HTTP-Anfragen in beiden Richtungen:
Stage-Abbruch erhält die Chat-Verbindung, Chat-Abbruch erhält die Stage-Verbindung; der jeweils
zuständige Stopp beendet anschließend die Anfrage.

Offen bleiben die Koordination mehrerer Runden innerhalb desselben Bereichs, sofortiger Abbruch
von Stage-Planung/direkten internen Modell-Aufrufen und Frontend-Prompt-/Upload-Vorbereitung sowie
Wiederaufnahme abgebrochener Antworten. Die Trennung betrifft die Abbruchsignale, nicht eine
Ressourcenplanung für gleichzeitig laufende Modelle oder getrennte Zugriffe auf den Stage-Weltzustand.

Validierung: Der vollständige Check besteht mit 372 Rust-Tests (6 im Bibliothekslauf absichtlich
ignoriert) und 193 Frontend-Tests. `npm run e2e` hat den aktuellen App-Stand frisch gebaut und
alle 18 Szenarien unter Xvfb erfolgreich abgeschlossen, einschließlich der Abbruchprüfung
in beiden Richtungen. Screenshot `e2e/screenshots/44-stage-getrennter-abbruch.png` wurde
visuell geprüft: Stage bleibt nach einem Chat-Abbruch aktiv und bietet seinen eigenen Stopp an.
Optionale Inhalte bleiben außerhalb dieses Arbeitspakets.

#### Dreizehntes Arbeitspaket – 04.10.2026

Der Stage-Planer wartet nicht mehr bis zum Antwortende, nachdem Stopp gedrückt wurde. Sein interner
Modell-Aufruf liegt in `with_abort`; dies beendet auch wartende HTTP-Header oder Antwortkörper.
Die gemeinsame Sprecher-Vorbereitung `history::prepare` liegt ebenfalls in diesem Abbruchrahmen:
Kontextzählung, Kontextanpassung und interne Zusammenfassungen sind damit abbrechbar. Abbruch
liefert ausdrücklich `None`, statt eine leere oder unvollständige Modellanfrage weiterzugeben.

Planer, Erzähler und Charaktere beenden die Runde bei abgebrochener Vorbereitung über `finish_turn`.
Auch ein abgebrochener Planer-Aufruf endet dort, bevor ein Ersatzplan, Mechanik oder neue Erzählung
angewendet wird. Die bereits eingegebene Spielerzeile und zuvor abgeschlossene Arbeit bleiben
im Szenenzustand gespeichert; der aktuelle Sprecher wird wieder PLAYER. Die Runde ist keine
Transaktion: bereits erfolgte Zustandsänderungen und fertig erstellte Zusammenfassungen bleiben bestehen.
Abgebrochene Zusammenfassungen rücken ihren Cursor nicht weiter.

Zwei Rust-Tests prüfen einen direkten Modell-Aufruf mit begonnenem, aber nicht abgeschlossenem
Antwortkörper und eine bereits abgebrochene Kontextvorbereitung ohne Änderung an Verlauf/Zusammenfassung.
Der Sitzungs-E2E-Test stoppt zusätzlich einen Planer ohne HTTP-Antwort, prüft die gespeicherte Spielerzeile,
unveränderte Welt und das Ausbleiben einer neuen Erzähler-Anfrage. Nach erneutem Laden bleibt die Zeile
erhalten; die nächste normale Runde funktioniert wieder.

Offen bleiben Abbruch von Routing sowie Archiv-/Konsistenz-Aufrufen am Rundenende, Koordination mehrerer
Runden im selben Bereich, Frontend-Prompt-/Upload-Vorbereitung und Wiederaufnahme abgebrochener Antworten.
Interne direkte Modellaufrufe außerhalb der Stage-Planung behalten ihre bisherige Abbruchsemantik.

Validierung: Der vollständige Check auf dem aktuellen Stand besteht mit 371 Rust-Tests
(6 im Bibliothekslauf absichtlich ignoriert) und 195 Frontend-Tests. `npm run e2e` hat den
aktuellen Build erstellt. Der erste Lauf bestand den neuen Planungsabbruch, stoppte danach
aber im vorhandenen Seitenleisten-Test an einer veralteten DOM-Referenz beim Schließen
des erfolgreich gespeicherten Titelfelds. Die Warteabfrage prüft nun direkt die Abwesenheit
des Felds im DOM. Der korrigierte Einzeltest und der vollständige Lauf mit `npm run e2e:run`
unter Xvfb bestehen alle 18 Szenarien. Screenshot `e2e/screenshots/45-stage-planungsabbruch.png`
wurde geprüft: Die Spielerzeile steht im Verlauf, die wartende Planung bietet Stopp an.
Die committeten Änderungen zur Titelanpassung bleiben erhalten.

#### Vierzehntes Arbeitspaket – 04.10.2026

Routing, Arc-Archivierung und Faktenprüfung verwenden ebenfalls `with_abort`. Stopp beendet
wartende Modell-Anfragen auch ohne HTTP-Antwort. Nach abgebrochenem Routing endet die Runde
über `finish_turn`, ohne eine Ersatzfigur sprechen zu lassen. Fertige Beiträge bleiben gespeichert.
Ein abgebrochener Archiv-Aufruf legt keinen Ersatzarchiveintrag an; der abgeschlossene Arc bleibt
für die nächste Runde offen. Bereits fertig archivierte Arcs werden weiterhin nicht doppelt bearbeitet.

Eine abgebrochene Faktenprüfung verändert keine Fakten und behält den fälligen Prüfungszähler.
Die nächste Runde prüft erneut. Erst ein tatsächlich beendeter Aufruf setzt den Zähler wie bisher
zurück; reguläre Fehler/ungültige Antworten behalten ihre bisherige Behandlung. Nach bereits
angefordertem Stage-Stopp wird keine Prüfung gestartet und der Zähler nicht weiter erhöht.
Ein gesättigtes Hochzählen verhindert Überlauf bei wiederholt abgebrochener fälliger Prüfung.

Ein Rust-Test prüft, dass bereits gestoppte Archiv-/Faktenarbeit den Zustand unverändert lässt.
Ein neuer E2E-Test hält reale HTTP-Anfragen für alle drei Schritte an, stoppt über die UI und
prüft die geschlossenen Verbindungen. Fertige Beiträge bleiben erhalten; Archiv/Faktenprüfung
werden nach Abbruch in einer neuen Runde nachgeholt. Fakten und fälliger Zähler bleiben auch
nach erneutem Laden erhalten, das Archiv wird genau einmal geschrieben.

Offen bleiben mehrere konkurrierende Runden im selben Bereich, Frontend-Prompt-/Upload-Vorbereitung,
Wiederaufnahme abgebrochener Antworten und die Fehlerbehandlung direkter Modell-Aufrufe.
Bereits ausgeführte Mechanik und abgeschlossene Beiträge werden durch Stopp nicht zurückgerollt.

Validierung: `npm run check` besteht mit 372 Rust-Tests (6 im Bibliothekslauf absichtlich
ignoriert) und 195 Frontend-Tests. `npm run e2e` baut die aktuelle App und besteht unter Xvfb
alle 19 Szenarien. Der neue Einzeltest bestand ebenfalls; seine Szene enthält eine zweite
Figur, damit tatsächlich eine Routing-Anfrage entsteht. Screenshot
`e2e/screenshots/46-stage-rundenende-abbruch.png` wurde geprüft: Die Faktenprüfung wartet,
die fertigen Beiträge stehen im Verlauf und Stopp bleibt erreichbar.

#### Fünfzehntes Arbeitspaket – 04.10.2026

Native Chat-Anfragen erhalten eine eigene Sperre im AppState. Stage-Runde, Neu-Generieren
und Rast teilen eine zweite Sperre. `try_lock` lehnt konkurrierende Aufrufe sofort ab;
keine zusätzliche Anfrage wird eingereiht. Die Prüfung erfolgt vor Abbruch-Reset,
Kontextvorbereitung und Änderungen am Szenenzustand. Chat und Stage können unabhängig
voneinander laufen. Guards werden bei Erfolg, Fehler und Abbruch automatisch freigegeben;
die Stage-Rundensperre umfasst auch die abschließende Memory-Übernahme im Command.

Chat meldet einen neuen Fehlercode mit deutscher, englischer und russischer Übersetzung.
Stage verwendet den bestehenden Hinweis auf eine laufende Runde. Der Sitzungs-/Abbruch-E2E-Test
ruft die nativen Befehle zusätzlich direkt auf: Eine zweite Chat-Anfrage sowie Stage-Runde,
Neu-Generieren und Rast müssen während laufender Inferenz sofort scheitern. Modell-Anfragezahlen,
Verbindungsabbruch und Szenenzustand zeigen, dass die erste Anfrage davon unberührt bleibt.
Nach einem fehlgeschlagenen Stage-Rastaufruf funktioniert die nächste Runde; nach einem
Chat-Netzwerkfehler funktioniert die nächste native Anfrage. Bestehende Abbruch- und
Sitzungswechselprüfungen decken die erneute Freigabe nach Stopp und erfolgreichem Abschluss ab.

Die Sperren koordinieren diese nativen Commands. Andere Stage-Editor-/Navigationsbefehle,
interne Modellaufrufe und die Frontend-Antwortspeicherung liegen außerhalb ihres Umfangs.
Offen bleiben insbesondere sofortiger Abbruch laufender Frontend-Prompt-/Upload-Vorbereitung,
Wiederaufnahme abgebrochener Antworten und die Koordination von Stage-Verlaufsänderungen
mit einer laufenden Runde.

Validierung bewusst auf die Änderung begrenzt: Rust-Formatierung und Clippy (`--lib`,
Warnungen als Fehler), Lint für die betroffenen Übersetzungen und den E2E-Test sowie
TypeScript bestehen. Der aktuelle App-Build besteht unter Xvfb den erweiterten
`chat-sessions-abort.mjs` und `stage-upkeep-abort.mjs`. Die Screenshots
`45-stage-planungsabbruch.png` und `46-stage-rundenende-abbruch.png` wurden erneut geprüft:
Die ursprüngliche Runde bleibt nach abgelehnten Zusatzaufrufen bedienbar; Stopp ist erreichbar.
Die vollständige Test-Suite wurde für dieses abgegrenzte Paket nicht erneut gestartet.

#### Sechzehntes Arbeitspaket – 04.10.2026

Senden, Neu-Generieren und Fortsetzen besitzen je einen AbortController für die Vorbereitung.
Nach erfolgreichem nativen Stopp beendet `waitWithAbort` das Warten auf Promptaufbau und
Datei-Lesen, ohne deren Ergebnis abzuwarten. Späte Erfolge und Fehler werden konsumiert;
sie starten keine neue Modell-Anfrage und beeinflussen keinen späteren Lauf. Ein gescheiterter
nativer Abbruch lässt die Vorbereitung dagegen weiterlaufen und behält die bestehende Fehlermeldung.

Lorebook-Auswertung und deren Ersatzabfragen sowie Prompt-Zusammenbau nutzen dasselbe Signal.
Abgebrochene Lore-Auswertung verändert weder Spannung noch Warnton und startet keine weiteren
Fallback-Abfragen. Datei-Lesen prüft das Signal vor der Base64-Aufbereitung. Anhänge werden
nacheinander vorbereitet und gespeichert, damit Stopp weitere Uploads verhindert.

Bereits gestartete native Datei-/Datenbankschreibvorgänge werden weiterhin abgewartet und behalten
die Sendesperre. Die darunterliegende Blob-/IPC-Arbeit wird nicht physisch beendet; ihr spätes
Resultat wird verworfen. Bereits geschriebene Anhänge können ohne gespeicherte Nutzernachricht
zurückbleiben. Ungespeicherte Texte/Dateien werden über den bestehenden Composer-Fehlerpfad erhalten.
Gespeicherte Nutzernachrichten bleiben bei abgebrochener Promptvorbereitung im Verlauf.

Gezielte Tests prüfen sofortiges Ende wartender Vorbereitung für alle drei Chat-Aktionen,
späte Datei-/Promptresultate nach einem neuen Lauf und das Abwarten begonnener Upload-Schreibvorgänge.
Der bisherige Uploadfehlertest erhält außerdem eine explizite Datei-Leseimplementierung,
damit er den tatsächlichen Uploadfehler und nicht eine fehlende jsdom-Blob-Methode prüft.
Zwei Tests mit der echten Lore-Promptfunktion prüfen späte Erfolge und Fehler ohne Nebenwirkungen.
Der Chat-E2E-Test hält die Prompt-IPC-Transportantwort an, stoppt über den Composer und prüft
Sendebereitschaft ohne Promptresultat, wirkungslose späte Antwort und den nächsten normalen Chatlauf.

Offen bleiben Wiederaufnahme abgebrochener Antworten, Bereinigung verwaister Anhänge und
Koordination von Stage-Verlaufsänderungen mit laufenden Runden.

Validierung gezielt: 39 Frontend-Tests aus Generierungs-, Sitzungs-, Stream- und Prompt-Abbruchtests
bestehen; ein zusätzlich ergänzter Test für fehlgeschlagenen nativen Stopp besteht ebenfalls
(40 geprüfte Fälle insgesamt). Lint und TypeScript bestehen. Die frisch gebaute App besteht unter
Xvfb den erweiterten `chat-generation-errors.mjs`. Im ersten Lauf konnte die Testvorrichtung die
schreibgeschützte Tauri-Aufruffunktion nicht ersetzen; die korrigierte Vorrichtung hält stattdessen
die Prompt-Transportantwort über fetch an. Screenshot `48-chat-vorbereitungsabbruch.png` wurde
geprüft: Die gespeicherte Spielerzeile bleibt sichtbar und der neue Entwurf ist sendebereit.
Die vollständige Suite und unveränderte Rust-Tests wurden nicht erneut ausgeführt.

#### Nacharbeiten – 05.10.2026

Aus den offenen Grenzen der Protokolle umgesetzt:
- Verwaiste Anhänge: Der App-Start entfernt im Hintergrund Anhangdateien ohne Nachricht und Ordner
  gelöschter Chats (nur Dateien älter als eine Stunde, damit ein laufendes Senden nichts verliert).
- Leere Sitzungen: Neuer Chat und Begrüßung entstehen in einer SQLite-Transaktion.
- GGUF-Downloads lassen sich abbrechen (Aufgabenliste und Modell-Hub); die Teildatei wird entfernt.

Weiter offen: siehe `roadmap.md` (Abschnitt „Verlässlichkeit von Chat und Daten“).

Vollständige E2E-Suite (ohne Xvfb, auf dem Desktop): alle Szenarien bestehen. Zwei Tests waren
veraltet und sind korrigiert: `chat-sidebar-errors` las die Sitzung, bevor der erste Chat angelegt war
(der erste Chat entsteht einige Sekunden nach dem Fenster, auch mit dem alten Ablauf), und
`startup-character` fand über die CSS-Klasse den Cloud-Modellnamen im Kopf statt des Charakternamens.
`chat-sidebar-errors` scheiterte einmal einmalig an einem Entwurfsvergleich und bestand danach dreimal.

---

## 7. Abgearbeitet aus `roadmap.md` (ab 05.10.2026)

- [x] **Chat-Import in einer Transaktion:** `import_chat_jsonl` liest erst alle Zeilen und schreibt Sitzung, Notiz und
  Nachrichten (mit Varianten) danach in einer SQLite-Transaktion; ein später Fehler hinterlässt keinen halben Chat
  (Test `a_failed_chat_import_leaves_no_partial_chat`).
- [x] **Erster Chat erschien verzögert:** `get_hardware_info` (startet `nvidia-smi`, Vulkan-Abfrage), `scan_characters`
  (dekodiert alle Karten-PNGs, im Debug-Build ~0,9 s), `scan_models` und `get_layer_recommendation` waren synchrone
  Befehle; Tauri führt diese auf dem Hauptthread aus, sodass sie Fenster und alle anderen synchronen Befehle blockierten.
  Sie laufen jetzt per `spawn_blocking`. Dabei aufgedeckt und behoben: Ein vor dem Laden der Einstellungen gestarteter
  Charakter-Scan konnte nach dem Laden den ersten Charakter statt des zuletzt geöffneten wählen
  (`refreshCharacters` merkt sich, ob die Einstellungen beim Start bekannt waren; Test `startupCharacter.test.ts`).
- [x] **Stage-Verlauf und laufende Runde abgestimmt:** Bearbeiten, Löschen, Rückgängig und Szene zurücksetzen nehmen die
  `stage_turn`-Sperre wie Runde, Neu-Generieren und Rast; während einer Runde lehnt das Backend sie mit
  `backend.stage.editorBusy` ab, und die Knöpfe im Verlauf sind gesperrt (Test `stageChatLogBusy.test.tsx`).
- [x] **Prompt-Log:** Chat-Menü „…“ → „Letzten Prompt anzeigen“ zeigt, was das Chat-Modell zuletzt bekam (nach
  Lorebooks, Vorlage, Author's Note und Kontextkürzung) mit Modell, Endpunkt, Tokens und Sampler; Kopieren als Text.
  Nur im Speicher (`prompt_log.rs`, `get_last_prompt`), ohne API-Schlüssel, Anhänge nur als Namen
  (E2E `prompt-log.mjs`, Screenshot 53).
- [x] **Entwürfe überleben Neustarts (Composer, Chat-Seitenleiste):** Der Composer hält seinen Text je Chat
  (`utils/drafts.ts`, localStorage dieses Geräts; Dateien nicht), Notiz- und Zusammenfassungsentwürfe der Seitenleiste
  ebenso. Erfolgreiches Senden bzw. Speichern entfernt den Entwurf. Tests setzen `localStorage` je Test zurück.
- [x] **Abgebrochene Antworten fortsetzen:** `send_chat_message` umschließt nur noch die Vorbereitung mit `with_abort`;
  das Streaming endet bei Stopp selbst und liefert den bisherigen Text mit `DoneEvent.aborted`. Senden, Neu-Generieren
  und Fortsetzen speichern diesen Teiltext (solange der Chat offen ist), sodass „Weiter“ an der Abbruchstelle ansetzt;
  ohne Text wird nichts gespeichert (Unit-Tests, E2E `partial-reply.mjs` mit Mock-Option `stallChatAfter`, Screenshot 54).
- [x] **„Rückgängig“ beim Löschen von Chat-Nachrichten:** Keine Rückfrage mehr; die Nachricht verschwindet sofort, ein
  Toast bietet 8 s lang „Rückgängig“, danach wird sie gelöscht (schlägt das fehl, erscheint sie wieder). Der Prompt
  enthält sie in der Zwischenzeit nicht (Test `undoDelete.test.ts`, E2E `partial-reply.mjs`).
- [x] **Atomare Reflexion:** Die Memory-Pipeline holt erst alle Modellantworten (Router, Archivar, Tagebuch), legt dann
  den Snapshot an und schreibt Psychologie, Beziehung, Heilungsprotokoll, Themen-Erinnerungen und Tagebuch in einer
  Transaktion (`apply_reflection`). Ein Fehler – auch ein später Modell- oder Schreibfehler – ändert nichts; der Hinweis
  im Drawer sagt das jetzt (Test `a_failed_reflection_write_changes_nothing`).
- [x] **Laufzeit-Rollback:** Beim Aktualisieren bleibt der bisherige Build als `previous.json` samt Ordner erhalten
  (ältere Builds gehen); die Laufzeitkarte bietet „Zu bXXXX zurück“, das tauscht aktuellen und vorherigen Build
  (gilt ab dem nächsten Serverstart). Neuinstallation desselben Builds behält den vorherigen
  (Tests `keeps_the_previous_build_for_a_rollback`, `runtimeCard.test.tsx`).
- [x] **Xvfb für E2E eingerichtet** (`xorg-server-xvfb` 21.1.24): `xvfb-run -a` startet, Rauchtest und Layout-Test
  bestehen darunter (Standardbildschirm 640×480 und `-s "-screen 0 1920x1080x24"`), WebGL-Avatar rendert.
- [x] **„Rückgängig“ auch für Chats, Erinnerungen und Stage-Nachrichten:** Ein gelöschter Chat verschwindet sofort
  (ein anderer bzw. neuer öffnet sich) und bleibt 8 s wiederherstellbar; neu geladene Listen lassen ihn bis dahin weg.
  „Vergessen“ blendet die Erinnerung aus und vergisst sie erst danach. Stage-Nachrichten werden sofort gelöscht,
  „Rückgängig“ nutzt den Snapshot der Szene, solange sie sich seitdem nicht geändert hat. Keine Rückfragen mehr
  (Tests `undoDelete.test.ts`, E2E `partial-reply.mjs`, `memory-sources.mjs`).
- [x] **Entwürfe im Memory-Drawer überleben Neustarts:** Psychologie-, Beziehungs- und Markdown-Entwürfe je Charakter und
  Persona liegen wie Composer und Seitenleiste in `utils/drafts.ts` (ohne laufende Speicher-/Lade-Merker; Test in
  `memoryDrawer.test.tsx`).
- [x] **E2E-Aufräumen ohne `ENOTEMPTY`:** Der Harness löscht das Wegwerfprofil mit Wiederholungen, weil die App beim
  Herunterfahren noch schreiben kann (traf `character-import` und `memory-save-errors`).
- [x] **Werkzeuge im normalen Chat:** Schalter „Werkzeuge“ in der Chat-Leiste (Einstellung `chat_tools`, Standard aus).
  Anbieterunabhängiges Text-Protokoll (`chat_tools.rs`): Das Modell schreibt `<tool_call>{…}</tool_call>`, der Stream
  blendet es aus, die App führt Datum/Uhrzeit, Rechner (eigener sicherer Parser) oder Websuche (DuckDuckGo) aus und
  fragt mit `[TOOL RESULT]` erneut (höchstens 3 Runden). Die Nutzung steht im Gedankenblock (Rust-Tests, Unit-Test,
  E2E `chat-tools.mjs`, Screenshot 55).
- [x] **Gestaltung und Ambient-Klang pro Chat:** Reiter „Gestaltung“ in der Chat-Seitenleiste: Hintergrundbild mit
  Abdunklung, Textgröße, Blasenstil (Standard/Dezent/Kontrast) und ein Ambient-Klang mit Lautstärke. Bilder und Klänge
  kommen aus der Stage-Bibliothek (Import im Reiter). Gespeichert als `chat_sessions.style_json` (Migration v5,
  `ChatStyle`), „Ab hier neu“ übernimmt die Gestaltung; Hook `hooks/useAmbientSound.ts` dient Chat und Stage
  (Rust-Test, E2E `chat-style.mjs`, Screenshot 56).
- ~~**Sammel-Import** von Charakteren aus einem Ordner (Port von SoWs `tools/import_character_cards.py`)~~ – gestrichen
  (06.10.2026, nicht benötigt; Einzelimporte über Datei, Hub, Chub und URL bleiben).
- [x] **CrispASR v0.8.41 geprüft (06.10.2026):** F5-TTS ist per Opt-in `CRISPASR_F5_EMBED_GPU=1` schnell (Issue #294); die
  App setzt den Schalter für CUDA-Builds. GPU-Test auf RTX 4070 Ti SUPER: F5 jetzt RTF 2,65 statt ~55 (100 % Wörter),
  gemessen bei voll ausgelasteter GPU durch ein laufendes Spiel – die übrigen Zeiten (Qwen3 RTF ~1,0–1,5) sind daher
  nicht mit dem 01.10. vergleichbar, Verständlichkeit unverändert. Nicht behoben (in der App weiter umgangen, nicht
  gemeldet): 0.6B-Base-GGUF ohne Sprachtabelle, Standard-Stimmpaket passt nicht zu 1.7B. Der GPU-Test aktualisiert die
  Laufzeit jetzt auf den neuesten Build (der vorige bleibt für den Rollback).
- [x] **Qwen3-TTS VoiceDesign:** Katalogmodell `qwen3-tts-1.7b-voicedesign` (Apache-2.0, 2,0 GB Q8_0, SHA-256). Die Stimme
  wird in Worten beschrieben (Feld in den lokalen Stimmeinstellungen, gespeichert als `openai_instructions`), der Server
  bekommt sie als `instructions`. GPU-Test: Deutsch 92 %, Englisch 100 % Rückerkennung.
- ~~**TTS-Streaming** (`stream: true`)~~ – gestrichen (06.10.2026): Die App liest bereits satzweise vor, während die
  Antwort einläuft; Streaming würde nur die Wartezeit innerhalb eines Satzes kürzen und einen Umbau der Wiedergabe
  samt Lippensynchronisation verlangen.
- ~~**Spracherkennung über CrispASR**~~ – gestrichen (06.10.2026): Ein CrispASR-Server lädt nur ein Modell; STT bräuchte
  einen zweiten Prozess mit zusätzlichem VRAM. Whisper (`whisper-rs`) bleibt.
- [x] **Prüfung der Befehlsaufrufe statt tauri-specta:** `src/test/commandCheck.test.ts` liest alle `#[tauri::command]`
  aus Rust, die Registrierung in `generate_handler!` und alle `invoke(…)` im Frontend und meldet unbekannte oder nicht
  registrierte Befehle, falsche Argumentnamen (camelCase) und fehlende Pflichtargumente. Alternativen geprüft:
  tauri-specta 2.0 (seit Jahren RC, würde den Umstieg aller ts-rs-Typen verlangen), TauRPC (baut ebenfalls auf specta,
  Umbau aller Befehle), tauri-bindgen (experimentell). Gleich gefunden und behoben: `stage_set_combatant_skill` war
  nicht registriert – Fertigkeitswerte der Stage-Gruppe ließen sich nie speichern; der Dialog übernimmt jetzt auch die
  neu geladene Szene und meldet Fehler.
- [x] **Stimmeffekte (Idee aus Voicebox, ohne Python):** Reiter „Effekte“ im Stimmen-Dialog mit Vorlagen (Roboter, Funk,
  Geist, Höhle, Tief, Fee) und Reglern für Tonhöhe (WSOLA, ohne Tempoänderung), Hall, Echo, Roboter-Ringmodulation,
  Hoch- und Tiefpass. `services/voiceEffects.ts` rendert sie per `OfflineAudioContext` in den Clip, bevor der Player
  ihn abspielt – für jede Engine, die Lippensynchronisation folgt dem bearbeiteten Ton. Gespeichert als
  `VoiceConfig.effects`. Dabei behoben: Der Stimmen-Dialog überschrieb Eingaben, wenn die Stimmkonfiguration erst nach
  dem Öffnen fertig geladen war (Unit-Tests der Signalverarbeitung, E2E `voice-effects.mjs`, Screenshot 57).
- [x] **TADA 3B mehrsprachig (aus Voicebox übernommen, über CrispASR):** Katalogmodell `tada-3b-ml` (Llama 3.2 Community
  License, Q8_0 5,6 GB + Codec; ~6,3–7 GB VRAM) mit je einer Referenzstimme für de/en/fr/es/it/pl/pt/ja/ar/zh (FLEURS,
  CC-BY-4.0; Prüfsummen der kleinen Nicht-LFS-Dateien selbst berechnet) und Stimmklon aus WAV (Encoder + Aligner de/en,
  `CRISPASR_TADA_WAV_CLONE=1`). `CRISPASR_TADA_NUM_CANDIDATES=4` gegen verschluckte Sätze (deutscher Klon 42 % → 83 %).
  GPU-Test: Vorgabestimmen de 92 %, en 100 %; Klon en 100 %, de 83 % (Qwen3 1.7B bleibt der bessere deutsche Klon).
- [x] **Chatterbox Turbo mit Gefühlsgeräuschen (Englisch):** Katalogmodell `chatterbox-turbo` (MIT). Rollenspiel-Aktionen
  wie *lacht*, *seufzt*, *flüstert*, *hustet* werden vor der Synthese zu `[laugh]`, `[sigh]` … (`voice::actions_to_sound_tags`,
  deutsche und englische Stichwörter); Whisper hört danach nur den Text, die Tags werden als Geräusch umgesetzt.
  Kartoffelbox Turbo (deutsche Feinabstimmung) getestet und verworfen: erfindet englische Sätze, mit Tags ein
  komplett erfundener Monolog.
- [x] **UI-Durchsicht (06.10.2026):** Avatar-Spalte erst mit gewähltem Charakter (kein endloser Lade-Kreis), Hinweis
  ohne VRM-Modell; Avatar-Bedienelemente brechen in schmalen Spalten um (Modus nur als Symbol); kurzer Platzhalter im
  Eingabefeld (Tastenhinweis als Tooltip); „Einklappen“ statt abgeschnittenem Text. Senden ist ohne geöffneten Chat
  gesperrt (vorher Fehler „Keine aktive Chat-Sitzung“ beim frühen Klicken). 3D-Kamera richtet sich am Kopf und an der
  Modellhöhe aus, statt Köpfe großer Modelle anzuschneiden.
- [x] **VRMA-Bewegungen und Mundformen für den 3D-Avatar:** Eigene VRM-Animationen (`.vrma`) importieren und je eine
  Verwendung zuordnen (Ruhe-Schleife, Begrüßen/Winken, Nicken, Freude, Trauer, Wut, Überraschung, Nachdenken; aus dem
  Dateinamen geraten). Gesten spielen nach jeder Antwort bei Rollenspiel-Aktionen (*winkt*, *nickt*, *lacht* …) oder
  passend zum erkannten Gefühl und blenden zurück in die Ruhe. Ohne Bewegungen bleibt die prozedurale Haltung.
  LipSync nutzt jetzt fünf Mundformen (aa/ih/ou/ee/oh) aus den Formanten der Stimme statt nur „aa“ nach Lautstärke.
  Nichts wird mitgeliefert; der E2E-Test erzeugt seine Test-Animation selbst.
- [x] **Mixamo-Animationen für VRM-Avatare:** `.fbx` von Mixamo lassen sich wie VRMA importieren; die Bewegung wird von der
  Mixamo-Ruhepose auf die normalisierten VRM-Knochen übertragen (inkl. Finger, Hüfthöhe skaliert, VRM 0.x gespiegelt).
  Mixamo-Dateien werden nicht mitgeliefert; Tests erzeugen ein eigenes ASCII-FBX.
- [x] **MMD-Modelle als 3D-Avatar:** PMX/PMD importieren (ZIP mit japanischen Shift_JIS-Namen oder PMX samt Ordner),
  Darstellung über `@moeru/three-mmd` mit Spring-Bone-Haarphysik, Texturen unabhängig von Groß-/Kleinschreibung,
  Arme hängen aus T- oder A-Pose herab, Blick folgt der Maus, Blinzeln, Gefühle und Mundformen über die
  Standard-Morphs (あいうえお, まばたき, 笑い, 怒り, 困る …). VMD-Bewegungen als Gesten/Ruhe-Schleife. Mit einem echten
  Modell (Cure Mermaid) geprüft. Dabei behoben: Der VRM-Viewer übernahm erkannte Gefühle nach dem Öffnen nicht mehr;
  beide Viewer teilen jetzt Bühne, Overlay und Bewegungslogik.
- [x] **glTF/GLB-Avatare:** `.glb` mit Mixamo-artigem Rig (mit oder ohne `mixamorig`-Präfix) importieren; Gesicht über
  Oculus-Visemes oder ARKit-Blendshapes (Blinzeln, Mundformen, Gefühle; gemeinsame Ziele wie `jawOpen` werden addiert),
  Arme aus der Bind-Pose abgesenkt, Zentimeter-Exporte automatisch skaliert. Mixamo-FBX laufen auch auf diesen Rigs
  (Übertragung über den Weltraum mit Ruhepose-Ausgleich). Dabei behoben: Höhenmessung bei MMD/glTF zählte Morph-Ziele mit.
- [x] **Avatare mit echten Modellen geprüft (lokal, `assets/test-avatars/`, gitignored):** Nahida (VRM) ohne Befund,
  Eula (MMD, 7z entpackt) ohne Befund. A010 (GLB, MakeHuman-Rig) brachte drei Verbesserungen: Knochen-Aliase für
  MakeHuman/Unreal/Blender/VRoid, Größenangleich für Exporte in anderen Einheiten (Bounds über das Skelett) und eine
  Studio-Umgebung für PBR-Materialien. Prüfskript `e2e/local-avatars.mjs`.
- [x] **Soul Stage 5e – Schritt 1 (Regelkern, Kampf ohne Brett, `Roadmap_DND.md`):** Szenen können mit 5e-Regeln
  (SRD 5.1) laufen. Die Regel-Engine (`stage/rules5e`) entscheidet alle Zahlen: Initiative, Angriffe gegen RK mit
  Vorteil/Nachteil, Krits und Patzer, Schaden mit Resistenz/Verwundbarkeit, Ausweichen, Flucht, Kampfende. Monster
  steuert die Engine-KI, Gefährten wählen per LLM eine erlaubte Aktion (sonst Ersatzwahl), der GM startet Kämpfe nur mit
  SRD-Monster-IDs und erzählt den Kampfbericht, ohne ihn zu ändern; LP-Angaben des LLM werden ignoriert.
  Oberfläche: Kampfpanel mit Reihenfolge, Aktionsleiste und übersetztem Kampflog, Gegner nur mit Zustandsstufe,
  kompakter Charakterbogen, Regelwerk/Klassen/„Gefährten selbst steuern“ im Szenen-Editor, 5e-Kennzeichen in der Lobby.
  Daten: 10 SRD-Monster, 4 Klassen-Vorlagen (de/en/ru), SRD-Namensnennung in den READMEs. E2E `stage-5e.mjs`
  (zwei Goblins bis zum Sieg, LP nur aus Engine-Schaden). Bewusstlose wachen nach dem Kampf mit 1 LP auf, bis Schritt 3
  Todesrettungswürfe bringt.
- [x] **Soul Stage 5e – Schritt 2 (Spielbrett, `Roadmap_DND.md`):** Szenen können eine Karte haben (Halle der Gruft,
  Waldstraße; JSON-Raster mit Legende). Kämpfe laufen dann auf dem Brett: Gruppe und Gegner starten auf ihren Zonen,
  Bewegung bis zur Bewegungsrate (schwieriges Gelände doppelt, keine Ecken-Schnitte, Gegner blockieren), Angriffe nur
  in Reichweite und Sicht mit Nachteil auf langer Distanz und beim Schießen im Nahkampf, Gelegenheitsangriffe, Spurt,
  Rückzug, Zug beenden. Monster planen Feld und Angriff selbst, Gefährten wählen unter erreichbaren Angriffen.
  Oberfläche: Reiter „Spielbrett“ mit Kacheln und Tokens aus den eigenen Grafiken (abgedunkelte Wände, 5-ft-Raster,
  grüne Zielfelder, Gegner anklickbar), Kartenauswahl im Szenen-Editor. Grafiken (Dungeon, Wald, Tokens, Porträts,
  Zustandssymbole) mit Regelprüfung per Vitest. E2E `stage-board.mjs`.
- [x] **Soul Stage 5e – Schritt 3 (Magie, Rettungswürfe, Zustände, Rasten, `Roadmap_DND.md`):** 22 SRD-Zauber
  (Zaubertricks, Grad 1–2) mit Zauberplätzen, Hochstufen, Konzentration und Flächen (Kugel, Kegel, Würfel, Linie);
  Rettungswürfe gegen SG 8 + Übung + Mod mit halbem Schaden, SRD-Zustände mit echter Wirkung, Todesrettungswürfe
  (Heldentod optional, sonst „außer Gefecht“ bis Kampfende), Stabilisieren und Heilung aus 0 LP. Proben nennen eine der
  18 Fertigkeiten, Rasten verbrauchen Trefferwürfel bzw. stellen LP, Plätze und halbe Trefferwürfel her. Gefährten
  heilen Sterbende selbst und wählen sonst auch Zauber. Oberfläche: Zauberbuch im Kampfpanel mit Gradwahl und Zielen,
  Flächenzauber werden auf dem Brett mit Vorschau gezielt, Kampflog für alle neuen Ereignisse, vollständiger Bogen
  (Rettungswürfe, Fertigkeiten, Zauber/Plätze, Konzentration, Todesrettung). E2E `stage-spells.mjs`.


## Grafiken für das Spielbrett (07.10.2026)

- [x] Alle 69 Stage-Assets nach `todo_assets.md` neu gestaltet: 15 Porträt-Tokens als reine SVGs,
  38 Dungeon-/Waldkacheln, zwölf einfarbige Zustandssymbole und vier neue Heldenillustrationen
  (768 × 1024 px, PNG/sRGB). SVG-Regeln, Transparenz, Größen und pixelgenaue Bodenübergänge
  einschließlich gemischter Varianten geprüft; 3×3-Kachelansichten und Tokens bei 48 px angesehen.
