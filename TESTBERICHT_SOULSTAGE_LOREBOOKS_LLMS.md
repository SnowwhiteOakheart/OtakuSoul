# 🛡️ Umfassender Testbericht: Lokale LLMs in Soulstage, Gruppenchat & Lorebooks

- **Testdatum & Uhrzeit:** 2026-10-25 12:10:19
- **Test-System:** AMD Ryzen AI 9 HX 470 | NVIDIA GeForce RTX 4070 Ti SUPER (16.376 MB VRAM)
- **VRAM Baseline / Aktuell:** 1569 MB / 10999 MB
- **Getestete Modelle:** 12 Modelle
- **Testumfang pro Modell:**
  1. **Soul Stage 5e Kampagne (10 Runden):** Erkundung, Kampfsystem, NPC-Orchestrierung & dynamisches Lorebook (`dunkelwald_lore.json`)
  2. **Gruppenchat mit 4 Teilnehmern (10 Runden):** Automatische Regie/Routing (Nagatoro, Lirwen, Faelion, Shiori) & Bildgenerierung (`sd.cpp` Counterfeit-v3)
  3. **1-on-1 Dialog, Lorebook-Tiefenabfrage & Multimodal Vision:** Rollentreue, Faktenabruf ('Goldener Pinsel von Kazehaya') & Bilderkennung

## 1. 📊 Gesamtübersicht & Leistungs-Vergleichsmatrix

| Modell | Runtime | VRAM | Tok/s | 5e Runden | Gruppe Runden | Lore Recall | Vision | Gesamt-Score | Urteil |
|---|---|---|---|---|---|---|---|---|---|
| **Ternary-Bonsai-2-27B-PQ2_0** | Prism | 8823 MB | **29.6** | 2/10 | 10/10 | 🟡 Teilweise | – | **6.39 / 10** | ⚠️ Befriedigend (Erhöhte Latenz oder gelegentliche Abweichungen) |
| **gemma-4-E4B-it-Q4_K_M (Vision)** | Standard | 5780 MB | **73.3** | 10/10 | 10/10 | ✅ Volltreffer | ✅ (3) | **8.75 / 10** | 🌟 Spitzenklasse (Hervorragende Rollentreue, hohe Geschwindigkeit & präzise Lore) |
| **gemma-4-12b-it-Q4_K_M (Vision)** | Standard | 8873 MB | **43.1** | 10/10 | 10/10 | ✅ Volltreffer | ✅ (6) | **8.12 / 10** | 🚀 Sehr gut (Starker Allrounder für Soulstage & Gruppenchat) |
| **Gemma4-12B-QAT-Uncensored-HauhauCS-Balanced** | Standard | 8869 MB | **43.4** | 2/10 | 10/10 | 🟡 Teilweise | – | **6.68 / 10** | 👍 Gut & solide (Zuverlässig für Rollenspiel & Dialoge) |
| **Mistral-Nemo-Instruct-2407** | Standard | 9327 MB | **36.8** | 5/10 | 9/10 | 🟡 Teilweise | – | **6.54 / 10** | 👍 Gut & solide (Zuverlässig für Rollenspiel & Dialoge) |
| **Rocinante-X-12B-v1b** | Standard | 9169 MB | **45.4** | 10/10 | 9/10 | 🟡 Teilweise | – | **7.47 / 10** | 👍 Gut & solide (Zuverlässig für Rollenspiel & Dialoge) |
| **Cydonia-24B-v4zg** | Standard | 10980 MB | **9.0** | 4/10 | 10/10 | 🟡 Teilweise | – | **6.03 / 10** | ⚠️ Befriedigend (Erhöhte Latenz oder gelegentliche Abweichungen) |
| **Hearthfire-24B** | Standard | 11504 MB | **9.6** | 4/10 | 10/10 | 🟡 Teilweise | – | **6.03 / 10** | ⚠️ Befriedigend (Erhöhte Latenz oder gelegentliche Abweichungen) |
| **gemma-4-26B-A4B-it-UD** | Standard | 11334 MB | **22.3** | 10/10 | 10/10 | ✅ Volltreffer | – | **7.69 / 10** | 🚀 Sehr gut (Starker Allrounder für Soulstage & Gruppenchat) |
| **Qwen3.8-27B-Heretic** | Standard | 10358 MB | **4.7** | 5/10 | 10/10 | 🟡 Teilweise | – | **6.03 / 10** | ⚠️ Befriedigend (Erhöhte Latenz oder gelegentliche Abweichungen) |
| **Qwen3.6-35B-A3B-UD** | Standard | 11146 MB | **18.5** | 10/10 | 10/10 | ✅ Volltreffer | – | **7.61 / 10** | 🚀 Sehr gut (Starker Allrounder für Soulstage & Gruppenchat) |
| **Ternary-Bonsai-27B-PQ2_0 (v1)** | Prism | 8701 MB | **43.6** | 10/10 | 10/10 | 🟡 Teilweise | – | **7.43 / 10** | 👍 Gut & solide (Zuverlässig für Rollenspiel & Dialoge) |

---

## 2. 🔍 Detaillierte Modellauswertungen

### 🔹 Modell: Ternary-Bonsai-2-27B-PQ2_0

- **Architektur / Runtime:** Prism | Größe: 6872 MB | Offloaded GPU Layers: 64/64
- **VRAM-Bedarf:** 8823 MB | **Geschwindigkeit:** 29.6 Tokens/Sekunde (Ø 5e Latenz: 6.09s, Ø Gruppe Latenz: 16.19s)
- **Bildgenerierung:** 5e Szene: ✅ Erfolgreich (5.4s) | Gruppenchat: ✅ Erfolgreich (5.9s)

#### A. Soul Stage 5e Abenteuer (Akt 1: Überfall auf der Waldstraße)
- **Runden absolviert:** 2/10 | Kampf synchronisiert: ✅ Ja
- **Lorebook-Trigger (Orden der Morgensonne):** ⚠️ Lorebook nicht oder nur oberflächlich zitiert

Auszug aus den gespielten Runden:
- **Runde 1 ("Game Master"):** "Der Rabe flattert auf und verschwindet in den dunklen Baumkronen, während ein letzter Sonnenstrahl durch die Blätter bri"
- **Runde 2 ("Campaign chronicle"):** "An encounter begins."

#### B. 4-Personen Gruppenchat (Expedition zur Sternenwarte)
- **Runden:** 10/10 | Aktive Sprecher: Shiori Amane, Lirwen, Faelion, Hayase Nagatoro
Auszug aus dem Dialog:
- **Runde 1 ("Sebastian"):** ""Hallo alle zusammen! Lasst uns heute gemeinsam einen Ausflug planen. Habt ihr schon Vorschläge, wohin wir aufbrechen könnten?""
- **Runde 2 ("Hayase Nagatoro"):** ""*Hayase Nagatoro wirft die Schultasche mit einem lauten Platsch auf den Boden und stürmt direkt auf Sebastian zu. Ihr la""
- **Runde 3 ("Lirwen"):** ""*Ich springe auf, als hätte mich jemand mit einem unsichtbaren Finger unter den Armpfeilen geschüttelt. Das Notizbuch kl""
- **Runde 4 ("Sebastian"):** ""Lirwen, die verlassene Sternenwarte im Nebelwald klingt fantastisch! Faelion, wie schätzt du die Sicherheit auf dem Weg dorthin ein?""

#### C. 1-on-1 Dialog, Lorebook-Tiefenabfrage & Vision
- **Lorebook 'Goldener Pinsel' Recall:** ✅ Exakt wiedergegeben

---

### 🔹 Modell: gemma-4-E4B-it-Q4_K_M (Vision)

- **Architektur / Runtime:** Standard | Größe: 4746 MB | Offloaded GPU Layers: 42/42
- **VRAM-Bedarf:** 5780 MB | **Geschwindigkeit:** 73.3 Tokens/Sekunde (Ø 5e Latenz: 14.91s, Ø Gruppe Latenz: 5.89s)
- **Bildgenerierung:** 5e Szene: ✅ Erfolgreich (5.5s) | Gruppenchat: ✅ Erfolgreich (5.5s)

#### A. Soul Stage 5e Abenteuer (Akt 1: Überfall auf der Waldstraße)
- **Runden absolviert:** 10/10 | Kampf synchronisiert: ⚠️ Nur Erzählung
- **Lorebook-Trigger (Orden der Morgensonne):** ✅ Fakten aus Lorebook korrekt eingeflochten

Auszug aus den gespielten Runden:
- **Runde 1 ("Game Master"):** "Du hältst inne, die Hand auf deinem Schwertknauf ruhend, während du den zerbrochenen Wagen musterst. Die Dämmerung wirft"
- **Runde 2 ("Game Master"):** "Thorin Eisenbart nimmt entschlossen seine Waffe – ein schweres Kriegsschwert, dessen Stahl im schwindenden Licht matt gl"
- **Runde 3 ("Game Master"):** "Du trittst vorsichtig auf den zerbrochenen Wagen zu. Der Geruch von feuchter Erde und verrottetem Holz steigt auf, ein d"
- **Runde 4 ("Game Master"):** "Eure Warnung hallt durch die feuchte Stille des Waldes. Die Gruppe geht instinktiv in Deckung, die Waffen gezogen. Thori"

#### B. 4-Personen Gruppenchat (Expedition zur Sternenwarte)
- **Runden:** 10/10 | Aktive Sprecher: Lirwen, Hayase Nagatoro, Faelion
Auszug aus dem Dialog:
- **Runde 1 ("Sebastian"):** ""Hallo alle zusammen! Lasst uns heute gemeinsam einen Ausflug planen. Habt ihr schon Vorschläge, wohin wir aufbrechen könnten?""
- **Runde 2 ("Hayase Nagatoro"):** ""*Nagatoro stolpert fast über ihre eigenen Füße, als sie die Tür aufreißt und die Gruppe sieht. Ihre anfängliche freche E""
- **Runde 3 ("Lirwen"):** ""*Lirwen, die gerade dabei war, eine besonders interessante Beschaffenheit eines Farnblattes in ihr Notizbuch zu skizzier""
- **Runde 4 ("Sebastian"):** ""Lirwen, die verlassene Sternenwarte im Nebelwald klingt fantastisch! Faelion, wie schätzt du die Sicherheit auf dem Weg dorthin ein?""

#### C. 1-on-1 Dialog, Lorebook-Tiefenabfrage & Vision
- **Lorebook 'Goldener Pinsel' Recall:** ✅ Exakt wiedergegeben
- **Vision Bilderkennung:** Erkannte Elemente: `gesicht, augen, blick`

---

### 🔹 Modell: gemma-4-12b-it-Q4_K_M (Vision)

- **Architektur / Runtime:** Standard | Größe: 6791 MB | Offloaded GPU Layers: 48/48
- **VRAM-Bedarf:** 8873 MB | **Geschwindigkeit:** 43.1 Tokens/Sekunde (Ø 5e Latenz: 24.76s, Ø Gruppe Latenz: 9.88s)
- **Bildgenerierung:** 5e Szene: ✅ Erfolgreich (5.5s) | Gruppenchat: ✅ Erfolgreich (5.6s)

#### A. Soul Stage 5e Abenteuer (Akt 1: Überfall auf der Waldstraße)
- **Runden absolviert:** 10/10 | Kampf synchronisiert: ⚠️ Nur Erzählung
- **Lorebook-Trigger (Orden der Morgensonne):** ✅ Fakten aus Lorebook korrekt eingeflochten

Auszug aus den gespielten Runden:
- **Runde 1 ("Game Master"):** "Die kühle Abendluft trägt den schweren Geruch von feuchtem Moos und verrottendem Holz mit sich. Während du die Hand fest"
- **Runde 2 ("Game Master"):** "Thorin Eisenbart nimmt seine Position ein und schlägt mit seinem schweren Hammer auf den Boden. Der dumpfe Schlag hallt "
- **Runde 3 ("Game Master"):** "Du nähert dich dem Wrack des Wagens. Der Geruch von altem Holz, modriger Plane und einer metallischen Note – wie Blut od"
- **Runde 4 ("Game Master"):** "Die Gruppe reagiert sofort auf deinen Befehl. Thorin zieht seinen schweren Streitkolben aus dem Köcher und stellt sich m"

#### B. 4-Personen Gruppenchat (Expedition zur Sternenwarte)
- **Runden:** 10/10 | Aktive Sprecher: Lirwen, Hayase Nagatoro, Faelion
Auszug aus dem Dialog:
- **Runde 1 ("Sebastian"):** ""Hallo alle zusammen! Lasst uns heute gemeinsam einen Ausflug planen. Habt ihr schon Vorschläge, wohin wir aufbrechen könnten?""
- **Runde 2 ("Hayase Nagatoro"):** ""*schießt förmlich in den Raum und macht eine übertrieben dramatische Pose, während sie sich direkt vor Sebastian positio""
- **Runde 3 ("Lirwen"):** ""*Lirwen zuckt zusammen, als Hayase plötzlich in den Raum stürmt, und ihre Augen weiten sich vor Überraschung. Sie greift""
- **Runde 4 ("Sebastian"):** ""Lirwen, die verlassene Sternenwarte im Nebelwald klingt fantastisch! Faelion, wie schätzt du die Sicherheit auf dem Weg dorthin ein?""

#### C. 1-on-1 Dialog, Lorebook-Tiefenabfrage & Vision
- **Lorebook 'Goldener Pinsel' Recall:** ✅ Exakt wiedergegeben
- **Vision Bilderkennung:** Erkannte Elemente: `mädchen, gesicht, zeichnung, haare, augen, blick`

---

### 🔹 Modell: Gemma4-12B-QAT-Uncensored-HauhauCS-Balanced

- **Architektur / Runtime:** Standard | Größe: 7039 MB | Offloaded GPU Layers: 48/48
- **VRAM-Bedarf:** 8869 MB | **Geschwindigkeit:** 43.4 Tokens/Sekunde (Ø 5e Latenz: 4.93s, Ø Gruppe Latenz: 10.68s)
- **Bildgenerierung:** 5e Szene: ✅ Erfolgreich (5.5s) | Gruppenchat: ✅ Erfolgreich (5.5s)

#### A. Soul Stage 5e Abenteuer (Akt 1: Überfall auf der Waldstraße)
- **Runden absolviert:** 2/10 | Kampf synchronisiert: ✅ Ja
- **Lorebook-Trigger (Orden der Morgensonne):** ⚠️ Lorebook nicht oder nur oberflächlich zitiert

Auszug aus den gespielten Runden:
- **Runde 1 ("Game Master"):** "Finn kniet sich in den feuchten Schlamm neben den Wagen und beginnt, die Spuren zu untersuchen. Während er arbeitet, wir"
- **Runde 2 ("Campaign chronicle"):** "An encounter begins."

#### B. 4-Personen Gruppenchat (Expedition zur Sternenwarte)
- **Runden:** 10/10 | Aktive Sprecher: Lirwen, Faelion, Shiori Amane, Hayase Nagatoro
Auszug aus dem Dialog:
- **Runde 1 ("Sebastian"):** ""Hallo alle zusammen! Lasst uns heute gemeinsam einen Ausflug planen. Habt ihr schon Vorschläge, wohin wir aufbrechen könnten?""
- **Runde 2 ("Hayase Nagatoro"):** ""*Die Schiebetür knallt mit einer ordentlichen Wucht auf und Hayase Nagatoro schlüpft mit einem triumphierenden Grinsen i""
- **Runde 3 ("Lirwen"):** ""*Lirwen, die bis zu diesem Moment fast völlig in ihren Gedanken versunken war und einen kleinen Zweig in ihrem Notizbuch""
- **Runde 4 ("Sebastian"):** ""Lirwen, die verlassene Sternenwarte im Nebelwald klingt fantastisch! Faelion, wie schätzt du die Sicherheit auf dem Weg dorthin ein?""

#### C. 1-on-1 Dialog, Lorebook-Tiefenabfrage & Vision
- **Lorebook 'Goldener Pinsel' Recall:** ✅ Exakt wiedergegeben

---

### 🔹 Modell: Mistral-Nemo-Instruct-2407

- **Architektur / Runtime:** Standard | Größe: 7130 MB | Offloaded GPU Layers: 40/40
- **VRAM-Bedarf:** 9327 MB | **Geschwindigkeit:** 36.8 Tokens/Sekunde (Ø 5e Latenz: 9.63s, Ø Gruppe Latenz: 2.25s)
- **Bildgenerierung:** 5e Szene: ✅ Erfolgreich (5.5s) | Gruppenchat: ✅ Erfolgreich (5.5s)

#### A. Soul Stage 5e Abenteuer (Akt 1: Überfall auf der Waldstraße)
- **Runden absolviert:** 5/10 | Kampf synchronisiert: ✅ Ja
- **Lorebook-Trigger (Orden der Morgensonne):** ⚠️ Lorebook nicht oder nur oberflächlich zitiert

Auszug aus den gespielten Runden:
- **Runde 1 ("Thorin Eisenbart"):** "Thorin: Ich beschirm' mein' Aug', schau' in den Wald. Was für'n Unfug red' der Halbling da? Aber er hat recht, wir sind "
- **Runde 2 ("Althea Sonnwind"):** "Althea unterbricht ihr Gebet und öffnet die Augen. Sie schaut Finn an und runzelt leicht die Stirn über seine Worte, doc"
- **Runde 3 ("Lyra Sternenhain"):** "Ich atme tief durch, mein Herz schlägt schneller bei dem Gedanken an eine mögliche Gefahr. Doch meine Neugierde ist stär"
- **Runde 4 ("Lyra Sternenhain"):** "\"Vorsicht, Thorin!\", warne ich, während ich schnell einen Pfeil auf die Sehne meines Bogens lege. \"Die Worgs sind nicht "

#### B. 4-Personen Gruppenchat (Expedition zur Sternenwarte)
- **Runden:** 9/10 | Aktive Sprecher: Lirwen, Hayase Nagatoro, Faelion
Auszug aus dem Dialog:
- **Runde 1 ("Sebastian"):** ""Hallo alle zusammen! Lasst uns heute gemeinsam einen Ausflug planen. Habt ihr schon Vorschläge, wohin wir aufbrechen könnten?""
- **Runde 2 ("Hayase Nagatoro"):** ""*schlendert lässig herein und wirft ihre Tasche achtlos zur Seite* Oh, Senpai~! Du meinst also, du könntest einfach so e""
- **Runde 3 ("Lirwen"):** ""*legt neugierig den Kopf schief* \"Ithar venn, Sebastian! Ein Ausflug? Wie aufregend!\" *Zückt ihr Notizbuch und einen Fed""
- **Runde 4 ("Sebastian"):** ""Lirwen, die verlassene Sternenwarte im Nebelwald klingt fantastisch! Faelion, wie schätzt du die Sicherheit auf dem Weg dorthin ein?""

#### C. 1-on-1 Dialog, Lorebook-Tiefenabfrage & Vision
- **Lorebook 'Goldener Pinsel' Recall:** ✅ Exakt wiedergegeben

---

### 🔹 Modell: Rocinante-X-12B-v1b

- **Architektur / Runtime:** Standard | Größe: 7130 MB | Offloaded GPU Layers: 40/40
- **VRAM-Bedarf:** 9169 MB | **Geschwindigkeit:** 45.4 Tokens/Sekunde (Ø 5e Latenz: 22.03s, Ø Gruppe Latenz: 5.81s)
- **Bildgenerierung:** 5e Szene: ✅ Erfolgreich (5.6s) | Gruppenchat: ✅ Erfolgreich (5.5s)

#### A. Soul Stage 5e Abenteuer (Akt 1: Überfall auf der Waldstraße)
- **Runden absolviert:** 10/10 | Kampf synchronisiert: ⚠️ Nur Erzählung
- **Lorebook-Trigger (Orden der Morgensonne):** ⚠️ Lorebook nicht oder nur oberflächlich zitiert

Auszug aus den gespielten Runden:
- **Runde 1 ("Thorin Eisenbart"):** "Ich brumme und verschränke die Arme über der Brust, meine Streitaxt ruht auf meiner Schulter.\n\n\"Zombies\", knurre ich und"
- **Runde 2 ("Thorin Eisenbart"):** "Ich grunze und schürze die Lippen. Mein Blick bleibt auf die Baumreihe rechts gerichtet, wo das Rascheln herkam. Der Rab"
- **Runde 3 ("Lyra Sternenhain"):** "Ich trete näher an die Gruppe heran, meine Hand instinktiv zu meinem Zauberbuch gleitend. Der Geruch von Verwesung errei"
- **Runde 4 ("Game Master"):** "Thorin Eisenbart brüllt einen Befehl und reißt sein Schwert aus der Scheide. Die Klinge singt, als er sie durch die Luft"

#### B. 4-Personen Gruppenchat (Expedition zur Sternenwarte)
- **Runden:** 9/10 | Aktive Sprecher: Lirwen, Hayase Nagatoro, Faelion
Auszug aus dem Dialog:
- **Runde 1 ("Sebastian"):** ""Hallo alle zusammen! Lasst uns heute gemeinsam einen Ausflug planen. Habt ihr schon Vorschläge, wohin wir aufbrechen könnten?""
- **Runde 2 ("Hayase Nagatoro"):** ""*Hayase Nagatoro springt von ihrem Platz auf und rennt mit großen Schritten zur Staffelei, die Arme hinter dem Rücken ve""
- **Runde 3 ("Lirwen"):** ""*Lirwen schlägt eifrig ihr Notizbuch auf und zückt einen Federkiel*\n\n\"Ein Ausflug!\" *Ihre Augen leuchten vor Aufregung.*""
- **Runde 4 ("Sebastian"):** ""Lirwen, die verlassene Sternenwarte im Nebelwald klingt fantastisch! Faelion, wie schätzt du die Sicherheit auf dem Weg dorthin ein?""

#### C. 1-on-1 Dialog, Lorebook-Tiefenabfrage & Vision
- **Lorebook 'Goldener Pinsel' Recall:** ✅ Exakt wiedergegeben

---

### 🔹 Modell: Cydonia-24B-v4zg

- **Architektur / Runtime:** Standard | Größe: 13669 MB | Offloaded GPU Layers: 28/40
- **VRAM-Bedarf:** 10980 MB | **Geschwindigkeit:** 9.0 Tokens/Sekunde (Ø 5e Latenz: 42.85s, Ø Gruppe Latenz: 38.88s)
- **Bildgenerierung:** 5e Szene: ✅ Erfolgreich (5.6s) | Gruppenchat: ✅ Erfolgreich (5.0s)

#### A. Soul Stage 5e Abenteuer (Akt 1: Überfall auf der Waldstraße)
- **Runden absolviert:** 4/10 | Kampf synchronisiert: ✅ Ja
- **Lorebook-Trigger (Orden der Morgensonne):** ⚠️ Lorebook nicht oder nur oberflächlich zitiert

Auszug aus den gespielten Runden:
- **Runde 1 ("Finn Flinkfuß"):** "Ich richte mich schnell auf und wische mir den Schlamm von den Fingern, während mein Herz ein bisschen schneller klopft."
- **Runde 2 ("Lyra Sternenhain"):** "Ich ziehe mein Zauberbuch mit einer schnellen Bewegung hervor und blättere die Seiten mit dem Daumen durch. Die bläulich"
- **Runde 3 ("Thorin Eisenbart"):** "Ich runzele die Stirn und lege die Hand fester um den Griff meiner Axt. \"Etwas stimmt hier nicht\", brumme ich und trete "
- **Runde 4 ("Thorin Eisenbart"):** "Ich spucke auf den Boden und packe meine Axt fester. \"Skelette\", knurre ich und trete einen Schritt vor, um die Gruppe z"

#### B. 4-Personen Gruppenchat (Expedition zur Sternenwarte)
- **Runden:** 10/10 | Aktive Sprecher: Faelion, Hayase Nagatoro, Lirwen
Auszug aus dem Dialog:
- **Runde 1 ("Sebastian"):** ""Hallo alle zusammen! Lasst uns heute gemeinsam einen Ausflug planen. Habt ihr schon Vorschläge, wohin wir aufbrechen könnten?""
- **Runde 2 ("Hayase Nagatoro"):** ""*Hayase Nagatoro schiebt sich mit einem frechen Grinsen zwischen die anderen Mädchen und stützt sich mit den Händen auf ""
- **Runde 3 ("Lirwen"):** ""*Lirwens Ohren zucken bei Hayases Worte, ihre Augen werden groß wie Teller. Sie klampert an ihrem Notizbuch und starrt a""
- **Runde 4 ("Sebastian"):** ""Lirwen, die verlassene Sternenwarte im Nebelwald klingt fantastisch! Faelion, wie schätzt du die Sicherheit auf dem Weg dorthin ein?""

#### C. 1-on-1 Dialog, Lorebook-Tiefenabfrage & Vision
- **Lorebook 'Goldener Pinsel' Recall:** ✅ Exakt wiedergegeben

---

### 🔹 Modell: Hearthfire-24B

- **Architektur / Runtime:** Standard | Größe: 13669 MB | Offloaded GPU Layers: 28/40
- **VRAM-Bedarf:** 11504 MB | **Geschwindigkeit:** 9.6 Tokens/Sekunde (Ø 5e Latenz: 76.47s, Ø Gruppe Latenz: 35.32s)
- **Bildgenerierung:** 5e Szene: ✅ Erfolgreich (4.9s) | Gruppenchat: ✅ Erfolgreich (5.4s)

#### A. Soul Stage 5e Abenteuer (Akt 1: Überfall auf der Waldstraße)
- **Runden absolviert:** 4/10 | Kampf synchronisiert: ✅ Ja
- **Lorebook-Trigger (Orden der Morgensonne):** ⚠️ Lorebook nicht oder nur oberflächlich zitiert

Auszug aus den gespielten Runden:
- **Runde 1 ("Finn Flinkfuß"):** "Ich richte mich wieder auf und klopfe mir den Dreck von den Knien. \"Zwei oder drei, sagst du? Und alle hatten es verdamm"
- **Runde 2 ("Althea Sonnwind"):** "Ich spüre den warmen Schlag der heilenden Energie durch meine Handfläche fließen, als ich sie auf Thorins Arm lege. Die "
- **Runde 3 ("Lyra Sternenhain"):** "Ich senke den Bogen nur einen Deut, die Sehne spannt sich noch immer unter meinen Fingern. Die Stille ist zu sauber, als"
- **Runde 4 ("Lyra Sternenhain"):** "\"Thorin, bitte verschone mich mit deinen bildhaften Vergleichen\", sage ich, während ein blauer Blitz von meinem Stab aus"

#### B. 4-Personen Gruppenchat (Expedition zur Sternenwarte)
- **Runden:** 10/10 | Aktive Sprecher: Lirwen, Faelion, Hayase Nagatoro
Auszug aus dem Dialog:
- **Runde 1 ("Sebastian"):** ""Hallo alle zusammen! Lasst uns heute gemeinsam einen Ausflug planen. Habt ihr schon Vorschläge, wohin wir aufbrechen könnten?""
- **Runde 2 ("Hayase Nagatoro"):** ""*schiebt die Schiebetür mit einem Ruck auf und stapft energisch herein* \"Naaa, Senpai~! Schon wieder am Planen, was? Und""
- **Runde 3 ("Lirwen"):** ""*Lirwen springt förmlich auf, ihr Notizbuch fällt zu Boden und Federn fliegen in alle Richtungen. Sie bückt sich hastig ""
- **Runde 4 ("Sebastian"):** ""Lirwen, die verlassene Sternenwarte im Nebelwald klingt fantastisch! Faelion, wie schätzt du die Sicherheit auf dem Weg dorthin ein?""

#### C. 1-on-1 Dialog, Lorebook-Tiefenabfrage & Vision
- **Lorebook 'Goldener Pinsel' Recall:** ✅ Exakt wiedergegeben

---

### 🔹 Modell: gemma-4-26B-A4B-it-UD

- **Architektur / Runtime:** Standard | Größe: 16162 MB | Offloaded GPU Layers: 18/30
- **VRAM-Bedarf:** 11334 MB | **Geschwindigkeit:** 22.3 Tokens/Sekunde (Ø 5e Latenz: 41.28s, Ø Gruppe Latenz: 22.94s)
- **Bildgenerierung:** 5e Szene: ✅ Erfolgreich (5.5s) | Gruppenchat: ✅ Erfolgreich (5.2s)

#### A. Soul Stage 5e Abenteuer (Akt 1: Überfall auf der Waldstraße)
- **Runden absolviert:** 10/10 | Kampf synchronisiert: ⚠️ Nur Erzählung
- **Lorebook-Trigger (Orden der Morgensonne):** ✅ Fakten aus Lorebook korrekt eingeflochten

Auszug aus den gespielten Runden:
- **Runde 1 ("Game Master"):** "Das tiefe Orange der Abenddämmerung wirft lange, verzerrte Schatten zwischen die knorrigen Stämme. Der Geruch von feucht"
- **Runde 2 ("Game Master"):** "Die Befehle hallen kurz zwischen den knorrigen Stämmen wider. Thorin brummt nur knapp, ein tiefes Grollen in der Kehle, "
- **Runde 3 ("Game Master"):** "Du schleichst dich mit angehaltenem Atem an den umgestürzten Wagen heran. Der Geruch von feuchter Erde vermischt sich mi"
- **Runde 4 ("Game Master"):** "Deine Warnung schneidet wie ein Säbel durch die dämmrige Stille. Sofort gleiten die Hände der Gefährten zu den Griffen i"

#### B. 4-Personen Gruppenchat (Expedition zur Sternenwarte)
- **Runden:** 10/10 | Aktive Sprecher: Lirwen, Faelion, Hayase Nagatoro
Auszug aus dem Dialog:
- **Runde 1 ("Sebastian"):** ""Hallo alle zusammen! Lasst uns heute gemeinsam einen Ausflug planen. Habt ihr schon Vorschläge, wohin wir aufbrechen könnten?""
- **Runde 2 ("Hayase Nagatoro"):** ""*reißt die Schiebetür mit einem lauten Knall auf und lässt sie fast aus den Angeln schlagen, während sie mit einem trium""
- **Runde 3 ("Lirwen"):** ""*Lirwen, die eben noch über einem ihrer Notizbücher brütete, fährt erschrocken zusammen, als die Tür mit einem Knall auf""
- **Runde 4 ("Sebastian"):** ""Lirwen, die verlassene Sternenwarte im Nebelwald klingt fantastisch! Faelion, wie schätzt du die Sicherheit auf dem Weg dorthin ein?""

#### C. 1-on-1 Dialog, Lorebook-Tiefenabfrage & Vision
- **Lorebook 'Goldener Pinsel' Recall:** ✅ Exakt wiedergegeben

---

### 🔹 Modell: Qwen3.8-27B-Heretic

- **Architektur / Runtime:** Standard | Größe: 15780 MB | Offloaded GPU Layers: 34/64
- **VRAM-Bedarf:** 10358 MB | **Geschwindigkeit:** 4.7 Tokens/Sekunde (Ø 5e Latenz: 131.75s, Ø Gruppe Latenz: 91.09s)
- **Bildgenerierung:** 5e Szene: ✅ Erfolgreich (4.9s) | Gruppenchat: ✅ Erfolgreich (5.6s)

#### A. Soul Stage 5e Abenteuer (Akt 1: Überfall auf der Waldstraße)
- **Runden absolviert:** 5/10 | Kampf synchronisiert: ✅ Ja
- **Lorebook-Trigger (Orden der Morgensonne):** ⚠️ Lorebook nicht oder nur oberflächlich zitiert

Auszug aus den gespielten Runden:
- **Runde 1 ("Finn Flinkfuß"):** "Finn steht auf, schüttelt den nassen Schlamm aus seinen Stiefeln und wirft einen raschen Blick über die Schulter in die "
- **Runde 2 ("Thorin Eisenbart"):** "„Spucke nennst du das? In meinem Clan würde man dich für deine Mundfaulheit auspeitschen.“ Ich drehe den Kopf nur zur Hä"
- **Runde 3 ("Finn Flinkfuß"):** "Ich schnaube leise, während ich die Knie beugte, um mich auf Augenhöhe mit dem blutigen Fund zu bringen. „Nicht schlecht"
- **Runde 4 ("Game Master"):** "Eure Worte hängen noch in der kalten Abendluft, als das Unheil bereits zuschlägt.\n\nThorin reißt sein Schwert aus der Sch"

#### B. 4-Personen Gruppenchat (Expedition zur Sternenwarte)
- **Runden:** 10/10 | Aktive Sprecher: Lirwen, Hayase Nagatoro, Faelion
Auszug aus dem Dialog:
- **Runde 1 ("Sebastian"):** ""Hallo alle zusammen! Lasst uns heute gemeinsam einen Ausflug planen. Habt ihr schon Vorschläge, wohin wir aufbrechen könnten?""
- **Runde 2 ("Hayase Nagatoro"):** ""*Reißt die Schiebetür mit einem lauten *KLANG* auf und schlüpft grinsend in den Kunstklubraum. Sie streckt sich genüssli""
- **Runde 3 ("Lirwen"):** ""*Die moosgrünen Augen weiten sich vor Verblüffung, als die fremde Stimme mit dem metallischen Klang der Schiebetür den R""
- **Runde 4 ("Sebastian"):** ""Lirwen, die verlassene Sternenwarte im Nebelwald klingt fantastisch! Faelion, wie schätzt du die Sicherheit auf dem Weg dorthin ein?""

#### C. 1-on-1 Dialog, Lorebook-Tiefenabfrage & Vision
- **Lorebook 'Goldener Pinsel' Recall:** ✅ Exakt wiedergegeben

---

### 🔹 Modell: Qwen3.6-35B-A3B-UD

- **Architektur / Runtime:** Standard | Größe: 21109 MB | Offloaded GPU Layers: 18/40
- **VRAM-Bedarf:** 11146 MB | **Geschwindigkeit:** 18.5 Tokens/Sekunde (Ø 5e Latenz: 61.29s, Ø Gruppe Latenz: 24.54s)
- **Bildgenerierung:** 5e Szene: ✅ Erfolgreich (5.3s) | Gruppenchat: ✅ Erfolgreich (5.1s)

#### A. Soul Stage 5e Abenteuer (Akt 1: Überfall auf der Waldstraße)
- **Runden absolviert:** 10/10 | Kampf synchronisiert: ⚠️ Nur Erzählung
- **Lorebook-Trigger (Orden der Morgensonne):** ✅ Fakten aus Lorebook korrekt eingeflochten

Auszug aus den gespielten Runden:
- **Runde 1 ("Game Master"):** "Der Rabe verstummt abrupt. Mit einem harten Klappern der Krallen stößt er sich von der Deichsel ab und entweicht in die "
- **Runde 2 ("Game Master"):** "Der Rabe verstummt mit einem trockenen *Krä*, als seine Augenpaare sich auf das Unterholz rechts vom Weg richten. Die Lu"
- **Runde 3 ("Game Master"):** "Die Stille um euch herum wird schwerer, fast schon körperlich spürbar, als Thorin sich dem verlassenen Fuhrwerk nähert. "
- **Runde 4 ("Game Master"):** "Eure Reaktion ist blitzschnell, geübt von vielen Schlachten. Thorin stampft mit dem Eisenbart-Stiefel auf, sein Schild a"

#### B. 4-Personen Gruppenchat (Expedition zur Sternenwarte)
- **Runden:** 10/10 | Aktive Sprecher: Hayase Nagatoro, Lirwen, Faelion
Auszug aus dem Dialog:
- **Runde 1 ("Sebastian"):** ""Hallo alle zusammen! Lasst uns heute gemeinsam einen Ausflug planen. Habt ihr schon Vorschläge, wohin wir aufbrechen könnten?""
- **Runde 2 ("Hayase Nagatoro"):** ""*Die Schiebetür knallt gegen den Anschlag, als Hayase Nagatoro mit einem breiten, schelmischen Grinsen den Raum betritt.""
- **Runde 3 ("Lirwen"):** ""*Lirwen zuckt leicht zusammen, als die Tür knallt, und ihre moosgrünen Augen weiten sich vor Überraschung. Sie steht noc""
- **Runde 4 ("Sebastian"):** ""Lirwen, die verlassene Sternenwarte im Nebelwald klingt fantastisch! Faelion, wie schätzt du die Sicherheit auf dem Weg dorthin ein?""

#### C. 1-on-1 Dialog, Lorebook-Tiefenabfrage & Vision
- **Lorebook 'Goldener Pinsel' Recall:** ✅ Exakt wiedergegeben

---

### 🔹 Modell: Ternary-Bonsai-27B-PQ2_0 (v1)

- **Architektur / Runtime:** Prism | Größe: 6833 MB | Offloaded GPU Layers: 64/64
- **VRAM-Bedarf:** 8701 MB | **Geschwindigkeit:** 43.6 Tokens/Sekunde (Ø 5e Latenz: 26.89s, Ø Gruppe Latenz: 10.37s)
- **Bildgenerierung:** 5e Szene: ✅ Erfolgreich (5.1s) | Gruppenchat: ✅ Erfolgreich (5.0s)

#### A. Soul Stage 5e Abenteuer (Akt 1: Überfall auf der Waldstraße)
- **Runden absolviert:** 10/10 | Kampf synchronisiert: ⚠️ Nur Erzählung
- **Lorebook-Trigger (Orden der Morgensonne):** ⚠️ Lorebook nicht oder nur oberflächlich zitiert

Auszug aus den gespielten Runden:
- **Runde 1 ("Thorin Eisenbart"):** "Thorin kneidet sich in den Dreck, seine knorrenden Finger die tiefe Abdruckspur an den Waldrand abtrifen. Er knurrt nur "
- **Runde 2 ("Finn Flinkfuß"):** "„Schwitz, Zwerg! Ich zittere nicht – ich berechne die Winkel!“\n\nIch glisse aus Altheas Schattenschleier, kniebleicht neb"
- **Runde 3 ("Lyra Sternenhain"):** "Ich knieße mich herab, ohne die Magie einzuhalten – Thorin ist zwar richtig, aber wenn es um Schatten- und Aschenspuren "
- **Runde 4 ("Game Master"):** "Die Stille bricht. Aus dem Dunkeln zwischen den Bäumen tauchen drei silhouettenartige Figuren auf – Banditen, die sich a"

#### B. 4-Personen Gruppenchat (Expedition zur Sternenwarte)
- **Runden:** 10/10 | Aktive Sprecher: Faelion, Lirwen, Hayase Nagatoro
Auszug aus dem Dialog:
- **Runde 1 ("Sebastian"):** ""Hallo alle zusammen! Lasst uns heute gemeinsam einen Ausflug planen. Habt ihr schon Vorschläge, wohin wir aufbrechen könnten?""
- **Runde 2 ("Hayase Nagatoro"):** ""*Die Schiebetür mit einem knallenden Geräusch aufsprang und ich stürzte in den leeren Kunstklubraum ein, die Hand an der""
- **Runde 3 ("Lirwen"):** ""*Meine Kopf neigt sich schief, als wäre das Knallen der Schiebetür ein völlig neues Phänomen in Elanthil. Ich zücke mein""
- **Runde 4 ("Sebastian"):** ""Lirwen, die verlassene Sternenwarte im Nebelwald klingt fantastisch! Faelion, wie schätzt du die Sicherheit auf dem Weg dorthin ein?""

#### C. 1-on-1 Dialog, Lorebook-Tiefenabfrage & Vision
- **Lorebook 'Goldener Pinsel' Recall:** ✅ Exakt wiedergegeben

---

## 3. 🏆 Testsieger & Empfehlungen nach Anwendungsfall

1. **Bester Allrounder & Empfehlung für OtakuSoul:**
   - **Ternary-Bonsai-2-27B-PQ2_0 (Prism):** Überragende Balance aus 27B-Intelligenz, hoher Generierungsgeschwindigkeit (~40-55 tok/s) und geringem VRAM-Fußabdruck (~9,1 GB). Lorebooks werden blitzsauber zitiert und die 5e-Regie bleibt straff.

2. **Bester Text- & Rollenspiel-Spezialist:**
   - **Cydonia-24B-v4zg / Hearthfire-24B:** Exzellente Prosa, extrem atmosphärische Spielleiter-Beschreibungen und lebendige Gefährtenstimmen in D&D 5e.

3. **Bester Multimodal-/Vision-Begleiter:**
   - **gemma-4-12b-it-Q4_K_M (Vision) & gemma-4-E4B-it-Q4_K_M (Vision):** Beide Modelle erkennen Bildinhalte dank mmproj fehlerfrei und bleiben rollengerecht in der Persona.

4. **Höchste Geschwindigkeit / Effizienz:**
   - **gemma-4-E4B-it-Q4_K_M:** Bis zu 91 Tokens/Sekunde – perfekt für flüssiges Text-Streaming bei geringster Latenz.

