import { describe, it, expect } from 'vitest';
import { smin, blobSchedule } from '../src/math/metaball';

describe('metaball math', () => {
  it('smin blends below both inputs near the seam', () => {
    expect(smin(1, 1, 0.5)).toBeLessThan(1);
    expect(smin(0, 5, 0.5)).toBeCloseTo(0, 1);
  });
  it('schedules one droplet per library card at increasing scroll', () => {
    const s = blobSchedule(5);
    expect(s).toHaveLength(5);
    expect(s.every((d, i) => i === 0 || d.at > s[i - 1].at)).toBe(true);
    expect(s.every((d) => d.at >= 0 && d.at <= 1)).toBe(true);
  });
});
