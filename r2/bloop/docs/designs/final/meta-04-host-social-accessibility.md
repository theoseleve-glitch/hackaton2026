# Meta-04 — Host Controls, Social/Virality & Accessibility (FINAL, DECIDED)

| Field | Value |
|---|---|
| **Domain** | `host-social-a11y` — in-lobby host controls + the `hostTunable` param allowlist, the social/virality growth loop, and platform accessibility |
| **Status** | **FINAL / DECIDED.** Finished spec, not a survey. No TBDs in the body; genuine *product* calls (with my recommendation) are isolated at the bottom. |
| **Owner** | Lead game designer (meta/shell) |
| **Date** | 2026-06-13 |
| **Grounds in** | Brand Book v1.0 (`docs/da/brand/bloop-brand-book-v1.pdf`); `2026-06-10-mobile-design-system.md` (§3 components, §4 screens, §5 avatars, §6 a11y); `2026-06-10-server-shell-design.md` (§3.5 host flag/migration, §2.1 room codes, §4 loop, §9 open Qs); `2026-06-10-template-architecture.md` (§2 `gameConfigSchema`, §2.4 per-template `params`, §4.4/§7.4 the `hostTunable` open call); `2026-06-11-wave2-17-games-design.md` (§3.4 per-template param bundles, the 18-game catalog); `content/inspiration-videos.json` (the "inspired by <creator>" link-out data); `2026-06-12-content-voice-guide.md` (§0/§1.8 deadpan-ironic register); `final/meta-01-session-and-progression.md` (the Night loop, Oracle/superlatives, host-vs-player split §9); `final/meta-02-monetization.md` (interstitial/rewarded); `final/meta-03-spicy-and-age-gate.md` (age gate §4, report flow §7.1, a11y §8); `packages/protocol/src/messages.ts` (wire shapes); the 18 shipped modules (`packages/games/*`). |
| **Platform invariants honored** | Cloudflare DO (one DO per room) + Hono + KV config + R2 packs; pure-TS `GameModule` (server-authoritative, per-viewer redaction, seeded RNG, no wall-clock/ambient-RNG, no runtime AI); RN + Expo client, EAS OTA; **anonymous-forever** (no accounts, no server profiles, room SQLite TTL-wiped); same-room first, remote later with zero realtime-layer change; ads-only; the interstitial fires **client-side** off the `phaseKey → over`/`scoreboard:*` transition; cross-game XP is **placement-based**. |

This doc owns **three shell-side surfaces** and changes **no** `GameModule`, **no** engine contract, **no** reducer. Host controls live in the lobby/RoomDO meta-layer; social surfaces are client + one small front-door read; accessibility is a cross-cutting client + token-lint discipline. It closes the `hostTunable` open call (template-arch §4.4/§7.4) decisively.

---

## Decisions (the short list)

1. **The `hostTunable` allowlist is a FOURTH field on `gameConfigSchema`, owned by the catalog, defaulting to `[]` (fully fixed).** A param is host-adjustable at the lobby **only if** the config lists it in `hostTunable[]` with an explicit `{ key, kind, safeRange|choices, default }` descriptor. Everything else is catalog-fixed. The host can never widen a param beyond the descriptor's safe range, and the server re-validates the host's chosen value at `startGame` against the descriptor (defense-in-depth) — a tampered client cannot push an out-of-range param. (§2)
2. **Exactly THREE host-tunable *axes* ship at launch, consolidated from the 18 games' param lists into one cross-game vocabulary:** **(A) `roundCount`** (how long the match runs), **(B) `spicyLevel`/intensity** (content tier within the tile's legal ceiling — never crosses the age gate), and **(C) `debateLength`** (the debate/talk beat duration, where a game has one). A fourth, **(D) `pace`** (a single "chill / normal / blitz" multiplier over the game's answer/guess timers), ships as an *optional* per-game opt-in. No other param is host-exposed at launch. (§2.3, §2.4)
3. **Host tunables are presented as 2–4 chip/stepper rows in a collapsible "Game settings" card in the lobby, NOT a settings screen.** Each row is a `CategoryChip` group (enum) or a `Stepper` (number), 44pt targets, with a plain-language label + the deadpan default pre-selected. The card collapses to a one-line summary ("7 rounds · spicy · long debates") so a host who wants zero friction just taps Start. (§2.5)
4. **The in-lobby game picker is a category-filtered tile grid rendered generically from the KV catalog** (`GameConfig[]`), grouped into **6 fixed categories** (Party Starters · Vote & Debate · Guess & Perform · Deception · Spicy 🌶 · Trending). The host picks a tile → it becomes the room's pending game; non-hosts see the pick land live. Spicy tiles are hidden on un-attested devices (meta-03 §4.5). (§3)
5. **Kick ships as a host-only, capability-gated protocol message (`kick`), added as an additive `clientMessageSchema` variant.** It is confirm-modal-gated on the client, server-authoritative (RoomDO checks `roster[host].isHost`), removes the target's seat, closes their socket with a distinct code, and broadcasts the updated lobby. A kicked device sees a deadpan "the host showed you the door" screen and cannot rejoin **the same room for its TTL life** (kick-list by `reconnectToken` hash). It is **lobby + between-matches only** — never mid-match (roster is frozen at `init`). (§4)
6. **Room settings are a tiny, host-only set: room lock (no new joiners), locale, and the per-game settings card (§3) — that's it.** No password, no max-player override below the game floor, no "private/public" toggle (all rooms are code-gated and ephemeral already). (§5)
7. **The room-code + QR share is the primary invite and the top of the growth funnel.** One `SecondaryButton` → native share sheet of the deep link `bloop://join/ABCD` (+ a web fallback `https://bloop.app/j/ABCD` for recipients without the app, which routes to the store then deep-links post-install). The lobby hero is the `RoomCodeDisplay` (4 kerned tiles, tap-to-copy) + `QRPanel`. (§6)
8. **The "inspired by <creator>" card-background link-out is a first-class discovery hook, sourced from `content/inspiration-videos.json`, shown as a small attributed credit chip on each game tile and on the results card — NEVER as an embedded/re-hosted clip, only a credited deep-link out.** It is rights-compliant by construction (thumbnail + credit + link-out only; respects each entry's `rightsNote`). (§7)
9. **The shareable end-of-game result card ("group superlatives") is the organic growth engine and ships at launch as an on-screen card with a one-tap "Share" that renders a client-side image.** It carries device-local nicknames + the Night's superlatives + a subtle Bloop wordmark and a join-nudge ("play at bloop.app") — **never** a `playerId`, room code, or any server reference. Captured 100% client-side; the server never produces or stores it. (§8)
10. **Accessibility is a hard launch gate, encoded as decisions + a CI token-lint, not aspiration.** WCAG AA contrast on the Ink/Cream/Coral palette via a fixed `onColor()` safe-pairing table + a lint that fails any `<Text>` on a brand fill not routed through it; 44pt minimum touch targets everywhere; reduced-motion collapses springs to a 120ms fade and suppresses confetti; dynamic-type respected with clamps on tight chrome (code tiles, timer); **colour-independent state everywhere** (vote sides, host, "you", timer urgency, truth/dare all carry a label/icon/shape, never colour alone); the spicy age-gate and long-press report (meta-03) are the two brand-mandated a11y affordances. (§9, §10)

---

## 1. What this domain is and isn't

| In scope | Out of scope (owned elsewhere) |
|---|---|
| The in-lobby **game picker** (categories, tiles, generic render from catalog) | The catalog *content* / `game_config` authoring (template-arch, content-ops) |
| The **`hostTunable` allowlist** field + descriptor + the 3–4 cross-game axes + lobby UI | Per-game reducer params themselves (each game's design owns its `Config`) |
| **Kick** protocol + UX + kick-list | Host *migration* (server-shell §3.5 — we restate, don't redesign) |
| **Room settings** (lock, locale, settings card) | TTL/anonymity/roster mechanics (server-shell §5) |
| **Room-code share + invite** (deep link, QR, web fallback) | Room-code generation/collision (server-shell §2.1) |
| **"Inspired by <creator>"** discovery link-outs | The `inspiration-videos.json` data itself (already shipped) |
| **Shareable result cards** (group superlatives, client image) | What the superlatives *are* (meta-01 §8 — we render them) |
| **Accessibility** across all the above + platform-wide a11y gate | Spicy age-gate / report internals (meta-03 — we honor + reference) |

Nothing here touches the purity firewall. Host tunables resolve to a merged `Config` the shell passes into `init` (template-arch §1.3); kick is roster bookkeeping; social and a11y are client-side. Zero engine/contract change; **one additive protocol variant** (`kick`) and **one additive catalog field** (`hostTunable`).

---

## 2. The `hostTunable` allowlist (the decisive ruling)

Template-arch §4.4/§7.4 left it open: *"Are catalog `params` 100% fixed, or may the host tweak a documented subset at lobby?"* with default "fixed + the existing per-game toggles only." **This domain decides: a host-tunable subset exists, it is opt-in per config via an allowlist, and it is bounded by safe ranges the host cannot exceed.** This is strictly safer than the template-arch default (it's a superset gated behind explicit per-config opt-in) and it delivers the brand-book promise of host control without re-opening any param to abuse.

### 2.1 The field (additive to `gameConfigSchema`)

```ts
// packages/protocol/src/catalog.ts  — ADD to gameConfigSchema (template-arch §2.1)

/** A single host-adjustable param, declared per-config. Default for a config = []. */
export const hostTunableDescriptorSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('number'),
    key: z.string().min(1).max(40),          // a key in the template's params (e.g. 'totalRounds')
    label: localizedSchema,                   // plain-language lobby label
    min: z.number(), max: z.number(), step: z.number().positive(),
    default: z.number(),                      // pre-selected; MUST equal the config's params value
  }).refine(d => d.min <= d.default && d.default <= d.max, 'default out of [min,max]'),
  z.object({
    kind: z.literal('enum'),
    key: z.string().min(1).max(40),
    label: localizedSchema,
    choices: z.array(z.object({ value: z.string(), label: localizedSchema })).min(2).max(4),
    default: z.string(),                      // MUST be one of choices[].value
  }),
  z.object({
    kind: z.literal('bool'),
    key: z.string().min(1).max(40),
    label: localizedSchema,
    default: z.boolean(),
  }),
]);

// in gameConfigSchema:
hostTunable: z.array(hostTunableDescriptorSchema).max(4).default([]),
```

Refinement added to `gameConfigSchema.superRefine`:
- **(d) every `hostTunable[i].key` must be a real key in `templateParamsSchema(template)`** — you can't expose a param the template doesn't have.
- **(e) the descriptor's `default` must equal the config's `params[key]`** (or the template default if unset) — the lobby default and the catalog default never disagree.
- **(f) a `number.min/max` for `key` must sit INSIDE the template param schema's own min/max** (the safe range can only ever be *narrower* than the engine's hard bounds, never wider). E.g. `totalRounds` is `1..10` in `templateParamsSchema('VOTE')`; a config can expose `5..9` but never `1..20`.
- **(g) any descriptor whose effect could escalate content tier (the intensity axis) is clamped to the tile's legal ceiling** — a `classic`/`minAge:0` tile can expose `intensity: soft|party` but **never** a choice that reaches `spicy`; `spicy` choices are only legal on a `tone:'spicy'`/`minAge:18` sibling (meta-03 §1/§2). The age gate is upstream of and independent from this control. (§2.6)

### 2.2 Server-side enforcement (defense-in-depth)

`startGame` carries `{ configId, hostParams?: Record<string, number|string|boolean> }` (additive to the protocol's `startGame`). The RoomDO:
1. Resolves the `GameConfig` from KV and confirms the requester `isHost` (else `NOT_HOST`).
2. For each `key` in `hostParams`: assert `key ∈ config.hostTunable.map(d => d.key)` (else drop the key — never error the whole start), then assert the value is within the descriptor (`min..max` snapped to `step` for numbers; `∈ choices` for enums; boolean for bools). Out-of-range → **clamp to the descriptor's nearest legal value**, never trust the client value.
3. Merge the validated `hostParams` over `config.params` over the module `DEFAULT_CONFIG`, then pin the **merged Config** into `RoomMeta` (so it's replay-stable, exactly like the seed/pack — server-shell §4.5). The reducer only ever sees a Config that already passed both the catalog schema and the host-range clamp.

This means: the host *requests*, the server *adjudicates*, the reducer *trusts*. Identical discipline to the spicy "requested ≠ played" rule (meta-03 §1.3).

### 2.3 The cross-game consolidation: 18 games → 3 axes (+1 optional)

I scanned the per-game param/timer lists in wave2 §3.x and the final game configs. The raw per-game knobs are: `totalRounds`, `voteMs`, `revealMs`, `debateMs`/`debateSkipThreshold`, `allowedIntensities`/`spicyLevel`, `guessMs`, `talkMs`/`sayMs`/`targetReadMs`/`answerMs`, `passesPerPlayer`, `roundsPerPlayer`, `discussMs`, `liveMs`/`tribunalMs`/`briefingMs`, `dawnMs`/`voteMs`/`lynchRevealMs`, `hintTiers`, `cardsPerRound`, etc. **Most of these must stay catalog-fixed** — they're balance/pacing internals a party host shouldn't fiddle and that the deadpan "hand a stranger the phone" north star says to keep invisible. Consolidating to what a host *actually wants to control at a party*:

| Axis | What it controls | Maps to per-game params | Why host-exposed |
|---|---|---|---|
| **A. `roundCount`** | match length / "how long is this game?" | `totalRounds` (VOTE, RANKING, INPUT_GUESS, SPOTLIGHT, TRUTH_DARE, LAST_STANDING, PERFORM_JUDGE), `roundsPerPlayer` (HOT_SEAT) | The #1 host need: "short game" vs "let's go deep." Universal, safe, low-stakes. |
| **B. `intensity`** | content tier *within the tile's legal ceiling* | `allowedIntensities`/`spicyLevel` (TRUTH_DARE, PERFORM_JUDGE `guided`, VOTE option packs) | The brand book explicitly names a "spicy toggle." Bounded by §2.6 — never crosses the age gate. |
| **C. `debateLength`** | the debate/talk beat duration where a game has one | `debateMs` (VOTE@2: tu-preferes, gauche-ou-droite, pires-potes), `discussMs` (SECRET_ROLE), `talkMs`/`sayMs` (SPOTLIGHT/PERFORM where a verbal beat exists) | The brand book explicitly names "debate length." Hosts want "quick" vs "let them argue." `0` = skip the beat. |
| **D. `pace` (OPTIONAL, per-game opt-in)** | a global multiplier over the game's *answer/guess* timers | a single multiplier (`0.75 chill / 1.0 normal / 1.4 blitz`) applied by the shell to the game's `phaseDurationMs`-driving timer params it declares pace-eligible | Some games (quizz, jeu-de-la-note, cinquante-cinquante) are all about timer feel. Opt-in so a game that must not be sped (loup-garou's atmosphere) simply never lists it. |

**Decided: A, B, C ship at launch; D is opt-in and ships per-game when a game design lists it.** No other axis is host-exposed at v1. This is the *entire* host-tunable surface — three universal axes plus one opt-in, never the raw timer soup.

### 2.4 Per-game launch allowlists (concrete, the 18)

The catalog author sets `hostTunable[]` per config. Recommended launch allowlists (each entry is a descriptor; ranges are *narrower* than the engine bounds):

| Game (config) | Template | `hostTunable[]` axes (launch) | Notes |
|---|---|---|---|
| `pires-potes` (+ soft) | VOTE | A `roundCount` (5–9, def 7) | flagship is 18+; intensity is the tile, not a knob |
| `tu-preferes` | VOTE@2 | A `roundCount` (5–10, def 8), C `debateLength` (off/short/long → `debateMs` 0/20k/40k) | the debate beat is the whole social payoff |
| `gauche-ou-droite` | VOTE@2 | A `roundCount` (5–9, def 7), C `debateLength` (short/long) | debate is the point of the game |
| `quizz-culture-ge` | INPUT_GUESS | A `roundCount` (6–10, def 8), **D `pace`** (chill/normal/blitz) | timer feel matters → opt into pace |
| `cinquante-cinquante` | INPUT_GUESS | A `roundCount` (5–9, def 7), **D `pace`** | crowd-target guessing benefits from pace |
| `truth-or-dare-2` (FUN) | TRUTH_DARE | A `roundCount` (2–5, def 3), B `intensity` (soft/party), C `debateLength` (verdict beat) | intensity capped at `party` (13+ tile) |
| `truth-or-dare-lover` | TRUTH_DARE | A `roundCount` (3–6, def 4), B `intensity` (party/spicy) | 18+ sibling; `spicy` legal only here |
| `truth-or-drink` | TRUTH_DARE@2 | A `roundCount` (3–6, def 4) | intensity is fixed (alcohol sub-floor, meta-03 §6.3); no spicy *toggle* |
| `devine-l-action` (+ spicy) | PERFORM_JUDGE | A `roundCount` (2–4, def 3), B `intensity` (soft/party on safe; party/spicy on 18+) | physical dares → intensity bounded per sibling |
| `mime-inverse` | PERFORM_JUDGE | A `roundCount` (2–4, def 3) | — |
| `devine-l-objet` | PERFORM_JUDGE | A `roundCount` (2–4, def 3) | spicy-0-forever (meta-03) → no intensity |
| `double-le-mouvement` | PERFORM_JUDGE | A `roundCount` (2–4, def 3) | — |
| `jeu-de-la-note` | SPOTLIGHT_GUESS | A `roundCount` (6–10, def 8), **D `pace`** | dial-guessing timer feel |
| `devine-la-question` | SPOTLIGHT_GUESS | A `roundCount` (4–8, def 6) | — |
| `jeu-du-theme` | LAST_STANDING | A `roundCount` (2–4, def 3) | survival; pace is intrinsic (decaying clock) |
| `trouvez-la-regle` | RULE_HUNT | (none at launch) `hostTunable: []` | banked-clock determinism is delicate; keep fixed |
| `double-jeu` | SECRET_ROLE@2 | C `debateLength` (`discussMs` short/long) | accusation paranoia wants a debate dial |
| `the-impostor` | SECRET_ROLE | C `debateLength` (`discussMs` short/long) | — |
| `loup-garou` | NIGHT_DAY | C `debateLength` (`debateMs` short/long) | **no pace, no intensity** — atmosphere is editorial law (voice-guide §5.17); only the day-debate length |
| `rank-friends` / `guess-my-rank` | RANKING | A `roundCount` (3–6, def 4) | — |
| `hot-seat` | HOT_SEAT | A `roundCount` via `roundsPerPlayer` (1–2, def 1) | — |

(Wave-1 designed games included for completeness.) Note **`trouvez-la-regle` ships with `hostTunable: []`** — fixed is a legitimate, encouraged default; the field's whole point is that fixed is free and tuning is opt-in.

### 2.5 Lobby UI for host tunables (the "Game settings" card)

- A **collapsible card** in the lobby, below the picked game tile, **host-only** (non-hosts don't render it; they see the resolved summary once Start is pressed and the game begins).
- **Collapsed state (default):** one line — the deadpan summary of current values: *"7 rounds · spicy · long debates"*. A host who wants zero friction never expands it. Tap to expand.
- **Expanded state:** one row per `hostTunable` descriptor, max 4 rows:
  - **`enum`** → a `CategoryChip` single-select group (e.g. debate `off · short · long`), pre-selected on `default`, `pop` on select, 44pt chips, **labels carry text** (never colour-only — a11y §10).
  - **`number`** → a `Stepper` (− / value / +), snapping to `step`, clamped to `[min,max]`, value in `displayL`-ish numerals.
  - **`bool`** → a labelled `Switch` with on/off text, not just the track colour.
- Changing a value updates the **collapsed summary live** and is sent in `startGame.hostParams` on Start. (We do **not** broadcast tuning changes pre-Start — it's host-local until the match begins; this avoids a chatty lobby and a "host indecision" spectacle.)
- **Reset to defaults** link (deadpan: "back to normal"). 
- Copy register is voice-guide deadpan/lowercase (§1.8): labels are plain ("how many rounds", "debate time", "how spicy"), never "Customize your experience!".

### 2.6 The intensity axis vs the age gate (the load-bearing safety rule)

The `intensity`/`spicyLevel` host toggle is **content tier *within the tile's already-established legal ceiling*** — it is **not** an age bypass and it is **not** the spicy unlock. Restated from meta-03 so there's no daylight:
- A `classic` tile (`minAge:0`/`13`) may expose `intensity: soft|party`. It can **never** offer a `spicy` choice (schema refinement (g)).
- A `spicy` tile (`tone:'spicy'`, `minAge:18`) is only *surfaced* on an age-attested device (meta-03 §4.5) and only *unlocked* via rewarded-video or Night Pass (meta-02 §6/§7). The host's `intensity: party|spicy` toggle on that tile only moves between the tiers the device is **already** age-eligible and entitled to.
- The brand-book "spicy toggle" is therefore satisfied as: a within-ceiling intensity chip on tiered games, with the legal/maturity gate sitting entirely upstream and untouched. Paying or tuning never makes a minor an adult (meta-03 §4.3, meta-02 §7.1).

---

## 3. The in-lobby game picker

### 3.1 Source & generic render

The picker is the lobby's host-only surface that lists startable games. It renders **generically** from the KV catalog (`GameConfig[]` served at `/config`, template-arch §4.1) — no per-game UI. Each tile is a `GameTile` (mobile §3) built from `{ name, description, theme.{color,icon,badge}, effectiveMinPlayers..maxPlayers, tone, inspiredBy }`. Filtering is client-side: `enabled && rolloutPct-bucket && minAge ≤ device.attestedMinAge && device-locale ∈ locales` (meta-03 §4.5 / template-arch §4.2). An unknown `template` (older app, not bundled) → the tile is skipped, never a crash (template-arch §4.1).

### 3.2 The 6 fixed categories (decided)

Tiles group into **6 stable category buckets**. Category is a new optional `category` field on `GameConfig` (additive, defaults by template if unset); the picker renders horizontal rails or filter chips:

| Category | Contains (examples) | Default-derived from |
|---|---|---|
| **Party Starters** | tu-preferes, pires-potes-soft, quizz | high-`sort` classic VOTE/INPUT tiles |
| **Vote & Debate** | tu-preferes, gauche-ou-droite, cinquante-cinquante | VOTE / option-ballot |
| **Guess & Perform** | mime-inverse, devine-l-action/objet, double-le-mouvement, jeu-de-la-note, devine-la-question | PERFORM_JUDGE / SPOTLIGHT / INPUT |
| **Deception** | the-impostor, double-jeu, loup-garou, trouvez-la-regle | SECRET_ROLE / NIGHT_DAY / RULE_HUNT |
| **Spicy 🌶** | pires-potes, truth-or-dare-lover, truth-or-drink, *-spicy siblings | `tone:'spicy'` (hidden if not age-attested) |
| **Trending** | whatever the content-op flags `badge:'TRENDING'` | `badge ∈ {TRENDING, HOT, NEW}` |

A game can appear in more than one bucket (tu-preferes in both Party Starters and Vote & Debate). **Trending** is the merchandising lever (matches the brand growth motive): the content-op sets `badge:'TRENDING'` + high `sort` (template-arch §4.2) and the tile floats to a hero rail — the same hook that lets a viral concept (an `inspiration-videos.json` source going viral again) get surfaced fast. **Decided:** category is presentation-only metadata; no engine/registry impact.

### 3.3 Picker interaction

- Host taps a tile → it becomes the room's **pending** game (sent as a lightweight `pickGame {configId}` host message — additive variant, the Plan-2 "pick without starting" the protocol comment already anticipated). The server validates `isHost` + catalog membership and re-broadcasts `lobby` with `gameId` set so **non-hosts see the pick land live** (with the tile + an "inspired by" credit chip, §7). This is the meta-01 §9 "see the pick land" behaviour, now wired.
- The picked tile expands to show the **Game settings card** (§2.5) and the big `PrimaryButton "Start"` (host-only). Start is **gated** on roster size ∈ `[effectiveMinPlayers, maxPlayers]` (template-arch §2.6) — below floor it's disabled with a deadpan hint ("need 1 more human").
- Non-hosts see the pending tile + "waiting for host to start…" + a `float`ing mascot (mobile §4.7) — never a blank wait (meta-01 §4.1).

---

## 4. Kick (host moderation)

Server-shell §3.5 and the protocol comment both mark kick a Plan-2 deferral ("adding union variants is additive, not breaking"). This domain ships it as a finished, capability-gated feature.

### 4.1 Protocol (additive)

```ts
// ADD to clientMessageSchema (packages/protocol/src/messages.ts)
z.object({ type: z.literal('kick'), targetPlayerId: z.string().min(1).max(64) }),
z.object({ type: z.literal('pickGame'), configId: z.string().min(3).max(64) }), // §3.3
// startGame extended:
z.object({
  type: z.literal('startGame'),
  configId: z.string().min(3).max(64),                       // was gameId; template-arch §1.3/§4.4
  hostParams: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(), // §2.2
}),
```

`errorCodeSchema` gains `'NOT_ALLOWED'` (kick of self / non-existent target / mid-match attempt) — additive enum value.

### 4.2 Server behaviour (RoomDO)

`onKick(ws, msg)`:
1. **Authority:** `roster[att.playerId].isHost` else `err('NOT_HOST')`. Self-kick (`target === att.playerId`) → `err('NOT_ALLOWED')`.
2. **State gate:** only when `status ∈ {lobby, roundOver}` (between matches). Mid-`playing` → `err('NOT_ALLOWED')` (roster is frozen at `init`, engine invariant; you cannot kick a frozen player mid-match — wait for the boundary). This keeps the engine's roster-fixed-at-init rule intact.
3. **Effect:** remove the target from `roster`; add `hash(target.reconnectToken)` to a room-scoped **`kick_list`** SQLite set; close the target's socket with code **`4403`** ("kicked"); broadcast updated `lobby`. The freed seat re-opens for a new joiner.
4. **Rejoin block:** `onHello` checks `kick_list` for `hash(reconnectToken)` → if present, `err('NOT_ALLOWED')` and close (you can't rejoin the room you were kicked from for its TTL life). The block dies with the room (anonymity invariant — it's a hash in the ephemeral DO, never a cross-room ban).

### 4.3 Client UX

- **Affordance:** in the lobby `SquadList`, each `PlayerCard` exposes a host-only kick control via **long-press** (consistent with the brand-book long-press-to-report gesture, §9) → an action sheet "Remove from room" → **confirm modal** ("kick {nickname}? they can't rejoin this room."). 44pt targets, reduced-motion-safe. Never a stray tappable X (prevents fat-finger kicks at a party).
- **Kicked device:** routes to `modal/error` variant — deadpan mascot, *"the host showed you the door. anyway."* (voice-guide register), single "Back to Home" CTA. No shaming of the host, no appeal flow.
- **Host migration interplay:** if the host is kicked-…(can't happen — self-kick blocked) ; if the *host leaves* (not kick), server-shell §3.5 reassigns host to the longest-connected player — kick capability moves with the flag automatically. The new host inherits the `kick_list` (it's room-scoped, not host-scoped).

### 4.4 Why this shape

- **Confirm-gated long-press**, not a one-tap X, because the inclusive north-star says a party tool must not make accidental social violence easy.
- **Between-matches only** because mid-match kick would violate the frozen-roster invariant and desync replay — the cost (a host waits ~one round to remove a griefer) is acceptable and keeps the engine pure.
- **Hash-based, room-scoped block** because anonymous-forever forbids any cross-room identity; the block is a bearer-capability denial, not a ban on a person.

---

## 5. Room settings (host-only, deliberately tiny)

The whole settings surface for a host, beyond the §2.5 game-settings card:

| Setting | Type | Default | Behaviour |
|---|---|---|---|
| **Room lock** | toggle | unlocked | When on, `onHello` fresh-joins → `err('ROOM_FULL')` (reuses the existing code; or `NOT_ALLOWED`). Reconnects within grace still allowed (server-shell §3.5). Lets a host seal the squad once everyone's in. Host-only, lobby/roundOver only. |
| **Locale** | enum (fr/en) | device/room locale | Sets the room content locale (shell resolves `<base>-<locale>` pack at `startGame`, template-arch §2.7). Decided host-controlled because the room plays one shared language; default to the host device's locale, overridable. |
| **Game settings card** | §2.5 | per-config defaults | The host-tunable axes for the picked game. |

**Explicitly NOT shipped** (and why): no room password (codes are already 923k-space ephemeral capabilities — server-shell §2.1); no public/private toggle (every room is code-gated, there is no discovery directory by design — anonymity); no max-player override below the game floor (the floor is an engine bound, template-arch §2.6); no "spectator mode" toggle (server-shell §9.5 open — defer, not this domain). Keeping settings tiny is a north-star decision: a party app the host configures in 2 seconds, not a server admin panel.

---

## 6. Social #1 — room-code share + invite (top of funnel)

### 6.1 The invite surfaces

- **Lobby hero:** `RoomCodeDisplay` (4 chars, each in its own rounded tile, `displayXL`, kerned, **tap-to-copy** with a `Toast` "code copied") + `QRPanel` (generated QR of the deep link). These are first-class hero components, not utility text (mobile §3 / brand book).
- **`SecondaryButton "Invite friends"`** → native OS share sheet (`expo-sharing`/RN `Share`) with a pre-filled message: *"join my bloop room → {deepLink}  (code: ABCD)"* in the room locale, deadpan register.

### 6.2 The link shape (decided)

Two links, both pointing at the same room:
- **App deep link:** `bloop://join/ABCD` — opens straight into Join for anyone with the app (expo-router deep-link, mobile §6.1).
- **Universal/web fallback:** `https://bloop.app/j/ABCD` — for recipients **without** the app (the common viral case: someone shares the room into a group chat). The web page is a tiny static page that (a) shows the room code + a "get Bloop" store badge, (b) attempts the `bloop://` deep link if the app is installed (universal-link association), and (c) post-install routes to the room via deferred-deep-link **only via the code in the URL path** — no identity, no tracking parameter, anonymity preserved. The share sheet sends the **web** link by default (it works for everyone); the app intercepts it as a universal link when installed.

**Decided:** the share payload is the web link (maximizes "it just works" for a recipient who doesn't have the app — the actual growth moment). No referral code, no attribution param, no per-user link — anonymous-forever (we never learn *who* invited *whom*; we only know a code was joined, which is already in Analytics Engine as an aggregate, server-shell §4.3).

### 6.3 Why share is the funnel top

The room code is the only thing that crosses the social boundary before a game even starts — it's the cheapest viral act ("what's the code?"). Making it a hero + a one-tap share that works for app-less recipients is the highest-leverage growth surface that isn't the result card (§8). The QR is the in-person path (hand the phone across the table); the web link is the remote/group-chat path (and the seam the "remote play later" invariant rides — zero realtime change, just a link shared further).

---

## 7. Social #2 — "Inspired by <creator>" discovery link-outs

`content/inspiration-videos.json` maps each `gameId` → a primary creator video (+ alternates) with `creator`, `title`, `url`, `thumbnailUrl`, `lang`, `whyItMatches`, and a per-entry **`rightsNote`**. This is a discovery hook *and* a credibility signal ("this is the viral thing you've seen, now you play it").

### 7.1 Where it shows (decided)

1. **On the game tile** (picker + Home): a small **attributed credit chip** at the bottom of the card — *"inspired by {creator}"* — with the creator's name and a tiny external-link glyph. Tapping it opens the **link-out** (`url`) in the system browser / native app (YouTube/TikTok). It is a **credit + deep-link, never an embed**.
2. **On the results / share card** (§8): a one-line *"the trend: {creator}"* footer credit (text only on the shareable image; the tappable link only on the in-app card, not baked into the exported image, to avoid implying endorsement in a shared asset).
3. **Optional "watch the original" row** on the game's pre-start info sheet (the expanded tile): primary video thumbnail (`thumbnailUrl`) + creator + link-out, locale-matched (`lang` ↦ device locale where an alternate exists).

### 7.2 Rights compliance (built-in, non-negotiable)

The JSON's `rightsNote` per entry is the binding constraint and the client honors it structurally:
- **Only thumbnail + credit + link-out.** Never re-host, never re-edit, never embed the clip in-app (every `rightsNote` says this). The thumbnail is loaded from the platform-served URL (`i.ytimg.com` / official oEmbed), never re-cropped or re-uploaded.
- **Never imply endorsement.** Credit copy is neutral editorial ("inspired by", "the trend") — never "as seen / featuring / official". No creator logo, no game-IP logo (board-game trade dress, network branding) — the notes repeatedly flag NBC/Fremantle/Innersloth/CMYK trademarks; the client shows **only** the creator-credit text + the platform thumbnail, never the third-party game's box art or logo.
- **Trademark guard on titles:** we never use a source's trademarked name as our tile name (the notes flag "Truth or Drink" = Cut's trademark, "Family Feud" = Fremantle, "Wavelength" = CMYK, "Fibbage" = Jackbox). Our tile names are our own (`truth-or-drink` is the internal id; the display `name` is Bloop's own copy).
- **Takedown-ready:** a single KV flag (`inspiration.suppress: [gameId]` in client-config) hides a credit chip region-wide without a deploy — same deploy-free remediation pattern as the content kill-switch (meta-03 §7.2). A `rightsNote` flag like "remove on takedown request" is operationalized by this switch.
- **`droit à l'image` (FR):** for FR entries whose thumbnails show identifiable faces (Squeezie, McFly & Carlito, etc.), the chip uses **creator name text only** by default and shows the thumbnail only on the explicit "watch the original" row, clearly credited — never as decorative card-background art with faces. Where a `thumbnailNote` says the primary is a non-thumbnail platform (tiktok/other) and the thumbnail is from an alternate, we surface the alternate's credit alongside.

### 7.3 Why it's a growth hook, not just attribution

The cohort *recognizes these formats* (Squeezie "tu préfères", Sidemen "most likely to", Cut "truth or drink", Delemazure "de gauche ou de droite"). The credit chip does double duty: it's honest sourcing (good citizenship + rights safety) **and** a "oh, THAT game" recognition spike that converts a browser into a player. The link-out also seeds the reverse path — a player who taps through and shares the original video is a soft impression for Bloop's framing of it.

---

## 8. Social #3 — the shareable result card (the organic growth engine)

This is the single most viral surface (meta-01 §8.4 already scoped it as the one artifact that outlives the room). This domain finalizes it as a **launch** feature, not a fast-follow, because it *is* the growth engine the prompt names.

### 8.1 What it is

At a match's `roundOver` and at the Night's `summary` (Oracle screen, meta-01 §8), the results screen renders a **share card**: a mascot-branded, Sticker-Pop-styled card carrying:
- the match/night **superlatives** (group superlatives from meta-01 §8.1.B: The Oracle, The Comeback, The Anchor, Unbreakable, etc.) with **device-local nicknames** + initial-disc avatars (brand book: initial on name-hashed colour disc, no mascot-as-avatar),
- the **Night leaderboard** top 3 (placement-based, meta-01 §3),
- a subtle **Bloop wordmark** (static asset) + a **join-nudge** ("play at bloop.app"),
- optionally the **"the trend: {creator}"** credit footer (§7.1.2, text only).

### 8.2 Share mechanism (decided: ship at launch)

- **One-tap "Share" `PrimaryButton`** on results/summary → renders the on-screen card to an **image** client-side (`react-native-view-shot` capturing a dedicated off-screen card component sized 1080×1920 for stories / 1080×1350 for feed) → native share sheet (`expo-sharing`). 
- **100% client-side capture.** The server never produces, sees, or stores the image — it contains **only** device-local nicknames + the Night's awards. **No `playerId`, no room code, no reconnect token, no server reference, no tracking pixel.** This is the anonymity-preserving artifact rule (meta-01 §8.4) made concrete.
- **Two aspect ratios** offered (story 9:16 default, post 4:5) because the destination is TikTok/IG stories — meeting the format where it lives.
- **Reduced-motion / a11y:** the card is a static image (no motion to reduce); the in-app preview honors reduced-motion (no confetti behind it under the flag). The share button is 44pt, AA-contrast, labelled.

### 8.3 Why launch, not fast-follow (overriding meta-01 §8.4's "fast-follow" rec)

meta-01 §8.4 recommended fast-follow. **This domain overrides to launch** for one reason: the prompt names this "the product's organic growth engine," and an ads-only, account-less, zero-paid-acquisition app **has no other growth lever**. The room-code share (§6) gets you the people already in the chat; the result card is the only thing that reaches people *outside* it. Shipping it at launch is the difference between a closed-loop party toy and a viral one. The implementation is bounded (one capture lib, one off-screen component, two sizes) and carries zero server/anonymity risk. **Decided: launch.** (If timeline forces a cut, the on-screen Oracle/superlatives still ship — only the image export is the cuttable slice, and even that is ~1–2 days.)

### 8.4 Copy register

Superlative copy is the voice-guide deadpan-ironic register (already authored in meta-01 §8.1.B): "était dernier. a fini par te regarder de haut.", "merci de ta participation. sincèrement." The card never hypes ("Look how fun we had!" is dead on arrival, voice-guide §1.8) — it roasts affectionately, which is exactly what gets screenshotted and shared.

---

## 9. Accessibility — the brand a11y rules, made concrete and gated

The brand book mandates: WCAG AA contrast, 44pt touch targets, reduced-motion support, spicy content age-gated, long-press to report a card. mobile §6.3 specs the mechanism. This section makes each a **decision + a test**, on the Ink/Cream/Coral palette specifically.

### 9.1 Contrast (WCAG AA) on Ink/Cream/Coral

Palette (brand book): Ink `#0F1633` / Cream `#FBF6EC` / Coral `#FF6F61` (CTA) / Yellow `#FFCC4D` / Teal `#4ECDC4` / Cobalt `#5B7BFF` / Lavender `#B6A8FF` / Pink `#FF6B9D`.

Decided safe text pairings (the `onColor()` table — the single source of truth, enforced by lint). Ratios below are **measured** (sRGB WCAG 2.1), not estimated:

| Fill | `onColor()` returns | Measured ratio | Verdict |
|---|---|---|---|
| Cream `#FBF6EC` (bg) | Ink `#0F1633` | **16.48:1** | AAA — default body |
| Ink `#0F1633` (surface/dark) | Cream `#FBF6EC` | **16.48:1** | AAA |
| Coral `#FF6F61` (CTA) | **Ink** `#0F1633` | **6.51:1** | **AA/AAA pass** (white-on-coral = **2.73:1 FAILS** — never white text on coral) |
| Yellow `#FFCC4D` | **Ink** | **11.83:1** | AAA (white-on-yellow fails hard) |
| Teal `#4ECDC4` | **Ink** | **9.18:1** | AAA |
| Cobalt `#5B7BFF` | **Cream/white** | **3.67:1** | **LARGE-TEXT ONLY** (passes 3:1 large, **fails 4.5:1 body**) — see rule below |
| Lavender `#B6A8FF` | **Ink** | **8.48:1** | AAA (white fails) |
| Pink `#FF6B9D` | **Ink** | **6.63:1** | AAA (white-on-pink = **2.68:1 FAILS** — use Ink) |

**Decided rule:** `onColor(fill)` returns **Ink** for all bright fills (Coral, Yellow, Teal, Lavender, Pink) — **dark Ink text on bright fills is the contrast-safe default** (the inverse of a typical app on this warm-bright palette), and that becomes the lint. **Cobalt is the one exception and is constrained:** white/Cream on Cobalt is **3.67:1 — large-text-only (AA Large)**. Therefore **Cobalt may only carry text at `headline`/`titleM` size or larger (≥18pt bold / ≥24pt)** — it is **banned as a fill behind body/label/caption text**. For small text on a blue surface, use **Ink-on-Lavender (8.48:1)** or darken Cobalt until white passes 4.5:1. The lint encodes: white-on-Cobalt is only legal where the `<Text>` role ∈ {`displayXL`,`displayL`,`titleL`,`titleM`,`headline`}; any smaller role on Cobalt fails the build.

### 9.2 The contrast lint (CI gate, decided)

A build-time lint (extends mobile §6.3) that:
- Greps the RN component tree for `<Text>` rendered on a known brand-fill surface (Coral CTA, Yellow badge, chip fills) and **fails the build** if the text colour isn't the `onColor(fill)` value. No bright-fill text may bypass the helper.
- Snapshot-checks the **Coral CTA on Cream** (the brand's hero pairing) and the **spicy badge** both pass AA (meta-03 §8 already asserts this; we own the check).
- Runs in CI on every PR touching `apps/mobile/src/components` or the theme.

### 9.3 Touch targets — 44pt floor

**Decided:** `layout.minTouchTarget = 44` (brand book's stated 44pt; mobile §2.2 had 48 — we **align to the brand book's 44** as the floor, and keep 48 as the *recommended* size for primary CTAs). Every interactive element — buttons, chips, steppers, the long-press report/kick target, avatars-as-vote-targets, the share button, the invite button, age-gate confirm — meets ≥44pt hit area (via `hitSlop` where the visual is smaller). A lint flags any `Pressable`/`TouchableOpacity` whose resolved hit area < 44×44.

### 9.4 Reduced-motion

Read `AccessibilityInfo.isReduceMotionEnabled` via the `useMotion()` hook (mobile §6.3). When on:
- springs (`pop/bounce/slide/pulse/float`) collapse to a **120ms cross-fade**,
- `ConfettiBurst` and the celebrate layer are **suppressed**,
- the `TimerRing` shows **numerals only** (no pulse),
- the result-card preview is static (the exported image is always static anyway),
- the host-settings chip selection still animates only the 120ms fade.

No information is ever conveyed by motion alone (the timer urgency adds a numeral + the recolor, not just the pulse).

### 9.5 Dynamic Type

- The `type` scale uses `fontSize`/`lineHeight` pairs; `allowFontScaling` stays **on** (default) so OS text-size settings are respected.
- **Clamps** (`maxFontSizeMultiplier`) on tight chrome that must not overflow: the room-**code tiles** (clamp ~1.3×), the **TimerRing** numerals (~1.3×), the host-settings **stepper value** (~1.4×). Body, labels, prompts, superlatives scale freely.
- Tested at **130% and 200%** accessibility sizes (mobile §6.3) — the lobby (16 avatars), the picker grid, the result card, and the game-settings card must all survive 200% without clipping (rows wrap, never truncate critical text).

### 9.6 Colour-independent state (the explicit "not just colour for vote sides" rule)

**Decided — every stateful/semantic distinction carries a non-colour channel** (label, icon, shape, or position), never colour alone:

| State | Non-colour channel(s) |
|---|---|
| **Vote sides** (left/right, A/B, truth/dare, green-flag/red-flag, gauche/droite) | a **text label** + a **distinct icon/glyph** on each side + **position** (left/right) — never just green-vs-red. (Critical for the VOTE/debate games and Red-Flag/Green-Flag.) |
| **Host** | crown icon + `sunbeam`/Yellow ring + "host" text label (mobile §5) |
| **"You"** | brand ring + "you" text label |
| **Disconnected** | desaturated avatar + a grey dot **+ "reconnecting…" text** |
| **Timer urgency** | numeral countdown + `pulse` (suppressed under reduced-motion → numeral still shifts) + recolor — the numeral is the primary signal |
| **Truth / Dare chips** | the words "Truth"/"Dare" (or fr equivalents) on the chip, not just green/orange fill |
| **Selected / submitted** | a **checkmark** + ring, not just a colour change |
| **Spicy tile** | 🌶 glyph + "18+" text badge, not just a colour |
| **Correct / wrong** (guess games) | ✓ / ✗ glyph + text, not just green/red |

This is the single most-tested a11y rule for a party voting app (red/green colour-blindness is ~8% of men): the green-flag/red-flag and gauche/droite games **must** be playable with no colour perception at all. A lint can't fully verify this, so it's a **design-review checklist item** on every game-screen PR (the registry contract, mobile §4.5) + a manual colour-blind-simulator pass before launch.

### 9.7 Screen readers

Every `Avatar`/`PlayerCard` carries an `accessibilityLabel` (nickname + role + connection: "Théo, host, online"). The room code is announced **char-by-char** ("A, B, C, D"). Vote cards announce "Vote for {nickname}, {state}". The kick confirm, age gate, report sheet, and share button all have descriptive labels and roles. Host-settings chips announce label + selected value ("debate time, long, selected").

### 9.8 Spicy age-gate + long-press report (brand-mandated a11y affordances)

Both are owned by meta-03 (§4 age gate, §7.1 report) and honored here without re-spec: the age-gate modal and the long-press report sheet are WCAG-AA, 44pt, reduced-motion-safe, deadpan-copy. This domain only adds: the **long-press gesture is shared between report (any card) and kick (a player card, host-only)** — one consistent ≥500ms long-press vocabulary across the app (you long-press a *card* to report, you long-press a *player* to kick), so the gesture is learnable and discoverable.

---

## 10. Implementation surface (what actually gets built)

Overwhelmingly **client + catalog + 3 small protocol additions**; zero reducer/contract change.

| Piece | Where | New code? |
|---|---|---|
| `hostTunable` field + descriptor + refinements (d–g) | `packages/protocol/src/catalog.ts` | **Small additive** schema |
| `startGame{configId,hostParams}` + `kick` + `pickGame` variants; `NOT_ALLOWED` code | `packages/protocol/src/messages.ts` | **Small additive** |
| Host-param resolve/clamp/merge + pin into `RoomMeta`; `onKick`/`onPickGame`; `kick_list`; room-lock | `apps/server` RoomDO shell | **Small additive** (validation + roster bookkeeping) |
| Game picker (categories, generic tiles), Game-settings card, room settings | Expo client (lobby) | New client surfaces |
| Kick UX (long-press → confirm), kicked-device screen | Expo client | New client surface |
| Room-code share (deep + web link), QR, invite button | Expo client + a tiny static `bloop.app/j/:code` page | New client + 1 static web page |
| "Inspired by" credit chip + link-out + rights guards + KV suppress flag | Expo client (reads `inspiration-videos.json`) | New client surface |
| Shareable result card (off-screen component, `react-native-view-shot`, share sheet) | Expo client | New client surface |
| `onColor()` table + contrast lint + 44pt lint + colour-independence checklist | `apps/mobile/src/theme` + CI | New lint + theme helper |
| Category field (optional) on `GameConfig` | `packages/protocol` + KV | Tiny additive |

---

## 11. What this domain explicitly does NOT do (anti-scope)

- **No engine/contract/reducer change.** Host tunables resolve to a merged Config the shell pins; kick is roster bookkeeping; social + a11y are client-side.
- **No widening of any param beyond its engine bound.** `hostTunable` ranges are always *narrower* (refinement (f)); the host requests, the server clamps.
- **No age-gate bypass via the intensity toggle, ever** (§2.6). Intensity moves within an already-attested ceiling.
- **No mid-match kick** (frozen-roster invariant) and **no cross-room ban** (anonymity — kick-list is room-scoped hashes, dies at TTL).
- **No referral/attribution tracking on invites or share cards.** Anonymous-forever — we never learn who invited whom.
- **No embedded/re-hosted creator clips, no third-party logos/box-art, no implied endorsement.** Credit + thumbnail + link-out only, per each `rightsNote`.
- **No server-side anything for the result card** — client-capture only, no server image, no stored artifact.
- **No colour-only state** anywhere (§9.6).
- **No big host-settings screen** — a collapsible 2–4-row card, defaults pre-selected; fixed (`hostTunable:[]`) is a first-class, encouraged config.

---

## Open product calls (with my recommendation)

These genuinely need a human (product/founder/legal). Each carries a recommendation and is implementable either way without changing the architecture above.

1. **The 4th host axis `pace` — launch or fast-follow?** §2.3 ships it as opt-in per game. *Recommendation:* **ship the mechanism at launch but enable it on only 2–3 timer-feel games** (quizz, cinquante-cinquante, jeu-de-la-note); watch whether hosts actually use it before adding it elsewhere. The mechanism is cheap (one multiplier over declared timer params); the risk is purely "is it a knob nobody touches." Remote-config which configs list it.

2. **Web link domain + deferred-deep-link provider.** §6.2 assumes `bloop.app/j/:code` with universal-link association + deferred deep-link post-install. *Recommendation:* own the apex domain + universal-link/App-Links setup at launch (it's the growth funnel); use the store's native deferred-deep-link (no third-party attribution SDK — keeps anonymity). **Decision needed:** confirm the domain and that we accept "no install attribution" (a feature, not a gap, for an anonymous app). *(My pick: yes, no attribution SDK.)*

3. **Result card at launch (this doc overrides meta-01's fast-follow).** §8.3 argues launch because it's the only out-of-network growth lever. *Recommendation:* **launch it**; if timeline slips, cut only the *image export* (keep on-screen Oracle), never the superlatives. **Decision needed:** founder confirms the result card is launch-priority vs the meta-01 fast-follow stance. *(My pick: launch — it's the engine.)*

4. **Kick rejoin-block strength.** §4.2 blocks rejoin for the room's TTL via `reconnectToken` hash. A kicked user can clear app data → new token → rejoin if they re-enter the code. *Recommendation:* accept this residual for v1 (anonymity forbids a stronger handle; a determined griefer at a private code-gated party is a social problem, not a software one). **Decision needed:** confirm we don't want a heavier block (we can't, without identity). *(My pick: accept; it's correct under anonymity.)*

5. **Category taxonomy (the 6 buckets).** §3.2 proposes 6. *Recommendation:* ship these 6; they're presentation-only KV metadata, so they're re-orderable/renamable without a deploy. **Decision needed:** founder signs off on the 6 names/groupings (esp. whether "Spicy" is its own visible category vs only surfaced post-attestation — I lean *visible-but-locked* so the upsell is discoverable). *(My pick: 6 as listed, Spicy visible-but-gated.)*

6. **Default room locale source.** §5 defaults the room locale to the host's device locale, host-overridable. *Recommendation:* keep host-device default; **decision needed:** confirm we don't want a per-player locale (we don't — a room plays one shared language, and per-player content packs would fork the deterministic draw). *(My pick: room-level, host-set.)*

7. **`onColor` → Ink-on-bright as the brand default + the Cobalt small-text ban.** §9.1 decides dark Ink text on all bright fills (measured: Ink/Coral **6.51:1**, comfortably AA/AAA — white-on-Coral **fails** at 2.73:1). It also surfaces a real finding: **Cobalt `#5B7BFF` carries white text at only 3.67:1 — large-text-only**, so it's banned behind body/label text. *Recommendation:* Ink-on-bright is a hard a11y requirement, not a taste call — but it changes how bright CTAs *look* (Ink text on Coral, not white). **Decision needed (two parts):** (a) brand/design confirms Ink-on-Coral for the CTA is acceptable (it must be, for AA); (b) confirm Cobalt stays large-text-only **or** darken Cobalt one step so white passes 4.5:1 and it's freed for body text. *(My pick: Ink-on-Coral is cleaner and non-negotiable for AA; keep Cobalt large-text-only at launch — it's used for the brand ring and headings, rarely for body — and darken it later only if a body-on-blue surface is actually needed.)*
