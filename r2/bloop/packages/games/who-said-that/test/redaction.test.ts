import { describe, expect, it } from 'vitest';
import { leakedSecrets, type ContentPack } from '@bloop/engine';
import {
  whoSaidThat,
  type WhoSaidThatContent,
  type WhoSaidThatState,
} from '@bloop/game-who-said-that';

const content: ContentPack<WhoSaidThatContent> = {
  id: 'qadc-test',
  version: 1,
  data: { statements: ['S1', 'S2', 'S3'] },
};
const players = ['p1', 'p2', 'p3', 'p4'];

function confess(state: WhoSaidThatState, p: string, value: boolean, at = 0): WhoSaidThatState {
  return whoSaidThat.reduce(state, { type: 'action', playerId: p, action: { kind: 'confess', value }, at }).state;
}
function accuse(state: WhoSaidThatState, p: string, target: string, at = 0): WhoSaidThatState {
  return whoSaidThat.reduce(state, { type: 'action', playerId: p, action: { kind: 'accuse', target }, at }).state;
}

describe('who-said-that redaction', () => {
  it('hides the confession buffer entirely during confess — not even the count', () => {
    const s0 = whoSaidThat.init('seed', players, content);
    // p1 = MOI(true), p2 = PAS MOI(false), p3 = MOI(true); p4 not yet acted.
    let s = confess(s0, 'p1', true, 1);
    s = confess(s, 'p2', false, 2);
    s = confess(s, 'p3', true, 3);
    expect(s.phase).toBe('confess');

    for (const viewer of [...players, 'spectator-x']) {
      const v = whoSaidThat.view(s, viewer);
      if (v.phase !== 'confess') throw new Error('expected confess view');
      const json = JSON.stringify(v);
      // No raw buffers, no count, no other player's value.
      expect(json).not.toContain('"confessions"');
      expect(json).not.toContain('confessorCount');
      // acted-or-not only.
      expect(v.hasConfessed).toEqual({ p1: true, p2: true, p3: true, p4: false });
    }
  });

  it('echoes only the OWNER their own confession during confess', () => {
    const s0 = whoSaidThat.init('seed', players, content);
    const s = confess(s0, 'p1', true, 1);
    const v1 = whoSaidThat.view(s, 'p1');
    const v2 = whoSaidThat.view(s, 'p2');
    if (v1.phase !== 'confess' || v2.phase !== 'confess') throw new Error('expected confess views');
    expect(v1.myConfession).toBe(true);
    expect(v2.myConfession).toBeNull();
  });

  it('exposes the confessor COUNT (and only the count) at the attribute phase', () => {
    const s0 = whoSaidThat.init('seed', players, content);
    let s = confess(s0, 'p1', true, 1);
    s = confess(s, 'p2', false, 2);
    s = confess(s, 'p3', true, 3);
    s = confess(s, 'p4', true, 4); // allActed -> resolve to attribute
    expect(s.phase).toBe('attribute');

    const v = whoSaidThat.view(s, 'p2');
    if (v.phase !== 'attribute') throw new Error('expected attribute view');
    expect(v.confessorCount).toBe(3); // p1, p3, p4 said MOI

    // The COUNT is public, but never the identities of the confessors.
    for (const viewer of [...players, 'spectator-x']) {
      const json = JSON.stringify(whoSaidThat.view(s, viewer));
      expect(json).not.toContain('"confessions"');
      expect(json).not.toContain('"confessors"');
    }
  });

  it('hides accusations during attribute (owner echo only, no targets leaked)', () => {
    const s0 = whoSaidThat.init('seed', players, content);
    let s = confess(s0, 'p1', true, 1);
    s = confess(s, 'p2', false, 2);
    s = confess(s, 'p3', true, 3);
    s = confess(s, 'p4', true, 4);
    s = accuse(s, 'p2', 'p1', 5); // p2 accuses p1
    expect(s.phase).toBe('attribute');

    const vOwner = whoSaidThat.view(s, 'p2');
    const vOther = whoSaidThat.view(s, 'p3');
    if (vOwner.phase !== 'attribute' || vOther.phase !== 'attribute') throw new Error('expected attribute views');
    expect(vOwner.myAccusation).toBe('p1');
    expect(vOther.myAccusation).toBeNull();
    expect(vOther.hasAccused).toEqual({ p1: false, p2: true, p3: false, p4: false });

    for (const viewer of players) {
      const json = JSON.stringify(whoSaidThat.view(s, viewer));
      expect(json).not.toContain('"accusations"');
      if (viewer !== 'p2') expect(json).not.toContain('"myAccusation":"p1"');
    }
  });

  it('leakedSecrets: no confession-value-secret leaks to non-owners pre-reveal', () => {
    // Use distinctive statement strings as the value-secret carrier by marking
    // confessor identities: the audit here checks structural fields. We assert
    // the buffer maps never serialize for non-actors via the field checks above;
    // here we confirm the confessor SET never appears pre-reveal as a JSON array.
    const s0 = whoSaidThat.init('seed', players, content);
    let s = confess(s0, 'p1', true, 1);
    s = confess(s, 'p2', true, 2);
    s = confess(s, 'p3', false, 3);
    s = confess(s, 'p4', false, 4); // -> attribute
    // The pair {p1,p2} confessed. Their joint identity must not be derivable.
    const leaks = leakedSecrets(whoSaidThat, s, players, [
      // A confessor-set marker string never put into state — sanity: this should
      // never leak. Instead, assert the structural invariant: confessions map
      // value-secret. We encode it as the literal field name appearing only in state.
      { value: '"confessions":' },
    ]);
    expect(leaks).toEqual([]);
  });

  it('reveals the full result (confessors + accusations) only at reveal', () => {
    const s0 = whoSaidThat.init('seed', players, content);
    let s = confess(s0, 'p1', true, 1);
    s = confess(s, 'p2', false, 2);
    s = confess(s, 'p3', false, 3);
    s = confess(s, 'p4', true, 4); // -> attribute (confessors p1,p4)
    s = accuse(s, 'p1', 'p4', 5);
    s = accuse(s, 'p2', 'p1', 6);
    s = accuse(s, 'p3', 'p2', 7);
    s = accuse(s, 'p4', 'p1', 8); // allActed -> reveal
    expect(s.phase).toBe('reveal');

    const v = whoSaidThat.view(s, 'p3');
    if (v.phase !== 'reveal') throw new Error('expected reveal view');
    expect(v.result.confessors).toEqual(['p1', 'p4']);
    expect(v.result.accusations).toEqual({ p1: 'p4', p2: 'p1', p3: 'p2', p4: 'p1' });
  });

  it('gives unknown viewers (spectators) a safe view with no owner echo', () => {
    const s0 = whoSaidThat.init('seed', players, content);
    const s = confess(s0, 'p1', true, 1);
    const v = whoSaidThat.view(s, 'spectator-x');
    if (v.phase !== 'confess') throw new Error('expected confess view');
    expect(v.myConfession).toBeNull();
  });
});
