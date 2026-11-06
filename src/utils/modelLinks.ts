/**
 * Official download pages for a card's avatar models (`extensions.otakusoul_model_links`, see
 * `characters.rs`). Cards never carry such models; the user fetches them from the rights holder.
 * Only `https://` pages of a known model kind are offered: cards come from other people.
 */
export const MODEL_LINKS_KEY = 'otakusoul_model_links';

export const MODEL_LINK_KINDS = ['vrm', 'live2d', 'inochi2d'] as const;
export type ModelLinkKind = (typeof MODEL_LINK_KINDS)[number];

export interface ModelLink {
  kind: ModelLinkKind;
  page_url: string;
  name?: string;
  license?: string;
}

/** The host of an `https://` page with no spaces, else null (= not offered). */
export const safePageHost = (url: string): string | null => {
  if (!/^https:\/\/[^/\s]/.test(url) || /\s/.test(url)) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname ? parsed.hostname : null;
  } catch {
    return null;
  }
};

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

/** The links a card offers, without entries the app would not open. */
export const readModelLinks = (extensions: Record<string, unknown> | null | undefined): ModelLink[] => {
  const raw = extensions?.[MODEL_LINKS_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): ModelLink[] => {
    if (!entry || typeof entry !== 'object') return [];
    const { kind, page_url, name, license } = entry as Record<string, unknown>;
    const url = text(page_url);
    if (!MODEL_LINK_KINDS.includes(kind as ModelLinkKind) || !url || !safePageHost(url)) return [];
    return [{ kind: kind as ModelLinkKind, page_url: url, name: text(name), license: text(license) }];
  });
};

/** Links as the editor saves them: empty rows dropped, `undefined` when none are left. */
export const cleanModelLinks = (links: ModelLink[]): ModelLink[] | undefined => {
  const kept = links
    .map((link) => ({ kind: link.kind, page_url: link.page_url.trim(), name: text(link.name), license: text(link.license) }))
    .filter((link) => link.page_url);
  return kept.length ? kept : undefined;
};
