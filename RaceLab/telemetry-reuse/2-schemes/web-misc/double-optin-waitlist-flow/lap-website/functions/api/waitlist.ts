// T092 + T093 + T094 — Cloudflare Pages Function for the waitlist
// form. Lands at /api/waitlist on the deployed site (Cloudflare
// Pages auto-discovers files under `functions/`). The function:
//   1. Validates the form post (email, consent — T092)
//   2. Verifies the Cloudflare Turnstile token via siteverify (T093)
//   3. Generates an HMAC-signed confirmation token (T094)
//   4. Sends a confirmation email via Resend's transactional /emails
//      endpoint with a /api/waitlist/confirm?token=... link (T094)
//   5. 303-redirects the visitor back to /waitlist?status=submitted
//
// T094 made the flow a TRUE double-opt-in: contacts are NOT added
// to the Resend audience here. T095's /api/waitlist/confirm handler
// verifies the token and commits the contact only after the visitor
// clicks the link in the confirmation email. Bots, fat-fingered
// emails, and accidental submits never end up on the marketing list
// — GDPR best practice.
//
// Deployment dependencies (NOT yet wired — see T008 BLOCKED):
//   1. Cloudflare Pages project bound to this repo (T008)
//   2. RESEND_API_KEY secret on the Pages project
//   3. RESEND_AUDIENCE_ID env var = the "waitlist" audience id from
//      Resend's dashboard (used by T095, kept here for env shape)
//   4. TURNSTILE_SECRET_KEY secret (matches PUBLIC_TURNSTILE_SITE_KEY
//      in WaitlistForm.astro)
//   5. WAITLIST_TOKEN_SECRET — high-entropy secret used to HMAC-sign
//      the confirmation token. ROTATING THIS INVALIDATES IN-FLIGHT
//      CONFIRMATIONS (≤7 days of pending signups), so document it
//      in the runbook before rotation.
//   6. The lap-coach.racing domain must be verified in the Resend
//      dashboard so the "from" address can send.

import { signEmailToken } from '../_lib/waitlist-token';

interface WaitlistEnv {
  RESEND_API_KEY: string;
  RESEND_AUDIENCE_ID: string;
  TURNSTILE_SECRET_KEY: string;
  WAITLIST_TOKEN_SECRET: string;
}

interface PagesFunctionContext {
  request: Request;
  env: WaitlistEnv;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FROM_ADDRESS = 'LAP <noreply@lap-coach.racing>';
const CONFIRMATION_SUBJECT = 'Confirm your email to join the LAP waitlist';

function badRequest(reason: string): Response {
  return new Response(reason, {
    status: 400,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

function confirmationEmailBodies(confirmationUrl: string): { html: string; text: string } {
  // Plain, doctrine-aligned LAP voice. No keyword-soup, no marketing
  // emoji clutter; the email's only job is to confirm one click.
  const text = [
    'You are one click away from the LAP waitlist.',
    '',
    `Confirm here: ${confirmationUrl}`,
    '',
    'This link expires in 7 days. If you didn’t sign up, ignore this email.',
    '',
    '— LAP',
    'lap-coach.racing',
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
  <body style="font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.55; color: #1f1f1f;">
    <p>You are one click away from the LAP waitlist.</p>
    <p><a href="${confirmationUrl}" style="color: #0a3d99;">Confirm your email</a></p>
    <p style="color: #555; font-size: 14px;">
      This link expires in 7 days. If you didn’t sign up, ignore this email.
    </p>
    <p style="color: #888; font-size: 13px;">— LAP · lap-coach.racing</p>
  </body>
</html>`;

  return { html, text };
}

export async function onRequestPost(context: PagesFunctionContext): Promise<Response> {
  const { request, env } = context;

  // Fail loud on misconfigured deploy. Every secret is required;
  // missing any one is treated identically. The alternative —
  // skipping checks because of a missing key — is a silent open
  // door (Turnstile bypass, unsigned tokens, unauthorised emails).
  if (
    !env.RESEND_API_KEY ||
    !env.RESEND_AUDIENCE_ID ||
    !env.TURNSTILE_SECRET_KEY ||
    !env.WAITLIST_TOKEN_SECRET
  ) {
    return new Response('Server misconfigured', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const formData = await request.formData();
  const email = formData.get('email');
  const consent = formData.get('consent');
  const turnstileToken = formData.get('cf-turnstile-response');

  if (typeof email !== 'string' || email.trim() === '') {
    return badRequest('Email is required');
  }
  if (!EMAIL_PATTERN.test(email.trim())) {
    return badRequest('Email must be a valid address');
  }
  // GDPR Article 7: consent must be a freely-given affirmative
  // action. The HTML form ships a required checkbox with name
  // "consent" — if it was unchecked, the field is absent from the
  // submission entirely (HTML form-encoding rule), so consent === null.
  // The string "on" is the default value for a checked checkbox
  // without an explicit value attribute (the form ships none).
  if (consent !== 'on' && consent !== 'true') {
    return badRequest('Consent is required');
  }

  // T093 — Turnstile verification. The widget injects a
  // cf-turnstile-response hidden field after the challenge passes.
  // Missing token = bot or JS-disabled bypass; siteverify
  // success:false = stale or replayed token. Both fail-fast at 400
  // before we waste Resend quota.
  if (typeof turnstileToken !== 'string' || turnstileToken === '') {
    return badRequest('Spam check failed — please retry');
  }
  const verifyResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      secret: env.TURNSTILE_SECRET_KEY,
      response: turnstileToken,
    }).toString(),
  });
  const verifyData = (await verifyResponse.json()) as { success?: boolean };
  if (!verifyData.success) {
    return badRequest('Spam check failed — please retry');
  }

  // T094 — sign a confirmation token + send the confirmation email.
  // The token carries the email + a 7-day expiry; the HMAC means
  // T095's confirm handler can trust the email without a state
  // store between here and there.
  const trimmedEmail = email.trim();
  const token = await signEmailToken(trimmedEmail, env.WAITLIST_TOKEN_SECRET);
  const confirmationUrl = new URL(`/api/waitlist/confirm?token=${token}`, request.url).toString();
  const { html, text } = confirmationEmailBodies(confirmationUrl);

  const sendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: trimmedEmail,
      subject: CONFIRMATION_SUBJECT,
      html,
      text,
    }),
  });

  if (!sendResponse.ok) {
    // 502 (Bad Gateway): "we tried, the upstream said no". 4xx
    // would tell the visitor THEY did something wrong; 5xx tells
    // them retry-later. Either way, the contact is NOT in the
    // audience yet, so a retry is a clean replay.
    return new Response('Submission failed — please retry', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  // 303 See Other on POST → GET. Refreshing the success page won't
  // re-POST the form. Relative location works because the function
  // and the page share an origin on Pages.
  return new Response(null, {
    status: 303,
    headers: { Location: '/waitlist?status=submitted' },
  });
}
