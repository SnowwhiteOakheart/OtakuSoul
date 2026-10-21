/** Registry entries can carry their list texts in other languages (`translations.<lang>.<field>`). */
interface WithTranslations {
  translations?: Record<string, Record<string, string>>;
}

/**
 * The text of `field` in `lang`, else the English one, else the registry's own text. The data
 * repository writes its own texts in German, so German keeps them.
 */
export const registryText = (entry: WithTranslations, field: string, own: string, lang: string): string =>
  entry.translations?.[lang]?.[field] || (lang !== 'de' ? entry.translations?.en?.[field] : undefined) || own;
