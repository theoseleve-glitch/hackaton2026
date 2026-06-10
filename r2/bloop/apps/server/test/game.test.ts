import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@bloop/game-tracer';
import { Store } from '../src/room/store.js';
import { expectError, expectSilence, expectTracerView, join, sendJson, setupRoom, startTracer } from './helpers.js';

const eventCount = (code: string) =>
  runInDurableObject(env.ROOM.getByName(code), (_i, state) => new Store(state.storage.sql).eventCount());

describe('the game loop (design §4): startGame, actions, deadlines, gameOver', () => {
  it('guards startGame: below minPlayers and double-start are BAD_MESSAGE', async () => {
    const solo = await setupRoom(['OnlyMe']);
    sendJson(solo.socks[0]!, { type: 'startGame', gameId: 'tracer' });
    expect(await expectError(solo.socks[0]!)).toBe('BAD_MESSAGE'); // 1 < tracer.minPlayers
    const room = await startTracer(['Anna', 'Bert']);
    sendJson(room.socks[0]!, { type: 'startGame', gameId: 'tracer' });
    expect(await expectError(room.socks[0]!)).toBe('BAD_MESSAGE'); // already playing
  });

  it('startGame seeds + broadcasts per-player vote views with ONE absolute deadline; the alarm is armed to it; nothing is logged', async () => {
    const before = Date.now();
    const { code, views } = await startTracer(['Anna', 'Bert', 'Cara']);
    for (const { view, deadlineAt } of views) {
      if (view.phase !== 'vote') throw new Error(`expected vote, got ${view.phase}`);
      expect(view.round).toBe(0);
      expect(view.myVote).toBeNull();
      expect(Object.values(view.hasVoted)).toEqual([false, false, false]);
      expect(deadlineAt!).toBeGreaterThanOrEqual(before + DEFAULT_CONFIG.voteMs);
      expect(deadlineAt!).toBeLessThanOrEqual(Date.now() + DEFAULT_CONFIG.voteMs);
    }
    expect(new Set(views.map((v) => v.deadlineAt)).size).toBe(1); // one authority for every phone
    const alarm = await runInDurableObject(env.ROOM.getByName(code), (_i, state) => state.storage.getAlarm());
    expect(alarm).toBe(views[0]!.deadlineAt);
    expect(await eventCount(code)).toBe(0); // init is re-derivable from (seed, roster, content)
  });

  it('rejects fresh joins mid-game with ROOM_FULL (the roster froze at startGame)', async () => {
    const { code } = await startTracer(['Anna', 'Bert']);
    const late = await join(code, 'Late');
    expect(await expectError(late)).toBe('ROOM_FULL');
  });

  it('votes flow with per-player redaction; the last ballot auto-advances to reveal without the alarm', async () => {
    const { socks, welcomes } = await startTracer(['Anna', 'Bert', 'Cara']);
    const [pa, pb, pc] = welcomes.map((w) => w.playerId);
    sendJson(socks[0]!, { type: 'action', payload: { kind: 'vote', target: pb } });
    const anna = await expectTracerView(socks[0]!);
    const bert = await expectTracerView(socks[1]!);
    await expectTracerView(socks[2]!);
    if (anna.view.phase !== 'vote' || bert.view.phase !== 'vote') throw new Error('expected vote phase');
    expect(anna.view.myVote).toBe(pb); // my own ballot is visible to me...
    expect(bert.view.myVote).toBeNull(); // ...and to nobody else
    expect(bert.view.hasVoted[pa!]).toBe(true); // others see only THAT I voted
    // the vote-phase view exposes exactly these fields — the raw votes map never leaves the server
    expect(Object.keys(anna.view).sort()).toEqual(['hasVoted', 'myVote', 'phase', 'prompt', 'round', 'scores', 'totalRounds']);
    sendJson(socks[1]!, { type: 'action', payload: { kind: 'vote', target: pc } });
    for (const s of socks) await expectTracerView(s);
    sendJson(socks[2]!, { type: 'action', payload: { kind: 'vote', target: pb } });
    const reveal = await expectTracerView(socks[0]!);
    for (const s of [socks[1]!, socks[2]!]) await expectTracerView(s);
    if (reveal.view.phase !== 'reveal') throw new Error(`expected reveal, got ${reveal.view.phase}`);
    expect(reveal.view.tally[pb!]).toBe(2);
    expect(reveal.view.scores[pb!]).toBe(1); // round won
    expect(reveal.deadlineAt).not.toBeNull(); // reveal is timed
  });

  it('forged-time sweeps drive deadlines through every phase to over (deadlineAt null)', async () => {
    const { code, socks, views } = await startTracer(['Anna', 'Bert']);
    const stub = env.ROOM.getByName(code);
    let deadlineAt = views[0]!.deadlineAt;
    const phases: string[] = [];
    for (let i = 0; i < 6; i++) { // vote:0→reveal:0→vote:1→reveal:1→vote:2→reveal:2→over
      expect(deadlineAt).not.toBeNull();
      const now = deadlineAt! + 1;
      await runInDurableObject(stub, (inst) => inst.sweep(now));
      const next = await expectTracerView(socks[0]!);
      await expectTracerView(socks[1]!);
      phases.push(next.view.phase === 'over' ? 'over' : `${next.view.phase}:${next.view.round}`);
      deadlineAt = next.deadlineAt;
    }
    expect(phases).toEqual(['reveal:0', 'vote:1', 'reveal:1', 'vote:2', 'reveal:2', 'over']);
    expect(deadlineAt).toBeNull(); // 'over' is untimed: the client shows the interstitial here
    expect(await eventCount(code)).toBe(6); // exactly one deadline event per transition
  });

  it('gameOver lands in roundOver: the host starts a NEW game on a cleared log', async () => {
    const { code, socks, views } = await startTracer(['Anna', 'Bert']);
    const stub = env.ROOM.getByName(code);
    let deadlineAt = views[0]!.deadlineAt;
    for (let i = 0; i < 6; i++) {
      const now = deadlineAt! + 1;
      await runInDurableObject(stub, (inst) => inst.sweep(now));
      const v = await expectTracerView(socks[0]!);
      await expectTracerView(socks[1]!);
      deadlineAt = v.deadlineAt;
    }
    expect((await runInDurableObject(stub, (_i, state) => new Store(state.storage.sql).getMeta()))!.status).toBe('roundOver');
    sendJson(socks[0]!, { type: 'startGame', gameId: 'tracer' });
    const fresh = await expectTracerView(socks[0]!);
    await expectTracerView(socks[1]!);
    if (fresh.view.phase !== 'vote') throw new Error('expected a fresh vote phase');
    expect(fresh.view.round).toBe(0);
    expect(Object.values(fresh.view.scores)).toEqual([0, 0]); // clean slate
    expect(await eventCount(code)).toBe(0); // game N's log can never replay into game N+1
  });

  it('rejected and malformed actions are silent no-ops: no broadcast, no log entry, no alarm churn (I4)', async () => {
    const { code, socks, welcomes } = await startTracer(['Anna', 'Bert']);
    const stub = env.ROOM.getByName(code);
    const alarmBefore = await runInDurableObject(stub, (_i, state) => state.storage.getAlarm());
    sendJson(socks[0]!, { type: 'action', payload: { kind: 'vote', target: welcomes[0]!.playerId } }); // self-vote: tracer rejects by SAME-reference
    await expectSilence(socks[0]!);
    expect(socks[1]!.drain()).toEqual([]);
    sendJson(socks[1]!, { type: 'action', payload: { kind: 'nuke' } }); // fails the per-game zod schema
    expect(await expectError(socks[1]!)).toBe('BAD_MESSAGE');
    expect(await eventCount(code)).toBe(0);
    expect(await runInDurableObject(stub, (_i, state) => state.storage.getAlarm())).toBe(alarmBefore);
  });
});
