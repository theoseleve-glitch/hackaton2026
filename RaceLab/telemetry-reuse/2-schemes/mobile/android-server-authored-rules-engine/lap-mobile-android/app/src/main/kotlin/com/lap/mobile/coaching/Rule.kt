package com.lap.mobile.coaching

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/**
 * One coaching rule from the server-authored bundle (T211 — port
 * of the desktop Python `datalogger.coaching.rules_engine.Rule`).
 *
 * Server is the source of truth: rules are authored as YAML
 * (per ADR-013), compiled to JSON server-side, and shipped to
 * clients via the rules-bundle endpoint (T212 fetches, T213 caches).
 * Mobile and desktop both consume the same wire format — drift in
 * either client breaks the contract.
 *
 * Why [condition] and [insight] are [JsonObject], not Kotlin sealed
 * types or `Map<String, Any>`:
 *   - The condition is a recursive DSL (
 *     `{type: "and", conditions: [{type: "feature_threshold", ...}]}`)
 *     owned by [T214's runtime evaluator]. Locking a Kotlin sealed
 *     type for it now would force schema rework as the operator set
 *     evolves.
 *   - The insight payload is owned by [T217's prompt renderer]. T211
 *     should not pre-empt that schema decision.
 *   - [JsonObject] is type-safe ("definitely a JSON map") without
 *     committing to either DSL — the same opaque-dict shape the
 *     desktop spec uses (`dict[str, Any]`).
 *
 * [minCorroboratingLaps] defaults to 1 (no corroboration needed).
 * Noisy detectors ship with N > 1 explicitly to opt into the
 * corroboration gate that future tasks will implement (mirrors
 * desktop `CorroborationGate`).
 */
@Serializable
data class Rule(
    val id: String,
    val category: String,
    val condition: JsonObject,
    val insight: JsonObject,
    @SerialName("min_corroborating_laps")
    val minCorroboratingLaps: Int = 1,
    /**
     * Platform / context tags this rule opts into (T216). Used by
     * [subsetForMobileRealLife] to load only the rules tagged
     * `"mobile_real_life"` and drop desktop/simulator-only rules
     * that would either no-op (no relevant features computed) or
     * fire spuriously on mobile.
     *
     * Defaults to `emptyList()` so existing bundles parse without
     * the field; lapJson's `encodeDefaults = false` keeps the
     * field off the wire when unused. Mirrors the desktop spec's
     * forward-compat policy.
     *
     * STRICT opt-in semantics: an untagged rule is excluded from
     * the mobile subset (server author has to consciously add the
     * tag). Permissive default ("untagged means everywhere") was
     * rejected because a noisy desktop-tuned rule accidentally
     * firing in the recording foreground service is a regression
     * worth catching at filter time.
     */
    @SerialName("applicable_to")
    val applicableTo: List<String> = emptyList(),
)
