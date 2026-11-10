# 🎨 VRM Avatar & 3D Character Creation Pipeline

Dieses Dokument dient als zentrale Wissensbasis und verbindlicher Leitfaden für die Erstellung, Modellierung, Texturierung, Riggung und den VRM-Export von 3D-Anime-Avataren für **OtakuSoul**.

---

## 🗺️ 1. Werkzeuge & Lokale AI-Suite (`D:\AI`)

Für die Asset-Erstellung steht eine lokal installierte Suite modernster Open-Source-Tools zur Verfügung (getestet und optimiert für NVIDIA RTX 5090 / CUDA 12.8):

| Werkzeug | Pfad | Hauptaufgabe |
|---|---|---|
| **HairDeck** | `D:\AI\HairDeck` | Stilisierte 3D-Anime-Hair-Cards direkt aus 2D-Bildern inklusive Bone-Chains (Spring Bones) und VRM-Export |
| **Motion2MixamoRig** | `D:\AI\Motion2MixamoRig` | Übertragung von menschlichen Bewegungen aus Smartphone-/Webcam-Videos auf Mixamo/VRM-Rigs |
| **image-to-3dlab (AssetFurnace)** | `D:\AI\image-to-3dlab` | Lokale Bild-zu-3D-Pipeline (TRELLIS.2, Hunyuan3D, SF3D) für Basiskörper, Kleidung und Requisiten |
| **Charakuru** | `D:\AI\Charakuru` | 2D-zu-VRM Avatar-Workflow & Blendshape-Generierung für Coding-Agenten |
| **UltraTex (ComfyUI)** | D:\AI\ComfyUI | Gestochen scharfe 2K-Multi-View-PBR-Texturierung untexturierter Meshes aus einem Referenzbild |
| **PixelArtistry Workflows** | D:\AI\PixelArtistry-UltraTex / -Watertight-Meshes | ComfyUI-Workflows für Watertight-Meshes, Retopologie und UltraTex (6 & 10 Views) |
| **PartLLM** | `D:\AI\PartLLM` | Semantische 3D-Part-Segmentierung (Zerlegung monolithischer 3D-Meshes) |

---

## 📐 2. Kopf- und Gesichtsproportionen (Anime-Topologie & Profil)

### A. Anatomische Maße & Abstände (Referenz: Nagatoro Head-Turnaround)
1. **Nase (`Nasenwurzel & Nasenspitze`):**
   * Keine keilförmigen, scharf vorspringenden Kanten aus automatischen 3D-Scans übernehmen.
   * Anime-Nasen besitzen eine dezent vertiefte Nasenwurzel und eine kleine, sanft abgerundete Spitze, die nur ca. 6–8 mm vor der Oberlippe liegt.
2. **Lippen & Philtrum:**
   * Niemals senkrechte Flächen unterhalb der Nase stehen lassen.
   * Der Mundbereich benötigt einen feinen, sanft nach innen modellierten Schnitt mit dezentem Schwung an den Mundwinkeln.
3. **Kinn & Unterkiefer (`Unterkieferverlauf`):**
   * Kein 90-Grad-Rechter-Winkel zwischen Kinnunterseite und Hals.
   * Der Unterkiefer muss in der Seitenansicht in einer nachvollziehbaren, diagonalen Linie schräg nach hinten-oben zum Ohransatz/Hals aufsteigen.
   * Das Kinn von vorn leicht abrunden (keine übertrieben spitze Nadel-V-Form).
4. **Augeneinbettung & Augenhöhle:**
   * **Profil-Tiefe:** Die Hornhaut (Cornea) der Augen darf in der Profilansicht **nicht** vor Stirn oder Nase herausstehen. Sie muss 12–16 mm hinter Stirnwölbung und Nasenwurzel im Schädel eingebettet sein.
   * **3D-Lider:** Die Augenform wird durch modellierte 3D-Ober- und Unterlider eingefasst (ca. 1,5–2 mm Überhang), um aufgesetzte, schwebende Texturscheiben zu vermeiden.
   * **Seitenansicht (3/4 & Profil):** Augäpfel müssen der horizontalen Schädelwölbung folgen (nach außen/hinten zurückweichen).

---

## 💇 3. Haare & Physik (HairDeck Workflow)

### Das Problem monolithischer 3D-Generatoren:
Generatoren wie TRELLIS, Tripo oder SF3D erzeugen Haare als massiven Klumpen oder verschmelzen sie fest mit Stirn und Ohren. Das führt zu:
* Ausgefransten, flackernden Geometriekanten an den Ohren.
* Unmöglichem Rigging / fehlender Haar-Physik.

### Die HairDeck-Lösung:
1. **Isoliertes Bild verwenden:** Frontalansicht des Kopfes (`nagatoro_front_crop.png`) freistellen.
2. **Generierung:**
   ```powershell
   cd D:\AI\HairDeck
   .\.venv\Scripts\python.exe scripts\image_to_hair.py "PFAD_ZUM_BILD.png" --out "results/output" --n 2
   ```
3. **Hair Cards:** HairDeck erzeugt ca. 35–45 saubere, unzusammenhängende Ribbon-Cards, die wie bei handmodellierten Anime-Frisuren über der Kappe liegen.
4. **Spring Bones:**
   ```powershell
   .\.venv\Scripts\python.exe -m hairdeck.vrm.export "results/output/character" 0
   ```
   Erzeugt automatisch Bone-Chains in den langen Haarsträhnen und exportiert ein fertiges `.vrm` bzw. `.glb`.

---

## 🎭 4. Gesichtsausdrücke & Blendshapes (VRM-Standard)

Für OtakuSoul und VTuber-/Animation-Kompatibilität benötigt ein Avatar mindestens:
* **Standard-Vokale:** `A`, `I`, `U`, `E`, `O` (Mundöffnung)
* **Emotionen:** `Blink`, `Blink_L`, `Blink_R`, `Joy`, `Angry`, `Sorrow`, `Fun`, `Surprised`
* **LookAt:** `LookUp`, `LookDown`, `LookLeft`, `LookRight`

> **Tipp:** Wenn die Basis auf einer standardisierten Anime-Topologie (wie dem VRoid- oder Charakuru-Basismesh) aufbaut, können die bestehenden 52 Blendshapes (inkl. ARKit-Face-Tracking) direkt per Proximity-/Delta-Transfer übernommen werden.

---

## 🛠️ 5. Prüf- und Kontrollprozess vor dem finalen Export

Jeder Avatar-Kopf muss vor der Freigabe in drei getrennten Modi aus 4 Winkeln (**Front, 3/4, Links, Rechts** in orthografischer Projektion) geprüft werden:

1. **Clay / Grau ohne Haare:**
   * Aufdecken von Fehlern in der Schädelsilhouette, Kinnlinie, Nasenwurzel und Augeneinbettung.
2. **Clay / Grau mit Haaren & Clips:**
   * Prüfung der Frisurensilhouette, Pony-Spitzen und Ohrenanschlüsse ohne störende Texturen.
3. **Toon / Materialansicht:**
   * Prüfung von Hautton (z. B. Nagatoros Tan-Hautton), Iris-Farbe und Linienführung.
