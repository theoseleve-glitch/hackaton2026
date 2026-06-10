package com.lap.mobile.coaching

/**
 * Where the bundle came from on this load (T211 — port of the
 * desktop Python `datalogger.coaching.rules_engine.BundleSource`).
 *
 * Drives the dashboard's "rules out of date" banner UX:
 *   - [FRESH_SERVER]: just fetched from server. No banner.
 *   - [FRESH_CACHE]:  cache hit within TTL. No banner — coaching
 *     is current.
 *   - [STALE_CACHE]:  cache hit outside TTL (server unreachable
 *     and cache too old). Banner the user — coaching may miss
 *     recently-shipped rules.
 *   - [NO_BUNDLE]:    no cache at all and server unreachable.
 *     Empty-state UX (not a banner) — coaching simply doesn't
 *     run this session.
 *
 * The four-way distinction matters because each case calls for a
 * different UX response: silent (fresh), warning banner (stale),
 * or empty-state placeholder (no bundle). Collapsing to a
 * boolean would force the UI to special-case the no-bundle path
 * separately anyway — better to lock the four cases in the type.
 */
enum class BundleSource {
    FRESH_SERVER,
    FRESH_CACHE,
    STALE_CACHE,
    NO_BUNDLE,
    ;

    /**
     * `true` only when coaching is running on an out-of-TTL cache
     * — the only state that warrants a "rules out of date" warning
     * banner. NO_BUNDLE has its own empty-state UX (coaching simply
     * isn't available), not a banner.
     */
    val shouldShowStaleBanner: Boolean
        get() = this == STALE_CACHE
}

/**
 * Result of a bundle-resolution attempt — the [bundle] paired
 * with the [source] that produced it. [bundle] is `null` only
 * when [source] is [BundleSource.NO_BUNDLE].
 *
 * Mirrors the desktop's `BundleResolution` dataclass so the
 * resolution-orchestration logic (T212's fetcher composing with
 * T213's cache) can produce the same shape.
 */
data class BundleResolution(
    val bundle: RuleBundle?,
    val source: BundleSource,
)
