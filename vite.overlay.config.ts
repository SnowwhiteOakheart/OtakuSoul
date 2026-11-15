/// The OBS overlay's 3D figure (`src/overlay3d/main.ts`) as one classic script, `dist/overlay/overlay3d.js`.
/// The web server serves it as `/overlay/3d.js` (from the app's embedded assets). Runs after the
/// main build, which empties `dist/`.
import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: false,
  build: {
    target: 'es2022',
    outDir: 'dist/overlay',
    emptyOutDir: true,
    // three.js and three-vrm in one file: the overlay page loads nothing else.
    chunkSizeWarningLimit: 1200,
    lib: {
      entry: 'src/overlay3d/main.ts',
      formats: ['iife'],
      name: 'OtakuOverlay3DBundle',
      fileName: () => 'overlay3d.js',
    },
  },
});
