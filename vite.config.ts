/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { visualizer } from "rollup-plugin-visualizer";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    // `npm run analyze`: treemap of every chunk in target/bundle-stats.html.
    mode === "analyze" && visualizer({ filename: "target/bundle-stats.html", gzipSize: true, template: "treemap" }),
  ],
  test: {
    // Component tests opt into jsdom with `// @vitest-environment jsdom`; the rest stays on fast node.
    setupFiles: ['src/test/setup.ts'],
  },
  build: {
    // Only the Three.js/VRM avatar chunk (~790 kB) is above Vite's 500 kB: three.js can't be split,
    // and it loads only when the avatar is visible. Startup code stays below 300 kB per chunk
    // (English and Russian load on demand, see `i18n/registry.ts`). Check with `npm run analyze`.
    chunkSizeWarningLimit: 800,
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
