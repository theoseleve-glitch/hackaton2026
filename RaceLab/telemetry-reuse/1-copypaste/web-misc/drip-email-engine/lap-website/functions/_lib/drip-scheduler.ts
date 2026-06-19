// T104 — pure drip-timing decision for the waitlist drip cron
// (T096 BLOCKED note pulled this primitive out for separate
// shipping). Given a contact's confirmation timestamp, their
// current drip stage (count of emails already sent), and the
// current time, returns the next email number due (1, 2, or 3)
// or null if nothing is due.
//
// Thresholds are anchored to confirmedAt, not to the previous
// email's send time: email 1 at d1, email 2 at d7, email 3 at
// d14. The handler advances stage one step per cron run, so a
// recovered/paused cron catches up over consecutive runs rather
// than blasting all overdue emails on a single run (gentler on
// the inbox).

const DAY_MS = 86_400_000;
const DRIP_THRESHOLDS_DAYS: readonly [number, number, number] = [1, 7, 14];

export type DripStage = 0 | 1 | 2 | 3;
export type DripEmailNumber = 1 | 2 | 3;

export function decideDripStage(
  confirmedAt: Date,
  currentStage: number,
  now: Date,
): DripEmailNumber | null {
  if (currentStage < 0 || currentStage >= 3) return null;
  const daysSince = Math.floor((now.getTime() - confirmedAt.getTime()) / DAY_MS);
  if (daysSince < 0) return null;
  const threshold = DRIP_THRESHOLDS_DAYS[currentStage as 0 | 1 | 2];
  if (daysSince < threshold) return null;
  return (currentStage + 1) as DripEmailNumber;
}
