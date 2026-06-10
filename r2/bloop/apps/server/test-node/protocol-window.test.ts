import { describe, expect, it } from 'vitest';
import { acceptsProtocol } from '../src/room/protocol-window.js';

describe('acceptsProtocol (review M3: one explicit predicate)', () => {
  it('accepts iff pinned <= client <= pinned + 1', () => {
    expect(acceptsProtocol(1, 1)).toBe(true); // pinned version
    expect(acceptsProtocol(2, 1)).toBe(true); // one ahead: client updated mid-transition
    expect(acceptsProtocol(1, 2)).toBe(false); // below pin -> must update
    expect(acceptsProtocol(3, 1)).toBe(false); // too far ahead
  });
});
