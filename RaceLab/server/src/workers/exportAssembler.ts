/**
 * exportAssembler — the OUT-OF-BAND WORKER half of the GDPR data-export right
 * (Art. 20 portability). The handler in handlers/dataExport.ts only mints the
 * 'pending' export_jobs row; THIS worker (invoked by the deploy queue/cron after
 * that row lands) gathers EVERYTHING the user owns into one manifest, then flips
 * the job to 'ready' with the signed-archive url via an injected writer seam.
 *
 * Pure function over INJECTED seams (the project convention — zero committed
 * runtime deps, no node built-ins beyond types, all I/O injected): the readers
 * below are the only ways this module touches data, and every one is
 * OWNER-SCOPED by userId. There is no global/cross-user read anywhere on this
 * path — the archive is the user's OWN data (that's the point of portability),
 * but it must never sweep in another user's rows.
 *
 * NOT an HTTP route: no router wiring, no requireAuth — the caller (queue/cron)
 * has already authorized the job. Never throws across the public boundary: a
 * reader failure is caught and surfaced as { ok:false, reason } (and the job is
 * NOT marked ready — the handler's GET keeps reporting 'pending' until a retry
 * succeeds or a separate failer flips it to 'failed').
 *
 * What lands in the archive manifest:
 *  - domains: every whole-domain backup blob the user owns (D11 — garage /
 *    tracks / logbook / reports / account + sheets:<carId>), each as its OPAQUE
 *    {format, state} envelope, verbatim (the server never reads/migrates state).
 *  - outbox_count: how many backup_entries (the append-only outbox journal) the
 *    user has — a count, not the bodies (the domains blobs already carry the
 *    materialized state; the journal is restore-cursor plumbing).
 *  - media: REFERENCES only (media_id / mime / bytes / created_at) — NOT bytes.
 *    Signed download urls for the binaries are generated separately at delivery
 *    time (the bytes live in object storage, never flow through this worker).
 *  - billing: the subscription summary (status + current_period_end) — the
 *    user's own billing facts, nothing more.
 */

// ── injected reader seams (minimal, owner-scoped) ─────────────────────────────

/** One whole-domain backup blob in the export (D11 opaque envelope, verbatim). */
export interface ExportDomainBlob {
  /** garage | tracks | logbook | reports | account | sheets:<carId>. */
  domain: string;
  /** Client envelope schema version — opaque to the server. */
  format: number;
  /** Whole-domain snapshot, passed through VERBATIM (never read/migrated). */
  state: unknown;
  /** Optimistic-concurrency cursor when the blob was snapshotted. */
  updated_at: string;
}

/** Reads ALL of one user's backup-blob domains. OWNER-SCOPED by userId. */
export interface BlobBackupReader {
  /** Every domain blob this user owns (any order). [] when the user has none. */
  allDomains(userId: string): Promise<readonly ExportDomainBlob[]>;
}

/** Reads the user's outbox journal (backup_entries). OWNER-SCOPED by userId. */
export interface OutboxReader {
  /** All outbox entries for this user (we keep the COUNT, not the bodies). */
  all(userId: string): Promise<readonly unknown[]>;
}

/** A media reference in the export — a pointer, NOT the bytes. */
export interface ExportMediaRef {
  media_id: string;
  mime: string;
  bytes: number;
  created_at: string;
}

/** Reads the user's media accounting rows. OWNER-SCOPED by userId. */
export interface MediaReader {
  /** Every media ref this user owns. [] when none. Bytes are NOT included —
   *  signed urls for the binaries are generated separately at delivery. */
  list(userId: string): Promise<readonly ExportMediaRef[]>;
}

/** The user's own billing summary (subscription status snapshot). */
export interface ExportBilling {
  /** 'active' | 'canceled' | 'expired', or 'none' when the user never subscribed. */
  status: string;
  /** Paid-through instant; null = no subscription / no expiry asserted. */
  current_period_end: string | null;
}

/** Reads the user's subscription summary. OWNER-SCOPED by userId. */
export interface BillingReader {
  /** The user's subscription summary, or null when they never subscribed. */
  get(userId: string): Promise<ExportBilling | null>;
}

/** Flips the export_jobs row to 'ready' with the signed-archive url. The url is
 *  produced by the delivery step (archive uploaded to object storage) and is
 *  outside this worker's concern — the writer is injected. OWNER-SCOPED: the
 *  implementation keys on (user_id, job_id) so the worker can never ready
 *  another user's job. */
export interface ExportJobWriter {
  markReady(userId: string, jobId: string, signedUrl: string): Promise<void>;
}

/** The four readers the assembler gathers from. */
export interface ExportReaders {
  blobs: BlobBackupReader;
  outbox: OutboxReader;
  media: MediaReader;
  billing: BillingReader;
}

// ── archive manifest (the assembled result) ───────────────────────────────────

/** The structured GDPR export manifest for one user. */
export interface ExportArchive {
  /** The user the archive was assembled for (proves owner-scoping in the file). */
  generated_for: string;
  /** Every whole-domain backup blob the user owns (opaque envelopes, verbatim). */
  domains: readonly ExportDomainBlob[];
  /** How many outbox (backup_entries) rows the user has — a count, not bodies. */
  outbox_count: number;
  /** Media REFERENCES (not bytes); signed urls generated separately. */
  media: readonly ExportMediaRef[];
  /** The user's own billing summary. Always present (defaulted when no sub). */
  billing: ExportBilling;
}

/** Discriminated result — never throws across this boundary (project rule). */
export type AssembleResult =
  | { ok: true; archive: ExportArchive }
  | { ok: false; reason: string };

/** Billing default when the user never subscribed (Art. 20 still answers: a
 *  truthful "no subscription on file" rather than an omitted field). */
const NO_BILLING: ExportBilling = { status: "none", current_period_end: null };

/**
 * Assemble the full GDPR export manifest for one user from owner-scoped readers.
 * Pure: the only effects are the injected reads. Any reader rejection is caught
 * and returned as { ok:false, reason } — the caller decides retry-vs-fail and
 * leaves the job 'pending' on a transient miss (it is NOT marked ready here).
 *
 * Every read passes the SAME userId; there is no path that reads another user's
 * rows, so the manifest can only ever contain `userId`'s own data.
 */
export async function assembleExport(
  userId: string,
  deps: ExportReaders,
): Promise<AssembleResult> {
  if (typeof userId !== "string" || userId === "") {
    return { ok: false, reason: "bad_user_id" };
  }
  try {
    // Gather every owned surface concurrently — all four are owner-scoped reads
    // keyed on the SAME userId, so there is no cross-user blending possible.
    const [domains, outbox, media, billing] = await Promise.all([
      deps.blobs.allDomains(userId),
      deps.outbox.all(userId),
      deps.media.list(userId),
      deps.billing.get(userId),
    ]);

    const archive: ExportArchive = {
      generated_for: userId,
      domains: domains.slice(), // defensive copy — caller can't mutate reader state
      outbox_count: outbox.length,
      media: media.slice(),
      billing: billing ?? NO_BILLING,
    };
    return { ok: true, archive };
  } catch (err) {
    // Never throw across the boundary: surface the failure as a result. The
    // message is the user's OWN failure context (no other user's data here).
    const reason = err instanceof Error ? err.message : "reader_failure";
    return { ok: false, reason };
  }
}

/**
 * The full worker step: assemble the archive, then (only on success) mark the
 * job ready with the signed url via the injected writer. `signedUrl` is the
 * already-uploaded archive location produced by the delivery step — generating
 * it (uploading the manifest bytes, signing) is OUT of this worker's scope, by
 * design, so the worker stays a pure-ish orchestration over injected seams.
 *
 * Returns the assemble result so the caller can log/observe it. On a failed
 * assemble the job is left untouched (still 'pending') — a markFailed seam, if
 * the deploy wants one, is the caller's concern, not this pure assembler's.
 * markReady is owner-scoped (keyed on user_id + job_id in the impl), so the
 * worker can never ready a job that isn't this user's.
 */
export async function runExportJob(
  userId: string,
  jobId: string,
  signedUrl: string,
  deps: ExportReaders,
  writer: ExportJobWriter,
  /** Optional allow-list of host suffixes the signed url MUST belong to (e.g.
   *  ["blob.vercel-storage.com", "s3.amazonaws.com"]). When provided, a url whose
   *  host doesn't match is rejected BEFORE it is written — so a caller can't park
   *  a phishing/exfil link on the user's export. Omit to skip the host check
   *  (the scheme + parseability check below always runs). */
  allowedHostSuffixes?: readonly string[],
): Promise<AssembleResult> {
  const result = await assembleExport(userId, deps);
  if (!result.ok) return result;

  // Validate the signed url BEFORE persisting it (audit MED: "caller-supplied
  // with no expiry/domain check"). It is surfaced to the user as a download link,
  // so a malformed / non-https / off-domain url must never be stored.
  const urlError = validateSignedUrl(signedUrl, allowedHostSuffixes);
  if (urlError !== null) return { ok: false, reason: urlError };

  try {
    await writer.markReady(userId, jobId, signedUrl);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "mark_ready_failure";
    return { ok: false, reason };
  }
  return result;
}

/** Returns null when `url` is an acceptable signed archive location, else a
 *  machine-readable reason. Requires a parseable HTTPS url; when
 *  `allowedHostSuffixes` is given the host must end with one of them. Never
 *  throws. */
function validateSignedUrl(url: string, allowedHostSuffixes?: readonly string[]): string | null {
  if (typeof url !== "string" || url === "") return "signed_url_empty";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "signed_url_unparseable";
  }
  if (parsed.protocol !== "https:") return "signed_url_not_https";
  if (allowedHostSuffixes !== undefined && allowedHostSuffixes.length > 0) {
    const host = parsed.hostname.toLowerCase();
    const ok = allowedHostSuffixes.some((suf) => {
      const s = suf.toLowerCase();
      return host === s || host.endsWith(`.${s}`);
    });
    if (!ok) return "signed_url_host_not_allowed";
  }
  return null;
}
