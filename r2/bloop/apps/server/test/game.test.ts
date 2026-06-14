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

  it('votes flow with per-player redaction; the last ballot auto-advances to reveal (suspense) without the alarm; the score climbs at the verdict beat', async () => {
    const { code, socks, welcomes } = await startTracer(['Anna', 'Bert', 'Cara']);
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
    // two-beat reveal: early-resolve lands on the SUSPENSE beat — tally is shown but
    // the score is DEFERRED (frozen) so the client can animate the climb at the slam.
    expect(reveal.view.revealStep).toBe('suspense');
    expect(reveal.view.tally[pb!]).toBe(2);
    expect(reveal.view.designated).toEqual([pb]); // the room pointed at Bert
    expect(reveal.view.scores[pb!]).toBe(0); // NOT yet — score climbs at verdict
    expect(reveal.deadlineAt).not.toBeNull(); // the suspense beat is timed

    // fire the suspense deadline -> the verdict beat lands the +1.
    const stub = env.ROOM.getByName(code);
    await runInDurableObject(stub, (inst) => inst.sweep(reveal.deadlineAt! + 1));
    const verdict = await expectTracerView(socks[0]!);
    for (const s of [socks[1]!, socks[2]!]) await expectTracerView(s);
    if (verdict.view.phase !== 'reveal') throw new Error('expected verdict reveal');
    expect(verdict.view.revealStep).toBe('verdict');
    expect(verdict.view.tally[pb!]).toBe(2);
    expect(verdict.view.delta[pb!]).toBe(1); // the honest climb the client animates
    expect(verdict.view.scores[pb!]).toBe(1); // round won — the score climbed HERE
    expect(verdict.deadlineAt).not.toBeNull();
  });

  it('forged-time sweeps drive deadlines through every phase (two-beat reveal) to over (deadlineAt null)', async () => {
    const { code, socks, views } = await startTracer(['Anna', 'Bert']);
    const stub = env.ROOM.getByName(code);
    let deadlineAt = views[0]!.deadlineAt;
    const phases: string[] = [];
    // each reveal is now a suspense beat then a verdict beat: 9 transitions to 'over'.
    for (let i = 0; i < 9; i++) {
      expect(deadlineAt).not.toBeNull();
      const now = deadlineAt! + 1;
      await runInDurableObject(stub, (inst) => inst.sweep(now));
      const next = await expectTracerView(socks[0]!);
      await expectTracerView(socks[1]!);
      const v = next.view;
      phases.push(
        v.phase === 'over' ? 'over'
          : v.phase === 'reveal' ? `reveal:${v.round}:${v.revealStep}`
            : `${v.phase}:${v.round}`,
      );
      deadlineAt = next.deadlineAt;
    }
    expect(phases).toEqual([
      'reveal:0:suspense', 'reveal:0:verdict',
      'vote:1', 'reveal:1:suspense', 'reveal:1:verdict',
      'vote:2', 'reveal:2:suspense', 'reveal:2:verdict',
      'over',
    ]);
    expect(deadlineAt).toBeNull(); // 'over' is untimed: the client shows the interstitial here
    expect(await eventCount(code)).toBe(9); // exactly one deadline event per transition
  });

  it('gameOver lands in roundOver: the host starts a NEW game on a cleared log', async () => {
    const { code, socks, views } = await startTracer(['Anna', 'Bert']);
    const stub = env.ROOM.getByName(code);
    let deadlineAt = views[0]!.deadlineAt;
    // two-beat reveal: 9 deadline transitions (vote + suspense + verdict, ×3) to reach 'over'.
    for (let i = 0; i < 9; i++) {
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
