#!/usr/bin/env node
/**
 * Dev helper: joins N bot players to a room on local wrangler dev and auto-votes,
 * so one phone + one human can exercise the full tracer loop.
 * Usage: node apps/mobile/scripts/dev-bots.mjs <ROOMCODE> [count=2]
 * Env: BLOOP_SERVER (default http://127.0.0.1:8787 — bots run ON the host).
 * Requires Node >= 22 (global WebSocket).
 */
const code = (process.argv[2] ?? '').toUpperCase();
const count = Number(process.argv[3] ?? 2);
if (!/^[A-Z0-9]{4}$/.test(code)) {
  console.error('usage: node apps/mobile/scripts/dev-bots.mjs <ROOMCODE> [count]');
  process.exit(2);
}
const server = (process.env.BLOOP_SERVER ?? 'http://127.0.0.1:8787').replace(/\/+$/, '');
const wsBase = server.replace(/^http/, 'ws');
const AVATARS = ['emoji:robot', 'emoji:alien', 'emoji:ghost', 'emoji:dino', 'emoji:octopus'];

function bot(i) {
  const name = `Bot ${i}`;
  const ws = new WebSocket(`${wsBase}/rooms/${code}/ws`);
  let playerId = null;
  let votedRound = -1;
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({
      type: 'hello', protocolVersion: 1,
      profile: { nickname: name, avatar: AVATARS[i % AVATARS.length] },
    }));
  });
  ws.addEventListener('message', (e) => {
    let m;
    try { m = JSON.parse(String(e.data)); } catch { return; }
    if (m.type === 'welcome') { playerId = m.playerId; console.log(`[${name}] seated as ${playerId}`); }
    if (m.type === 'error') console.log(`[${name}] error: ${m.code}`);
    if (m.type === 'view' && m.view?.phase === 'vote' && m.view.myVote === null && m.view.round !== votedRound) {
      votedRound = m.view.round;
      const targets = Object.keys(m.view.hasVoted).filter((p) => p !== playerId);
      const target = targets[Math.floor(Math.random() * targets.length)];
      setTimeout(() => {
        ws.send(JSON.stringify({ type: 'action', payload: { kind: 'vote', target } }));
        console.log(`[${name}] round ${m.view.round + 1}: voted`);
      }, 1_200 + Math.random() * 800);
    }
    if (m.type === 'view' && m.view?.phase === 'over') console.log(`[${name}] game over`, m.view.scores);
  });
  ws.addEventListener('close', (e) => console.log(`[${name}] closed (${e.code})`));
}

for (let i = 1; i <= count; i++) bot(i);
console.log(`${count} bot(s) joining room ${code} via ${server} — Ctrl+C to drop them`);
