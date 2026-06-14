/**
 * exportAssembler worker test — assembleExport / runExportJob exercised against
 * in-memory fakes of the four owner-scoped readers + the ExportJobWriter. No
 * HTTP, no Postgres, no router. Harness style mirrors src/test-export.ts.
 *
 * Run: npx tsx src/test-exportAssembler.ts   (from server/)
 *
 * Covers:
 *  - empty user  — owns nothing -> empty manifest (domains [], outbox 0, media
 *    [], billing defaulted to "none"); still ok:true.
 *  - full user   — every surface populated -> manifest carries the opaque domain
 *    envelopes verbatim, the outbox COUNT (not bodies), media REFS only, and the
 *    billing summary.
 *  - owner-isolation — readers keyed by userId never return another user's rows;
 *    the manifest's generated_for == the requested user and contains only theirs.
 *  - reader failure — any rejecting reader -> { ok:false, reason }, no throw,
 *    and runExportJob does NOT mark the job ready on a failed assemble.
 *  - writer wiring — runExportJob flips the job ready (owner-scoped) only on a
 *    clean assemble; a writer failure surfaces as { ok:false } without throwing.
 */

import {
  assembleExport,
  runExportJob,
  type BillingReader,
  type BlobBackupReader,
  type ExportBilling,
  type ExportDomainBlob,
  type ExportJobWriter,
  type ExportMediaRef,
  type ExportReaders,
  type MediaReader,
  type OutboxReader,
} from "./workers/exportAssembler";

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`ok   ${label}`);
  } else {
    failures++;
    console.log(`FAIL ${label}${detail !== undefined ? ` — ${detail}` : ""}`);
  }
}

// ── in-memory fakes (owner-scoped, same contracts as the deploy impls) ────────

class FakeBlobReader implements BlobBackupReader {
  // userId -> that user's domain blobs
  private byUser = new Map<string, ExportDomainBlob[]>();
  fail = false;
  set(userId: string, blobs: ExportDomainBlob[]): void {
    this.byUser.set(userId, blobs);
  }
  async allDomains(userId: string): Promise<readonly ExportDomainBlob[]> {
    if (this.fail) throw new Error("blob_reader_down");
    // owner-scoped: ONLY this user's rows, never another's
    return this.byUser.get(userId) ?? [];
  }
}

class FakeOutboxReader implements OutboxReader {
  private byUser = new Map<string, unknown[]>();
  fail = false;
  set(userId: string, entries: unknown[]): void {
    this.byUser.set(userId, entries);
  }
  async all(userId: string): Promise<readonly unknown[]> {
    if (this.fail) throw new Error("outbox_reader_down");
    return this.byUser.get(userId) ?? [];
  }
}

class FakeMediaReader implements MediaReader {
  private byUser = new Map<string, ExportMediaRef[]>();
  fail = false;
  set(userId: string, refs: ExportMediaRef[]): void {
    this.byUser.set(userId, refs);
  }
  async list(userId: string): Promise<readonly ExportMediaRef[]> {
    if (this.fail) throw new Error("media_reader_down");
    return this.byUser.get(userId) ?? [];
  }
}

class FakeBillingReader implements BillingReader {
  private byUser = new Map<string, ExportBilling>();
  fail = false;
  set(userId: string, b: ExportBilling): void {
    this.byUser.set(userId, b);
  }
  async get(userId: string): Promise<ExportBilling | null> {
    if (this.fail) throw new Error("billing_reader_down");
    return this.byUser.get(userId) ?? null;
  }
}

class FakeJobWriter implements ExportJobWriter {
  // job_id -> { user_id, url } that the worker readied
  readied = new Map<string, { user_id: string; url: string }>();
  fail = false;
  async markReady(userId: string, jobId: string, signedUrl: string): Promise<void> {
    if (this.fail) throw new Error("writer_down");
    // owner-scoped in the real impl (keyed on user_id+job_id); we record both
    this.readied.set(jobId, { user_id: userId, url: signedUrl });
  }
}

function freshReaders(): {
  deps: ExportReaders;
  blobs: FakeBlobReader;
  outbox: FakeOutboxReader;
  media: FakeMediaReader;
  billing: FakeBillingReader;
} {
  const blobs = new FakeBlobReader();
  const outbox = new FakeOutboxReader();
  const media = new FakeMediaReader();
  const billing = new FakeBillingReader();
  return { deps: { blobs, outbox, media, billing }, blobs, outbox, media, billing };
}

// ── fixtures ──────────────────────────────────────────────────────────────────

const A = "user_A";
const B = "user_B";

const A_DOMAINS: ExportDomainBlob[] = [
  { domain: "garage", format: 3, state: { cars: ["mp11"] }, updated_at: "2026-06-10T08:00:00.000Z" },
  { domain: "tracks", format: 1, state: [{ id: "t1" }], updated_at: "2026-06-10T09:00:00.000Z" },
  { domain: "sheets:mp11", format: 2, state: { fields: { camber: -2 } }, updated_at: "2026-06-10T10:00:00.000Z" },
];
const A_OUTBOX: unknown[] = [{ id: "ob-1" }, { id: "ob-2" }, { id: "ob-3" }, { id: "ob-4" }];
const A_MEDIA: ExportMediaRef[] = [
  { media_id: "m1", mime: "image/jpeg", bytes: 12345, created_at: "2026-06-11T00:00:00.000Z" },
  { media_id: "m2", mime: "application/pdf", bytes: 67890, created_at: "2026-06-11T01:00:00.000Z" },
];
const A_BILLING: ExportBilling = { status: "active", current_period_end: "2026-07-01T00:00:00.000Z" };

// B's data is DISTINCT — used to prove no cross-user bleed.
const B_DOMAINS: ExportDomainBlob[] = [
  { domain: "garage", format: 9, state: { secret: "B-only" }, updated_at: "2026-06-12T00:00:00.000Z" },
];
const B_MEDIA: ExportMediaRef[] = [
  { media_id: "B-secret-media", mime: "image/png", bytes: 999, created_at: "2026-06-12T00:00:00.000Z" },
];
const B_BILLING: ExportBilling = { status: "expired", current_period_end: "2026-05-01T00:00:00.000Z" };

// ═══ empty user ════════════════════════════════════════════════════════════════

console.log("— empty user —");
{
  const { deps } = freshReaders(); // nothing set for anyone
  const r = await assembleExport(A, deps);
  check("empty: assemble ok", r.ok === true);
  if (r.ok) {
    check("empty: generated_for is the requested user", r.archive.generated_for === A);
    check("empty: no domains", r.archive.domains.length === 0);
    check("empty: outbox_count 0", r.archive.outbox_count === 0);
    check("empty: no media", r.archive.media.length === 0);
    check(
      "empty: billing defaults to none/null (not omitted)",
      r.archive.billing.status === "none" && r.archive.billing.current_period_end === null,
    );
  }
}

// ═══ full user ═════════════════════════════════════════════════════════════════

console.log("\n— full user —");
{
  const { deps, blobs, outbox, media, billing } = freshReaders();
  blobs.set(A, A_DOMAINS);
  outbox.set(A, A_OUTBOX);
  media.set(A, A_MEDIA);
  billing.set(A, A_BILLING);

  const r = await assembleExport(A, deps);
  check("full: assemble ok", r.ok === true);
  if (r.ok) {
    const arc = r.archive;
    check("full: generated_for == A", arc.generated_for === A);
    check("full: all 3 domains present", arc.domains.length === 3);

    // opaque envelopes carried VERBATIM (format/state untouched)
    const garage = arc.domains.find((d) => d.domain === "garage");
    check(
      "full: domain envelope verbatim (format + opaque state)",
      garage?.format === 3 &&
        JSON.stringify(garage?.state) === JSON.stringify({ cars: ["mp11"] }) &&
        garage?.updated_at === "2026-06-10T08:00:00.000Z",
    );
    check("full: sheets:<carId> domain included", arc.domains.some((d) => d.domain === "sheets:mp11"));

    // outbox is a COUNT, not the bodies
    check("full: outbox_count == journal length (count, not bodies)", arc.outbox_count === 4);
    check("full: manifest carries no outbox bodies", !("outbox" in (arc as unknown as Record<string, unknown>)));

    // media are REFS only — refs carry no byte payload, just pointers/metadata
    check("full: 2 media refs", arc.media.length === 2);
    check(
      "full: media ref shape is pointer-only (id/mime/bytes/created_at)",
      arc.media.every(
        (m) =>
          typeof m.media_id === "string" &&
          typeof m.mime === "string" &&
          typeof m.bytes === "number" &&
          typeof m.created_at === "string" &&
          !("data" in (m as unknown as Record<string, unknown>)) &&
          !("url" in (m as unknown as Record<string, unknown>)),
      ),
    );

    // billing summary passed through
    check(
      "full: billing summary (status + current_period_end)",
      arc.billing.status === "active" && arc.billing.current_period_end === "2026-07-01T00:00:00.000Z",
    );
  }

  // defensive copy: mutating the reader's array later must not change the manifest
  if (r.ok) {
    A_DOMAINS.push({ domain: "logbook", format: 1, state: {}, updated_at: "x" });
    check("full: manifest domains are a snapshot (not aliased to reader state)", r.archive.domains.length === 3);
    A_DOMAINS.pop(); // restore fixture
  }
}

// ═══ owner-isolation ═══════════════════════════════════════════════════════════

console.log("\n— owner-isolation —");
{
  const { deps, blobs, outbox, media, billing } = freshReaders();
  // both A and B own data in the SAME readers
  blobs.set(A, A_DOMAINS);
  outbox.set(A, A_OUTBOX);
  media.set(A, A_MEDIA);
  billing.set(A, A_BILLING);
  blobs.set(B, B_DOMAINS);
  media.set(B, B_MEDIA);
  billing.set(B, B_BILLING);

  const rA = await assembleExport(A, deps);
  const rB = await assembleExport(B, deps);
  check("iso: both assemble ok", rA.ok === true && rB.ok === true);

  if (rA.ok && rB.ok) {
    // A's archive contains ONLY A's rows — none of B's distinct markers
    const aStr = JSON.stringify(rA.archive);
    check("iso: A's archive generated_for == A", rA.archive.generated_for === A);
    check("iso: A's archive has none of B's domain state", !aStr.includes("B-only"));
    check("iso: A's archive has none of B's media", !aStr.includes("B-secret-media"));
    check("iso: A's billing is A's, not B's", rA.archive.billing.status === "active");

    // and symmetrically B sees only B
    const bStr = JSON.stringify(rB.archive);
    check("iso: B's archive generated_for == B", rB.archive.generated_for === B);
    check("iso: B's archive has only B's single domain", rB.archive.domains.length === 1);
    check("iso: B's archive has none of A's data", !bStr.includes("mp11") && !bStr.includes("ob-1"));
    check("iso: B's outbox_count is B's own (0 here, A had 4)", rB.archive.outbox_count === 0);
  }
}

// ═══ reader failure -> { ok:false } (no throw, never marks ready) ══════════════

console.log("\n— reader failure —");
{
  for (const which of ["blobs", "outbox", "media", "billing"] as const) {
    const { deps, blobs, outbox, media, billing } = freshReaders();
    blobs.set(A, A_DOMAINS);
    outbox.set(A, A_OUTBOX);
    media.set(A, A_MEDIA);
    billing.set(A, A_BILLING);
    ({ blobs, outbox, media, billing })[which].fail = true;

    let threw = false;
    let r: Awaited<ReturnType<typeof assembleExport>> | undefined;
    try {
      r = await assembleExport(A, deps);
    } catch {
      threw = true;
    }
    check(`fail(${which}): did NOT throw across the boundary`, threw === false);
    check(`fail(${which}): -> { ok:false, reason }`, r !== undefined && r.ok === false && typeof (r as { reason?: unknown }).reason === "string");
  }

  // bad user id -> ok:false before any read
  const { deps } = freshReaders();
  const rEmpty = await assembleExport("", deps);
  check("fail: empty userId -> ok:false bad_user_id", rEmpty.ok === false && (rEmpty as { reason?: string }).reason === "bad_user_id");
}

// ═══ runExportJob: writer wiring ═══════════════════════════════════════════════

console.log("\n— runExportJob writer wiring —");
{
  const URL = "https://blob.example/exp/user_A/archive.zip?sig=abc";

  // happy path: clean assemble -> job readied owner-scoped with the signed url
  {
    const { deps, blobs, outbox, media, billing } = freshReaders();
    blobs.set(A, A_DOMAINS);
    outbox.set(A, A_OUTBOX);
    media.set(A, A_MEDIA);
    billing.set(A, A_BILLING);
    const writer = new FakeJobWriter();

    const r = await runExportJob(A, "job-A-1", URL, deps, writer);
    check("run: clean assemble -> ok:true", r.ok === true);
    check("run: job marked ready with the signed url", writer.readied.get("job-A-1")?.url === URL);
    check("run: markReady was owner-scoped (user_id == A)", writer.readied.get("job-A-1")?.user_id === A);
  }

  // failed assemble -> job NOT readied (stays pending)
  {
    const { deps, blobs } = freshReaders();
    blobs.fail = true;
    const writer = new FakeJobWriter();
    const r = await runExportJob(A, "job-A-2", URL, deps, writer);
    check("run: failed assemble -> ok:false", r.ok === false);
    check("run: failed assemble does NOT mark the job ready", writer.readied.has("job-A-2") === false);
  }

  // writer failure -> surfaced as ok:false, no throw
  {
    const { deps, blobs, outbox, media, billing } = freshReaders();
    blobs.set(A, A_DOMAINS);
    outbox.set(A, A_OUTBOX);
    media.set(A, A_MEDIA);
    billing.set(A, A_BILLING);
    const writer = new FakeJobWriter();
    writer.fail = true;
    let threw = false;
    let r: Awaited<ReturnType<typeof runExportJob>> | undefined;
    try {
      r = await runExportJob(A, "job-A-3", URL, deps, writer);
    } catch {
      threw = true;
    }
    check("run: writer failure did NOT throw", threw === false);
    check("run: writer failure -> ok:false", r !== undefined && r.ok === false);
  }
}

// ═══ verdict ═══════════════════════════════════════════════════════════════════

console.log(failures === 0 ? "\nEXPORT-ASSEMBLER: all checks passed" : `\nEXPORT-ASSEMBLER: ${failures} failures`);
if (failures > 0) process.exitCode = 1;
