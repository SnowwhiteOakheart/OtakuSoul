# 🗺️ OtakuSoul – Portierungs-Roadmap (Soul of Waifu → Rust/Tauri)

> Stand: 2026-09-26 · Vergleichsbasis: `Soul-of-Waifu-linux` (Branch `linux`, Upstream v2.5.1)
> /home/deathtrap/development/Soul-of-Waifu-linux/
>
> Diese Roadmap listet alles, was aus dem Python-Original noch **fehlt** oder in OtakuSoul bisher nur
> **als Gerüst/Simulation** existiert. Abgeschlossene Punkte werden abgehakt und mit Commit-Hash versehen.

---

## 📊 1. Ist-Zustand im Überblick

| | Soul of Waifu (Python) | OtakuSoul (Rust + React) |
|---|---|---|
| Eigener Code | ~85.000 Zeilen (ohne venv & Qt-Ressourcen) | ~5.000 Zeilen Rust/TS |
| Laufzeit-Abhängigkeiten | Python 3.11 venv mit PyQt6, torch, transformers, … (~260 Pakete) | Tauri v2, reqwest, rusqlite, React 19, three-vrm |

### Was in OtakuSoul schon da ist (Phase 1–7)

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

## 🚨 2. Technische Schulden (vor neuen Features erledigen)

- [x] **Hartkodierte Pfade entfernen** – `useAppStore.ts` und `SettingsView.tsx` von absoluten Pfaden befreit; Datenverzeichnis via `directories::ProjectDirs` (`paths.rs`), Assets per dynamischem Scan (`scan_characters`, `scan_models`, `scan_vrm_models`).
- [x] **Persistente Konfiguration** – `settings.json` im Config-Verzeichnis (`settings.rs`) + Rust-Commands `load_settings`/`save_settings`.
- [x] **Sampling konfigurierbar** – `temperature`, `min_p`, `max_tokens` im Settings-UI anpassbar und persistent gespeichert.
- [x] **Antwortsprache konfigurierbar** – `reply_language` im Settings-UI editierbar und persistent gespeichert.
- [x] **Lorebook-Scan-Tiefe** – `lorebook_scan_depth` begrenzt den Keyword-Scan auf die letzten N Nachrichten (Standard: 5).
- [x] **Datei-Dialoge** – `tauri-plugin-dialog` integriert für Modelle (.gguf), 3D-Avatare (.vrm) sowie Import/Export (.png/.json).
- [ ] **Hardware-Probe für AMD/Intel** – ROCm (`rocm-smi`/sysfs), Vulkan-Fallback, Apple Metal.

---

## 🧭 3. Phasen

Die Reihenfolge ist nach Abhängigkeit und Nutzen sortiert: erst das, was jede andere Funktion braucht
(Daten, Chat, Provider), dann Stimme/Avatar, dann Stage/Companion, zuletzt Ökosystem.

### Phase 8 – Datenfundament & Charakterbibliothek ✅ abgeschlossen

- [x] **Einheitliches Datenverzeichnis** (`characters/`, `lorebooks/`, `personas/`, `scenes/`, `.trash/`) via `paths.rs`.
- [x] **Charakterbibliothek** – Responsive Kachel-Ansicht, Suche, Tag-Filter, Sortierung, Avatar-Vorschau (`CharacterLibraryView.tsx`).
- [x] **Charakter-Editor** – alle V2-Felder, Avatar-Upload/Picker, Tags, Beispieldialoge, alternative Begrüßungen (`CharacterEditorModal.tsx`).
- [x] **Import** von V2-PNG/JSON per nativem Dateidialog.
- [x] **Export** als SillyTavern V2-PNG (mit `chara` tEXt-Chunk und CRC32) und JSON (`export_character_card`).
- [x] **Charakter löschen** (mit Papierkorb/Backup `.trash/` statt Hard-Delete).
- [ ] **SoW-Konfigurationsimport** – `app/configuration/characters.json`, `settings.json`, `api.json` aus einer bestehenden SoW-Installation übernehmen (Migrationspfad für Bestandsnutzer)
- [ ] **Port von `tools/import_character_cards.py`** als Rust-Command/CLI (Bulk-Import inkl. Live2D, Personas, Lorebooks, Szenen, Hintergründe, `--scene-group`)
- [x] **User-Personas** – mehrere Personas anlegen, bearbeiten, löschen, Schnellwechsel im Chat & HUD (`PersonaManagerModal.tsx`).

### Phase 9 – Vollwertiger Chat ✅ Kernfunktionen abgeschlossen

- [x] **Chat-Persistenz** – mehrere Chats pro Charakter in SQLite (`chat_sessions`, `chat_messages`), Chat-Liste, Umbenennen, Löschen
- [x] **Chat-Import/Export** (SillyTavern & SoW JSONL mit Metadaten und allen Swipes)
- [x] **Nachricht bearbeiten / löschen / neu generieren** (Inline-Editing, Delete, Regenerate)
- [x] **Swipes / Varianten** – SillyTavern-Style Antwortvarianten in `swipes_json`, Pagination `< 1/3 >`, Wechsel per Pfeil
- [x] **Weiter-Generieren** (Continue) einer Nachricht
- [x] **Author's Note** pro Chat mit konfigurierbarer Injektionstiefe (Depth-Slider & System-Prompt-Injektion)
- [x] **State Variables aus LLM-Antworten parsen** – robuster `<state>`-JSON-Interceptor (`stateParser.ts`), Tag-Stripping aus Chatblasen + **11 Rollenspiel-HUD-Presets** (Romance, Fantasy RPG, Survival, Horror, Cyberpunk, Slice of Life, Detektiv, Space Opera, Cultivation, Comedy, Tabletop Tactical)
- [x] **Kontextfenster-Management** *(umgesetzt, siehe ROADMAP.md)* – Token-Zählung (`tiktoken-rs` oder `/tokenize` des llama-servers), Response-Reserve, älteste Nachrichten abschneiden (SoW: `PromptEngine._get_max_context_tokens`)
- [ ] **Automatische Zusammenfassung** alter Nachrichten + Summary-Editor (SoW: `build_summary_prompt_blocks`, `open_summary_editor`, `save_interval_summary`)
- [ ] **System-Prompt-Editor** & Prompt-Vorlagen
- [ ] **Datei-Anhänge** (Text, PDF, Bilder für Vision-Modelle) (SoW: `open_attach_file_dialog`)
- [ ] **Chat-Übersetzung** einzelner Nachrichten (SoW: `translator.py`)
- [ ] **Chat-Erscheinungsbild** – Hintergründe pro Chat, Schrift, Blasenfarben, Themes (SoW: `on_chat_appearance_changed`, `open_chat_background_changer`)
- [ ] **Ambient-Sound pro Chat** mit Lautstärke (SoW: `ambient_client.py`)
- [ ] **Tool Calling im normalen Chat** – Websuche, Datum/Zeit, Rechner (SoW: `ai_clients/tools.py`)
- [ ] **Prompt-Log / Debug-Dump** des letzten Prompts (SoW: `_dump_last_prompt`)

### Phase 10 – LLM-Provider & llama.cpp-Tuning ✅ Abgeschlossen

- [x] **Provider-Abstraktion in Rust** (`LlmProviderType`, `ProviderRegistry`) mit nativer Unterstützung für Streaming
- [x] **Provider**: OpenRouter (Modellkatalog abrufen & 1-Klick-Auswahl), **Anthropic** (natives Messages-API-Format mit `x-api-key`, `anthropic-version`, separatem `system`-Prompt & `content_block_delta` SSE-Parsing), OpenAI, DeepSeek, Gemini, Mistral, Custom Endpoints
- [x] **Vollständige Sampler-Einstellungen** – Temperature, Top-P, Min-P, Repeat Penalty, Top-K, **Dynamic Temperature** (`dynatemp_range`, `dynatemp_exponent`), **DRY** (`dry_multiplier`, `dry_base`, `dry_allowed_length`, `dry_penalty_last_n`), **XTC** (`xtc_threshold`, `xtc_probability`), Stop-Strings, Max Tokens
- [x] **LLM-Presets** speichern / laden / löschen (5 vordefinierte Presets: Storytelling/Kreativ, Rollenspiel Standard, Stage GM / Logik, XTC Wild, Fast Chat + Benutzer-Presets in `llm_presets.json`)
- [x] **llama-server-Optionen** – Kontextgröße, Batch-Size (`-b`), UBatch (`-ub`), CPU-Threads, Flash Attention (`-fa`), RAM Lock (`--mlock`), no-mmap (`--no-mmap`), KV-Cache-Quantisierung (`--cache-type-k`, `--cache-type-v` für `q8_0` / `q4_0`), **CPU-MoE-Layer** (`--cpu-moe`), Thinking-Budget
- [x] **Models Hub** – Hugging-Face-API-Suche (`filter=gguf`), Dateibaum-Inspektion mit Quantisierungs-Erkennung (Q4_K_M, Q8_0 etc.), async GGUF-Downloader mit Live-Fortschrittsbalken und Download-Geschwindigkeit (`model-download-progress`)
- [ ] **Backend-Auswahl** CUDA/HIP/SYCL/Vulkan/CPU
- [ ] **llama.cpp-Updater** – GitHub-Release abrufen, passendes Asset wählen, installieren, Backup/Rollback (SoW: `backend_updater.py`, `tools/fetch_llama_backend.py`, `build_llama_cuda.sh`)

### Phase 11 – Soul Memory 2.0 (echte kognitive Pipeline) ✅ Abgeschlossen

- [x] **Router-Agent** – autonomer LLM-Call evaluiert jüngste Dialog-Turns, erkennt No-Op (`no_significant_change: true`), erzeugt JSON Field-Patches (`character_memory_patch`, `user_memory_patch`), löst Widersprüche und plant Topics
- [x] **Archivist-Agent** – extrahiert Fakten/Themen in dichte, kompakte Lore-Einträge (<300 Wörter) und aktualisiert episodische Topic-Dateien
- [x] **Tagebuch automatisch & manuell** – Ich-Perspektiven-Reflexion (4–6 prägnante Sätze) über das Geschehen und die Gefühle gegenüber {user_name}
- [x] **User-Profil & Beziehungsgedächtnis** – Rolle in der Story, bekannte Attribute, dynamische Beziehungsbeschreibung, Vorlieben und gemeinsame Meilensteine als eigene Schicht
- [x] **Markdown-Ansicht & Bidirektionaler Sync** – Render-Funktionen (`render_character_markdown`, `render_user_markdown`), integrierter Code-Editor für `MEMORY.md` und `USER.md` mit 1-Klick-Sync zurück nach SQLite
- [x] **Backups & Snapshots** – automatische Snapshots vor jedem Schreibvorgang, Snapshot-Manager mit Verlauf und 1-Klick-Wiederherstellung
- [x] **Import bestehender SoW-Memory-Dateien** – Importiert vorhandene `MEMORY.md`, `USER.md`, `topics/*.md` und `DIARY.md` aus Soul-of-Waifu-Ordnern direkt in SQLite
- [x] **Prompt-Builder-Integration** – Unumstößliche Glaubenssätze, kognitive Dissonanz, Story-Rolle und Beziehungsdynamik fließen reaktiv in den System-Prompt ein

### Phase 12 – Lorebook 2.0 ✅ Abgeschlossen

- [x] **Lorebook-Editor** – Vollständiger Editor für Lorebooks und Einträge (Name, Content, Primär-/Sekundärschlüssel, Exclude-Keys, Regex, Priorität, Wahrscheinlichkeit, Wortgrenzen, Case-Sensitivity)
- [x] **Multi-Binding & globale Lorebooks** – Beliebig viele Lorebooks an Charaktere binden (`bound_lorebooks`) sowie globale Universum-Lorebooks für alle Chats (`is_global` / `global_lorebooks`)
- [x] **Erweiterte Trigger-Engine** – Primärschlüssel (ODER), Sekundärschlüssel (UND), Ausschlusswörter (NICHT), Wortgrenzen-Regex (`\b`), Reguläre Ausdrücke und Always-On
- [x] **Scene Tension Accumulator** – Dynamischer Spannungsaufbau im Gespräch mit Auslösung von Krisen-/Zufallsevents bei Schwellenwert (`tension_threshold`) und Spannungsabbau
- [x] **Chain Dependencies** – Einträge schalten andere frei (`chain_activates`) oder verlangen erfüllte Vorbedingungen (`chain_requires`)
- [x] **Getrennte Injection-Modi** – Passiv (Weltwissen / Kontext) vs. Aktiv (Strikte Regie- und Verhaltensdirektiven im System-Prompt)
- [x] **Lorebook-Import & Export** – SillyTavern-, World-Info- und OtakuSoul-kompatibler JSON-Import/-Export mit nativem Datei-Dialog

### Phase 13 – Stimme: TTS, STT & Voice Call ✅ abgeschlossen

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

### Phase 14 – Avatare & Emotionen ✅ abgeschlossen

- [x] **Live2D-Renderer** einbinden (`Live2DViewer.tsx` via `pixi.js` + `pixi-live2d-display` mit Cubism 4 & 2 Runtime, Zoom, Pan, Mouse-Look & LipSync)
- [x] **Motion Mapper & Live2D-Ausdrücke** – Emotion → Live2D-Motion/Expression (`joy_animation`, `amusement_animation` etc.)
- [x] **28-Emotionen-Klassifikator** – GoEmotions-Mapping + deutsches/englisches Actions-/Affekt-Lexikon (`classify_text_emotion`)
- [x] **Expression-Bilder & GIFs** als flexibler 2D-Avatar-Modus mit Emotions-Overlays
- [x] **VRM-Emotionen & Motions** aus dem Klassifikator steuern; VRM- & Live2D-Modellauswahl pro Charakter
- [x] **Live2D-Downloader & Scanner** portiert (`modules/live2d.rs`: Scan lokaler/gebündelter Modelle + Cubism Sample Download)

### Phase 15 – Soul Stage: KI-Game-Master 🟡 Kernumfang abgeschlossen

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

#### Erreichte SoW-Referenzparität (Abgeschlossen)

- [x] **Mehrere Akteure pro GM-Zug & dynamische NPCs** – `max_actor_depth` Schleife mit sequentiellen Gefährten-Reaktionen, Party-Dialog-Ketten und Persönlichkeits-Overlays (`stage.rs`)
- [x] **Stage-Lore & private Informationen** – Automatische Bindung von Lorebooks, Trigger-Evaluation über `evaluate_lorebooks` und Injektion in GM-Planner & Gefährten-Prompts
- [x] **Stage-Nachrichtenwerkzeuge** – Bearbeiten (Inline-Editor), Löschen, Regenerieren und Vorlesen (TTS) per Hover-Leiste direkt im Stage-Chatverlauf (`StageChatLog.tsx`, `stage.rs`)
- [x] **Szenen-Zuverlässigkeit** – Rotierende `.json.bak`-Sicherheitskopien, automatische Wiederherstellung und modales „Fortsetzen vs. Neu starten“-Fenster bei vorhandenem Fortschritt (`SceneLobbyModal.tsx`)
- [x] **Dynamische Bühnenatmosphäre** – Dynamische Hintergrund-Backdrop-Layer (`bg_image` aus GM-Plan), Hintergrund-Auflösung über `get_stage_background_image`, Background-Lock-Toggle (`lock_bg`) in der Menüleiste (`StageView.tsx`)
- [x] **Szenenordner & No Game No Life Defaults** – Ordner-Verwaltung (`list_stage_folders`, `create_stage_folder`, `move_stage_scene_to_folder`, `delete_stage_folder`), Ordner-Filter-Pills mit Szenen-Zähler, automatische Bereitstellung aller 12 Kapitel von *No Game No Life* im Ordner „No Game No Life“ in natürlicher Kapitelreihenfolge sowie *Sakura Succubus 3*
- [x] **Szenen-JSON-Import/-Export** – Direkter JSON-Import mit Ordner-Zuweisung und 1-Klick-JSON-Export (`stage_import_scene_json`, `stage_export_scene_json`, `SceneLobbyModal.tsx`)

### Phase 16 – Soul Companion: echter Desktop-Agent 🟢

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

### Phase 17 – Ökosystem & Integrationen 🟢 (Abgeschlossen)

- [x] **Lokaler Web-Client für Smartphone & Tablet** – Autarker `axum` HTTP- und WebSocket-Server (`web_server.rs`), Token-Auth, Host-Header-Prüfung gegen DNS-Rebinding, Vektor-SVG-QR-Code (`qrcode`) zum direkten Scannen per Handykamera, Link-Kopieren, dynamische IP-Erkennung, integrierter responsiver HTML5/Tailwind Web-Client mit SSE/WebSocket-Streaming, Sprachausgabe (TTS) und STT-Upload.
- [x] **Discord Rich Presence & Gateway-Bot** – Nativer Unix-Domain-Socket / Windows-Named-Pipe RPC-Client (`discord.rs`) für Live-Status ("Im Gespräch mit {character}"), autarker Discord Gateway WebSocket Bot (`wss://gateway.discord.gg`) mit Heartbeat-Loop (Opcode 1/10) und Befehlen (`!ask`, `!character`, `!status`, `!reset`).
- [x] **KI-Bildgenerierung & Live-Studio** – Multi-Provider-Engine (`image_generator.rs`) für Automatic1111 (`/sdapi/v1/txt2img`), ComfyUI (`/prompt`), OpenAI DALL-E 3 (`/v1/images/generations`), NovelAI (`/ai/generate-image`) und FLUX. Automatischer Kontext-Prompt-Synthesizer (`build_character_prompt`), Situations-Schnellaufnahme im Chat-HUD (`AdaptiveHud.tsx`) und Galerie-Feed.
- [x] **Soul Hub & Gateways** – Vollwertiger 4-teiliger Community-Hub mit Live-Suche, Tags, Sortierungen, NSFW-Filter, Chub AI API/CDN-Import inkl. automatischer Extraktion eingebetteter Lorebooks (`character_book`), URL-Direktimport, kuratiertem Soul Gateway, Welt-Lorebooks-Registry und Soul-Stage-Szenarien-Registry (`soul_hub.rs`, `SoulHubView.tsx`).
- [x] **KI-Charakterassistent** – Geführter 5-Schritte Creation Wizard (`CharacterAiAssistantModal.tsx`, `characters.rs`): Konzept & Name (mit Archetyp-Pills), Aussehen, Persönlichkeit, Welt & Beziehung zu `{{user}}`, Begrüßung/Szenario. Direkte LLM-Synthese in SillyTavern V2 Format (`generate_character_draft_llm`), Review-Editor und 1-Klick-Speicherung in die Bibliothek.
- [x] **Profil-Backup & Restore mit Schutzgarantie** – Vollständiger ZIP-Archiv-Manager (`profile_backup.rs`) mit Gruppen-Auswahl (Charaktere, Lorebooks, Personas, Seelengedächtnis, Soul Stage, Companion, Settings), Manifest (`manifest.json`), 5-facher rotierender Sicherheits-Snapshot-Erstellung (`pre_restore_...`) vor jeder Wiederherstellung und selectivem Rollback.

### Phase 18 – UI-Politur, i18n & Auslieferung 🟢 (Abgeschlossen)

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

## ⚖️ 4. Architektur-Entscheidungen

| Frage | Status & Entscheidung |
|---|---|
| Schwere ML-Modelle (Kokoro, XTTS, Qwen3-TTS, RVC) | Whisper nativ via whisper.cpp; Kokoro 82M nativ via ONNX Runtime; übrige TTS-/RVC-Systeme über optionale, austauschbare HTTP-Sidecars. Damit bleibt die OtakuSoul-Kernlaufzeit schlank und Python-frei. |
| Embeddings | llama-server `/embedding` oder ONNX Runtime für semantischen Vektor-Search. |
| Chat-Speicherung | SQLite-Datenbank mit JSONL-Export/Import und automatischem Snapshot-Backup. |
| Wayland-Automation (Companion) | Portals und `ydotool`/`xdotool` mit Sicherheits-Countdown und Human-in-the-Loop Bestätigung. |
| Internationalisierung | Typsicheres Dreisprachen-System (`de`, `en`, `ru`) mit Direktumschaltung im Frontend. |
| Log-Persistenz | Ringpuffer im RAM + rotierendes File-Logging in `data_dir/logs/otakusoul.log`. |

---

## 📌 5. Meilenstein-Status

🎉 **Alle 18 Phasen der Roadmap sind vollständig implementiert, verifiziert und dokumentiert!**
OtakuSoul v0.1.0 ist als produktionsreifes Desktop- und Web-Ökosystem mit lokalem KI-Inferenz-Stack, Live2D/VRM-Rendering, Sprachausgabe, Soul Stage TTRPG-Engine, Companion-Agent und Multi-Language-Support fertiggestellt.


