/**
 * Media maintenance — pure planning helpers for two background concerns the
 * audit flagged. These are WORKERS/UTILS: invoked by the deploy cron/queue or
 * by a handler, NOT HTTP routes (no router wiring). Same house style as the
 * stores (src/stores/*.ts): pure, deterministic, every clock/TTL injected,
 * zero committed runtime deps, zero node built-ins, never throw across the
 * public boundary — both functions return a discriminated/plain plan the
 * caller acts on.
 *
 * (1) exifStripPlan(media): the GDPR/privacy gate before a binary enters a
 *     SHARED ("Strava of RC", D10) artifact. Raster photos carry EXIF GPS that
 *     would leak a user's home/track location to everyone the share reaches, so
 *     image/jpeg + image/webp MUST be stripped before they can join a share
 *     snapshot. PDFs and any non-shared (private) media pass untouched. This
 *     returns a PLAN ONLY — the actual EXIF byte rewrite is a deploy image lib
 *     (sharp / a serverless image function); this function never touches bytes,
 *     it decides whether the rewrite step is required.
 *
 * (2) presignSweep(rows, now, ttl_ms): the reclaim plan for ABANDONED presigns.
 *     POST /api/media/upload-url reserves quota at presign time (mediaStore
 *     atomic insert) and presigns a short-lived PUT; if the client never
 *     completes the upload, the accounting row is never confirmed yet still
 *     counts against the user's quota forever (audit finding). This returns the
 *     ids of UNCONFIRMED rows whose presign is OLDER than the TTL, so the cron
 *     can delete them (freeing the reserved quota). Confirmed rows are real
 *     bytes and are NEVER swept; recent unconfirmed rows are still in their
 *     upload window and are kept. Deterministic: `now` is injected, never read
 *     from the clock here.
 */

// ── (1) EXIF strip plan ───────────────────────────────────────────────────────

/** The minimal media descriptor the EXIF gate needs. `mime` is the upload-time
 *  allowlisted type; `shared` is true IFF this binary is destined for a
 *  SHARED/public artifact (a share snapshot). Private/local media => false. */
export interface MediaDescriptor {
  mime: string;
  /** Destined for a SHARED/public artifact (share snapshot)? Private => false. */
  shared: boolean;
}

/** Why a strip is / isn't required — a stable machine-readable reason, not prose. */
export type ExifStripReason =
  | "shared_raster_strip_gps" // shared jpeg/webp: GPS must be removed before publish
  | "not_shared" // private/local media: never published, nothing to leak
  | "mime_carries_no_exif_gps"; // pdf / non-raster: no EXIF GPS to strip

export interface ExifStripPlan {
  /** true => the deploy image lib MUST rewrite the bytes to drop EXIF GPS
   *  before this media may enter a share snapshot. false => pass as-is. */
  strip: boolean;
  reason: ExifStripReason;
}

/** Raster image types that can carry EXIF GPS. Kept in lockstep with the
 *  upload allowlist's image entries (uploadUrl ALLOWED_MIME). PNG is
 *  intentionally absent: it has no EXIF GPS tag, so it needs no strip. */
const EXIF_GPS_BEARING_MIME: ReadonlySet<string> = new Set(["image/jpeg", "image/webp"]);

/**
 * Decide whether EXIF GPS must be stripped before `media` may enter a share
 * snapshot. PLAN ONLY — the byte rewrite is a deploy concern.
 *
 *   - shared jpeg/webp        -> { strip: true,  reason: "shared_raster_strip_gps" }
 *   - NOT shared (any mime)   -> { strip: false, reason: "not_shared" }
 *   - shared pdf / non-raster -> { strip: false, reason: "mime_carries_no_exif_gps" }
 *
 * `shared` is checked FIRST so a private upload is never flagged regardless of
 * mime; mime is normalized (trimmed + lowercased, parameters like
 * "image/jpeg; charset=…" dropped) so casing/charset variants don't slip GPS
 * through. Never throws.
 */
export function exifStripPlan(media: MediaDescriptor): ExifStripPlan {
  // Private media is never published, so there is nothing to leak — no strip,
  // independent of mime. Checking `shared` first keeps the privacy gate cheap
  // and makes the "not_shared" reason unambiguous.
  if (!media.shared) {
    return { strip: false, reason: "not_shared" };
  }

  const mime = normalizeMime(media.mime);
  if (EXIF_GPS_BEARING_MIME.has(mime)) {
    return { strip: true, reason: "shared_raster_strip_gps" };
  }

  // Shared, but a type that carries no EXIF GPS (pdf, png, …) — pass untouched.
  return { strip: false, reason: "mime_carries_no_exif_gps" };
}

/** Lowercase + trim a mime and drop any parameters ("; charset=…") so
 *  "IMAGE/JPEG" and "image/jpeg; x=y" both match the bearer set. */
function normalizeMime(raw: string): string {
  const semi = raw.indexOf(";");
  const base = semi === -1 ? raw : raw.slice(0, semi);
  return base.trim().toLowerCase();
}

// ── (2) abandoned-presign sweep ───────────────────────────────────────────────

/** The accounting-row shape the sweep reads. Mirrors the media table's
 *  identity + lifecycle columns (mediaStore): `id` is the row key, `created_at`
 *  is when the presign was issued, `confirmed` is true once the client's upload
 *  has been verified (the byte commit). Extra columns are ignored. */
export interface PresignRow {
  id: string;
  /** ISO-8601 instant the presign/accounting row was created. */
  created_at: string;
  /** true once the upload is confirmed (real bytes); false = still pending. */
  confirmed: boolean;
}

/**
 * Return the ids of UNCONFIRMED presign rows whose age (now - created_at)
 * EXCEEDS `ttl_ms`, i.e. abandoned reservations the cron should reclaim so they
 * stop consuming the user's quota.
 *
 * Rules:
 *   - confirmed row              -> KEPT (real bytes; never swept)
 *   - unconfirmed, age <= ttl    -> KEPT (still inside its upload window)
 *   - unconfirmed, age  > ttl    -> SWEPT (returned)
 *
 * Boundary: a row at EXACTLY ttl_ms is KEPT (strict `>` — it has not yet
 * exceeded the window). A row with an unparseable `created_at` is KEPT
 * (fail-safe: never delete quota on bad data). `now` is injected, so the
 * result is deterministic. Ids are returned in input order. Never throws.
 */
export function presignSweep(
  rows: readonly PresignRow[],
  now: string,
  ttl_ms: number,
): string[] {
  const nowMs = Date.parse(now);
  // Guard a bad `now` or non-positive TTL: sweeping on garbage could delete a
  // user's live quota, so refuse rather than risk it (fail-safe -> nothing).
  if (Number.isNaN(nowMs) || !Number.isFinite(ttl_ms) || ttl_ms < 0) {
    return [];
  }

  const swept: string[] = [];
  for (const row of rows) {
    if (row.confirmed) continue; // real bytes — never reclaim

    const createdMs = Date.parse(row.created_at);
    if (Number.isNaN(createdMs)) continue; // unparseable -> keep (fail-safe)

    const ageMs = nowMs - createdMs;
    // strictly older than the TTL: exactly-ttl is still inside the window (kept)
    if (ageMs > ttl_ms) swept.push(row.id);
  }
  return swept;
}
