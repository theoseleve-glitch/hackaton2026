import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "racelab:account";

export const LEVELS = ["beginner", "club", "regional", "pro"] as const;
export type ExperienceLevel = (typeof LEVELS)[number];

export const LANGS = ["en", "fr"] as const;
export type Lang = (typeof LANGS)[number];
export const UNITS = ["metric", "imperial"] as const;
export type Units = (typeof UNITS)[number];

export interface Prefs {
  lang?: Lang;
  units?: Units;
}

export interface Account {
  email?: string;
  age?: number;
  country?: string;
  level?: ExperienceLevel;
  trial_started_at?: string;
  onboarded: boolean;
  prefs?: Prefs;
  // social identity (D32+): the @handle flows into shared-setup provenance
  handle?: string;
  display_name?: string;
  avatar_uri?: string;
  home_track?: string;
  classes?: string[];
}

export const PRICING = { monthly_eur: 9.99, annual_eur: 99.99, trial_days: 15 } as const;

const DEFAULT_ACCOUNT: Account = { onboarded: false };

const MS_PER_DAY = 86_400_000;

/** Days of trial remaining at `nowIso`. Full allowance before the trial has
 *  started, floored at 0 once it has run out. */
export function trialDaysLeft(account: Account, nowIso: string): number {
  if (!account.trial_started_at) return PRICING.trial_days;
  const start = Date.parse(account.trial_started_at);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(start) || !Number.isFinite(now)) return 0;
  const elapsedDays = Math.floor((now - start) / MS_PER_DAY);
  return Math.min(PRICING.trial_days, Math.max(0, PRICING.trial_days - elapsedDays));
}

function asLevel(value: unknown): ExperienceLevel | undefined {
  return LEVELS.includes(value as ExperienceLevel) ? (value as ExperienceLevel) : undefined;
}

function asPrefs(value: unknown): Prefs | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const o = value as Record<string, unknown>;
  const lang = LANGS.includes(o.lang as Lang) ? (o.lang as Lang) : undefined;
  const units = UNITS.includes(o.units as Units) ? (o.units as Units) : undefined;
  return lang === undefined && units === undefined ? undefined : { lang, units };
}

function parseAccount(raw: string): { ok: true; account: Account } | { ok: false; reason: string } {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "bad-json" };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, reason: "not-an-object" };
  }
  const o = data as Record<string, unknown>;
  if (typeof o.onboarded !== "boolean") return { ok: false, reason: "missing-onboarded" };
  return {
    ok: true,
    account: {
      onboarded: o.onboarded,
      email: typeof o.email === "string" ? o.email : undefined,
      age: typeof o.age === "number" && Number.isFinite(o.age) ? o.age : undefined,
      country: typeof o.country === "string" ? o.country : undefined,
      level: asLevel(o.level),
      trial_started_at: typeof o.trial_started_at === "string" ? o.trial_started_at : undefined,
      prefs: asPrefs(o.prefs),
      handle: typeof o.handle === "string" ? o.handle : undefined,
      display_name: typeof o.display_name === "string" ? o.display_name : undefined,
      avatar_uri: typeof o.avatar_uri === "string" ? o.avatar_uri : undefined,
      home_track: typeof o.home_track === "string" ? o.home_track : undefined,
      classes: Array.isArray(o.classes) ? o.classes.filter((c): c is string => typeof c === "string") : undefined,
    },
  };
}

/**
 * Account state with AsyncStorage persistence — same never-wipe discipline as
 * logstore.ts: unreadable blobs are stashed under a :backup key before
 * starting fresh, and saves happen on every change.
 */
export function useAccount(): {
  account: Account | null;
  setAccount: (patch: Partial<Account>) => void;
  completeOnboarding: (
    profile: { email?: string; age?: number; country?: string; level?: string },
    nowIso: string,
  ) => void;
} {
  const [account, setAccountState] = useState<Account | null>(null);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then(async (raw) => {
        if (cancelled) return;
        if (raw) {
          const result = parseAccount(raw);
          if (result.ok) {
            setAccountState(result.account);
            return;
          }
          await AsyncStorage.setItem(`${STORAGE_KEY}:backup:${result.reason}`, raw).catch(() => {});
        }
        setAccountState(DEFAULT_ACCOUNT);
      })
      .catch(() => {
        if (!cancelled) setAccountState(DEFAULT_ACCOUNT);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (account) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(account)).catch(() => {
        // storage full/unavailable: keep running in-memory rather than crash
      });
    }
  }, [account]);

  const setAccount = useCallback((patch: Partial<Account>) => {
    setAccountState((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const completeOnboarding = useCallback(
    (
      profile: { email?: string; age?: number; country?: string; level?: string },
      nowIso: string,
    ) => {
      setAccountState((prev) => ({
        ...(prev ?? DEFAULT_ACCOUNT),
        ...(profile.email !== undefined ? { email: profile.email } : {}),
        ...(profile.age !== undefined ? { age: profile.age } : {}),
        ...(profile.country !== undefined ? { country: profile.country } : {}),
        ...(asLevel(profile.level) !== undefined ? { level: asLevel(profile.level) } : {}),
        onboarded: true,
        trial_started_at: nowIso,
      }));
    },
    [],
  );

  return { account, setAccount, completeOnboarding };
}
