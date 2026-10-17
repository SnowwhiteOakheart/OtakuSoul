# Your own 3D model with animations in OtakuSoul

[🇬🇧 English](guide-3d-avatars.md) • [🇩🇪 Deutsch](guide-3d-avatars.de.md) • [🇷🇺 Русский](guide-3d-avatars.ru.md)

Besides VRM and MMD models, OtakuSoul shows **glTF/GLB avatars** – and plays the animations stored inside the GLB
file. This guide shows how to prepare a model in **Blender** so that you end up with a single `.glb` file containing
the model, textures, face shapes and named animations.

> Applies to OtakuSoul 0.5.0 and later. Menu names in Blender may differ slightly between versions.

## 1. Where does the model come from?

The guide starts with a model that is already in Blender – built yourself, bought, or from VRoid, Mixamo,
MakeHuman or another source. **How you obtain a model is up to you to figure out.** Mind the rights: only use
models you are allowed to use, respect licenses and terms of service, and do not share other people's characters.
You are responsible for models you did not make yourself.

## 2. What you need

- **[Blender](https://www.blender.org/) 4.2 or newer** (Linux, Windows, macOS)
- an import add-on for your model's format if needed (Blender handles FBX and glTF itself)
- **OtakuSoul 0.5.0 or newer**

## 3. Prepare the model

1. Import the model into an empty scene (delete the default cube, camera and light first).
2. **Check the scale:** the figure should be about 1.5–1.8 m tall (sidebar `N` → Dimensions). OtakuSoul brings
   models outside 0.5–3 m to 1.6 m on its own, but a correct scale is cleaner. Then apply
   **Ctrl+A → All Transforms**.
3. **A skeleton is required:** models without an armature (sculptures, AI-generated figures, scans) are refused.
   More than about 500,000 triangles load slowly – OtakuSoul points this out on import.
4. **One armature:** all parts (body, head, hair, clothes) should hang on **one** skeleton. Remove extra armatures
   and attach the parts to the main armature via an "Armature" modifier.
5. **Bone names:** OtakuSoul recognises torso, head, arms, hands, legs, feet and fingers with Mixamo, Unreal Mannequin, MakeHuman, Blender
   (`upper_arm.L`), VRoid, 3ds Max Biped (`Bip001 …`) and MMD names (Japanese too). Other skeletons still work with their own animations; only imported foreign
   motions (Mixamo FBX) will not fit them.

## 4. Materials

OtakuSoul uses standard materials (glTF "PBR"). For each material in the shader editor:

- **Base color:** image texture → *Base Color* of the *Principled BSDF*
- **Normal map:** image texture (color space *Non-Color*) → *Normal Map* node → *Normal*
- **Transparency** (hair, eyelashes, frills):
  - Cut-outs (alpha only fully transparent or fully opaque – the usual case): connect the base color's alpha through
    a **Math node "Round"** to *Alpha*. The glTF export turns this into *alpha clip* (`MASK`).
  - Only real semi-transparency (shadow overlays, glass): alpha straight to *Alpha* → *blending* (`BLEND`).
  - Do not set everything to blending: overlapping parts are then sorted wrongly and show up as black frayed spots.
- For anime figures usually **Metallic 0** and **Roughness 0.6–0.8** – otherwise they look like plastic.

Custom shaders (e.g. toon/cel shading) do not survive the glTF export. For the anime look OtakuSoul has its own
**toon switch** on the avatar (brush icon): hard light and shadow steps plus outlines, remembered per model.

## 5. Name the animations

Each animation is its own **action** in Blender. Name them in the **Dope Sheet → Action Editor**. The name decides
what OtakuSoul uses the clip for (you can change it later in the settings):

| Use in OtakuSoul | Name contains e.g. |
|---|---|
| Idle (loop) | `Idle`, `Stand`, `Breath`, `Wait` |
| Greeting/waving | `Wave`, `Greet`, `Hello`, `Bye` |
| Nod | `Nod`, `Yes`, `Agree` |
| Joy | `Happy`, `Joy`, `Laugh`, `Cheer` |
| Sadness | `Sad`, `Cry` |
| Anger | `Angry`, `Anger`, `Mad` |
| Surprise | `Surprise`, `Shock` |
| Thinking | `Think`, `Ponder` |
| by hand only (gestures menu) | anything else, e.g. `Dance_Spin` |

A **mood** in the name makes OtakuSoul prefer the clip when the emotion fits: `Idle_Happy`, `Wave_Shy` (relaxed),
`Idle_Sad`, `Wave_Angry`, `Surprise_Shock` …

- **Protect every action with "Fake User" (shield icon)**, otherwise Blender drops unused actions.
- If an animation moves the whole figure through space (walking), OtakuSoul keeps the hips and every bone above
  them in place sideways; up and down (breathing, bobbing) stays.

## 6. Face (shape keys)

OtakuSoul drives blinking, mouth movement while speaking and emotions through **shape keys** with these names
(ARKit standard, Oculus visemes or simple names):

| Purpose | Shape key names |
|---|---|
| Blink | `eyeBlinkLeft` + `eyeBlinkRight`, or `eyesClosed`, or `blink` |
| Mouth while speaking | `viseme_aa`, `viseme_I`, `viseme_U`, `viseme_E`, `viseme_O` – or `jawOpen`, `mouthPucker`, `mouthFunnel`, `mouthStretchLeft/Right` |
| Happy | `mouthSmileLeft` + `mouthSmileRight` (+ `cheekSquintLeft/Right`), or `mouthSmile`, or `happy` |
| Angry | `browDownLeft/Right` + `mouthFrownLeft/Right`, or `angry` |
| Sad | `browInnerUp` + `mouthFrownLeft/Right`, or `sad` |
| Surprised | `browInnerUp` + `eyeWideLeft/Right` + `jawOpen`, or `surprised` |
| Relaxed | a slight `mouthSmileLeft/Right`, or `relaxed` |

Models converted from MMD also work with their Japanese names: `あ` `い` `う` `え` `お`, `まばたき`, `笑い`,
`怒り`, `困る`, `びっくり`, `なごみ`.

**Faces driven by bones:** many game figures have no shape keys but small face bones. OtakuSoul recognises them by
name and moves them itself: eyelids (`…lid…_up`/`…_lo`), brows (`…brow…`), upper and lower lip
(`…uplip…`/`…lolip…`, `upper_lip`/`lower_lip`) and mouth corners (`…colip…`, `…corner…`), each with side `_L`/`_R`.
Eyeballs (`…eyeball…`) serve as the scale. The bones must hang on the head bone and be weighted to the face.

If your shape keys are named differently, map them in OtakuSoul: **Settings → Appearance & Theme → Face in the model
(glTF)**. There you pick one or more face shapes with a weight per expression and set its strength (also for face
bones); the **live preview** shows the model, ▶ the expression. Renaming in Blender (Object Data properties → Shape
Keys) works too.

## 7. Export as GLB

Select all parts and the armature, then **File → Export → glTF 2.0 (.glb/.gltf)**:

- **Format:** *glTF Binary (.glb)* – a single file, the simplest. *glTF Separate (.gltf + .bin + textures)* works too:
  keep the whole folder or pack it as a ZIP
- **Include:** *Selected Objects*
- **Mesh:** *UVs*, *Normals*, *Apply Modifiers*
- **Shape Keys** and **Skinning:** on
- **Animation:** on, mode **Actions** (each action becomes its own named clip), *Always Sample Animations* on
- **Compression:** off (OtakuSoul cannot read Draco-compressed files)

Feel free to scale textures down to 2048 px – it saves video memory and loading time.

## 8. Import into OtakuSoul

1. **Library → Avatars → "Import 3D model"** (or Settings → Appearance & Theme → Default avatars) and choose the `.glb`.
   You can also pick the `.gltf` (its folder with `.bin` and textures is copied along) or a ZIP holding a `.gltf`/`.glb`.
   The model is copied into the avatar folder.
2. The avatar manager (**Library → Avatars**) shows the model with a live preview. Use **"Use as default"** there, or tick
   single characters under **"Characters with this model"** (the character editor works too). If the chat is not set to
   **3D**, the manager offers to switch.
3. **Settings → Appearance & Theme → 3D avatar motions (VRMA, Mixamo) → "Motions inside the model (glTF)"** lists all clips of the
   file:
   - **Use:** idle loop, gestures (waving, nodding, emotions …) or **"By hand only"**
   - **Mood:** with several clips for one use, OtakuSoul prefers those fitting the current emotion; the idle loop
     follows the mood
   - **▶** plays the clip as a check
4. In the chat the figure plays gestures on roleplay actions (`*waves*`, `*nods*`, `*laughs*`) and detected
   emotions. Start "by hand only" clips from the **"Gestures from the model"** menu (clapperboard icon at the bottom left of the
   avatar).
5. **Rename and remove:** after the import a name field opens; later use **"Rename"** in the avatar manager or below the list in the settings (the file keeps its
   name, leaving the field empty restores the original). **"Remove"** moves an imported model with its folder into the
   app's trash (with "Undo" for 8 seconds); bundled models stay. The same works for Live2D models.

## 9. Troubleshooting

| Problem | Fix |
|---|---|
| Figure is tiny, huge or lies on its back | In Blender **Ctrl+A → All Transforms**, export again |
| Figure is grey or black | Connect the textures (section 4); for black metal parts set Metallic to 0 |
| Hair/eyelashes show as blocks | Connect the base color's alpha (section 4) |
| Black frayed spots on hair or clothes | Export cut-out parts as alpha clip (Math node "Round"), not as blending |
| Animations are missing | Set "Fake User", export with animation mode **Actions** |
| Figure distorts during animations | The animation belongs to a different skeleton. OtakuSoul detects such clips (other bone lengths, legs pointing up) and does not play them – they are marked in the clip list, the figure uses the other motions instead |
| Figure lies sideways, stands on its head or vanishes once an animation plays | Load the model and the animations through the **same** import path in Blender (e.g. both with the same add-on). Different importers use different axes (Z or Y up) and bone orientations; Blender already shows this on playback |
| Figure walks out of the picture | Set the walk animation to "By hand only" or leave it out |
| Face does not move | Map face shapes in the face editor (section 6) – or name face bones after the patterns listed there |
| “The model has no skeleton” | Static models (e.g. AI-generated figures, 3D scans) are refused. Rig them first – e.g. with Mixamo (auto-rig) or in Blender (Rigify) – and reduce the polygon count beforehand with “Decimate” to about 50,000–100,000 triangles |
| Import fails or loads very slowly | `.glb`, `.gltf` with its folder or a ZIP, each without Draco compression; scale textures down |
