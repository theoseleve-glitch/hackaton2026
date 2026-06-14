import fr from '../content/fr.json';
import en from '../content/en.json';

export type Locale = 'fr' | 'en';
const DICTS: Record<Locale, unknown> = { fr, en };
const KEY = 'bloop_locale';

export function detectLocale(...args: [navLang?: string | undefined]): Locale {
  // When called with no arguments at all, fall back to the browser language.
  // An explicitly-passed value (including `undefined`) is used verbatim — a JS
  // default parameter can't distinguish "omitted" from "explicit undefined".
  const navLang =
    args.length > 0
      ? args[0]
      : typeof navigator !== 'undefined'
        ? navigator.language
        : undefined;
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
  if (saved === 'fr' || saved === 'en') return saved;
  return navLang?.toLowerCase().startsWith('en') ? 'en' : 'fr';
}

export function t(key: string, locale: Locale): string {
  const lookup = (dict: unknown) =>
    key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), dict);
  const v = lookup(DICTS[locale]) ?? lookup(DICTS.fr);
  return typeof v === 'string' ? v : key;
}
