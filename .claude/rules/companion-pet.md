---
paths:
  - "src-tauri/src/modules/companion*.rs"
  - "src-tauri/src/modules/mcp_client.rs"
  - "src/components/companion/**"
  - "src/services/desktopPet*"
  - "src/services/api/companion.ts"
---
# Companion, Desktop-Pet & Overlay
Lies bei Aufgaben in diesem Bereich [`docs/ai/companion-pet-overlay.md`](../../docs/ai/companion-pet-overlay.md).
- Sensible Companion-Aktionen (`execute_code`, Screenshots, Zwischenablage) benötigen die explizite HITL-Bestätigung.
- Im Desktop-Pet keine Hook-Refs von außen mutieren (`usePetWindowPhysics`) und `oxlint`-React-Regeln sauber halten.
