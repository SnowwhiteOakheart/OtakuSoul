# 🌌 OtakuSoul

> **Next-Generation Desktop & Mobile AI Companion, Tabletop RPG Engine & Cognitive Architecture**  
> Built with **Rust (Tauri v2)** + **React 19 / TypeScript / WebGL (Three.js VRM & Live2D)**.

---

## 🌟 Vision & Architecture

OtakuSoul is a ground-up high-performance rewrite and evolution of Souls of Waifu, designed to eliminate the Python runtime overhead and deliver a unified cross-platform experience across **Linux**, **Windows**, **macOS**, and future **iOS & Android** platforms.

### Core Stack
- **Backend / Orchestrator:** Rust (Tauri v2 + Tokio async runtime)
  - Native hardware & VRAM probing (dynamically calculates optimal `n_gpu_layers` and context limits).
  - Managed `llama-server` process with guaranteed termination (zero-zombie orphan prevention).
  - Multi-provider Cloud fallback (OpenRouter, DeepSeek, Claude, OpenAI, Gemini).
  - High-performance cognitive Soul Memory powered by SQLite.
  - Deterministic Soul Stage tabletop RPG engine.
  - Native SillyTavern / Tavern Card V2 parser (JSON & embedded PNG chunks).
- **Frontend / Visualization:** React 19 + TypeScript + Vite + Tailwind CSS v4
  - 3D VRM rendering via `@pixiv/three-vrm` and Three.js with emotion morph targets and LipSync.
  - 2D Live2D rendering via PixiJS.
  - Procedural Web Audio synthesizer (dice rolls, critical fanfares, campfires).
  - Cyberpunk / Anime Glassmorphism responsive UI with Adaptive Stat Variable HUD.

---

## 🚀 Getting Started

### Prerequisites
- **Rust:** 1.78+ (`rustup update`)
- **Node.js:** 20+ (`node -v`)
- **System libraries (Linux):** `webkit2gtk-4.1`, `gtk3`, `libsoup-3.0`

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

## 🗺️ Migration Roadmap

- [x] **Phase 1: Architecture & Foundation Setup**
  - Tauri v2 + React 19 + TypeScript + Tailwind CSS v4
  - Cross-platform dependency tree & Cargo configuration
  - Private GitHub repository bootstrap
- [ ] **Phase 2: Hardware Probing & LLM Process Orchestrator**
  - Native VRAM/RAM probing for RTX 4070 Ti SUPER / Vulkan / Apple Silicon
  - `llama-server` child process manager with lifecycle & health monitoring
  - SSE streaming proxy & OpenAI-compatible cloud provider integration
- [ ] **Phase 3: Character Cards (V2) & Lorebooks Engine**
  - PNG chunk & JSON parser for Tavern/SillyTavern cards
  - Dynamic Lorebook situational injector & token budget manager
  - Reactive Stat Variables & Adaptive HUD
- [ ] **Phase 4: 3D VRM & 2D Live2D Avatar Engine**
  - WebGL Three.js VRM player with eye blinking, idle breathing, and emotions
  - Pixi.js Live2D viewer
  - Audio Lip-Sync matching
- [ ] **Phase 5: Kognitive Soul Memory (SQLite)**
  - 4 Layers: Psychology, Relationship, Episodic Archive, Diary
  - Emotional decay & memory self-healing
- [ ] **Phase 6: Soul Stage Tabletop RPG & Procedural SFX**
  - WorldState & AI Game Master
  - Deterministic dice roller & tactical encounter mode
  - Web Audio procedural SFX synthesizer
- [ ] **Phase 7: Soul Companion & Tool Calling**
  - Neurohormonal simulation & Human-in-the-Loop 25s safety countdown
  - MCP (Model Context Protocol) integration

---

## 📄 License

GPLv3 © SnowwhiteOakheart
