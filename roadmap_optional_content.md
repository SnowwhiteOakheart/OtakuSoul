# 🗺️ Roadmap: Optionale Inhalte für OtakuSoul (`otakusoul-data`)

Dieses Dokument koordiniert die Erstellung und schrittweise Implementierung von modularen, optionalen Inhalten für **OtakuSoul**. Alle hier definierten Charaktere, Lorebooks und Soul-Stage-Kampagnen werden im Repository **[`SnowwhiteOakheart/otakusoul-data`](https://github.com/SnowwhiteOakheart/otakusoul-data)** gepflegt und stehen lokal in der App zur Verfügung, ohne das Basis-Release der Anwendung aufzublähen.

---

## 💎 Qualitätsstandards je Inhalt

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

## 🌸 Phase 1: Beliebte Einzel-Charaktere (Chat & Soul Memory)

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

## 🗺️ Phase 2: Umfassende Serien-Kampagnen (Soul Stage, Lorebooks & Party-Cast)

---

### 🍲 Kampagne 2.1: *Dungeon Meshi* (*Delicious in Dungeon*)
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

### ⏳ Kampagne 2.2: *Steins;Gate* (*Zukunftsgadget-Labor & Weltlinien*)
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

### ☕ Kampagne 2.3: *Lycoris Recoil* (*Café LycoReco*)
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

### ⚔️ Kampagne 2.4: *Sword Art Online* (*Aincrad – 100 Ebenen des Todes*)
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

## 📈 Aktueller Status

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

## Bildbestand vom 04.10.2026

22 neue Avatare (700×937 PNG mit V2-Payload), 36 Expressions (640×800 WebP), eine zusätzliche Grimoire-Pose und 19 leere Szenenhintergründe (1376×768 PNG). Alle Avatare wurden ausschließlich aus Text generiert. Die Expressions und Grimoire-Pose verwenden nur die jeweils neu generierten Avatare als Referenz. Vorhandene Roadmap-Bilder wurden ersetzt.

Die Hintergründe liegen im jeweiligen Preset unter `backgrounds/`; Szenen referenzieren ihren Dateinamen über `starting_bg`. Zur lokalen Nutzung die gewünschten Hintergründe über Soul Stage importieren. Expressions liegen unter `presets/<paket>/expressions/`; die Karten-Zuordnung verwendet `expressions/<paket>/<emotion>.webp` für das lokale Expressions-Verzeichnis. Bereits importierte lokale Karten bei Bedarf erneut importieren.
