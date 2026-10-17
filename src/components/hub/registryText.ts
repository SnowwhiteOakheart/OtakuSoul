/** Registry entries can carry their list texts in other languages (`translations.<lang>.<field>`). */
interface WithTranslations {
  translations?: Record<string, Record<string, string>>;
}

/** The text of `field` in `lang`, else the registry's own text. */
export const registryText = (entry: WithTranslations, field: string, own: string, lang: string): string =>
  entry.translations?.[lang]?.[field] || own;
