import { init as sentryInit, type BrowserOptions } from '@sentry/browser';

// The `Integration` type lives in @sentry/core (not re-exported from
// @sentry/browser in v10). Since this profile always emits an empty
// integrations array — Sentry's baked-in defaults are enough — we keep
// the type local with `unknown[]` and cast at the init boundary.
export interface SentryInitOptions {
  dsn: string;
  environment: string;
  integrations: unknown[];
  tracesSampleRate: number;
}

/**
 * Sentry init options locked to the error-capture-only profile suitable for a
 * static marketing site. The defaults Sentry bakes in (GlobalHandlers,
 * Breadcrumbs, LinkedErrors, Dedupe) still catch window.onerror and
 * unhandled promise rejections — we just do not opt in to BrowserTracing
 * (performance monitoring) or the Replay integration, both of which would
 * more-than-double the client bundle footprint without serving the use case.
 *
 * The bundle-size tension versus PostHog (T014) is tracked in ADR-019. If
 * that revisit trigger fires, the first lever is to keep this file and swap
 * PostHog first — Sentry stays cheap.
 */
export function sentryInitOptions(dsn: string, environment?: string): SentryInitOptions {
  return {
    dsn,
    environment: environment && environment.length > 0 ? environment : 'production',
    integrations: [],
    tracesSampleRate: 0,
  };
}

export function initSentry(): void {
  const dsn = import.meta.env.PUBLIC_SENTRY_DSN;
  if (typeof dsn !== 'string' || dsn.length === 0) return;
  const env = import.meta.env.PUBLIC_SENTRY_ENV as string | undefined;
  sentryInit(sentryInitOptions(dsn, env) as BrowserOptions);
}

if (typeof window !== 'undefined') {
  initSentry();
}
