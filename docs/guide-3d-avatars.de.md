# Eigenes 3D-Modell mit Animationen in OtakuSoul

[🇬🇧 English](guide-3d-avatars.md) • [🇩🇪 Deutsch](guide-3d-avatars.de.md) • [🇷🇺 Русский](guide-3d-avatars.ru.md)

OtakuSoul zeigt neben VRM- und MMD-Modellen auch **glTF/GLB-Avatare** an – und spielt die Animationen ab, die in
der GLB-Datei stecken. Diese Anleitung zeigt, wie Du ein Modell in **Blender** so vorbereitest, dass am Ende eine
einzige `.glb`-Datei mit Modell, Texturen, Gesichtsformen und benannten Animationen entsteht.

> Gilt ab OtakuSoul 0.5.0. Menünamen in Blender können je nach Version leicht abweichen.

## 1. Woher kommt das Modell?

Die Anleitung beginnt mit einem Modell, das schon in Blender liegt – ob selbst gebaut, gekauft, aus VRoid,
Mixamo, MakeHuman oder einer anderen Quelle. **Wie Du an ein Modell kommst, musst Du selbst herausfinden.**
Achte dabei auf die Rechte: Nutze nur Modelle, die Du verwenden darfst, halte Dich an Lizenzen und AGB und gib
fremde Figuren nicht weiter. Für Modelle, die Du nicht selbst gemacht hast, bist Du verantwortlich.

## 2. Was Du brauchst

- **[Blender](https://www.blender.org/) 4.2 oder neuer** (Linux, Windows, macOS)
- ggf. ein Import-Add-on für das Format Deines Modells (FBX und glTF kann Blender selbst)
- **OtakuSoul 0.5.0 oder neuer**

## 3. Modell vorbereiten

1. Modell in eine leere Szene importieren (Startwürfel, Kamera und Licht vorher löschen).
2. **Maßstab prüfen:** Die Figur sollte etwa 1,5–1,8 m groß sein (Seitenleiste `N` → Abmessungen). OtakuSoul bringt
   Modelle außerhalb von 0,5–3 m zwar selbst auf 1,6 m, sauberer ist ein richtiger Maßstab. Danach
   **Strg+A → Alle Transformationen** anwenden.
3. **Ein Skelett ist Pflicht:** Modelle ohne Armatur (Skulpturen, KI-generierte Figuren, Scans) lehnt OtakuSoul ab.
   Mehr als etwa 500.000 Dreiecke laden langsam – OtakuSoul weist beim Import darauf hin.
4. **Eine Armatur:** Alle Teile (Körper, Kopf, Haare, Kleidung) sollten an **einem** Skelett hängen. Überzählige
   Armaturen entfernen und die Teile per Modifikator „Armatur“ an die Hauptarmatur hängen.
5. **Knochennamen:** OtakuSoul erkennt Rumpf, Kopf und Arme bei Mixamo-, Unreal-Mannequin-, MakeHuman-, Blender-
   (`upper_arm.L`) und VRoid-Namen. Andere Skelette funktionieren mit ihren eigenen Animationen trotzdem; nur
   importierte Fremdbewegungen (Mixamo-FBX) passen dann nicht.

## 4. Materialien

OtakuSoul nutzt Standardmaterialien (glTF „PBR“). Je Material im Shader-Editor:

- **Grundfarbe:** Bildtextur → *Base Color* des *Principled BSDF*
- **Normal Map:** Bildtextur (Farbraum *Non-Color*) → *Normal Map*-Knoten → *Normal*
- **Transparenz** (Haare, Wimpern, Rüschen):
  - Ausgeschnittene Stellen (Alpha nur ganz durchsichtig oder ganz deckend – der Normalfall): Alpha der Grundfarbe
    über einen **Mathe-Knoten „Runden“ (Round)** an *Alpha*. Daraus macht der glTF-Export *Alpha-Clip* (`MASK`).
  - Nur echte Halbtransparenz (Schatten-Overlays, Glas): Alpha direkt an *Alpha* → *Überblendung* (`BLEND`).
  - Nicht alles auf Überblendung stellen: Überlappende Teile werden dann falsch sortiert und erscheinen als schwarze
    Fransen.
- Bei Anime-Figuren meist **Metallic 0** und **Roughness 0,6–0,8** – sonst wirken sie wie Plastik.

Eigene Shader (z. B. Toon-/Cel-Shading) überstehen den glTF-Export nicht.

## 5. Animationen benennen

Jede Animation ist in Blender eine eigene **Aktion**. Benenne sie im **Dope Sheet → Aktions-Editor**. Der Name
entscheidet, wofür OtakuSoul den Clip verwendet (später in den Einstellungen änderbar):

| Verwendung in OtakuSoul | Name enthält z. B. |
|---|---|
| Ruhe (Schleife) | `Idle`, `Stand`, `Breath`, `Wait` |
| Begrüßen/Winken | `Wave`, `Greet`, `Hello`, `Bye` |
| Nicken | `Nod`, `Yes`, `Agree` |
| Freude | `Happy`, `Joy`, `Laugh`, `Cheer` |
| Trauer | `Sad`, `Cry` |
| Wut | `Angry`, `Anger`, `Mad` |
| Überraschung | `Surprise`, `Shock` |
| Nachdenken | `Think`, `Ponder` |
| nur von Hand (Gesten-Menü) | alles andere, z. B. `Dance_Spin` |

Eine **Stimmung** im Namen lässt OtakuSoul bei passender Emotion diesen Clip bevorzugen: `Idle_Happy`,
`Wave_Shy` (entspannt), `Idle_Sad`, `Wave_Angry`, `Surprise_Shock` …

- **Jede Aktion mit „Fake User“ (Schild-Symbol) sichern**, sonst verwirft Blender ungenutzte Aktionen.
- Bewegt eine Animation die ganze Figur durch den Raum, entfernt OtakuSoul die Verschiebung des obersten Knochens.
  Lauf-Animationen eignen sich trotzdem selten.

## 6. Gesicht (Shape Keys)

Blinzeln, Mundbewegung beim Sprechen und Emotionen steuert OtakuSoul über **Shape Keys** mit diesen Namen
(ARKit-Standard, Oculus-Viseme oder einfache Namen):

| Zweck | Shape-Key-Namen |
|---|---|
| Blinzeln | `eyeBlinkLeft` + `eyeBlinkRight`, oder `eyesClosed`, oder `blink` |
| Mund beim Sprechen | `viseme_aa`, `viseme_I`, `viseme_U`, `viseme_E`, `viseme_O` – oder `jawOpen`, `mouthPucker`, `mouthFunnel`, `mouthStretchLeft/Right` |
| Fröhlich | `mouthSmileLeft` + `mouthSmileRight` (+ `cheekSquintLeft/Right`), oder `mouthSmile`, oder `happy` |
| Wütend | `browDownLeft/Right` + `mouthFrownLeft/Right`, oder `angry` |
| Traurig | `browInnerUp` + `mouthFrownLeft/Right`, oder `sad` |
| Überrascht | `browInnerUp` + `eyeWideLeft/Right` + `jawOpen`, oder `surprised` |
| Entspannt | leichtes `mouthSmileLeft/Right`, oder `relaxed` |

Heißen Deine Shape Keys anders, benenne die passenden um (Objekteigenschaften → Formschlüssel). Ein Editor zum
Zuordnen direkt in OtakuSoul ist geplant.

## 7. Als GLB exportieren

Alle Teile und die Armatur auswählen, dann **Datei → Exportieren → glTF 2.0 (.glb/.gltf)**:

- **Format:** *glTF Binary (.glb)* – OtakuSoul importiert eine einzelne `.glb`-Datei
- **Einschließen:** *Ausgewählte Objekte*
- **Mesh:** *UVs*, *Normalen*, *Modifikatoren anwenden*
- **Shape Keys** und **Skinning:** an
- **Animation:** an, Modus **Aktionen** (jede Aktion wird ein eigener, benannter Clip), *Immer abtasten* an
- **Kompression:** aus (Draco-komprimierte Dateien kann OtakuSoul nicht lesen)

Texturen ruhig auf 2048 px verkleinern – das spart Grafikspeicher und Ladezeit.

## 8. In OtakuSoul importieren

1. **Einstellungen → Erscheinungsbild & Theme → Standard-Avatare → 3D-Avatar (VRM, glTF oder MMD) → „3D-Modell importieren …“** und
   die `.glb` wählen. Das Modell wird in den Avatar-Ordner kopiert.
2. Das Modell auswählen (global oder pro Figur im Charakter-Editor) und im Chat den Avatar-Modus **3D** wählen.
3. **Einstellungen → Erscheinungsbild & Theme → Bewegungen des 3D-Avatars (VRMA, Mixamo) → „Bewegungen im Modell (glTF)“** zeigt
   alle Clips der Datei:
   - **Verwendung:** Ruhe-Schleife, Gesten (Winken, Nicken, Gefühle …) oder **„Nur von Hand“**
   - **Stimmung:** bei mehreren Clips einer Verwendung bevorzugt OtakuSoul die zur aktuellen Emotion passenden;
     die Ruhe-Schleife wechselt mit der Stimmung
   - **▶** spielt den Clip zur Kontrolle ab
4. Im Chat startet die Figur Gesten bei Rollenspiel-Aktionen (`*winkt*`, `*nickt*`, `*lacht*`) und erkannten
   Gefühlen. Clips „nur von Hand“ startest Du über das Menü **„Gesten aus dem Modell“** (Klappe-Symbol unten links am Avatar).

## 9. Fehlerbehebung

| Problem | Lösung |
|---|---|
| Figur ist winzig, riesig oder liegt auf dem Rücken | In Blender **Strg+A → Alle Transformationen**, neu exportieren |
| Figur ist grau oder schwarz | Texturen verbinden (Abschnitt 4); bei schwarzen Metallteilen Metallic auf 0 |
| Haare/Wimpern als Blöcke | Alpha der Grundfarbe verbinden (Abschnitt 4) |
| Schwarze, ausgefranste Flecken an Haaren oder Kleidung | Ausgeschnittene Teile als Alpha-Clip exportieren (Mathe-Knoten „Runden“), nicht als Überblendung |
| Animationen fehlen | „Fake User“ setzen, beim Export Animation-Modus **Aktionen** |
| Figur verzerrt sich bei Animationen | Animation gehört zu einem anderen Skelett |
| Figur läuft aus dem Bild | Lauf-Animation als „Nur von Hand“ einstellen oder weglassen |
| Gesicht bewegt sich nicht | Shape Keys nach Abschnitt 6 umbenennen |
| Mixamo-Bewegungen passen nicht | Erkannt werden bisher Rumpf, Kopf und Arme; bessere Erkennung (Beine, Hände, Finger, `Bip001`-Rigs) ist geplant |
| „Das Modell hat kein Skelett“ | Statische Modelle (z. B. KI-generierte Figuren, 3D-Scans) werden abgelehnt. Erst riggen – etwa mit Mixamo (automatisches Rig) oder in Blender (Rigify) – und die Polygonzahl vorher mit „Decimate“ auf etwa 50.000–100.000 Dreiecke senken |
| Import schlägt fehl oder lädt sehr lange | Nur `.glb` ohne Draco-Kompression; Texturen verkleinern |
