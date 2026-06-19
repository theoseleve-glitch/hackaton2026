// T098 — Waitlist drip email 2, sent ~7 days after confirmation
// (T097 → THIS → T099). Email 2's job is the credibility-build:
// the recipient is now a week into the drip, the hype-and-promise
// of email 1 has settled, and they want proof we are actually
// shipping something. The answer is concrete dev work, named
// using the doctrine vocabulary from ADR-005 (Coaching Memory:
// weakness, prescription, outcome) so the position stays specific.
//
// Why evergreen, not time-tagged: the drip fires per-recipient,
// so different recipients hit email 2 at different real-world
// dates. A "here is what we shipped this week" framing rots
// fast; a "here is the architecture we are building" framing
// holds across the whole pre-launch window.
//
// Why no €12 here: the founder rate is named in emails 1 and 3.
// Repeating it every touchpoint turns the drip from a relationship
// into a sales sequence. Email 2 trades on credibility, not price.

export const SUBJECT = 'Behind the scenes at LAP';

export function bodies(unsubscribeUrl: string): { html: string; text: string } {
  const text = [
    'Quick update on what is in the build right now and what is coming before public beta opens.',
    '',
    'THE COACHING MEMORY',
    '',
    'Every driver who uses LAP gets a personal Coaching Memory. After every session it remembers your weaknesses (where you actually lost time), your prescriptions (the specific drills that fix them), and your outcomes (whether each drill worked next time you drove). That continuity is what makes the next session better than the last instead of an isolated practice block.',
    '',
    'CROSS-PLATFORM, ONE PROFILE',
    '',
    'Three pieces converge into one driver profile. Desktop captures the sim session in real time. Mobile captures your real-world track day with phone GPS plus a bluetooth GNSS hat for high-fidelity data. The bridge is the algorithm that ties them together so a weakness fixed on sim carries to the actual track and the other way round.',
    '',
    'THE DRIVER PROFILE',
    '',
    'One progression view. Strengths, weaknesses, drills attempted, drills closed, by track and by car class. The shape of your driving over the last six months instead of a folder of telemetry files you never look at again.',
    '',
    'WHAT IS NEXT',
    '',
    'The next email, two weeks in, is your beta-access invitation with the specifics on dates and how the founder rate gets applied. After that, you only hear from us when there is something specific worth your inbox.',
    '',
    '— LAP',
    'lap-coach.racing',
    '',
    `Unsubscribe at any time: ${unsubscribeUrl}`,
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
  <body style="font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.6; color: #1f1f1f; max-width: 560px;">
    <p>Quick update on what is in the build right now and what is coming before public beta opens.</p>

    <p style="margin-top: 24px;"><strong>The Coaching Memory</strong></p>
    <p>
      Every driver who uses LAP gets a personal Coaching Memory. After every session it remembers your <strong>weaknesses</strong> (where you actually lost time), your <strong>prescriptions</strong> (the specific drills that fix them), and your <strong>outcomes</strong> (whether each drill worked next time you drove). That continuity is what makes the next session better than the last instead of an isolated practice block.
    </p>

    <p style="margin-top: 24px;"><strong>Cross-platform, one profile</strong></p>
    <p>
      Three pieces converge into one driver profile. Desktop captures the sim session in real time. Mobile captures your real-world track day with phone GPS plus a bluetooth GNSS hat for high-fidelity data. The bridge is the algorithm that ties them together so a weakness fixed on sim carries to the actual track and the other way round.
    </p>

    <p style="margin-top: 24px;"><strong>The Driver Profile</strong></p>
    <p>
      One progression view. Strengths, weaknesses, drills attempted, drills closed, by track and by car class. The shape of your driving over the last six months instead of a folder of telemetry files you never look at again.
    </p>

    <p style="margin-top: 24px;"><strong>What is next</strong></p>
    <p>
      The next email, two weeks in, is your beta-access invitation with the specifics on dates and how the founder rate gets applied. After that, you only hear from us when there is something specific worth your inbox.
    </p>

    <p style="color: #888; font-size: 13px; margin-top: 40px;">— LAP · lap-coach.racing</p>
    <p style="color: #888; font-size: 12px;">
      <a href="${unsubscribeUrl}" style="color: #888;">Unsubscribe</a> at any time.
    </p>
  </body>
</html>`;

  return { html, text };
}
