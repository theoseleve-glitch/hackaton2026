# @bloop/game-perform-judge — integration

PERFORM_JUDGE template — "spotlight performs, room judges" (wave-2 synthesis
§3.2), four games on one reducer:

| gameId | Mode | Phases (phaseKey) | Durations | Players |
|---|---|---|---|---|
| `devine-l-action` (Devine l'Action) | `guided` — room sees the secret, performer is guided | `ready:{t}` → `perform:{t}` → `judge:{t}` → `reveal:{t}` → `over` | 6s / 75s / 15s / 7s | 3–16, 2 laps |
| `devine-l-objet` (Devine l'Objet) | `credit` — performer mimes, claims WHO found it, room validates | `ready:{t}` → `perform:{t}` → `judge:{t}` → `reveal:{t}` → `over` | 4s / 45s / 12s / 6s | 3–16, 2 laps |
| `mime-inverse` (Mime Inversé) | `puppet` — commanders see the secret, puppet obeys; tap majority | `perform:{t}` → `judge:{t}` → `reveal:{t}` → `scoreboard:{t}` → `over` | 30s / 10s / 7s / 6s | 3–16, 1 lap |
| `double-le-mouvement` (DOUBLE LE MOUVEMENT) | `rate` — mover+dubber duo, audience stars 1–5 | `ready:{t}` → `perform:{t}` → `judge:{t}` → `reveal:{t}` → `over` | 15s / 30s / 15s / 7s | 4–16, 1 lap |

The per-turn `prompt` (+ `hint`/`forbidden`) is the SECRET; `promptVisibility`
decides the redaction target ('others' hides it from the performer; 'performer'
hides it from the room). Judgment buffers (votes/stars) are hidden until the
atomic reveal; individual ballots are NEVER published (aggregate tally only).
Every snippet below is verified by `test/integration-audit.test.ts` in this
package, which replays the §2 adapter and the §3 fixtures against the real
authored packs — keep them in sync.

Dependency note: `apps/server/package.json` and `apps/mobile/package.json`
already declare `"@bloop/game-perform-judge": "workspace:*"` — no package.json
edit is needed.

## 1. Server registry — `apps/server/src/room/registry.ts`

Add the imports:

```ts
import {
  createPerformJudge,
  DEVINE_L_ACTION_CONFIG,
  DEVINE_L_OBJET_CONFIG,
  DOUBLE_LE_MOUVEMENT_CONFIG,
  MIME_INVERSE_CONFIG,
  performJudgeActionSchema,
} from '@bloop/game-perform-judge';
import {
  DEVINE_L_ACTION_PACK,
  DEVINE_L_OBJET_PACK,
  DOUBLE_LE_MOUVEMENT_PACK,
  MIME_INVERSE_PACK,
} from '../content/perform-judge-packs.js';
```

Add the entries to the `REGISTRY` map:

```ts
  ['devine-l-action', {
    module: createPerformJudge('devine-l-action', DEVINE_L_ACTION_CONFIG),
    actionSchema: performJudgeActionSchema,
    content: DEVINE_L_ACTION_PACK,
  }],
  ['devine-l-objet', {
    module: createPerformJudge('devine-l-objet', DEVINE_L_OBJET_CONFIG),
    actionSchema: performJudgeActionSchema,
    content: DEVINE_L_OBJET_PACK,
  }],
  ['mime-inverse', {
    module: createPerformJudge('mime-inverse', MIME_INVERSE_CONFIG),
    actionSchema: performJudgeActionSchema,
    content: MIME_INVERSE_PACK,
  }],
  ['double-le-mouvement', {
    module: createPerformJudge('double-le-mouvement', DOUBLE_LE_MOUVEMENT_CONFIG),
    actionSchema: performJudgeActionSchema,
    content: DOUBLE_LE_MOUVEMENT_PACK,
  }],
```

## 2. Server pack consts — `scripts/build-packs.mjs` adapter

Append this block to `scripts/build-packs.mjs`, then run
`node scripts/build-packs.mjs` from the bloop root. It emits
`apps/server/src/content/perform-judge-packs.ts` with the export names
**`DEVINE_L_ACTION_PACK`**, **`DEVINE_L_OBJET_PACK`**, **`MIME_INVERSE_PACK`**
and **`DOUBLE_LE_MOUVEMENT_PACK`** (all typed `ContentPack<PerformJudgeContent>`).

```js
// ---------------------------------------------------------------------------
// perform-judge: devine-l-action (guided) + devine-l-objet (credit) +
// mime-inverse (puppet) + double-le-mouvement (rate)
// -> apps/server/src/content/perform-judge-packs.ts
// Runtime item shape: { id, prompt:{fr,en}, category?, hint?, constraintLabel?,
// constraintRule?, forbidden? } — authoring-only fields are stripped.
// ---------------------------------------------------------------------------
const gda = load('devine-l-action');
// guided ships soft+party only (allowedIntensities per design §2.9); the
// channel card is pre-paired at authoring and rides along as the public
// constraint; forbiddenWords stay secret-side with the prompt.
const gdaItems = gda.items
  .filter((i) => (i.intensity ?? 'soft') !== 'spicy')
  .map((i) => ({
    id: i.id,
    prompt: i.action,
    constraintLabel: i.channelLabel,
    constraintRule: i.channelRule,
    ...(i.forbiddenWords !== undefined ? { forbidden: i.forbiddenWords } : {}),
  }));

const obj = load('devine-l-objet');
// credit draws easy+medium only (allowedDifficulties per design §2.15), spicy 0.
const objItems = obj.items
  .filter((i) => (i.spicy ?? 0) === 0 && (i.difficulty === 'easy' || i.difficulty === 'medium'))
  .map((i) => ({ id: i.id, prompt: i.object, category: i.category }));

const mi = load('mime-inverse');
const miItems = mi.items
  .filter((i) => (i.spicyLevel ?? 0) === 0)
  .map((i) => ({ id: i.id, prompt: i.action, category: i.category, forbidden: i.forbidden }));

const dlm = load('double-le-mouvement');
// rate ships safe intensity only; the plain-string category is authoring-only.
const dlmItems = dlm.items
  .filter((i) => (i.intensity ?? 'safe') === 'safe')
  .map((i) => ({ id: i.id, prompt: i.text, ...(i.hint !== undefined ? { hint: i.hint } : {}) }));

const pjOut = join(root, 'apps', 'server', 'src', 'content', 'perform-judge-packs.ts');
writeFileSync(pjOut, `import type { ContentPack } from '@bloop/engine';
import type { PerformJudgeContent } from '@bloop/game-perform-judge';

/**
 * GENERATED by scripts/build-packs.mjs from content/packs/<gameId>.json —
 * do not edit by hand. \`prompt\` (+ hint/forbidden) is the per-turn SECRET
 * (mode-dependent redaction target); undrawn deck items never enter views.
 * Same R2 seam as tracer-pack.
 */
export const DEVINE_L_ACTION_PACK: ContentPack<PerformJudgeContent> = {
  id: '${gda.gameId}-core',
  version: ${gda.version ?? 1},
  data: { items: ${JSON.stringify(gdaItems, null, 2)} },
};

export const DEVINE_L_OBJET_PACK: ContentPack<PerformJudgeContent> = {
  id: '${obj.gameId}-core',
  version: ${obj.version ?? 1},
  data: { items: ${JSON.stringify(objItems, null, 2)} },
};

export const MIME_INVERSE_PACK: ContentPack<PerformJudgeContent> = {
  id: '${mi.gameId}-core',
  version: ${mi.version ?? 1},
  data: { items: ${JSON.stringify(miItems, null, 2)} },
};

export const DOUBLE_LE_MOUVEMENT_PACK: ContentPack<PerformJudgeContent> = {
  id: '${dlm.gameId}-core',
  version: ${dlm.version ?? 1},
  data: { items: ${JSON.stringify(dlmItems, null, 2)} },
};
`);
console.log(`perform-judge-packs.ts regenerated — devine-l-action: ${gdaItems.length}, devine-l-objet: ${objItems.length}, mime-inverse: ${miItems.length}, double-le-mouvement: ${dlmItems.length} items`);
```

## 3. Audit fixtures — `apps/server/test-node/redaction-audit.test.ts`

Add the event helpers next to `vote` / `ballot`:

```ts
const pjAct = (playerId: string, action: unknown, at: number): GameEvent<unknown> =>
  ({ type: 'action', playerId, action, at });

const pjVote = (playerId: string, vote: 'yes' | 'no', at: number): GameEvent<unknown> =>
  pjAct(playerId, { kind: 'vote', vote }, at);

/** perform-judge: undrawn deck prompts are value secrets for EVERY viewer. */
const pjDeckSecrets = (state: unknown): Array<{ value: string; owner?: PlayerId }> => {
  const s = state as { deck: Array<{ prompt: { fr: string; en: string } }>; cursor: number };
  const next = s.deck[s.cursor];
  return next === undefined ? [] : [{ value: next.prompt.fr }, { value: next.prompt.en }];
};
```

Add the entries to the `AUDITS` map. These exact fixtures (same seed, events
and secrets) are pinned green against the real packs by
`packages/games/perform-judge/test/integration-audit.test.ts`. Seed
`'audit-seed'` rotations: `['p1','p2','p3']` → `[p3,p2,p1]` (performer **p3**);
`['p1','p2','p3','p4']` → `[p2,p4,p3,p1]` (performer **p2**, rate dubber **p4**).

```ts
  ['devine-l-action', {
    players: ['p1', 'p2', 'p3'],
    seed: 'audit-seed',
    // mid-verdict turn 0: performer p3 claimed done, ONE hidden helper ballot in
    // flight (p2 still expected) — phase NOT advanced
    events: [{ type: 'deadline', at: 1_000 }, pjAct('p3', { kind: 'claimDone' }, 2_000), pjVote('p1', 'yes', 3_000)],
    eventsAlt: [{ type: 'deadline', at: 1_000 }, pjAct('p3', { kind: 'claimDone' }, 2_000), pjVote('p1', 'no', 3_000)],
    actors: ['p1'],
    // the CURRENT action is legitimately on every helper phone (others-visibility) —
    // performer-redaction is covered by the module's own leakedSecrets tests;
    // here the value secrets are the UNDRAWN deck prompts (hidden from everyone)
    secrets: pjDeckSecrets,
  }],
  ['devine-l-objet', {
    players: ['p1', 'p2', 'p3', 'p4'],
    seed: 'audit-seed',
    // mid-validate turn 0: performer p2 credited p4; ONE hidden validator ballot
    // in flight (p3 still expected) — the object is public at validate by design
    events: [{ type: 'deadline', at: 1_000 }, pjAct('p2', { kind: 'claimFound', guesser: 'p4' }, 2_000), pjVote('p1', 'yes', 3_000)],
    eventsAlt: [{ type: 'deadline', at: 1_000 }, pjAct('p2', { kind: 'claimFound', guesser: 'p4' }, 2_000), pjVote('p1', 'no', 3_000)],
    actors: ['p1'],
    secrets: pjDeckSecrets,
  }],
  ['mime-inverse', {
    players: ['p1', 'p2', 'p3'],
    seed: 'audit-seed',
    // mid-verdict turn 0 (no ready phase): perform timed out with zero taps, ONE
    // hidden commander ballot in flight (p2 still expected)
    events: [{ type: 'deadline', at: 1_000 }, pjVote('p1', 'yes', 2_000)],
    eventsAlt: [{ type: 'deadline', at: 1_000 }, pjVote('p1', 'no', 2_000)],
    actors: ['p1'],
    secrets: pjDeckSecrets,
  }],
  ['double-le-mouvement', {
    players: ['p1', 'p2', 'p3', 'p4'],
    seed: 'audit-seed',
    // mid-rate turn 0: the mover's SECRET PICK differs across scripts AND one
    // hidden star ballot is in flight (p3 still expected) — no view may carry
    // prompt data or star values during rate
    events: [pjAct('p2', { kind: 'pick', index: 0 }, 1_000), { type: 'deadline', at: 2_000 }, pjAct('p1', { kind: 'rate', stars: 2 }, 3_000)],
    eventsAlt: [pjAct('p2', { kind: 'pick', index: 1 }, 1_000), { type: 'deadline', at: 2_000 }, pjAct('p1', { kind: 'rate', stars: 5 }, 3_000)],
    actors: ['p2', 'p1'],
    // BOTH offered prompts (+ hints) are secrets during rate; so is the next undrawn
    secrets: (state) => {
      const s = state as { offer: Array<{ prompt: { fr: string; en: string }; hint?: { fr: string; en: string } }> };
      const out: Array<{ value: string; owner?: PlayerId }> = [];
      for (const o of s.offer) {
        out.push({ value: o.prompt.fr }, { value: o.prompt.en });
        if (o.hint !== undefined) out.push({ value: o.hint.fr }, { value: o.hint.en });
      }
      return [...out, ...pjDeckSecrets(state)];
    },
  }],
```

Deadline-walk budget from the fixture states (all ≤ 25, asserted by this
package's integration-audit test): `devine-l-action` 17 steps (judge + reveal +
5 remaining turns × 3), `devine-l-objet` 23 (judge + reveal + 7 × 3),
`mime-inverse` 9 (incl. final scoreboard), `double-le-mouvement` 14 (3 × 4 + 2).

## 4. Lobby — `apps/mobile/app/room/[code]/lobby.tsx`

Add to the `PLAYABLE` map (design `players.min`: 3 / 3 / 3 / 4):

```ts
  ['devine-l-action', { label: "Devine l'Action", minPlayers: 3 }],
  ['devine-l-objet', { label: "Devine l'Objet", minPlayers: 3 }],
  ['mime-inverse', { label: 'Mime Inversé', minPlayers: 3 }],
  ['double-le-mouvement', { label: 'Double le Mouvement', minPlayers: 4 }],
```

And extend the live-game redirect chain so a started PERFORM_JUDGE match moves
the lobby to the play container:

```ts
import { asPerformJudgeView } from '../../../src/games/perform-judge-view';
```

```ts
  const livePhase = asTracerView(state.view)?.phase
    ?? asOptionVoteView(state.view)?.phase
    ?? asInputGuessView(state.view)?.phase
    ?? asSecretRoleView(state.view)?.phase
    ?? asPerformJudgeView(state.view)?.phase
    ?? null;
```

## 5. Play routing — `apps/mobile/app/room/[code]/play.tsx`

```tsx
import { PerformJudgePlay } from '../../../src/components/PerformJudgePlay';
import { isPerformJudgeGame } from '../../../src/games/perform-judge-view';
```

```tsx
  if (isPerformJudgeGame(state.viewGameId)) return <PerformJudgePlay code={code ?? ''} />;
```

(`isPerformJudgeGame` matches the viewGameIds `devine-l-action`,
`devine-l-objet`, `mime-inverse` and `double-le-mouvement`; place the line
beside the existing `isOptionVoteGame` branch, before the tracer fallback.)

## 6. Catalog badges — `apps/mobile/src/games/catalog.ts`

Flip `badge: 'SOON'` → `badge: 'PLAY'` on the four existing entries:

```ts
  // id: 'devine-l-action'      → badge: 'PLAY',
  // id: 'devine-l-objet'       → badge: 'PLAY',
  // id: 'mime-inverse'         → badge: 'PLAY',
  // id: 'double-le-mouvement'  → badge: 'PLAY',
```
