import deFile from '../../presets/locales/ui/de.json';
import enFile from '../../presets/locales/ui/en.json';
import ruFile from '../../presets/locales/ui/ru.json';
import type { TranslationDictionary } from '../i18n/types';

/** The shipped interface languages without `__meta`, as the app loads them. */
const texts = ({ __meta: _meta, ...dict }: Record<string, unknown>) => dict as TranslationDictionary;

export const de = texts(deFile);
export const en = texts(enFile);
export const ru = texts(ruFile);
