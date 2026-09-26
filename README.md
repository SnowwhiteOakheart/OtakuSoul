# 🌌 OtakuSoul

> **Next-Generation Desktop & Mobile AI Companion, Tabletop RPG Engine & Cognitive Architecture**  
> Built with **Rust (Tauri v2)** + **React 19 / TypeScript / WebGL (Three.js VRM & Live2D)**.

---

## 🌟 Vision & Architecture

OtakuSoul is a ground-up high-performance rewrite and evolution of Souls of Waifu, designed to eliminate the Python runtime overhead and deliver a unified cross-platform experience across **Linux**, **Windows**, **macOS**, and future **iOS & Android** platforms.

### Core Stack
- **Backend / Orchestrator:** Rust (Tauri v2 + Tokio async runtime)
  - Native hardware & VRAM probing (dynamically calculates optimal `n_gpu_layers` and context limits).
  - Managed `llama-server` process with guaranteed termination (`PR_SET_PDEATHSIG` zero-zombie orphan prevention).
  - Multi-provider Cloud fallback (OpenRouter, DeepSeek, Claude, OpenAI, Gemini).
  - High-performance cognitive Soul Memory powered by SQLite (Psychology, Relationships, Episodic Memory, Diary, Emotional Decay).
  - Deterministic Soul Stage tabletop RPG engine (dice roller with DC checks, campaign clocks, tactical combat).
  - Biometric neurohormonal simulation (Dopamine, Cortisol, Oxytocin, Fatigue) & 25s Human-in-the-Loop tool safety.
  - Native SillyTavern / Tavern Card V2 parser (JSON & embedded binary PNG chunks).
- **Frontend / Visualization:** React 19 + TypeScript + Vite + Tailwind CSS v4
  - 3D VRM rendering via `@pixiv/three-vrm` and Three.js with emotion morph targets, idle breathing, blinking, and LipSync.
  - 2D Live2D rendering via PixiJS.
  - Procedural Web Audio synthesizer (dice rolls, critical fanfares, buzzers, and campfire atmosphere).
  - Cyberpunk / Anime Glassmorphism responsive UI with Adaptive Stat Variable HUD and Cognitive Soul Drawer.

---

## 🚀 Getting Started

### Prerequisites
- **Rust:** 1.78+ (`rustup update`)
- **Node.js:** 20+ (`node -v`)
- **System libraries (Linux):** `webkit2gtk-4.1`, `gtk3`, `libsoup-3.0`, `librsvg-2.0`

### Development

```bash
# Install frontend dependencies
npm install

# Run in desktop development mode
npm run tauri dev
```

### Production Build

```bash
# Build desktop executable & installers
npm run tauri build
```

---

## 🗺️ Migration Roadmap & Features

- [x] **Phase 1: Architecture & Foundation Setup**
  - Tauri v2 + React 19 + TypeScript + Tailwind CSS v4
  - Cross-platform dependency tree & Cargo workspace configuration
  - Private GitHub repository bootstrap ([SnowwhiteOakheart/OtakuSoul](https://github.com/SnowwhiteOakheart/OtakuSoul))
- [x] **Phase 2: Hardware Probing & LLM Process Orchestrator**
  - Native VRAM/RAM probing for NVIDIA GPUs (RTX 4070 Ti SUPER), Vulkan & Apple Silicon
  - `llama-server` child process manager with lifecycle & `/health` monitoring
  - SSE streaming proxy with `<think>` reasoning token separation
- [x] **Phase 3: Character Cards (V2) & Lorebooks Engine**
  - PNG chunk & JSON parser for Tavern/SillyTavern V2 cards
  - Dynamic Lorebook situational injector & token budget manager
  - Reactive Stat Variables & Adaptive HUD
- [x] **Phase 4: 3D VRM & 2D Live2D Avatar Engine**
  - WebGL Three.js VRM player with eye blinking, idle breathing, and emotion morphing
  - Audio-driven mouth LipSync matching
  - Offline binary model loader (CORS-free)
- [x] **Phase 5: Kognitive Soul Memory (SQLite)**
  - 4 Layers: Psychology, Relationship, Episodic Archive, Diary
  - Mathematical emotional decay & memory deduplication with significance boosting
  - Full-featured Soul Memory Inspector drawer in the HUD
- [x] **Phase 6: Soul Stage Tabletop RPG & Procedural SFX**
  - WorldState & AI Game Master atmosphere controls
  - Deterministic dice roller (d4 to d100) with DC checks & critical detection
  - Blades in the Dark circular campaign clocks
  - Tactical encounter mode with initiative queue, HP/stress bars, and status effects
  - Procedural Web Audio synthesizer (zero external sound files)
- [x] **Phase 7: Soul Companion & Tool Calling**
  - Neurohormonal simulation (Dopamine, Cortisol, Oxytocin, Fatigue)
  - Tool calling engine with Human-in-the-Loop 25s safety countdown banner
  - Full companion desktop dashboard & audit execution log
- [x] **Phase 8: Data Foundation & Character Library**
  - Native file dialogs (`tauri-plugin-dialog`) for GGUF models, VRMs, PNG and JSON cards
  - Standard user directories (`~/.local/share/otakusoul`) and dynamic asset scanning
  - Persistent settings (`settings.json`) with configurable sampler & language
  - SillyTavern V2 Character Library with gallery, search, tag filters, and live editor
  - PNG `chara` tEXt metadata injection & export, plus User-Persona management
- [x] **Phase 9: Full Chat System, Swipes & Roleplay HUD Presets**
  - Multi-chat SQLite sessions per character (`chat_sessions`, `chat_messages`) with sidebar drawer
  - SillyTavern-style answer swipes (`< 1/3 >` pagination, regenerate without losing variants)
  - Inline message editing, delete, and continue generation
  - Author's Note with configurable injection depth ($N$ messages from conversation end)
  - Real-time `<state>` JSON tag extraction, tag-stripping, and automatic reactive HUD updates
  - 11 Roleplay HUD Presets (Romance, RPG, Survival, Horror, Cyberpunk, Slice-of-Life, etc.)
  - Full SillyTavern & SoW JSONL chat import and export
- [ ] **Phases 10–18: Remaining feature parity with Soul of Waifu**
  - Provider abstraction & LLM presets, Soul Memory 2.0 agents, voice (TTS/STT), Live2D, AI Game Master, real companion tools, web client, Discord & packaging
  - See **[Roadmap.md](Roadmap.md)** for the full, detailed plan (German)

---

## 📄 License

GPLv3 © SnowwhiteOakheart
