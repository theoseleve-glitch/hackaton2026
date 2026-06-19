package com.lap.mobile.coaching

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/**
 * Severity tier for [InsightPromptPayload] driving the prompt
 * card's color theming and accessibility priority cue (T217).
 *
 * Three levels match the typical noise-floor → urgency mapping
 * for in-session coaching:
 *   - [LOW]: nice-to-know hint, neutral surface color
 *   - [MEDIUM]: standard coaching tip, accent color (default
 *     when payload omits severity or ships an unknown value)
 *   - [HIGH]: safety-relevant or repeated-error escalation,
 *     error-container color
 *
 * Forward-compat policy: an unknown severity string from the
 * server (e.g., new "critical" tier added later) falls back to
 * MEDIUM so the prompt still renders rather than silently
 * dropping. Critical-tier UI ships in a coordinated client
 * release later; until then the user sees the insight as a
 * normal-priority tip.
 */
enum class InsightSeverity { LOW, MEDIUM, HIGH }

/**
 * Renderable form of [CoachingInsight] that the bottom-sheet
 * Compose card (T217) consumes — typed extraction from the
 * opaque [CoachingInsight.payload] [JsonObject].
 *
 * Required fields are non-blank `title` and `body`. The opaque
 * JsonObject schema is owned by T217 (per T211's CoachingInsight
 * KDoc), so this data class IS the wire-format contract for the
 * payload from the server's rule-author UI:
 *
 * ```json
 * {
 *   "title": "Late braking at Turn 3",
 *   "body": "Try braking 30m earlier to carry more apex speed.",
 *   "severity": "medium"
 * }
 * ```
 *
 * Server-side YAML rule authoring + Pydantic schema (per ADR-013)
 * lives in lap-backend. The mobile contract is defined here.
 */
data class InsightPromptPayload(
    val ruleId: String,
    val title: String,
    val body: String,
    val severity: InsightSeverity,
)

/**
 * Extract a renderable [InsightPromptPayload] from a [CoachingInsight]
 * (T217 kernel — pure function, no Compose dependency).
 *
 * Returns `null` when required fields are missing, blank, or the
 * wrong JSON type. The composable layer skips rendering on null
 * rather than showing a half-broken card or crashing — a server
 * bug that emits a malformed payload should not interrupt the
 * recording UX (the rule won't fire useful coaching this lap, but
 * recording continues normally).
 *
 * Severity defaults to [InsightSeverity.MEDIUM] when missing,
 * blank, or an unknown string. See [InsightSeverity] KDoc for
 * the forward-compat rationale (server can add "critical" tier
 * without coordinated client release; until client supports it,
 * it renders as MEDIUM).
 */
fun parseInsightPromptPayload(
    insight: CoachingInsight,
    skillLevel: UserSkillLevel = UserSkillLevel.DEFAULT,
): InsightPromptPayload? {
    val title = (insight.payload["title"] as? JsonPrimitive)
        ?.takeIf { it.isString }
        ?.contentOrNull
        ?.takeIf { it.isNotBlank() }
        ?: return null
    val body = extractBodyForSkillLevel(insight.payload, skillLevel) ?: return null
    val severity = parseSeverityOrMedium(insight.payload["severity"])
    return InsightPromptPayload(
        ruleId = insight.ruleId,
        title = title,
        body = body,
        severity = severity,
    )
}

private fun extractBodyForSkillLevel(payload: JsonObject, skillLevel: UserSkillLevel): String? {
    // T221 schema: `bodies` object keyed by lowercase tier name.
    // Takes precedence over flat `body` so a partial-rollout
    // window where the server ships both can still serve newer
    // skill-aware clients the right variant.
    val bodies = payload["bodies"] as? JsonObject
    if (bodies != null) {
        return selectBodyByTier(bodies, skillLevel)
    }
    // T217 schema: flat `body` string. Forward-compat with payloads
    // shipped before T221's bodies field landed.
    return (payload["body"] as? JsonPrimitive)
        ?.takeIf { it.isString }
        ?.contentOrNull
        ?.takeIf { it.isNotEmpty() }
}

private fun selectBodyByTier(bodies: JsonObject, skillLevel: UserSkillLevel): String? {
    val direct = bodies.getStringBody(skillLevel.name.lowercase())
    if (direct != null) return direct
    // Missing user's tier → fall back to INTERMEDIATE (broadest-
    // applicable safe default — see UserSkillLevel.DEFAULT KDoc).
    val intermediate = bodies.getStringBody(UserSkillLevel.DEFAULT.name.lowercase())
    if (intermediate != null) return intermediate
    // Last resort: any non-empty string body in the object so a
    // partial-bodies rule (e.g., only beginner+expert shipped)
    // still renders something.
    return bodies.values.firstNotNullOfOrNull { element ->
        (element as? JsonPrimitive)
            ?.takeIf { it.isString }
            ?.contentOrNull
            ?.takeIf { it.isNotEmpty() }
    }
}

private fun JsonObject.getStringBody(key: String): String? = (this[key] as? JsonPrimitive)
    ?.takeIf { it.isString }
    ?.contentOrNull
    ?.takeIf { it.isNotEmpty() }

private fun parseSeverityOrMedium(raw: kotlinx.serialization.json.JsonElement?): InsightSeverity {
    val text = (raw as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull
        ?: return InsightSeverity.MEDIUM
    return when (text.lowercase()) {
        "low" -> InsightSeverity.LOW
        "medium" -> InsightSeverity.MEDIUM
        "high" -> InsightSeverity.HIGH
        else -> InsightSeverity.MEDIUM
    }
}
