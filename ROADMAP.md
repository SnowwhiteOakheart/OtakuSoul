# 🗺️ OtakuSoul – Verbesserungs-Roadmap

> Stand: 2026-09-28 (zuletzt aktualisiert) · Ursprüngliche Analyse: Commit `8507fb8` (main)
> Grundlage: Code-Review von `src/` und `src-tauri/`, `npm outdated`, `cargo outdated`, `npm audit`,
> `cargo clippy`, `tsc`, Vitest/Cargo-Tests und eine Sichtprüfung der Oberfläche bei 1280×840 und 960×640 (Mindestgröße).
> Abgeschlossene Feature-Phasen stehen in `Roadmap_abgeschlossen.md`.

**Fortschritt:** P0, Abhängigkeiten, Navigation, i18n, Dialoge/Feedback, Barrierefreiheit und Fenster-Plugins sind erledigt.
Offen sind vor allem Ersteinrichtung, Design-Bausteine, Store-/Komponenten-Aufteilung, Rust-Fehlertypen und Tests.

**Gesamtbild (Ausgangslage):** Funktional ist das Projekt weit. `tsc` läuft sauber, 16 Vitest- und 91 Cargo-Tests sind grün.
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
- [ ] **Befehlspalette** (`Strg+K`).
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
- [ ] Rust-Fehler als Fehlercodes zurückgeben und im Frontend übersetzen, statt deutschen Klartext aus `format!()` anzuzeigen.
- [x] `<html lang="de">` beim Sprachwechsel dynamisch setzen.

### Design-System & Themes

- [x] **Themes wirken nur teilweise.** → Erledigt: `@theme`-Tokens `accent`/`accent2`/`app`, fest verdrahtete Lila-Töne umgestellt
  (ein Rest von ~25 bewusst farbigen Stellen, z. B. Emotionen, bleibt).
  *Ursprünglicher Befund:* `App.css` definiert `--theme-accent`, es wird aber nur 6-mal verwendet, während im Code
  **777 Mal** `purple-/violet-/fuchsia-*` fest verdrahtet ist. Wählt man „Cyberpunk“ oder „Emerald“, bleiben Buttons, Tabs und Rahmen lila.
  → In Tailwind v4 per `@theme` semantische Tokens definieren (`--color-accent`, `--color-surface`, `--color-border`, `--color-muted` …)
  und die festen Farbklassen auf `bg-accent`, `text-accent` usw. umstellen.
- [ ] *(teilweise: `ModalOverlay`, `confirmDialog`, `toast`, `DropdownMenu`, `EmptyState`, `ErrorBoundary`, `pressable` gibt es;
  offen: `Button`, `IconButton`, `Tabs`, `Select`, `Toggle`, `Slider`, `Tooltip`)* **Wiederverwendbare UI-Bausteine** anlegen (`src/components/ui/`): `Button` (primary/secondary/ghost/danger), `IconButton`,
  `Modal`/`Dialog`, `Tabs`, `Select`, `Toggle`, `Slider`, `EmptyState`, `Toast`, `ConfirmDialog`, `Tooltip`.
  Heute wird jedes der 377 `<button>`-Elemente mit langen, kopierten Klassenketten gestaltet.
- [x] **Zu kleine Schrift:** 9/10 px sind komplett entfernt, 11 px nur noch für Badges (~135 Stellen). Ursprünglich 333 Stellen mit `text-[9px]`, `text-[10px]` oder `text-[11px]`. Auf HiDPI- und Linux-Systemen schwer lesbar.
  → Untergrenze 12 px (`text-xs`) für Text, 11 px höchstens für Badges.
- [x] Veraltete Tailwind-v3-Klassen modernisieren: `bg-gradient-to-*` → `bg-linear-to-*`, `flex-shrink-0` → `shrink-0`, `flex-grow` → `grow` (48 Stellen).
- [ ] Emojis in UI-Texten (24 Stellen, in den Wörterbüchern noch ~34) durch `lucide-react`-Icons ersetzen, damit alles konsistent gerendert wird (Linux-Schriftfallback).
- [ ] Einen **hellen Modus** bzw. einen Theme passend zu `prefers-color-scheme` anbieten. Aktuell gibt es nur dunkle Themes.
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
- [ ] Skelett-Loader statt reinem Text beim Laden von Ansichten und Listen.

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
- [ ] Tray-Icon für den Companion (minimieren in den Tray statt beenden).
- [ ] **Updater:** Aktuell wird nur geprüft und auf die GitHub-Release-Seite verlinkt. → `tauri-plugin-updater` mit signierten Updates nutzen.
  *(Benötigt einen eigenen Signaturschlüssel des Projektinhabers.)*

---

## 🏗️ P2 – Code-Architektur & Wartbarkeit

### Frontend

- [x] **`useAppStore.ts` hatte 3.047 Zeilen.** → Aufgeteilt in 10 Slices unter `src/store/slices/` (app, avatar, llm, character,
  lorebook, memory, stage, companion, chat, ecosystem), gemeinsame Helfer in `helpers.ts`, Typen in `storeTypes.ts`.
  `useAppStore` bleibt der einzige Einstiegspunkt.
- [x] **Unnötige Re-Renders:** → Alle Komponenten abonnieren nur noch ihre Felder (`useStoreFields(...)` bzw. Selektoren).
  *Ursprünglich:* 29 Komponenten holen den ganzen Store (`const { … } = useAppStore()`), nur eine nutzt einen Selektor.
  Jeder Status-Poll (alle 2 s) rendert dadurch fast die gesamte App neu. → Selektoren mit `useShallow` verwenden.
- [x] Riesige Komponenten aufgeteilt: `SettingsView` → `settings/sections/`, `SoulHubView` → `hub/tabs/` (mit eigenem Hub-Store),
  `CompanionView` → `companion/tabs/`, `IntegrationsView` → `integrations/tabs/`, `CognitiveMemoryDrawer` → `chat/memory/`,
  `LorebookView` → Seitenleiste, Eintragskarte und Eintragsdialog. Keine Datei liegt mehr über 800 Zeilen.
- [ ] `src/types/index.ts` (1.138 Z.): Typen aus Rust generieren (`specta` + `tauri-specta` oder `ts-rs`), damit Frontend und Backend nicht auseinanderlaufen.
  Gleichzeitig erhält man typisierte `invoke`-Aufrufe statt manueller Wrapper in `api.ts` (1.179 Z.).
- [ ] `any` beseitigen (oxlint warnt; von 35 auf 18 reduziert), 185× `console.*` durch den vorhandenen Logger ersetzen.
- [x] `tsconfig`: `target`/`lib` von ES2020 auf ES2022+ anheben, `noUncheckedIndexedAccess` aktivieren.
- [x] Linter eingerichtet: **oxlint** mit React-Hooks-, `jsx-a11y`- und TypeScript-Regeln (typescript-eslint unterstützt TS 7 noch nicht).
  Offene Warnungen: `any`, Effekt-Abhängigkeiten, `setState` in Effekten. Prettier fehlt noch.
- [ ] React 19 nutzen: `useActionState` / `useOptimistic` für Chat-Senden und Formulare, `use()` für Ladezustände.
- [ ] Routing: Optional die Ansichten über einen leichten Router (z. B. TanStack Router) abbilden, damit Deep-Links
  (Overlay, mobiler Webclient) und „Zurück“ funktionieren, statt `window.location.search.includes('overlay=true')`.

### Backend

- [x] 50 Clippy-Warnungen beheben (`map_or`, fehlende `Default`-Impls, `sort_by_key`, unnötige Klone …) und danach `-D warnings` in der CI erzwingen.
- [ ] 221× `unwrap()` im Rust-Code prüfen. In Command-Pfaden durch `?` und einen gemeinsamen Fehlertyp (`thiserror`) ersetzen,
  damit das Frontend strukturierte Fehler bekommt und die App nicht abstürzt (siehe P0-Regex).
- [ ] `commands.rs` (1.697 Z.) nach Domänen aufteilen (`commands/chat.rs`, `commands/stage.rs` …); `stage.rs` (2.971 Z.) und `memory.rs` (2.069 Z.) ebenfalls modularisieren.
- [ ] *(teilweise: `companion_tools`)* Regexe per `std::sync::LazyLock` statt `Regex::new` pro Aufruf. Offen in `memory.rs`, `voice.rs`, `emotions.rs`, `stage.rs`, `companion.rs`.
- [ ] `tracing-subscriber` mit `env-filter` und Log-Rotation (`tracing-appender`) konfigurieren.
- [ ] Datenbank-Migrationen versionieren (`rusqlite_migration` oder `PRAGMA user_version`), bevor das rusqlite-Upgrade kommt.

### Tests

- [ ] *(teilweise: Store-Tests mit API-Mock, Komponenten-Tests mit Testing Library/jsdom für Dialog, Menü, ErrorBoundary,
  Bestätigungsdialog, `pressable` und den Einrichtungsassistenten – 47 Tests; offen: Chat, Stage, Charakter-Editor)* Frontend-Abdeckung ausbauen: Aktuell gibt es nur 3 Testdateien (i18n, soundFx, stateParser). Tests für Store-Slices, `api.ts`-Mocks
  und Kernkomponenten mit `@testing-library/react` ergänzen.
- [ ] E2E-Rauchtest mit WebdriverIO + `tauri-driver` (App starten, Charakter importieren, Chat senden gegen einen Mock-Provider).
- [x] Rust: Tests für `companion_tools`, `web_server` (Auth) und `profile_backup` (Round-Trip inkl. Datenbank, Gruppenauswahl, Rotation) vorhanden.
  *Ursprünglich:* Tests für `companion_tools` (Web-Fetch, Shell-Freigaben), `web_server` (Auth) und `profile_backup` (Round-Trip).

---

## ✨ P3 – Nice-to-have

- [ ] Hardware-Probe für AMD (ROCm/sysfs), Intel und Apple Metal. Heute gibt es nur `nvidia-smi` (offen aus der alten Roadmap).
- [ ] Offene Chat-Funktionen aus `Roadmap_abgeschlossen.md` (Phase 9): Kontextfenster-Management mit Token-Zählung,
  automatische Zusammenfassung, System-Prompt-Editor, Datei-Anhänge und Vision, Übersetzung.
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
