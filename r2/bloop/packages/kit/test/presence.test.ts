import { describe, expect, it } from 'vitest';
import { allActed, connectedPlayers, initPresence, setConnected } from '@bloop/kit';

const roster = ['p1', 'p2', 'p3'];

describe('presence', () => {
  it('initPresence marks every roster player connected, null-proto', () => {
    const p = initPresence(roster);
    expect(p).toEqual({ p1: true, p2: true, p3: true });
    expect(Object.getPrototypeOf(p)).toBeNull();
  });

  it('setConnected is copy-on-write and never deletes roster keys', () => {
    const p0 = initPresence(roster);
    const p1 = setConnected(p0, 'p2', false);
    expect(p1).toEqual({ p1: true, p2: false, p3: true });
    expect(p0).toEqual({ p1: true, p2: true, p3: true }); // original untouched
    expect(Object.getPrototypeOf(p1)).toBeNull();
  });

  it('round-trips a disconnect/reconnect', () => {
    const p = setConnected(setConnected(initPresence(roster), 'p3', false), 'p3', true);
    expect(p).toEqual({ p1: true, p2: true, p3: true });
  });

  it('connectedPlayers filters in roster order', () => {
    const p = setConnected(initPresence(roster), 'p1', false);
    expect(connectedPlayers(roster, p)).toEqual(['p2', 'p3']);
    expect(connectedPlayers(roster, initPresence(roster))).toEqual(roster);
  });

  it('stays null-proto and pollution-safe with a "__proto__" id', () => {
    const p = setConnected(initPresence(['p1', '__proto__']), '__proto__', false);
    expect(p['__proto__']).toBe(false);
    expect(Object.getPrototypeOf(p)).toBeNull();
    expect(allActed(['__proto__'], p)).toBe(true); // entry present (false ≠ undefined)
  });
});

describe('allActed', () => {
  it('is true when every expected actor has an entry', () => {
    expect(allActed(['p1', 'p2'], { p1: 'x', p2: 'y' })).toBe(true);
  });

  it('is false while any expected actor is missing', () => {
    expect(allActed(['p1', 'p2'], { p1: 'x' })).toBe(false);
  });

  it('treats falsy-but-present entries (e.g. answer 0) as acted, and ignores non-expected actors', () => {
    expect(allActed(['p1'], { p1: 0, ghost: 9 })).toBe(true);
  });

  it('is vacuously true for an empty expected set', () => {
    expect(allActed([], {})).toBe(true);
  });
});
