import { describe, expect, it } from 'vitest';
import type { ServerMessage } from '@bloop/protocol';
import { initialSession, reduceSession, type SessionState } from '../src/net/session';

const msg = (m: ServerMessage) => ({ type: 'message' as const, message: m });
const seq = (events: Parameters<typeof reduceSession>[1][]): SessionState =>
  events.reduce(reduceSession, initialSession);
const PLAYERS = [
  { id: 'p1', profile: { nickname: 'Anna', avatar: 'emoji:fox' }, connected: true, isHost: true },
  { id: 'p2', profile: { nickname: 'Bert', avatar: 'emoji:frog' }, connected: false, isHost: false },
];

describe('session reducer — the connection/lobby/game state machine (pure)', () => {
  it('starts connecting; socketOpen → open', () => {
    expect(initialSession.status).toBe('connecting');
    expect(seq([{ type: 'socketOpen' }]).status).toBe('open');
  });

  it('welcome stores identity + reconnect token', () => {
    const s = seq([{ type: 'socketOpen' }, msg({ type: 'welcome', playerId: 'p1', reconnectToken: 'tok' })]);
    expect(s.playerId).toBe('p1');
    expect(s.reconnectToken).toBe('tok');
  });

  it('lobby replaces the squad list and picked game', () => {
    const s = seq([{ type: 'socketOpen' }, msg({ type: 'lobby', players: PLAYERS, gameId: null })]);
    expect(s.players).toEqual(PLAYERS);
    expect(s.gameId).toBeNull();
  });

  it('view stores the opaque payload + gameId + deadline', () => {
    const s = seq([{ type: 'socketOpen' }, msg({ type: 'view', gameId: 'tracer', view: { phase: 'over', scores: {} }, deadlineAt: 123 })]);
    expect(s.viewGameId).toBe('tracer');
    expect(s.view).toEqual({ phase: 'over', scores: {} });
    expect(s.deadlineAt).toBe(123);
  });

  it('UPGRADE_REQUIRED is fatal and absorbing', () => {
    const s = seq([{ type: 'socketOpen' }, msg({ type: 'error', code: 'UPGRADE_REQUIRED' })]);
    expect(s.status).toBe('fatal');
    expect(s.fatal).toBe('UPGRADE_REQUIRED');
    const after = reduceSession(s, msg({ type: 'lobby', players: PLAYERS, gameId: null }));
    expect(after).toBe(s); // absorbed — nothing mutates a dead session
  });

  it('ROOM_FULL is fatal', () => {
    expect(seq([{ type: 'socketOpen' }, msg({ type: 'error', code: 'ROOM_FULL' })]).fatal).toBe('ROOM_FULL');
  });

  it('BAD_MESSAGE toasts (covers the rate-limit warn — the server reuses the code) and is non-fatal', () => {
    const s = seq([{ type: 'socketOpen' }, msg({ type: 'error', code: 'BAD_MESSAGE' })]);
    expect(s.status).toBe('open');
    expect(s.toast?.kind).toBe('error');
    expect(s.toast?.seq).toBe(1);
  });

  it('NOT_HOST / UNKNOWN_GAME toast distinct copy and bump seq', () => {
    const s1 = seq([{ type: 'socketOpen' }, msg({ type: 'error', code: 'NOT_HOST' })]);
    const s2 = reduceSession(s1, msg({ type: 'error', code: 'UNKNOWN_GAME' }));
    expect(s1.toast?.text).not.toBe(s2.toast?.text);
    expect(s2.toast?.seq).toBe(2);
  });

  it('socketClosed → reconnecting (banner state), then reopen → open', () => {
    const s = seq([{ type: 'socketOpen' }, { type: 'socketClosed' }]);
    expect(s.status).toBe('reconnecting');
    expect(reduceSession(s, { type: 'socketOpen' }).status).toBe('open');
  });

  it('socketClosed after fatal stays fatal', () => {
    const s = seq([{ type: 'socketOpen' }, msg({ type: 'error', code: 'ROOM_FULL' }), { type: 'socketClosed' }]);
    expect(s.status).toBe('fatal');
  });

  it('lobby keeps working after a game ends (back-to-lobby path)', () => {
    const over = msg({ type: 'view', gameId: 'tracer', view: { phase: 'over', scores: { p1: 1 } }, deadlineAt: null });
    const s = seq([{ type: 'socketOpen' }, msg({ type: 'lobby', players: PLAYERS, gameId: null }), over,
      msg({ type: 'lobby', players: PLAYERS.slice(0, 1), gameId: 'tracer' })]);
    expect(s.players).toHaveLength(1);
    expect(s.view).toEqual({ phase: 'over', scores: { p1: 1 } }); // view persists until the next game overwrites it
  });
});
