# 🏷️ Neutrale Modul-Architektur & SoW-Entkopplung (Roadmap)

> Stand: Oktober 2026  
> **Kernprinzip: Maximale Neutralität & Entkopplung (White-Label-Ready)**  
> OtakuSoul wird vollständig von *Soul of Waifu (SoW)* entkoppelt und der veraltete SoW-Import wird gestrichen. Gleichzeitig erhalten alle Kernmodule **neutrale, funktionale Namen** (ohne feste Markenvorsätze wie „Soul“ oder „Otaku“). Der Anwendungsname und die Logos werden zentralisiert, sodass ein späterer Rebrand jederzeit mit minimalem Aufwand (1 Konstante + Logos) möglich ist.

---

## 🎯 1. Das neutrale Namensschema

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

## 🧭 Übersicht der Phasen

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

## 📌 Phase 1: Vollständige Entfernung des SoW-Imports & der Altlasten
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

## 📌 Phase 2: Neutrale Charakterkarten-Metadaten (`sow_*` → `custom_*`)
> **Ziel:** V2-Karten-Extensions werden markenneutral benannt. Bestehende Karten werden beim Lesen tolerant toleriert, beim Speichern wird nur noch der neutrale Standard geschrieben.

- [ ] **2.1 Typsystem aktualisieren (`src/types/index.ts`)**
  - [ ] `CharacterCardV2Data.extensions`:
    - `custom_title?: string` (Fallback beim Lesen: `sow_title`)
    - `custom_vrm?: string` (Fallback beim Lesen: `sow_vrm`)
    - `custom_live2d?: string` (Fallback beim Lesen: `sow_live2d`)
    - `custom_avatar?: string` (Fallback beim Lesen: `sow_avatar`)
    - `custom_expressions?: Record<string, string>` (Fallback beim Lesen: `sow_expressions`)
    - `custom_i18n?: { ... }` (Fallback beim Lesen: `sow_i18n`)
- [ ] **2.2 Charakter-Editor anpassen (`CharacterEditorModal.tsx` & `CharacterTranslationsTab.tsx`)**
  - [ ] Tolerante Lese-Logik: `card.data.extensions?.custom_title || card.data.extensions?.sow_title`.
  - [ ] Saubere Schreib-Logik: Beim Speichern nur noch `custom_*` setzen und Altlast-Schlüssel bereinigen.
  - [ ] Feldname im Übersetzungs-Tab von `sow_title` auf `custom_title` umstellen.
- [ ] **2.3 Rendering-Komponenten anpassen**
  - [ ] `CharacterLibraryView.tsx`: Titelauflösung auf `custom_title` umstellen.
  - [ ] `AdaptiveHud.tsx`: Titelauflösung auf `custom_title` umstellen.
  - [ ] `AvatarCanvas.tsx`: VRM- und Live2D-Pfadauflösung auf `custom_vrm` / `custom_live2d` umstellen.
- [ ] **2.4 Rust-Export anpassen (`src-tauri/src/modules/characters.rs`)**
  - [ ] V2-PNG-Export (`chara` Chunk) schreibt saubere `custom_*`-Felder in die Extensions.

---

## 📌 Phase 3: Zentrales Branding & neutrale UI-Begriffe
> **Ziel:** Kein statisch hardcodierter App-Name mehr in Texten. Subsysteme heißen in der UI rein funktional. Ein zukünftiger Titelwechsel ändert nur noch 1 Konstante.

- [ ] **3.1 Zentrale Branding-Konstante etablieren**
  - [ ] Frontend-Konstante anlegen (z. B. in `src/constants/branding.ts`):
    ```typescript
    export const APP_NAME = "OtakuSoul"; // Zukünftig mit 1 Änderung austauschbar
    export const APP_DEFAULT_COMPANION_NAME = "Companion";
    ```
  - [ ] Rust-Backend Konstante (z. B. in `paths.rs` oder `settings.rs`): App-Titel für Fallbacks definieren.
- [ ] **3.2 Navigation & Hauptmenü neutralisieren**
  - [ ] `src/components/navigation.ts`:
    - Tab-Labels: **Stage**, **Hub**, **Companion**, **Chat**, **Charaktere**, **Einstellungen**.
  - [ ] `src/components/Sidebar.tsx` & `Header.tsx`: Neutrale Tooltips.
- [ ] **3.3 Modul-Ansichten neutralisieren**
  - [ ] `SoulHubView.tsx`: Umbenennung des Headers in **Community Hub** (oder **Hub**).
  - [ ] Tabs: „Kuratierte Charaktere“ (Gateway), „Chub AI“, „Lorebooks“, „Stage-Szenarien“.
  - [ ] `CognitiveMemoryDrawer.tsx`: Header-Titel neutral auf **Kognitives Gedächtnis** / **Cognitive Memory** setzen.
  - [ ] `StageView.tsx`: Überschriften rein auf **Stage** / **Spielleiter** ausrichten.
  - [ ] `CompanionView.tsx` & `FloatingCompanionOverlay.tsx`: Standard-Name auf **Companion** setzen.
- [ ] **3.4 Wörterbücher (i18n) aktualisieren (`de.ts`, `en.ts`, `ru.ts`)**
  - [ ] Alle Modul-Schlüssel neutral formulieren (Stage, Cognitive Memory, Companion, Hub).
  - [ ] Dynamische Platzhalter wie `{{appName}}` nutzen, wo der Programmname im Text vorkommt.

---

## 📌 Phase 4: Neutrale Code-Internals, Prompts & Mocks
> **Ziel:** Prompts, Moduldateien und Test-Mocks von Markenpräfixen befreien.

- [ ] **4.1 System-Prompts & E2E-Mocks neutralisieren**
  - [ ] In `src-tauri/src/modules/stage/turn.rs`, `world.rs`, `director.rs`:
    - `[SOUL STAGE — GAME MASTER PLANNER]` → `[STAGE — GAME MASTER PLANNER]`
    - `[SOUL STAGE — GAME MASTER NARRATOR]` → `[STAGE — GAME MASTER NARRATOR]`
    - `[SOUL STAGE — NPC]` → `[STAGE — NPC]`
    - `[SOUL STAGE — ROUTING]` → `[STAGE — ROUTING]`
    - `[SOUL STAGE — ARC ARCHIVE]` → `[STAGE — ARC ARCHIVE]`
    - `[SOUL STAGE — CONSISTENCY]` → `[STAGE — CONSISTENCY]`
  - [ ] **Wichtig:** Erkennungs-Strings in den Test-Mocks (E2E / Mock-LLM) synchron auf `[STAGE — ...]` anpassen.
- [ ] **4.2 Dateinamen & Rust-Module neutralisieren**
  - [ ] `src-tauri/src/modules/soul_hub.rs` → `src-tauri/src/modules/hub.rs`.
  - [ ] `src-tauri/src/modules/soul_memory_pipeline.rs` → `src-tauri/src/modules/memory_pipeline.rs`.
  - [ ] `src/components/hub/SoulHubView.tsx` → `src/components/hub/HubView.tsx`.
  - [ ] Generierte TS-Typen aktualisieren (`npm run types:gen`).
- [ ] **4.3 Backup-Manifest neutralisieren (`profile_backup.rs`)**
  - [ ] Gruppen im Manifest: `memory: bool`, `stage: bool`, `companion: bool`.
  - [ ] Abwärtskompatibilität: Alte Backups mit `soul_memory` oder `soul_stage` beim Einlesen weiterhin korrekt zuordnen.

---

## 📌 Phase 5: Dokumentation, Hygiene & Finale Verifikation
> **Ziel:** Vollständige Bereinigung der Dokumente und Absicherung der Funktionsfähigkeit.

- [ ] **5.1 Dokumentation neutralisieren**
  - [ ] `AI.md`: Historische Bindung entfernen; Architektur modular beschreiben; Mock-Signalstrings aktualisieren.
  - [ ] `README.md`: Modulübersicht auf funktionale Begriffe umstellen.
  - [ ] `ROADMAP.md` & `Roadmap_abgeschlossen.md`: Überschriften harmonisieren.
- [ ] **5.2 Code-Kommentare bereinigen**
  - [ ] Historische SoW-Kommentare entfernen oder neutral formulieren.
- [ ] **5.3 Vollständiger Prüflauf**
  - [ ] `npm run check` (oxlint, tsc, vitest, cargo fmt, clippy, cargo test).
  - [ ] `npm run e2e` (E2E-Rauchtest mit Mock-LLM).
  - [ ] Sichtprüfung bei unterschiedlichen Bildschirmauflösungen.

---

## 🚀 Vorteil dieser neutralen Struktur

Wenn Du Dich später für einen finalen Namen (oder ein Rebranding mit neuem Logo) entscheidest:
1. **App-Name:** Nur die zentrale Konstante `APP_NAME` in Frontend & Backend anpassen.
2. **Logos & Icons:** Bilddateien in `assets/` / `public/` austauschen.
3. **Null Code-Refaktorisierung:** Keine Modulnamen, keine System-Prompts, keine E2E-Mocks und keine Datenbankfelder müssen je wieder angefasst werden.
