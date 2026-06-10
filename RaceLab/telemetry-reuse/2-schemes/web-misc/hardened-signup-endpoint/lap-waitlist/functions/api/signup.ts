/**
 * POST /api/signup
 *
 * Defense layers (closes audit findings F-015, F-016, F-017, F-018, F-021, F-022, F-023, F-020):
 *   1. onRequest gate — only POST passes through; everything else gets 405
 *   2. Content-Type whitelist — must start with application/json (else 415)
 *   3. Content-Length cap — body > 2048 bytes is rejected with 413
 *   4. Rate limit — 10 POSTs / 60s per IP. Prefer the Workers Rate Limiting
 *      binding when present; otherwise fall back to a D1-backed sliding window
 *      over the rate_limit_log table (migration 0002). Same budget either way.
 *      Closes F-017 + F-025. Probabilistic 1% per-request cleanup keeps the
 *      table bounded without a scheduled Worker.
 *   5. NFKC normalization + metachar rejection on email (closes F-019, F-022)
 *   6. Tighter EMAIL_REGEX — ASCII local part, ASCII letters in TLD (closes F-022)
 *   7. Uniform `{success: true}` response on both fresh + duplicate (closes F-015, F-016)
 *   8. Structured JSON logging on Resend failure + email_send_failed_at column
 *      stamped on the signup row so a future retry Worker can locate it via
 *      `WHERE email_send_failed_at IS NOT NULL` (closes F-020 — retry/DLQ is
 *      a separate P1 piece of work).
 */

interface RateLimit {
  limit: (opts: { key: string }) => Promise<{ success: boolean }>;
}

interface Env {
  WAITLIST_DB: D1Database;
  RATE_LIMITER?: RateLimit;
  RESEND_API_KEY?: string;
  RESEND_FROM_ADDRESS?: string;
}

interface SignupRequest {
  email?: unknown;
  source?: unknown;
}

interface SignupResponse {
  success: boolean;
  error?:
    | 'invalid_request'
    | 'invalid_email'
    | 'too_many_requests'
    | 'unsupported_method'
    | 'server_error';
}

// Tighter than the previous regex. ASCII local-part (RFC-5322 common subset),
// ASCII domain, ASCII TLD 2-63 chars. Excludes the long tail of Unicode/IDN
// addresses but that's acceptable for a waitlist (operators can hand-add edge
// cases). Pairs with FORBIDDEN_CHARS as belt + suspenders.
const EMAIL_REGEX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,63}$/;

// Reject inputs that look like injection vectors. None of these characters
// legitimately appear in any RFC-5322 simple address.
const FORBIDDEN_CHARS = /[<>"\\\/\s\0;()]/;

const FROM_DEFAULT = 'LAP Coach <team@lap-coach.racing>';
const MAX_BODY_SIZE = 2048;

// Single entry point — Pages Functions resolves onRequest as catch-all,
// onRequestX as method-specific. We use onRequest so non-POST methods get
// an explicit 405 instead of falling through to the static index.html (which
// would happen with method-specific handlers + Pages SPA-fallback default).
export const onRequest: PagesFunction<Env> = async (ctx) => {
  if (ctx.request.method !== 'POST') {
    return json(405, { success: false, error: 'unsupported_method' });
  }

  try {
    // Layer 2 — Content-Type whitelist
    const ct = (ctx.request.headers.get('content-type') || '').toLowerCase();
    if (!ct.startsWith('application/json')) {
      return json(415, { success: false, error: 'invalid_request' });
    }

    // Layer 3 — Body size cap (cheap defense vs. mem/CPU exhaustion)
    const lenHeader = ctx.request.headers.get('content-length');
    const len = lenHeader ? parseInt(lenHeader, 10) : 0;
    if (len > MAX_BODY_SIZE) {
      return json(413, { success: false, error: 'invalid_request' });
    }

    // Layer 4 — Rate limit. Prefer the Workers Rate Limiting binding (zero
    // RTT, in-Worker counter) when the dashboard has provisioned it; the
    // Pages API silently ignores unsafe.bindings PATCH so we can't set this
    // from code. Otherwise fall back to a D1-backed sliding window — one
    // extra round-trip per request, but it works without operator action.
    const ip = ctx.request.headers.get('cf-connecting-ip') || 'unknown';
    if (ctx.env.RATE_LIMITER) {
      const { success: allowed } = await ctx.env.RATE_LIMITER.limit({ key: ip });
      if (!allowed) {
        return json(429, { success: false, error: 'too_many_requests' });
      }
    } else if (ip !== 'unknown') {
      const limited = await checkD1RateLimit(ctx.env.WAITLIST_DB, ip, ctx.waitUntil.bind(ctx));
      if (limited) {
        return json(429, { success: false, error: 'too_many_requests' });
      }
    }

    // Parse body
    const body = (await ctx.request.json().catch(() => null)) as SignupRequest | null;
    if (!body || typeof body.email !== 'string') {
      return json(400, { success: false, error: 'invalid_request' });
    }

    // Layer 5 — Normalize then reject metacharacters
    const email = body.email.trim().toLowerCase().normalize('NFKC');
    if (FORBIDDEN_CHARS.test(email)) {
      return json(400, { success: false, error: 'invalid_email' });
    }

    // Layer 6 — Format check + length cap
    if (!EMAIL_REGEX.test(email) || email.length > 254) {
      return json(400, { success: false, error: 'invalid_email' });
    }

    const source =
      typeof body.source === 'string' && body.source.length > 0
        ? body.source.slice(0, 64)
        : null;

    let position: number | null = null;
    let alreadySignedUp = false;

    try {
      const inserted = await ctx.env.WAITLIST_DB.prepare(
        'INSERT INTO waitlist_signups (email, source) VALUES (?1, ?2) RETURNING id',
      )
        .bind(email, source)
        .first<{ id: number }>();
      position = inserted?.id ?? null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/UNIQUE|constraint failed/i.test(msg)) {
        alreadySignedUp = true;
      } else {
        throw err;
      }
    }

    // Fire confirmation email only for fresh signups (no duplicate sends).
    if (!alreadySignedUp && ctx.env.RESEND_API_KEY && position != null) {
      ctx.waitUntil(sendConfirmationEmail(ctx.env, email, position));
    }

    // Layer 7 — Uniform response. No position, no alreadySignedUp signal.
    // Both fresh and duplicate look identical to the unauthenticated caller.
    return json(200, { success: true });
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'signup_handler_unexpected_error',
        message: err instanceof Error ? err.message : String(err),
      }),
    );
    return json(500, { success: false, error: 'server_error' });
  }
};

/**
 * D1-based sliding-window rate limiter — fallback when the Workers Rate
 * Limiting binding is unavailable (Pages API doesn't expose unsafe.bindings).
 *
 * Two correctness traps the 2026-05-19 hammer test exposed:
 *   1. Check-then-insert races: 15 parallel calls all see count=0, all insert,
 *      none get 429. Fix: insert FIRST, then count — and do both in a D1 batch
 *      so the pair runs atomically at the D1 transaction layer.
 *   2. ts in epoch SECONDS + (ip, ts) PRIMARY KEY meant same-second bursts
 *      silently deduped via INSERT OR IGNORE → count stays at 1. Migration
 *      0003 drops the PK and switches ts to epoch milliseconds; INSERT can
 *      now record every attempt, so the count is honest.
 *
 * Returns true if the request should be blocked, false if it can proceed.
 * Side-effect: every call inserts (ip, now_ms); 1% of calls schedule a
 * background DELETE of rows > 1h old to keep the table bounded.
 */
async function checkD1RateLimit(
  db: D1Database,
  ip: string,
  waitUntil: (p: Promise<unknown>) => void,
): Promise<boolean> {
  const nowMs = Date.now();
  const windowStartMs = nowMs - 60_000;

  // Atomic INSERT + COUNT. D1 batches run in a single SQLite transaction —
  // so even with 15 batches arriving in parallel, the COUNT in batch N sees
  // every INSERT from batches 1..N. After 10 inserts, batch 11's COUNT
  // returns 11 and we return true.
  const results = await db.batch([
    db
      .prepare('INSERT INTO rate_limit_log (ip, ts) VALUES (?1, ?2)')
      .bind(ip, nowMs),
    db
      .prepare('SELECT COUNT(*) AS n FROM rate_limit_log WHERE ip = ?1 AND ts > ?2')
      .bind(ip, windowStartMs),
  ]);
  const count = (results[1].results?.[0] as { n: number } | undefined)?.n ?? 0;

  // Bound the table without a cron Worker: 1% of requests sweep rows > 1h old.
  // Run in waitUntil so it doesn't add latency to the user-visible response.
  if (Math.random() < 0.01) {
    waitUntil(
      db
        .prepare('DELETE FROM rate_limit_log WHERE ts < ?1')
        .bind(nowMs - 3_600_000)
        .run(),
    );
  }

  return count > 10;
}

async function sendConfirmationEmail(
  env: Env,
  to: string,
  position: number,
): Promise<void> {
  if (!env.RESEND_API_KEY) return;
  const from = env.RESEND_FROM_ADDRESS || FROM_DEFAULT;
  const subject = "You're on the LAP Coach waitlist — see you June 8";

  const html = renderConfirmationHtml(position);
  const text = renderConfirmationText(position);

  // Single attempt — Resend itself retries on transient 5xx internally.
  // Persistent failures (auth, rate-limit, bad sender) get structured-logged.
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html, text }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    // Structured log — pipe to Workers Analytics Engine / Logflare for alerting.
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'resend_send_failed',
        status: res.status,
        position,
        detail: detail.slice(0, 500),
      }),
    );

    // Stamp the signup row so a future retry/DLQ Worker can locate failed
    // sends without scanning all rows. Best-effort — if this write fails we
    // log it and move on; we don't want a logging failure to mask the
    // upstream Resend failure.
    try {
      await env.WAITLIST_DB.prepare(
        "UPDATE waitlist_signups SET email_send_failed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE email = ?1",
      )
        .bind(to)
        .run();
    } catch (e) {
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'email_failure_stamp_failed',
          message: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  }
}

function renderConfirmationHtml(position: number): string {
  const headline = `WAITLIST POSITION #${position}`;
  const tierLine = `First come, first served. The first 50 to subscribe on June 8 lock in €14.90/month for life — that's the Founding 50. After that, standard pricing applies.`;
  const ctaLine = `We'll email you 15 minutes before doors open, so you have a head start.`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>You're on the LAP Coach waitlist</title>
</head>
<body style="margin:0;padding:0;background:#000000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#F0EDE5;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#000000;">
  <tr><td align="center" style="padding:48px 24px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="480" style="max-width:480px;width:100%;">
      <tr><td align="center" style="padding-bottom:36px;">
        <span style="font-family:'Bebas Neue',Impact,'Bahnschrift Condensed',Arial,sans-serif;font-size:28px;font-weight:400;letter-spacing:0.06em;color:#F0EDE5;">LAP COACH<span style="color:#C9A84C;">.</span></span>
      </td></tr>
      <tr><td style="padding-bottom:24px;">
        <h1 style="margin:0;font-family:'Bebas Neue',Impact,'Bahnschrift Condensed',Arial,sans-serif;font-size:44px;font-weight:400;line-height:1;letter-spacing:0.02em;color:#F0EDE5;">${headline}</h1>
      </td></tr>
      <tr><td style="padding-bottom:16px;">
        <p style="margin:0;font-size:16px;line-height:1.55;color:#F0EDE5;">The LAP Coach founding cohort opens <strong style="color:#F0EDE5;">Monday June 8, 2026 at 10:00 CET</strong>.</p>
      </td></tr>
      <tr><td style="padding-bottom:16px;">
        <p style="margin:0;font-size:16px;line-height:1.55;color:#F0EDE5;">${tierLine}</p>
      </td></tr>
      <tr><td style="padding-bottom:24px;">
        <p style="margin:0;font-size:16px;line-height:1.55;color:#F0EDE5;">${ctaLine}</p>
      </td></tr>
      <tr><td style="padding-bottom:36px;">
        <p style="margin:0;font-size:14px;line-height:1.55;color:#949494;">In the meantime: <a href="https://instagram.com/lap.racing" style="color:#C9A84C;text-decoration:none;">@lap.racing</a> on Instagram</p>
      </td></tr>
      <tr><td style="border-top:1px solid #2a2a2a;padding-top:24px;">
        <p style="margin:0;font-size:11px;line-height:1.55;color:#949494;letter-spacing:0.05em;">LAP COACH &middot; MOTORSPORT INTELLIGENCE</p>
        <p style="margin:4px 0 0 0;font-size:11px;line-height:1.55;color:#949494;"><a href="https://lap-coach.racing" style="color:#949494;text-decoration:none;">lap-coach.racing</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function renderConfirmationText(position: number): string {
  const headline = `WAITLIST POSITION #${position}`;
  const tierLine = `First come, first served. The first 50 to subscribe on June 8 lock in EUR 14.90/month for life - that's the Founding 50. After that, standard pricing applies.`;
  const ctaLine = `We'll email you 15 minutes before doors open, so you have a head start.`;
  return `${headline}

The LAP Coach founding cohort opens Monday June 8, 2026 at 10:00 CET.

${tierLine}

${ctaLine}

In the meantime: instagram.com/lap.racing (@lap.racing)

—
LAP COACH · MOTORSPORT INTELLIGENCE
lap-coach.racing
`;
}

function json(status: number, body: SignupResponse): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
