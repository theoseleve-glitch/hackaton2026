import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Tiny in-app localization (EN/FR). No framework, no central catalog — each
 * call site co-locates its own translations via `t({ en, fr })`, so screens
 * translate independently. French register is "tu" (racer-to-racer).
 *
 * The current language is a module-level store exposed through
 * useSyncExternalStore, persisted under its own key (decoupled from the
 * per-call useAccount hook). Call `initLang()` once at app boot.
 */

export const LANGS = ["en", "fr"] as const;
export type Lang = (typeof LANGS)[number];
export type Phrase = { en: string; fr: string };

const KEY = "racelab:lang";
let current: Lang = "en";
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Set + persist the active language and re-render every subscriber. */
export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  AsyncStorage.setItem(KEY, lang).catch(() => {});
  emit();
}

/** Non-reactive read — for module scope / outside React. Prefer useT in components. */
export function getLang(): Lang {
  return current;
}

let inited = false;
/** Load the persisted language once at boot. Safe to call repeatedly. */
export function initLang(): void {
  if (inited) return;
  inited = true;
  AsyncStorage.getItem(KEY)
    .then((v) => {
      if ((v === "en" || v === "fr") && v !== current) {
        current = v;
        emit();
      }
    })
    .catch(() => {});
}

/** Reactive current language (re-renders on change). */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang);
}

/**
 * Reactive translator hook. `const t = useT(); ... {t({ en: "Run", fr: "Session" })}`.
 * Falls back to English if a French string is ever missing.
 */
export function useT(): (p: Phrase) => string {
  const lang = useLang();
  return (p) => p[lang] ?? p.en;
}

/** Non-reactive translate — for strings built outside a component render. */
export function tr(p: Phrase): string {
  return p[current] ?? p.en;
}
