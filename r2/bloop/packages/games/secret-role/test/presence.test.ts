import { describe, expect, it } from 'vitest';
import { ack, content, dl, game, leftEv, players, ready, rejoinEv, roles, run, toVotePhase, vote } from './helpers.js';

describe('presence flips', () => {
  it('playerLeft/playerRejoined flip presence; unknown ids and redundant flips are same-reference no-ops', () => {
    const s0 = game.init('s', players, content);
    expect(game.reduce(s0, leftEv('ghost')).state).toBe(s0);
    expect(game.reduce(s0, rejoinEv('p1')).state).toBe(s0); // already connected
    const { civs } = roles(s0);
    const c = civs[0]!;
    const s1 = game.reduce(s0, leftEv(c)).state;
    expect(s1.connected[c]).toBe(false);
    expect(game.reduce(s1, leftEv(c)).state).toBe(s1);
    const s2 = game.reduce(s1, rejoinEv(c)).state;
    expect(s2.connected[c]).toBe(true);
  });

  it('a NON-impostor leave never ends the match — only presence flips', () => {
    const s0 = game.init('s', players, content);
    const { civs } = roles(s0);
    const s1 = game.reduce(s0, leftEv(civs[0]!)).state;
    expect(s1.phase).toBe('secretReveal');
    expect(s1.results).toEqual([]);
  });
});

describe('a disconnected player never blocks a phase', () => {
  it('secretReveal: acks from the connected players alone end the phase early', () => {
    const s0 = game.init('s', players, content);
    const { imp, civs } = roles(s0);
    const gone = civs[0]!;
    const s1 = game.reduce(s0, leftEv(gone)).state;
    const rest = [imp, ...civs.filter((c) => c !== gone)];
    const s2 = run(s1, rest.map((p) => ack(p)));
    expect(game.phaseKey(s2)).toBe('discuss:m0:p0');
  });

  it('a leave can COMPLETE the expected ack set', () => {
    const s0 = game.init('s', players, content);
    const { imp, civs } = roles(s0);
    const gone = civs[0]!;
    const rest = [imp, ...civs.filter((c) => c !== gone)];
    const s1 = run(s0, rest.map((p) => ack(p)));
    expect(s1.phase).toBe('secretReveal'); // gone is still expected
    const s2 = game.reduce(s1, leftEv(gone)).state;
    expect(game.phaseKey(s2)).toBe('discuss:m0:p0');
  });

  it('a leave can COMPLETE the expected ready set', () => {
    const s0 = run(game.init('s', players, content), [dl(1)]);
    expect(s0.phase).toBe('discuss');
    const { imp, civs } = roles(s0);
    const gone = civs[0]!;
    const rest = [imp, ...civs.filter((c) => c !== gone)];
    const s1 = run(s0, rest.map((p) => ready(p)));
    expect(s1.phase).toBe('discuss');
    const s2 = game.reduce(s1, leftEv(gone)).state;
    expect(game.phaseKey(s2)).toBe('vote:m0:p0');
  });

  it('a NON-impostor leave can COMPLETE the expected vote set; their absence abstains them', () => {
    const s0 = toVotePhase(game.init('s', players, content));
    const { imp, civs } = roles(s0);
    const gone = civs[0]!;
    // the three remaining (incl. the impostor) all vote a tie-free miss target
    const s1 = run(s0, [vote(civs[1]!, gone), vote(civs[2]!, gone), vote(imp, gone)]);
    expect(s1.phase).toBe('vote'); // gone still expected
    const s2 = game.reduce(s1, leftEv(gone)).state;
    expect(s2.phase).toBe('verdict'); // unique plurality on a civilian = miss
    expect(s2.voteRecords[0]!.abstained).toEqual([gone]);
    expect(s2.voteRecords[0]!.topAccused).toBe(gone); // publicly cleared
  });

  it('an already-cast ballot survives its caster leaving (vote locks, leave abstains nobody retroactively)', () => {
    const s0 = toVotePhase(game.init('s', players, content));
    const { imp, civs } = roles(s0);
    const s1 = game.reduce(s0, vote(civs[0]!, imp)).state;
    const s2 = game.reduce(s1, leftEv(civs[0]!)).state;
    expect(s2.phase).toBe('vote'); // two voters still expected
    const s3 = run(s2, [vote(civs[1]!, imp), vote(civs[2]!, imp), vote(imp, civs[1]!)]);
    expect(s3.phase).toBe('finalReveal');
    expect(s3.voteRecords[0]!.tally[imp]).toBe(3); // the leaver's ballot still counted
    expect(s3.voteRecords[0]!.abstained).toEqual([]);
  });

  it('a rejoined player is expected again mid-vote', () => {
    const s0 = toVotePhase(game.init('s', players, content));
    const { imp, civs } = roles(s0);
    const back = civs[0]!;
    const s1 = game.reduce(s0, leftEv(back)).state;
    const s2 = game.reduce(s1, rejoinEv(back)).state;
    // the other three vote — back is expected again, so the phase must NOT resolve
    const s3 = run(s2, [vote(civs[1]!, back), vote(civs[2]!, back), vote(imp, back)]);
    expect(s3.phase).toBe('vote');
    const s4 = game.reduce(s3, vote(back, civs[1]!)).state;
    expect(s4.phase).toBe('verdict'); // now complete: 3-1 on back = miss, cleared
  });

  it('a fully passive disconnected room still rolls to over on deadlines alone', () => {
    let s = game.init('s', players, content);
    const { civs } = roles(s);
    // two civilians vanish (the impostor stays — an impostor leave is its own path)
    s = run(s, [leftEv(civs[0]!), leftEv(civs[1]!)]);
    let steps = 0;
    while (s.phase !== 'over' && steps < 30) {
      const next = game.reduce(s, dl(1_000 + steps)).state;
      expect(next).not.toBe(s);
      s = next;
      steps += 1;
    }
    expect(s.phase).toBe('over');
  });
});

describe('impostor disconnect path (never hunt a ghost)', () => {
  it('the impostor leaving during the vote ends the match without resolving the buffered round', () => {
    const s0 = toVotePhase(game.init('s', players, content));
    const { imp, civs } = roles(s0);
    const s1 = run(s0, [vote(civs[0]!, imp), vote(civs[1]!, imp)]);
    const s2 = game.reduce(s1, leftEv(imp)).state;
    expect(s2.phase).toBe('finalReveal');
    expect(s2.results[0]!.endReason).toBe('impostorLeft');
    expect(s2.results[0]!.voteRecords).toEqual([]); // round never resolved
    expect(s2.votes).toEqual({}); // buffer dropped, never promoted
  });

  it('the impostor leaving during finalReveal does NOT restart the ended match', () => {
    const s0 = toVotePhase(game.init('s', players, content));
    const { imp, civs } = roles(s0);
    const s1 = run(s0, [vote(civs[0]!, imp), vote(civs[1]!, imp), vote(civs[2]!, imp), vote(imp, civs[0]!)]);
    expect(s1.phase).toBe('finalReveal');
    const s2 = game.reduce(s1, leftEv(imp)).state;
    expect(s2.phase).toBe('finalReveal');
    expect(s2.results).toHaveLength(1);
    expect(s2.connected[imp]).toBe(false);
  });

  it('the next match never seeds a disconnected player as impostor', () => {
    const s0 = toVotePhase(game.init('s', players, content));
    const { imp, civs } = roles(s0);
    const s1 = run(s0, [vote(civs[0]!, imp), vote(civs[1]!, imp), vote(civs[2]!, imp), vote(imp, civs[0]!)]);
    const s2 = game.reduce(s1, leftEv(imp)).state; // leaves during finalReveal
    const s3 = game.reduce(s2, dl(9)).state; // next match starts
    expect(s3.match).toBe(1);
    expect(s3.impostor).not.toBe(imp);
    expect(s3.connected[s3.impostor]).toBe(true);
  });
});
