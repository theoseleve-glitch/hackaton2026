package com.lap.mobile.coaching

import kotlin.time.Duration

/**
 * Disk-cache contract for the compiled rules bundle (T211 — port
 * of the desktop Python
 * `datalogger.coaching.rules_engine.RuleBundleCache`).
 *
 * T213 implements this with a Room-backed table (per the sprint
 * task description: "Room-backed, TTL 7 days, signature-verified").
 * T212's resolution orchestrator depends on the interface, not
 * the impl, so test fakes (in-memory cache) can substitute
 * without touching Room.
 *
 * `suspend` from day one — Room requires off-main-thread access
 * and Room's KSP-generated code is suspending. T213 inherits that
 * without retrofitting.
 *
 * Behaviour contract (mirrors desktop):
 *   - Missing / corrupt / TTL-expired → return `null` (cold-start
 *     by re-fetching from server, no user intervention).
 *   - Signature mismatch on otherwise-fresh-and-parseable cache →
 *     throw [RuleBundleException.Cache] (tampering signal worth
 *     escalating, distinct from a routine miss).
 *
 * The raw payload persists verbatim so signature verification
 * works byte-for-byte (HMAC over re-encoded JSON would break if
 * key ordering / whitespace differed across encoders).
 */
interface RuleBundleCache {
    /**
     * Persist [rawPayload] (and optional [signature]) to disk
     * with a `cachedAt` timestamp.
     *
     * @param rawPayload the verbatim server response bytes (UTF-8
     *   string). Stored as-is so signature verification round-
     *   trips byte-for-byte.
     * @param signature server-emitted HMAC / signature for
     *   tamper detection. Empty string disables verification on
     *   subsequent loads — appropriate for dev/staging.
     */
    suspend fun save(rawPayload: String, signature: String = "")

    /**
     * Load the cached bundle.
     *
     * @param maxAge optional TTL window. If non-null and the
     *   cache entry is older, return `null` (caller cold-starts).
     *   `null` skips the age check (used by callers that accept
     *   stale cache as fallback).
     * @param verifier optional `(payload, signature) -> Boolean`
     *   callback for signature verification. `null` skips the
     *   check (dev / staging / fresh-fetch). A mismatched
     *   signature throws [RuleBundleException.Cache].
     * @return [CachedBundle] on success, `null` if the cache is
     *   missing / corrupt / over TTL / payload-no-longer-parseable.
     * @throws RuleBundleException.Cache on signature mismatch
     *   (tampering signal, NOT a routine miss).
     */
    suspend fun load(
        maxAge: Duration? = null,
        verifier: ((rawPayload: String, signature: String) -> Boolean)? = null,
    ): CachedBundle?
}

/**
 * One bundle loaded back from the on-disk cache, paired with the
 * verbatim raw payload (so signature verification works byte-for-
 * byte) and the timestamp of when it was cached.
 */
data class CachedBundle(
    val bundle: RuleBundle,
    val rawPayload: String,
    /**
     * ISO 8601 UTC timestamp of when the entry was persisted.
     */
    val cachedAt: String,
)
