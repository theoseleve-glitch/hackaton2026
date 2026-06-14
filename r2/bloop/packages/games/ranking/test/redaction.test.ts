import { describe, expect, it } from 'vitest';
import { leakedSecrets } from '@bloop/engine';
import { content, game, players, rank } from './fixtures.js';

describe('redaction: ballots are value-secrets until reveal', () => {
  it('a non-actor never sees another player\'s ranking during rank', () => {
    const s0 = game.init('seed', players, content);
    // p1 submits a distinctive ordering; p2/p3 have not.
    const s1 = game.reduce(s0, rank('p1', ['p3', 'p1', 'p2'])).state;
    expect(s1.phase).toBe('rank');

    // The OWNER sees their own ordering echoed.
    const vOwner = game.view(s1, 'p1');
    if (vOwner.phase !== 'rank') throw new Error('expected rank view');
    expect(vOwner.myOrder).toEqual(['p3', 'p1', 'p2']);
    expect(vOwner.hasSubmitted).toEqual({ p1: true, p2: false, p3: false });

    // A NON-actor sees only the public hasSubmitted, never p1's order.
    const vOther = game.view(s1, 'p2');
    if (vOther.phase !== 'rank') throw new Error('expected rank view');
    expect(vOther.myOrder).toBeNull();
    expect(vOther.hasSubmitted).toEqual({ p1: true, p2: false, p3: false });
    // No 'result', no 'aggregate', no 'ballots' field exists pre-reveal.
    expect('result' in vOther).toBe(false);

    // An unknown / spectator viewer gets a non-leaking projection.
    const vGhost = game.view(s1, 'ghost');
    if (vGhost.phase !== 'rank') throw new Error('expected rank view');
    expect(vGhost.myOrder).toBeNull();
  });

  it('leakedSecrets: a foreign ballot signature never appears in any non-owner rank view', () => {
    const s0 = game.init('seed', players, content);
    let s = game.reduce(s0, rank('p1', ['p3', 'p1', 'p2'])).state;
    s = game.reduce(s, rank('p2', ['p2', 'p3', 'p1'])).state;
    // s still in rank (p3 has not submitted) — the two ballots are hidden.
    expect(s.phase).toBe('rank');

    // The serialized full-ordering of each owner must not appear in others' views.
    // We encode each ballot as a comma signature and audit it as a secret string.
    const secrets = [
      { value: '["p3","p1","p2"]', owner: 'p1' },
      { value: '["p2","p3","p1"]', owner: 'p2' },
    ];
    const leaks = leakedSecrets(game, s, ['p1', 'p2', 'p3', 'ghost'], secrets);
    expect(leaks).toEqual([]);
  });

  it('aggregate, every ballot, and scores become public ONLY at reveal', () => {
    const s0 = game.init('seed', players, content);
    let s = game.reduce(s0, rank('p1', ['p3', 'p1', 'p2'])).state;
    s = game.reduce(s, rank('p2', ['p3', 'p2', 'p1'])).state;
    // Final connected player submits -> early-resolve into reveal.
    s = game.reduce(s, rank('p3', ['p3', 'p2', 'p1'])).state;
    expect(s.phase).toBe('reveal');

    const v = game.view(s, 'p2');
    if (v.phase !== 'reveal') throw new Error('expected reveal view');
    // The room's verdict (aggregate) is exposed.
    expect(v.result.aggregate.length).toBe(3);
    // EVERY player's now-public ordering is exposed (p3 was clearly ranked #1).
    expect(v.result.ballots.p1).toEqual(['p3', 'p1', 'p2']);
    expect(v.result.ballots.p2).toEqual(['p3', 'p2', 'p1']);
    expect(v.result.ballots.p3).toEqual(['p3', 'p2', 'p1']);
    // Per-player closeness scoring is present.
    expect(v.result.closeness.length).toBe(3);
  });
});
