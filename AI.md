# 🧠 AI.md – System Memory & Architekturguide für KI-Assistenten

> **Hinweis für KI-Assistenten:** Dieses Dokument dient als permanentes Langzeitgedächtnis, architektonischer Leitfaden und Regelwerk für jedes KI-System, das an **OtakuSoul** arbeitet. Lies dieses Dokument vor jedem Eingriff sorgfältig.

---

## 📌 1. Projekt-Identität & Vision

- **Name:** OtakuSoul
- **GitHub Repository:** [https://github.com/SnowwhiteOakheart/OtakuSoul](https://github.com/SnowwhiteOakheart/OtakuSoul) (Remote: `origin`, Branch: `main`)
- **Ursprung:** Neuentwicklung und vollständige Portierung von *Soul of Waifu* (`/home/deathtrap/development/Soul-of-Waifu-linux`).
- **Kernziel:** Vollständige Eliminierung des Python-Interpreter-Overheads. Alle Kernfunktionen laufen in **nativem Rust (Tauri v2)** und modernstem **React 19 / TypeScript / Vite / Tailwind CSS v4 / WebGL (Three.js VRM + Pixi.js Live2D)**.

---

## 📜 2. Unveränderliche Projekt-Regeln (Strikte Befolgung!)

1. **Benutzer-Anrede (Informell):**
   Sprich den Benutzer **immer mit „Du“** an, niemals mit „Sie“.
2. **Git-Disziplin nach jeder Phase:**
   Nach jedem Meilenstein, jeder Phase oder größeren Feature-Fertigstellung wird ein sauberer Git-Commit erstellt und direkt auf GitHub (`origin main`) gepusht (`git push origin main`).
3. **Lebendige Dokumentation (`README.md` & `AI.md`):**
   Sowohl `README.md` als auch `AI.md` müssen **stets aktuell gehalten werden**. Sobald neue Module, Typen oder Features hinzukommen, werden beide Dokumente synchronisiert.
4. **Fehler- und Warnungsfreiheit:**
   Es dürfen **keine Compiler- oder Linter-Warnungen** existieren.
   Vor jedem Commit muss geprüft werden:
   - `cargo check` (0 Warnungen, 0 Fehler)
   - `cargo test` (alle Unit-Tests grün)
   - `npm run build` (TypeScript-Kompilierung & Vite-Bundle fehlerfrei)
5. **Cross-Platform-Konformität:**
   OtakuSoul ist von Anfang an für **Linux**, **Windows**, **macOS** sowie vorbereitend für **Mobile (iOS & Android)** ausgelegt:
   - Keine hartcodierten OS-Pfade verwenden. Nutze `directories::ProjectDirs` für Standardpfade (`%APPDATA%`, `~/.local/share`, `~/Library/Application Support`).
   - Plattformspezifischer Code (z.B. Linux `PR_SET_PDEATHSIG`) muss sauber mit `#[cfg(target_os = "...")]` gekapselt werden.
6. **Autarke Audio- & Asset-Pipelines:**
   - Soundeffekte werden über die Web Audio API synthetisiert (`src/services/soundFx.ts`), um externe Abhängigkeiten zu minimieren.
   - Binärdaten (VRM, PNG-Karten) werden via nativer IPC-Befehle (`read_file_binary`) als Byte-Array übertragen (CORS-frei).

---

## 🏗️ 3. Technische Architektur

```
+-------------------------------------------------------------------------------+
|                                   OtakuSoul                                   |
+-------------------------------------------------------------------------------+
| FRONTEND: React 19 + TypeScript + Vite 8 + Tailwind CSS v4                   |
| ├─ Avatar Engine: Three.js + @pixiv/three-vrm (LipSync, Blinzeln, Atmung)     |
| ├─ 2D Engine: PixiJS Live2D Display                                          |
| ├─ Audio Synthesizer: Procedural Web Audio API (Würfel, Fanfaren, Lagerfeuer)|
| ├─ State Management: Zustand (useAppStore.ts)                                 |
| ├─ UI Views: ChatView, StageView, CompanionView, SettingsView                |
| └─ Safety: Human-in-the-Loop 25s Countdown Banner                            |
+-------------------------------------------------------------------------------+
                                      ▲
                           Tauri IPC (Async / Events)
                                      ▼
+-------------------------------------------------------------------------------+
| BACKEND: Rust (Tauri v2 + Tokio)                                              |
| ├─ hardware.rs: GPU/VRAM Probe, automatische n_gpu_layers Zuteilung           |
| ├─ llama_manager.rs: Child-Prozesssteuerung mit PR_SET_PDEATHSIG              |
| ├─ inference.rs: SSE Streaming Proxy mit <think> Reasoning Filter             |
| ├─ characters.rs: SillyTavern V2 Parser (PNG tEXt Chunks & JSON)              |
| ├─ lorebook.rs: Regex- & Keyword-Kontextaktivierung                           |
| ├─ prompt_builder.rs: System-Prompt Generator mit {{char}}/{{user}} Makros   |
| ├─ memory.rs: SQLite Soul Memory (4 Layer, Emotional Decay, Deduplizierung)   |
| ├─ stage.rs: Tabletop RPG Engine (d20/d100/2d6, DC-Check, Clocks, Kampf)      |
| └─ companion.rs: Neurohormone (Dopamin, Cortisol, Oxytocin) & Tool Calling   |
+-------------------------------------------------------------------------------+
```

---

## 📂 4. Wichtige Dateipfade & Modulübersicht

### Backend (`src-tauri/`)
| Pfad | Zweck |
|---|---|
| `src-tauri/src/modules/hardware.rs` | Hardware-Probe, NVIDIA VRAM/RAM Ermittlung & Layer-Rechner |
| `src-tauri/src/modules/llama_manager.rs` | `llama-server` Prozessmanager, Zombie-Schutz, `/health` Polling |
| `src-tauri/src/modules/inference.rs` | SSE Token-Streaming & `<think>` Gedanken-Trennung |
| `src-tauri/src/modules/characters.rs` | SillyTavern V2 Character Card Parser (PNG/JSON) |
| `src-tauri/src/modules/lorebook.rs` | Lorebook / World Info Keyword-Scanner |
| `src-tauri/src/modules/prompt_builder.rs` | Dynamischer Prompt-Builder inkl. Seelen-Zustand |
| `src-tauri/src/modules/memory.rs` | SQLite Kognitives Seelen-Gedächtnis & Emotional Decay |
| `src-tauri/src/modules/stage.rs` | RPG Würfel-Engine, Kampagnen-Clocks & Taktischer Kampf |
| `src-tauri/src/modules/companion.rs` | Neurohormone & Tool-Calling mit Sicherheitsabfrage |
| `src-tauri/src/state.rs` | Globaler Tokio/Tauri `AppState` |
| `src-tauri/src/commands.rs` | Alle Tauri IPC Commands |
| `src-tauri/src/lib.rs` | App Builder & Handler-Registrierung |

### Frontend (`src/`)
| Pfad | Zweck |
|---|---|
| `src/types/index.ts` | Shared TypeScript Typdefinitionen |
| `src/services/api.ts` | Getypte Wrapper für alle Tauri IPC-Commands |
| `src/services/soundFx.ts` | Autarker Web Audio SFX-Synthesizer |
| `src/store/useAppStore.ts` | Zentraler Zustand State Store |
| `src/components/Header.tsx` | VRAM-Monitor & Server-Status Header |
| `src/components/chat/ChatView.tsx` | Split-Screen Chat & 3D Avatar |
| `src/components/chat/RoleplayMessage.tsx` | Trennung von Handlungen (*...*) und gesprochenem Wort ("...") |
| `src/components/chat/AdaptiveHud.tsx` | Charakter-Switcher & Zuneigungs-/Statusleiste |
| `src/components/chat/CognitiveMemoryDrawer.tsx` | Seelenspeicher-Inspektor (SQLite) |
| `src/components/avatar/VrmViewer.tsx` | Three.js 3D VRM Player mit LipSync |
| `src/components/stage/StageView.tsx` | Tabletop RPG Dashboard & World State |
| `src/components/stage/ClockWidget.tsx` | SVG Tortendiagramm für Spannungs-Uhren |
| `src/components/stage/DiceRoller.tsx` | Interaktiver Würfelroller mit SG-Prüfung |
| `src/components/stage/EncounterTracker.tsx` | Initiativleiste, Kampfbegegnung & HP-Tracker |
| `src/components/companion/CompanionView.tsx` | Desktop-Agent Dashboard & Hormon-Monitor |
| `src/components/companion/SafetyCountdownBanner.tsx` | 25s Human-in-the-Loop Sicherheitsbanner |
| `src/components/settings/SettingsView.tsx` | Hardware-, Modell- und Server-Konfiguration |

---

## 🗃️ 5. Lokale Assets & Testdaten auf dem Nutzersystem

- **LLM GGUF-Modelle:** `/home/deathtrap/development/Soul-of-Waifu-linux/assets/local_llm/`
  - `Gemma4-12B-QAT-Uncensored-HauhauCS-Balanced-Q4_K_M.gguf`
  - `Qwen3.8-27B-Heretic-Q4_K_M.gguf`
- **Vorkompilierte llama-server Binary:** `/home/deathtrap/development/Soul-of-Waifu-linux/app/utils/ai_clients/backend/cuda/llama-server`
- **3D VRM Avatare:** `/home/deathtrap/development/Soul-of-Waifu-linux/assets/emotions/vrm/Anime Girl.vrm`
- **Charakterkarten & Lorebooks:** `/home/deathtrap/development/Soul-of-Waifu-linux/presets/`
- **Hardware des Benutzers:** NVIDIA GeForce RTX 4070 Ti SUPER (16.376 MB VRAM), CUDA 13.4, Vulkan 1.4, Arch Linux.

---

## 🧭 6. Phasen-Statusübersicht

- [x] **Phase 1: Projekt-Setup, Toolchain & GitHub Bootstrap** (Commit `70b2e84`)
- [x] **Phase 2: Hardware-Erkennung & llama-server Prozessmanager** (Commit `56dbfb2`)
- [x] **Phase 3: Character Cards V2, Lorebooks & Adaptive HUD** (Commit `012c490`)
- [x] **Phase 4: 3D VRM & 2D Avatar WebGL Engine mit LipSync** (Commit `a349ee0`)
- [x] **Phase 5: Kognitive Soul Memory mit SQLite & Emotional Decay** (Commit `05d9fa4`)
- [x] **Phase 6: Soul Stage Tabletop RPG & Procedural Web Audio SFX** (Commit `59f3792`)
- [x] **Phase 7: Soul Companion, Neurohormone & 25s Tool Safety** (Commit `aa9a8e5`)

**Offene Phasen 8–18** (Datenfundament, vollwertiger Chat, Provider, Soul Memory 2.0, Lorebook 2.0, Stimme, Live2D, Stage-GM, echter Companion, Ökosystem, i18n & Auslieferung) sowie bekannte technische Schulden sind in [`Roadmap.md`](Roadmap.md) dokumentiert. **Vor neuen Features dort nachsehen und erledigte Punkte mit Commit-Hash abhaken.**

---

## 💡 7. Tipps für zukünftige Erweiterungen & Best Practices

- **Reasoning-Unterdrückung im Rollenspiel:** Wie in *Soul of Waifu* ist der Reasoning-Modus standardmäßig **deaktiviert**, um lästige interne Denkmonologe zu unterbinden und die Generierung maximal zu beschleunigen. Bei `reasoning_mode = false` übergibt `llama_manager` die Flags `--reasoning off --reasoning-budget 0`, sendet `enable_thinking: false` und der System-Prompt untersagt `<think>`-Tags explizit. Umschaltbar über den Schnellschalter im Chat-HUD (`AdaptiveHud.tsx`) oder in den Einstellungen.
- **Streaming-Listener & React-Lifecycle:** Asynchrone Tauri-Listener (`listen(...)`) müssen zwingend mit einem `isSubscribed`-Guard gekapselt werden, damit bei unmounted Components / React StrictMode keine Geister-Listener verbleiben, die Tokens doppelt empfangen.
- **Mobile Viewports (iOS/Android):** Alle UI-Container nutzen Flex/Grid und sind vorbereitet für Touch-Gesten und responsive Breakpoints (`sm:`, `lg:`).
- **Tool Calling Erweiterung:** Neue Tools können direkt in `src-tauri/src/modules/companion.rs` in `execute_internal` registriert werden. Deklariere gefährliche Operationen in `is_dangerous`, damit der 25s Sicherheits-Countdown automatisch greift.
- **VS Code Makro-Linter:** Sollte `tauri::generate_context!()` in `src-tauri/src/lib.rs` jemals Typfehler anzeigen, stelle sicher, dass `.vscode/settings.json` und der Root-Workspace in `Cargo.toml` intakt sind.
