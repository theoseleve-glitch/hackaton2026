import { describe, expect, it } from 'vitest';
import {
  accuse, content, deadline, FIVE, followersOf, game, left, toLive, toTribunal, tribunalVote,
} from './fixtures.js';

const FOUR = ['p1', 'p2', 'p3', 'p4'];

describe('accusations', () => {
  it('a valid accusation spends the token and opens the tribunal', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const [f0, f1] = followersOf(live);
    const trib = game.reduce(live, accuse(f0!, f1!, 5_000)).state;
    expect(trib.phase).toBe('tribunal');
    expect(trib.tribunal).toEqual({ accused: f1, accuser: f0, votes: {} });
    expect(trib.accusationsLeft[f0!]).toBe(0);
    expect(trib.interruptSeq).toBe(1);
  });

  it('rejects invalid accusers/targets with the same reference', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const det = live.detectives[0]!;
    const [f0, f1, f2] = followersOf(live);
    expect(game.reduce(live, accuse(det, f0!, 2_000)).state).toBe(live); // detective accuser
    expect(game.reduce(live, accuse(f0!, f0!, 2_000)).state).toBe(live); // self
    expect(game.reduce(live, accuse(f0!, det, 2_000)).state).toBe(live); // detective target
    expect(game.reduce(live, accuse(f0!, 'ghost', 2_000)).state).toBe(live); // non-roster target
    expect(game.reduce(live, accuse('ghost', f0!, 2_000)).state).toBe(live); // non-roster accuser
    const gone = game.reduce(live, left(f2!, 2_500)).state;
    expect(game.reduce(gone, accuse(f2!, f0!, 3_000)).state).toBe(gone); // disconnected accuser
    const s0 = game.init('s', FIVE, content(3));
    expect(game.reduce(s0, accuse(f0!, f1!, 100)).state).toBe(s0); // wrong phase (briefing)
  });

  it('the token is per round: a second accusation by the same follower is inert', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const [f0, f1, f2] = followersOf(live);
    const trib = game.reduce(live, accuse(f0!, f1!, 5_000)).state;
    const resumed = game.reduce(trib, deadline(30_000)).state;
    expect(resumed.phase).toBe('live');
    expect(game.reduce(resumed, accuse(f0!, f2!, 31_000)).state).toBe(resumed);
    // but another follower still holds theirs
    const trib2 = game.reduce(resumed, accuse(f2!, f1!, 32_000)).state;
    expect(trib2.phase).toBe('tribunal');
    expect(game.phaseKey(trib2)).toBe('tribunal:r0:i2');
  });

  it('eliminated players can neither accuse nor be accused again', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const [f0, f1, f2, f3] = followersOf(live);
    const trib = game.reduce(live, accuse(f0!, f1!, 5_000)).state;
    let s = game.reduce(trib, tribunalVote(f0!, true, 6_000)).state;
    s = game.reduce(s, tribunalVote(f2!, true, 7_000)).state;
    s = game.reduce(s, tribunalVote(f3!, true, 8_000)).state; // unanimous -> convicted
    expect(s.phase).toBe('live');
    expect(s.eliminated[f1!]).toBe(true);
    expect(game.reduce(s, accuse(f1!, f2!, 9_000)).state).toBe(s); // eliminated accuser
    expect(game.reduce(s, accuse(f2!, f1!, 9_000)).state).toBe(s); // eliminated target
  });
});

describe('tribunal voting', () => {
  it('eligible = connected, non-eliminated followers minus the accused; first vote locks', () => {
    const trib = toTribunal(toLive(game.init('s', FIVE, content(3)), 1_000));
    const det = trib.detectives[0]!;
    const [f0, f1, f2] = followersOf(trib); // f0 accuser, f1 accused
    expect(game.reduce(trib, tribunalVote(det, true, 6_000)).state).toBe(trib); // detectives NEVER vote
    expect(game.reduce(trib, tribunalVote(f1!, false, 6_000)).state).toBe(trib); // the accused
    expect(game.reduce(trib, tribunalVote('ghost', true, 6_000)).state).toBe(trib);
    const s1 = game.reduce(trib, tribunalVote(f0!, true, 6_000)).state; // the accuser MAY vote
    expect(s1.phase).toBe('tribunal');
    expect(game.reduce(s1, tribunalVote(f0!, false, 7_000)).state).toBe(s1); // locked
    expect(game.phaseKey(s1)).toBe(game.phaseKey(trib)); // in-phase progress keeps the key
    const v = game.view(s1, f2!);
    if (v.phase !== 'tribunal') throw new Error('expected tribunal view');
    expect(v.hasVoted[f0!]).toBe(true);
    expect(v.myVote).toBeNull();
  });

  it('all eligible voting resolves: majority of cast votes convicts (+1 infraction)', () => {
    const trib = toTribunal(toLive(game.init('s', FIVE, content(3)), 1_000));
    const [f0, f1, f2, f3] = followersOf(trib);
    let s = game.reduce(trib, tribunalVote(f0!, true, 6_000)).state;
    s = game.reduce(s, tribunalVote(f2!, true, 7_000)).state;
    const { state: done, effects } = game.reduce(s, tribunalVote(f3!, false, 8_000));
    expect(done.phase).toBe('live'); // clock not empty, 3 alive followers left
    expect(done.eliminated[f1!]).toBe(true);
    expect(done.infractions).toBe(1);
    expect(done.lastTribunal).toEqual({
      accused: f1, accuser: f0, guilty: true, tally: { guilty: 2, notGuilty: 1 }, abstained: [],
    });
    expect(effects).toEqual([
      { type: 'analytics', name: 'tribunal_resolved', props: { round: 0, guilty: true } },
    ]);
  });

  it('a tie is NOT guilty (funny never cruel)', () => {
    const trib = toTribunal(toLive(game.init('s', FIVE, content(3)), 1_000));
    const [f0, f1, , f3] = followersOf(trib);
    let s = game.reduce(trib, tribunalVote(f0!, true, 6_000)).state;
    s = game.reduce(s, tribunalVote(f3!, false, 7_000)).state;
    const done = game.reduce(s, deadline(30_000)).state; // f2 abstained
    expect(done.phase).toBe('live');
    expect(done.eliminated[f1!]).toBeUndefined();
    expect(done.infractions).toBe(0);
    expect(done.lastTribunal?.guilty).toBe(false);
    expect(done.lastTribunal?.tally).toEqual({ guilty: 1, notGuilty: 1 });
  });

  it('zero votes at the deadline is NOT guilty, with every voter listed as abstained', () => {
    const trib = toTribunal(toLive(game.init('s', FIVE, content(3)), 1_000));
    const [f0, f1, f2, f3] = followersOf(trib);
    const done = game.reduce(trib, deadline(30_000)).state;
    expect(done.phase).toBe('live');
    expect(done.lastTribunal?.guilty).toBe(false);
    expect(done.lastTribunal?.tally).toEqual({ guilty: 0, notGuilty: 0 });
    expect([...(done.lastTribunal?.abstained ?? [])].sort()).toEqual([f0, f2, f3].sort());
    expect(done.eliminated[f1!]).toBeUndefined();
  });

  it('partial votes at the deadline resolve by majority of CAST votes', () => {
    const trib = toTribunal(toLive(game.init('s', FIVE, content(3)), 1_000));
    const [f0, f1] = followersOf(trib);
    const s = game.reduce(trib, tribunalVote(f0!, true, 6_000)).state;
    const done = game.reduce(s, deadline(30_000)).state;
    expect(done.lastTribunal?.guilty).toBe(true); // 1-0 of cast votes
    expect(done.eliminated[f1!]).toBe(true);
    expect(done.lastTribunal?.abstained).toHaveLength(2);
  });

  it('an eliminated follower cannot vote in a later tribunal', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const [f0, f1, f2, f3] = followersOf(live);
    const trib = game.reduce(live, accuse(f0!, f1!, 5_000)).state;
    let s = game.reduce(trib, tribunalVote(f0!, true, 6_000)).state;
    s = game.reduce(s, tribunalVote(f2!, true, 7_000)).state;
    s = game.reduce(s, tribunalVote(f3!, true, 8_000)).state; // f1 convicted -> live
    const trib2 = game.reduce(s, accuse(f2!, f3!, 9_000)).state;
    expect(trib2.phase).toBe('tribunal');
    expect(game.reduce(trib2, tribunalVote(f1!, true, 10_000)).state).toBe(trib2); // eliminated voter
  });

  it('votes outside the tribunal phase are inert', () => {
    const live = toLive(game.init('s', FIVE, content(3)), 1_000);
    const f0 = followersOf(live)[0]!;
    expect(game.reduce(live, tribunalVote(f0, true, 2_000)).state).toBe(live);
  });
});

describe('tribunal presence edges', () => {
  it('the accused leaving mid-tribunal never auto-convicts — the vote proceeds normally', () => {
    const trib = toTribunal(toLive(game.init('s', FIVE, content(3)), 1_000));
    const [f0, f1, f2, f3] = followersOf(trib);
    const goneAccused = game.reduce(trib, left(f1!, 6_000)).state;
    expect(goneAccused.phase).toBe('tribunal');
    expect(goneAccused.eliminated[f1!]).toBeUndefined(); // disconnect NEVER eliminates
    let s = game.reduce(goneAccused, tribunalVote(f0!, false, 7_000)).state;
    s = game.reduce(s, tribunalVote(f2!, false, 8_000)).state;
    const done = game.reduce(s, tribunalVote(f3!, false, 9_000)).state;
    expect(done.phase).toBe('live');
    expect(done.lastTribunal?.guilty).toBe(false);
  });

  it('a voter leaving can complete the expected set and resolve the tribunal', () => {
    const trib = toTribunal(toLive(game.init('s', FIVE, content(3)), 1_000));
    const [f0, f1, f2, f3] = followersOf(trib);
    let s = game.reduce(trib, tribunalVote(f0!, true, 6_000)).state;
    s = game.reduce(s, tribunalVote(f2!, true, 7_000)).state;
    expect(s.phase).toBe('tribunal'); // f3 still expected
    const done = game.reduce(s, left(f3!, 8_000)).state;
    expect(done.phase).toBe('live'); // the leave completed the set
    expect(done.eliminated[f1!]).toBe(true);
  });

  it('a rejoining voter is re-expected while the tribunal is open', () => {
    const trib = toTribunal(toLive(game.init('s', FIVE, content(3)), 1_000));
    const [f0, , f2, f3] = followersOf(trib);
    let s = game.reduce(trib, left(f3!, 6_000)).state;
    s = game.reduce(s, tribunalVote(f0!, true, 7_000)).state;
    s = game.reduce(s, { type: 'playerRejoined', playerId: f3!, at: 8_000 }).state;
    const stillOpen = game.reduce(s, tribunalVote(f2!, true, 9_000)).state;
    expect(stillOpen.phase).toBe('tribunal'); // f3 is expected again
    const done = game.reduce(stillOpen, tribunalVote(f3!, false, 10_000)).state;
    expect(done.phase).toBe('live');
  });

  it('a conviction that leaves fewer than two playable followers ends the round (timeUp, not perfect)', () => {
    // 4 players: 1 detective + followers f0, f1, f2.
    const live = toLive(game.init('s', FOUR, content(3)), 1_000);
    const [f0, f1, f2] = followersOf(live);
    const trib = game.reduce(live, accuse(f0!, f1!, 5_000)).state;
    let s = game.reduce(trib, left(f2!, 6_000)).state; // f2 leaves: eligible = [f0]
    expect(s.phase).toBe('tribunal');
    s = game.reduce(s, tribunalVote(f0!, true, 7_000)).state; // completes the set -> convicted
    expect(s.phase).toBe('reveal'); // f0 is the only playable follower left (< 2)
    expect(s.lastOutcome?.kind).toBe('timeUp');
    expect(s.lastOutcome?.perfect).toBe(false);
  });
});
