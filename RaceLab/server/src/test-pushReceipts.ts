/**
 * pushReceipts WORKER test — processReceipts + sendEligible exercised directly
 * against in-memory fakes (ExpoReceiptFetcher / PushPruner / TicketTokenLookup /
 * PrefsReader). No HTTP, no Postgres, no Expo. Assertion style mirrors
 * src/test-media.ts / src/test-export.ts.
 *
 * Run from server/:  npx tsx src/test-pushReceipts.ts
 *
 * Covers:
 *  - DeviceNotRegistered -> token pruned (inline token, and ticket->token fallback)
 *  - transient error (MessageRateExceeded, …) -> reported in retry, never pruned
 *  - 'ok' receipts are no-ops; dead token shared by many tickets pruned ONCE
 *  - whole-batch fetch failure -> { ok:false, fetch_failed }, nothing pruned
 *  - DeviceNotRegistered with no resolvable token -> skipped, not pruned
 *  - empty batch -> { ok:false, empty_batch }
 *  - never throws across the boundary (throwing fetcher/pruner are typed results)
 *  - sendEligible: consent gate blocks marketing (trial_ending) without consent,
 *    allows it with consent; service types ignore consent; per-type opt-in is
 *    required (absent = not eligible); unknown type rejected; per-device + token
 *    de-dup; prefs reader failure -> typed result.
 */

import {
  processReceipts,
  sendEligible,
  NOTIFICATION_TYPES,
  type ExpoReceipt,
  type ExpoReceiptFetcher,
  type PushPruner,
  type TicketTokenLookup,
  type PrefsReader,
  type DevicePrefs,
} from "./workers/pushReceipts";

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`ok   ${label}`);
  } else {
    failures++;
    console.log(`FAIL ${label}${detail !== undefined ? ` — ${detail}` : ""}`);
  }
}

// ── fakes ─────────────────────────────────────────────────────────────────────

/** Fetcher that returns a fixed receipt list keyed nothing-fancy (echoes whatever
 *  it was constructed with). Optionally throws to simulate Expo/network down. */
class FakeFetcher implements ExpoReceiptFetcher {
  calls: (readonly string[])[] = [];
  constructor(
    private receipts: readonly ExpoReceipt[],
    private throwOnGet = false,
  ) {}
  async get(ticketIds: readonly string[]): Promise<{ receipts: readonly ExpoReceipt[] }> {
    this.calls.push(ticketIds);
    if (this.throwOnGet) throw new Error("expo unreachable");
    return { receipts: this.receipts };
  }
}

/** Pruner that records every token it was asked to unregister. Optionally throws. */
class FakePruner implements PushPruner {
  unregistered: string[] = [];
  /** `failTokens` (optional) throws only for those tokens; otherwise throwOnPrune
   *  throws for ALL. With both, only the listed tokens fail (collect-and-continue). */
  constructor(private throwOnPrune = false, private failTokens?: ReadonlySet<string>) {}
  async unregisterByToken(token: string): Promise<void> {
    const shouldFail = this.failTokens !== undefined ? this.failTokens.has(token) : this.throwOnPrune;
    if (shouldFail) throw new Error("db down");
    this.unregistered.push(token);
  }
}

/** ticket -> token map for the fallback path. */
class FakeTicketTokens implements TicketTokenLookup {
  constructor(private map: Record<string, string>) {}
  async tokenForTicket(ticketId: string): Promise<string | null> {
    return this.map[ticketId] ?? null;
  }
}

/** PrefsReader returning a fixed device list per user. Optionally throws. */
class FakePrefs implements PrefsReader {
  constructor(
    private byUser: Record<string, readonly DevicePrefs[]>,
    private throwOnRead = false,
  ) {}
  async read(userId: string): Promise<readonly DevicePrefs[]> {
    if (this.throwOnRead) throw new Error("prefs store down");
    return this.byUser[userId] ?? [];
  }
}

const ok = (id: string): ExpoReceipt => ({ id, status: "ok" });
const dnr = (id: string, token?: string): ExpoReceipt => ({
  id,
  status: "error",
  message: "device not registered",
  details: { error: "DeviceNotRegistered", ...(token !== undefined ? { expoPushToken: token } : {}) },
});
const err = (id: string, code: string): ExpoReceipt => ({
  id,
  status: "error",
  message: code,
  details: { error: code },
});

// ═══ processReceipts: DeviceNotRegistered prune (inline token) ═══════════════════

console.log("— processReceipts: DeviceNotRegistered prune —");
{
  const fetcher = new FakeFetcher([dnr("t1", "ExpoTok[DEAD1]"), ok("t2")]);
  const pruner = new FakePruner();
  const res = await processReceipts(["t1", "t2"], { fetcher, pruner });
  check("prune: result ok", res.ok === true);
  if (res.ok) {
    check("prune: one token pruned", res.pruned === 1);
    check("prune: nothing queued for retry", res.retry.length === 0);
    check("prune: nothing skipped", res.skipped.length === 0);
  }
  check("prune: the dead token was unregistered", pruner.unregistered.length === 1 && pruner.unregistered[0] === "ExpoTok[DEAD1]");
}

// ═══ processReceipts: ticket->token fallback when receipt omits the token ════════

console.log("\n— processReceipts: ticket->token fallback —");
{
  const fetcher = new FakeFetcher([dnr("t1") /* no inline token */]);
  const pruner = new FakePruner();
  const ticketTokens = new FakeTicketTokens({ t1: "ExpoTok[DEAD-FB]" });
  const res = await processReceipts(["t1"], { fetcher, pruner, ticketTokens });
  check("fallback: ok", res.ok === true && res.ok && res.pruned === 1);
  check("fallback: pruned the looked-up token", pruner.unregistered[0] === "ExpoTok[DEAD-FB]");

  // no inline token AND no lookup hit -> skipped, NOT pruned (fail-safe)
  const fetcher2 = new FakeFetcher([dnr("t9")]);
  const pruner2 = new FakePruner();
  const res2 = await processReceipts(["t9"], { fetcher: fetcher2, pruner: pruner2 });
  check("fallback: unresolvable token -> not pruned", pruner2.unregistered.length === 0);
  check("fallback: unresolvable token -> skipped with reason", res2.ok === true && res2.ok && res2.pruned === 0 && res2.skipped.length === 1 && res2.skipped[0].reason === "device_not_registered_token_unknown");
}

// ═══ processReceipts: transient error -> retry, never prune ══════════════════════

console.log("\n— processReceipts: transient error -> retry —");
{
  const fetcher = new FakeFetcher([
    err("t1", "MessageRateExceeded"),
    err("t2", "MessageTooBig"),
    err("t3", "InvalidCredentials"),
    ok("t4"),
  ]);
  const pruner = new FakePruner();
  const res = await processReceipts(["t1", "t2", "t3", "t4"], { fetcher, pruner });
  check("retry: ok", res.ok === true);
  if (res.ok) {
    check("retry: nothing pruned (no dead device)", res.pruned === 0);
    check("retry: three transient errors reported", res.retry.length === 3);
    check("retry: carries the Expo error codes", res.retry.some((r) => r.error === "MessageRateExceeded") && res.retry.some((r) => r.error === "MessageTooBig") && res.retry.some((r) => r.error === "InvalidCredentials"));
    check("retry: retry entries carry the ticket id", res.retry.every((r) => typeof r.ticketId === "string" && r.ticketId !== ""));
  }
  check("retry: pruner never called for transient errors", pruner.unregistered.length === 0);
}

// ═══ processReceipts: shared dead token pruned exactly once ══════════════════════

console.log("\n— processReceipts: dedup prune —");
{
  // three tickets all hit the SAME dead token (a single device that got 3 pushes)
  const fetcher = new FakeFetcher([dnr("t1", "SAME-DEAD"), dnr("t2", "SAME-DEAD"), dnr("t3", "SAME-DEAD")]);
  const pruner = new FakePruner();
  const res = await processReceipts(["t1", "t2", "t3"], { fetcher, pruner });
  check("dedup: ok and pruned count is 1, not 3", res.ok === true && res.ok && res.pruned === 1);
  check("dedup: pruner invoked exactly once", pruner.unregistered.length === 1);
}

// ═══ processReceipts: mixed batch (ok + dnr + transient) ═════════════════════════

console.log("\n— processReceipts: mixed batch —");
{
  const fetcher = new FakeFetcher([
    ok("t1"),
    dnr("t2", "DEAD-A"),
    err("t3", "MessageRateExceeded"),
    dnr("t4", "DEAD-B"),
    ok("t5"),
  ]);
  const pruner = new FakePruner();
  const res = await processReceipts(["t1", "t2", "t3", "t4", "t5"], { fetcher, pruner });
  check("mixed: ok", res.ok === true);
  if (res.ok) {
    check("mixed: two distinct dead tokens pruned", res.pruned === 2);
    check("mixed: one transient retry", res.retry.length === 1 && res.retry[0].error === "MessageRateExceeded");
  }
  check("mixed: both tokens unregistered", pruner.unregistered.includes("DEAD-A") && pruner.unregistered.includes("DEAD-B"));
}

// ═══ processReceipts: whole-batch fetch failure -> fail-closed ═══════════════════

console.log("\n— processReceipts: fetch failure —");
{
  const fetcher = new FakeFetcher([dnr("t1", "DEAD")], /* throwOnGet */ true);
  const pruner = new FakePruner();
  const res = await processReceipts(["t1"], { fetcher, pruner });
  check("fetch-fail: typed result, not a throw", res.ok === false && res.reason === "fetch_failed");
  check("fetch-fail: NOTHING pruned on fetch failure (fail-closed)", pruner.unregistered.length === 0);
}

// ═══ processReceipts: empty batch ═══════════════════════════════════════════════

console.log("\n— processReceipts: empty batch —");
{
  const fetcher = new FakeFetcher([]);
  const pruner = new FakePruner();
  const res = await processReceipts([], { fetcher, pruner });
  check("empty: typed result empty_batch", res.ok === false && res.reason === "empty_batch");
  check("empty: fetcher not even called", fetcher.calls.length === 0);
}

// ═══ processReceipts: never throws even if the pruner throws ═════════════════════

console.log("\n— processReceipts: pruner throws -> collect-and-continue, not a throw —");
{
  // COLLECT-AND-CONTINUE (audit MED): a single failing prune must NOT discard the
  // whole batch. With two dead tokens where one prune throws, the other still
  // gets pruned and the failed one is surfaced in `skipped` (reason prune_failed).
  const fetcher = new FakeFetcher([dnr("t1", "DEAD-A"), dnr("t2", "DEAD-B")]);
  const pruner = new FakePruner(/* throwOnPrune */ true, /* failTokens */ new Set(["DEAD-A"]));
  let threw = false;
  let res;
  try {
    res = await processReceipts(["t1", "t2"], { fetcher, pruner });
  } catch {
    threw = true;
  }
  check("prune-fail: did NOT throw across the boundary", threw === false);
  check("prune-fail: batch NOT discarded — result is ok:true", res !== undefined && res.ok === true);
  check("prune-fail: the healthy token was still pruned (1)", res !== undefined && res.ok === true && res.pruned === 1);
  check("prune-fail: the failing token surfaced in skipped (reason prune_failed)", res !== undefined && res.ok === true && res.skipped.some((s) => s.reason === "prune_failed"));
}

// ═══ processReceipts: malformed receipt is skipped, not fatal ════════════════════

console.log("\n— processReceipts: malformed receipt —");
{
  const fetcher = new FakeFetcher([
    { /* no id */ status: "error" } as unknown as ExpoReceipt,
    dnr("t2", "DEAD"),
  ]);
  const pruner = new FakePruner();
  const res = await processReceipts(["t1", "t2"], { fetcher, pruner });
  check("malformed: still ok, healthy receipt still processed", res.ok === true && res.ok && res.pruned === 1);
  check("malformed: bad row recorded in skipped", res.ok === true && res.ok && res.skipped.some((s) => s.reason === "malformed_receipt"));
}

// ═══ sendEligible: consent gate for the trial-ending MARKETING nudge ═════════════

console.log("\n— sendEligible: marketing consent gate —");
{
  // device opted into trial_ending but withheld marketing_consent -> blocked
  const noConsent = new FakePrefs({
    user_A: [{ token: "TOK-A", trial_ending: true, marketing_consent: false }],
  });
  const r1 = await sendEligible("user_A", "trial_ending", { prefs: noConsent });
  check("consent: trial_ending without marketing_consent -> NO tokens", r1.ok === true && r1.ok && r1.tokens.length === 0);

  // absent consent flag is the same as withheld
  const absentConsent = new FakePrefs({ user_A: [{ token: "TOK-A", trial_ending: true }] });
  const r1b = await sendEligible("user_A", "trial_ending", { prefs: absentConsent });
  check("consent: trial_ending with consent ABSENT -> NO tokens", r1b.ok === true && r1b.ok && r1b.tokens.length === 0);

  // same device, consent granted -> eligible
  const withConsent = new FakePrefs({
    user_A: [{ token: "TOK-A", trial_ending: true, marketing_consent: true }],
  });
  const r2 = await sendEligible("user_A", "trial_ending", { prefs: withConsent });
  check("consent: trial_ending WITH marketing_consent -> token eligible", r2.ok === true && r2.ok && r2.tokens.length === 1 && r2.tokens[0] === "TOK-A");

  // opted into trial_ending=false but has consent -> still blocked (per-type opt-in required too)
  const optedOut = new FakePrefs({
    user_A: [{ token: "TOK-A", trial_ending: false, marketing_consent: true }],
  });
  const r3 = await sendEligible("user_A", "trial_ending", { prefs: optedOut });
  check("consent: trial_ending opt-in false even with consent -> NO tokens", r3.ok === true && r3.ok && r3.tokens.length === 0);
}

// ═══ sendEligible: service types ignore marketing_consent ════════════════════════

console.log("\n— sendEligible: service types —");
{
  // a service notification (speedhive_new_run) is sent on the per-type opt-in
  // ALONE — marketing_consent is irrelevant to it.
  const prefs = new FakePrefs({
    user_A: [{ token: "TOK-A", speedhive_new_run: true, marketing_consent: false }],
  });
  const r = await sendEligible("user_A", "speedhive_new_run", { prefs });
  check("service: speedhive_new_run sent despite no marketing_consent", r.ok === true && r.ok && r.tokens.length === 1 && r.tokens[0] === "TOK-A");

  const propPrefs = new FakePrefs({ user_A: [{ token: "TOK-A", social_prop: true }] });
  const rp = await sendEligible("user_A", "social_prop", { prefs: propPrefs });
  check("service: social_prop sent on per-type opt-in", rp.ok === true && rp.ok && rp.tokens.length === 1);

  const commentPrefs = new FakePrefs({ user_A: [{ token: "TOK-A", social_comment: true }] });
  const rc = await sendEligible("user_A", "social_comment", { prefs: commentPrefs });
  check("service: social_comment sent on per-type opt-in", rc.ok === true && rc.ok && rc.tokens.length === 1);

  // per-type opt-in is REQUIRED: a service type with the flag absent -> not eligible
  const noOptIn = new FakePrefs({ user_A: [{ token: "TOK-A" /* speedhive absent */ }] });
  const rn = await sendEligible("user_A", "speedhive_new_run", { prefs: noOptIn });
  check("service: absent per-type opt-in -> NOT eligible", rn.ok === true && rn.ok && rn.tokens.length === 0);
}

// ═══ sendEligible: per-device fan-out + token de-dup ═════════════════════════════

console.log("\n— sendEligible: per-device fan-out + dedup —");
{
  const prefs = new FakePrefs({
    user_A: [
      { token: "PHONE", speedhive_new_run: true },
      { token: "TABLET", speedhive_new_run: false }, // opted out on this device
      { token: "LAPTOP", speedhive_new_run: true },
      { token: "PHONE", speedhive_new_run: true }, // duplicate token (reinstall row)
    ],
  });
  const r = await sendEligible("user_A", "speedhive_new_run", { prefs });
  check("fanout: only opted-in devices returned", r.ok === true && r.ok && r.tokens.includes("PHONE") && r.tokens.includes("LAPTOP") && !r.tokens.includes("TABLET"));
  check("fanout: duplicate token collapsed to one", r.ok === true && r.ok && r.tokens.filter((t) => t === "PHONE").length === 1);
  check("fanout: exactly two eligible tokens", r.ok === true && r.ok && r.tokens.length === 2);

  // no devices at all -> ok with empty list (a no-op send, NOT an error)
  const none = new FakePrefs({});
  const rNone = await sendEligible("user_unknown", "social_comment", { prefs: none });
  check("fanout: no devices -> ok + empty (not an error)", rNone.ok === true && rNone.ok && rNone.tokens.length === 0);

  // a device with an empty/absent token is never returned
  const blankTok = new FakePrefs({ user_A: [{ token: "", speedhive_new_run: true }] });
  const rBlank = await sendEligible("user_A", "speedhive_new_run", { prefs: blankTok });
  check("fanout: blank token never eligible", rBlank.ok === true && rBlank.ok && rBlank.tokens.length === 0);
}

// ═══ sendEligible: unknown type rejected ═════════════════════════════════════════

console.log("\n— sendEligible: unknown type rejected —");
{
  const prefs = new FakePrefs({ user_A: [{ token: "TOK", speedhive_new_run: true }] });
  for (const bad of ["marketing", "promo", "speedhive", "trial", "social", "", "SPEEDHIVE_NEW_RUN", "social_follow"]) {
    const r = await sendEligible("user_A", bad, { prefs });
    check(`unknown: type ${JSON.stringify(bad)} -> rejected`, r.ok === false && r.reason === "unknown_type");
  }
  // every allow-listed type, by contrast, is accepted (taxonomy is exactly these four)
  for (const t of NOTIFICATION_TYPES) {
    const allowPrefs = new FakePrefs({ user_A: [{ token: "TOK", [t]: true, marketing_consent: true } as DevicePrefs] });
    const r = await sendEligible("user_A", t, { prefs: allowPrefs });
    check(`allowed: type ${t} accepted`, r.ok === true);
  }
  check("taxonomy: exactly four allowed types", NOTIFICATION_TYPES.length === 4);
}

// ═══ sendEligible: prefs reader failure -> typed result, not a throw ═════════════

console.log("\n— sendEligible: prefs reader failure —");
{
  const prefs = new FakePrefs({}, /* throwOnRead */ true);
  let threw = false;
  let r;
  try {
    r = await sendEligible("user_A", "speedhive_new_run", { prefs });
  } catch {
    threw = true;
  }
  check("prefs-fail: did NOT throw across the boundary", threw === false);
  check("prefs-fail: typed result prefs_unavailable", r !== undefined && r.ok === false && r.reason === "prefs_unavailable");
}

// ═══ verdict ═════════════════════════════════════════════════════════════════

console.log(failures === 0 ? "\nPUSH-RECEIPTS: all checks passed" : `\nPUSH-RECEIPTS: ${failures} failures`);
if (failures > 0) process.exitCode = 1;
