// T099 — Waitlist drip email 3, the closer. Sent ~14 days after
// confirmation (T097 → T098 → THIS). The job is NOT to act as
// the actual beta-access invitation — that arrives separately
// when public beta opens 2026-07-23. Email 3 sets expectations:
// what the invite will look like, how the founder rate gets
// applied automatically, and how to reach a real human if the
// recipient has questions before launch.
//
// This is the closer in two senses:
//   1. End of the regular drip — after this, nothing until the
//      actual invite. Quieting the cadence is itself a doctrine
//      signal: "we will not be in your inbox unless we have to".
//   2. Last chance to lock the founder rate in the recipient's
//      record-of-promise — €12, 12 months, €15 standard, the
//      €3/month delta for a year — so when the invoice lands a
//      few months later it matches the email they already have.
//
// "Reply to this email — it goes to a real inbox" is the
// founder-shop voice and works only because LAP is solo-founder.
// If team-mode lands, this line gets revisited.

export const SUBJECT = 'Your LAP beta invite, and the founder rate';

export function bodies(unsubscribeUrl: string): { html: string; text: string } {
  const text = [
    'Public beta opens 23 July 2026. As a waitlist member you get the invite first, before the public announcement. Here is what to expect.',
    '',
    'THE INVITE',
    '',
    'When beta opens, you will get a separate email with a sign-in link tied to the address you confirmed. The link takes you to your driver profile, ready for your first session capture. No promo code to remember, no fine print to read at the wrong time.',
    '',
    'YOUR FOUNDER RATE',
    '',
    'The standard rate at launch is €19.90 a month. As a waitlist member you get a head start to claim one of the 50 founding spots at €14.90 a month — €5 under standard, locked for as long as your membership stays active. Your 30-day free trial runs first, with no card charged until it ends; your account is flagged when beta opens, so you do not have to remember anything.',
    '',
    'WHAT YOU CAN DO TODAY',
    '',
    'Nothing required. The invite arrives when beta lands. If you bought a sim rig in the last six months, the highest-leverage thing you can do before launch is keep a one-page note of where you actually lose time at your home track — that note becomes your first prescription on day one.',
    '',
    'If you have a question or a feature request before launch, reply to this email. It goes to a real inbox.',
    '',
    '— LAP',
    'lap-coach.racing',
    '',
    `Unsubscribe at any time: ${unsubscribeUrl}`,
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
  <body style="font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.6; color: #1f1f1f; max-width: 560px;">
    <p>
      Public beta opens <strong>23 July 2026</strong>. As a waitlist member you get the invite first, before the public announcement. Here is what to expect.
    </p>

    <p style="margin-top: 24px;"><strong>The invite</strong></p>
    <p>
      When beta opens, you will get a separate email with a sign-in link tied to the address you confirmed. The link takes you to your driver profile, ready for your first session capture. No promo code to remember, no fine print to read at the wrong time.
    </p>

    <p style="margin-top: 24px;"><strong>Your founder rate</strong></p>
    <p>
      The standard rate at launch is <strong>€19.90 a month</strong>. As a waitlist member you get a head start to claim one of the 50 founding spots at <strong>€14.90 a month</strong> — €5 under standard, locked for as long as your membership stays active. Your 30-day free trial runs first, with no card charged until it ends; your account is flagged when beta opens, so you do not have to remember anything.
    </p>

    <p style="margin-top: 24px;"><strong>What you can do today</strong></p>
    <p>
      Nothing required. The invite arrives when beta lands. If you bought a sim rig in the last six months, the highest-leverage thing you can do before launch is keep a one-page note of where you actually lose time at your home track — that note becomes your first prescription on day one.
    </p>

    <p>
      If you have a question or a feature request before launch, reply to this email. It goes to a real inbox.
    </p>

    <p style="color: #888; font-size: 13px; margin-top: 40px;">— LAP · lap-coach.racing</p>
    <p style="color: #888; font-size: 12px;">
      <a href="${unsubscribeUrl}" style="color: #888;">Unsubscribe</a> at any time.
    </p>
  </body>
</html>`;

  return { html, text };
}
