/**
 * RepoProvider — Phase 2A (ADDITIVE, non-destructive).
 *
 * Opens William's storage repos ONCE at boot over the already-installed
 * AsyncStorage (KV-adapter path; expo-sqlite is NOT installed) and runs a
 * one-time, guarded, NON-DESTRUCTIVE lift of the legacy AsyncStorage blobs
 * (racelab:sheets:* / racelab:sessions*) into schema entities + the outbox.
 *
 * This is purely the seam the rewritten hooks (Phase 2B) will read from. It
 * does NOT change any existing store, screen, or data flow: the legacy
 * AsyncStorage stores still own the UI. Mounting <RepoProvider> must leave the
 * app rendering and behaving EXACTLY as before — `ready` is reported on every
 * path (success AND failure) so the app never hangs on this provider.
 *
 * Construction path (mirrors the spec §1):
 *   openKvStorage(AsyncStorage-as-KeyValueDriver, "racelab-store")
 *     -> openRepos(storage)
 *     -> runLegacyMigrationOnce(kv, repos)   (idempotent, guarded — §2)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";
import {
  applyMigration,
  migrateLegacyBlobs,
  openKvStorage,
  openRepos,
} from "../../../../packages/storage/src";
import type { KeyValueDriver, Repos } from "../../../../packages/storage/src";

/**
 * AsyncStorage is structurally compatible with KeyValueDriver (getItem/setItem/
 * removeItem return matching Promise shapes and getAllKeys returns
 * Promise<readonly string[]>). We still wrap it in an explicit thin adapter
 * rather than casting: it pins the exact four-method surface the package needs,
 * drops AsyncStorage's extra optional callback params, and survives any future
 * AsyncStorage type drift.
 */
const KV: KeyValueDriver = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
  getAllKeys: () => AsyncStorage.getAllKeys(),
};

/** Run-once guard — only set after a fully successful lift+apply (see §2). */
export const MIGRATION_GUARD = "racelab:migration:v1:done";

/**
 * One-time, guarded, idempotent, NON-DESTRUCTIVE legacy migration.
 *
 * - Guarded by MIGRATION_GUARD: if already set, returns immediately.
 * - `migrateLegacyBlobs` only READS legacy blobs (never removes them).
 * - On ANY failure (lift or apply), the guard is left UNSET so the next boot
 *   safely retries. `applyMigration` skips ids that already exist, so a partial
 *   apply followed by a retry writes only what's missing (byte-idempotent).
 *
 * Exported so the never-wipe smoke test exercises the EXACT same path the
 * provider uses.
 */
export async function runLegacyMigrationOnce(kv: KeyValueDriver, repos: Repos): Promise<void> {
  if (await kv.getItem(MIGRATION_GUARD)) return; // run-once guard

  const now = new Date().toISOString();

  const lift = await migrateLegacyBlobs(kv); // reads racelab:sheets:* + racelab:sessions*
  if (!lift.ok) return; // leave guard UNSET -> retry next boot (non-destructive)

  const applied = await applyMigration(repos, lift.lifted, now);
  if (!applied.ok) return; // partial apply is safe + resumable; do NOT set guard

  // Only NOW, after a fully successful lift+apply, claim the guard.
  await kv.setItem(
    MIGRATION_GUARD,
    JSON.stringify({ at: now, report: lift.report, applied: applied.applied }),
  );
}

interface RepoCtx {
  repos: Repos | null;
  ready: boolean;
  warnings: readonly string[];
}

const Ctx = createContext<RepoCtx>({ repos: null, ready: false, warnings: [] });

export function RepoProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [state, setState] = useState<RepoCtx>({ repos: null, ready: false, warnings: [] });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const opened = await openKvStorage(KV, "racelab-store");
        if (!opened.ok) {
          if (!cancelled) setState({ repos: null, ready: true, warnings: [opened.reason] });
          return;
        }
        const r = await openRepos(opened.storage);
        if (!r.ok) {
          if (!cancelled) setState({ repos: null, ready: true, warnings: [...opened.warnings, r.reason] });
          return;
        }
        await runLegacyMigrationOnce(KV, r.repos); // §2 — idempotent, guarded
        if (!cancelled) {
          setState({ repos: r.repos, ready: true, warnings: [...opened.warnings, ...r.warnings] });
        }
      } catch (e) {
        // Never hang the app on a storage failure — report ready with a warning.
        if (!cancelled) setState({ repos: null, ready: true, warnings: [`repo_provider_threw:${String(e)}`] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

/** Repos accessor — throws if used before the provider is ready (gate on useReposReady). */
export function useRepos(): Repos {
  const { repos } = useContext(Ctx);
  if (!repos) throw new Error("useRepos before RepoProvider ready — gate on useReposReady()");
  return repos;
}

export function useReposReady(): boolean {
  return useContext(Ctx).ready;
}

export function useRepoWarnings(): readonly string[] {
  return useContext(Ctx).warnings;
}
