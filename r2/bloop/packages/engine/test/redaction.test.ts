import { describe, expect, it } from 'vitest';
import { leakedSecrets, type GameModule } from '@bloop/engine';

interface SpyState {
  word: string;
  players: string[];
}

function makeModule(leaky: boolean): GameModule<SpyState, never, unknown> {
  return {
    id: 'spy-fixture',
    version: 1,
    minPlayers: 2,
    maxPlayers: 8,
    init: (_seed, players) => ({ word: 'crocodile', players }),
    reduce: (state) => ({ state, effects: [] }),
    view: (state, viewer) =>
      leaky || viewer === 'spy-owner'
        ? { youAre: state.word }
        : { youAre: 'civilian' },
    phaseDurationMs: () => null,
  };
}

const content = { id: 'c', version: 1, data: {} };
const viewers = ['spy-owner', 'p2', 'p3'];
const secrets = [{ value: 'crocodile', owner: 'spy-owner' }];

describe('leakedSecrets', () => {
  it('catches a module that leaks a secret to non-owners', () => {
    const mod = makeModule(true);
    const state = mod.init('s', viewers, content);
    const leaks = leakedSecrets(mod, state, viewers, secrets);
    expect(leaks).toEqual([
      { viewer: 'p2', value: 'crocodile' },
      { viewer: 'p3', value: 'crocodile' },
    ]);
  });

  it('passes a module that only shows owners their own secret', () => {
    const mod = makeModule(false);
    const state = mod.init('s', viewers, content);
    expect(leakedSecrets(mod, state, viewers, secrets)).toEqual([]);
  });

  it('throws on an empty secret value instead of matching everything', () => {
    const mod = makeModule(false);
    const state = mod.init('s', viewers, content);
    expect(() =>
      leakedSecrets(mod, state, viewers, [{ value: '' }]),
    ).toThrow(/empty secret/);
  });
});
