# 🗺️ OtakuSoul – Portierungs-Roadmap (Soul of Waifu → Rust/Tauri)

> Stand: 2026-09-26 · Vergleichsbasis: `Soul-of-Waifu-linux` (Branch `linux`, Upstream v2.5.1)
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
| Hardware-Probe & GPU-Layer-Rechner | ✅ solide | NVIDIA-only (`nvidia-smi`) |
| llama-server Prozessmanager | ✅ solide | PDEATHSIG, Health-Polling, Port-Freigabe |
| SSE-Streaming + `<think>`-Filter | ✅ solide | eine OpenAI-kompatible Schnittstelle für lokal & Cloud |
| Character Card V2 (PNG/JSON) | 🟡 nur Lesen | kein Export, keine Bibliothek, Pfade hartkodiert |
| Lorebook | 🟡 Basis | nur Keyword/Regex, keine semantische Suche, keine Ketten |
| Prompt Builder | 🟡 Basis | kein Token-Budget, keine Kontextfenster-Verwaltung |
| Soul Memory (SQLite) | 🟡 Datenmodell | Tabellen + Decay vorhanden, **aber kein LLM schreibt automatisch hinein** |
| Soul Stage | 🟡 Mechanik | Würfel, Clocks, Kampf – **aber kein KI-Game-Master** |
| Soul Companion | 🟡 Gerüst | Hormone + Safety-Banner – **alle 4 Tools sind simuliert** |
| VRM-Avatar | ✅ gut | LipSync nur ohne echte Audioquelle |
| Live2D | ❌ | nur Typfeld `sow_live2d`, kein Renderer eingebunden |
| Chat-Verlauf | ❌ | nur im RAM, geht beim Neustart verloren |

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
- [ ] **Kontextfenster-Management** – Token-Zählung (`tiktoken-rs` oder `/tokenize` des llama-servers), Response-Reserve, älteste Nachrichten abschneiden (SoW: `PromptEngine._get_max_context_tokens`)
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

Die Kernlaufzeit bleibt Python-frei: Whisper läuft nativ über whisper.cpp; stark variierende oder schwere
TTS-/RVC-Modelle werden über klar konfigurierte, optionale Sidecar-Endpunkte angebunden.

- [x] **Audio-Ausgabe & Gerätewahl** – unterbrechungssichere Web Audio API Queue, Gain, Ausgabegerät, AnalyserNode & FFT-Amplitude
- [x] **Satzweises Streaming** – TTS startet beim ersten fertigen Satz; geordnete Synthese, Warteschlange und sofortiger Abbruch bei Unterbrechung
- [x] **TTS-Engines**
  - [x] Edge-TTS (WebSocket-Protokoll direkt in Rust – kein Python nötig)
  - [x] ElevenLabs (HTTP inkl. Live-Stimmenliste)
  - [x] OpenAI & OpenAI-kompatibel (`/v1/audio/speech`)
  - [x] Kokoro 82M, Qwen3-TTS, XTTSv2, Silero TTS & AllTalk über frei konfigurierbare lokale Sidecars
- [x] **RVC Voice Conversion** – optionaler Multipart-Sidecar mit Modell, Pitch, Index-Rate und Protect
- [x] **Stimmen-Dialog pro Charakter** – TTS/STT/RVC, Ein-/Ausgabegeräte und Custom-Regex (`CharacterVoiceModal`)
- [x] **Vorlesen-Button** an jeder Chatblase + Auto-TTS Toggle
- [x] **STT** – natives `whisper-rs`/whisper.cpp (offline) sowie OpenAI-kompatible Transkriptions-Endpunkte; Web-Audio-RMS-VAD mit konfigurierbarer Schwelle/Stillezeit
- [x] **SoW System / Voice Call** – Zustände Listening/Transcribing/Thinking/Speaking, automatischer Turn-Wechsel, Push-to-talk und Unterbrechung durch den Nutzer
- [x] **Echtes LipSync** – Amplitude aus dem TTS-Audio an VRM-Avatar (`aa` Blendshape) gekoppelt

### Phase 14 – Avatare & Emotionen 🟡

- [ ] **Live2D-Renderer** einbinden (`pixi-live2d-display` ist installiert, aber ungenutzt; Cubism-Core-Lizenz beachten) (SoW: `create_live2d_widgets`)
- [ ] **Motion Mapper** – Emotion → Live2D-Motion/Expression (SoW: `open_motion_mapper_dialog`)
- [ ] **28-Emotionen-Klassifikator** – ONNX-Modell (z. B. GoEmotions) statt torch (SoW: Expression-System)
- [ ] **Expression-Bilder & GIFs** als einfacher Avatar-Modus (SoW: `create_expression_images_widgets`)
- [ ] **VRM-Emotionen & Motions** aus dem Klassifikator steuern; VRM-Modellauswahl pro Charakter
- [ ] **Live2D-Downloader** portieren (SoW: `tools/fetch_live2d_models.py`)

### Phase 15 – Soul Stage: KI-Game-Master 🟠

Die Mechanik (Würfel, Clocks, Encounter) ist da – der **Orchestrator**, der das Spiel leitet, fehlt komplett.
Referenz: `soul_stage_engine.py` (5.000 Zeilen) + `soul_stage_page.py` (6.700 Zeilen).

- [ ] **Szenen-Format & Szenen-Bibliothek** – Szenen laden/importieren, **Scene Folders**, Lobby (Presets: `sakura-succubus-3/scenes`, `no-game-no-life`)
- [ ] **GM-Orchestrator** – Planner → Executor → Routing-Pipeline mit JSON-Reparatur (SoW: `SoulStageOrchestrator.run_turn`, `PlannerParser`, `RoutingParser`)
- [ ] **Party-System** – mehrere Charaktere antworten nacheinander, Direktansprache erkennen, Turn-Indicator
- [ ] **Turn-Control-Bar** – Modi Sagen/Tun/Denken/Regie, nächsten Sprecher wählen, **private Flüstern**
- [ ] **WorldState** – Zeit, Wetter, Ort, Fakten, Konsequenzen-Ledger, private Wissensstände pro Figur
- [ ] **Story Arcs** (versteckt bis Hinweise gefunden) + Archivierung aufgelöster Arcs
- [ ] **Relationship Graph** & Character Overlays
- [ ] **Dynamische NPCs** mit eigenem Gedächtnis (NPC-Memory-Registry, Embeddings) und Promotion zum vollwertigen Charakter
- [ ] **Lore Registry** der Szene
- [ ] **Tagged Choices** – Antwortoptionen mit Skill-/DC-/Kosten-Badges
- [ ] **Spieler-HUD** – HP/Energie/Stress, Status-Effekte mit Rundendauer
- [ ] **Inventar 2.0** – Verbrauchsgegenstände mit Sofort-Effekt
- [ ] **Rast/Camp** – kurze/lange Rast, Lagerfeuer-Interlude, **Bond-Meilensteine**
- [ ] **Kampf-Schnellaktionen** – Angriff/Ausweichen/Item/Flucht/Verschieben, automatisches Kampfende
- [ ] **Event-Cards** im Verlauf (Encounter, Entdeckung, Konsequenz, Camp, Meilenstein)
- [ ] **Automatischer Hintergrund- & Ambient-Wechsel** je Ort
- [ ] **Spielstände** – Szene serialisieren/laden, Snapshots für Undo (SoW: `serialize_scene_state`, `take_snapshot`)
- [ ] **Nachrichten-Menü** – bearbeiten, neu generieren, übersetzen, **Markdown-Export**
- [ ] **Konsistenz-Audit** (SoW: `_run_consistency_audit`)
- [ ] **Party-Memory-Sync** mit Soul Memory

### Phase 16 – Soul Companion: echter Desktop-Agent 🟡

Aktuell sind `system_health_report`, `set_timer`, `open_external_url`, `web_search` in
`companion.rs:execute_internal` **nur simuliert** (sie geben feste Texte zurück).

- [ ] **Transparentes Overlay-Fenster** (Tauri: `transparent`, `always_on_top`, `decorations: false`, Click-Through) – Wayland-Einschränkungen beachten
- [ ] **Companion-LLM-Schleife** – Heartbeat, Idle/AFK-Erkennung, Begrüßung beim Start, proaktives Ansprechen, Streaming-Parser für Sprache (SoW: `SoulCompanion._qt_heartbeat`, `_qt_idle_check`, `StreamingCompanionParser`)
- [ ] **Event-Bus für OS-Ereignisse** – aktives Fenster, Fensterwechsel (SoW: `SoulCompanionEventBus`, `_get_window_title`)
- [ ] **Emotion-State aus Hormonen** + Schlaf/Einsamkeit, Scratchpad, Ziele/Versprechen mit Fälligkeit (SoW: `EmotionState`, `Scratchpad`, `GoalsManager`)
- [ ] **Echte Tools**
  - [ ] Websuche (DuckDuckGo / Brave / SearXNG)
  - [ ] URL öffnen (`tauri-plugin-opener`, schon Abhängigkeit)
  - [ ] System-Info & Hardware-Specs (`sysinfo`)
  - [ ] Screenshot + Vision (`xcap`)
  - [ ] Zwischenablage (`arboard`)
  - [ ] Medien-Steuerung (MPRIS/D-Bus unter Linux)
  - [ ] App-Steuerung (starten/fokussieren/schließen)
  - [ ] GUI-Action (Maus/Tastatur via `enigo`; Wayland → `ydotool`/Portal)
  - [ ] Browser-Agent (`chromiumoxide` oder Playwright-Sidecar)
  - [ ] Code-Ausführung in Sandbox mit Timeout
  - [ ] File Organizer (mit Schutzpfaden)
  - [ ] Task Planner (Multi-Step-Ketten)
  - [ ] System-Vitals-Watchdog (Akku, GPU-Temperatur, fertige Downloads)
- [ ] **Plugin-System** für eigene Tools (SoW: `PluginLoader`) – z. B. WASM oder Skripte
- [ ] **MCP-Client** (Streamable HTTP + Legacy SSE) – z. B. `rmcp`-Crate (SoW: `mcp_client.py`)
- [ ] **Fokus nach Bestätigung zurückgeben** (SoW-Sicherheitsverhalten)

### Phase 17 – Ökosystem & Integrationen 🟢

- [ ] **Lokaler Web-Client** für Handy/Tablet – `axum` + WebSocket, Token-Auth, Host-Header-Prüfung, QR/Link kopieren, STT-Upload (SoW: `web_server.py`, `app/web_client/`)
- [ ] **Discord-Gateway** – `serenity`/`poise`: Nachrichten, Slash-Commands (ask/character/bind/unbind/reset/whoami/join/leave), Multi-User-Awareness, Vision für Bilder/GIFs, Voice-Channel-TTS, Cooldowns, Whitelist (SoW: `discord_manager.py`)
- [ ] **Discord Rich Presence** (SoW: `discord_rpc.py`)
- [ ] **Bildgenerierung** – A1111, ComfyUI (Workflow-Patching), DALL·E 3, NovelAI, FLUX; Kontext-Prompt aus Aussehen/Pose/Emotion/Szene (SoW: `image_generator.py`)
- [ ] **Character Gateway / Hub** – Karten suchen & herunterladen (Chub, SoulGateway), Trending (SoW: `character_cards.py`, `open_characters_gateway`)
- [ ] **KI-Charakterassistent** – geführter Wizard (Konzept → Persönlichkeit → Hintergrund → Beziehung → Felder) erzeugt eine Karte per LLM (SoW: `character_ai_assistant.py`)
- [ ] **Profil-Backup & Restore** – ZIP-Export nach Gruppen, Manifest, Sicherheits-Snapshots mit Rotation, Rollback (SoW: `profile_backup.py`)

### Phase 18 – UI-Politur, i18n & Auslieferung 🟢

- [ ] **Internationalisierung** – `i18next` mit `de`/`en`/`ru`; vorhandene SoW-`*.yaml`-Übersetzungen übernehmen (inkl. der 26 im Fork ergänzten Keys). Aktuell sind alle UI-Texte hartkodiert deutsch.
- [ ] **Themes** (Fenster-/UI-Theme) (SoW: `on_window_theme_changed`, `on_ui_appearance_changed`)
- [ ] **Updater-Dialog** für die App selbst (`tauri-plugin-updater`)
- [ ] **Logging** in Datei (`tracing-appender`), Log-Viewer
- [ ] **Paketierung** – AppImage, `.deb`, `.rpm`, AUR-PKGBUILD; Windows MSI/NSIS; macOS DMG
- [ ] **CI** – GitHub Actions: `cargo check`/`clippy`/`test`, `npm run build`, Release-Builds für alle Plattformen
- [ ] **Frontend-Tests** (Vitest) für Store & Parser
- [ ] **Mobile (iOS/Android)** – Tauri-Mobile-Targets; lokal nur Cloud-Provider oder Remote-llama-server

---

## ⚖️ 4. Architektur-Entscheidungen, die noch offen sind

| Frage | Optionen | Empfehlung |
|---|---|---|
| Schwere ML-Modelle (XTTS, Qwen3-TTS, RVC) | a) ONNX via `ort` · b) Python-Sidecar optional · c) weglassen | **Entschieden für Phase 13:** Whisper nativ via whisper.cpp; TTS/RVC über optionale, austauschbare HTTP-Sidecars. Damit bleibt die OtakuSoul-Kernlaufzeit Python-frei. |
| Embeddings | `fastembed-rs` · `ort` + eigenes Modell · llama-server `/embedding` | `/embedding` des laufenden llama-servers oder `fastembed-rs` – spart ein zweites Modell im VRAM, je nach Setup |
| Chat-Speicherung | SQLite · JSONL-Dateien | SQLite (ist schon da), Export nach JSONL |
| Wayland-Automation (Companion) | `enigo`, `ydotool`, XDG-Portals | Portals wo möglich, sonst `ydotool` mit klarer Setup-Anleitung |

---

## 📌 5. Empfohlene nächste Schritte

1. **Technische Schulden** aus Abschnitt 2 (Pfade, persistente Settings, Dateidialog).
2. **Phase 8 + 9** – damit ist OtakuSoul als tägliche Chat-App nutzbar.
3. **Phase 11** – Soul Memory lebendig machen (größter Unterschied zu „nur ein Chat-Frontend“).
4. Als Nächstes: **Phase 14** (Avatare & Emotionen) oder **Phase 15** (Stage-GM).
