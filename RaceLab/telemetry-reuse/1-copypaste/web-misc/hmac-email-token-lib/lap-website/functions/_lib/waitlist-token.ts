// T095 — HMAC-signed confirmation tokens for the waitlist double-
// opt-in flow. Lives under `functions/_lib/` so Cloudflare Pages
// excludes the file from auto-routing (the `_` prefix opts a path
// out of the public URL surface) while still bundling it into the
// deployed Worker. Both T092's POST handler (sign step) and T095's
// GET /confirm handler (verify step) import from here so the token
// format has exactly one source of truth.
//
// Token format: `${base64url(email)}.${expirySeconds}.${hexHmac}`.
// Self-contained — verify needs only the secret + the token, no
// state store between sign and verify. That's what makes the
// 7-day delay between "sign up" and "click email" survive Worker
// restarts, secret rotation aside.
//
// Web Crypto note: `crypto.subtle` is available globally in
// Cloudflare Workers, modern browsers, and Node 16+ (which Vitest
// uses). Same API everywhere — no polyfill, no `node:crypto` import.

export const CONFIRMATION_TTL_SECONDS = 7 * 24 * 60 * 60;

function base64urlEncode(input: string): string {
  return btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(input: string): string {
  // atob expects standard base64 with `+`, `/`, and `=` padding.
  // Reverse the URL-safe substitutions and re-pad to a multiple of
  // four. atob throws on invalid input — caller catches.
  const standard = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = standard.length % 4 === 0 ? '' : '='.repeat(4 - (standard.length % 4));
  return atob(standard + padding);
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function constantTimeEqual(a: string, b: string): boolean {
  // Compare two equal-length strings without short-circuiting. The
  // OR-fold collapses every byte difference into a single bit; the
  // attacker cannot tell from response time which byte mismatched.
  // Length mismatch IS a leak (true vs. false short-circuit), but
  // SHA-256 hex tags are always 64 chars, so a length mismatch
  // here means the input is malformed — same outcome as a content
  // mismatch.
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function hmacHex(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return hex(sig);
}

export async function signEmailToken(
  email: string,
  secret: string,
  ttlSeconds: number = CONFIRMATION_TTL_SECONDS,
): Promise<string> {
  // ttlSeconds is overrideable purely so tests can mint
  // already-expired tokens (ttlSeconds = -1). Production callers
  // omit it and get the 7-day default.
  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${email}.${expiry}`;
  const tag = await hmacHex(payload, secret);
  return `${base64urlEncode(email)}.${expiry}.${tag}`;
}

export async function verifyEmailToken(
  token: string,
  secret: string,
): Promise<{ email: string } | null> {
  // Returns `{ email }` on full success; null on every failure mode
  // (malformed, expired, tampered, wrong secret). Callers must NOT
  // surface different responses for different null reasons —
  // otherwise the failure shape becomes a confirmation oracle.
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [encodedEmail, expiryRaw, providedTag] = parts;

  const expiry = Number(expiryRaw);
  if (!Number.isFinite(expiry) || !Number.isInteger(expiry)) return null;
  if (expiry <= Math.floor(Date.now() / 1000)) return null;

  let email: string;
  try {
    email = base64urlDecode(encodedEmail);
  } catch {
    return null;
  }
  if (email === '') return null;

  const expectedTag = await hmacHex(`${email}.${expiry}`, secret);
  if (!constantTimeEqual(providedTag, expectedTag)) return null;

  return { email };
}

// T100 — unsubscribe tokens. Different format and different HMAC
// payload from confirmation tokens so a token signed for one
// purpose cannot be replayed as the other. Cryptographic domain
// separation: same secret, different "purpose" string in the
// payload prevents privilege escalation between flows.
//
// Format: `${base64url(email)}.${hexHmac}` (2 segments — no expiry).
// Payload signed: `unsubscribe.${email}`.
//
// Why no expiry: GDPR Article 7. A recipient who finds an old LAP
// email a year later and clicks unsubscribe expects it to work.
// Time-bombing the link is hostile to the recipient's right to
// withdraw consent.

const UNSUBSCRIBE_PAYLOAD_PREFIX = 'unsubscribe';

export async function signUnsubscribeToken(email: string, secret: string): Promise<string> {
  const tag = await hmacHex(`${UNSUBSCRIBE_PAYLOAD_PREFIX}.${email}`, secret);
  return `${base64urlEncode(email)}.${tag}`;
}

export async function verifyUnsubscribeToken(
  token: string,
  secret: string,
): Promise<{ email: string } | null> {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encodedEmail, providedTag] = parts;

  let email: string;
  try {
    email = base64urlDecode(encodedEmail);
  } catch {
    return null;
  }
  if (email === '') return null;

  const expectedTag = await hmacHex(`${UNSUBSCRIBE_PAYLOAD_PREFIX}.${email}`, secret);
  if (!constantTimeEqual(providedTag, expectedTag)) return null;

  return { email };
}

export async function buildUnsubscribeUrl(
  email: string,
  secret: string,
  baseUrl: string,
): Promise<string> {
  // Helper for the drip handler (T096 when unblocked): mint a
  // per-contact unsubscribe URL ready to drop into the email
  // body. Centralising the path here means a future route change
  // updates one place, not three email modules.
  const token = await signUnsubscribeToken(email, secret);
  return new URL(`/api/waitlist/unsubscribe?token=${token}`, baseUrl).toString();
}
