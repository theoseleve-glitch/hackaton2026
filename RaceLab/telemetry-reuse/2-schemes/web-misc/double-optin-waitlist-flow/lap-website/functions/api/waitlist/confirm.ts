// T095 — GET /api/waitlist/confirm — back half of the T094
// double-opt-in flow. The visitor's confirmation email points
// here with `?token=...`. The handler:
//   1. Verifies the HMAC-signed token (recovers the email or null)
//   2. Adds the verified email to the Resend "waitlist" audience
//   3. 303s to /waitlist/welcome on success
//
// Failure routing:
//   * Token invalid (missing, malformed, expired, tampered, wrong
//     secret): 303 → /waitlist?status=invalid. ALL token failures
//     fold into one response so the page does not become a
//     confirmation oracle for token-format probes.
//   * Resend audience-add 5xx: 502 (signal retry-later). The token
//     is still valid for 7 days so the visitor can re-click.
//   * Env missing: 500 (server misconfigured — same fail-closed
//     posture as T092's POST handler).
//
// Why this is the audience-add (and T092 isn't): true double-opt-in.
// Bots that POST /api/waitlist waste a single transactional email
// (≈$0.0001) but never reach the marketing audience. Real humans
// must click a link in their inbox before becoming a contact —
// that's what proves inbox control.

import { verifyEmailToken } from '../../_lib/waitlist-token';

interface ConfirmEnv {
  RESEND_API_KEY: string;
  RESEND_AUDIENCE_ID: string;
  WAITLIST_TOKEN_SECRET: string;
}

interface PagesFunctionContext {
  request: Request;
  env: ConfirmEnv;
}

const INVALID_REDIRECT = '/waitlist?status=invalid';
const WELCOME_REDIRECT = '/waitlist/welcome';

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

  const verified = await verifyEmailToken(token, env.WAITLIST_TOKEN_SECRET);
  if (!verified) {
    return redirect(INVALID_REDIRECT);
  }

  const audienceUrl = `https://api.resend.com/audiences/${env.RESEND_AUDIENCE_ID}/contacts`;
  const resendResponse = await fetch(audienceUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: verified.email,
      unsubscribed: false,
    }),
  });

  if (!resendResponse.ok) {
    return new Response('Confirmation failed — please retry', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  return redirect(WELCOME_REDIRECT);
}
