# `gauche-ou-droite` — Final Game Design (SHIPPED)

| Field | Value |
|---|---|
| **Game id** | `gauche-ou-droite` |
| **Name (FR)** | De gauche ou de droite ? |
| **Name (EN)** | Left-Coded or Right-Coded? |
| **Template + mode** | `VOTE@2` — `option-vote` module, config `GAUCHE_DROITE_CONFIG` (`scoring: 'majority-herd'`, option ballot, debate phase) |
| **Players** | min **3**, max **16** (`minPlayers`/`maxPlayers` on the module) |
| **Spicy tier** | **0** (every shipped item is `spicyLevel: 0`; no 18+ tier — see §5) |
| **Physical** | **seated** (phones vote, the room argues; no standing/movement) |
| **Status** | **SHIPPED** — `packages/games/option-vote` (module + 2 configs), content pack `content/packs/gauche-ou-droite.json` (222 items) |

> **Authority.** This document is finalized against the SHIPPED code. Where any earlier proposal
> (wave2-raw by-game JSON, §2.1 of the wave-2 design) disagreed with `packages/games/option-vote/src/*.ts`,
> the code wins. All numbers below are quoted from `state.ts` (`GAUCHE_DROITE_CONFIG`) and the reducer.

---

## 1. Pitch & room fantasy

**One-liner.** A meme-format judgment vote: an everyday object/food/behaviour card (raclette, e-scooters, the finance vest) fills every screen; everyone secretly votes whether it's *Left-coded* or *Right-coded*; the room splits live on the reveal; then you argue about it for half a minute before the next card.

**Room fantasy.** This is **mock-sociology as a party game**. The fun isn't *being right* — there's no right answer — it's the **"WAIT, who voted that raclette is right-wing?!"** moment when avatar chips land under each side and you discover your friends' secret aesthetic-political instincts. The game manufactures an argument *on purpose*: each item ships with an attackable, faux-academic one-liner (the `debateStarter`) engineered to arm exactly one side of the table. You score for **reading the room** (siding with the majority), and the chronic weirdo who keeps voting against everyone gets crowned **The Contrarian** at the end — a badge, never a penalty. The whole loop is *phones for the vote, mouths for the fight*: the app supplies the prompt and the timer, the table supplies the chaos.

---

## 2. Shipped ruleset (AUTHORITATIVE)

All constants from `GAUCHE_DROITE_CONFIG` in `packages/games/option-vote/src/state.ts`:
`scoring: 'majority-herd'`, `totalRounds: 7`, `chooseMs: 15_000`, `revealMs: 7_000`, `debateMs: 35_000`, `debateSkipThreshold: 0.5`, `pointsCorrect: 1`.

### Phases (real `phaseKey` + `phaseDurationMs`)

`phaseKey` = `'over'` when terminal, else `` `${phase}:r${round}` `` (round is **0-indexed** internally — first card is `choose:r0`).

| Phase | `phaseKey` | `phaseDurationMs` | What happens |
|---|---|---|---|
| **choose** | `choose:r{n}` | **15 000 ms** (`chooseMs`) | The item card (hero emoji + huge noun phrase) fills every screen; each player taps one of two pack-defined axis buttons (FR « De gauche » / « De droite », EN "Left-coded" / "Right-coded"). The pick goes into a **hidden ballot buffer**. **Early-resolve** the instant `allActed` is true over the *connected* player set. On the **deadline** event, resolve with whatever was submitted — non-voters simply don't appear in the tally and score 0; they never block the room. |
| **reveal** | `reveal:r{n}` | **7 000 ms** (`revealMs`) | Atomic reveal: `lastResult` is promoted from the hidden buffer in one broadcast — `counts {A,B}`, the crowned `majority` side, the public `picks` map (avatar chips per side), and the `awarded` list (+1 animation on majority voters). A perfect tie shows the « Égalité parfaite / Dead even » sticker and awards nothing. **No input accepted** — pure timed beat. On deadline, `afterReveal` advances to `debate` (because `debateMs > 0`). Emits analytics `round_revealed`. |
| **debate** | `debate:r{n}` | **35 000 ms** (`debateMs`) | Phones show the item's `debateStarter` one-liner as argument fuel + the countdown; the talking is IRL. Anyone connected may tap « On passe / Next ». The phase ends early when **strictly more than 0.5** of *connected* players have tapped skip (`skipQuorumMet`: `skips > debateSkipThreshold * connectedCount`). On the deadline, `endRound` runs. Emits analytics `round_completed` at the round boundary (the shell's ad-cadence signal). |
| **over** | `over` | **`null`** (terminal, untimed) | Scoreboard of cumulative herd scores; winner = « le plus dans le sens du vent / most in tune with the room ». One non-scoring superlative from `minorityCount`: « L'esprit contraire / The Contrarian » for the player most often in the minority (display-only). Emits a `gameOver` effect with a **defensively cloned** `{ ...over.scores }` per the tracer invariant. |

### Round structure & scoring (exact)

- **7 rounds** (`totalRounds: 7`), each ~**57 s** wall-clock (15 + 7 + 35). `init` caps `totalRounds` at pool length (`Math.min(config.totalRounds, items.length)`) — with 222 items, never binds in practice.
- **Resolve (`resolveChoose`).** Tally `A` and `B` over **submitted ballots only**. `majority = a > b ? 'A' : b > a ? 'B' : null`.
- **Scoring (`majority-herd` branch).** If `majority !== null`, every player whose `pick === majority` gets **`+pointsCorrect` (= +1)** and is pushed to `awarded`. Every player on the minority side gets `minorityCount[p] += 1` (no point change — **never goes negative, never below 0**). Your own pick scores you; there is **no prediction field** in this config (`predict` is only used by the `predict-majority` sibling, tu-preferes).
- **Tie / degenerate.** `majority === null` (perfect tie, *including the zero-ballots case*): **nobody scores, nobody's `minorityCount` moves**, « Égalité parfaite » splash shown.
- **Timeout.** Non-voters at the `choose` deadline are absent from the tally → 0 points, and are **not** counted as minority (only submitted minority voters increment `minorityCount`).
- **Win / draw.** Highest cumulative `scores` wins. Ties on the leaderboard are shown as shared placement (the shell, not the reducer, maps placement → session XP per cross-game-synthesis §1.7 — each game keeps its own raw scale; here that scale is 0–7).

### Presence / disconnect behaviour

- Roster is fixed at `init` (`players` + `connected` presence map); no late joins to the running match.
- **`playerLeft`** flips presence to disconnected. A leave can *complete* the expected set: if it does, the reducer immediately calls `resolveChoose` (in `choose`) or `endRound` (in `debate` if the skip quorum is now met over the shrunk connected set). An absent player can therefore **never stall** a phase.
- **`playerRejoined`** flips presence back; idempotent (no-op if already in the target state).
- **Skip eligibility.** A `skip` action is rejected unless the player is currently `connected === true` and hasn't already skipped — disconnected players can't pad or distort the quorum, and quorum is always computed over `connectedPlayers(...)`.

### Redaction (what's secret from whom)

`view(state, viewer)` enforces per-viewer redaction:
- **`choose`:** the `item`, a public `hasSubmitted` map (booleans only — who has voted, *never what*), and **owner-only echo** `myBallot = ballots[viewer] ?? null`. No counts, no other player's pick, leaks pre-reveal. (`ballots` is documented HIDDEN; only `hasSubmitted` + owner echo are exposed.)
- **`reveal` / `debate`:** the full `RoundResult` is now public — `counts`, `majority`, the `picks` map (everyone's side), and `awarded`. This is intentional: the public picks ARE the debate fuel.
- **`over`:** `scores` + `minorityCount` only.
- `scores` is visible every phase (running leaderboard). There is no hidden prediction to protect in this config, so redaction is simpler than the tu-preferes sibling.

---

## 3. Content model

### Pack item shape (`content/packs/gauche-ou-droite.json`)

```jsonc
{
  "id": "raclette",                      // kebab-case, unique in pack
  "text": { "fr": "La raclette", "en": "Raclette night" },  // noun phrase, ≤ 80 chars, rendered huge
  "emoji": "🧀",                          // single emoji, the card's hero visual
  "category": "food",                    // food | lifestyle | tech | culture | sport | behavior — curation metadata, reducer IGNORES it
  "spicyLevel": 0,                       // 0 | 1 | 2 — items above the config's allowed tier are never drawn
  "debateStarter": {                     // ≤ 120 chars, one attackable thesis, shown during debate; NEVER names real parties/politicians
    "fr": "Un plat de partage où chacun surveille la machine et compte tes patates. Une copro, pas un dîner.",
    "en": "A 'sharing' meal where everyone is privately auditing your potato intake."
  }
}
```

Pack-level: `axis: { left:{fr,en}, right:{fr,en} }` (the two vote-button labels — default FR « De gauche » / « De droite », EN "Left-coded" / "Right-coded"; sibling packs can mint non-political axes config-only), plus `version` and `generatedAt`.

> **Note on the reducer's `OptionVoteItem` type.** The runtime type carries `optionA`/`optionB`
> per item; for this game those are the pack's `axis` labels repeated onto every item at **build time**
> (the pack-authoring source stores `axis` once; the build fans it out). The authored pack file uses the
> compact `{ text, emoji, category, spicyLevel, debateStarter }` shape + one pack-level `axis`.

### How many items ship

- **222 items**, all `spicyLevel: 0`, in **one bilingual authoring pack** (FR+EN inline per item).
- Category balance: **food 41, lifestyle 43, tech 32, culture 35, sport 28, behavior 43**.
- **Sizing lint** (synthesis §3.5): ≥ `totalRounds` (7) items per allowed spicy tier. With 222 at tier 0, the pool is **~31× the lint floor** — months of no-repeat play; `init` shuffles with the seeded RNG (`shuffle(createRng(seed), items)`).
- At **build/publish** the bilingual source splits into single-locale runtime packs `gauche-droite-fr` / `gauche-droite-en` (synthesis §3.1 single-locale pack rule). Items are **not** translated 1:1 — each locale gets a culturally native set (the EN strings already read native: "the finance vest", "bottomless brunch", "a lifted pickup truck", "pickleball").

### AI / offline pipeline

- **`needsOfflineAiPipeline: false`** — nothing is pre-computed at content-build time and nothing is computed at runtime (the "majority" is the room's own live votes). Per platform invariant, **no live AI at runtime**.
- AI-assisted *drafting at volume* is fine behind the human/pack-safety gate, but produces no stored per-item computed values in v1.

### Voice / tone (content-voice-guide §5.1)

**Mock-sociology deadpan.** The voice is a fake-serious cultural critic delivering verdicts on raclette: dry, precise, faux-academic register clashing with dumb subjects (the "classement IA" register). Every `debateStarter` is an **attackable thesis, not a description** — each must arm ONE side of the room (« petit plaisir de bourgeois » — class-coded pettiness, never politics). **Hard editorial rule:** objects/foods/behaviours only — never real parties, politicians, elections, or live legislation. The edge is class-coded pettiness, not partisanship.

---

## 4. RESOLVED DECISIONS

Every former defer / v2 / open-question / spicy / hostTunable item from §2.1, the by-game `recommendations[]`, and the by-game `risks[]` — each given a FINAL ruling. No TBD.

| # | Former open item | FINAL decision |
|---|---|---|
| D1 | *Does the vote score anything, and how?* | **Ship v1.** Herd scoring, locked in code: majority side each +1 (`pointsCorrect`); tie → 0 for all; minority increments non-scoring `minorityCount`. |
| D2 | *Are votes public at reveal?* | **Ship v1 — public.** Avatar chips per side; `picks` map exposed from reveal on. The "WHO voted that?!" moment is the entire game. `anonymousVotes` does **not** exist in `GAUCHE_DROITE_CONFIG` — reserved for a future spicy sibling pack only (see D9). |
| D3 | *How does debate end without a passive/disconnected player blocking?* | **Ship v1.** Hard 35 s shell-alarm deadline **plus** early-exit when `skips > 0.5 × connectedCount` (`skipQuorumMet`), quorum over the connected-filtered set; disconnected players excluded from numerator and denominator. |
| D4 | *Is this VOTE as-is or a template extension?* | **Shipped as VOTE@2** — the `option-vote` module: option ballot (pick `'A'`/`'B'`), `debateMs` (0 disables the phase, used by the tu-preferes sibling), and the `majority-herd` scoring branch. One module, two configs. **Done.** |
| D5 | *EN cultural adaptation of left/right humour (brief's explicit open Q)?* | **Ship v1.** EN-native form of the same meme: axis "Left-coded"/"Right-coded" + a fully localized EN item set (already authored inline — oat-milk lattes, lifted pickups, pickleball, bottomless brunch). Sibling runtime pack `gauche-droite-en` under the pack-family convention. **Rollout:** stage EN at **`rolloutPct 5`**, watch completion/abandon analytics before promoting. |
| D6 | *"What the internet thinks" % at reveal?* | **Roadmap v2 (likely cut).** If ever wanted: pre-compute `crowdPct` per item in the offline pipeline, store as pack data (flips `needsOfflineAiPipeline → true` for that pack), never runtime-fetched. Default disposition: **leave cut** — adds factual-claim + freshness risk for a beat the core loop doesn't need. |
| D7 | *Spicy tier?* | **Cut for v1; Roadmap v2 as a sibling config, not a new mechanic.** v1 launches classic-only (all 222 items tier 0). See §5 for the concrete sibling spec if a spicy pack is ever authored. |
| D8 | *Even-sized small rooms tie often (scoreless rounds)?* | **Ship v1 as-is — `pointsTie: 0`, run it as a joke** (« Égalité parfaite »). **Roadmap (param-gated):** if `round_revealed` analytics show ties **> ~30 %** of rounds, add a `tiePolicy: 'all-plus-one'` variant param — do **not** change the core rule. |
| D9 | *`anonymousVotes` param?* | **Cut from this config; Roadmap v2** — exists only as a reserved param for a future spicy sibling pack (would set `anonymousVotes: true` to soften exposure on edgier topics). Not in `GAUCHE_DROITE_CONFIG`. |
| D10 | *Debate dead-air with shy groups / is 35 s too long?* | **Ship v1 at 35 s**, mitigated by `debateStarter` + majority-skip. **Promote `debateMs` to the host-tunable allowlist** (template-architecture §7 Q4) — see §6. |
| D11 | *Trend decay (e-scooters date within months)?* | **Content-ops (ongoing).** Monthly KV pack-version refresh with **no deploy** (synthesis §3.2); keep category balance so a stale tech item never dominates a draw. |
| D12 | *Political-divisiveness drift?* | **Ship v1 with a hard editorial gate.** Items are only objects/foods/behaviours — never parties/politicians/elections/live legislation; `debateStarter`s stay absurd/class-coded. Enforced by the pack safety gate (template-architecture §6.3) + mandatory human playtest before any rollout promotion. |
| D13 | *Streaks (compensation for tie-heavy nights)?* | **Roadmap v3 (low priority).** A param-gated streak bonus could compensate score-starved small rooms, but D8's `tiePolicy` param is the cleaner fix. Default: **cut** unless analytics demand it. |
| D14 | *EN meme-transfer uncertainty elsewhere in EN markets?* | **Ship v1 with containment.** Staged `rolloutPct` + per-locale packs cap blast radius. **Pure-content fallback (no code):** a non-political sibling **axis** like "Boomer-coded / Gen Z-coded" on the same template, config-only. |

---

## 5. The 18+ spicy sibling config

**Decision: NO spicy tier at launch (v1). A spicy sibling is a roadmap-v2 *content+config* option, not a mechanic change — reasoned below.**

### Why no spicy tier in v1
This game's whole comedic engine is **class-coded pettiness about objects** (« petit plaisir de bourgeois », the finance vest, $40 brunch). Sex/alcohol explicitness (the tier-2 18+ baseline per voice-guide §3) is **orthogonal to the joke** — making "Left-coded?" about sexual content doesn't sharpen the bit, it changes the genre. The flagship 18+ surface in the catalog is `pires-potes` / `truth-or-drink`, not this one. So v1 ships **tier 0 only** (all 222 items), no `minAge` flag.

### Concrete sibling spec, IF a spicy pack is ever authored (roadmap v2)
A spicy sibling would be a **pure config + new pack**, reusing the shipped module unchanged:

```jsonc
// game_config: gauche-ou-droite-spicy  (sibling, NOT a code change)
{
  "module": "option-vote",
  "config": { ...GAUCHE_DROITE_CONFIG },   // identical mechanics/timers/scoring
  "minAge": 18,
  "packIds": ["gauche-droite-spicy-fr", "gauche-droite-spicy-en"],  // separate spicy packs
  "anonymousVotes": true                   // the ONE mechanic delta — soften exposure (D9)
}
```

- **Tone:** same mock-sociology deadpan, but items drawn from edgier-but-still-objects/behaviours topics (dating-app etiquette, money treason, finsta, the talking stage) at `spicyLevel: 1–2`. **Still never** sexual-explicit-as-subject and **never** real people/politics (the HARD FLOOR in voice-guide §3 applies at every tier).
- **`publicPicks`/anonymity:** flip `anonymousVotes: true` so the reveal shows the *split* without naming who voted what — the only safe way to push edgier topics without weaponizing in-room exposure.
- **Separate pack ids** + `minAge: 18` gate; the reducer/module are untouched.

**Net:** v1 = no spicy. The spicy path is a documented, low-priority content sibling; ship only if a spicy pack clears the safety gate and demand exists.

---

## 6. Host-tunable params (lobby allowlist for THIS game)

The host may tune **only** these, within safe ranges; everything else stays at `GAUCHE_DROITE_CONFIG` defaults. (Allowlist per template-architecture §7 Q4.)

| Param | Default | Safe range | Rationale |
|---|---|---|---|
| `totalRounds` | **7** | **5 – 12** | Round count = session length (~57 s/round). Floor 5 keeps a real game; ceiling 12 stays under the no-repeat pool (222) and respects attention span. Always `min(value, pool)`. |
| `debateMs` | **35 000** | **0 – 60 000** | The big tunable (D10): `0` disables debate entirely for fast/shy groups (auto-skips reveal → next round); up to 60 s for talkative tables. |
| `spicyPack` toggle | **off** (tier 0 only) | off / on (only if a spicy sibling pack ships) | Gated by `minAge: 18` at the lobby; inert until the v2 spicy pack exists (§5). |

**Deliberately NOT host-tunable:** `scoring` (the game IS herd-scoring), `chooseMs`/`revealMs` (pacing is tuned; exposing them invites broken rooms), `debateSkipThreshold` (0.5 is the liveness guarantee), `pointsCorrect` (placement-XP at the shell makes raw points cosmetic), `anonymousVotes` (config-level per pack, not a host toggle).

---

## 7. Future modes roadmap (each decided)

| Mode / idea | Decision |
|---|---|
| **`crowdPct` "what the internet thinks" beat** | **v2, likely cut.** Pre-computed per item offline only; flips `needsOfflineAiPipeline → true`. Default disposition: leave cut — factual/freshness risk for a non-essential beat (D6). |
| **`tiePolicy: 'all-plus-one'` variant** | **v2, analytics-gated.** Ship only if ties exceed ~30 % of rounds in `round_revealed` data; param, not a core-rule change (D8). |
| **Spicy 18+ sibling config** | **v2, demand-gated.** Pure config + separate packs + `anonymousVotes:true` + `minAge:18`; module unchanged (§5). |
| **Non-political sibling axes** ("Boomer-coded / Gen Z-coded", "Cat person / Dog person") | **v2, pure content.** Config-only via the pack `axis` field — zero code. Also the EN-market fallback if "-coded" under-transfers (D14). |
| **Streak bonus** | **v3, cut by default.** Only revisit if `tiePolicy` proves insufficient for score-starved small rooms (D13). |
| **Remote play** | **Inherited, free.** Same-room first; the server-authoritative DO + per-viewer redaction already support remote with zero realtime-layer change (platform invariant). |
| **New scoring modes on the module** | **Already shipped** — `predict-majority` (tu-preferes) lives in the same `option-vote` module; the option-ballot family is permanently unlocked for config-only future games. |

---

## 8. Risks & content-ops notes

- **Political drift (top risk).** Hard editorial rule enforced by the pack safety gate (template-architecture §6.3) + mandatory human playtest before any `rolloutPct` promotion. Lint/review rejects any item or `debateStarter` naming a party, politician, election, or live legislation. All 222 shipped items already pass (objects/foods/behaviours only).
- **Pack-sizing lint.** Floor: ≥ 7 items per allowed spicy tier. Current: 222 @ tier 0 (~31× floor). The lint should also keep **per-category** balance (no category should be able to dominate a 7-card draw) — current spread (28–43 per category) is healthy.
- **Freshness / trend decay.** Tech items (`e-scooters`, `NFTs`, `crypto`) date fastest. Mitigation: monthly KV pack-version refresh with **no deploy** (synthesis §3.2); rotate/retire stale tech items; keep categories balanced so a dated item never carries a draw.
- **Moderation surface.** Public picks (`picks` map at reveal) name **in-room** players' votes only — no free text, no UGC, no absent third parties; the moderation surface is the **authored pack**, fully pre-vetted offline. A future spicy sibling would add `anonymousVotes:true` to remove even in-room attribution on edgier topics (§5).
- **Tie rate (small even rooms).** Monitor via `round_revealed`; if > ~30 % of rounds tie, ship the `tiePolicy` param (D8) — do not touch the core rule. Run as a joke until then.
- **Debate dead-air (shy groups).** Mitigated by `debateStarter` fuel + majority-skip; the host can also set `debateMs` lower or to 0 (§6).
- **EN meme-transfer.** Contained by staged `rolloutPct 5` for `gauche-droite-en` + the non-political-axis content fallback (D14). Watch completion/abandon before promoting.
