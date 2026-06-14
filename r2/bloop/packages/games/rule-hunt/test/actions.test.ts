// DO-boundary shape validation. Semantics (phase, eligibility, ranges vs the
// actual grid) are the reducer's job and are covered by the other suites.
import { describe, expect, it } from 'vitest';
import { ruleHuntActionSchema } from '@bloop/game-rule-hunt';

describe('ruleHuntActionSchema', () => {
  it('accepts every action kind the reducer understands', () => {
    expect(ruleHuntActionSchema.safeParse({ kind: 'ackRule' }).success).toBe(true);
    expect(ruleHuntActionSchema.safeParse({ kind: 'accuse', target: 'p2' }).success).toBe(true);
    expect(ruleHuntActionSchema.safeParse({ kind: 'tribunalVote', guilty: true }).success).toBe(true);
    expect(ruleHuntActionSchema.safeParse({ kind: 'tribunalVote', guilty: false }).success).toBe(true);
    expect(ruleHuntActionSchema.safeParse({ kind: 'openGuess' }).success).toBe(true);
    expect(ruleHuntActionSchema.safeParse({ kind: 'pickCandidate', index: 0 }).success).toBe(true);
    expect(ruleHuntActionSchema.safeParse({ kind: 'pickCandidate', index: 9 }).success).toBe(true);
    // heat-check soft reads
    expect(ruleHuntActionSchema.safeParse({ kind: 'flagBreak', flag: 'flag' }).success).toBe(true);
    expect(ruleHuntActionSchema.safeParse({ kind: 'flagBreak', flag: 'clean' }).success).toBe(true);
    expect(ruleHuntActionSchema.safeParse({ kind: 'noteSuspicious', note: 'suspicious' }).success).toBe(true);
    expect(ruleHuntActionSchema.safeParse({ kind: 'noteSuspicious', note: 'clear' }).success).toBe(true);
  });

  it('rejects malformed payloads at the boundary', () => {
    expect(ruleHuntActionSchema.safeParse({ kind: 'nope' }).success).toBe(false);
    expect(ruleHuntActionSchema.safeParse({}).success).toBe(false);
    expect(ruleHuntActionSchema.safeParse(null).success).toBe(false);
    expect(ruleHuntActionSchema.safeParse('ackRule').success).toBe(false);
    expect(ruleHuntActionSchema.safeParse({ kind: 'accuse' }).success).toBe(false); // no target
    expect(ruleHuntActionSchema.safeParse({ kind: 'accuse', target: '' }).success).toBe(false);
    expect(ruleHuntActionSchema.safeParse({ kind: 'accuse', target: 'x'.repeat(65) }).success).toBe(false);
    expect(ruleHuntActionSchema.safeParse({ kind: 'tribunalVote' }).success).toBe(false);
    expect(ruleHuntActionSchema.safeParse({ kind: 'tribunalVote', guilty: 'yes' }).success).toBe(false);
    expect(ruleHuntActionSchema.safeParse({ kind: 'pickCandidate' }).success).toBe(false);
    expect(ruleHuntActionSchema.safeParse({ kind: 'pickCandidate', index: -1 }).success).toBe(false);
    expect(ruleHuntActionSchema.safeParse({ kind: 'pickCandidate', index: 10 }).success).toBe(false);
    expect(ruleHuntActionSchema.safeParse({ kind: 'pickCandidate', index: 1.5 }).success).toBe(false);
    expect(ruleHuntActionSchema.safeParse({ kind: 'pickCandidate', index: '3' }).success).toBe(false);
    expect(ruleHuntActionSchema.safeParse({ kind: 'flagBreak' }).success).toBe(false); // no flag
    expect(ruleHuntActionSchema.safeParse({ kind: 'flagBreak', flag: 'maybe' }).success).toBe(false);
    expect(ruleHuntActionSchema.safeParse({ kind: 'noteSuspicious' }).success).toBe(false); // no note
    expect(ruleHuntActionSchema.safeParse({ kind: 'noteSuspicious', note: true }).success).toBe(false);
  });
});
