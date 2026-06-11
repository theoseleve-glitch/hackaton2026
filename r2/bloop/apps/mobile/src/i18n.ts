// PURE module — no react-native imports.

export type Lang = 'fr' | 'en';

export interface Bilingual {
  fr: string;
  en: string;
}

/** Device locale -> content language. Hermes ships Intl on Android/iOS. */
export function deviceLang(): Lang {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? '';
    return locale.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  } catch {
    return 'en';
  }
}

export function pickL(t: Bilingual | undefined | null, lang: Lang): string {
  if (t === undefined || t === null) return '';
  return lang === 'fr' ? t.fr : t.en;
}
