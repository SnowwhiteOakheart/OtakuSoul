export type ColorModePreference = 'system' | 'light' | 'dark';
export type ResolvedColorMode = Exclude<ColorModePreference, 'system'>;

const COLOR_SCHEME_QUERY = '(prefers-color-scheme: light)';

export const normalizeColorMode = (value: unknown): ColorModePreference =>
  value === 'light' || value === 'dark' || value === 'system' ? value : 'system';

const prefersLightMode = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(COLOR_SCHEME_QUERY).matches
    : false;

export const resolveColorMode = (
  preference: ColorModePreference,
  systemPrefersLight = prefersLightMode()
): ResolvedColorMode => (preference === 'system' ? (systemPrefersLight ? 'light' : 'dark') : preference);

export const applyColorMode = (preference: ColorModePreference) => {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.colorMode = resolveColorMode(preference);
  document.documentElement.dataset.colorModePreference = preference;
};

let removeSystemListener: (() => void) | undefined;

/** Applies a preference and keeps system mode in sync while the app is running. */
export const syncColorMode = (preference: ColorModePreference) => {
  removeSystemListener?.();
  removeSystemListener = undefined;
  applyColorMode(preference);

  if (preference !== 'system' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

  const query = window.matchMedia(COLOR_SCHEME_QUERY);
  const handleChange = () => applyColorMode('system');
  query.addEventListener('change', handleChange);
  removeSystemListener = () => query.removeEventListener('change', handleChange);
};
