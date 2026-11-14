/**
 * Ordered Live2D expression & motion fallback tables and non-deprecated Pixi URL shim.
 * Standard Cubism 2/3/4 packs often expose numeric names (`exp_01`..`exp_08`, `f01`..`f08`,
 * `mtn_01`..`mtn_04`, `TapBody`, `TapHead`) instead of GoEmotions identifiers.
 */

export const ROMANCE_FALLBACK: Record<string, string> = {
  blush: 'embarrassment',
  aroused: 'desire',
  seductive: 'desire',
  ecstasy: 'excitement',
  afterglow: 'relief',
  teasing: 'amusement',
  crying: 'sadness',
  fear: 'fear',
  disgust: 'disgust',
};

/** Ordered Cubism standard expression IDs mapped by canonical GoEmotions / emotion label. */
export const ORDERED_EXPRESSION_FALLBACKS: Record<string, readonly string[]> = {
  neutral: ['exp_01', 'f01', 'expression1', 'Normal', 'Default'],
  joy: ['exp_02', 'f02', 'expression2', 'Smile', 'Happy'],
  happy: ['exp_02', 'f02', 'expression2', 'Smile', 'Happy'],
  amusement: ['exp_02', 'exp_03', 'f02', 'f03', 'Smile'],
  excitement: ['exp_03', 'exp_02', 'f03', 'Star', 'Sparkle'],
  optimism: ['exp_02', 'f02', 'exp_01', 'Smile'],
  pride: ['exp_02', 'exp_07', 'f02', 'Smug'],
  gratitude: ['exp_02', 'exp_06', 'f02', 'Smile'],
  relief: ['exp_01', 'exp_02', 'f01', 'Relax'],
  caring: ['exp_02', 'exp_06', 'f02', 'Gentle'],
  love: ['exp_06', 'exp_02', 'f06', 'Blush', 'Heart'],
  admiration: ['exp_06', 'exp_03', 'f06', 'Sparkle'],
  desire: ['exp_06', 'exp_03', 'f06', 'Blush'],
  embarrassment: ['exp_06', 'exp_07', 'f06', 'Shy', 'Blush'],
  anger: ['exp_04', 'f04', 'expression4', 'Angry'],
  annoyance: ['exp_04', 'exp_07', 'f04', 'Pout'],
  disapproval: ['exp_04', 'exp_07', 'f04'],
  disgust: ['exp_07', 'exp_04', 'f07'],
  sadness: ['exp_05', 'f05', 'expression5', 'Sad'],
  grief: ['exp_05', 'f05', 'Cry', 'Sad'],
  disappointment: ['exp_05', 'exp_07', 'f05', 'Sad'],
  remorse: ['exp_05', 'exp_07', 'f05'],
  surprise: ['exp_03', 'f03', 'expression3', 'Shock', 'Surprised'],
  realization: ['exp_03', 'exp_08', 'f03'],
  curiosity: ['exp_08', 'exp_03', 'f08'],
  confusion: ['exp_08', 'exp_07', 'f08'],
  fear: ['exp_05', 'exp_08', 'f05', 'Scared'],
  nervousness: ['exp_06', 'exp_08', 'f06', 'Sweat'],
};

function dedupe(items: Iterable<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}

/** Ordered expression IDs to try on a Live2D model for `emotion`. */
export function expressionCandidates(emotion: string): string[] {
  const key = emotion.trim().toLowerCase();
  const romance = ROMANCE_FALLBACK[key];
  const numbered =
    ORDERED_EXPRESSION_FALLBACKS[key] ??
    (romance ? ORDERED_EXPRESSION_FALLBACKS[romance] : undefined) ??
    ['exp_01', 'f01'];

  return dedupe([
    emotion,
    `${emotion}_animation`,
    romance,
    romance ? `${romance}_animation` : undefined,
    ...numbered,
  ]);
}

/** Ordered fallback motion groups when no matching expression existed. */
export function emotionMotionCandidates(emotion: string): string[] {
  const key = emotion.trim().toLowerCase();
  const romance = ROMANCE_FALLBACK[key];
  return dedupe([
    emotion,
    romance,
    key === 'anger' || key === 'sadness' ? 'mtn_03' : 'mtn_02',
    'mtn_02',
    'mtn_03',
    'mtn_04',
    'Idle',
    'idle',
  ]);
}

/** Ordered tap reaction motion groups for head pats or body pokes. */
export function tapMotionCandidates(zone: 'head' | 'body' = 'body'): string[] {
  if (zone === 'head') {
    return dedupe([
      'TapHead',
      'Tap@Head',
      'FlickHead',
      'Tap',
      'TapBody',
      'Tap@Body',
      'mtn_02',
      'mtn_03',
      'mtn_01',
      'Idle',
      'idle',
    ]);
  }
  return dedupe([
    'TapBody',
    'Tap@Body',
    'Tap',
    'mtn_02',
    'mtn_03',
    'mtn_04',
    'mtn_01',
    'Idle',
    'idle',
  ]);
}

/** Resolves relative Live2D asset paths against `baseUrl` via standard WHATWG `URL`. */
export function resolveModelUrl(baseUrl: string, targetPath: string): string {
  if (!targetPath) return targetPath;
  if (/^(data:|blob:|https?:\/\/|asset:\/\/)/i.test(targetPath)) {
    return targetPath;
  }
  try {
    return new URL(targetPath, baseUrl).toString();
  } catch {
    const slash = baseUrl.lastIndexOf('/');
    const baseDir = slash >= 0 ? baseUrl.slice(0, slash + 1) : '';
    return `${baseDir}${targetPath.replace(/^\.?\//, '')}`;
  }
}

export interface PixiUrlShim {
  parse: (url: string) => URL;
  resolve: (from: string, to: string) => string;
  format: (url: URL | { href?: string }) => string;
}

/**
 * Installs a non-deprecated WHATWG `URL` helper onto legacy `PIXI.utils.url` accessors
 * without triggering Pixi's deprecation warnings or Node `url.parse` notices.
 */
export function installPixiUrlPatch(target?: Record<string, unknown>): PixiUrlShim {
  const shim: PixiUrlShim = {
    parse: (raw: string) => {
      try {
        return new URL(raw);
      } catch {
        return new URL(raw, 'https://local.invalid/');
      }
    },
    resolve: (from: string, to: string) => resolveModelUrl(from, to),
    format: (parsed: URL | { href?: string }) => parsed?.href ?? String(parsed),
  };

  const utilsObj =
    target ??
    ((globalThis as { PIXI?: { utils?: Record<string, unknown> } }).PIXI?.utils as
      | Record<string, unknown>
      | undefined);

  if (utilsObj && typeof utilsObj === 'object') {
    const descriptor = Object.getOwnPropertyDescriptor(utilsObj, 'url');
    if (!descriptor || descriptor.configurable) {
      try {
        Object.defineProperty(utilsObj, 'url', {
          value: shim,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      } catch {
        // Ignore frozen/sealed targets in hardened environments.
      }
    }
  }
  return shim;
}
