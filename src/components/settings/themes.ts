/** Color themes; the matching CSS lives in App.css under `[data-theme=…]`. */
export const APP_THEMES = [
  { id: 'obsidian', name: 'Obsidian', primary: '#a855f7', accent: '#ec4899', bg: '#0f172a' },
  { id: 'cyberpunk', name: 'Cyberpunk', primary: '#facc15', accent: '#06b6d4', bg: '#0c0a1a' },
  { id: 'sakura', name: 'Sakura Blossom', primary: '#f472b6', accent: '#fb7185', bg: '#160c1c' },
  { id: 'midnight', name: 'Midnight OLED', primary: '#38bdf8', accent: '#818cf8', bg: '#000000' },
  { id: 'emerald', name: 'Emerald Matrix', primary: '#10b981', accent: '#34d399', bg: '#02180e' },
] as const;

export type AppThemeId = (typeof APP_THEMES)[number]['id'];

export const APP_LANGUAGES = [
  { id: 'de', label: 'Deutsch' },
  { id: 'en', label: 'English' },
  { id: 'ru', label: 'Русский' },
] as const;
