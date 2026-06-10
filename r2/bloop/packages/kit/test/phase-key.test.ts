import { describe, expect, it } from 'vitest';
import { phaseKeyOf } from '@bloop/kit';

describe('phaseKeyOf', () => {
  it('renders a bare phase (terminal "over")', () => {
    expect(phaseKeyOf('over')).toBe('over');
  });

  it('renders phase + round as "<phase>:r<round>"', () => {
    expect(phaseKeyOf('vote', 2)).toBe('vote:r2');
    expect(phaseKeyOf('reveal', 0)).toBe('reveal:r0');
  });

  it('renders a sub-segment for per-turn / per-beat uniqueness', () => {
    expect(phaseKeyOf('reveal', 0, 'gold')).toBe('reveal:r0:gold');
    expect(phaseKeyOf('clue', 0, 't3')).toBe('clue:r0:t3');
  });

  it('supports turnSeq-style keys (sub without round)', () => {
    expect(phaseKeyOf('prompt', undefined, 7)).toBe('prompt:7');
  });
});
