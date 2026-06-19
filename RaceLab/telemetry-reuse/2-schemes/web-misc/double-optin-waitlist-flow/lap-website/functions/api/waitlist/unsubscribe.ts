// T100 — GET /api/waitlist/unsubscribe — soft opt-out for waitlist
// drip recipients. Verifies the per-contact HMAC-signed unsubscribe
// token (no expiry — GDPR Article 7 requires withdrawal-as-easy-as-
// consent), PATCHes the contact in the Resend audience to set
// `unsubscribed: true`, then 303s to /waitlist/unsubscribed.
//
// Why PATCH `unsubscribed: true` instead of DELETE: soft opt-out
// preserves the audit trail (consent → opt-out timeline visible in
// Resend's UI), which is what GDPR auditors expect. Right-to-
// erasure (Article 17) is a separate process that DOES delete and
// is handled out-of-band.
//
// Failure routing mirrors T095's confirm handler:
//   * Token failure → 303 → /waitlist?status=invalid (one shape,
//     no oracle for the format).
//   * Resend 5xx → 502 (signal retry-later).
//   * Env missing → 500 (server misconfigured).

import { verifyUnsubscribeToken } from '../../_lib/waitlist-token';

interface UnsubscribeEnv {
  RESEND_API_KEY: string;
  RESEND_AUDIENCE_ID: string;
  WAITLIST_TOKEN_SECRET: string;
}

interface PagesFunctionContext {
  request: Request;
  env: UnsubscribeEnv;
}

const INVALID_REDIRECT = '/waitlist?status=invalid';
const UNSUBSCRIBED_REDIRECT = '/waitlist/unsubscribed';

function redirect(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: location },
  });
}

export async function onRequestGet(context: PagesFunctionContext): Promise<Response> {
  const { request, env } = context;

  if (!env.RESEND_API_KEY || !env.RESEND_AUDIENCE_ID || !env.WAITLIST_TOKEN_SECRET) {
    return new Response('Server misconfigured', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token) {
    return redirect(INVALID_REDIRECT);
  }

  const verified = await verifyUnsubscribeToken(token, env.WAITLIST_TOKEN_SECRET);
  if (!verified) {
    return redirect(INVALID_REDIRECT);
  }

  // Resend's contact endpoint takes the email (URL-encoded) in the
  // path. We trust the verified email here because the HMAC tag
  // proves it was the same value we signed; an attacker cannot
  // smuggle a different email into the path without breaking the
  // tag.
  const contactUrl = `https://api.resend.com/audiences/${env.RESEND_AUDIENCE_ID}/contacts/${encodeURIComponent(verified.email)}`;
  const resendResponse = await fetch(contactUrl, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ unsubscribed: true }),
  });

  if (!resendResponse.ok) {
    return new Response('Unsubscribe failed — please retry', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  return redirect(UNSUBSCRIBED_REDIRECT);
}
