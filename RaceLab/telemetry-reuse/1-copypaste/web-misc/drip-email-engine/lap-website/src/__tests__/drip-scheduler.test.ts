// T104 — drip-timing decisions for the waitlist drip cron. The
// pure function `decideDripStage(confirmedAt, currentStage, now)`
// returns the NEXT email number to send (1, 2, or 3) for a given
// contact, or null if nothing is due. T096's drip handler — when
// it unblocks — calls this per-contact each cron run, sends the
// returned email, and advances `currentStage` in the contact's
// Resend custom-field state.
//
// Stages are the COUNT of emails already sent:
//   0 = no emails sent yet (just confirmed)
//   1 = email 1 sent
//   2 = email 1 + 2 sent
//   3 = full drip complete
//
// Thresholds are anchored to confirmation, not to the previous
// email: email N is due `DRIP_THRESHOLDS_DAYS[N-1]` days after the
// confirmedAt timestamp. Day 1 / day 7 / day 14 spacing matches
// the sprint task ("3 emails over 2 weeks") and the email
// previews in T097-T099.
//
// Catch-up posture: if a contact confirmed 30 days ago with stage
// 0 (no emails sent — say the cron was offline), the handler
// advances ONE stage per cron run, taking 3 daily runs to catch
// up. Simpler than a "send-all-overdue" path; the trade-off is
// 3 days of delayed full drip in the rare paused-cron case.

import { describe, expect, test } from 'vitest';
import { decideDripStage } from '../../functions/_lib/drip-scheduler';

// Helper: given a number of days since confirmation, build a
// (confirmedAt, now) pair. `confirmedAt` is anchored at a fixed
// reference epoch so the test names read as "days since".
const REF = new Date('2026-01-01T00:00:00Z');
const daysAfter = (n: number) => new Date(REF.getTime() + n * 86_400_000);

describe('T104: decideDripStage — stage 0 (no emails sent yet)', () => {
  test('day 0 returns null (no email same-day as confirmation)', () => {
    // Same-day-as-confirmation already saw the T094 confirmation
    // email; firing email 1 too soon turns the recipient's inbox
    // into spam. Day 1 is the earliest valid first drip touch.
    expect(decideDripStage(REF, 0, daysAfter(0))).toBeNull();
  });

  test('day 0 + 23 hours returns null (sub-day rounding floor)', () => {
    // The day count uses Math.floor on (ms / 86_400_000), so 23
    // hours = day 0. Locking this prevents a future "just below
    // threshold" off-by-one.
    const almostDay1 = new Date(REF.getTime() + 23 * 60 * 60 * 1000);
    expect(decideDripStage(REF, 0, almostDay1)).toBeNull();
  });

  test('day 1 returns 1 (first eligible firing of email 1)', () => {
    expect(decideDripStage(REF, 0, daysAfter(1))).toBe(1);
  });

  test('day 6 with stage 0 returns 1 (still email 1 first, sequential advancement)', () => {
    // If a contact is at stage 0 on day 6, the cron must send
    // email 1 first, NOT skip to email 2. Sequential advancement
    // means the catch-up case takes one cron run per missed
    // email instead of dropping early ones.
    expect(decideDripStage(REF, 0, daysAfter(6))).toBe(1);
  });
});

describe('T104: decideDripStage — stage 1 (email 1 sent)', () => {
  test('day 6 returns null (not yet day 7)', () => {
    expect(decideDripStage(REF, 1, daysAfter(6))).toBeNull();
  });

  test('day 7 returns 2 (first eligible firing of email 2)', () => {
    expect(decideDripStage(REF, 1, daysAfter(7))).toBe(2);
  });

  test('day 30 with stage 1 returns 2 (catch-up after a paused cron)', () => {
    expect(decideDripStage(REF, 1, daysAfter(30))).toBe(2);
  });
});

describe('T104: decideDripStage — stage 2 (email 1 + 2 sent)', () => {
  test('day 13 returns null', () => {
    expect(decideDripStage(REF, 2, daysAfter(13))).toBeNull();
  });

  test('day 14 returns 3 (first eligible firing of email 3)', () => {
    expect(decideDripStage(REF, 2, daysAfter(14))).toBe(3);
  });

  test('day 100 with stage 2 returns 3 (catch-up over a long pause)', () => {
    expect(decideDripStage(REF, 2, daysAfter(100))).toBe(3);
  });
});

describe('T104: decideDripStage — stage 3 (drip complete)', () => {
  test('day 14 with stage 3 returns null', () => {
    expect(decideDripStage(REF, 3, daysAfter(14))).toBeNull();
  });

  test('day 365 with stage 3 returns null (drip never re-runs)', () => {
    // The drip is a one-shot welcome sequence. A year later, no
    // additional drip emails fire — that would feel like spam.
    expect(decideDripStage(REF, 3, daysAfter(365))).toBeNull();
  });
});

describe('T104: decideDripStage — defensive', () => {
  test('negative days (now < confirmedAt, clock skew) returns null', () => {
    // Defensive: if the cron ran on a node with a clock that was
    // somehow ahead of the contact's confirmedAt timestamp, do
    // not panic-send. Wait for the clock to settle.
    expect(decideDripStage(REF, 0, daysAfter(-1))).toBeNull();
  });

  test('out-of-range stage returns null (defensive)', () => {
    // Stage values come from the Resend contact custom field —
    // a manual Resend dashboard edit could set a stale value.
    // The function must not crash on stage = 99 or stage = -1.
    expect(decideDripStage(REF, 99, daysAfter(30))).toBeNull();
    expect(decideDripStage(REF, -1, daysAfter(30))).toBeNull();
  });

  test('decision is deterministic across repeated calls', () => {
    // No clock-walk inside the function — the same inputs return
    // the same answer every time. Locks the pure-function
    // posture so the cron handler can rely on idempotency.
    const a = decideDripStage(REF, 1, daysAfter(7));
    const b = decideDripStage(REF, 1, daysAfter(7));
    expect(a).toBe(b);
    expect(a).toBe(2);
  });
});
