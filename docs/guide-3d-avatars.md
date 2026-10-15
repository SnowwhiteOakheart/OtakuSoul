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
3. **One armature:** all parts (body, head, hair, clothes) should hang on **one** skeleton. Remove extra armatures
   and attach the parts to the main armature via an "Armature" modifier.
4. **Bone names:** OtakuSoul recognises torso, head and arms with Mixamo, Unreal Mannequin, MakeHuman, Blender
   (`upper_arm.L`) and VRoid names. Other skeletons still work with their own animations; only imported foreign
   motions (Mixamo FBX) will not fit them.

## 4. Materials

OtakuSoul uses standard materials (glTF "PBR"). For each material in the shader editor:

- **Base color:** image texture → *Base Color* of the *Principled BSDF*
- **Normal map:** image texture (color space *Non-Color*) → *Normal Map* node → *Normal*
- **Transparency** (hair, eyelashes): alpha of the base color → *Alpha*, *Blend Mode* *Alpha Clip* or *Alpha Blend*
- For anime figures usually **Metallic 0** and **Roughness 0.6–0.8** – otherwise they look like plastic.

Custom shaders (e.g. toon/cel shading) do not survive the glTF export.

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
- If an animation moves the whole figure through space, OtakuSoul removes the translation of the top bone. Walk
  cycles are still rarely a good fit.

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

If your shape keys are named differently, rename the matching ones (Object Data properties → Shape Keys). An editor
for mapping them directly in OtakuSoul is planned.

## 7. Export as GLB

Select all parts and the armature, then **File → Export → glTF 2.0 (.glb/.gltf)**:

- **Format:** *glTF Binary (.glb)* – OtakuSoul imports a single `.glb` file
- **Include:** *Selected Objects*
- **Mesh:** *UVs*, *Normals*, *Apply Modifiers*
- **Shape Keys** and **Skinning:** on
- **Animation:** on, mode **Actions** (each action becomes its own named clip), *Always Sample Animations* on
- **Compression:** off (OtakuSoul cannot read Draco-compressed files)

Feel free to scale textures down to 2048 px – it saves video memory and loading time.

## 8. Import into OtakuSoul

1. **Settings → Appearance & Theme → Default avatars → 3D avatar (VRM, glTF or MMD) → "Import 3D model …"** and choose the `.glb`.
   The model is copied into the avatar folder.
2. Select the model (globally or per character in the character editor) and switch the chat's avatar mode to **3D**.
3. **Settings → Appearance & Theme → 3D avatar motions (VRMA, Mixamo) → "Motions inside the model (glTF)"** lists all clips of the
   file:
   - **Use:** idle loop, gestures (waving, nodding, emotions …) or **"By hand only"**
   - **Mood:** with several clips for one use, OtakuSoul prefers those fitting the current emotion; the idle loop
     follows the mood
   - **▶** plays the clip as a check
4. In the chat the figure plays gestures on roleplay actions (`*waves*`, `*nods*`, `*laughs*`) and detected
   emotions. Start "by hand only" clips from the **"Gestures from the model"** menu (clapperboard icon at the bottom left of the
   avatar).

## 9. Troubleshooting

| Problem | Fix |
|---|---|
| Figure is tiny, huge or lies on its back | In Blender **Ctrl+A → All Transforms**, export again |
| Figure is grey or black | Connect the textures (section 4); for black metal parts set Metallic to 0 |
| Hair/eyelashes show as blocks | Connect the base color's alpha, *Blend Mode* Alpha Clip |
| Animations are missing | Set "Fake User", export with animation mode **Actions** |
| Figure distorts during animations | The animation belongs to a different skeleton |
| Figure walks out of the picture | Set the walk animation to "By hand only" or leave it out |
| Face does not move | Rename shape keys as in section 6 |
| Mixamo motions do not fit | So far torso, head and arms are recognised; better recognition (legs, hands, fingers, `Bip001` rigs) is planned |
| Import fails or loads very slowly | Only `.glb` without Draco compression; scale textures down |
