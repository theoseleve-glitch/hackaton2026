# Meta-07 — Catalog & Template Reconciliation — FINAL design

| | |
|---|---|
| **Domain** | catalog-reconciliation (the definitive template↔game map vs. shipped reality) |
| **Status** | **DECIDED** — finished spec, the single source of truth for "what templates exist, what games they back, and what's cheap to add next" |
| **Owner** | Lead game designer (catalog/meta) |
| **Scope** | Reconcile the entire design corpus (template-architecture, cross-game synthesis, wave-2 17-games, the four wave-1 game designs, the Brand Book's 3 new modes) with SHIPPED reality (`packages/games/*`, 10 modules) + the 17 final game configs (`docs/designs/final/games/*`). Produce: (a) the consolidated template set actually shipped + free-unlock map; (b) a retire-or-roadmap ruling for the original designed-but-never-built games (hot-seat, rank-friends, "Name 3 in 5s"/blitz); (c) the full 18-game (+3 brand-book modes) catalog table; (d) the ranked "cheap to add next" pipeline. |
| **Grounds in** | `2026-06-11-wave2-17-games-design.md` §1/§3/§4/§5; `2026-06-10-template-architecture.md` §1–§5; `2026-06-10-cross-game-synthesis.md` §1.7/§4; `2026-06-10-game-hot-seat-design.md`; `2026-06-10-game-rank-friends-design.md`; the shipped `packages/games/{tracer,option-vote,input-guess,secret-role,truth-dare,spotlight-guess,last-standing,rule-hunt,night-day,perform-judge}` modules (versions read from source) + the 17 configs in `docs/designs/final/games/`. |

This document owns the **catalog↔template inventory only**. It changes **no** `GameModule`, **no** engine contract, **no** reducer, **no** existing config. It is a reconciliation ledger: it pins names, declares what is shipped vs. designed-only, and rules every "build / cut / config-rider" question so no two later docs disagree on the catalog.

> **Authority note.** Where this doc and an earlier doc disagree on catalog facts (template count, which games are built, the fate of hot-seat / rank-friends / blitz), THIS doc rules, because it is grounded in the shipped `packages/games/*` tree (read 2026-06-13), not in proposals. The earlier docs' *mechanic* designs remain canonical; only their forward-looking catalog claims are superseded here.

---

## Decisions (the short list)

1. **Ten archetype modules shipped, not "5 templates", not "6".** The honest, shipped count is **10 GameModule packages** in `packages/games/*`: `tracer` (VOTE@1), `option-vote` (VOTE@2), `input-guess` (INPUT_GUESS), `secret-role` (SECRET_ROLE), `truth-dare` (TRUTH_DARE), `spotlight-guess` (SPOTLIGHT_GUESS), `last-standing` (LAST_STANDING), `rule-hunt` (RULE_HUNT), `night-day` (NIGHT_DAY), `perform-judge` (PERFORM_JUDGE). The vision's "5 templates" and the template-architecture doc's "6" were both pre-wave-2 counts; wave-2 added the five consolidated performance/deduction modules. **§1 is the canonical inventory.**
2. **The shipped catalog is 17 game configs across those 10 modules** (`docs/designs/final/games/*`, one .md per config). Every one of the wave-2 17 games has a config; **none of the original wave-1 four (rank-friends, hot-seat, truth-or-dare classic, impostor classic) ships as its own catalog tile yet** — only their *modules* (or, for rank-friends/hot-seat, *neither* module) exist. See §3 for the full table.
3. **`tracer` is a shipped MODULE with no shipped CONFIG tile.** It is the reference VOTE@1 implementation and the runtime engine for `pires-potes` (whose pack collapses to tracer's `{ prompts }` shape). Decision: **ship one `who-s-most-likely` classic VOTE@1 tile** off tracer as the zero-cost flagship onboarding game (it is literally a content pack). This is the single cheapest addition on the board (§5, P0).
4. **rank-friends → ROADMAP, not cut. Build the `RANKING` module (the one designed-and-named template still missing).** It is the only wave-1 design whose module was never built and whose mechanic (Borda ranking ballot + multi-beat podium) is genuinely new code, not a config of anything shipped. Priced ~1 week. Unlocks rank-friends + the vision's "Guess My Rank" (the latter needs a `RANKING@2` perception-gap mode) (§2.2, §5 P2).
5. **hot-seat → ROADMAP as a `spotlight-guess` (SPOTLIGHT_GUESS) `predict-subject` mode, NOT a new HOT_SEAT module.** hot-seat's mechanic (rotating spotlight holds a secret self-answer; others predict; spotlight scores for being read right) is SPOTLIGHT_GUESS's exact skeleton (rotating spotlight + per-round secret + converging guesses + read-bonus) with a `mode:'predict-subject'` resolver. Building a standalone HOT_SEAT module is rejected as sprawl. Priced ~3–4 days as a third SPOTLIGHT_GUESS mode (§2.1, §5 P3).
6. **"Name 3 in 5s" / blitz → ROADMAP as a `perform-judge` (PERFORM_JUDGE) `blitz` config, already resolved in wave-2 §5.5.** Blitz = spotlight + public prompt + 5 s timer + peer-tap verdict = PERFORM_JUDGE with `promptVisibility:'all'` + `adjudication:'verdict'`. The template-architecture §7 Q1 "one INPUT_GUESS or split" question is **closed**: INPUT_GUESS stays numeric/text-only; the timed-verdict family lives in PERFORM_JUDGE. Priced ~1–2 days as a config + a `promptVisibility:'all'` param branch (§2.3, §5 P4).
7. **The 3 Brand-Book modes are already covered by shipped modules — zero new code, config + pack only.** "Who Said That?" → `input-guess` (a `collab-attribution` text mode, small param) + `option-vote` vote beat; "Courtroom" → `option-vote` (VOTE@2 debate ballot); "Red Flag / Green Flag" → `option-vote` (VOTE@2 binary ballot + debate). None needs a new module. Courtroom and Red/Green Flag are **config-only today**; Who Said That? needs one INPUT_GUESS text-mode param (§4).
8. **No new module is required to ship anything currently designed except `RANKING`.** Everything else — the brand-book trio, hot-seat, blitz, all future spicy/themed reskins — rides a shipped module via a config and/or a small additive param. `RANKING` is the last genuine code gap in the entire named corpus.
9. **The "free unlock" gradient is real and quantified.** Each shipped module unlocks a family of future tiles at config+pack cost only. §1's per-module "unlocks for free" column and §5's ranked pipeline are the canonical statement of "what's cheap next."
10. **Module version axis is honest and pinned.** Shipped module versions (read from source): `tracer@1`, `option-vote@1`, `secret-role@1`, `truth-dare@2`, and the wave-2 modules at `@1`. The `@1`/`@2` suffixes used colloquially in designs (e.g. "VOTE@2", "SECRET_ROLE@2") refer to **param-surface generations within a module**, not necessarily the `GameModule.version` integer — §1.4 disambiguates so no one conflates them.

---

## 1. The definitive consolidated TEMPLATE SET (what actually shipped)

Ten `GameModule` packages exist under `packages/games/*` (verified 2026-06-13). This is the complete, closed set of archetypes. Each is named below with: the **archetype id** (the colloquial template name used across designs), the **package**, the **`GameModule.version`** read from source, the **games it serves today**, and **the games it unlocks for free** (config + pack only, no reducer change).

### 1.1 Inventory table

| # | Archetype | Package (`@bloop/game-…`) | `version` | Param generation | Games it serves TODAY (shipped configs) | Unlocks for free (config + pack only) |
|---|---|---|---|---|---|---|
| 1 | **VOTE@1** | `tracer` | `1` | @1 | *(none as a tile yet)* — runtime engine for `pires-potes` | `who-s-most-likely` classic, "Pass the Bloop"-lite, any single-vote designation pack; **P0 unlock** |
| 2 | **VOTE@2** | `option-vote` | `1` | @2 (option ballot + debate + predict) | `tu-preferes`, `gauche-ou-droite` | Pass the Bloop (option reveal), **Courtroom**, **Red/Green Flag**, polls, "hot-take" packs — the whole binary/option-judgment family |
| 3 | **INPUT_GUESS** | `input-guess` | `1` | v1 (`closest-number`, `crowd-target`) | `quizz-culture-ge`, `cinquante-cinquante` | "Juste Prix" (`bustIfOver`), themed trivia packs, `crowd-target` spicy siblings; future `collab-one-word`/`fool`/`freestyle`/`collab-attribution` (need a text-mode param) |
| 4 | **SECRET_ROLE** | `secret-role` | `1` | @2 (`accusation` mode) | `double-jeu` | the canonical Impostor flagship (a config + `elimination`/`clue` mode), NPC Infiltrator (`secretKind:'directive'`), Undercover reskins |
| 5 | **TRUTH_DARE** | `truth-dare` | `2` | @2 (`allowedChoices`/`escapeMode`/`labels`) | `truth-or-dare-2` (fun + lover siblings), `truth-or-drink` (+ `truth-or-forfeit` sibling) | any tone/age/theme ToD pack, "never have I ever"-style escape variants — pure Cadence B |
| 6 | **SPOTLIGHT_GUESS** | `spotlight-guess` | `1` | v1 (`scale`, `reverse-question`) | `jeu-de-la-note` (+ `la-roue` config rider), `devine-la-question` | hot-seat (`predict-subject` mode, §2.1), themed scales, 2-tier "sprint" configs, spicy scale packs |
| 7 | **PERFORM_JUDGE** | `perform-judge` | `1` | v1 (`guided`/`credit`/`puppet`/`rate`) | `devine-l-action`, `devine-l-objet`, `mime-inverse`, `double-le-mouvement` | "Name 3 in 5s"/blitz (`promptVisibility:'all'` verdict, §2.3), charades/emotions/jobs/songs/air-band packs — the whole performance family |
| 8 | **LAST_STANDING** | `last-standing` | `1` | v1 | `jeu-du-theme` | 18+ theme packs, category-survival reskins — config-only |
| 9 | **RULE_HUNT** | `rule-hunt` | `1` | v1 | `trouvez-la-regle` | future rule-deck packs (gesture/verbal/social), difficulty-tiered configs — config-only |
| 10 | **NIGHT_DAY** | `night-day` | `1` | v1 | `loup-garou` | mafia / vampire / space-crew reskins (role-card + narration packs) — pure config+pack |

**Net:** 10 modules back 17 shipped configs and a long tail of config-only future tiles. The only named-but-unbuilt module in the entire corpus is **RANKING** (§2.2).

### 1.2 Why exactly these 10 (consolidation receipts)

The wave-2 raw designs proposed **8 new templates**; the consolidation (wave-2 §3.1) collapsed them to **5 new modules**, which — added to the 5 pre-wave-2 archetypes that survived (`tracer`/VOTE@1, `option-vote`/VOTE@2, `input-guess`, `secret-role`, `truth-dare`) — gives the shipped 10. The collapses that hold:

- **PERFORM_JUDGE** absorbed `PERFORM_RATE` + `TIMED_VERDICT` + `PERFORM_GUESS` (4 games on one module, 3 adjudication resolvers behind a `mode` + `promptVisibility` + `adjudication` axis — confirmed in `perform-judge/src/state.ts`: `mode: 'guided'|'credit'|'puppet'|'rate'`).
- **SPOTLIGHT_GUESS** absorbed `SCALE_GUESS` + `REVERSE_GUESS` (confirmed: `mode: 'scale'|'reverse-question'`).
- **LAST_STANDING / RULE_HUNT / NIGHT_DAY** stayed single-game modules — each has an outer machine (elimination + decaying clock; pausable banked clock; sequential role-gated night sub-phases) that no other module shares; forcing them together would bloat shared state for zero reuse (wave-2 §3.3). Upheld.

### 1.3 The two non-module archetypes the corpus names but did NOT ship

| Named archetype | Status | Ruling |
|---|---|---|
| **RANKING** (rank-friends) | **Designed, module never built** | ROADMAP — build it; it is real new code (§2.2, §5 P2). Last genuine code gap. |
| **HOT_SEAT** (hot-seat) | **Designed as a standalone module, never built** | **CUT the standalone module idea**; re-home the mechanic as a `spotlight-guess` `predict-subject` mode (§2.1). |

### 1.4 Version-axis disambiguation (so "VOTE@2" never gets confused with `version:2`)

There are **three** independent integers; the design corpus' `@N` suffix is the *param-generation* one, which is NOT the `GameModule.version`:

- **`GameModule.version`** (code identity; bumped only on reducer/contract change; the shell registry keys on `${id}@${version}`). Shipped values: `tracer@1`, `option-vote@1`, `input-guess@1`, `secret-role@1`, `truth-dare@2`, `spotlight-guess@1`, `last-standing@1`, `rule-hunt@1`, `night-day@1`, `perform-judge@1`. (Only `truth-dare` is at `version:2`, because its @2 param surface shipped as a single version-2 module — see `truth-dare/src/truth-dare.ts`.)
- **Param-generation `@N`** (design shorthand: "VOTE@2" = the option-ballot+debate param surface; "SECRET_ROLE@2" = accusation mode). This is a *params* concept; in a fresh greenfield module it can ship at `GameModule.version:1` with the full param surface (which is exactly what `option-vote@1`, `secret-role@1` did — they were *born* with the "@2" params).
- **ContentPack.version** (content identity; immutable per R2 object; bumped on every pack edit).

**Ruling:** a `game_config` always pins both the `templateVersion` range (code) and the `contentPackRef.version` (content). The colloquial `@N` is documentation only and must never be read as a `GameModule.version`. This kills the single biggest cross-doc confusion.

---

## 2. Retire-or-roadmap: the original designed-but-never-built games

Three games were designed (or vision-named) before wave 2 and never shipped a config/module. Each gets a definite ruling: **build on which shipped template, at what cost, or formally cut.**

### 2.1 `hot-seat` → BUILD as `spotlight-guess` `predict-subject` mode (~3–4 days). Standalone HOT_SEAT module CUT.

- **Design:** `2026-06-10-game-hot-seat-design.md` — rotating spotlight player answers a question about *themselves* (secret); everyone else predicts; guessers score for matching, the spotlight scores for being read right. Phases `answer → reveal → scoreboard → over`, seat rotation, `0|1` binary hidden answer.
- **Shipped reality:** **no HOT_SEAT module, no hot-seat config.** But `spotlight-guess` (SPOTLIGHT_GUESS) ships with *exactly* this skeleton: rotating spotlight holding a per-round secret, a spotlight-prep phase, a hidden guess buffer with `allActed` early-resolve, a **spotlight read-bonus**, void-on-spotlight-leave, scoreboard cadence (`spotlight-guess/src/state.ts`, design §3.3).
- **Ruling — BUILD, do not cut.** Add a third SPOTLIGHT_GUESS mode `predict-subject`: the spotlight's secret is their own multiple-choice self-answer (a `0|1` or small-N pick instead of a number/`realIndex`); guessers converge on it; scoring = guessers +X for matching, spotlight +Y per correct reader. This is the same hidden-buffer + read-bonus machine with a new reveal resolver and a "self-answer" prep beat. **No HOT_SEAT module.** A standalone module duplicates SPOTLIGHT_GUESS's rotation + buffer + read-bonus for one game — the exact sprawl the template-architecture doc exists to prevent.
- **Cost:** ~3–4 days (one new mode resolver + a self-answer prep variant + a client reveal component), then config-only for hot-seat variants ("Hot Seat: Couples", "Hot Seat: Work Crew" = packs). Players 3–16 (the design's floor, degenerate at 2). Category: **deduction/party** (self-knowledge social).
- **Open call:** whether the spotlight reads a free *multiple-choice* (cleanest, zero text) or a typed answer (richer, needs the text-moderation surface). Recommendation: multiple-choice for v1 — keeps SPOTLIGHT_GUESS text-free and matches the design's `0|1` answer shape.

### 2.2 `rank-friends` → BUILD the `RANKING` module (~1 week). Roadmap, not cut.

- **Design:** `2026-06-10-game-rank-friends-design.md` — privately rank your top-3 friends on a prompt; Borda-weighted aggregate; multi-beat 3rd→2nd→1st podium reveal. Players 3–16, default 5 rounds.
- **Shipped reality:** **no RANKING module, no rank-friends config.** This is the ONE designed-and-named template whose module was never built and which is **genuinely new code** — a Borda ballot + ordered-ballot reduction is not a config of VOTE (single vote), option-vote (A/B), or any shipped module. It is correctly its own archetype (template-architecture §3 keeps VOTE and RANKING distinct: "rank-friends is a *Borda ballot*, not a single vote").
- **Ruling — BUILD `RANKING` (the last module gap).** Priced ~1 week (closest-to-tracer skeleton; hidden ordered-ballot buffer; multi-beat reveal proven by the podium pattern). It is the highest-value single module build remaining because it (a) ships rank-friends, the wave-1 flagship that never landed, and (b) unlocks the vision's **"Guess My Rank"** family. Guess My Rank's *basic* ego-criterion ranking is then config-only; its signature **perception-gap** scoring (self-rank vs group-rank) needs a `RANKING@2` `scoring:'borda'|'perception-gap'` + `selfRankAllowed` param (template-architecture §3.2 ⚠#4) — schedule that as a fast-follow, not a launch blocker.
- **Cost:** ~1 week module + then config-only for every ranking prompt pack and Guess My Rank basic. Category: **party** (opinion/social). 3–16.

### 2.3 `Name 3 in 5s` / blitz → BUILD as `perform-judge` `blitz` config (~1–2 days). Double-claim already ruled.

- **Source:** vision concept (`games_ideas.md` "Name 3 in 5s"); double-claimed by mime-inverse (as `TIMED_VERDICT`) and jeu-du-theme (as LAST_STANDING "elimination off"). Wave-2 §5.5 ruled it; this doc ratifies and closes it.
- **Ruling — BUILD as a PERFORM_JUDGE config + a `promptVisibility:'all'` param branch.** Blitz = spotlight + **public** prompt + 5 s timer + peer-tap **verdict** → PERFORM_JUDGE with `mode:'blitz'` (or reuse `guided`'s verdict resolver), `promptVisibility:'all'`, `adjudication:'verdict'`, `performMs:5000`. The shipped `perform-judge` already has `promptVisibility` as a first-class redaction axis and `adjudication:'verdict'` as a resolver (`perform-judge/src/state.ts`), so the marginal work is small: add the `'all'` visibility value's view branch + a `blitz` config. **This closes template-architecture §7 Q1:** INPUT_GUESS stays numeric/text-only (`closest-number`, `crowd-target`, future `collab-*`); the timed-verdict family is PERFORM_JUDGE's. LAST_STANDING's claim is rejected — blitz has no elimination loop.
- **Cost:** ~1–2 days (one `promptVisibility:'all'` view branch + config + a "name N things" prompt pack). Category: **performance/party**, standup, ~5 s/turn. 3–16.

### 2.4 Summary of the three rulings

| Original game | Verdict | Built on | Cost | New module? |
|---|---|---|---|---|
| `hot-seat` | **ROADMAP** | `spotlight-guess` `predict-subject` mode | ~3–4 days | No (re-homed; standalone HOT_SEAT cut) |
| `rank-friends` | **ROADMAP** | **new `RANKING` module** | ~1 week | **Yes — the only remaining module gap** |
| `Name 3 in 5s` / blitz | **ROADMAP** | `perform-judge` `blitz` config | ~1–2 days | No (config + `promptVisibility:'all'` branch) |

Nothing is formally cut except the *idea of a standalone HOT_SEAT module*. All three games remain on the roadmap; none is dead.

---

## 3. The full catalog table (18 games + 3 Brand-Book modes)

"18 games" = the **17 shipped wave-2 configs** + the **1 zero-cost `who-s-most-likely` tracer tile** decided in §1 (Decision 3). The 3 Brand-Book modes (§4) are listed separately as the next config-only wave. Player counts, spicy tier, session length and physical mode are taken from the wave-2 per-game designs and the final configs.

### 3.1 Shipped + P0 catalog (18 tiles)

| # | Config id | Name (FR / EN) | Module (archetype) | Category | Players | Spicy tier | Session length | Physical | Status |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `who-s-most-likely` | Qui de vous… / Most Likely To | `tracer` (VOTE@1) | party | 2–16 | 0 | ~3 min (7×) | seated | **P0 — ship (pack-only)** |
| 2 | `pires-potes` | Pires Potes / Worst Mates | `tracer` (VOTE@1) | party | 3–16 | 0 / 1 (18+ flagship + soft sibling) | ~3 min (7×) | seated | SHIPPED config |
| 3 | `tu-preferes` | Tu Préfères ? / Would You Rather | `option-vote` (VOTE@2) | party | 3–16 | 0 | ~4 min (8×) | seated | SHIPPED |
| 4 | `gauche-ou-droite` | De gauche ou de droite ? / Left-Coded or Right-Coded? | `option-vote` (VOTE@2) | party | 3–16 | 0 | ~7 min (7× + debate) | seated | SHIPPED |
| 5 | `quizz-culture-ge` | Au Pif ! / Ballpark! | `input-guess` (closest-number) | trivia | 2–16 | 0 | ~4 min (8×) | seated | SHIPPED |
| 6 | `cinquante-cinquante` | Cinquante-Cinquante / Fifty-Fifty | `input-guess` (crowd-target) | trivia/party | 2–16 | 0 | ~4 min (7×) | seated | SHIPPED |
| 7 | `double-jeu` | Double Jeu / Double Agent | `secret-role` (accusation) | deduction | 4–16 | 0 | ~12 min (3 matches) | seated | SHIPPED |
| 8 | `truth-or-dare-2` (fun) | Action ou Vérité — Fun / Truth or Dare — Fun | `truth-dare` | party/spicy | 2–16 | 0 / 1 | ~5 min (3 laps) | mixed | SHIPPED |
| 8b | `truth-or-dare-2` (lover) | …Lover | `truth-dare` | spicy | 2–8 | 2 (18+) | ~6 min (4 laps) | mixed | SHIPPED (lover gated on legal sign-off) |
| 9 | `truth-or-drink` | Vérité ou tu bois / Truth or Drink | `truth-dare` (escape) | spicy | 2–16 | 2 (18+) + safe sibling | ~5 min (2 laps) | seated | SHIPPED |
| 10 | `devine-l-action` | Devine l'Action / Guess the Action | `perform-judge` (guided) | performance | 3–16 | 0 | ~5 min (2 laps) | standup | SHIPPED |
| 11 | `jeu-de-la-note` | La Note / On a Scale | `spotlight-guess` (scale) | party | 3–16 | 0 | ~5 min (8×) | seated | SHIPPED |
| 12 | `devine-la-question` | Devine la Question / Guess the Question | `spotlight-guess` (reverse-question) | trivia/party | 3–16 | 0 | ~5 min (6×) | seated | SHIPPED |
| 13 | `double-le-mouvement` | Double le Mouvement / Dub the Move | `perform-judge` (rate, crew 2) | performance | 4–16 | 0 | ~4 min (1 lap) | standup | SHIPPED |
| 14 | `mime-inverse` | Mime Inversé / Reverse Mime | `perform-judge` (puppet) | performance | 3–16 | 0 | ~4 min (1 lap) | mixed | SHIPPED |
| 15 | `jeu-du-theme` | Le Jeu du Thème / Last Word Standing | `last-standing` | party | 3–16 | 0 | ~9 min (3 manches) | mixed | SHIPPED |
| 16 | `devine-l-objet` | Devine l'Objet / Guess the Object | `perform-judge` (credit) | performance | 3–16 | 0 | ~5 min (2 laps) | mixed | SHIPPED |
| 17 | `trouvez-la-regle` | Trouvez la Règle / Find the Rule | `rule-hunt` | deduction | 4–16 | 0 | ~14 min (3 rounds) | mixed | SHIPPED |
| 18 | `loup-garou` | Loup-Garou / Werewolf | `night-day` | deduction | 5–16 | 0 | ~10–15 min/match | seated | SHIPPED |

Counting the lover sibling as 8b, this is 18 distinct top-level tiles. Spicy-tier column uses the brand-book tiers (0 = all-ages, 1 = edgy/party, 2 = 18+). Sources: wave-2 §1 recap + each config in `docs/designs/final/games/*`.

### 3.2 Category roll-up (after P0 + the 18 above)

| Category | Tiles | Tiles (ids) |
|---|---|---|
| party | 6 | who-s-most-likely, pires-potes, tu-preferes, gauche-ou-droite, jeu-de-la-note, jeu-du-theme |
| performance | 4 | devine-l-action, double-le-mouvement, mime-inverse, devine-l-objet |
| deduction | 4 | double-jeu, trouvez-la-regle, loup-garou, (+ hot-seat when built) |
| trivia | 3 | quizz-culture-ge, cinquante-cinquante, devine-la-question |
| spicy | 3 | truth-or-dare-2 (fun/lover), truth-or-drink (+ spicy siblings of party games) |

(`spicy` is a tone tier orthogonal to mechanic category; counted here as a launch shelf. A game can be both "party" by mechanic and surface a "spicy" sibling.)

---

## 4. The 3 Brand-Book modes — all covered by shipped modules (no new code)

The Brand Book proposed three never-designed modes. Each maps onto a shipped module; **none requires a new module.**

| Brand-Book mode | Type | Module (archetype) | How | Cost |
|---|---|---|---|---|
| **Who Said That?** | INPUT_GUESS + VOTE | `input-guess` + `option-vote` | Players submit an anonymous text answer to a prompt (INPUT_GUESS text buffer, the same `collab-one-word`/text path), then the room **votes/attributes** who wrote which (VOTE beat). Cleanest single-module fit: a new INPUT_GUESS `collab-attribution` mode (submit text → reveal → attribute via the hidden buffer). | new INPUT_GUESS text-mode param (~3–4 days, gated on the gameplay-text moderation surface) |
| **Courtroom** | VOTE | `option-vote` (VOTE@2) | A "case" prompt + a debate beat + a guilty/not-guilty (or option) ballot — exactly VOTE@2's `ballotKind:'options'` + `debateMs`. | **config + pack only (0 code)** |
| **Red Flag / Green Flag** | VOTE / debate | `option-vote` (VOTE@2) | Item card → binary red/green ballot → debate beat → majority-herd or predict-majority scoring. This is `gauche-ou-droite`'s exact param shape with a red/green axis pack. | **config + pack only (0 code)** — a sibling of gauche-ou-droite |

**Ruling:** Courtroom and Red/Green Flag are **immediate config-only tiles** (the cheapest brand-book wins, same tier as P0). Who Said That? is the one that needs the INPUT_GUESS text mode + the moderation path — schedule it with the first gameplay-text feature. None expands the module set.

---

## 5. What's cheap to add next — the reuse-gradient pipeline (ranked)

Ranked by **reuse gradient** = (value delivered) ÷ (new reducer code). Top of the list is "pure content op, zero deploy"; bottom is "one new module." This is the canonical "cheap next" ordering.

| Rank | Item | Module(s) | Code cost | What it unlocks | Deploy? |
|---|---|---|---|---|---|
| **P0** | `who-s-most-likely` classic tile | `tracer` (VOTE@1) | **0 (pack only)** | The flagship onboarding tile; proves Cadence B end-to-end | No |
| **P0** | **Courtroom**, **Red/Green Flag** | `option-vote` (VOTE@2) | **0 (config + pack)** | 2 brand-book tiles; the option-ballot family compounds | No |
| **P1** | Spicy / themed siblings of any shipped game | all modules | **0 (config + pack)** | "after-dark" `tu-preferes`, `pires-potes` soft, `la-roue` scale, mafia/vampire `loup-garou` reskins, ToD theme packs | No |
| **P1** | Pass the Bloop (option-reveal) | `option-vote` (VOTE@2) | **0–1 day** (revealStyle already in family) | The viral "pass the phone" tile | Maybe |
| **P2** | **`RANKING` module** (rank-friends) | **new** | **~1 week** | rank-friends + Guess My Rank basic (then `RANKING@2` perception-gap fast-follow) | Yes (Cadence A) |
| **P3** | hot-seat (`predict-subject` SPOTLIGHT_GUESS mode) | `spotlight-guess` | **~3–4 days** | hot-seat + "couples/work-crew" packs; a whole self-knowledge family | Yes (small) |
| **P3** | NPC Infiltrator | `secret-role` | **~2–3 days** (`secretKind:'directive'` param + pack) | The vision's group-directive deduction game | Yes (small) |
| **P3** | Canonical Impostor flagship | `secret-role` | **~2–3 days** (`elimination`/`clue` mode params + word-pair pack) | The wave-1 flagship as a proper tile (currently only `accusation`/double-jeu ships) | Yes (small) |
| **P4** | "Name 3 in 5s" / blitz | `perform-judge` | **~1–2 days** (`promptVisibility:'all'` branch + config) | The blitz/timed-verdict family; "name N things" packs | Yes (small) |
| **P5** | Who Said That? | `input-guess` (+ `option-vote`) | **~3–4 days** (`collab-attribution` text mode) | Brand-book mode + the first gameplay-text social game | Yes |
| **P6** | Guess My Rank (perception-gap) | `RANKING@2` | **~3–4 days after P2** | The vision's signature self-vs-group mechanic | Yes |

**Reading the gradient:** the platform's design has front-loaded almost all reducer cost into the 10 shipped modules. From here, **P0–P1 are pure content ops (zero deploy)** — the catalog can roughly double in tiles before any new code ships. The single most valuable *code* investment remaining is **`RANKING` (P2)**, the last module gap; everything below it is a small additive param branch on a shipped module. There is **no game on any roadmap that requires an 11th module beyond `RANKING`.**

---

## 6. Consistency ledger (what this doc reconciled)

- **"5 vs 6 vs 10 templates":** resolved → **10 shipped modules** (§1). The "5"/"6" were honest *pre-wave-2* counts; this doc supersedes them as catalog facts.
- **`@N` suffix vs `GameModule.version`:** resolved → §1.4. `truth-dare` is the only module at `version:2`; "@2" elsewhere = param generation, not code version.
- **hot-seat HOT_SEAT module:** resolved → cut the standalone module, re-home as SPOTLIGHT_GUESS `predict-subject` (§2.1).
- **rank-friends / RANKING:** resolved → the one remaining module to build (§2.2).
- **blitz double-claim + template-architecture §7 Q1:** resolved → PERFORM_JUDGE `blitz`; INPUT_GUESS stays text/numeric only (§2.3).
- **Brand-book trio:** resolved → all on shipped modules; 2 are config-only today (§4).
- **`tracer` has no tile:** resolved → ship `who-s-most-likely` (P0) so the reference VOTE@1 module isn't a module-without-a-tile.

---

## Open product calls (with my recommendation)

1. **hot-seat answer surface — multiple-choice or typed?** A typed self-answer is richer but pulls SPOTLIGHT_GUESS into the gameplay-text moderation surface (it is text-free today). **Recommendation: multiple-choice for v1** (matches the design's `0|1` answer shape, keeps SPOTLIGHT_GUESS text-free); revisit typed once Who Said That? has hardened the text path.
2. **`RANKING` now or after the spicy/brand-book content wave?** P2 is the only ~1-week code item; everything P0–P1 is content-only. **Recommendation: ship P0–P1 content tiles first (immediate catalog growth, zero deploy), then `RANKING` as the next code sprint** — it both lands the wave-1 flagship and unlocks Guess My Rank, the highest combined value of any remaining build.
3. **Canonical Impostor flagship as its own tile?** Today only the `accusation`/`double-jeu` config ships on `secret-role`; the structured clue-bluffing Impostor flagship (the wave-1 design) is a `secret-role` config + an `elimination`/`clue` param branch that may not be wired yet. **Recommendation: ship it (P3) — it is the genre's flagship fantasy and ~2–3 days on a shipped module;** confirm the `elimination`/`clueMode:'turns'` params exist in `secret-role` before pricing (source shows v1 hard-codes `accusation`/`clueMode:'none'`).
4. **Guess My Rank perception-gap (`RANKING@2`) — build or launch basic Borda?** The perception-gap scoring is the vision's hook but is genuinely new scoring code. **Recommendation: launch Guess My Rank as basic ego-Borda first (config-only once `RANKING` exists), measure engagement, then greenlight `RANKING@2` perception-gap if the basic tile lands.**
5. **Spicy-sibling proliferation governance.** P1 (spicy/themed siblings) is "free" code-wise but each spicy tile carries store-compliance + age-gate + content-volume cost (cf. meta-03 spicy-and-age-gate). **Recommendation: cap the launch shelf at one spicy sibling per party game** until the age-gate/legal path (truth-or-dare lover, truth-or-drink) is signed off; don't let "config-only" mask the content + compliance bill.
6. **Public framing of "templates".** Marketing/vision copy still says "5 templates"; engineering ships 10 archetype modules. **Recommendation: keep "a handful of templates" as marketing copy, but make the 10-module inventory (§1) the single internal source of truth** so build planning never reasons from the round number.
