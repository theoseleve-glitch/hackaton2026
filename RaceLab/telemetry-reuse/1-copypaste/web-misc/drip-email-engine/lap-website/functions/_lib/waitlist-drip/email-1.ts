// T097 — Waitlist drip email 1, sent ~24 hours after the visitor
// confirms their email (T094 confirmation → T095 welcome page →
// THIS email a day later → T098 → T099). The job here is the
// re-introduction: the recipient signed up, possibly weeks before
// they read this, so email 1 reminds them what LAP is, names the
// public-beta launch date, and reaffirms the founder rate they
// were promised.
//
// File location: `functions/_lib/waitlist-drip/email-1.ts`. The
// `_lib` and `_lib/waitlist-drip` segments both start with `_`, so
// Cloudflare Pages excludes the entire path from auto-routing.
// T096's drip handler imports SUBJECT + bodies() from here; the
// file is otherwise unreachable via URL.
//
// API: `bodies(unsubscribeUrl)` is a function (not a constant)
// because T100 will mint per-contact HMAC-signed unsubscribe URLs.
// The drip handler will call bodies(generateUnsubUrl(contact)) per
// recipient and forward the rendered html + text to Resend's
// /emails endpoint.

export const SUBJECT = 'What LAP is, and when launch lands';

export function bodies(unsubscribeUrl: string): { html: string; text: string } {
  const text = [
    'Thanks for confirming. Here is what you joined and what is next.',
    '',
    'WHAT LAP IS',
    '',
    'LAP is a Driver OS for sim racers who train seriously. After every session, sim or real-world, LAP detects where you actually lost time, prescribes a specific drill to fix it, and checks whether the drill worked the next time you drive.',
    '',
    'The cross-platform piece is the unlock. iRacing, ACC, AMS2, and real-world track data live under one driver profile, so a weakness you fix on sim shows up improving on the actual track, and the other way round. One progression, not five disconnected ones.',
    '',
    'WHEN LAUNCH LANDS',
    '',
    'Public beta opens 23 July 2026. Waitlist members get the invite first, before the public announcement.',
    '',
    'YOUR FOUNDING RATE',
    '',
    'A head start to claim one of the 50 founding spots: €14.90 a month — €5 under the €19.90 standard, locked for as long as your membership stays active — plus a 30-day free trial. The invite goes to waitlist members first.',
    '',
    'WHAT IS NEXT',
    '',
    'Two more emails over the next two weeks: a behind-the-scenes development update, then your beta-access invitation. After that, only when there is something specific worth your inbox.',
    '',
    '— LAP',
    'lap-coach.racing',
    '',
    `Unsubscribe at any time: ${unsubscribeUrl}`,
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
  <body style="font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.6; color: #1f1f1f; max-width: 560px;">
    <p>Thanks for confirming. Here is what you joined and what is next.</p>

    <p style="margin-top: 24px;"><strong>What LAP is</strong></p>
    <p>
      LAP is a Driver OS for sim racers who train seriously. After every session, sim or real-world, LAP detects where you actually lost time, prescribes a specific drill to fix it, and checks whether the drill worked the next time you drive.
    </p>
    <p>
      The cross-platform piece is the unlock. iRacing, ACC, AMS2, and real-world track data live under one driver profile, so a weakness you fix on sim shows up improving on the actual track, and the other way round. One progression, not five disconnected ones.
    </p>

    <p style="margin-top: 24px;"><strong>When launch lands</strong></p>
    <p>
      Public beta opens <strong>23 July 2026</strong>. Waitlist members get the invite first, before the public announcement.
    </p>

    <p style="margin-top: 24px;"><strong>Your founding rate</strong></p>
    <p>
      A head start to claim one of the 50 founding spots: <strong>€14.90 a month</strong> — €5 under the €19.90 standard, locked for as long as your membership stays active — plus a 30-day free trial. The invite goes to waitlist members first.
    </p>

    <p style="margin-top: 24px;"><strong>What is next</strong></p>
    <p>
      Two more emails over the next two weeks: a behind-the-scenes development update, then your beta-access invitation. After that, only when there is something specific worth your inbox.
    </p>

    <p style="color: #888; font-size: 13px; margin-top: 40px;">— LAP · lap-coach.racing</p>
    <p style="color: #888; font-size: 12px;">
      <a href="${unsubscribeUrl}" style="color: #888;">Unsubscribe</a> at any time.
    </p>
  </body>
</html>`;

  return { html, text };
}
