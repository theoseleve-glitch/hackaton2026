/** Verifies the anonymous marketing-events collector: the conversion events
 * + pageview POST to PUBLIC_API_URL/api/v1/marketing-events alongside PostHog,
 * with no cookies/PII, and no-op when PUBLIC_API_URL is unset. (Plan D4) */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const captureMock = vi.fn();
vi.mock('posthog-js', () => ({ default: { capture: captureMock } }));

const fetchMock = vi.fn();

beforeEach(() => {
  captureMock.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('PUBLIC_API_URL', 'https://api.lap-coach.racing');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('marketing-collector', () => {
  test('postMarketingEvents POSTs anonymous batch to the collector endpoint', async () => {
    const { postMarketingEvents } = await import('../scripts/marketing-collector');
    postMarketingEvents([{ event: 'pricing_viewed', path: '/pricing' }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.lap-coach.racing/api/v1/marketing-events');
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect(init.credentials).toBeUndefined(); // no cookies sent
    const body = JSON.parse(init.body);
    expect(body.events[0].event).toBe('pricing_viewed');
    expect(body.events[0].path).toBe('/pricing');
  });

  test('body carries only anonymous fields (no id/PII/identifier keys)', async () => {
    const { postMarketingEvents } = await import('../scripts/marketing-collector');
    postMarketingEvents([{ event: 'signup_clicked', properties: { source: 'homepage' } }]);
    const init = fetchMock.mock.calls[0][1];
    const body = JSON.parse(init.body);
    const ev = body.events[0];
    // Only ever the anonymous whitelist — never an id/PII/identifier key.
    const allowed = new Set(['event', 'path', 'properties']);
    expect(Object.keys(ev).every((k) => allowed.has(k))).toBe(true);
    expect(ev.event).toBe('signup_clicked');
    expect(ev.properties).toEqual({ source: 'homepage' });
  });

  test('no-ops (no fetch) when PUBLIC_API_URL is unset', async () => {
    vi.stubEnv('PUBLIC_API_URL', '');
    const { postMarketingEvents } = await import('../scripts/marketing-collector');
    postMarketingEvents([{ event: 'pricing_viewed' }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('no-ops on empty batch', async () => {
    const { postMarketingEvents } = await import('../scripts/marketing-collector');
    postMarketingEvents([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('caps the batch at 50 events', async () => {
    const { postMarketingEvents } = await import('../scripts/marketing-collector');
    postMarketingEvents(Array.from({ length: 80 }, () => ({ event: 'pageview' })));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.events.length).toBe(50);
  });

  test('a failing fetch is swallowed (never throws)', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    const { postMarketingEvents } = await import('../scripts/marketing-collector');
    expect(() => postMarketingEvents([{ event: 'pageview' }])).not.toThrow();
  });

  test('postMarketingPageview posts a single pageview event', async () => {
    const { postMarketingPageview } = await import('../scripts/marketing-collector');
    postMarketingPageview();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.events.length).toBe(1);
    expect(body.events[0].event).toBe('pageview');
  });
});

describe('marketing-events helpers fire BOTH PostHog and collector', () => {
  test('capturePricingViewed → posthog + collector', async () => {
    const { capturePricingViewed } = await import('../scripts/marketing-events');
    capturePricingViewed();
    expect(captureMock).toHaveBeenCalledWith('pricing_viewed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.events[0].event).toBe('pricing_viewed');
  });

  test('captureSignupClicked → posthog + collector with source', async () => {
    const { captureSignupClicked } = await import('../scripts/marketing-events');
    captureSignupClicked('homepage');
    expect(captureMock).toHaveBeenCalledWith('signup_clicked', { source: 'homepage' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.events[0].event).toBe('signup_clicked');
    expect(body.events[0].properties.source).toBe('homepage');
  });

  test('captureDemoViewed → posthog + collector with source', async () => {
    const { captureDemoViewed } = await import('../scripts/marketing-events');
    captureDemoViewed('demo-page');
    expect(captureMock).toHaveBeenCalledWith('demo_viewed', { source: 'demo-page' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.events[0].event).toBe('demo_viewed');
    expect(body.events[0].properties.source).toBe('demo-page');
  });
});

describe('waitlist + download helpers fire BOTH PostHog and collector', () => {
  test('captureWaitlistSubmittedFromUrl → posthog + collector', async () => {
    const { captureWaitlistSubmittedFromUrl } = await import('../scripts/waitlist-events');
    const fired = captureWaitlistSubmittedFromUrl('?status=submitted');
    expect(fired).toBe(true);
    expect(captureMock).toHaveBeenCalledWith('waitlist_submitted');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.events[0].event).toBe('waitlist_submitted');
  });

  test('captureWaitlistSubmittedFromUrl without status → neither fires', async () => {
    const { captureWaitlistSubmittedFromUrl } = await import('../scripts/waitlist-events');
    const fired = captureWaitlistSubmittedFromUrl('?foo=bar');
    expect(fired).toBe(false);
    expect(captureMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('captureWaitlistConfirmed → posthog + collector', async () => {
    const { captureWaitlistConfirmed } = await import('../scripts/waitlist-events');
    captureWaitlistConfirmed();
    expect(captureMock).toHaveBeenCalledWith('waitlist_confirmed');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.events[0].event).toBe('waitlist_confirmed');
  });

  test('captureDownloadClicked → posthog + collector with props', async () => {
    const { captureDownloadClicked } = await import('../scripts/download-events');
    captureDownloadClicked({ platform: 'windows', source: 'product-desktop' });
    expect(captureMock).toHaveBeenCalledWith('download_clicked', {
      platform: 'windows',
      source: 'product-desktop',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.events[0].event).toBe('download_clicked');
    expect(body.events[0].properties).toEqual({
      platform: 'windows',
      source: 'product-desktop',
    });
  });
});
