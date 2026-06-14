package com.lap.mobile.coaching

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull

/**
 * Session-feature snapshot consumed by [evaluateCondition] /
 * [evaluateBundle] (T214 — Kotlin port of the desktop's
 * `dict[str, Any]` features parameter).
 *
 * `Map<String, Any?>` mirrors the desktop's loose typing so the
 * SessionCoordinator hook (T215) can drop in raw feature values
 * (Int, Long, Float, Double, computed metrics) without per-call
 * casting. The evaluator narrows to [Number] internally; non-
 * numeric / missing values collapse to "rule sits dormant"
 * (returns false rather than throw) — a metric not yet computed
 * for this lap shouldn't crash the engine.
 *
 * Booleans are NOT coerced to numbers: `true == 1` would silently
 * fire range checks against bool flags, so the [Number] cast
 * skips Boolean (Kotlin's [Boolean] is not a [Number] subtype,
 * unlike Python where `isinstance(True, int)` returns true and
 * the desktop has to explicitly test for it).
 */
typealias SessionFeatures = Map<String, Any?>

private val COMPARISONS: Map<String, (Double, Double) -> Boolean> = mapOf(
    "lt" to { a, b -> a < b },
    "lte" to { a, b -> a <= b },
    "gt" to { a, b -> a > b },
    "gte" to { a, b -> a >= b },
    "eq" to { a, b -> a == b },
)

/**
 * Evaluate every rule in [bundle] against [features] and return
 * coaching insights for the rules that fired (T214 — Kotlin port
 * of the desktop `evaluate_bundle`).
 *
 * Order preserves bundle order so downstream UI consumers see a
 * deterministic stream. T215's SessionCoordinator hook will run
 * this once per lap-end event, hand the result to the
 * corroboration gate (future task), and dispatch surviving
 * insights to the prompt composable (T217).
 *
 * Per the desktop spec: keep allocation-light. The output list
 * is the only allocation per call.
 */
fun evaluateBundle(bundle: RuleBundle, features: SessionFeatures): List<CoachingInsight> = bundle.rules
    .filter { evaluateCondition(it.condition, features) }
    .map { CoachingInsight(ruleId = it.id, payload = it.insight) }

/**
 * Evaluate a single rule's [condition] DSL against [features]
 * (T214 — Kotlin port of the desktop `evaluate_condition`).
 *
 * Supported operator types (`condition["type"]`):
 *   - `"feature_threshold"`: `{feature, comparison, value}`.
 *     Comparisons: `lt` / `lte` / `gt` / `gte` / `eq`.
 *     Missing or non-numeric feature → false (dormant).
 *   - `"and"` / `"or"`: `{conditions: [...]}`. Children are
 *     themselves conditions, evaluated recursively. Empty
 *     children list collapses to vacuous-true (`and`) /
 *     vacuous-false (`or`) per Kotlin's `all([]) / any([])`.
 *
 * Unknown operator types and malformed conditions throw
 * [RuleBundleException.Condition] — those are server-side bugs
 * that should surface during dev rather than silently no-fire
 * (which would become an invisible coaching gap).
 */
fun evaluateCondition(condition: JsonObject, features: SessionFeatures): Boolean {
    val opType = (condition["type"] as? JsonPrimitive)?.contentOrNull
    return when (opType) {
        "feature_threshold" -> evaluateFeatureThreshold(condition, features)
        "and" -> requireChildren(condition, opType).all { evaluateCondition(it, features) }
        "or" -> requireChildren(condition, opType).any { evaluateCondition(it, features) }
        else -> throw RuleBundleException.Condition("unsupported condition type: '$opType'")
    }
}

private fun evaluateFeatureThreshold(condition: JsonObject, features: SessionFeatures): Boolean {
    val feature = (condition["feature"] as? JsonPrimitive)?.contentOrNull
    val comparison = (condition["comparison"] as? JsonPrimitive)?.contentOrNull
    val threshold = (condition["value"] as? JsonPrimitive)?.doubleOrNull
    if (feature == null || comparison == null || threshold == null) {
        throw RuleBundleException.Condition(
            "feature_threshold requires feature, comparison, value",
        )
    }
    val op = COMPARISONS[comparison]
        ?: throw RuleBundleException.Condition("unsupported comparison: '$comparison'")
    val featureValue = features[feature] as? Number ?: return false
    return op(featureValue.toDouble(), threshold)
}

private fun requireChildren(condition: JsonObject, opType: String): List<JsonObject> {
    val children = condition["conditions"] as? JsonArray
        ?: throw RuleBundleException.Condition("$opType requires 'conditions' list")
    return children.map { child ->
        child as? JsonObject
            ?: throw RuleBundleException.Condition("$opType child must be an object")
    }
}
