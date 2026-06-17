/**
 * Phase 2A never-wipe + idempotency smoke test (Node/tsx).
 *
 * Runs the EXACT construction + migration path the RepoProvider uses:
 *   openKvStorage(mockKv, "racelab-store") -> openRepos -> runLegacyMigrationOnce
 *
 * against an in-memory KeyValueDriver mock seeded with realistic Theo legacy
 * blobs. The mock RECORDS every removeItem call so we can prove the migration
 * never deletes a single racelab:* key (non-destructive / never-wipe).
 *
 * Asserts:
 *   (a) repos.cars/tracks/runs/outcomes.getAll() return the lifted entities
 *   (b) ZERO removeItem on any racelab:* key
 *   (c) every original legacy key (incl. the :backup: key) still present
 *   (d) a SECOND run writes nothing new — guard set + outbox next_seq unchanged
 *
 * Run:  npx tsx apps/mobile/src/storage/test-migration.ts   (cwd = RaceLab/)
 */

import {
  openKvStorage,
  openRepos,
  type KeyValueDriver,
} from "../../../../packages/storage/src";
import { MIGRATION_GUARD, runLegacyMigrationOnce } from "./RepoProvider";

// ── tiny assert harness ────────────────────────────────────────────────────
let failures = 0;
function check(label: string, cond: boolean): void {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}`);
  }
}

// ── in-memory KeyValueDriver mock that records every removeItem ─────────────
function makeMockKv(seed: Record<string, string>): {
  kv: KeyValueDriver;
  removed: string[];
  store: Map<string, string>;
} {
  const store = new Map<string, string>(Object.entries(seed));
  const removed: string[] = [];
  const kv: KeyValueDriver = {
    async getItem(key) {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    async setItem(key, value) {
      store.set(key, value);
    },
    async removeItem(key) {
      removed.push(key); // record EVERY removeItem — the never-wipe tripwire
      store.delete(key);
    },
    async getAllKeys() {
      return [...store.keys()];
    },
  };
  return { kv, removed, store };
}

// ── realistic Theo legacy blobs (shapes verified against migrate.ts) ────────
// sheets blob: { format:1, state:{ template_id } } — learns the chassis/template
// for the synthesized Car (excluding :backup: keys).
const SHEETS_KEY = "racelab:sheets:kyosho-inferno-mp11";
const sheetsBlob = JSON.stringify({
  format: 1,
  state: { template_id: "kyosho-inferno-mp11", values: {} },
});

// a :backup: sheets key — migrate.ts MUST NOT read it (it filters :backup:),
// and the migration MUST NOT remove it. Intentionally corrupt to also prove a
// corrupt backup blob simply survives untouched.
const BACKUP_KEY = "racelab:sheets:kyosho-inferno-mp11:backup:bad";
const backupBlob = "{ this is not valid json at all ::: ";

// car-profile blob — not read by migrate.ts; must survive verbatim.
const CAR_PROFILE_KEY = "racelab:car-profile";
const carProfileBlob = JSON.stringify({ id: "car-legacy-mp11", template_id: "kyosho-inferno-mp11" });

// sessions blob: { format:1, state:{ sessions:[ LegacySession ] } }.
// One valid session with one valid run + one valid outcome (all enum/ISO/string
// guards in migrate.ts satisfied) so the lift actually produces entities.
const SESSIONS_KEY = "racelab:sessions:v1";
const sessionsBlob = JSON.stringify({
  format: 1,
  state: {
    sessions: [
      {
        id: "ss-legacy-0001",
        started_at: "2026-05-01T10:00:00.000Z",
        track: { name: "Local Clay Track", surface: "clay", grip: "medium", conditions: ["dusty"] },
        runs: [
          {
            id: "run-legacy-0001",
            at: "2026-05-01T10:15:00.000Z",
            type: "practice",
            setup_version_id: "sv-legacy-1",
            setup_name: "Baseline",
            track: { name: "Local Clay Track", surface: "clay", grip: "medium", conditions: ["dusty"] },
            best_lap_s: 21.4,
            lap_count: 12,
            feedback_text: "loose on power",
          },
        ],
        outcomes: [
          {
            id: "oc-legacy-0001",
            at: "2026-05-01T10:30:00.000Z",
            setting: "front oil",
            change: "500 -> 450 cst",
            citations: ["kb:rule:front-oil"],
            outcome: "better",
            setup_version_id: "sv-legacy-1",
            setup_name: "Baseline",
            track: { name: "Local Clay Track", surface: "clay", grip: "medium", conditions: ["dusty"] },
            note: "more steering mid-corner",
          },
        ],
      },
    ],
  },
});

const SEED: Record<string, string> = {
  [SHEETS_KEY]: sheetsBlob,
  [BACKUP_KEY]: backupBlob,
  [CAR_PROFILE_KEY]: carProfileBlob,
  [SESSIONS_KEY]: sessionsBlob,
};
const ORIGINAL_KEYS = Object.keys(SEED);

async function main(): Promise<void> {
  const { kv, removed, store } = makeMockKv(SEED);

  // ── construction (same path as RepoProvider) ──────────────────────────────
  const opened = await openKvStorage(kv, "racelab-store");
  if (!opened.ok) throw new Error(`openKvStorage failed: ${opened.reason}`);
  const r = await openRepos(opened.storage);
  if (!r.ok) throw new Error(`openRepos failed: ${r.reason}`);
  const repos = r.repos;

  // ── first migration run ───────────────────────────────────────────────────
  await runLegacyMigrationOnce(kv, repos);

  console.log("\n[a] repos return lifted entities");
  const cars = await repos.cars.getAll();
  const tracks = await repos.tracks.getAll();
  const runs = await repos.runs.getAll();
  const outcomes = await repos.outcomes.getAll();
  check("cars.getAll ok", cars.ok);
  check("tracks.getAll ok", tracks.ok);
  check("runs.getAll ok", runs.ok);
  check("outcomes.getAll ok", outcomes.ok);
  const carCount = cars.ok ? cars.values.length : -1;
  const trackCount = tracks.ok ? tracks.values.length : -1;
  const runCount = runs.ok ? runs.values.length : -1;
  const outcomeCount = outcomes.ok ? outcomes.values.length : -1;
  console.log(`     lifted: cars=${carCount} tracks=${trackCount} runs=${runCount} outcomes=${outcomeCount}`);
  check("1 car synthesized (MP11 chassis)", carCount === 1);
  check("1 track lifted", trackCount === 1);
  check("1 run lifted", runCount === 1);
  check("1 outcome lifted", outcomeCount === 1);
  if (cars.ok && carCount === 1) {
    const c = cars.values[0] as { name?: string };
    check("car name references the legacy chassis", typeof c.name === "string" && c.name.includes("kyosho-inferno-mp11"));
  }

  console.log("\n[b] ZERO removeItem on any racelab:* key (never-wipe)");
  const racelabRemovals = removed.filter((k) => k.startsWith("racelab:"));
  check(`no removeItem on racelab:* keys (saw ${removed.length} total removals)`, racelabRemovals.length === 0);
  if (racelabRemovals.length > 0) console.error(`     removed racelab keys: ${racelabRemovals.join(", ")}`);

  console.log("\n[c] every original legacy key (incl. :backup:) still present");
  for (const key of ORIGINAL_KEYS) {
    check(`present: ${key}`, store.has(key));
  }
  check(":backup: blob byte-identical (untouched)", store.get(BACKUP_KEY) === backupBlob);
  check("car-profile blob byte-identical (untouched)", store.get(CAR_PROFILE_KEY) === carProfileBlob);
  check("sheets blob byte-identical (untouched)", store.get(SHEETS_KEY) === sheetsBlob);
  check("sessions blob byte-identical (untouched)", store.get(SESSIONS_KEY) === sessionsBlob);

  console.log("\n[d] second run writes nothing new (guard + idempotency)");
  const guardAfterFirst = await kv.getItem(MIGRATION_GUARD);
  check("migration guard set after a successful run", guardAfterFirst !== null);
  const seqBefore = repos.outbox.state().next_seq;
  const removalsBefore = removed.length;

  await runLegacyMigrationOnce(kv, repos);

  const seqAfter = repos.outbox.state().next_seq;
  check(`outbox next_seq unchanged (${seqBefore} -> ${seqAfter})`, seqBefore === seqAfter);
  check("no new removals on the second run", removed.length === removalsBefore);

  // also prove the guard makes the second pass a true no-op via a fresh repos
  // instance (cold-reboot simulation over the SAME kv): re-open and re-run.
  const opened2 = await openKvStorage(kv, "racelab-store");
  if (!opened2.ok) throw new Error(`re-open failed: ${opened2.reason}`);
  const r2 = await openRepos(opened2.storage);
  if (!r2.ok) throw new Error(`re-open repos failed: ${r2.reason}`);
  const seqRebootBefore = r2.repos.outbox.state().next_seq;
  await runLegacyMigrationOnce(kv, r2.repos);
  const seqRebootAfter = r2.repos.outbox.state().next_seq;
  check(
    `cold-reboot re-run writes nothing (next_seq ${seqRebootBefore} -> ${seqRebootAfter})`,
    seqRebootBefore === seqRebootAfter,
  );
  const carsReboot = await r2.repos.cars.getAll();
  const runsReboot = await r2.repos.runs.getAll();
  check(
    "entities survive cold reboot (no duplication)",
    carsReboot.ok && carsReboot.values.length === 1 && runsReboot.ok && runsReboot.values.length === 1,
  );

  // ── outbox-accrual sanity: one entry per applied entity (cars+tracks+runs+outcomes) ─
  console.log("\n[*] outbox accrual sanity");
  const entries = repos.outbox.entriesAfter(0);
  const expected = carCount + trackCount + runCount + outcomeCount;
  check(`outbox holds one entry per applied entity (${entries.length} === ${expected})`, entries.length === expected);

  // ── summary ───────────────────────────────────────────────────────────────
  console.log("");
  if (failures === 0) {
    console.log("ALL CHECKS PASSED — non-destructive + lifted + idempotent.");
    process.exit(0);
  } else {
    console.error(`${failures} CHECK(S) FAILED.`);
    process.exit(1);
  }
}

void main().catch((e) => {
  console.error("test threw:", e);
  process.exit(1);
});
