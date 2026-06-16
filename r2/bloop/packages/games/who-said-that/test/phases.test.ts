import { describe, expect, it } from 'vitest';
import type { ContentPack } from '@bloop/engine';
import {
  DEFAULT_CONFIG,
  whoSaidThat,
  type WhoSaidThatContent,
  type WhoSaidThatState,
} from '@bloop/game-who-said-that';

const content: ContentPack<WhoSaidThatContent> = {
  id: 'qadc-test',
  version: 1,
  data: { statements: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'] },
};
const players = ['p1', 'p2', 'p3', 'p4'];

/** A round driven purely by deadlines: confess -> attribute -> reveal -> next. */
function playRoundByDeadline(state: WhoSaidThatState): WhoSaidThatState {
  const attribute = whoSaidThat.reduce(state, { type: 'deadline', at: 0 }).state;
  const reveal = whoSaidThat.reduce(attribute, { type: 'deadline', at: 1 }).state;
  return whoSaidThat.reduce(reveal, { type: 'deadline', at: 2 }).state;
}

describe('who-said-that phases', () => {
  it('starts in confess at round 0', () => {
    const s0 = whoSaidThat.init('seed', players, content);
    expect(s0.phase).toBe('confess');
    expect(s0.round).toBe(0);
    expect(s0.config.totalRounds).toBe(DEFAULT_CONFIG.totalRounds);
  });

  it('reports the configured per-phase durations and null when over', () => {
    const s0 = whoSaidThat.init('seed', players, content);
    expect(whoSaidThat.phaseDurationMs(s0)).toBe(DEFAULT_CONFIG.confessMs);

    const attribute = whoSaidThat.reduce(s0, { type: 'deadline', at: 0 }).state;
    expect(attribute.phase).toBe('attribute');
    expect(whoSaidThat.phaseDurationMs(attribute)).toBe(DEFAULT_CONFIG.attributeMs);

    const reveal = whoSaidThat.reduce(attribute, { type: 'deadline', at: 1 }).state;
    expect(reveal.phase).toBe('reveal');
    expect(whoSaidThat.phaseDurationMs(reveal)).toBe(DEFAULT_CONFIG.revealMs);
  });

  it('walks confess -> attribute -> reveal -> next confess with cleared buffers', () => {
    const s0 = whoSaidThat.init('seed', players, content);
    const s1 = playRoundByDeadline(s0);
    expect(s1.phase).toBe('confess');
    expect(s1.round).toBe(1);
    expect(s1.confessions).toEqual({});
    expect(s1.accusations).toEqual({});
    expect(s1.lastResult).toBeNull();
  });

  it('reaches over after totalRounds and emits a gameOver effect with final scores', () => {
    let state = whoSaidThat.init('seed', players, content);
    const rounds = state.config.totalRounds;
    for (let i = 0; i < rounds - 1; i++) state = playRoundByDeadline(state);

    const attribute = whoSaidThat.reduce(state, { type: 'deadline', at: 0 }).state;
    const reveal = whoSaidThat.reduce(attribute, { type: 'deadline', at: 1 }).state;
    const { state: over, effects } = whoSaidThat.reduce(reveal, { type: 'deadline', at: 2 });

    expect(over.phase).toBe('over');
    expect(whoSaidThat.phaseDurationMs(over)).toBeNull();
    expect(effects).toContainEqual({ type: 'gameOver', scores: over.scores });
  });

  it('caps totalRounds at the pack size', () => {
    const tiny: ContentPack<WhoSaidThatContent> = {
      id: 'tiny', version: 1, data: { statements: ['only', 'two'] },
    };
    const s0 = whoSaidThat.init('seed', players, tiny);
    expect(s0.config.totalRounds).toBe(2);
  });

  it('is inert once over', () => {
    let state = whoSaidThat.init('seed', players, content);
    for (let i = 0; i < state.config.totalRounds; i++) state = playRoundByDeadline(state);
    expect(state.phase).toBe('over');
    const { state: still, effects } = whoSaidThat.reduce(state, { type: 'deadline', at: 99 });
    expect(still).toBe(state);
    expect(effects).toEqual([]);
  });

  it('phaseKey changes per phase and per round, and is bare "over" at the end', () => {
    const s0 = whoSaidThat.init('seed', players, content);
    expect(whoSaidThat.phaseKey(s0)).toBe('confess:0');
    const attribute = whoSaidThat.reduce(s0, { type: 'deadline', at: 0 }).state;
    expect(whoSaidThat.phaseKey(attribute)).toBe('attribute:0');
    const reveal = whoSaidThat.reduce(attribute, { type: 'deadline', at: 1 }).state;
    expect(whoSaidThat.phaseKey(reveal)).toBe('reveal:0');
    const next = whoSaidThat.reduce(reveal, { type: 'deadline', at: 2 }).state;
    expect(whoSaidThat.phaseKey(next)).toBe('confess:1');

    let state = whoSaidThat.init('seed', players, content);
    for (let i = 0; i < state.config.totalRounds; i++) state = playRoundByDeadline(state);
    expect(whoSaidThat.phaseKey(state)).toBe('over');
  });
});
