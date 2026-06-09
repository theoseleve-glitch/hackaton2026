import { describe, expect, it } from 'vitest';
import {
  clientMessageSchema,
  PROTOCOL_VERSION,
  serverMessageSchema,
} from '@bloop/protocol';

describe('clientMessageSchema', () => {
  it('accepts a valid hello', () => {
    const msg = {
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      profile: { nickname: 'Théo', avatar: 'fox-3' },
    };
    expect(clientMessageSchema.parse(msg)).toEqual(msg);
  });

  it('rejects an empty nickname', () => {
    const msg = {
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      profile: { nickname: '', avatar: 'fox-3' },
    };
    expect(clientMessageSchema.safeParse(msg).success).toBe(false);
  });

  it('rejects unknown message types', () => {
    expect(clientMessageSchema.safeParse({ type: 'hack' }).success).toBe(false);
  });

  it('accepts a game action with arbitrary payload', () => {
    const msg = { type: 'action', payload: { kind: 'vote', target: 'p2' } };
    expect(clientMessageSchema.parse(msg)).toEqual(msg);
  });
});

describe('serverMessageSchema', () => {
  it('accepts a view broadcast', () => {
    const msg = {
      type: 'view',
      gameId: 'tracer',
      view: { phase: 'vote' },
      deadlineAt: 1750000000000,
    };
    expect(serverMessageSchema.parse(msg)).toEqual(msg);
  });

  it('accepts a typed error', () => {
    const msg = { type: 'error', code: 'UPGRADE_REQUIRED' };
    expect(serverMessageSchema.parse(msg)).toEqual(msg);
  });

  it('rejects unknown error codes', () => {
    expect(
      serverMessageSchema.safeParse({ type: 'error', code: 'NOPE' }).success,
    ).toBe(false);
  });
});

describe('validation boundary', () => {
  it('rejects an oversized nickname', () => {
    const msg = {
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      profile: { nickname: 'x'.repeat(21), avatar: 'fox-3' },
    };
    expect(clientMessageSchema.safeParse(msg).success).toBe(false);
  });

  it('rejects hello without a profile', () => {
    const msg = { type: 'hello', protocolVersion: PROTOCOL_VERSION };
    expect(clientMessageSchema.safeParse(msg).success).toBe(false);
  });

  it('rejects zero, negative, and non-integer protocol versions', () => {
    for (const protocolVersion of [0, 1.5, -1]) {
      const msg = {
        type: 'hello',
        protocolVersion,
        profile: { nickname: 'a', avatar: '' },
      };
      expect(clientMessageSchema.safeParse(msg).success).toBe(false);
    }
  });

  it('rejects an oversized gameId', () => {
    const msg = { type: 'startGame', gameId: 'x'.repeat(65) };
    expect(clientMessageSchema.safeParse(msg).success).toBe(false);
  });

  it('strips unknown keys instead of keeping them', () => {
    const msg = { type: 'startGame', gameId: 'tracer', evil: 'x' };
    const parsed = clientMessageSchema.parse(msg);
    expect(parsed).toEqual({ type: 'startGame', gameId: 'tracer' });
    expect('evil' in parsed).toBe(false);
  });
});
