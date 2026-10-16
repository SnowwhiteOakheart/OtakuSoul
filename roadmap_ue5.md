# 🎮 Roadmap: Figuren aus Unreal-Spielen als 3D-Avatar (0.5.0)

> Stand: 15.10.2026. Ziel: Eine Figur samt ihren Bewegungen, die aus einem Unreal-Spiel stammt (oder in
> Blender entstanden ist), als **eine GLB-Datei** importieren – OtakuSoul spielt die eingebetteten Animationen ab,
> zeigt das Gesicht passend zur Emotion und sieht im Anime-Stil richtig aus.
> Offene Punkte stehen hier, Erledigtes wird abgehakt und später nach `roadmap_abgeschlossen.md` verschoben.

## 1. Rahmen

- **Kein Extraktor in der App.** OtakuSoul liest keine Spielarchive (`.pak`/`.utoc`/`.ucas`). Austauschformat ist
  glTF/GLB, wie es Blender exportiert; damit funktioniert der Import für jede Quelle (Spiel, Blender, VRoid, Kauf).
- **Private Nutzung.** Figuren aus Spielen werden nicht veröffentlicht. Die Nutzeranleitung beschreibt den Weg
  *Blender → GLB → OtakuSoul* allgemein; wie man an Modelle kommt, müssen Nutzer selbst herausfinden. Die vollständige
  Anleitung mit Extraktion liegt nur lokal (`docs/private/`, nicht im Repository).
- **Keine Umgehung von Schutzmaßnahmen.** Verschlüsselte Archive (AES) oder Anti-Cheat werden nicht angegangen,
  auch nicht in der Anleitung (§ 95a UrhG; Anti-Cheat-Sperren). Beispiel *Neverness to Everness*: UE-IoStore
  (`.utoc` Version 8, `.pak` Version 12), 12 von 22 Containern verschlüsselt, Anti-Cheat Expert (ACE).

## 2. Weg einer Figur (Referenz, privat)

1. Archive mit FModel (CUE4Parse) öffnen – nur unverschlüsselte Inhalte oder mit rechtmäßig vorliegendem Schlüssel.
2. Skeletal Mesh und Animation Sequences als UEFormat (`.uemodel`/`.ueanim`) oder `psk`/`psa` exportieren,
   Texturen als PNG.
3. In Blender mit dem passenden Add-on importieren, Materialien mit den Texturen verbinden (Spiel-Shader kommen
   nicht mit), Maßstab prüfen (Unreal: cm, glTF: m – die App gleicht 0,5–3 m ohnehin aus).
4. Als **GLB** exportieren: Netz, Skelett, Shape Keys und alle Animationen als **benannte Clips** (z. B. `Idle`,
   `Wave`, `Nod`, `Laugh`).

## 3. Schritte

### Schritt 1 – Eingebettete Animationen der GLB abspielen ✅
- [x] Backend liest die Clipnamen aus GLB/glTF (`avatar_motions::model_clips`, ohne die Datei zu laden) und
      speichert die Rolle je Modell und Clip (`<Daten>/animations/model_roles.json`); unbekannte Clips bekommen
      die Rolle aus dem Namen geraten (`guess_role`).
- [x] glTF-Viewer spielt die Clips direkt auf dem eigenen Skelett (ohne Retargeting); Wurzelbewegung (Root
      Motion) wird entfernt, damit die Figur nicht aus dem Bild läuft.
- [x] Eigene Clips haben Vorrang je Rolle; importierte Mixamo-/VRMA-Bewegungen füllen nur fehlende Rollen.
- [x] Einstellungen → Avatar-Bewegungen: Abschnitt „Bewegungen im Modell“ mit Rollenwahl und Vorschau.
- [x] Tests: Rust (Clipnamen, Rollen), E2E mit GLB samt eingebetteten Clips (Ruhe + Geste).

### Schritt 2 – Mehr Knochen erkennen ✅
- [x] Aliase für 3ds-Max-Biped (`Bip001 …`) und nach glTF konvertierte MMD-Modelle (englisch „Left elbow“, japanisch
      „左ひじ“/„上半身“); Knochennamen behalten dafür Buchstaben anderer Schriften. Geprüft an einem echten MMD-Modell
      (Arme hängen statt T-Pose).
- [x] Rollen für Brust, Schultern, Hände, Beine, Füße, Zehen und alle Finger (je drei Glieder) mit Namen für Mixamo,
      Unreal, Blender/Rigify, MakeHuman, VRoid, Biped, MMD englisch/japanisch und `finger1-1_L`; MMD-„Left leg“ ist
      der Oberschenkel, wenn es „Left knee“ gibt. Geprüft an NTE (52 Rollen), MMD (48) und A010 (50).
- [x] Retargeting fremder Mixamo-Bewegungen über alle Rollen (jede Rolle unter ihrem Mixamo-Namen).

### Schritt 3 – Gesicht zuordnen
- [x] Japanische MMD-Gesichtsformen (あ い う え お, まばたき, 笑い, 怒り, 困る, びっくり, なごみ) auch im glTF-Viewer
      (`MMD_MORPHS` in `gltfRig.ts`, geteilt mit dem MMD-Viewer).
- [ ] Editor je Modell: Emotionen (fröhlich, traurig, wütend, überrascht, entspannt), Blinzeln und Mundformen
      (aa/ih/ou/ee/oh) auf beliebige Morph Targets legen, mit Gewicht; gespeichert pro Modell.
- [x] Gesichter mit Knochen statt Morphs (`boneFace.ts`): Augenlider, Brauen, Lippen und Mundwinkel nach Namensmuster,
      Bewegungen geometrisch in der Ruhepose (Augenabstand als Maß) und in den Elternraum umgerechnet; Blinzeln, Mundformen
      und Gefühle. Geprüft an Unreal-Figuren (NTE).

### Schritt 4 – Anime-Look ✅
- [x] Toon-Schalter am glTF-Avatar (`toonLook.ts`: `MeshToonMaterial` mit drei Lichtstufen, Konturen über
      `OutlineEffect` nur für deckende Teile, neutrales Tone-Mapping, mehr Umgebungslicht), gemerkt pro Modell und Gerät.
      VRM (MToon) und MMD bringen eigene Toon-Shader mit.

### Schritt 5 – Import als Ordner/ZIP ✅
- [x] `.gltf` + `.bin` + Texturen als Ordner oder ZIP importieren (`avatar_models::import_folder_model`, Skelett-Prüfung,
      Liste über `find_gltf_models`); der Viewer lädt Puffer und Texturen per Blob-URL, Namen case-insensitiv (`gltfFile.ts`).

### Schritt 6 – Nutzeranleitung ✅
- [x] Anleitung „Eigenes 3D-Modell mit Animationen“ (Blender-Export, Clipnamen, Stimmungen, Gesichts-Morphs,
      Grenzen) dreisprachig in `docs/guide-3d-avatars{,.de,.ru}.md`, verlinkt aus den READMEs. Die Herkunft der
      Modelle bleibt bewusst offen („musst Du selbst herausfinden“).
- [x] Vollständige Anleitung inkl. Extraktion aus Unreal-Spielen nur lokal in `docs/private/` (per `.gitignore`
      nicht im Repository).
- [x] Nachgezogen für Knochen (Beine, Hände, Finger, Gesichtsknochen), Toon-Schalter und Ordner/ZIP-Import.
- [ ] Gesichts-Editor beschreiben, sobald es ihn gibt.

## 4. Entschiedene Fragen (15.10.2026)

- **Clips ohne Verwendung** (z. B. Kampfanimationen) sind als manuelle Gesten auswählbar: Verwendung „Nur von Hand“,
  Gesten-Menü am Avatar und Vorschau in den Einstellungen. ✅
- **Mehrere Clips je Verwendung** werden **nach Stimmung** gewählt: Jeder Clip und jede importierte Bewegung hat eine
  optionale Stimmung (aus dem Namen geraten, änderbar); passende werden bevorzugt (Gewicht 4, „jede Stimmung“ 1,
  andere 0,25), die Ruhe-Schleife wechselt mit der Stimmung zur passendsten. ✅
