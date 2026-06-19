package com.lap.mobile.coaching

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Versioned, server-authored bundle of coaching rules (T211 — port
 * of the desktop Python `datalogger.coaching.rules_engine.RuleBundle`).
 *
 * Per ADR-009: the coaching library (80-150 rules) is compiled to
 * a portable format at server-side, fetched by clients at session-
 * start, and executed locally for sub-500ms latency. The bundle is
 * the unit of distribution — versioned via [bundleId] / [compiledAt]
 * so cache freshness can be compared.
 *
 * Wire-format alignment with the Python source-of-truth:
 *   - [schemaVersion] ↔ `schema_version` (semver string)
 *   - [bundleId] ↔ `bundle_id` (server-generated identifier)
 *   - [compiledAt] ↔ `compiled_at` (ISO 8601 UTC timestamp)
 *   - [rules] ↔ `rules` (list of [Rule])
 *
 * String comparison on [compiledAt] for "is this newer than my cache?"
 * works because ISO 8601 sorts lexicographically when zones are
 * consistent — the server stamps everything in UTC. Same approach
 * desktop's `is_bundle_newer_than_cache` uses.
 *
 * Forward-compat by design: [com.lap.mobile.core.lapJson] has
 * `ignoreUnknownKeys = true`, so unknown top-level fields parse
 * silently. The server can add metadata (signatures, telemetry
 * hints) without forcing a coordinated client release.
 */
@Serializable
data class RuleBundle(
    @SerialName("schema_version")
    val schemaVersion: String,
    @SerialName("bundle_id")
    val bundleId: String,
    @SerialName("compiled_at")
    val compiledAt: String,
    val rules: List<Rule>,
)
