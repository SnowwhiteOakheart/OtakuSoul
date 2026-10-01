# 🗺️ OtakuSoul – Verbesserungs-Roadmap

> Stand: 2026-09-28 (zuletzt aktualisiert) · Ursprüngliche Analyse: Commit `8507fb8` (main)
> Grundlage: Code-Review von `src/` und `src-tauri/`, `npm outdated`, `cargo outdated`, `npm audit`,
> `cargo clippy`, `tsc`, Vitest/Cargo-Tests und eine Sichtprüfung der Oberfläche bei 1280×840 und 960×640 (Mindestgröße).
> Abgeschlossene Feature-Phasen stehen in `Roadmap_abgeschlossen.md`.

**Fortschritt:** P0, Abhängigkeiten, Navigation samt Befehlspalette, i18n, Dialoge/Feedback, Barrierefreiheit und Fenster-Plugins sind erledigt.
Offen sind vor allem Ersteinrichtung, Design-Bausteine, Store-/Komponenten-Aufteilung, Rust-Fehlertypen und Tests.

**Gesamtbild (Ausgangslage):** Funktional ist das Projekt weit. `tsc` läuft sauber, 63 Vitest- sowie 104 aktive Cargo-Tests sind grün
(zwei weitere Cargo-Tests benötigen Netzwerk bzw. lokale Modelldateien und bleiben standardmäßig ignoriert).
Die Schwächen liegen vor allem hier:

1. **Ein echter Laufzeit-Bug:** Das Web-Fetch-Tool des Companions stürzt ab.
2. **Veraltete Abhängigkeiten:** Einige Pakete sind hinterher, das Live2D-Paket ist ein Blocker mit Sicherheitslücke.
3. **Uneinheitliche Oberfläche:** i18n greift kaum, Themes wirken nur teilweise, es gibt keine Barrierefreiheit, der Header läuft über.

---

## 🔥 P0 – Kritisch (sofort) ✅ erledigt

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
- [x] *Zusätzlich gefunden:* Ein fest eingetragener Pfad `/home/deathtrap/...` im Live2D-Viewer wurde entfernt.

---

## 📦 P1 – Abhängigkeiten ✅ erledigt (alles auf aktuellem Stand)

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

### CI → lokale Checks

GitHub Actions wurden bewusst entfernt (Commit `11597c2`). Stattdessen gibt es jetzt:

- [x] `npm run check`: oxlint + `tsc` + Vitest + `cargo fmt --check` + `cargo clippy -- -D warnings` + `cargo test`. Clippy ist komplett warnungsfrei (vorher 50 Warnungen und 1 Fehler).
- [x] `cargo fmt` einmalig über das ganze Projekt, `cargo fmt --check` ist Teil von `npm run check`.

---

## 🎨 P1 – Oberfläche & Usability

### Navigation / Header (`src/components/Header.tsx`)

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

### Internationalisierung

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
- [ ] Übersetzungen einer Karte im Charakter-Editor bearbeiten (bisher nur in der JSON-Datei); Szenen, Lorebooks und
  Personas der Presets sind noch nur deutsch.

### Design-System & Themes

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

### Dialoge, Feedback & Zustände

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

### Barrierefreiheit (a11y)

- [x] Nur 5 `aria-label` bei rund 377 Buttons (jetzt über 150, alle Icon-Buttons beschriftet), viele davon reine Icon-Buttons. → Jedem Icon-Button ein `aria-label` geben.
- [x] Sichtbare Fokus-Ringe (`focus-visible:ring-…`) einheitlich über die `Button`-Komponente. `outline-none` kommt 118-mal vor.
- [x] 11 `<img>` ohne `alt`.
- [x] Klickbare `<div>` (z. B. Logo und Status im Header) in `<button>` umwandeln. Karten mit eigenen Buttons nutzen `pressable()`,
  oxlint (`jsx-a11y`) meldet neue Fälle.
- [ ] Kontrast prüfen: `text-slate-500` auf `slate-950` erreicht bei kleiner Schrift das WCAG-AA-Kontrastverhältnis nicht.
- [x] `prefers-reduced-motion` respektieren (Pulse-Animationen, Konfetti, Avatar-Idle).

### Fenster & Desktop-Integration

- [x] `tauri-plugin-window-state` einbinden, damit Fenstergröße und -position gespeichert werden.
- [x] `tauri-plugin-single-instance`, um doppelte Starts (und doppelte llama-server-Prozesse) zu verhindern.
- [x] Fest eingetragene Pfade `/home/deathtrap/...` entfernt (Live2D, Stage, MCP). Mitgelieferte Ordner werden relativ zu
  Arbeitsverzeichnis, Programmordner und (Debug) Quellcode gesucht; Soul of Waifu wird automatisch gefunden
  (oder per `SOUL_OF_WAIFU_DIR`).
- [x] **Ressourcen im Paket:** `bundle.resources` liefert `presets/`, `assets/emotions/`, `assets/live2d/` und die VRMs
  *Anime Girl*/*Anime Man* mit; die App findet sie über Tauris Ressourcenordner. Weitere VRMs kommen als separates
  Avatar-Paket ins GitHub-Release (`tools/package_avatar_pack.sh`, prüft `lizenzen.txt`), GGUF-Modelle über den Modell-Hub.
- [x] llama.cpp wird nicht gebündelt, sondern in der App geladen (Einstellungen → llama-server): offizielle Builds des
  aktuellen *stabilen* Releases (`v0.5.0` → `b11146`), Varianten je System (CUDA/Vulkan/ROCm/CPU/Metal) mit Empfehlung
  nach GPU, SHA-256-Prüfung, Installation im Datenordner (`modules/llama_runtime.rs`).
- [ ] Tray-Icon für den Companion (minimieren in den Tray statt beenden).
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
- [ ] Command-Wrapper in `api.ts` typsicher erzeugen, sobald `tauri-specta` eine stabile 2.0 hat.
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

### Backend

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

### Tests

- [ ] *(teilweise: Store-Tests mit API-Mock, Komponenten-Tests mit Testing Library/jsdom für Dialog, Menü, ErrorBoundary,
  Bestätigungsdialog, `pressable`, UI-Primitive, Befehlspalette und den Einrichtungsassistenten – 63 Tests in 10 Suites; offen: Chat, Stage, Charakter-Editor)* Frontend-Abdeckung ausbauen: Tests für Store-Slices, `api.ts`-Mocks
  und Kernkomponenten mit `@testing-library/react` ergänzen.
- [x] E2E-Rauchtest mit WebdriverIO + `tauri-driver` (`npm run e2e`, `e2e/`): startet die Debug-Build mit Wegwerf-Profil
  (`OTAKUSOUL_HOME`, ohne Einzelinstanz-Sperre) gegen ein Mock-LLM, chattet bis zum Kontext-Überlauf und prüft
  Kontextanzeige, automatische Zusammenfassung (Seitenleiste und System-Prompt); Screenshots in `e2e/screenshots/`.
  Fand gleich einen Fehler: Die Charakterleiste (z-40) verdeckte die Tabs der Chat-Seitenleiste.
- [x] Rust: Tests für `companion_tools`, `web_server` (Auth) und `profile_backup` (Round-Trip inkl. Datenbank, Gruppenauswahl, Rotation) vorhanden.
  Der Stage-Test für Nachrichtenbearbeitung/-löschung nutzt einen injizierten No-op-Speicher und berührt kein echtes App-Datenverzeichnis mehr.
  *Ursprünglich:* Tests für `companion_tools` (Web-Fetch, Shell-Freigaben), `web_server` (Auth) und `profile_backup` (Round-Trip).

---

## 🖼️ Lokale Bildgenerierung (offline, mit VRAM-Handling)

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

  Noch offen: Parallelbetrieb auf 24 GB (keine Karte vorhanden).
- [x] Freier VRAM auch auf AMD/Intel: Grafikkarten werden zusätzlich über Vulkan erkannt (`ash`, Loader erst zur
  Laufzeit geladen) – Name, Hersteller, VRAM, freier Speicher (`VK_EXT_memory_budget`) und ob es eine iGPU ist.
  Geplant und festgelegt wird immer auf der größten dedizierten GPU; iGPUs nur, wenn es keine andere gibt.
- [ ] Anime-LoRAs (Flux/SDXL) auswählbar machen (`/sdapi/v1/loras`), Pony V6 (nur über Civitai mit Login) und eine
  SD-1.5-Stufe für 4-GB-Karten.

---

## ✨ P3 – Nice-to-have

- [x] Hardware-Probe für AMD und Intel (Linux und Windows über Vulkan, siehe Bildgenerierung).
- [ ] Apple Metal: `recommendedMaxWorkingSetSize` statt des gesamten Arbeitsspeichers als GPU-Speicher.
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
- [ ] Offene Chat-Funktionen aus `Roadmap_abgeschlossen.md` (Phase 9): System-Prompt-Editor, Datei-Anhänge und Vision,
  Übersetzung.
- [ ] Migrationsimport aus einer bestehenden Soul-of-Waifu-Installation.
- [ ] Virtualisierte Listen (`@tanstack/react-virtual`) für lange Chats, große Charakter- und Lorebook-Bibliotheken.
- [ ] Bundle-Analyse (`rollup-plugin-visualizer`); `chunkSizeWarningLimit: 800` in `vite.config.ts` nur als Übergang.

---

## ✅ Empfohlene Reihenfolge

1. ✅ **P0 komplett**: Regex-Bug, CSP/Scope, Schlüsselbund, Webserver-Absicherung.
2. ✅ **Tauri-Minor-Updates + lokale Checks + Clippy-Bereinigung.** Geringes Risiko, schafft ein Sicherheitsnetz.
3. ✅ *(Bausteine teilweise)* **Design-Tokens + UI-Bausteine** (`Button`, `Modal`, `ConfirmDialog`, `Toast`, `EmptyState`), danach **Navigation neu**.
4. ✅ **i18n flächendeckend** (lässt sich gut mit Schritt 3 kombinieren, weil ohnehin jede Komponente angefasst wird).
5. **Store-Slices + Selektoren**, Komponenten aufteilen.
6. ✅ **Große Upgrades:** Live2D-Stack/pixi v8, rusqlite, reqwest, TypeScript 7.
7. P3 nach Bedarf.
