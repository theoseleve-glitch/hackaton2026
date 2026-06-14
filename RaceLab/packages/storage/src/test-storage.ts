/**
 * racelab-storage test suite — assertion style mirrors packages/schema:
 * plain checks, console output, exit(1) on any failure.
 *
 * Covers: per-adapter round-trips (memory / sqlite batch / sqlite emulated-
 * transaction / kv), repos with parse-on-read quarantine + outbox-on-every-
 * mutation + cursor + prune + reopen, KILL-MID-WRITE sweeps (fault-injecting
 * drivers that die after N operations; asserts a failed commit is never
 * partially visible after recovery on the next open) for both the sqlite-
 * transaction and kv-write-then-swap paths, corrupt outbox entries, and the
 * non-destructive + idempotent legacy-blob migration.
 */

import type { OutboxEntry, SessionId, WeatherObservation } from "../../schema/src/index";
import {
  initAccount,
  makeCar,
  makeDriverProfile,
  makeId,
  makeOutcomeRecord,
  makeRun,
  makeTrack,
  makeWeatherObservation,
  parseCar,
  parseOutcomeRecord,
  parseRunEntry,
  parseTrack,
  snapshotTrack,
} from "../../schema/src/index";
import type { KeyValueDriver, SqlExecutor, SqlStatement, SqlValue, StorageAdapter } from "./interfaces";
import { memoryKeyValueDriver, memoryStorage } from "./memory";
import { SQL, openSqliteStorage } from "./sqlite";
import { openKvStorage } from "./kv";
import { openRepos } from "./repos";
import type { Repos } from "./repos";
import { applyMigration, migrateLegacyBlobs, seededRand } from "./migrate";

let failures = 0;
let passed = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed++;
    console.log(`ok ${label}`);
  } else {
    failures++;
    console.log(`FAIL ${label}${detail ? ` -- ${detail}` : ""}`);
  }
}
function fatal(label: string): never {
  console.log(`FAIL FATAL: ${label}`);
  process.exit(1);
}
function js(v: unknown): string {
  return JSON.stringify(v);
}

const T0 = "2026-06-11T09:00:00.000Z";
const T1 = "2026-06-11T09:20:00.000Z";
const T2 = "2026-06-11T10:05:00.000Z";
const T3 = "2026-06-11T11:30:00.000Z";

// deterministic entropy for fixtures
const rand = seededRand("test-fixtures");

// ═══ fixtures (built through schema constructors — write-time guards apply) ══

const trackRes = makeTrack({ name: "Club Track", surface: "clay", indoor: false, is_public: false }, T0, rand);
if (!trackRes.ok) fatal("fixture track");
const TRACK = trackRes.track;
const SNAP = snapshotTrack(TRACK);

const carRes = makeCar({ name: "MP11", chassis_id: "custom", power_type: "nitro" }, T0, undefined, rand);
if (!carRes.ok) fatal("fixture car");
const CAR = carRes.car;
const car2Res = makeCar({ name: "MP11 backup", chassis_id: "custom", power_type: "nitro" }, T1, undefined, rand);
if (!car2Res.ok) fatal("fixture car2");
const CAR2 = car2Res.car;

const SS_ID: SessionId = makeId("ss", Date.parse(T0), rand);

const runRes = makeRun(
  {
    type: "practice",
    session_id: SS_ID,
    car_id: CAR.id,
    car_name: CAR.name,
    car_template_id: "kyosho-inferno-mp11",
    setup_version_id: "kyosho-inferno-mp11/kit",
    setup_name: "Kit",
    track: SNAP,
    conditions: { grip: "medium", dusty: true },
    timing: { kind: "summary", result: { best_lap_s: 34.2, laps: 18 } },
    feedback: { tags: [], text: "pushy mid corner" },
  },
  T1,
  rand,
);
if (!runRes.ok) fatal("fixture run");
const RUN = runRes.run;

const ocRes = makeOutcomeRecord(
  {
    session_id: SS_ID,
    car_id: CAR.id,
    car_name: CAR.name,
    setting: "front oil",
    change: "500 -> 450 cst",
    citations: ["HUDY p.12"],
    outcome: "better",
    setup_version_id: "kyosho-inferno-mp11/kit",
    setup_name: "Kit",
    track: SNAP,
    conditions: { grip: "medium" },
    run_id: RUN.id,
  },
  T2,
  rand,
);
if (!ocRes.ok) fatal("fixture outcome");
const OC = ocRes.record;

const wxRes = makeWeatherObservation({ observed_at: T1, source: "manual", air_temp_c: 24, humidity_pct: 55 });
if (!wxRes.ok) fatal("fixture weather");
const WX = wxRes.observation;

const profileRes = makeDriverProfile({ level: "club", age: 34, country: "fr" });
if (!profileRes.ok) fatal("fixture profile");
const PROFILE = profileRes.profile;
const ACCOUNT = initAccount();

// ═══ fake SQL engine (matches the exact statements sqlite.ts emits) ══════════

type Snapshot = { docs: Map<string, string>; log: Map<number, string>; meta: Map<string, string> };

class FakeSqlEngine {
  docs = new Map<string, string>(); // `${collection}\x00${id}` -> json
  log = new Map<number, string>();
  meta = new Map<string, string>();
  private snap: Snapshot | null = null;

  private copy(): Snapshot {
    return { docs: new Map(this.docs), log: new Map(this.log), meta: new Map(this.meta) };
  }
  private restore(s: Snapshot): void {
    this.docs = s.docs;
    this.log = s.log;
    this.meta = s.meta;
  }
  /** Real SQLite rolls an uncommitted transaction back when the process dies —
   *  call this when simulating "next open after a crash". */
  crashRecover(): void {
    if (this.snap !== null) {
      this.restore(this.snap);
      this.snap = null;
    }
  }
  /** all-or-nothing batch (the optional SqlExecutor.batch contract) */
  batchApply(stmts: readonly SqlStatement[]): void {
    const before = this.copy();
    try {
      for (const s of stmts) this.execute(s.sql, s.params ?? []);
    } catch (e) {
      this.restore(before);
      throw e;
    }
  }

  execute(sql: string, params: readonly SqlValue[] = []): { rows: Record<string, unknown>[] } {
    const key = (c: SqlValue, i: SqlValue): string => `${String(c)}\x00${String(i)}`;
    switch (sql) {
      case SQL.createDocs:
      case SQL.createLog:
      case SQL.createMeta:
        return { rows: [] };
      case SQL.begin:
        if (this.snap !== null) throw new Error("nested transaction");
        this.snap = this.copy();
        return { rows: [] };
      case SQL.commit:
        this.snap = null;
        return { rows: [] };
      case SQL.rollback:
        if (this.snap !== null) {
          this.restore(this.snap);
          this.snap = null;
        }
        return { rows: [] };
      case SQL.putDoc:
        this.docs.set(key(params[0], params[1]), String(params[2]));
        return { rows: [] };
      case SQL.getDoc: {
        const v = this.docs.get(key(params[0], params[1]));
        return { rows: v === undefined ? [] : [{ json: v }] };
      }
      case SQL.getAllDocs: {
        const prefix = `${String(params[0])}\x00`;
        const rows = [...this.docs.entries()]
          .filter(([k]) => k.startsWith(prefix))
          .map(([k, json]) => ({ id: k.slice(prefix.length), json }))
          .sort((a, b) => (a.id < b.id ? -1 : 1));
        return { rows };
      }
      case SQL.removeDoc:
        this.docs.delete(key(params[0], params[1]));
        return { rows: [] };
      case SQL.appendLog: {
        const seq = Number(params[0]);
        if (this.log.has(seq)) throw new Error("UNIQUE constraint failed: log.seq");
        this.log.set(seq, String(params[1]));
        return { rows: [] };
      }
      case SQL.seqExists: {
        const seq = Number(params[0]);
        return { rows: this.log.has(seq) ? [{ x: 1 }] : [] };
      }
      case SQL.readLogFrom: {
        const after = Number(params[0]);
        const rows = [...this.log.entries()]
          .filter(([seq]) => seq > after)
          .sort((a, b) => a[0] - b[0])
          .map(([seq, json]) => ({ seq, json }));
        return { rows };
      }
      case SQL.pruneLog: {
        const upto = Number(params[0]);
        for (const seq of [...this.log.keys()]) if (seq <= upto) this.log.delete(seq);
        return { rows: [] };
      }
      case SQL.maxLogSeq: {
        const seqs = [...this.log.keys()];
        return { rows: [{ max_seq: seqs.length === 0 ? null : Math.max(...seqs) }] };
      }
      case SQL.setMeta:
        this.meta.set(String(params[0]), String(params[1]));
        return { rows: [] };
      case SQL.getMeta: {
        const v = this.meta.get(String(params[0]));
        return { rows: v === undefined ? [] : [{ value: v }] };
      }
      default:
        throw new Error(`fake engine: unknown sql '${sql}'`);
    }
  }
}

function plainExecutor(engine: FakeSqlEngine): SqlExecutor {
  return { execute: async (sql, params) => engine.execute(sql, params ?? []) };
}
function batchExecutor(engine: FakeSqlEngine): SqlExecutor {
  return {
    execute: async (sql, params) => engine.execute(sql, params ?? []),
    batch: async (stmts) => engine.batchApply(stmts),
  };
}
/** Dies after `limit` successful operations and STAYS dead (process kill). */
function killableExecutor(engine: FakeSqlEngine): SqlExecutor & { arm(limit: number): void } {
  let n = 0;
  let limit = Infinity;
  let dead = false;
  return {
    arm(l: number) {
      n = 0;
      limit = l;
      dead = false;
    },
    execute: async (sql, params) => {
      if (dead || n >= limit) {
        dead = true;
        throw new Error("simulated power loss");
      }
      n++;
      return engine.execute(sql, params ?? []);
    },
  };
}
/** Dies after `limit` successful kv operations and STAYS dead. */
function killableKv(driver: KeyValueDriver): KeyValueDriver & { arm(limit: number): void } {
  let n = 0;
  let limit = Infinity;
  let dead = false;
  const guard = (): void => {
    if (dead || n >= limit) {
      dead = true;
      throw new Error("simulated power loss");
    }
    n++;
  };
  return {
    arm(l: number) {
      n = 0;
      limit = l;
      dead = false;
    },
    async getItem(k) {
      guard();
      return driver.getItem(k);
    },
    async setItem(k, v) {
      guard();
      return driver.setItem(k, v);
    },
    async removeItem(k) {
      guard();
      return driver.removeItem(k);
    },
    async getAllKeys() {
      guard();
      return driver.getAllKeys();
    },
  };
}

// outbox entry helper for adapter-level tests
function obEntry(seq: number, ts: string): OutboxEntry {
  return {
    seq,
    id: makeId("ob", Date.parse(ts), rand),
    ts,
    domain: "cars",
    op: "create",
    payload: { id: `x-${seq}` },
  };
}

async function adapterRoundTrip(name: string, storage: StorageAdapter): Promise<void> {
  console.log(`\n-- adapter round-trip: ${name} --`);
  const put = await storage.docs.put("cars", CAR.id, CAR);
  check(`${name}: docs.put ok`, put.ok);
  const got = await storage.docs.get("cars", CAR.id);
  check(`${name}: docs.get round-trips`, got.ok && js(got.doc) === js(CAR));
  const missing = await storage.docs.get("cars", "car-nope");
  check(`${name}: docs.get missing -> null`, missing.ok && missing.doc === null);
  await storage.docs.put("cars", CAR2.id, CAR2);
  const all = await storage.docs.getAll("cars");
  check(`${name}: docs.getAll returns both`, all.ok && all.docs.length === 2 && all.invalid.length === 0);
  const rm = await storage.docs.remove("cars", CAR2.id);
  const afterRm = await storage.docs.get("cars", CAR2.id);
  check(`${name}: docs.remove`, rm.ok && afterRm.ok && afterRm.doc === null);

  const a1 = await storage.log.append(obEntry(1, T0));
  const a2 = await storage.log.append(obEntry(2, T1));
  check(`${name}: log.append x2`, a1.ok && a2.ok);
  const dup = await storage.log.append(obEntry(2, T2));
  // Every adapter must reject a re-appended seq with the SAME specific reason —
  // not a generic driver_error from one backend and duplicate_seq from another.
  check(`${name}: log.append duplicate seq rejected`, !dup.ok);
  check(`${name}: duplicate seq reason is duplicate_seq (uniform across adapters)`, !dup.ok && dup.reason === "duplicate_seq", !dup.ok ? dup.reason : "ok");
  const read = await storage.log.readFrom(1);
  check(
    `${name}: log.readFrom cursor`,
    read.ok && read.entries.length === 1 && read.entries[0].seq === 2,
    read.ok ? js(read.entries.map((e) => e.seq)) : read.reason,
  );
  const pr = await storage.log.prune(2);
  const empty = await storage.log.readFrom(0);
  check(`${name}: log.prune drops <= upto`, pr.ok && empty.ok && empty.entries.length === 0);
  const last = await storage.log.lastSeq();
  check(`${name}: lastSeq survives prune`, last.ok && last.seq === 2, last.ok ? String(last.seq) : last.reason);

  // commit: doc + entry atomically
  const c = await storage.commit([{ type: "put", collection: "tracks", id: TRACK.id, doc: TRACK }], obEntry(3, T2));
  const t = await storage.docs.get("tracks", TRACK.id);
  const l3 = await storage.log.readFrom(2);
  check(
    `${name}: commit writes doc + entry`,
    c.ok && t.ok && js(t.doc) === js(TRACK) && l3.ok && l3.entries.length === 1 && l3.entries[0].seq === 3,
  );
}

// ═══ helpers for repos sections ══════════════════════════════════════════════

async function freshRepos(storage: StorageAdapter): Promise<Repos> {
  const r = await openRepos(storage, { rand: seededRand("repos") });
  if (!r.ok) fatal(`openRepos failed: ${r.reason}`);
  return r.repos;
}

async function main(): Promise<void> {
  // ═══ 1. adapter round-trips ════════════════════════════════════════════════

  await adapterRoundTrip("memory", memoryStorage());

  {
    const engine = new FakeSqlEngine();
    const opened = await openSqliteStorage(batchExecutor(engine));
    if (!opened.ok) fatal("openSqliteStorage(batch)");
    await adapterRoundTrip("sqlite/batch", opened.storage);
  }
  {
    const engine = new FakeSqlEngine();
    const opened = await openSqliteStorage(plainExecutor(engine));
    if (!opened.ok) fatal("openSqliteStorage(plain)");
    await adapterRoundTrip("sqlite/emulated-txn", opened.storage);
  }
  {
    const opened = await openKvStorage(memoryKeyValueDriver(), "t");
    if (!opened.ok) fatal("openKvStorage");
    await adapterRoundTrip("kv", opened.storage);
  }
  {
    const dead: SqlExecutor = {
      execute: async () => {
        throw new Error("no db");
      },
    };
    const opened = await openSqliteStorage(dead);
    check("sqlite: open with dead driver -> discriminated failure", !opened.ok);
  }

  // ═══ 2. repos: mutations, outbox-on-every-mutation, cursor, prune, reopen ══

  console.log("\n-- repos over memory --");
  const mem = memoryStorage();
  const repos = await freshRepos(mem);

  {
    const r = await repos.cars.put(CAR, T0);
    check("repos: cars.put", r.ok, r.ok ? "" : r.reason);
    const g = await repos.cars.get(CAR.id);
    check("repos: cars.get round-trips", g.ok && js(g.value) === js(CAR));
    const e = repos.outbox.entriesAfter(0);
    check(
      "repos: mutation journaled (domain cars, op create)",
      e.length === 1 && e[0].domain === "cars" && e[0].op === "create" && js(e[0].payload) === js(CAR),
    );
  }
  {
    const r = await repos.cars.put(CAR, T1); // same id again
    const e = repos.outbox.entriesAfter(1);
    check("repos: second put journals op update", r.ok && e.length === 1 && e[0].op === "update");
  }
  {
    const r = await repos.tracks.put(TRACK, T1);
    const g = await repos.tracks.get(TRACK.id);
    check("repos: tracks.put/get", r.ok && g.ok && js(g.value) === js(TRACK));
  }
  {
    const r = await repos.runs.put(RUN, T1);
    const g = await repos.runs.get(RUN.id);
    check("repos: runs.put/get", r.ok && g.ok && js(g.value) === js(RUN));
  }
  {
    const r = await repos.outcomes.put(OC, T2);
    const g = await repos.outcomes.get(OC.id);
    check("repos: outcomes.put/get", r.ok && g.ok && js(g.value) === js(OC));
  }
  {
    const r = await repos.weather_logs.put("wx-1", WX, T1);
    const g = await repos.weather_logs.get("wx-1");
    check("repos: weather_logs.put/get", r.ok && g.ok && js(g.value) === js(WX));
    const e = repos.outbox.entriesAfter(0);
    const lastE = e[e.length - 1];
    const p = lastE.payload as { collection?: string; id?: string; doc?: unknown };
    check(
      "repos: weather journals under 'sessions' with envelope payload",
      lastE.domain === "sessions" && p.collection === "weather_logs" && p.id === "wx-1" && js(p.doc) === js(WX),
    );
  }
  {
    const report = { id: "rep-1", created_at: T2, kind: "session_summary", best_lap_s: 34.2 };
    const r = await repos.reports.put(report, T2);
    const g = await repos.reports.get("rep-1");
    check("repos: reports.put/get (opaque doc)", r.ok && g.ok && js(g.value) === js(report));
    const bad = await repos.reports.put({ id: " ", created_at: T2 }, T2);
    check("repos: reports.put rejects empty id", !bad.ok);
  }
  {
    const r = await repos.profile.put(PROFILE, T2);
    const g = await repos.profile.get();
    check("repos: profile singleton put/get", r.ok && g.ok && js(g.value) === js(PROFILE));
  }
  {
    const r = await repos.account.put(ACCOUNT, T2);
    const g = await repos.account.get();
    check("repos: account singleton put/get", r.ok && g.ok && js(g.value) === js(ACCOUNT));
  }

  const MUTATIONS = 9; // car create+update, track, run, outcome, weather, report, profile, account
  {
    const all = repos.outbox.entriesAfter(0);
    check("repos: EVERY mutation appended to the outbox", all.length === MUTATIONS, String(all.length));
    const seqs = all.map((e) => e.seq);
    check(
      "repos: outbox seqs strictly increasing from 1",
      seqs.every((s, i) => s === i + 1),
      js(seqs),
    );
    check("repos: entriesAfter cursor", repos.outbox.entriesAfter(7).length === MUTATIONS - 7);
  }
  {
    const bad = await repos.cars.put({ id: "car-zzz" } as never, T2);
    const after = repos.outbox.entriesAfter(0).length;
    check("repos: parse-on-write rejects garbage, journals nothing", !bad.ok && after === MUTATIONS);
    const badNow = await repos.cars.put(CAR, "not-a-date");
    check("repos: garbage `now` rejected, not thrown", !badNow.ok && badNow.reason === "invalid_timestamp");
  }
  {
    const r = await repos.cars.remove(CAR.id, T3);
    const g = await repos.cars.get(CAR.id);
    const all = repos.outbox.entriesAfter(0);
    const lastE = all[all.length - 1];
    check(
      "repos: remove journals op delete with {id}",
      r.ok && g.ok && g.value === null && lastE.op === "delete" && js(lastE.payload) === js({ id: CAR.id }),
    );
    const again = await repos.cars.remove(CAR.id, T3);
    check(
      "repos: removing the absent doc is an idempotent no-op (no journal noise)",
      again.ok && repos.outbox.entriesAfter(0).length === all.length,
    );
  }
  {
    // reopen over the SAME storage: journal + next_seq must survive
    const reopened = await freshRepos(mem);
    const a = repos.outbox.state();
    const b = reopened.outbox.state();
    check(
      "repos: reopen rebuilds identical outbox state",
      js(a.entries) === js(b.entries) && a.next_seq === b.next_seq,
      `${a.next_seq} vs ${b.next_seq}`,
    );
  }
  {
    const before = repos.outbox.state();
    const pr = await repos.outbox.prune(before.entries[before.entries.length - 1].seq);
    check("repos: prune empties the journal", pr.ok && repos.outbox.entriesAfter(0).length === 0);
    const r = await repos.tracks.put(TRACK, T3);
    const after = repos.outbox.entriesAfter(0);
    check(
      "repos: seq continues after prune (never reused)",
      r.ok && after.length === 1 && after[0].seq === before.next_seq,
      js(after.map((e) => e.seq)),
    );
    const reopened = await freshRepos(mem);
    check(
      "repos: post-prune reopen keeps the high-water mark",
      reopened.outbox.state().next_seq === repos.outbox.state().next_seq,
    );
  }

  // ═══ 3. parse-on-read: reject + quarantine, never delete ═══════════════════

  console.log("\n-- parse-on-read quarantine --");
  {
    const mem2 = memoryStorage();
    const r2 = await freshRepos(mem2);
    await r2.cars.put(CAR, T0);
    // schema-invalid but JSON-valid doc, planted behind the repo's back
    await mem2.docs.put("cars", "car-bad", { id: "car-bad", name: 42 });
    const g = await r2.cars.get("car-bad");
    check("quarantine: corrupt doc -> discriminated result", !g.ok && g.reason.startsWith("corrupt:"));
    check("quarantine: corrupt doc was stashed", !g.ok && g.quarantined === true);
    const q = await r2.quarantine.getAll();
    check(
      "quarantine: stash holds collection/id/reason",
      q.ok &&
        q.values.some((v) => v.collection === "cars" && v.id === "car-bad" && typeof v.reason === "string"),
    );
    const still = await mem2.docs.get("cars", "car-bad");
    check("quarantine: original cell NOT deleted", still.ok && still.doc !== null);
    const all = await r2.cars.getAll();
    check(
      "quarantine: getAll returns good values + corrupt report",
      all.ok && all.values.length === 1 && all.corrupt.length === 1 && all.corrupt[0].id === "car-bad",
    );
    // unparseable bytes in the cell
    mem2.pokeDoc("cars", "car-trash", "{ not json");
    const g2 = await r2.cars.get("car-trash");
    const q2 = await r2.quarantine.getAll();
    check(
      "quarantine: invalid JSON bytes -> stashed raw, discriminated",
      !g2.ok && g2.quarantined === true && q2.ok && q2.values.some((v) => v.raw === "{ not json"),
    );
  }

  // ═══ 4. corrupt outbox entry: quarantined on open, seq preserved ═══════════

  console.log("\n-- corrupt outbox entry on open --");
  {
    const mem3 = memoryStorage();
    const r3 = await freshRepos(mem3);
    await r3.cars.put(CAR, T0); // seq 1
    await r3.tracks.put(TRACK, T1); // seq 2
    mem3.pokeLog(2, "{ rotted bytes");
    const reopened = await openRepos(mem3, { rand: seededRand("reopen") });
    if (!reopened.ok) fatal("reopen after log rot");
    check("outbox rot: open warns", reopened.warnings.length > 0, js(reopened.warnings));
    const st = reopened.repos.outbox.state();
    check("outbox rot: corrupt entry dropped from state, good one kept", st.entries.length === 1 && st.entries[0].seq === 1);
    check("outbox rot: next_seq preserved past the rotted entry", st.next_seq === 3, String(st.next_seq));
    const q = await reopened.repos.quarantine.getAll();
    check(
      "outbox rot: rotted entry quarantined, not deleted",
      q.ok && q.values.some((v) => v.collection === "outbox"),
    );
    const r = await reopened.repos.runs.put(RUN, T2);
    const e = reopened.repos.outbox.entriesAfter(0);
    check("outbox rot: next append continues at seq 3", r.ok && e[e.length - 1].seq === 3);
  }

  // ═══ 5. KILL-MID-WRITE: sqlite emulated transaction ═════════════════════════

  console.log("\n-- kill-mid-write: sqlite transaction path --");
  // one repo put = getDoc + BEGIN + putDoc + appendLog + setMeta + COMMIT = 6 executes
  for (let f = 0; f <= 7; f++) {
    const engine = new FakeSqlEngine();
    {
      const opened = await openSqliteStorage(plainExecutor(engine));
      if (!opened.ok) fatal("sweep open");
      const r = await freshRepos(opened.storage);
      const base = await r.cars.put(CAR, T0); // healthy baseline, seq 1
      if (!base.ok) fatal("sweep baseline put");
    }
    const killer = killableExecutor(engine);
    const armedOpen = await openSqliteStorage(killer);
    let putOk = false;
    if (armedOpen.ok) {
      const armedRepos = await openRepos(armedOpen.storage, { rand: seededRand(`sweep${f}`) });
      if (!armedRepos.ok) fatal("sweep armed open");
      killer.arm(f);
      const res = await armedRepos.repos.cars.put(CAR2, T1);
      putOk = res.ok;
    }
    engine.crashRecover(); // what real sqlite does to an uncommitted txn on reopen
    const opened = await openSqliteStorage(plainExecutor(engine));
    if (!opened.ok) fatal("sweep reopen");
    const r = await freshRepos(opened.storage);
    const car1 = await r.cars.get(CAR.id);
    const car2 = await r.cars.get(CAR2.id);
    const entries = r.outbox.entriesAfter(0);
    const car2Journaled = entries.some((e) => (e.payload as { id?: string }).id === CAR2.id);
    const consistent =
      car1.ok &&
      car1.value !== null &&
      car2.ok &&
      (car2.value !== null) === putOk && // visible IFF reported ok
      car2Journaled === putOk && // journaled IFF reported ok
      entries.length === (putOk ? 2 : 1);
    check(`sqlite kill after ${f} ops: no partial state (put ${putOk ? "ok" : "failed"})`, consistent);
    if (!putOk) {
      const retry = await r.cars.put(CAR2, T2);
      const after = r.outbox.entriesAfter(0);
      check(
        `sqlite kill after ${f} ops: clean recovery, retry succeeds with monotonic seq`,
        retry.ok && after.length === 2 && after[1].seq === after[0].seq + 1,
      );
    } else {
      check(`sqlite kill after ${f} ops: control — commit completed`, putOk);
    }
  }
  {
    // batch path: a failing batch applies nothing
    const engine = new FakeSqlEngine();
    const opened = await openSqliteStorage(batchExecutor(engine));
    if (!opened.ok) fatal("batch kill open");
    const r = await freshRepos(opened.storage);
    await r.cars.put(CAR, T0);
    engine.log.set(2, "occupied"); // force the next appendLog (seq 2) to violate UNIQUE inside the batch
    const res = await r.cars.put(CAR2, T1);
    const visible = await opened.storage.docs.get("cars", CAR2.id);
    check(
      "sqlite batch: failing batch is all-or-nothing (doc not visible)",
      !res.ok && visible.ok && visible.doc === null,
    );
  }

  // ═══ 6. KILL-MID-WRITE: kv write-then-swap ═════════════════════════════════

  console.log("\n-- kill-mid-write: kv write-then-swap path --");
  // one repo put = getItem(docs) + getItem(docs) + getItem(log) + getItem(prev docs)
  //              + getItem(prev log) + setItem(undo) + setItem(docs) + setItem(log)
  //              + removeItem(undo) = 9 kv ops
  for (let f = 0; f <= 10; f++) {
    const raw = memoryKeyValueDriver();
    {
      const opened = await openKvStorage(raw, "t");
      if (!opened.ok) fatal("kv sweep open");
      const r = await freshRepos(opened.storage);
      const base = await r.cars.put(CAR, T0);
      if (!base.ok) fatal("kv sweep baseline");
    }
    const killer = killableKv(raw);
    const armedOpen = await openKvStorage(killer, "t");
    let putOk = false;
    if (armedOpen.ok) {
      const armedRepos = await openRepos(armedOpen.storage, { rand: seededRand(`kv${f}`) });
      if (!armedRepos.ok) fatal("kv sweep armed open");
      killer.arm(f);
      const res = await armedRepos.repos.cars.put(CAR2, T1);
      putOk = res.ok;
    }
    // next open performs undo-log recovery
    const reopened = await openKvStorage(raw, "t");
    if (!reopened.ok) fatal("kv sweep reopen");
    const r = await freshRepos(reopened.storage);
    const car1 = await r.cars.get(CAR.id);
    const car2 = await r.cars.get(CAR2.id);
    const entries = r.outbox.entriesAfter(0);
    const car2Journaled = entries.some((e) => (e.payload as { id?: string }).id === CAR2.id);
    const undoGone = (await raw.getItem("t:undo")) === null;
    const consistent =
      car1.ok &&
      car1.value !== null &&
      car2.ok &&
      (car2.value !== null) === putOk &&
      car2Journaled === putOk &&
      entries.length === (putOk ? 2 : 1) &&
      undoGone;
    check(`kv kill after ${f} ops: no partial state, undo cleared (put ${putOk ? "ok" : "failed"})`, consistent);
    if (!putOk) {
      const retry = await r.cars.put(CAR2, T2);
      const after = r.outbox.entriesAfter(0);
      check(
        `kv kill after ${f} ops: clean recovery, retry succeeds with monotonic seq`,
        retry.ok && after.length === 2 && after[1].seq === after[0].seq + 1,
      );
    } else {
      check(`kv kill after ${f} ops: control — commit completed`, putOk);
    }
  }
  {
    // corrupt collection blob: writes REFUSED, reads discriminated — never overwritten
    const raw = memoryKeyValueDriver({ "t:docs:cars": "{ rotted" });
    const opened = await openKvStorage(raw, "t");
    if (!opened.ok) fatal("kv corrupt blob open");
    const w = await opened.storage.docs.put("cars", CAR.id, CAR);
    const g = await opened.storage.docs.get("cars", CAR.id);
    check(
      "kv: corrupt collection blob refuses writes and reads, bytes intact",
      !w.ok && !g.ok && (await raw.getItem("t:docs:cars")) === "{ rotted",
    );
  }

  // ═══ 7. migration: lift, determinism, non-destructive, idempotent apply ════

  console.log("\n-- legacy-blob migration --");
  const ts36 = (iso: string): string => Date.parse(iso).toString(36);
  const legacyTrack1 = { name: "Club Track", surface: "clay", grip: "medium", conditions: ["dusty", "bumpy"] };
  const legacyTrack2 = { name: "Indoor Carpet", surface: "carpet", grip: "high", conditions: [] as string[] };
  const goodRun1 = {
    id: `run-${ts36(T1)}-aaaaaaaa`,
    at: T1,
    type: "practice",
    setup_version_id: "kyosho-inferno-mp11/kit",
    setup_name: "Kit",
    track: legacyTrack1,
    best_lap_s: 34.2,
    lap_count: 18,
    feedback_text: "pushy mid",
  };
  const badRun = {
    id: `run-${ts36(T2)}-bbbbbbbb`,
    at: T2,
    type: "practice",
    setup_version_id: "", // -> empty_setup_version, must be SKIPPED not dropped silently
    setup_name: "Kit",
    track: legacyTrack1,
  };
  const goodRun2 = {
    id: `run-${ts36(T3)}-cccccccc`,
    at: T3,
    type: "qualifier",
    setup_version_id: "kyosho-inferno-mp11/kit",
    setup_name: "Kit v2",
    track: legacyTrack2,
    best_lap_s: 29.8,
  };
  const legacyOutcome = {
    id: `oc-${ts36(T2)}-dddddddd`,
    at: T2,
    setting: "front oil",
    change: "500 -> 450",
    citations: ["HUDY p.12"],
    outcome: "better",
    setup_version_id: "kyosho-inferno-mp11/kit",
    setup_name: "Kit",
    track: legacyTrack1,
    note: "felt planted",
  };
  const legacySessions = {
    format: 1,
    state: {
      sessions: [
        {
          id: `ss-${ts36(T0)}-eeeeeeee`,
          started_at: T0,
          ended_at: T2,
          track: legacyTrack1,
          runs: [goodRun1, badRun],
          outcomes: [legacyOutcome],
        },
        {
          id: "not-a-schema-id", // forces deterministic re-mint
          started_at: T3,
          track: legacyTrack2,
          runs: [goodRun2],
          outcomes: [],
        },
      ],
      active_session_id: null,
    },
  };
  const legacySheets = {
    format: 1,
    state: {
      template_id: "kyosho-inferno-mp11",
      versions: [
        {
          id: "kyosho-inferno-mp11/kit",
          name: "Kit",
          parent_id: null,
          template_id: "kyosho-inferno-mp11",
          values: { front_oil: 500 },
          created_at: T0,
          locked: true,
        },
      ],
      draft: { front_oil: 450 },
      draft_base_id: "kyosho-inferno-mp11/kit",
      draft_name: "My setup",
      starred: [],
    },
  };
  const legacyKv = memoryKeyValueDriver({
    "racelab:sheets:kyosho-inferno-mp11": JSON.stringify(legacySheets),
    "racelab:sessions:v1": JSON.stringify(legacySessions),
    "racelab:sessions:v1:backup:corrupt": "{ old rotted backup", // must be ignored
  });

  const snapshotBefore = js(legacyKv.snapshot());
  const mig = await migrateLegacyBlobs(legacyKv);
  if (!mig.ok) fatal(`migrateLegacyBlobs: ${mig.reason}`);
  check(
    "migrate: lifts 1 car, 2 tracks, 2 runs, 1 outcome",
    mig.lifted.cars.length === 1 &&
      mig.lifted.tracks.length === 2 &&
      mig.lifted.runs.length === 2 &&
      mig.lifted.outcomes.length === 1,
    js(mig.report.lifted),
  );
  check(
    "migrate: bad run reported as skipped (never silently dropped)",
    mig.report.skipped.some((s) => s.kind === "run" && s.id === badRun.id && s.reason === "empty_setup_version"),
    js(mig.report.skipped),
  );
  check(
    "migrate: lifted entities pass the schema load validators",
    mig.lifted.cars.every((c) => parseCar(c).ok) &&
      mig.lifted.tracks.every((t) => parseTrack(t).ok) &&
      mig.lifted.runs.every((r) => parseRunEntry(r).ok) &&
      mig.lifted.outcomes.every((o) => parseOutcomeRecord(o).ok),
  );
  {
    const r1 = mig.lifted.runs.find((r) => r.setup_name === "Kit");
    check(
      "migrate: condition tags lift (dusty -> dusty:true, bumpy -> bumpiness medium)",
      r1 !== undefined && r1.conditions.dusty === true && r1.conditions.bumpiness === "medium",
    );
    check(
      "migrate: run joins its synthesized track + car",
      r1 !== undefined &&
        mig.lifted.tracks.some((t) => t.id === r1.track_id) &&
        r1.car_id === mig.lifted.cars[0].id &&
        r1.car_template_id === "kyosho-inferno-mp11",
    );
    const legacySsOk = mig.lifted.runs.some((r) => r.session_id === `ss-${ts36(T0)}-eeeeeeee`);
    check("migrate: well-formed legacy session id kept verbatim", legacySsOk);
  }
  {
    const again = await migrateLegacyBlobs(legacyKv);
    check(
      "migrate: deterministic — same blobs lift to byte-identical entities",
      again.ok && js(again.lifted) === js(mig.lifted),
    );
    check("migrate: reads only, writes/deletes NOTHING", js(legacyKv.snapshot()) === snapshotBefore);
  }
  {
    const migMem = memoryStorage();
    const migRepos = await freshRepos(migMem);
    const applied = await applyMigration(migRepos, mig.lifted, T3);
    check(
      "migrate: apply writes everything through the repos",
      applied.ok &&
        applied.applied.cars === 1 &&
        applied.applied.tracks === 2 &&
        applied.applied.runs === 2 &&
        applied.applied.outcomes === 1,
      js(applied),
    );
    const journal = migRepos.outbox.entriesAfter(0);
    check("migrate: every applied entity journaled in the outbox", journal.length === 6, String(journal.length));
    const runsAll = await migRepos.runs.getAll();
    check("migrate: applied runs read back through parse-on-read", runsAll.ok && runsAll.values.length === 2);

    const reapplied = await applyMigration(migRepos, mig.lifted, T3);
    const journalAfter = migRepos.outbox.entriesAfter(0);
    check(
      "migrate: IDEMPOTENT — second apply writes nothing, journals nothing",
      reapplied.ok &&
        reapplied.applied.cars + reapplied.applied.tracks + reapplied.applied.runs + reapplied.applied.outcomes === 0 &&
        reapplied.skipped === 6 &&
        journalAfter.length === 6,
      js(reapplied),
    );
    // and a freshly-lifted copy applies idempotently too (deterministic ids)
    const relift = await migrateLegacyBlobs(legacyKv);
    if (!relift.ok) fatal("relift");
    const reliftApply = await applyMigration(migRepos, relift.lifted, T3);
    check(
      "migrate: re-lift + re-apply still idempotent (deterministic ids)",
      reliftApply.ok && reliftApply.skipped === 6 && migRepos.outbox.entriesAfter(0).length === 6,
    );
  }
  {
    const rottenKv = memoryKeyValueDriver({ "racelab:sessions:v1": "{ rotted beyond repair" });
    const m = await migrateLegacyBlobs(rottenKv);
    check(
      "migrate: corrupt blob -> reported, lifted empty, blob left in place",
      m.ok &&
        m.lifted.runs.length === 0 &&
        m.report.skipped.some((s) => s.kind === "blob" && s.reason === "corrupt_json") &&
        (await rottenKv.getItem("racelab:sessions:v1")) === "{ rotted beyond repair",
    );
  }
  {
    const emptyKv = memoryKeyValueDriver();
    const m = await migrateLegacyBlobs(emptyKv);
    check(
      "migrate: nothing to migrate is ok-empty, not an error",
      m.ok && m.lifted.cars.length === 0 && m.report.notes.length > 0,
    );
  }

  // ═══ 8. repos over the device-shaped adapters (vertical slice) ═════════════

  console.log("\n-- repos over sqlite + kv (vertical) --");
  {
    const engine = new FakeSqlEngine();
    const opened = await openSqliteStorage(batchExecutor(engine));
    if (!opened.ok) fatal("vertical sqlite open");
    const r = await freshRepos(opened.storage);
    await r.cars.put(CAR, T0);
    await r.runs.put(RUN, T1);
    const reopened = await freshRepos(opened.storage);
    const g = await reopened.runs.get(RUN.id);
    check(
      "vertical sqlite: write, reopen, parse-validated read + journal intact",
      g.ok && js(g.value) === js(RUN) && reopened.outbox.entriesAfter(0).length === 2,
    );
  }
  {
    const raw = memoryKeyValueDriver();
    const opened = await openKvStorage(raw, "app");
    if (!opened.ok) fatal("vertical kv open");
    const r = await freshRepos(opened.storage);
    await r.cars.put(CAR, T0);
    await r.outcomes.put(OC, T2);
    const reopened2 = await openKvStorage(raw, "app");
    if (!reopened2.ok) fatal("vertical kv reopen");
    const r2 = await freshRepos(reopened2.storage);
    const g = await r2.outcomes.get(OC.id);
    check(
      "vertical kv: write, reopen, parse-validated read + journal intact",
      g.ok && js(g.value) === js(OC) && r2.outbox.entriesAfter(0).length === 2,
    );
  }

  // ═══ summary ════════════════════════════════════════════════════════════════

  console.log(`\n${passed} passed, ${failures} failed`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => {
  console.log(`FAIL suite threw: ${String(e)}`);
  process.exit(1);
});
