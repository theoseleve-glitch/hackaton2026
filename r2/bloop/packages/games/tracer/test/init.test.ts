import { describe, expect, it } from 'vitest';
import type { ContentPack } from '@bloop/engine';
import { tracer, type TracerContent } from '@bloop/game-tracer';

const content: ContentPack<TracerContent> = {
  id: 'tracer-pack-1',
  version: 1,
  data: { prompts: ['Most likely to fall asleep first?', 'Best dancer?', 'Worst cook?', 'Most likely to be famous?'] },
};
const players = ['p1', 'p2', 'p3'];

describe('tracer.init', () => {
  it('starts in vote phase, round 0, zeroed scores', () => {
    const s = tracer.init('seed-1', players, content);
    expect(s.phase).toBe('vote');
    expect(s.round).toBe(0);
    expect(s.votes).toEqual({});
    expect(s.scores).toEqual({ p1: 0, p2: 0, p3: 0 });
    expect(s.players).toEqual(players);
  });

  it('shuffles prompts deterministically by seed', () => {
    const a = tracer.init('seed-1', players, content);
    const b = tracer.init('seed-1', players, content);
    const c = tracer.init('seed-2', players, content);
    expect(a.prompts).toEqual(b.prompts);
    expect([...a.prompts].sort()).toEqual([...content.data.prompts].sort());
    expect(a.prompts.join()).not.toEqual(c.prompts.join());
  });

  it('caps totalRounds at the number of prompts', () => {
    const tiny: ContentPack<TracerContent> = {
      id: 't', version: 1, data: { prompts: ['Only one?'] },
    };
    const s = tracer.init('s', players, tiny);
    expect(s.config.totalRounds).toBe(1);
  });
});
