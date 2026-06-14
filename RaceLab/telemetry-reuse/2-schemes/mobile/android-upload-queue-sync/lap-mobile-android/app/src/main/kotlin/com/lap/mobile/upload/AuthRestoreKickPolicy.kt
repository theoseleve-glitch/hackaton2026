package com.lap.mobile.upload

/**
 * Coarse "do we have a usable bearer token?" view of the auth layer.
 *  - [Authenticated]: [TokenProvider.current] (T149) returns a non-null
 *    token, requests will carry `Authorization: Bearer …`.
 *  - [Anonymous]: no token (signed out, expired with no refresh).
 *    Authenticated upload calls would 401 immediately.
 *
 * Mid-session [TokenProvider.refresh] cycles do *not* leave this enum
 * — both pre- and post-refresh are [Authenticated] from the upload
 * layer's perspective, which is exactly what [AuthRestoreKickPolicy]
 * wants (no kick on silent token rotation).
 */
enum class AuthState { Authenticated, Anonymous }

/**
 * Pure-Kotlin policy: given the previous and current [AuthState],
 * should we kick the upload worker now?
 *
 * Rule: kick exactly on transitions *into* [AuthState.Authenticated]
 * — either from [AuthState.Anonymous] (fresh login or post-logout
 * re-login) or from a `null` prior (the first observation right after
 * the auth observer subscribes at app launch with a cached session).
 *
 * Why this matters: while logged out, [AuthInterceptor] (T149) still
 * forwards the request without a token; the server returns 401, the
 * orchestrator (T155) classifies that as a retryable failure and the
 * row stays `queued` with [BackoffSchedule] (T154) deadlines pushed
 * out. Without an auth-restore kick, those rows would wait until
 * [WorkManager]'s next periodic poll before retrying — minutes of
 * "I logged in, why aren't my uploads going?" UX dead time. With the
 * kick, they retry on the very next event-loop tick after the token
 * lands.
 *
 * Symmetric to [ConnectivityKickPolicy] (T165) — both implement the
 * same "transition into a positive state" pattern but stay separate
 * so each can evolve independently (e.g., auth might later add a
 * "kick only if there are queued rows worth waking" check that
 * doesn't apply to network).
 */
object AuthRestoreKickPolicy {
    fun shouldKickQueue(previous: AuthState?, current: AuthState): Boolean =
        current == AuthState.Authenticated && previous != AuthState.Authenticated
}
