// Anonymous first-party marketing-events collector. Mirrors the PostHog
// conversion events into our own Postgres via POST /api/v1/marketing-events
// (Phase D / spec §7.3). HARD ANONYMITY: no cookies, no credentials, no PII —
// the server persists no IP/UA/identifier; we only ever send
// { event, path?, properties? }. No-ops when PUBLIC_API_URL is unset/empty or
// when `fetch` is unavailable. All errors are swallowed: anonymous telemetry
// must never break the page.

export interface MarketingEvent {
  event: string;
  path?: string;
  properties?: Record<string, unknown>;
}

const MAX_BATCH = 50;

export function postMarketingEvents(events: MarketingEvent[]): void {
  if (!events || events.length === 0) return;

  const base = import.meta.env.PUBLIC_API_URL as string | undefined;
  if (typeof base !== 'string' || base.length === 0) return; // collector disabled
  if (typeof fetch === 'undefined') return;

  // Whitelist exactly the anonymous fields — never forward anything else a
  // caller might have hung on the object (hard anonymity guarantee).
  const batch = events.slice(0, MAX_BATCH).map((e) => ({
    event: e.event,
    path:
      e.path ??
      (typeof window !== 'undefined' ? window.location.pathname : undefined),
    properties: e.properties ?? {},
  }));

  try {
    // No `credentials` → no cookies. keepalive lets the request survive a
    // navigation (e.g. signup_clicked that immediately leaves the page).
    void fetch(`${base}/api/v1/marketing-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: batch }),
      keepalive: true,
    }).catch(() => {
      /* anonymous telemetry must never break the page */
    });
  } catch {
    /* swallow — never throw from telemetry */
  }
}

/** Convenience for a single anonymous pageview (called on module load). */
export function postMarketingPageview(): void {
  postMarketingEvents([{ event: 'pageview' }]);
}
