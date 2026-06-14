import { describe, expect, it } from 'vitest';
import { createRuleHunt, TROUVEZ_LA_REGLE_CONFIG, type RuleHuntState } from '@bloop/game-rule-hunt';
import {
  ack, cast, content, deadline, EIGHT, FIVE, followersOf, game, liveToReveal, toLive, walkDeadlines,
} from './fixtures.js';

describe('init determinism', () => {
  it('same seed -> identical state (items, detectives, grid); the grid embeds the round rule', () => {
    const a = game.init('seed-1', FIVE, content(5));
    const b = game.init('seed-1', FIVE, content(5));
    expect(a).toEqual(b);
    expect(a.items.map((i) => i.id)).toEqual(b.items.map((i) => i.id));
    expect(a.detectives).toEqual(b.detectives);
    expect(a.candidateTexts).toEqual(b.candidateTexts);
    expect(a.trueCandidateIndex).toBe(b.trueCandidateIndex);
    // the grid is 1 true rule + 7 decoys, and the true index points at the round-0 rule
    expect(a.candidateTexts).toHaveLength(TROUVEZ_LA_REGLE_CONFIG.candidateCount);
    expect(a.trueCandidateIndex).toBeGreaterThanOrEqual(0);
    expect(a.trueCandidateIndex).toBeLessThan(a.candidateTexts.length);
    expect(a.candidateTexts[a.trueCandidateIndex]).toEqual(a.items[0]!.rule);
  });

  it('different seeds shuffle differently (item order or detective order)', () => {
    const a = game.init('seed-1', FIVE, content(20));
    const b = game.init('seed-2', FIVE, content(20));
    const differs = JSON.stringify(a.items.map((i) => i.id)) !== JSON.stringify(b.items.map((i) => i.id))
      || JSON.stringify(a.detectiveOrder) !== JSON.stringify(b.detectiveOrder);
    expect(differs).toBe(true);
  });

  it('caps totalRounds at the pool size', () => {
    const s = game.init('s', FIVE, content(2)); // 2 items < 3 totalRounds
    expect(s.config.totalRounds).toBe(2);
  });

  it("detectiveCount 'auto': 1 detective for 4-7 players, 2 for 8-16", () => {
    expect(game.init('s', FIVE, content(3)).detectives).toHaveLength(1);
    expect(game.init('s', EIGHT, content(3)).detectives).toHaveLength(2);
    const one = createRuleHunt('x', { ...TROUVEZ_LA_REGLE_CONFIG, detectiveCount: 1 });
    expect(one.init('s', EIGHT, content(3)).detectives).toHaveLength(1);
    const two = createRuleHunt('x', { ...TROUVEZ_LA_REGLE_CONFIG, detectiveCount: 2 });
    expect(two.init('s', FIVE, content(3)).detectives).toHaveLength(2);
  });

  it('accusation tokens go to followers only; detectives never get one', () => {
    const s = game.init('s', FIVE, content(3));
    for (const f of followersOf(s)) expect(s.accusationsLeft[f]).toBe(1);
    for (const d of s.detectives) expect(s.accusationsLeft[d]).toBeUndefined();
    expect(s.teamGuessesLeft).toBe(3);
  });
});

describe('briefing', () => {
  it('starts in briefing with the design durations and key', () => {
    const s = game.init('s', FIVE, content(3));
    expect(s.phase).toBe('briefing');
    expect(game.phaseKey(s)).toBe('briefing:r0');
    expect(game.phaseDurationMs(s)).toBe(20_000);
  });

  it('all connected followers acking enters live early; the clock segment starts at the resolving ack', () => {
    let s = game.init('s', FIVE, content(3));
    const followers = followersOf(s);
    for (const f of followers.slice(0, -1)) {
      s = game.reduce(s, ack(f, 1_000)).state;
      expect(s.phase).toBe('briefing');
    }
    const { state: live, effects } = game.reduce(s, ack(followers[followers.length - 1]!, 2_500));
    expect(live.phase).toBe('live');
    expect(live.segmentStartedAt).toBe(2_500);
    expect(live.liveSeg).toBe(0);
    expect(effects).toEqual([]);
    expect(game.phaseKey(live)).toBe('live:r0:s0');
    // The live segment is armed at the heat-check cadence (min of bank and heatMs),
    // not the full 180s — the shell fires a forced spotlight every ~heatMs.
    expect(game.phaseDurationMs(live)).toBe(24_000);
    expect(live.liveRemainingMs).toBe(180_000); // the bank itself is still the full clock
  });

  it('rejects detective, duplicate, non-roster and disconnected acks (same reference)', () => {
    const s0 = game.init('s', FIVE, content(3));
    const { detective, followers } = cast(s0);
    expect(game.reduce(s0, ack(detective)).state).toBe(s0);
    expect(game.reduce(s0, ack('ghost')).state).toBe(s0);
    const s1 = game.reduce(s0, ack(followers[0]!)).state;
    expect(game.reduce(s1, ack(followers[0]!)).state).toBe(s1);
    const s2 = game.reduce(s1, { type: 'playerLeft', playerId: followers[1]!, at: 10 }).state;
    expect(game.reduce(s2, ack(followers[1]!)).state).toBe(s2);
  });

  it('the briefing deadline starts the round regardless of missing acks', () => {
    const s0 = game.init('s', FIVE, content(3));
    const s1 = game.reduce(s0, deadline(20_000)).state;
    expect(s1.phase).toBe('live');
    expect(s1.segmentStartedAt).toBe(20_000);
  });
});

describe('deadline walk — a passive room always reaches over', () => {
  it('rolls briefing -> live/(forced spotlights) -> reveal per round, then over after totalRounds; over is untimed', () => {
    const s0 = game.init('s', FIVE, content(3));
    const { state: s, keys } = walkDeadlines(s0);
    // Every timed phase consumed its deadline and the room reached over.
    expect(s.phase).toBe('over');
    expect(s.endReason).toBe('finished');
    expect(game.phaseDurationMs(s)).toBeNull();
    expect(keys[keys.length - 1]).toBe('over');
    // Structural skeleton: each round opens on a briefing and closes on a reveal,
    // with the heat-check filling the middle (live segments interleaved with spotlights).
    const rounds = keys.filter((k) => k.startsWith('briefing:'));
    expect(rounds).toEqual(['briefing:r0', 'briefing:r1', 'briefing:r2']);
    for (let r = 0; r < 3; r++) {
      expect(keys).toContain(`reveal:r${r}`);
      // the forced spotlight beat actually fires inside each round's live phase
      expect(keys.some((k) => k.startsWith(`spotlight:r${r}:`))).toBe(true);
      // a spotlight always sits BETWEEN two live segments — never replaces the reveal
      const firstSpot = keys.indexOf(keys.find((k) => k.startsWith(`spotlight:r${r}:`))!);
      expect(keys[firstSpot - 1]).toMatch(new RegExp(`^live:r${r}:`));
      expect(keys[firstSpot + 1]).toMatch(new RegExp(`^live:r${r}:`));
    }
  });

  it('reveal durations and keys follow the config', () => {
    let s = game.init('s', FIVE, content(3));
    s = game.reduce(s, deadline(0)).state; // -> live
    s = liveToReveal(s);                    // drain live (through spotlights) -> reveal
    expect(s.phase).toBe('reveal');
    expect(game.phaseKey(s)).toBe('reveal:r0');
    expect(game.phaseDurationMs(s)).toBe(12_000);
  });

  it('rotates detectives between rounds (next id in the hidden order)', () => {
    let s = game.init('s', FIVE, content(3));
    const r0 = [...s.detectives];
    s = game.reduce(s, deadline(0)).state; // -> live
    s = liveToReveal(s);                    // drain live (through spotlights) -> reveal
    s = game.reduce(s, deadline(400_000)).state; // reveal deadline -> round 1
    expect(s.round).toBe(1);
    expect(s.phase).toBe('briefing');
    expect(s.detectives).toEqual([s.detectiveOrder[1]]);
    expect(s.detectives).not.toEqual(r0);
    // round-locals reset
    expect(s.teamGuessesLeft).toBe(3);
    expect(s.usedCandidates).toEqual([]);
    expect(s.liveRemainingMs).toBe(180_000);
    expect(s.liveSeg).toBe(0);
    expect(s.interruptSeq).toBe(0);
    expect(s.infractions).toBe(0);
    expect(s.lastOutcome).toBeNull();
    expect(s.lastTribunal).toBeNull();
    expect(s.candidateTexts[s.trueCandidateIndex]).toEqual(s.items[1]!.rule);
  });

  it('a disconnected scheduled detective is skipped forward at round start', () => {
    let s = game.init('s', FIVE, content(3));
    const scheduledNext = s.detectiveOrder[1]!;
    s = game.reduce(s, { type: 'playerLeft', playerId: scheduledNext, at: 0 }).state;
    s = game.reduce(s, deadline(1)).state; // -> live
    s = liveToReveal(s);                    // drain live (through spotlights) -> reveal
    s = game.reduce(s, deadline(400_000)).state; // -> round 1 briefing
    expect(s.round).toBe(1);
    expect(s.detectives).not.toContain(scheduledNext);
  });

  it('over absorbs every event with the same reference', () => {
    const s0: RuleHuntState = game.init('s', FIVE, content(1));
    const s: RuleHuntState = walkDeadlines(s0).state;
    expect(s.phase).toBe('over');
    expect(game.phaseKey(s)).toBe('over');
    expect(game.reduce(s, deadline(99)).state).toBe(s);
    expect(game.reduce(s, ack('p2', 100)).state).toBe(s);
    expect(game.reduce(s, { type: 'playerLeft', playerId: 'p2', at: 101 }).state).toBe(s);
  });
});

describe('phaseKey discipline', () => {
  it('in-phase progress (a buffered ack) never changes the key', () => {
    const s0 = game.init('s', FIVE, content(3));
    const f = followersOf(s0)[0]!;
    const s1 = game.reduce(s0, ack(f)).state;
    expect(game.phaseKey(s1)).toBe(game.phaseKey(s0));
  });

  it('keys never embed the rule text or the true index', () => {
    const s0 = game.init('s', FIVE, content(3));
    const { keys } = walkDeadlines(s0);
    for (const key of keys) {
      expect(key).toMatch(/^(briefing|live|spotlight|tribunal|guess|reveal):r\d+(:[si]\d+)?$|^over$/);
    }
  });

  it('live re-entries get a fresh segment key so the shell re-arms the shorter remainder', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    expect(game.phaseKey(live)).toBe('live:r0:s0');
    const [accuser, accused] = followersOf(live);
    const trib = game.reduce(live, { type: 'action', playerId: accuser!, action: { kind: 'accuse', target: accused! }, at: 2_000 }).state;
    expect(game.phaseKey(trib)).toBe('tribunal:r0:i1');
    const resumed = game.reduce(trib, deadline(10_000)).state;
    expect(game.phaseKey(resumed)).toBe('live:r0:s1');
  });
});
