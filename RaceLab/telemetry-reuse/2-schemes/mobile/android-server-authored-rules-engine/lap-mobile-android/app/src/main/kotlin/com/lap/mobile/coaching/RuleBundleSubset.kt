package com.lap.mobile.coaching

/**
 * Rule [Rule.applicableTo] tag declaring "this rule is appropriate
 * for live coaching during a real-life mobile recording session"
 * (T216).
 *
 * Mirrors the server's tag vocabulary published via the rules-bundle
 * (per ADR-013 server is the source of truth for rule authoring).
 * Other tags the server may emit (`desktop`, `simulator`,
 * `post_session_only`, …) are filtered out by [subsetForMobileRealLife].
 */
const val MOBILE_REAL_LIFE_TAG: String = "mobile_real_life"

/**
 * Returns [bundle] with its [RuleBundle.rules] filtered to only
 * those tagged with [MOBILE_REAL_LIFE_TAG] (T216 — bundle-size
 * reduction at consumer side).
 *
 * Why a separate post-load filter rather than wire-format
 * negotiation (e.g., `?applicable_to=mobile_real_life` query param):
 *   - The cache (T213) stores a single canonical bundle byte-for-byte
 *     so [com.lap.mobile.coaching.RuleBundleCache] signature
 *     verification works against whatever the server signed; per-
 *     client subsets would need per-client signatures.
 *   - The wire payload is small enough (80-150 rules ≈ a few KB)
 *     that bandwidth isn't the bottleneck — the savings are in
 *     evaluator iteration count per session-end and in foreground-
 *     thread allocation.
 *   - One bundle for both clients keeps the desktop/mobile JSON
 *     contract (T211 invariant) drift-free.
 *
 * STRICT opt-in: a rule with NO `applicable_to` tag is excluded.
 * An untagged rule lives in an undefined platform context — it's
 * safer to require explicit opt-in than to default-include and
 * surprise the user with a noisy fire from a desktop-tuned threshold.
 *
 * Bundle metadata ([RuleBundle.schemaVersion], [RuleBundle.bundleId],
 * [RuleBundle.compiledAt]) is preserved verbatim — the subset is
 * the same logical bundle with fewer rules, not a derived bundle
 * with a new identity. T215's audit log can still tag insights
 * with the source `bundleId` correctly.
 */
fun subsetForMobileRealLife(bundle: RuleBundle): RuleBundle = bundle.copy(
    rules = bundle.rules.filter { MOBILE_REAL_LIFE_TAG in it.applicableTo },
)
