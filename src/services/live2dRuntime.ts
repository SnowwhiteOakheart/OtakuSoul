let cubismCorePromise: Promise<void> | null = null;

/**
 * Loads the proprietary Cubism 4 core on demand. `pixi-live2d-display/cubism4`
 * checks for `window.Live2DCubismCore` at import time, so this must resolve
 * before the Live2D viewer module is imported.
 */
export const loadCubismCore = (): Promise<void> => {
  if ((window as unknown as { Live2DCubismCore?: unknown }).Live2DCubismCore) {
    return Promise.resolve();
  }
  if (!cubismCorePromise) {
    cubismCorePromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/live2d/live2dcubismcore.min.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        cubismCorePromise = null;
        script.remove();
        reject(new Error('Live2D Cubism Core konnte nicht geladen werden.'));
      };
      document.head.appendChild(script);
    });
  }
  return cubismCorePromise;
};
