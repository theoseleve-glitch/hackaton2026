# Phase 2 Spec — stores -> storage repos + outbox (never-wipe preserved)

> 3-agent investigation (William storage API, theo stores+consumers, synthesis), 2026-06-17. Companion to 2026-06-17-backend-migration.md. KV-adapter path (no expo-sqlite). Split A (additive, safe) / B (cutover). Review gate before Phase B.

I have all the load-bearing facts. Here is the concrete PHASE-2 SPEC.

---

# PHASE-2 SPEC — Migrate Theo's stores onto William's storage repos + outbox

**Live worktree:** `C:/Users/Admin/Documents/wt-theo-racelab` (branch `theo/racelab`). All paths below are relative to `RaceLab/`.

**Verified ground truth (drives the whole spec):**
- `expo-sqlite` is **NOT installed** (`apps/mobile/package.json` deps confirmed — no entry). `@react-native-async-storage/async-storage@2.2.0` **is** present.
- `KeyValueDriver` (`packages/storage/src/interfaces.ts`) is exactly `{ getItem, setItem, removeItem, getAllKeys }` — AsyncStorage 2.2.0 implements all four with matching signatures. **=> Default cutover path is the KV adapter (`openKvStorage`), not SQLite.** SQLite is optional/deferred (Decision #2 below).
- Package names: `racelab-storage`, `racelab-schema`. Stores import via deep relative paths today (`../../../packages/...`).
- `LEGACY_SHEETS_PREFIX = "racelab:sheets:"`, `LEGACY_SESSIONS_PREFIX = "racelab:sessions"` (migrate.ts:54-55).
- Theo's MP11 seed keys (garagestore.ts:11-13): `racelab:sheets:kyosho-inferno-mp11`, `racelab:car-profile`, fixed id `car-legacy-mp11` (exported `LEGACY_CAR_ID`).
- Schema accessor for timing is `effectiveTiming(run): TimingStats | null` (runs.ts:524). Theo's `RunEntry.result` becomes `RunEntry.timing = { kind:"summary", result }`. There is a ready Theo bridge: `liftTheoRunEntry(entry, ctx, rand)` (bridge.ts:240) and the sessions bridge `liftSessionsRun`/`liftSessionsOutcome`.

---

## 1. STORAGE CONSTRUCTION (App boot, executor → openRepos)

### Expo deps
- **No new install required for the default (KV) path.** Use the already-installed AsyncStorage as the `KeyValueDriver`.
- **FLAG:** `expo-sqlite` is **absent**. Only add it if Decision #2 chooses the SQLite adapter: `npx expo install expo-sqlite` (SDK 56 compatible), then use `expoSqliteExecutor(db)` + `openSqliteStorage`. Until then, **do not** import `packages/storage/src/expo-sqlite.ts` / `sqlite.ts` from app code — they'll fail to resolve `expo-sqlite`.

### Where it lives — new file `apps/mobile/src/storage/RepoProvider.tsx`
App.tsx today does **prop-drilling, no context provider** (App.tsx:68-74). We add a single React context that opens Repos once at boot and exposes it. This is the seam the rewritten hooks read from.

```tsx
// apps/mobile/src/storage/RepoProvider.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState } from "react";
import {
  openKvStorage, openRepos, migrateLegacyBlobs, applyMigration,
  type Repos, type KeyValueDriver,
} from "racelab-storage"; // (or "../../../packages/storage/src" until the alias lands)

const KV: KeyValueDriver = AsyncStorage; // shape-compatible: getItem/setItem/removeItem/getAllKeys
const MIGRATION_GUARD = "racelab:migration:v1:done"; // run-once guard (see §2)

type RepoCtx = { repos: Repos | null; ready: boolean; warnings: string[] };
const Ctx = createContext<RepoCtx>({ repos: null, ready: false, warnings: [] });

export function RepoProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<RepoCtx>({ repos: null, ready: false, warnings: [] });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const opened = await openKvStorage(KV, "racelab-store");
      if (!opened.ok) { if (!cancelled) setState({ repos: null, ready: true, warnings: [opened.reason] }); return; }
      const r = await openRepos(opened.storage);
      if (!r.ok) { if (!cancelled) setState({ repos: null, ready: true, warnings: [r.reason] }); return; }
      await runLegacyMigrationOnce(KV, r.repos); // §2 — idempotent, guarded
      if (!cancelled) setState({ repos: r.repos, ready: true, warnings: [...opened.warnings, ...r.warnings] });
    })();
    return () => { cancelled = true; };
  }, []);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useRepos(): Repos {
  const { repos } = useContext(Ctx);
  if (!repos) throw new Error("useRepos before RepoProvider ready — gate on useReposReady()");
  return repos;
}
export function useReposReady(): boolean { return useContext(Ctx).ready; }
```

Wrap the app in `App.tsx`: `<RepoProvider><AppInner/></RepoProvider>`, and gate the existing render on `useReposReady()` (show the existing splash until true). The `openKvStorage` open performs **interrupt recovery** (undo-log rollback) for free.

---

## 2. LEGACY MIGRATION STEP (one-time, non-destructive, idempotent)

New helper in the same file (`apps/mobile/src/storage/RepoProvider.tsx`):

```ts
async function runLegacyMigrationOnce(kv: KeyValueDriver, repos: Repos) {
  if (await kv.getItem(MIGRATION_GUARD)) return;          // run-once guard
  const now = new Date().toISOString();
  const lift = await migrateLegacyBlobs(kv);              // reads racelab:sheets:* + racelab:sessions*
  if (!lift.ok) return;                                   // leave guard UNSET -> retry next boot (non-destructive)
  const applied = await applyMigration(repos, lift.lifted, now);
  if (!applied.ok) return;                                // partial apply is safe + resumable; do NOT set guard
  await kv.setItem(MIGRATION_GUARD, JSON.stringify({ at: now, report: lift.report, applied: applied.applied }));
}
```

**Keys read by `migrateLegacyBlobs(kv)`** (migrate.ts):
- All `racelab:sheets:<chassis>` (prefix `LEGACY_SHEETS_PREFIX`, **excluding** `:backup:` keys) — incl. Theo's `racelab:sheets:kyosho-inferno-mp11`. First sheets blob → synthesizes the **Car** (`template_id` from the blob; MP11 → the `kyosho-inferno-mp11` template).
- `racelab:sessions*` (prefix `LEGACY_SESSIONS_PREFIX`, excluding `:backup:`) — each `LegacySession` validated by `legacySessionBad`; runs/outcomes inside lifted by `liftSessionsRun`/`liftSessionsOutcome`.

**Bridge mapping theo blobs → schema entities:**
- `applyMigration(repos, lifted, now)` iterates `lifted.cars/tracks/runs/outcomes` and calls `repo.get(id)` → only `repo.put(value, now)` **if absent** (null). Existing **or unreadable/quarantined** ids are **skipped** → never-overwrite.
- `bridge.liftSessionsRun` maps a sessions run's `best_lap_s/lap_count/feedback_text` + `track{name,surface,grip,conditions[]}` → `RunEntry` with `timing:{kind:"summary",result}`, `conditionsFromTags(track)` for `RunConditions`, deterministic id via `makeRun(input, run.at, rand)`.
- `bridge.liftSessionsOutcome` maps `{setting,change,citations[],outcome,...}` → `OutcomeRecord` via `makeOutcomeRecord`.
- (For Theo's *current* logbook blobs that are already in his `RunEntry.result` shape rather than the sessions shape, the symmetric `liftTheoRunEntry(entry, ctx, rand)` exists — but the canonical legacy blob keys here are sessions/sheets, so the migrate.ts path is the one the guard drives.)

**MP11 seed preserved:** The synthesized Car gets the migrate.ts deterministic id (seeded by chassis), and Theo's `useGarage` legacy path (id `car-legacy-mp11`, MP11 template, sheets copied to `racelab:sheets:car:car-legacy-mp11`) still runs in additive Phase A. After cutover the MP11 car is whichever the lift minted; **keep `LEGACY_CAR_ID` referenced** for any run with `car_id` undefined (Theo's "undefined = legacy car" convention).

**Never-wipe / quarantine preserved:** old AsyncStorage blobs are **read, never removed** (migrate.ts never calls `removeItem`). Corrupt sessions/runs → reported in `lift.report.skipped`, blob stays. On `repo.get`, any doc that fails schema parse is stashed to `repos.quarantine` with original bytes — the cell is not overwritten.

**Idempotency:** (a) `MIGRATION_GUARD` only set after a *successful* full apply; (b) even without the guard, `applyMigration` is byte-idempotent because ids are seeded (`seededRand`) and existing ids are skipped. A crash mid-apply re-applies only the missing entities next boot.

---

## 3. STORE-HOOK REWRITE (over Repos; keep signatures)

General rule: replace the `AsyncStorage.getItem + useState + update(fn)` pattern with `repo.getAll/get/put`. Keep each hook's **return shape** identical so consumers compile, but the **element shape changes** where noted. Each hook calls `useRepos()` and seeds local state from `repo.getAll()` in a `useEffect`; `update`/mutators call `repo.put(...)` then refresh local state.

### `useGarage()` — `garagestore.ts`
- Signature **unchanged**: `{ garage: GarageState|null, updateGarage(fn) }`. Internally back `GarageState.cars` with `repos.cars.getAll()`.
- **SHAPE CHANGE:** `CarEntity` → schema **`Car`** (cars.ts:38). Same `id/name/template_id/brand/model`; class fields move under schema's class-label shape. `createCar` calls `repos.cars.put(car, now)`. `deleteCar` → `repos.cars.remove(id, now)`.
- `updateGarage(fn)` keeps the functional-setState ergonomics but on commit diffs the returned `cars[]` against current and issues `put`/`remove` per changed car.

### `useLogbook()` — `logstore.ts`
- Signature **unchanged**: `{ logbook: LogbookState|null, updateLogbook(fn) }`, backed by `repos.runs.getAll()` (+ `repos.outcomes` for rated changes).
- **SHAPE CHANGE (the big one):** `RunEntry.result` → **`RunEntry.timing`** (`{kind:"summary",result}`). `addRun` builds via `makeRun(input, now, rand)` so `result` lands under `timing`. `rateRun(id,outcome)` → load run, set `run.outcome`, `repos.runs.put`. Lap-record auto-maintain stays but reads `effectiveTiming(run)?.best_lap_s`.

### `useTracks()` — `trackstore.ts`
- Signature **unchanged**: `{ tracks: TracksState|null, updateTracks(fn) }`, backed by `repos.tracks.getAll()`.
- **SHAPE CHANGE:** `TrackEntity` → schema **`Track`**. `addTrack/updateTrack` → `repos.tracks.put(track, now)`; `deleteTrack` → `repos.tracks.remove(id, now)`. `upsertRecord` mutates the Track then `put`s.

### `useReports()` — `reportstore.ts`
- Signature **unchanged**: `{ reports: ReportsState|null, addReport(...), deleteReport(id) }`, backed by `repos.reports` (`EntityRepo<ReportDoc>`).
- **SHAPE CHANGE:** `SavedReport` → schema **`ReportDoc`** (parsed via `parseReport`). `addReport` mints id+`created_at`, then `repos.reports.put(doc, now)`; `deleteReport` → `repos.reports.remove(id, now)`. **Upgrade win:** reportstore today has **no never-wipe discipline** (corrupt → `{reports:[]}`); moving to a repo gives it parse-on-read + quarantine for free.

> `useCarSheets`/`loadCarSheets` (`store.ts`) and `useAccount`/`useCandidacy`/`useFollows` are **out of scope for this phase** unless Decision #4 says otherwise — sheets stay AsyncStorage-backed (no schema sheets repo), and `profile`/`account` singletons can move in a follow-up. Keep them as-is so the cascade stays bounded.

---

## 4. CONSUMER CASCADE (ordered, bite-sized; driven by `result → timing`)

Every read of `run.result.*` becomes `effectiveTiming(run)?.*`. Ordered smallest blast-radius first:

1. **CompareScreen** (`src/screens/CompareScreen.tsx`) — read-only. `compareRuns()` internals reading `run.result.best_lap_s/avg_lap_s` → `effectiveTiming(run)`. Lowest risk; do first to prove the accessor.
2. **TracksScreen** (`src/screens/TracksScreen.tsx`, ~lines 102-107) — `run.track.records` best-lap render: TrackEntity→Track field check only; minimal.
3. **RunsScreen** (`src/screens/RunsScreen.tsx`) — biggest surface:
   - Reads (lines 130, 288): `run.result.best_lap_s/avg_lap_s/laps_list/position` → `effectiveTiming(run)?.best_lap_s/avg_lap_s`, position via `run.timing.kind==="summary" && run.timing.result.position`.
   - Writes: `addRun` (108) now produces `timing`; `rateRun` (386) writes via `repos.runs`; `upsertRecord` (113) reads `effectiveTiming`.
   - The setup-snapshot `AsyncStorage.setItem(sheetsKeyForCar...)` (525) stays (sheets out of scope).
4. **GarageScreen** (`src/screens/GarageScreen.tsx`) — `sheetProfile(car)`/`carStatus(logbook)` against `Car` shape; `deleteCar` also `AsyncStorage.removeItem(sheetsKeyForCar(id))` stays. No timing reads.
5. **EngineerHubScreen** (`src/screens/EngineerHubScreen.tsx`) — `run.result.best_lap_s/avg_lap_s/laps_list` (133-135,170) → `effectiveTiming`; `run.feedback.tags` (135) and `run.outcome` (136) unchanged. **★ UNLOCKS** the deferred **engine william-inputs**: with runs as schema `RunEntry` + `OutcomeRecord` available from `repos.outcomes`, the engineer bundle can feed the schema-shaped engine hook (the part that was deferred in Engine Task B). Also the **logbook bundle stamping** — a saved report's `run_ids` now reference repo ids that carry outbox provenance.
6. **App.tsx** — replace the 4 hooks' prop sources (68-71) (they keep the same names/signatures, so prop-drilling lines 213-286 are untouched); add `<RepoProvider>` + ready gate.

★ Flagged unlock items: **EngineerHubScreen** (engine william-inputs + logbook bundle stamping) is the screen that turns the deferred engine wiring on once it reads schema `timing`/`OutcomeRecord`.

---

## 5. SAFE INCREMENT PLAN

### (A) ADDITIVE — land + verify first, both systems coexist
1. (If Decision #2 = SQLite) `npx expo install expo-sqlite`; else nothing to install.
2. Add `apps/mobile/src/storage/RepoProvider.tsx` (`openKvStorage(AsyncStorage,"racelab-store")` → `openRepos`).
3. Wrap `App.tsx` in `<RepoProvider>` + `useReposReady()` splash gate. **Do not rewrite any hook yet** — existing AsyncStorage stores still own the UI.
4. Run `runLegacyMigrationOnce` (guard `racelab:migration:v1:done`). Migration only **reads** old blobs and **writes new repo docs + outbox entries**; old stores keep working unchanged.
5. **Verify A:** cold-boot against real blobs → repos populate (`repos.cars/runs/tracks.getAll()` non-empty), outbox accrues, **zero `removeItem` on legacy keys**, all `racelab:*` and `*:backup:*` keys still present. Commit A. ("storage + non-destructive legacy migration" — safe, reversible, no UI change.)

### (B) CUTOVER — disruptive, after A is green
6. Rewrite `useGarage/useLogbook/useTracks/useReports` over Repos (§3), same signatures.
7. Edit consumers in the §4 order (Compare → Tracks → Runs → Garage → EngineerHub → App).
8. Flip EngineerHub to the schema engine inputs + bundle stamping.
9. Commit B once tsc + emulator pass.

---

## 6. VERIFICATION & RISKS

### Gates
- **Cold-boot-against-real-blobs no-wipe test:** seed an emulator/AsyncStorage with real `racelab:garage`, `racelab:logbook`, `racelab:tracks`, `racelab:sheets:kyosho-inferno-mp11`, `racelab:car-profile`, `racelab:sessions*`. Cold boot. Assert: (a) `getAllKeys()` still contains every original key + every `*:backup:*`; (b) repos `getAll()` returns the lifted entities; (c) `repos.quarantine.getAll()` holds anything corrupt, original cell intact; (d) second cold boot writes nothing new (guard + idempotent apply) — outbox `state().next_seq` unchanged.
- **Outbox-accrual check:** after migration, `repos.outbox.state().entries.length === cars+tracks+runs+outcomes` applied; `entriesAfter(0)` returns them in seq order; each mutation in B adds exactly one entry (no doc write without an outbox entry).
- **tsc gate:** `npx tsc --noEmit` in `apps/mobile` (TS ~6.0.3) — catches every missed `result→timing` site (the type error *is* the cascade checklist).
- **Emulator gate:** per CLAUDE.md, `racelab_pixel`@5558, Metro 8090, Expo Go SDK 56; **must launch scrcpy** to actually view. Smoke: log a run, rate it, generate an engineer report, kill mid-edit, reboot → nothing lost.

### Risks
- **R1 — expo-sqlite absent:** default to KV/AsyncStorage adapter. SQLite adds a native dep + rebuild; KV is sufficient and already shape-compatible. (**Decision #2**: KV vs SQLite adapter — recommend KV for this phase.)
- **R2 — double source of truth in Phase A:** old AsyncStorage stores AND repos both hold the data until B. Acceptable (additive), but writes in A don't reach repos — re-running migration after A-period writes would miss them. Mitigation: keep the A→B window short, or run a final migrate pass at the start of B (it's idempotent for unchanged ids; **Decision #3**: do we re-lift app-writes made during the A window, or accept that only pre-A data is migrated and post-A data is authored fresh in B?).
- **R3 — sheets & account left on AsyncStorage:** `loadCarSheets`/`useCarSheets` and `useAccount` stay legacy this phase. Engine setup-resolution still reads `racelab:sheets:car:*`. (**Decision #4**: migrate `profile`/`account` singletons + a sheets strategy now, or defer.)
- **R4 — `unknown_surface` rejects:** `liftSessionsRun`/`liftTheoRunEntry` reject runs whose free-string `surface` isn't in the `SURFACES` union; those land in `report.skipped`, blob preserved. Confirm Theo's surface vocab maps cleanly or extend `vocab.ts`.
- **R5 — id collision:** lifted Car id (seeded by chassis) ≠ Theo's `car-legacy-mp11`. Decide whether runs with `car_id` undefined re-point to the lifted MP11 car id or keep `LEGACY_CAR_ID` (part of **Decision #4**).

**Decisions needed before B:** #2 (KV vs SQLite — recommend KV), #3 (re-lift A-window writes vs author-fresh), #4 (account/profile/sheets scope + MP11 car-id reconciliation).