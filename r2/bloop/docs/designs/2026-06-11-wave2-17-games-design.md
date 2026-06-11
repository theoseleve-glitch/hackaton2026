# Wave 2 — 17 Games: Consolidated Design & Template Synthesis

**Date:** 2026-06-11
**Status:** Architecture decision — final synthesis of the wave-2 designs (source of truth for the wave-2 template set, game_configs and build order)
**Inputs:** co-founder brief of 2026-06-11 (17 game ideas); Brand Book v1.0 ("funny never cruel", Fun·Social·Expressive·Inclusive·Easy); raw structured designs in `docs/designs/wave2-raw/` (designs.json + by-game/*.json)
**Grounding:** `2026-06-10-cross-game-synthesis.md` (shared kit, phaseKey A1, conventions), `2026-06-10-template-architecture.md` (template = GameModule, game = game_config, Cadence A/B), the four wave-1 game designs (impostor, truth-or-dare, hot-seat, rank-friends), `packages/engine/src/types.ts` (GameModule contract), `packages/games/tracer/src/tracer.ts` (reference VOTE implementation)

> **Authority note.** This doc supersedes the per-game template proposals in `wave2-raw/` wherever they
> conflict (notably: the 8 proposed NEW templates collapse to 5; `devine-l-action` moves off
> TRUTH_DARE@2 onto the consolidated performance template; the "Name 3 in 5s" blitz double-claim is
> ruled). Everything else in the raw designs (content shapes, scoring, timers, sample items,
> redaction rules) is adopted as written and summarized here. No engine/contract amendments are
> requested beyond what wave 1 already approved (`phaseKey` A1 + the shared kit) — all 17 games fit
> `GameModule<S, A, V, C>` as-is.

---

## Section 1 — Recap table

| # | id | nameFr | nameEn | Template (post-consolidation) | Players | Round length | Spicy | Physical | New template? |
|---|---|---|---|---|---|---|---|---|---|
| 1 | gauche-ou-droite | De gauche ou de droite ? | Left-Coded or Right-Coded? | VOTE@2 (option ballot + debate) | 3–16 | ~57 s × 7 | 0 | seated | no (new params) |
| 2 | tu-preferes | Tu Préfères ? | Would You Rather | VOTE@2 (option ballot + predict) | 3–16 | ~30 s × 8 | 0 | seated | no (new params) |
| 3 | pires-potes | Pires Potes | Worst Mates | VOTE@1 (tracer as-is) | 3–16 | ~27 s × 7 | 1 (18+ flagship + soft sibling) | seated | no (pure config) |
| 4 | quizz-culture-ge | Au Pif ! | Ballpark! | INPUT_GUESS `closest-number` | 2–16 | ~32 s × 8 | 0 | seated | planned template, 1st mode |
| 5 | cinquante-cinquante | Cinquante-Cinquante | Fifty-Fifty | INPUT_GUESS `crowd-target` | 2–16 | ~37 s × 7 | 0 | seated | planned template, 2nd mode |
| 6 | double-jeu | Double Jeu | Double Agent | SECRET_ROLE@2 (accusation mode) | 4–16 | ~4 min/match × 3 | 0 | seated | no (new params) |
| 7 | truth-or-dare-2 | Action ou Vérité — Fun & Lover | Truth or Dare — Fun & Lover | TRUTH_DARE@1 | 2–16 (lover 2–8) | ~70 s/turn × 3 laps | 1 fun / 2 lover (18+) | mixed | no (pure config ×2) |
| 8 | truth-or-drink | VÉRITÉ OU TU BOIS | TRUTH OR DRINK | TRUTH_DARE@2 (escape mode) | 2–16 | ~45 s/turn × 2 laps | 2 (18+) + safe sibling | seated | no (new params) |
| 9 | devine-l-action | Devine l'Action | Guess the Action | **PERFORM_JUDGE** `guided` | 3–16 | ~75 s/turn × 2 laps | 0 | standup | yes (consolidated) |
| 10 | jeu-de-la-note | La Note | On a Scale | **SPOTLIGHT_GUESS** `scale` | 3–16 | ~81 s × 8 | 0 | seated | yes (consolidated) |
| 11 | devine-la-question | Devine la Question | Guess the Question | **SPOTLIGHT_GUESS** `reverse-question` | 3–16 | ~70 s × 6 | 0 | seated | yes (consolidated) |
| 12 | double-le-mouvement | DOUBLE LE MOUVEMENT | DUB THE MOVE | **PERFORM_JUDGE** `rate` (crew 2) | 4–16 | ~67 s/turn × 1 lap | 0 | standup | yes (consolidated) |
| 13 | mime-inverse | Mime Inversé | Reverse Mime | **PERFORM_JUDGE** `puppet` | 3–16 | ~45 s/turn × 1 lap | 0 | mixed | yes (consolidated) |
| 14 | jeu-du-theme | Le Jeu du Thème | Last Word Standing | **LAST_STANDING** | 3–16 | ~3 min/manche × 3 | 0 | mixed | yes |
| 15 | devine-l-objet | Devine l'Objet | Guess the Object | **PERFORM_JUDGE** `credit` | 3–16 | ~60 s/turn × 2 laps | 0 | mixed | yes (consolidated) |
| 16 | trouvez-la-regle | Trouvez la Règle | Find the Rule | **RULE_HUNT** | 4–16 | ~4.5 min/round × 3 | 0 | mixed | yes |
| 17 | loup-garou | Loup-Garou | Werewolf | **NIGHT_DAY** | 5–16 | ~220 s/cycle, 10–15 min/match | 0 | seated | yes |

Consolidated NEW templates: **PERFORM_JUDGE** (4 games), **SPOTLIGHT_GUESS** (2 games), **LAST_STANDING**, **RULE_HUNT**, **NIGHT_DAY** — 5 new modules for 9 games, plus the already-planned **INPUT_GUESS** gaining two zero-text modes for 2 more. The remaining 6 games are configs / small param riders on VOTE, TRUTH_DARE and SECRET_ROLE. See Section 3.

---

## Section 2 — Per-game designs

### 2.1 `gauche-ou-droite` — De gauche ou de droite ? / Left-Coded or Right-Coded? — VOTE@2

**Mechanic.** A meme-format judgment vote: an item card (raclette, e-scooters…) fills every screen; players secretly vote which of two pack-defined axis sides it belongs to; atomic reveal shows the split with avatars; majority voters score; a timed debate beat (with a pack-authored one-liner as fuel) follows before the next item. Phones vote, the room argues.

**Phases.**

| Phase | Duration | Beat |
|---|---|---|
| `vote:r{n}` | 15 s | secret two-option vote into a HIDDEN buffer; early-resolve on allActed(connected); timeout = non-voters score 0 |
| `reveal:r{n}` | 7 s | atomic split bars + avatar chips per side, majority crowned, +1 animation; exact tie = "Égalité parfaite" sticker, no points; emits `round_revealed` |
| `debate:r{n}` | 35 s | debateStarter one-liner + countdown; talking is IRL; ends early when > 50 % of connected players tap "On passe"; emits `round_completed` at the boundary |
| `over` | untimed | scoreboard; winner = "le plus dans le sens du vent"; non-scoring "Contrarian" superlative from minorityCount; cloned gameOver scores |

**Params.**

```json
{ "ballotKind": "options", "scoring": "majority-herd", "totalRounds": 7,
  "voteMs": 15000, "revealMs": 7000, "debateMs": 35000, "debateSkipThreshold": 0.5,
  "anonymousVotes": false, "pointsMajority": 1, "pointsTie": 0 }
```

**Content item.** `{ id, text:{fr,en} (≤80 chars noun phrase), emoji, category: food|lifestyle|tech|culture|sport|behavior, spicyLevel: 0|1|2, debateStarter:{fr,en} (≤120 chars, never real parties/politicians) }` + pack-level `axis: { left:{fr,en}, right:{fr,en} }` (default FR "De gauche"/"De droite", EN "Left-coded"/"Right-coded"; sibling packs can mint non-political axes config-only). Single-locale runtime packs (`gauche-droite-fr`/`-en`), items culturally native per locale (NOT 1:1 translated). Sizing: ≥ 7 items per allowed spicy tier.

**Sample items.**

```json
[{ "id": "raclette", "text": { "fr": "La raclette", "en": "Raclette night" }, "emoji": "🧀",
   "category": "food", "spicyLevel": 0,
   "debateStarter": { "fr": "Un fromage qu'on partage entre potes… mais à 14 € la demi-meule.",
                      "en": "Cheese you share with the squad… at private-club prices." } },
 { "id": "trottinette-electrique", "text": { "fr": "Les trottinettes électriques", "en": "E-scooters" },
   "emoji": "🛴", "category": "tech", "spicyLevel": 0,
   "debateStarter": { "fr": "Écolo dans le discours, abandonnée en travers du trottoir dans les faits.",
                      "en": "Green in theory, abandoned across the sidewalk in practice." } },
 { "id": "croissant-au-beurre", "text": { "fr": "Le croissant au beurre", "en": "A butter croissant" },
   "emoji": "🥐", "category": "food", "spicyLevel": 0,
   "debateStarter": { "fr": "Patrimoine du peuple ou petit plaisir de bourgeois ?",
                      "en": "Heritage of the people or a bougie little treat?" } }]
```

**Scoring (exact).** Count L and R over SUBMITTED votes only. Strict majority side → each of its voters +1 (`pointsMajority`); exact tie (incl. zero votes) → 0 for all + tie splash; timeout non-voters always 0. Non-scoring `minorityCount` incremented for minority voters → end-screen "L'esprit contraire / The Contrarian" superlative (display-only, never negative points).

**Recommendations (co-founder's open questions).**
- *EN cultural adaptation of left/right humor:* use the native form of the same meme — "Left-coded / Right-coded" axis labels + a fully localized EN item set (oat-milk lattes, lifted pickups, golf, brunch); ship as sibling pack `gauche-droite-en`, stage at rolloutPct 5. A 1:1 translation of "la raclette" lands flat; "-coded" carries the identical playful judgment without real party politics.
- *Does the vote score?* Yes — herd scoring (read the room), per above. Minority is never penalized: being the lone "croissants are right-coded" weirdo is a badge.
- *Votes public at reveal?* Public by default (avatar chips) — "WHO voted that?!" is the debate fuel; `anonymousVotes` param reserved for future spicy packs.
- *Debate end without blocking:* hard 35 s deadline + early exit when > 50 % of CONNECTED players tap "Next" (quorum over the connected-filtered set, synthesis §1.3).
- *VOTE as-is or extension?* VOTE@2 with `ballotKind:'options'`, `debateMs` (0 disables the phase), and the majority-scoring branch — bundle with the planned `revealStyle`/`selfVoteAllowed` generalization. "New-params, small" (~1–2 days); permanently unlocks the binary-judgment family config-only.
- *"What the internet thinks" % at reveal?* Defer to v2; if wanted, a pre-computed `crowdPct` per item via the offline pipeline (never at runtime).

**Risks.** Political-divisiveness drift (hard editorial rule: objects/foods/behaviors only, never parties/politicians/elections; pack safety gate + human playtest). Not zero-code (VOTE@2 must land first). Even-sized rooms tie often (acceptable joke; monitor tie rate, consider tie=+1-to-all param if > ~30 %). Debate dead-air with shy groups (debateStarter + majority-skip; playtest 35 s). Trend decay (monthly pack refresh via KV versioning). EN meme-transfer uncertainty (staged rollout; non-political sibling axis "Boomer-coded / Gen Z-coded" as pure-content fallback).

---

### 2.2 `tu-preferes` — Tu Préfères ? / Would You Rather — VOTE@2

**Mechanic.** Classic would-you-rather with a prediction layer: each player makes two taps in one phase — their own pick (A/B) AND their prediction of the room's majority — submitted as one atomic hidden action. The reveal shows the split with names (debate fuel); points go ONLY to correct majority-predictions, so your own pick stays pure honest expression.

**Phases.**

| Phase | Duration | Beat |
|---|---|---|
| `choose:r{n}` | 15 s | dilemma card A vs B; one atomic action `{ pick, predict }` into the HIDDEN buffer; early-advance on allActed(connected); timeout = non-submitters excluded, shown "asleep" |
| `reveal:r{n}` | 15 s | atomic bar-race split + avatars under each option; +1 badges on correct predictors; perfect tie → "PERFECT SPLIT" banner, no points; emits `round_completed` |
| `over` | untimed | podium; "Oracle of the group" crown; cloned gameOver scores; placement → session XP |

**Params.**

```json
{ "ballotKind": "options", "scoring": "predict-majority", "totalRounds": 8,
  "chooseMs": 15000, "revealMs": 15000, "predictCorrectPoints": 1,
  "tiePolicy": "no-points-split-banner", "revealStyle": "bar-race", "publicPicks": true }
```

**Content item.** One dilemma: `{ id, optionA:{fr,en} (≤90 chars, completes "Tu préfères…"), optionB:{fr,en} (comparably attractive/awful), category: absurd|food|social|deep|spicy, spicyLevel: 0|1|2, tags? }`. No pre-computed AI values (the majority is the room's own votes). Single-locale packs `tu-preferes-fr`/`-en`; pool ≥ 3 × totalRounds per category mix (~200+ items).

**Sample items.**

```json
[{ "id": "wyr-sausage-fingers",
   "optionA": { "fr": "Avoir des saucisses cocktail à la place des doigts", "en": "Have cocktail sausages for fingers" },
   "optionB": { "fr": "Transpirer de la mayonnaise", "en": "Sweat mayonnaise" },
   "category": "absurd", "spicyLevel": 0, "tags": ["classic", "gross-funny"] },
 { "id": "wyr-history-vs-gallery",
   "optionA": { "fr": "Que tes potes lisent tout ton historique de recherche", "en": "Your friends read your entire search history" },
   "optionB": { "fr": "Que tes parents fassent défiler toute ta galerie photos", "en": "Your parents scroll through your whole camera roll" },
   "category": "social", "spicyLevel": 0, "tags": ["phone", "embarrassing", "debate-starter"] },
 { "id": "wyr-animals-vs-languages",
   "optionA": { "fr": "Pouvoir parler avec les animaux", "en": "Be able to talk to animals" },
   "optionB": { "fr": "Parler couramment toutes les langues du monde", "en": "Speak every human language fluently" },
   "category": "deep", "spicyLevel": 0, "tags": ["superpower", "classic", "debate-starter"] }]
```

**Scoring (exact).** Majority = option with STRICTLY more submitted picks. Every player whose `predict` equals the majority gains +1. Your own pick never scores. Perfect tie → nobody scores + celebration banner. Timeout non-submitters → 0.

**Recommendations.**
- *Which scoring model (brief's open ask)?* Predict-the-majority, exactly as above. Rejected: majority-conformity (punishes hot takes, incentivizes lying), minority-reward (fake contrarianism), contrarian-oracle bonus (perverse incentive). Predict-majority is the only model where total honesty about your own pick is dominant while adding a real skill axis — knowing your friends.
- *Tie handling:* nobody scores; loud celebratory "PERFECT SPLIT" (a perfectly divisive dilemma is content success).
- *Public or anonymous picks:* public with names ("TOI t'as choisi ça ?!"); `publicPicks` param future-proofs 18+ packs.
- *Zero-code?* Almost — needs VOTE@2 `ballotKind:'options'` + `scoring:'predict-majority'` (second field in the hidden buffer). ~1–2 days, lands with the same VOTE@2 bundle as gauche-ou-droite. After that, every variant is pure Cadence B.
- *One phase or split pick/predict:* one phase, one atomic action, two-tap UI (second tap auto-submits) — halves timer overhead, single allActed check.
- *minPlayers:* config-tighten to 3 (at 2, prediction collapses to "do we agree?").
- *Streaks:* defer to v2 (param-gated fire-streak +1 every 3rd consecutive correct).
- *Spicy:* launch classic-only; `tu-preferes-spicy` sibling config later (tone spicy, minAge 18, separate packs, `publicPicks:false`).

**Risks.** Needs VOTE@2 before shipping. Even player counts tie often (score-starved nights at 4 players — monitor, v2 streak as compensation). Two decisions in 15 s = tap friction (UI must make it one fluid gesture). Fixed 15 s reveal can cut a great debate short (future hostTunable). Content balance is everything (lopsided dilemmas kill both prediction and debate). Redaction: picks AND predictions hidden until reveal, owner-echo only, views expose hasSubmitted flags only — never partial counts (else stall-to-peek breaks the prediction game).

---

### 2.3 `pires-potes` — Pires Potes / Worst Mates — VOTE@1 (pure config)

**Mechanic.** Designation voting, tracer machinery unchanged: a "Qui serait capable de… / Who would…" card appears on all phones; everyone votes one OTHER player; the player(s) with the most fingers pointed at them "win the shame card" (+1, framed as a comedic WIN). Highest total after 7 rounds is crowned "Le Pire Pote".

**Phases.**

| Phase | Duration | Beat |
|---|---|---|
| `vote:r{n}` | 20 s | simultaneous card; tap exactly one other player; self-votes rejected; re-vote until lock (last tap wins, tracer semantics); early-resolve all-voted; timeout drops missing votes |
| `reveal:r{n}` | 7 s | instant tally; every player at max tally (max ≥ 1) gets +1 with celebratory sticker; ties all score; auto-advance |
| `over` | untimed | podium crowns the Worst Mate (ties share); cloned gameOver scores; instant rematch with fresh seed |

**Params.**

```json
{ "totalRounds": 7, "revealStyle": "instant", "selfVoteAllowed": false,
  "voteMs": 20000, "revealMs": 7000 }
```

**Content item.** Authoring master: `{ id, text:{fr,en} (≤140 chars, always designates a person present), spicy: 0|1|2, tags? }` — 100 % original writing (zero text reuse from "Amis de merde"), transcreated per locale. Publish splits into `pires-potes-fr`/`-en`; runtime data collapses to the VOTE module's existing `{ prompts: string[] }` — **tracer consumes it unchanged**.

**Sample items.**

```json
[{ "id": "pp-014", "text": { "fr": "Qui oublierait l'anniversaire de sa propre mère mais jamais un happy hour ?",
   "en": "Who would forget their own mom's birthday but never a happy hour?" }, "spicy": 0, "tags": ["famille", "soiree"] },
 { "id": "pp-058", "text": { "fr": "Qui vendrait LA photo dossier du groupe pour 50 balles, sans négocier ?",
   "en": "Who would sell the group's most embarrassing photo for 50 bucks, no haggling?" }, "spicy": 0, "tags": ["argent", "trahison"] },
 { "id": "pp-112", "text": { "fr": "Qui draguerait l'ex d'un pote en mode « techniquement, c'est plus son ex » ?",
   "en": "Who would flirt with a friend's ex like 'technically they're single now'?" }, "spicy": 1, "tags": ["amour", "trahison"] }]
```

**Scoring (exact).** Tracer's exact resolver: all players tied at the max tally (max ≥ 1) get +1; zero votes cast → nobody scores, round advances. Final ties share the crown.

**Recommendations.**
- *Name (brief asks 2–3 FR candidates, distinct from "Amis de merde"):* "Pires Potes" (picked; matches the id, alliterative, lexically distant from the trademark). Alternates: "Potes Pourris", "Sales Potes".
- *Win condition (original is "first to 5 cards"):* v1 = fixed 7 rounds (~3 min, fits ad cadence + rematch loop); a `targetScore` VOTE@2 param later for the faithful classic mode.
- *Rotating card-drawer?* Dropped — adds no decision and a rotating active player could stall the room. Simultaneous display is faster and faithful to the spirit.
- *Tie at max:* all tied get +1 (exact tracer behavior); no revote.
- *Reveal style:* instant for v1; A/B flip-one-by-one later (param already specced for Pass the Bloop).
- *Edgy tone vs brand + age gating:* TWO sibling configs — `pires-potes` (tone spicy, minAge 18, tiers 0+1) and `pires-potes-soft` (classic, all ages, tier 0 only); humor rewritten embarrassing/absurd, never identity/appearance/trauma.
- *Param surface gap:* grow `templateParamsSchema(VOTE)` with optional `voteMs`/`revealMs` (module already reads them); until then the game runs fine on tracer defaults, just 12 s slower per round.

**Risks.** Copyright/trade-dress (mechanic unprotectable, texts/name are: zero reuse + similarity audit pre-launch). Pile-on/bullying (designation framed as comedic win, tag-enforced variety, "funny never cruel" lint, pack kill switch). Spicy compliance (flagship is 18+; soft sibling is the default-surfaced tile). Small rooms tie a lot (celebrate co-winners). All-timeout round shows a "nobody voted" beat so it doesn't read as a bug. Humor must be transcreated, not translated.

---

### 2.4 `quizz-culture-ge` — Au Pif ! / Ballpark! — INPUT_GUESS `closest-number`

**Mechanic.** Trivia where nobody knows the answer: an off-beat culture-gé question with a verified NUMERIC answer ("shortest scheduled flight, in seconds?"); everyone secretly types an integer; all guesses pop onto a number line, the true answer slams in, closest takes the round. Guessing IS the game — no one is ever blocked by not knowing.

**Phases.**

| Phase | Duration | Beat |
|---|---|---|
| `guess:r{n}` | 20 s | numeric keypad (integers, ≤ 9 digits) into HIDDEN buffer `guesses`; owner echo only; early-advance on allActed(connected); timeout = no entry, 0 pts |
| `reveal:r{n}` | 12 s | atomic: guesses on an animated number line → true answer → points fly → bilingual funFact punchline; emits `round_completed` (ad-cue boundary) |
| `over` | untimed | podium; cloned gameOver scores; placement-based session XP |

**Params.**

```json
{ "mode": "closest-number", "totalRounds": 8, "guessMs": 20000, "revealMs": 12000,
  "pointsByRank": [100, 50, 25], "exactBonus": 50, "finalRoundMultiplier": 2,
  "bustIfOver": false, "maxInputDigits": 9, "earlyAdvanceOnAllSubmitted": true }
```

**Content item.** `{ id, question:{fr,en}, answer: integer (canonical verified truth — the ONLY scoring input, pre-computed offline), unit:{fr,en}|null, format:'plain'|'year', scale:'linear'|'log' (number-line rendering hint), funFact:{fr,en} (reveal punchline, doubles as answer justification), tags, difficulty:1|2|3, spicy, verifiedAt:'YYYY-MM', source (authoring-only) }`. Hard rule: time-stable facts only (no live populations, prices, breakable records). Split into `quizz-culture-ge-fr`/`-en`; ≥ totalRounds × 3 items per difficulty tier.

**Sample items.**

```json
[{ "id": "shortest-flight-seconds", "answer": 90, "unit": { "fr": "secondes", "en": "seconds" },
   "question": { "fr": "Le vol commercial régulier le plus court du monde relie deux îles écossaises. Sa durée officielle planifiée, en secondes ?",
                 "en": "The world's shortest scheduled commercial flight links two Scottish islands. Its official scheduled duration, in seconds?" },
   "funFact": { "fr": "Westray → Papa Westray, 2,7 km. Record réel en vol : 53 secondes — plus court que ta story Insta.",
                "en": "Westray → Papa Westray, 1.7 miles. Real-life record crossing: 53 seconds — shorter than your Insta story." },
   "difficulty": 2, "verifiedAt": "2026-05", "source": "Loganair Orkney inter-isles / Guinness World Records" },
 { "id": "stego-trex-gap", "answer": 83, "unit": { "fr": "millions d'années", "en": "million years" },
   "question": { "fr": "Combien de MILLIONS d'années séparent le Stégosaure du T-Rex ?",
                 "en": "How many MILLION years separate the Stegosaurus from the T-Rex?" },
   "funFact": { "fr": "Le T-Rex (-66 M) est plus proche de ton smartphone que du Stégosaure (-150 M). Oui, Jurassic Park t'a menti.",
                "en": "The T-Rex (66M yrs ago) is closer in time to your smartphone than to the Stegosaurus (150M). Yes, Jurassic Park lied to you." },
   "difficulty": 3, "verifiedAt": "2026-05", "source": "Stegosaurus ~150 Mya vs T-Rex ~67 Mya" },
 { "id": "first-sms-year", "answer": 1992, "unit": null, "format": "year",
   "question": { "fr": "En quelle année le tout premier SMS de l'histoire a-t-il été envoyé ?",
                 "en": "In what year was the very first SMS in history sent?" },
   "funFact": { "fr": "3 décembre 1992 : « Merry Christmas », envoyé d'un PC vers un Orbitel 901. Le destinataire ne pouvait même pas répondre.",
                "en": "December 3, 1992: \"Merry Christmas\", sent from a PC to an Orbitel 901. The recipient couldn't even text back." },
   "difficulty": 1, "verifiedAt": "2026-05", "source": "Neil Papworth / Vodafone UK" }]
```

**Scoring (exact).** Rank answerers by |guess − answer| ascending, competition ranking: 1st 100, 2nd 50, 3rd 25, rest 0; ties share the rank's points and skip the next rank (two tied closest → both 100, next gets 25); exact hit +50 "Pile !"; final round all points ×2. Single answerer gets 100; zero answerers → nothing awarded, round advances on deadline.

**Recommendations.**
- *Which twist format wins (brief: pick ONE)?* Twist A "closest wins" numeric estimation. Removes trivia's party flaw (nobody blocked by ignorance), zero free-text moderation (keypad only), trivially deterministic scoring, and the number-line reveal is the most shareable beat.
- *Twist B (Fibbage-style "fool the others")?* Ship later as a v2 `fool` mode on the same template — highest comedy ceiling but the platform's heaviest free-text surface; wait for the hardened moderation path.
- *Twist C ("Le Piège" hivemind trap MCQ)?* Keep as a later content-pack flavor — weakest differentiation, hardest content to generate well.
- *Template fit:* third mode `closest-number` of INPUT_GUESS — and build it FIRST: it is the simplest of all modes (no text, no peer-tap, no moderation), de-risking the missing template's skeleton.
- *Exact scoring / anti-runaway:* flat top-3 payout keeps rounds swingy at any player count; ×2 finale keeps trailers alive; `bustIfOver` stays false at launch (flip on later in a "Juste Prix" sibling config).
- *Original culture-gé at scale without runtime AI:* `needsOfflineAiPipeline: true` — AI generates estimation questions + funFacts OFFLINE; every item carries answer/source/verifiedAt; human fact-check gate is non-negotiable; corrections ship as immutable pack version bumps.

**Risks.** Gated on the INPUT_GUESS build (mitigation: this is its first, simplest slice). Fact drift (time-stable rule, verifiedAt+source, KV kill switch — a viral wrong answer is a reputational hit). Disputed answers (funFact = justification; reject questions with competing credible values). Huge-range answers unreadable (per-item `scale:'log'` + 9-digit clamp in the action zod schema). Tie/precision edges locked in reducer tests before content scales. Skill spread (flat payout + finale; watch analytics at 5 %). FR/EN funFacts must be natively funny, not machine-translated.

---

### 2.5 `cinquante-cinquante` — Cinquante-Cinquante / Fifty-Fifty — INPUT_GUESS `crowd-target`

**Mechanic.** Each round shows a sentence stem ("Honnêtement, j'ai déjà…"), an ANNOUNCED target split ("Vise 80 % OUI") and 6 pre-written completion cards, each carrying a pre-computed crowd YES-percentage (hidden). Players secretly pick the card they believe lands closest to the target; the reveal flips the true percentages. The brief's free-text + live-AI-judging is redesigned into a pack-authored hand (see recommendations) because runtime AI is impossible under the deterministic-replay contract.

**Phases.**

| Phase | Duration | Beat |
|---|---|---|
| `pick:r{n}` | 25 s | stem + target + 6 cards (display order seed-shuffled once, identical for all viewers); secret pick into HIDDEN buffer; early-resolve allActed(connected); timeout = non-pickers 0, never auto-assigned |
| `reveal:r{n}` | 12 s | atomic: cards flip to crowdYesPct, avatars land on picks, distance d = \|crowdYesPct − target\| shown; points; emits `round_completed` |
| `over` | untimed | scoreboard; cloned gameOver scores; placement XP |

**Params.**

```json
{ "mode": "crowd-target", "totalRounds": 7, "cardsPerRound": 6,
  "pickMs": 25000, "revealMs": 12000,
  "closestPoints": 3, "secondPoints": 1, "bullseyeBonus": 2, "bullseyeWindowPct": 2 }
```

**Content item.** One round: `{ id, targetYesPct: 1..99 (authored per item; packs cover extremes 95/5, mids, coin-flips), askKind: didYou|agree|wouldYou (how the fictional crowd of 1 000 was asked — drives reveal copy), stem:{fr,en}, completions: exactly 6 × { id:'a'..'f', text:{fr,en}, crowdYesPct: 0..100 (PRE-COMPUTED offline, per locale), spicy? }, tone, tags? }`. Pipeline lints (hard): all 6 crowdYesPct pairwise distinct by ≥ 3 except at most one designed tie vs target; ≥ 1 card within 12 of target; ≤ 1 card inside the bullseye window; pack ≥ totalRounds × 9 (~63 items); per-locale re-estimation on split.

**Sample items (compressed: completion → crowdYesPct).**

```json
[{ "id": "cc-honestly-001", "targetYesPct": 80, "askKind": "didYou",
   "stem": { "fr": "Honnêtement, j'ai déjà…", "en": "Honestly, I have…" },
   "completions": [ "…mangé un truc tombé par terre / eaten floor food → 84",
     "…fait semblant d'être malade pour sécher / faked sick to skip → 71",
     "…stalké mon ex sur les réseaux / stalked my ex → 62",
     "…chanté à fond sous la douche cette semaine / belted in the shower this week → 55",
     "…menti sur mon âge / lied about my age → 47",
     "…pleuré devant une pub / cried at a commercial → 38" ] },
 { "id": "cc-everyone-knows-002", "targetYesPct": 95, "askKind": "agree",
   "stem": { "fr": "Tout le monde sait que…", "en": "Everyone knows that…" },
   "completions": [ "…dormir, c'est merveilleux / sleeping feels amazing → 96",
     "…la pizza bat le brocoli / pizza beats broccoli → 88",
     "…le lundi est le pire jour / Monday is the worst → 74",
     "…l'ananas n'a rien à faire sur une pizza / pineapple doesn't belong on pizza → 54",
     "…les chats sont meilleurs que les chiens / cats > dogs → 41",
     "…les plateaux-repas d'avion, c'est bon / airplane food is good → 12" ] },
 { "id": "cc-could-totally-003", "targetYesPct": 30, "askKind": "wouldYou",
   "stem": { "fr": "Je serais cap de…", "en": "I could totally…" },
   "completions": [ "…parler devant 500 personnes / speak to 500 people → 33",
     "…une semaine sans téléphone / a week phoneless → 27",
     "…commander le plat le plus épicé / order the spiciest dish → 45",
     "…une nuit seul·e en forêt / a night alone in the forest → 38",
     "…gagner un concours de karaoké / win a karaoke contest → 22",
     "…un marathon sans entraînement / a marathon untrained → 9" ] }]
```

**Scoring (exact).** d = |crowdYesPct − targetYesPct| per card (all 6 ranked; only pickers score). Pickers of the minimum-d card(s): +3 (`closestPoints`); pickers of the second-smallest DISTINCT d: +1; if the winning card's d ≤ 2 (`bullseyeWindowPct`): its pickers +2 more (bullseye round pays 5). Distance ties: all tied cards count as closest, full +3 each (no splitting). Non-pickers 0.

**Recommendations.**
- *Brief wants live AI scoring of free-text completions — how to keep the mechanic?* Replace free text + live judging with the pack-authored hand above. All three beats of the brief survive (complete the stem, crowd %, closest-to-announced-target wins); live LLM scoring can never be replay-deterministic, pre-scored cards are.
- *Where do the percentages come from / will players trust them?* Offline LLM persona-ensemble (≥ 20 demographic personas per locale, majority-vote, temperature-varied), calibrated against real published polls, provenance stored; framed in-game as a consistent fictional crowd ("On a sondé 1 000 personnes"). The argument ("84 %?! no way") IS the party moment — if the numbers stay plausible.
- *Targets "pas nécessairement 50/50":* authored per item with a distribution lint: ~⅓ extreme (≥ 90 or ≤ 10), ~⅓ mid, ~⅓ coin-flip.
- *New template or reuse:* mode `crowd-target` of INPUT_GUESS — zero free text, so it can be an early INPUT_GUESS slice (second after closest-number).
- *Recovering free-completion creativity:* v2 `freestyle` sibling mode — players type completions, the ROOM votes OUI/NON live and the room's % scores against the target (deterministic, the crowd is the room) — after the text-moderation path ships.
- *Ties/passives/disconnects:* full points to tied pickers; deadline non-pickers 0, never auto-assigned; disconnected excluded from allActed.
- *Same % for FR and EN?* No — re-estimated per locale at split (pineapple pizza polls differently in Paris and Portland). Rooms are single-locale so fairness is unaffected.
- *Spicy:* sibling `cinquante-cinquante-after-dark` config later (tone spicy, minAge 18) — pure Cadence B.

**Risks.** Gated on INPUT_GUESS. Contested percentages kill trust if sloppy (calibration + human gate are load-bearing). Content burn (seen percentages = dead item; ≥ 63 items + steady refresh cadence). Per-locale re-estimation MUST happen or FR rooms get EN-calibrated numbers. Readability at speed (≤ ~60 chars/completion, cards 4–6). Tie-sharing inflation bounded by the ≥ 3-distinct lint. Picks are secrets until reveal (leakedSecrets audit on the buffer).

---

### 2.6 `double-jeu` — Double Jeu / Double Agent — SECRET_ROLE@2

**Mechanic.** Odd-one-out (Undercover lineage): everyone privately receives the same item except one player who gets a deliberately-close variant ("Boîte de nuit" vs "Bar karaoké"); nobody is told their role — even the impostor discovers it only by listening. Two discussion periods and two secret votes to unmask; if vote 2 misses, the impostor wins. Ships as a `game_config` on the impostor/SECRET_ROLE module plus a small @2 param branch — NOT a new template (see Section 5.1).

**Phases (per match; matchesPerSession = 3).**

| Phase | Duration | Beat |
|---|---|---|
| `secretReveal:m{n}` | 12 s | hold-to-peek own item only (no role shown — `revealRoleToSelf:false`); theme public; early on all-ack |
| `discuss:m{n}:p0` | 120 s | IRL free talk, hinting without saying the item; "Ready to vote" early-exit (all alive∧connected) |
| `vote:m{n}:p0` | 25 s | simultaneous secret accusation vote (impostor-doc redaction verbatim: hasVoted booleans + own echo only); self-vote inert; first vote locks |
| `verdict:m{n}:p0` | 8 s | ONLY if vote 1 missed: tally bars + top accused dramatically CLEARED ("Pas l'imposteur !"); tie → nobody cleared |
| `discuss:m{n}:p1` | 90 s | shorter period 2 (cleared-suspect info accelerates deduction) |
| `vote:m{n}:p1` | 25 s | final vote — unique plurality on the impostor = caught; anything else = impostor wins |
| `finalReveal:m{n}` | 12 s | atomic: impostor identity, both items, winning side, exact points; → next match or standings + interstitial; terminal `over` |

**Params.**

```json
{ "roundMode": "accusation", "clueMode": "none", "maxVoteRounds": 2, "maxImpostors": 1,
  "impostorWordMode": "decoy", "revealRoleToSelf": false, "impostorGuessEnabled": false,
  "secretRevealMs": 12000, "discussMs": 120000, "discuss2Ms": 90000, "voteMs": 25000,
  "verdictMs": 8000, "finalRevealMs": 12000, "matchesPerSession": 3,
  "scoring": { "civilianCorrectBallotPerVote": 1, "teamBonusCaughtVote1": 2, "teamBonusCaughtVote2": 1,
               "impostorSurvivesVote1": 2, "impostorWinsBonus": 3, "impostorDisconnectCivilianConsolation": 1 } }
```

**Content item.** `{ id, mediaType:'text' (v2 roadmap image/audio with pre-rendered R2 assets), theme:{fr,en} (PUBLIC), majority:{fr,en} (HIDDEN, all civilians), impostor:{fr,en} (HIDDEN, the odd one — same theme, deliberately close), closeness:'easy'|'medium'|'hard' (pre-scored offline semantic distance), spicyLevel }`. Both items ≤ 3 tokens; pack ≥ matchesPerSession items per locale.

**Sample items.**

```json
[{ "id": "night-out-club-karaoke", "theme": { "fr": "Soirée", "en": "Night out" },
   "majority": { "fr": "Boîte de nuit", "en": "Nightclub" }, "impostor": { "fr": "Bar karaoké", "en": "Karaoke bar" }, "closeness": "medium" },
 { "id": "vacation-beach-pool", "theme": { "fr": "Vacances", "en": "Vacation" },
   "majority": { "fr": "Plage", "en": "Beach" }, "impostor": { "fr": "Piscine", "en": "Swimming pool" }, "closeness": "easy" },
 { "id": "movies-horror-thriller", "theme": { "fr": "Cinéma", "en": "Movies" },
   "majority": { "fr": "Film d'horreur", "en": "Horror movie" }, "impostor": { "fr": "Thriller", "en": "Thriller" }, "closeness": "hard" }]
```

**Scoring (exact).** Per match: each civilian +1 per vote round in which their ballot targeted the impostor (max +2). Team catch bonus to every civilian: +2 if caught on vote 1, +1 on vote 2. Impostor: +2 for surviving vote 1 (kept even if caught later), +3 more for surviving vote 2 (win = 5). Impostor disconnects past grace → match ends, civilians +1, impostor 0. Match-local; interstitial only at the standings screen after 3 matches.

**Recommendations.**
- *New template or impostor family?* SECRET_ROLE config + small @2 params (`roundMode:'accusation'` — no elimination, each vote asks "is the unique plurality target the impostor?"; `clueMode:'none'` — IRL free talk instead of the structured clue loop; `maxVoteRounds`, `revealRoleToSelf`, `impostorGuessEnabled`). Do NOT create NEW:ODD_ONE_OUT — same state/redaction skeleton; precedented by the NPC-Infiltrator `secretKind` rider.
- *"2-3 min" periods → exact timers:* 120 s then 90 s (escalating urgency), both with all-ready early exit; worst-case match ≈ 292 s.
- *"Trouvé" definition:* caught = UNIQUE plurality target; tie / wrong unique target / all-abstain = miss (favors the impostor; deterministic, impostor doc §4.5 verbatim; no revote).
- *What's revealed after a missed vote 1:* tally + dramatic public CLEARING of the wrongly-accused (vindication, not roast); on tie, nobody cleared. Never reveal the impostor until finalReveal.
- *Does the impostor know? Does the room know the theme?* Nobody is told their role; theme public. Strongest paranoia, kills the "impostor instantly overacts" failure mode; exactly the brief's fantasy.
- *Keep the impostor's guess window?* OFF for v1 (clean two-vote structure, zero text input); config flip later.
- *Media strategy:* v1 text only; v2 image pairs pre-rendered offline (QA'd, R2-hosted); audio v3; video last or never.
- *Players:* config-tighten 4–16 (sweet spot 5–10) — 3-player accusation mode degenerates.

**Risks.** Needs SECRET_ROLE@2 branch (schedule with the impostor build, not after). 120/90 s discussions are long vs platform norms (theme card + ready-early-exit + nudge copy; watch abandons). Verdict info-leak makes vote 2 near-trivial in 4–5p rooms (fallback param: tally-only verdict). Pair-closeness calibration IS the game (offline scoring + human playtest of every "hard" item). Ties structurally favor the impostor (accepted; revisit if impostor win rate > ~50 % at 6+). Impostor-disconnect path must be handled (consolation rule). Bilingual closeness must be scored per locale.

---

### 2.7 `truth-or-dare-2` — Action ou Vérité — Fun & Lover / Truth or Dare — Fun & Lover — TRUTH_DARE@1 (pure config ×2)

**Mechanic.** The brief's "deux ambiances" of truth-or-dare are NOT a new game: they are two sibling `game_config` + pack families on the existing TRUTH_DARE module (rotation → choose → prompt → verdict → score, designed 2026-06-10), shipped via Cadence B only. `truth-or-dare-fun-2026` (party crew, soft+party tiers) and `truth-or-dare-lover-2026` (couples, party+spicy tiers, 18+).

**Phases (template's, unchanged).**

| Phase | Duration | Beat |
|---|---|---|
| `choose:{turnSeq}` | 15 s | active player picks Truth/Dare; timeout = seeded auto-pick |
| `prompt:{turnSeq}` | 45 s | prompt shown to the whole room; performed IRL; Done / Chickened / Pass; timeout = chickened (no pass spent) |
| `verdict:{turnSeq}` | 20 s | all present non-active vote done/chickened; 0 votes → done; ties → done; votes hidden (counts only) |
| `score:{turnSeq}` | 6 s | stamp + tally + points + next-up; lap wrap emits `round_completed` (ad boundary) |
| `over` | untimed | podium; cloned gameOver scores |

**Params (the two configs).**

```json
// truth-or-dare-fun-2026  — tone "classic", minAge 13, players 2–16
{ "totalRounds": 3, "passesPerPlayer": 2, "allowedIntensities": ["soft", "party"], "verdictThreshold": 0.5 }
// truth-or-dare-lover-2026 — tone "spicy", minAge 18, players 2–8, badge NEW
{ "totalRounds": 4, "passesPerPlayer": 3, "allowedIntensities": ["party", "spicy"], "verdictThreshold": 0.5 }
```

**Content item.** The template's existing `TodPromptEntry`, no schema change: `{ id ('<pack>-<t|d>-<tier>-<nnn>'), choice:'truth'|'dare', intensity:'soft'|'party'|'spicy', spicy:0|1|2 (≤ pack ceiling), minAge (every spicy-tier entry = 18), text:{fr,en} (≤ 280 chars, second person, room-judgeable), props?, tags? (every lover entry tagged 'couple') }`. Fun pack ships soft+party only; lover pack party+spicy only. Packs: `tod2-fun-fr/-en`, `tod2-lover-fr/-en`.

**Sample items.**

```json
[{ "id": "fun-t-soft-001", "choice": "truth", "intensity": "soft", "minAge": 13,
   "text": { "fr": "Quel est le truc le plus absurde que tu aies cherché sur Google cette semaine ?",
             "en": "What's the most ridiculous thing you googled this week?" } },
 { "id": "fun-d-party-014", "choice": "dare", "intensity": "party", "minAge": 16, "props": true,
   "text": { "fr": "Laisse la personne à ta droite écrire un message à qui elle veut depuis ton téléphone — tu as 3 secondes pour le relire avant l'envoi.",
             "en": "Let the person on your right text anyone they want from your phone — you get 3 seconds to read it before it sends." } },
 { "id": "lov-d-spicy-009", "choice": "dare", "intensity": "spicy", "minAge": 18,
   "text": { "fr": "Murmure à l'oreille de ton/ta partenaire ce que tu lui réserves pour plus tard ce soir… puis garde un visage parfaitement neutre pendant 10 secondes. Le groupe juge le visage.",
             "en": "Whisper in your partner's ear what you have planned for them later tonight… then hold a perfectly straight face for 10 seconds. The room judges the face." } }]
```

**Scoring (exact, template defaults, NOT config-exposed).** done+truth 10; done+dare 15 (10 + 5 dareBonus); passed 3 (one pass consumed); chickened/timeout/active-left 0; voters never score; verdictThreshold 0.5, ties → done.

**Recommendations.**
- *New game / template / packs?* CONFIRMED pack variants — zero new code, two KV entries + packs (template-architecture §3.2 row 6 "config-only per variant").
- *One tile with ambiance picker, or two?* Two sibling tiles. Age-gating is per-config (spicy ⇒ minAge ≥ 18 schema refinement); a single tile cannot be simultaneously family-safe and 18+.
- *Lover player range:* 2–8 (1–4 couples), marketed at 2; lobby copy "en couple(s) uniquement"; the engine never needs the pairing.
- *Spicy mapping onto tiers:* fun = soft(0)+party(1), NO spicy entries at all (removes dormant-tier store ambiguity); lover = party(1, tender)+spicy(2, 18+ suggestive).
- *Lover pass economy:* 3 passes (vs 2) — consent-forward: declining an intimate dare must always feel cheap. Scoring identical, deliberately not config-exposed.
- *18+ ceiling:* suggestive, partner-directed, consent-forward; never explicit/degrading/coercive; everything skippable; canonical pattern = lov-d-spicy-009 (room judges the face, not the act).
- *Lover opens at spicy-first (template plays highest tier first)?* Ship as-is; pre-scoped TRUTH_DARE@2 `tierProgression:'fixed-highest'|'escalate'` if playtests confirm the abrupt opening. Not a launch blocker.
- *Volume:* fun ≥ 192/locale (48 per choice×tier), lover ≥ 128/locale; ~770 bilingual entries total with headroom — the REAL cost of this "zero-code" game. AI-assisted drafting OK behind the full §6 gate (machine-translated flirting reads as creepy → human naturalness pass mandatory).

**Risks.** Self-attested age gate (server/region flag default-OFF for spicy; product+legal sign-off before lover flips enabled — ToD §9 Q2 still open). Store compliance (lover tile may force a rating change — verify BEFORE building the packs). Lover in a non-couple room misfires socially (soft mitigations only; monitor abandons). 2-player verdict = partner alone judges (playtest; fallback advisory-only verdicts). Content volume is the hidden critical path. Per-entry tier lint (fun {0,1}, lover {1,2}) hard-enforced. Catalog tooling must take per-config spicy values, not the umbrella number.

---

### 2.8 `truth-or-drink` — VÉRITÉ OU TU BOIS / TRUTH OR DRINK — TRUTH_DARE@2

**Mechanic.** Truth-only variant with an escape: one truth question per turn (no choose beat); the active player answers out loud — or taps "Je bois 🍺", which draws a forfeit card from the dare deck (one sip / a gage) and scores the pass. The verdict only adjudicates a contested "I answered" claim. Ships as TRUTH_DARE@2 (three additive params) + two sibling configs: `truth-or-drink` (18+, sips) and `truth-or-forfeit` (all-ages, 10-second gages).

**Phases.**

| Phase | Duration | Beat |
|---|---|---|
| `choose` | 0 s (auto-skipped) | `allowedChoices:['truth']` resolves instantly; straight to prompt |
| `prompt:{turnSeq}` | 35 s | question on every phone; answer out loud → "J'ai répondu", or escape "Je bois" (unlimited, ignores pass economy, draws one forfeit card → score +3); timeout/disconnect = dodged, 0, NO forfeit auto-assigned |
| `verdict:{turnSeq}` | 15 s | non-active players vote "Vraie réponse" vs "Esquive"; 0 votes → answered; ties → answered; counts only |
| `score:{turnSeq}` | 7 s | reveal + forfeit card display ("SANTÉ !"); lap wrap emits `round_completed`; after 2 laps → over |

**Params.**

```json
{ "totalRounds": 2, "allowedChoices": ["truth"], "escapeMode": "forfeit-draw",
  "allowedIntensities": ["party", "spicy"], "promptMs": 35000, "verdictMs": 15000, "scoreMs": 7000,
  "donePoints": 10, "passPoints": 3, "chickenedPoints": 0, "dareBonus": 0, "verdictThreshold": 0.5,
  "labels": { "escape": { "fr": "Je bois 🍺", "en": "I drink 🍺" }, "claimDone": { "fr": "J'ai répondu", "en": "I answered" },
              "verdictDone": { "fr": "Vraie réponse ✅", "en": "Real answer ✅" }, "verdictChickened": { "fr": "Esquive 🐔", "en": "Dodged 🐔" },
              "forfeitStamp": { "fr": "SANTÉ !", "en": "CHEERS!" } } }
```

**Content item.** Reuses the TRUTH_DARE deck machinery with zero new schema: `choice:'truth'` rows are the questions; `choice:'dare'` rows are the FORFEIT POOL (sip instructions in the 18+ drink pack; 10-second gages in the safe sibling). `{ id, choice, intensity, text:{fr,en}, minAge (18 on every drink-pack row), tags? }`. Sizing: ≥ 32 truth rows per allowed tier (16 × 2 laps) + ≥ 16 forfeit rows per tier.

**Sample items.**

```json
[{ "id": "totd-t-party-001", "choice": "truth", "intensity": "party", "minAge": 18,
   "text": { "fr": "Quel est le message le plus gênant que tu aies envoyé à la mauvaise personne ?",
             "en": "What's the most embarrassing text you've ever sent to the wrong person?" } },
 { "id": "totd-f-party-001", "choice": "dare", "intensity": "party", "minAge": 18, "tags": ["drink", "forfeit"],
   "text": { "fr": "Pas de réponse ? Une gorgée ! Une seule — on est là pour rire, pas pour finir sous la table.",
             "en": "No answer? One sip! Just one — we're here to laugh, not to end up under the table." } },
 { "id": "totf-f-soft-001", "choice": "dare", "intensity": "soft", "minAge": 0, "tags": ["forfeit", "funny"],
   "text": { "fr": "Pas de réponse ? Gage : parle avec l'accent de ton choix jusqu'à ton prochain tour.",
             "en": "No answer? Forfeit: speak in an accent of your choice until your next turn." } }]
```

**Scoring (exact).** Verdicted real answer +10; drink/forfeit taken +3 (+ forfeit card shown); dodged (voted down or timeout) 0; dareBonus 0 (no dare choice exists); voters never score.

**Recommendations.**
- *Drink vs gage toggle (the brief's open ask):* TWO sibling configs sharing the truth-question pack family — `truth-or-drink` (spicy, 18+, sip forfeits) and `truth-or-forfeit` (classic, all ages, gage forfeits). The "toggle" is which Home tile the group taps, NOT a lobby switch — age-gating is per-config and the safe variant becomes the discoverable default for under-18 devices.
- *Reconciliation with the existing ToD design:* same module, bumped @2 with three ADDITIVE params — `allowedChoices` (auto-resolves choose at 0 ms), `escapeMode` (`'pass'` default = existing skip economy untouched | `'forfeit-draw'` = unlimited escape drawing from the dare deck), `labels` (localized client copy). Existing configs keep all defaults, untouched.
- *Vote on whether the player drank?* No — the drink is physically visible; resolve instantly via the pass path. Verdict only for contested answer claims.
- *Timeout/disconnect:* dodged, 0 points, NO forfeit drawn — never assign alcohol to someone not actually there.
- *Responsible-drinking guardrails:* every forfeit capped at "one sip" phrasing; authoring lint rejects chug/"cul sec"/escalation wording; persistent lobby footer ("Bois de l'eau, ne conduis pas — les softs comptent"); answering is ALWAYS available; the safe sibling is the promoted path.
- *Session length:* 2 laps default (4–8 players ≈ 8–12 min); tighten to 1 lap at rosters ≥ 10; lap wrap = exactly one mid-session ad.

**Risks.** Store compliance Apple 1.4.3 / Google alcohol rating is a launch dependency (tone spicy + minAge 18 schema-enforced, region flags). Needs the TRUTH_DARE@2 params before shipping. Excessive-drinking liability (lint + footer + always-answerable; final product+legal sign-off). Verdict griefing (ties → answered, votes unscored and never revealed; monitor). Pack exhaustion at 16 × 2 laps (sizing lint; graceful tier fall-down). Spoken answers are unmoderated — questions must never solicit doxxing/medical/illegal confessions (authoring rule). 2-player rooms = single judge (acceptable for the pair format; consider advisory-only verdicts below 3).

---

### 2.9 `devine-l-action` — Devine l'Action / Guess the Action — PERFORM_JUDGE `guided` **(moved off TRUTH_DARE@2 — see §5.4)**

**Mechanic.** The whole room knows the performer's secret action — except the performer. Helpers guide them using ONLY the round's constraint channel (mime / sound effects / 3 words / forbidden words / freeze frames); the performer physically attempts the action, declares "Je l'ai fait !", and the room verdicts. Cooperative: helpers score too. Originally proposed as TRUTH_DARE@2 (`promptHiddenFromActive`); ruled onto the consolidated PERFORM_JUDGE template (visibility `others`, claim by performer) — same mechanic, no redaction footgun in TRUTH_DARE, and the brief itself says it shares its mechanic with `devine-l-objet`.

**Phases.**

| Phase | Duration | Beat |
|---|---|---|
| `ready:{turnSeq}` | 6 s | performer stands; helpers see SECRET action + constraint card (+ forbidden words if taboo); performer sees ONLY the constraint card; early on "Prêt" |
| `act:{turnSeq}` | 75 s | helpers guide via the allowed channel only; performer attempts the action; actions: "Je l'ai fait !" → verdict; "J'abandonne" → 0; "Passer" (if passesLeft) → +2; deadline/performer-left = auto-fail |
| `verdict:{turnSeq}` | 15 s | connected helpers vote Réussi/Raté ("did they do it, guided only through the channel?"); ≥ 0.5 → réussi; ties/zero votes → réussi; counts only |
| `score:{turnSeq}` | 7 s | the action text finally shown to the performer; stamp + tally + points; lap wrap → `round_completed`; after 2 laps → over |

**Params (PERFORM_JUDGE config).**

```json
{ "mode": "guided", "promptVisibility": "others", "claimBy": "performer", "crewSize": 1,
  "totalLaps": 2, "readyMs": 6000, "performMs": 75000, "verdictMs": 15000, "revealMs": 7000,
  "passesPerPlayer": 1, "successPoints": 10, "helperPoints": 5, "passPoints": 2, "failPoints": 0,
  "verdictThreshold": 0.5, "allowedIntensities": ["soft", "party"] }
```

**Content item.** One (secret action × pre-paired help channel) card: `{ id, action:{fr,en} (imperative; helpers-only until score), channel: mime|sounds|three-words|taboo|statues, channelLabel:{fr,en} (big public title), channelRule:{fr,en} (1-line rule on every phone), forbiddenWords?:{fr:string[3],en:string[3]} (REQUIRED iff taboo; helper phones only — hidden from the performer like the action), intensity, difficulty:1|2|3 (pre-computed offline, human-reviewed), props, tags }`. Channels are pre-paired at authoring, never rolled at runtime. Packs `gda-classic-fr/-en`; ≥ 32/tier (author 60+).

**Sample items.**

```json
[{ "id": "gda-soft-001", "channel": "mime", "difficulty": 1,
   "action": { "fr": "Fais semblant de promener un chien invisible qui tire sur sa laisse", "en": "Pretend to walk an invisible dog that keeps pulling on its leash" },
   "channelLabel": { "fr": "MIME UNIQUEMENT", "en": "MIME ONLY" },
   "channelRule": { "fr": "Aucun son, aucun mot, pas de lip-sync. Que des gestes !", "en": "No sounds, no words, no lip-syncing. Gestures only!" } },
 { "id": "gda-party-007", "channel": "taboo", "difficulty": 2,
   "action": { "fr": "Chante « Joyeux anniversaire » à genoux devant la personne la plus proche", "en": "Sing 'Happy Birthday' on your knees to the nearest player" },
   "channelLabel": { "fr": "MOTS INTERDITS", "en": "FORBIDDEN WORDS" },
   "forbiddenWords": { "fr": ["chanter", "anniversaire", "genoux"], "en": ["sing", "birthday", "knees"] } },
 { "id": "gda-party-012", "channel": "sounds", "difficulty": 2,
   "action": { "fr": "Danse le robot, puis tombe en panne au milieu de la pièce comme une machine qui s'éteint", "en": "Do the robot dance, then break down mid-room like a dying machine" },
   "channelLabel": { "fr": "BRUITAGES SEULEMENT", "en": "SOUND EFFECTS ONLY" } }]
```

**Scoring (exact).** Réussi → performer +10, EVERY connected helper +5 (cooperative); pass → performer +2 (burns 1 of 1 passes); fail/give-up/timeout → 0 for all. Voters' individual votes hidden; tally public at score.

**Recommendations.**
- *THE brief's open question — which "moyens d'aide autorisés" mechanism works best?* A per-round CONSTRAINT CARD drawn by the app but PRE-PAIRED with each action at authoring (offline AI-assisted, human-reviewed) — never rolled independently at runtime (independent draws produce duds; pre-pairing guarantees every combo is feasible AND funny, keeps runtime deterministic, gives content ops a difficulty dial). Launch catalog of 5 channels (mime / sound effects / 3-words budget / forbidden-words taboo / freeze frames); v2: draw-in-the-air, ONE MOUTH (phone secretly designates the only helper allowed to speak — truly phone-native).
- *Adjudication with zero runtime AI / no microphone:* group verdict verbatim — performer claims, helpers vote within 15 s, majority with ties/zero → réussi. The room is the referee; the phone is timer + scorer.
- *Template:* PERFORM_JUDGE `guided` (this doc's ruling; the raw design's TRUTH_DARE@2 path is superseded — §5.4). Content keeps the channel fields; pass economy and intensity tiers carry over into the perform template's config.
- *Helpers profit from voting réussi — verdict bias?* Accept the generosity bias (it's cooperative; the verdict's real job is stopping blatant fails and channel cheating); tally public at score makes rubber-stamping socially visible; if réussi-rate > ~95 % add a third "on a triché" option (voids helper points) as a param.
- *Session length:* one turn ≈ 75 s typical (103 s worst); 2 laps for 3–7 players (8–14 min); auto-scale to 1 lap at 8+.
- *Spicy:* separate 18+ sibling config later; default ships soft+party.

**Risks.** Redaction is load-bearing: action + forbiddenWords must NEVER appear in the performer's view during ready/act/verdict (leakedSecrets audit + field-level serialization test). Real code (rides the PERFORM_JUDGE build — but no longer touches TRUTH_DARE). Channel enforcement is social-only (constraint card unmissable on every phone; verdict copy says "vote Raté if helpers cheated"). Physical safety (lint out risky verbs: climbing, chugging, blindfolds, non-players; human review; props filterable). 3-player floor = 2 helpers (ONE MOUTH channel correctly deferred). Helper-disconnect wave during verdict → resolves réussi by default (acceptable at these stakes; monitor).

---

### 2.10 `jeu-de-la-note` — La Note / On a Scale — SPOTLIGHT_GUESS `scale`

**Mechanic.** The round's speaker privately sees a secret number (1–10, or 0–100 in the wheel variant) plus a prompt with labeled anchors ("describe a dish worth exactly this score"); they perform/answer out loud calibrated to that number; everyone else secretly sets a dial to their guess; closeness bands score the guessers and the speaker scores off the room's median accuracy. Two catalog configs on one mode: `jeu-de-la-note` (scale10) and `la-roue` (wheel100).

**Phases.**

| Phase | Duration | Beat |
|---|---|---|
| `target:r{n}` | 8 s | speaker (nextActiveSeat rotation) privately sees the target; others see prompt + anchors; "Ready" early; speaker-left voids the round |
| `talk:r{n}` | 45 s | fully verbal in-room beat — speaker calibrates to the secret number; "Open the votes" early-end (speakerCanEndTalk); deadline always advances |
| `guess:r{n}` | 20 s | connected non-speakers set a dial (integer, clamped to domain) into the HIDDEN buffer; overwrites allowed until resolve; allActed early; missing guesses 0 |
| `reveal:r{n}` | 8 s | atomic: target + every guess plotted on the dial; band points; `round_revealed` + `round_completed` at the boundary; → next speaker or over |

**Params.**

```json
{ "mode": "scale", "domain": "scale10", "totalRounds": 8, "targetReadMs": 8000,
  "talkMs": 45000, "guessMs": 20000, "revealMs": 8000, "speakerCanEndTalk": true,
  "hintTiers": 1, "lockOnSubmit": false }
```

(`la-roue` rider config: `{ "domain": "wheel100", "talkMs": 60000 }`, pack `la-roue`.)

**Content item.** `{ id, kind:'scale10'|'wheel100', prompt:{fr,en} (the instruction performed out loud), low:{fr,en} (anchor for 1 / left end), high:{fr,en} (anchor for 10 / right end), tags?, intensity? }`. One pack = one kind; config domain must match (authoring lint; init never filters). Targets are NOT in the pack — pre-drawn for ALL rounds at init from the seeded RNG. Items ≥ totalRounds, recommend ≥ 24.

**Sample items.**

```json
[{ "id": "note-food-001", "kind": "scale10",
   "prompt": { "fr": "Décris un plat qui mérite exactement cette note.", "en": "Describe a dish that deserves exactly this score." },
   "low": { "fr": "Immangeable", "en": "Inedible" }, "high": { "fr": "Étoilé Michelin", "en": "Michelin-star" } },
 { "id": "note-social-014", "kind": "scale10",
   "prompt": { "fr": "Invente une excuse pour annuler une soirée qui vaut exactement cette note de crédibilité.", "en": "Make up an excuse for cancelling plans that deserves exactly this believability score." },
   "low": { "fr": "Personne n'y croit", "en": "No one buys it" }, "high": { "fr": "Béton armé", "en": "Airtight" } },
 { "id": "roue-culture-007", "kind": "wheel100",
   "prompt": { "fr": "Cite quelque chose qui se trouve exactement ici sur la roue.", "en": "Name something that sits exactly here on the wheel." },
   "low": { "fr": "Totalement surcoté", "en": "Totally overrated" }, "high": { "fr": "Scandaleusement sous-coté", "en": "Criminally underrated" } }]
```

**Scoring (exact).** d = |guess − target|. Guesser bands — scale10: d=0 → 4, d=1 → 2, d=2 → 1, d≥3 → 0; wheel100: d≤5 → 4, ≤10 → 3, ≤20 → 2, ≤33 → 1, else 0. Speaker: band of the LOWER-MEDIAN of submitted guess distances (rewards calibrating the whole room); 0 if no guesses or round voided. All tied-closest guessers score the top band. Max 4/round for everyone.

**Recommendations.**
- *Two brief variants (secret number Q&A / labeled 1–10 scale):* one template mode with a `domain` discriminant; ship scale10 first (most legible), the wheel rides free as a config.
- *"Les autres posent des questions" without text or stalls:* a single timer-boxed verbal talk phase; phones stay controllers/secret-keepers; no typed gameplay text → zero moderation surface; disconnected speaker voids the round instead of freezing it.
- *"Le plus proche gagne" exact scoring:* band scoring above — shared wins on ties (never a cruel single loser), median-based speaker score, pure integer math, no judge, no AI.
- *Reuse HOT_SEAT or INPUT_GUESS instead?* No — HOT_SEAT's hidden answer is strictly binary 0|1; INPUT_GUESS has no per-round single-holder secret. This is the SPOTLIGHT_GUESS shape (one secret-holder + converging hidden guesses); after the template, both variants and all packs are config-only.
- *Does the speaker guess or type?* Never — excluded from the buffer and allActed; phone only holds the secret.
- *Wheel continuous or discrete?* Integer 0–100 slider rendered as a dial, snap ticks every 5 (JSON-safe, replay-deterministic, readable).

**Risks.** New-template cost (shared with devine-la-question via SPOTLIGHT_GUESS). Secret target is the redaction surface (speaker-only view; never in phaseKey/analytics; stringified-target audit from day one). Speaker disconnect must void/skip immediately (dedicated playerLeft tests). Shy rooms drag the talk phase (45 s cap + early-end; watch abandons at 5 %). 3-player rooms: lower-median = the better of 2 guesses (coarse; acceptable). Pack anchor quality is the difficulty knob (graduated anchors or bands flatten). Single-locale pack split required. Dial precision on small screens (snap ticks + haptics so the bullseye band is physically reachable).

---

### 2.11 `devine-la-question` — Devine la Question / Guess the Question — SPOTLIGHT_GUESS `reverse-question`

**Mechanic.** Inverted Q&A: the mystery player privately answers a secret question (picking from 3–4 honest-answer options); everyone else sees only the chosen ANSWER plus 5 candidate questions (1 real + 4 decoys) and must lock which question it answers. Pre-authored hints drop on a tier ladder — lock early for 300, after hint 1 for 200, after hint 2 for 100. The mystery player scores per correct guesser.

**Phases.**

| Phase | Duration | Beat |
|---|---|---|
| `answer:r{n}` | 20 s | spotlight privately sees question + options and picks honestly; others see "X is answering a secret question…" (zero leak); timeout/leave = round VOIDED |
| `guess:r{n}:h0` | 20 s | answer text + 5 seed-shuffled candidates; lock ONE (first-write-wins, tier 0 = 300); `locked` booleans only |
| `guess:r{n}:h1` | 20 s | hint #1 public; unlocked players may lock (tier 1 = 200) |
| `guess:r{n}:h2` | 20 s | hint #2 public; locks worth 100; deadline → reveal regardless |
| `reveal:r{n}` | 8 s | atomic: real question highlighted, all picks + tiers public, points count-up, reader bonus; `round_revealed` |
| `scoreboard:r{n}` | 6 s | every 2 rounds + before over — the interstitial ad slot |
| `over` | untimed | cloned gameOver scores; placement XP |

**Params.**

```json
{ "mode": "reverse-question", "totalRounds": 6, "answerMs": 20000, "hintTiers": 3,
  "hintIntervalMs": 20000, "revealMs": 8000, "scoreboardMs": 6000, "scoreboardEvery": 2,
  "decoyCount": 4, "tierPoints": [300, 200, 100], "readerPointsPerCorrectGuess": 75,
  "lockOnSubmit": true }
```

**Content item.** `{ id, question:{fr,en} (the secret real question, ≤ 140 chars), answers: 3–4 × {fr,en} (each must read as a plausible answer to the real question AND to every decoy — cross-plausibility is the whole game and the offline-AI scoring target), decoys: exactly 4 × {fr,en} (same register/length as the real one), hints: exactly 2 × {fr,en} (progressive, least→most revealing, never quoting the question), tags, spicy? }`. At init: seed-shuffle items, take totalRounds; per item seed-shuffle [real + decoys] storing `realIndex` HIDDEN. ≥ 6 items minimum, 40+ recommended.

**Sample items (compressed).**

```json
[{ "id": "q_mirror",
   "question": { "fr": "Combien de fois par jour tu te regardes dans le miroir ?", "en": "How many times a day do you check yourself out in the mirror?" },
   "answers": ["Jamais, ou presque / Almost never", "Deux ou trois fois / Two or three times", "J'ai arrêté de compter / I've lost count"],
   "decoys": ["Combien de fois par semaine tu fais vraiment du sport ? / …actually work out?", "Combien de fois tu appuies sur snooze ? / …hit snooze?",
              "Combien de fois tu as pleuré devant un film ? / …cried at a movie?", "Combien de fois tu as ghosté quelqu'un ? / …ghosted someone?"],
   "hints": ["Ça se passe souvent dans la salle de bain. / It usually happens in the bathroom.", "L'ego est directement concerné. / Ego is directly involved."] },
 { "id": "q_lottery_call",
   "question": { "fr": "Qui tu appellerais en premier si tu gagnais au loto ?", "en": "Who would you call first if you won the lottery?" },
   "answers": ["Ma mère / My mom", "Mon meilleur pote / My best friend", "Personne, je disparais / No one — I'd vanish"],
   "decoys": ["…pour t'aider à cacher un corps ? / …to help you hide a body?", "Qui te connaît le mieux au monde ? / Who knows you best?",
              "…si tu partais vivre à l'étranger ? / …if you moved abroad?", "À qui tu confierais ton téléphone déverrouillé ? / …your unlocked phone?"],
   "hints": ["Il y a beaucoup d'argent en jeu. / There's a lot of money involved.", "Tout commence par un petit ticket. / It all starts with a little ticket."] },
 { "id": "q_no_phone",
   "question": { "fr": "Combien de temps tu tiendrais sans ton téléphone ?", "en": "How long could you last without your phone?" },
   "answers": ["Une heure, grand max / An hour, tops", "Une journée / One day", "Une semaine, tranquille / A week, easy"],
   "decoys": ["…dans une émission de télé-réalité ? / …on a reality TV show?", "…sans parler du tout ? / …without talking at all?",
              "…sans sucre ? / …without sugar?", "…en rando sans te plaindre ? / …hiking without complaining?"],
   "hints": ["C'est une dépendance très moderne. / It's a very modern addiction.", "Tu es probablement en train de le tenir, là. / You're probably holding it right now."] }]
```

**Scoring (exact).** Correct guess pays its lock tier: 300 / 200 / 100. Mystery player: +75 per correct guesser (0 on a voided round). No-guess = 0, never blocks.

**Recommendations.**
- *The co-founder's explicit open question — app-driven hints, player-given hints, or full autonomy?* FIRM: app-driven, PRE-AUTHORED progressive hints from the pack. Full autonomy needs no app at all (no timers/scoring/reveal/ads — a parlor game we'd be giving away); player-given hints violate never-block, are unscorable, and typed hints would open the free-text moderation surface. Pre-authored hints are the only deterministic-runtime version AND they create the signature 300/200/100 risk/reward ladder. The brief's "AI gives hints" becomes the offline pipeline writing hints into the pack.
- *Hint cadence (brief suggests 30 s):* 20 s per tier — 30 s × 3 = 90 s of guessing breaks TikTok pacing; early-exit on all-locked makes fast tables ~35–45 s in practice.
- *Free text or MCQ for the guess?* MCQ (1 real + 4 decoys) — free-text question matching is deterministically undecidable and opens moderation; the decoys are themselves the comedy. Players still shout wild guesses out loud.
- *Lock semantics:* lock-on-submit (first write wins), deliberately diverging from HOT_SEAT — editable picks would let everyone park at tier 0 and edit with tier-2 information, collapsing the ladder.
- *Mystery-player scoring / honesty:* +75 per correct guesser (HOT_SEAT readPoints alignment trick — a troll answer scores the answerer nothing); honesty is incentive-designed, not enforced.
- *Config of HOT_SEAT?* No — sequential answer→guess, per-round redacted secret, hint-tier sub-phases, tier-decaying points = a different state machine. Ships as the second SPOTLIGHT_GUESS mode.
- *What the offline AI produces:* decoys + hints generation, then cross-plausibility scoring (every answer option plausible for real AND all decoys; hints narrow without giving away), auto-reject below threshold, standard gate.

**Risks.** Decoy quality is load-bearing (target ~25–40 % correct at tier 0, ~70 %+ by tier 2; watch per-tier analytics). New-template cost (shared with jeu-de-la-note). Redaction: `realIndex` + guess buffer per-round secrets; seeded candidate shuffle; field-level view tests (answer-phase guesser views contain no question/options). Answerer no-show voids the round (monitor voided-rate; rejoin/grace keeps it rare). Worst-case round ~88 s if nobody locks early (a 2-tier "sprint" config is the Cadence-B lever). Tier-camping meta (tierPoints tunable without deploy). Cross-plausibility must hold in BOTH locales independently (per-locale gate, doubled curation).

---

### 2.12 `double-le-mouvement` — DOUBLE LE MOUVEMENT / DUB THE MOVE — PERFORM_JUDGE `rate` (crew 2)

**Mechanic.** A duo improv machine: the mover (X) secretly picks one of two movement prompts and performs it; the dubber (Y) improvises the live sound dub BLIND — never seeing the prompt (the mismatch is the comedy engine); the audience rates the duo 1–5 stars; the prompt reveal afterwards is the guaranteed second laugh beat ("THAT was supposed to be a cat?!"). Both crew members score identically.

**Phases.**

| Phase | Duration | Beat |
|---|---|---|
| `brief:{turnSeq}` | 15 s | mover sees 2 prompts, picks one (secret); dubber sees "YOU ARE THE VOICE"; audience sees "X is choosing"; timeout = auto-pick offer[0]; mover-left voids the turn, dubber-left reassigns |
| `perform:{turnSeq}` | 30 s | phones down — X performs, Y dubs blind; countdown on all phones; crew "Done" taps end early; dubber-left = solo finish, still scored |
| `rate:{turnSeq}` | 15 s | connected non-crew cast 1–5 stars (hidden buffer, first tap locks, counts only); crew sees suspense card; 0 ballots → default 3.0; empty audience resolves immediately |
| `reveal:{turnSeq}` | 7 s | prompt flips public + star average + points burst for BOTH + ovation badge; lap wrap → `round_completed`; → next turn or over |

**Params (PERFORM_JUDGE config).**

```json
{ "mode": "rate", "promptVisibility": "performer", "crewSize": 2, "laps": 1, "promptChoices": 2,
  "briefMs": 15000, "performMs": 30000, "rateMs": 15000, "revealMs": 7000,
  "starMultiplier": 20, "ovationBonus": 25, "noVoteDefaultStars": 3, "allowedIntensities": ["safe"] }
```

**Content item.** One movement prompt: `{ id, text:{fr,en} (≤ 120 chars, mover-only until reveal), hint:{fr,en} (optional performance tip, mover-only), category: animals|dance|sports|everyday|cinema|cringe, difficulty:1|2|3, intensity:'safe'|'spicy', props, tags }`. Pool ≥ laps × maxPlayers × promptChoices = 32 per tier.

**Sample items.**

```json
[{ "id": "dlm-001-robot-hiphop", "category": "dance", "difficulty": 1,
   "text": { "fr": "Un robot qui apprend le hip-hop avec un tuto YouTube", "en": "A robot learning hip-hop from a YouTube tutorial" },
   "hint": { "fr": "Saccadé au début, fluide à la fin — termine par un dab.", "en": "Stiff at first, smooth by the end — finish with a dab." } },
 { "id": "dlm-002-cat-cucumber", "category": "animals", "difficulty": 1,
   "text": { "fr": "Un chat qui découvre un concombre posé derrière lui", "en": "A cat discovering a cucumber placed behind it" },
   "hint": { "fr": "Toilette tranquille de la patte… puis panique verticale.", "en": "Calmly groom your paw… then vertical panic." } },
 { "id": "dlm-003-lego-barefoot", "category": "everyday", "difficulty": 2,
   "text": { "fr": "Traverser pieds nus un salon couvert de Lego en restant digne", "en": "Crossing a Lego-covered living room barefoot while staying dignified" },
   "hint": { "fr": "Sourire de façade, agonie intérieure, démarche de flamant rose.", "en": "Polite smile, inner agony, flamingo walk." } }]
```

**Scoring (exact).** avg = mean of cast stars (default 3.0 if zero ballots); points = round(avg × 20) → 20–100, awarded IDENTICALLY to mover and dubber; unanimous 5★ with ≥ 2 ballots → +25 ovation each; voided turn = 0. Rating earns nothing.

**Recommendations.**
- *How does the app prompt X ("Joueur X choisit")?* A 15 s secret pick between 2 pack prompts — preserves agency without the blank-page stall of free invention; deterministic auto-pick on timeout.
- *Does Y see the prompt?* Never — Y dubs blind; an informed dubber collapses into narration, and it halves the redaction surface (only mover views ever carry undisclosed text).
- *How does the room score?* Hidden 1–5 star buffer, first tap locks, identical duo score (cooperative by construction: X picks performable moves, Y commits to the bit); 20-point floor + 3-star default blunt trolling/AFK; ratings unscored to stay honest.
- *When is the prompt revealed?* Only AFTER stars lock — the room rates the comedy, not fidelity, and the reveal is the second laugh beat.
- *Player count / length:* config 4–16 (template floor 3 = one rater, gameable), sweet spot 4–10; laps=1 → everyone movers once, dubs ~once; ~7 min at 6 players.
- *Audience guesses the prompt (extra mechanic)?* Defer to v2 (typed guess = moderation surface + 20 s/turn).
- *Spicy:* later age-gated 'spicy moves' pack via `allowedIntensities`; launch safe-only.

**Risks.** Rides the PERFORM_JUDGE build (real code, amortized over 4 games). Redaction: offered + chosen prompts never reach dubber/audience/spectator pre-reveal; individual star ballots NEVER published (aggregate only). The perform beat is unverifiable by the app (timers + Done taps guarantee flow; fun depends on room energy). Star griefing/inflation (floor + shared score + unanimity-gated ovation; monitor). Loud by design (catalog copy must set the standup-noisy expectation). Mover loss voids the turn (abrupt but correct); dubber loss = solo performance still scored. Pack sizing 32+/tier.

---

### 2.13 `mime-inverse` — Mime Inversé / Reverse Mime — PERFORM_JUDGE `puppet`

**Mechanic.** Inverted charades: the puppet stands up knowing nothing; ALL other players (commanders) see the secret action + forbidden words on their phones and shout imperative directions ("lift your arms! push it forward!") — never the taboo words — while the puppet obeys and shouts guesses. Commanders tap "Trouvé !" the moment the puppet names it (strict majority = instant success + speed bonus); otherwise a 10 s last-call verdict. The reveal is the payoff: the puppet finally learns what they were being puppeteered into.

**Phases.**

| Phase | Duration | Beat |
|---|---|---|
| `perform:{turnSeq}` | 30 s | puppet phone shows category hint + timer only; commanders see action + forbidden words; "Trouvé !" taps → strict majority of connected commanders = success-early (+speed) → reveal; deadline → verdict; puppet-left voids |
| `verdict:{turnSeq}` | 10 s | "did they get it (or close enough)?" — Oui/Non, first vote locks, perform taps carry over as pre-cast Oui; yes/cast ≥ 0.5, ties → success; zero votes → fail; zero eligible → void |
| `reveal:{turnSeq}` | 7 s | answer revealed to EVERYONE; outcome stamp; aggregate tally only; points; next puppet |
| `scoreboard:{turnSeq}` | 6 s | every 4 turns + before over — interstitial slot |
| `over` | untimed | cloned gameOver scores |

**Params (PERFORM_JUDGE config).**

```json
{ "mode": "puppet", "promptVisibility": "others", "claimBy": "judges", "crewSize": 1,
  "performMs": 30000, "verdictMs": 10000, "revealMs": 7000, "scoreboardMs": 6000, "scoreboardEvery": 4,
  "roundsPerPlayer": 1, "earlyMajorityResolve": true, "successPoints": 100, "crewPoints": 50,
  "speedBonus": 50, "showCategoryToSpotlight": true, "verdictThreshold": 0.5 }
```

**Content item.** `{ id, action:{fr,en} (the secret — commanders only, never the puppet or unknown viewers), category:{fr,en} (soft hint to the puppet + shown at reveal), forbidden:{fr:string[],en:string[]} (3–5 taboo words, display-only honor rule — no speech recognition), difficulty:1|2|3, spicyLevel, tags }`. Authoring safety rule: every action performable standing in ~2 m², no props, no contact with other players. ≥ 16 items/tier; ship 60+.

**Sample items.**

```json
[{ "id": "mi-act-001", "action": { "fr": "Tondre la pelouse", "en": "Mowing the lawn" },
   "category": { "fr": "Corvées", "en": "Chores" }, "difficulty": 1,
   "forbidden": { "fr": ["tondeuse", "pelouse", "herbe", "jardin"], "en": ["mower", "lawn", "grass", "garden"] } },
 { "id": "mi-act-014", "action": { "fr": "Passer le contrôle de sécurité à l'aéroport", "en": "Going through airport security" },
   "category": { "fr": "Voyage", "en": "Travel" }, "difficulty": 2,
   "forbidden": { "fr": ["aéroport", "portique", "valise", "sécurité"], "en": ["airport", "scanner", "suitcase", "security"] } },
 { "id": "mi-act-027", "action": { "fr": "Promener un chien qui tire sur la laisse", "en": "Walking a dog that pulls on the leash" },
   "category": { "fr": "Animaux", "en": "Animals" }, "difficulty": 2,
   "forbidden": { "fr": ["chien", "laisse", "promener"], "en": ["dog", "leash", "walk"] } }]
```

**Scoring (exact).** Success → puppet +100 (+50 speed bonus iff confirmed during the command window); EVERY connected commander +50 regardless of individual vote (collective scoring kills false-positive tap incentives); fail/void → 0 for all.

**Recommendations.**
- *How does the system know the puppet guessed right (brief leaves it open)?* Peer-tap majority in two beats — "Trouvé !" during the window (strict majority → instant + bonus), then a generous last-call verdict. Typing mid-performance breaks the physical comedy, adds moderation + a synonym-matching problem; peer-tap is enum-only, IRL-native, handles "close enough" generously. MCQ rejected (reduces wild shouted guesses to a menu).
- *Is 30 s right?* Yes — catalog default, tunable 20–45 s via params only; early-majority makes good rounds pop at ~15–20 s.
- *Who scores?* Collective on success (above) — rewarding individual taps would incentivize false positives; 100/50 mirrors hot-seat's spotlight/crowd asymmetry.
- *Which template?* No existing one fits (HOT_SEAT/TRUTH_DARE show the prompt to the active player — this needs the exact OPPOSITE redaction; SECRET_ROLE has the right redaction but the wrong loop). Ships as PERFORM_JUDGE `puppet`; the same template is designed day-one to host `blitz` ("Name 3 in 5s") — resolving template-architecture §7 Q1 (see §5.5).
- *Stopping commanders from saying the answer:* display-only taboo words on commander screens, social enforcement (Taboo genre standard) + hold-to-peek against shoulder-surfing (the real leak channel is physical, not the view layer).
- *Puppet hints / opt-out:* category hint shown by default (hopeless flailing stops being funny); seated performance always acceptable; disconnect/freeze voids the turn and moves on.

**Risks.** Redaction inversion is the core engineering risk (secret must never reach the spotlight OR unknown viewers — unknown ids are treated as the puppet's possible second device and get the spotlight-redacted view). Rides the PERFORM_JUDGE build. Verdict griefing (ties generous, collective scoring removes incentive, votes never attributed). Venue constraints (~2 m², shouting OK; authoring lint rejects props/running/contact; seated legitimate). Shoulder-surfing (hold-to-peek default — client requirement). 16-player session ≈ 12+ min (cap turns or bump scoreboardEvery). Spicy pack only later, age-gated with consent framing.

---

### 2.14 `jeu-du-theme` — Le Jeu du Thème / Last Word Standing — LAST_STANDING

**Mechanic.** Battle-royale word survival: a theme + letter is drawn ("Les enfants adorent…" + S); survivors take turns SHOUTING a matching word under a shot clock that shrinks every lap (8 s → 3 s floor); the room jury thumbs-votes each word; rejected, silent or surrendering players are eliminated for the round; last one standing takes the bonus. Words are never typed — phones are shot clock + jury only.

**Phases.**

| Phase | Duration | Beat |
|---|---|---|
| `draw:r{n}` | 4 s | slot-machine theme + letter reveal; alive resets to connected; < 2 connected → over |
| `say:t{turnSeq}` | 8 s → 3 s | decaying shot clock on the spotlit survivor (max(3000, 8000 − lap × 1500)); 'wordSaid' → judge; 'giveUp' self-eliminates; deadline/disconnect = elimination |
| `judge:t{turnSeq}` | 6 s | thumbs vote by EVERY other present player (eliminated players join the jury); first vote locks; rejected iff rejectVotes/cast > 0.5 STRICT; ties/abstain/zero → VALID |
| `result:t{turnSeq}` | 2 s | VALIDE ✅ / 💥 ÉLIMINÉ stamp + anonymous tally; → next alive survivor, or roundEnd at aliveCount ≤ 1 or the hard cap (players × 6 turns) |
| `roundEnd:r{n}` | 4 s | survivor crowned +3; emits `round_completed` (ad boundary); → next draw or over |
| `over` | untimed | final leaderboard; cloned gameOver scores |

**Params.**

```json
{ "totalRounds": 3, "drawMs": 4000, "sayMs": 8000, "sayDecayPerLapMs": 1500, "minSayMs": 3000,
  "judgeMs": 6000, "resultMs": 2000, "roundEndMs": 4000, "validWordPoints": 1, "survivorPoints": 3,
  "rejectThreshold": 0.5, "maxTurnsPerRoundFactor": 6, "difficultyCurve": "ascending",
  "deadPlayersJudge": true, "allowGiveUp": true }
```

**Content item.** One round card: `{ id, theme:{fr,en} (≤ 80 chars, SHOUTY-readable), letters:{fr:string[],en:string[]} (6–10 UPPERCASE letters PRE-SCORED OFFLINE as feasible — gate: ≥ 15 common words per (theme, letter, locale); lists intentionally differ per locale; runtime seeded draw with cross-round no-repeat), difficulty:1|2|3 (drives the ascending curve), spicy, tags?, exampleWords?:{fr,en} (authoring/QA evidence ONLY — STRIPPED at publish, would prime answers) }`.

**Sample items (compressed).**

```json
[{ "id": "jdt-kids-001", "theme": { "fr": "Les enfants adorent…", "en": "Kids absolutely love…" }, "difficulty": 1,
   "letters": { "fr": ["S","P","C","B","G","M","T","J"], "en": ["S","P","C","B","T","D","M","F"] } },
 { "id": "jdt-cuisine-007", "theme": { "fr": "On en trouve dans une cuisine", "en": "Things you find in a kitchen" }, "difficulty": 1,
   "letters": { "fr": ["C","P","F","T","B","M","A","E"], "en": ["S","P","F","T","B","M","C","K"] } },
 { "id": "jdt-date-023", "theme": { "fr": "Ça peut tout gâcher lors d'un premier rendez-vous…", "en": "Things that can ruin a first date…" }, "difficulty": 2,
   "letters": { "fr": ["S","R","P","T","B","M"], "en": ["S","B","P","T","L","G"] } }]
```

**Scoring (exact).** +1 per validated word (`validWordPoints`); +3 to the round's last survivor (cap case: every still-alive player gets it; zero survivors: no bonus); jurors unscored. Being eliminated 5th with 4 validated words beats going out 1st.

**Recommendations.**
- *Word typed or spoken?* Spoken, always — phone never captures the word: zero UGC moderation surface, the fun stays in the room, and typing under an 8 s clock would kill the rhythm.
- *Who validates / tie handling (brief: room vote, no dictionary)?* Reject only on STRICT majority of cast votes; tie/abstain/zero → valid; first vote locked. Benefit of the doubt protects the player under pressure ("funny never cruel", mirrors ToD ties → done).
- *What do eliminated players do?* They join the jury (`deadPlayersJudge`) — nobody idle, and the widened jury dilutes the late-round conflict of interest of survivors judging each other.
- *Letter draw without unplayable turns ("Les enfants aiment…" + W)?* No uniform A–Z: each theme carries per-language pre-validated letter lists (≥ 15 common words per theme × letter × locale, scored offline by the AI pipeline + wordlist cross-check); seeded no-repeat draw.
- *Guaranteed round convergence?* Double safety: the decaying shot clock mathematically forces convergence (and makes TikTok-native tension) + a hard cap of players × 6 turns (cap hit → all survivors take the bonus).
- *Repeated words?* Policed by the room, not the engine ("Déjà dit = pouce rouge !" UI copy) — words are oral, the brief excludes dictionaries, and policing repeats is what makes the jury fun.
- *Template?* NEW:LAST_STANDING — TRUTH_DARE has rotation+verdict but no elimination loop or persistent round prompt. Kept as its own template (the elimination/decaying-clock outer machine doesn't fit PERFORM_JUDGE without bloating it — see §3.3); its "Name 3 in 5s" absorption claim is overruled in favor of PERFORM_JUDGE (§5.5).
- *minPlayers:* 3 (at 2, the only juror is the direct rival — total conflict of interest); sweet spot 4–10.
- *Spicy:* launch 100 % safe; 18+ theme pack later as a sibling config, zero code.

**Risks.** Real code ~1–2 weeks (single-game template — accepted, see §3.3). Grudge-jury / kingmaking (strict majority + tie=valid; watch eliminated-juror reject rates; config lever: weight or cut deadPlayersJudge). Honor-system bluffing ('wordSaid' with nothing said is exactly what the jury sanctions). Letter-feasibility gate is quality-critical and blocking. Long rounds at 12–16 players (~5–6 min; big-group config: totalRounds 2 / sayMs 6000, or cap maxPlayers 12 on the default entry). Spoken words unmoderable by construction (lobby report/kick/block; nothing persisted). `exampleWords` must NEVER reach a client (strip at publish + redaction audit). Spotlight disconnect = round elimination only, back next draw (communicate in UI).

---

### 2.15 `devine-l-objet` — Devine l'Objet / Guess the Object — PERFORM_JUDGE `credit`

**Mechanic.** Classic object mime, phone-native: the performer privately sees a secret object, mimes it (zero words), the room shouts guesses; the performer taps the avatar of the first correct guesser (claim-credit); a quick group validation vote is the anti-cheat; performer AND credited guesser score identically, with a fast bonus. Shares its module with `devine-l-action` (the brief says "même mécanique") and the rest of the PERFORM_JUDGE family.

**Phases.**

| Phase | Duration | Beat |
|---|---|---|
| `handoff:{turnSeq}` | 4 s | "Lève-toi, {nickname} !" spotlight beat; no actions; the secret is drawn at mime entry |
| `mime:{turnSeq}` | 45 s | performer phone shows the secret object; others see the public category chip + timer and shout guesses; performer taps the guesser's avatar (claimFound) or Pass (1/game); deadline/disconnect = MISSED (no pass burnt) |
| `validate:{turnSeq}` | 12 s | object revealed to ALL; everyone except performer + credited guesser votes "C'était bon ?"; ≥ 50 % of cast = valid; ties/zero/empty set → valid |
| `reveal:{turnSeq}` | 6 s | stamp FOUND +10/+10 (+5/+5 fast) / PASSED / MISSED / CONTESTED; scores; next performer; lap wrap → `round_completed`; after 2 laps → over |

**Params (PERFORM_JUDGE config).**

```json
{ "mode": "credit", "promptVisibility": "performer", "claimBy": "performer", "crewSize": 1,
  "roundsPerPlayer": 2, "handoffMs": 4000, "mimeMs": 45000, "validateMs": 12000, "revealMs": 6000,
  "passesPerPlayer": 1, "foundPoints": 10, "fastBonusPoints": 5, "validateThreshold": 0.5,
  "allowedDifficulties": ["easy", "medium"], "bonusFetch": false }
```

**Content item.** One object card: `{ id, object:{fr,en} (SECRET — performer-only during mime, public from validate), category:{fr,en} (public hint chip), difficulty:'easy'|'medium'|'hard' (drawable iff in allowedDifficulties), tags (e.g. 'inRoomLikely'), spicy }`. ≥ 32 items per allowed difficulty (16 × 2 laps).

**Sample items.**

```json
[{ "id": "obj-easy-001", "object": { "fr": "une brosse à dents", "en": "a toothbrush" },
   "category": { "fr": "Salle de bain", "en": "Bathroom" }, "difficulty": "easy", "tags": ["household", "inRoomLikely"] },
 { "id": "obj-med-007", "object": { "fr": "une perche à selfie", "en": "a selfie stick" },
   "category": { "fr": "High-tech", "en": "Tech" }, "difficulty": "medium", "tags": ["tech", "funny"] },
 { "id": "obj-hard-013", "object": { "fr": "une boule à facettes", "en": "a disco ball" },
   "category": { "fr": "Fête", "en": "Party" }, "difficulty": "hard", "tags": ["party", "funny"] }]
```

**Scoring (exact).** Validated find → performer +10 AND credited guesser +10; claim within the first half of the timer → +5 each (fast bonus); pass → 0 (burns the single pass); missed/timeout → 0 (no pass burnt); contested (validation fails) → 0/0. Validation votes unscored.

**Recommendations.**
- *The co-founder's open question — a vote "pour être sûr de l'existence de l'objet dans la pièce"?* Do NOT ship a pre-mime existence vote (a dead ~10 s beat every turn with no stakes — objects come from a pre-moderated pack, physical presence is unnecessary). REPURPOSE the vote as the post-claim 12 s VALIDATION vote: it keeps every non-performer engaged each turn and catches the only real cheats (crediting a friend who never guessed, saying the word out loud) — delivering the assurance the co-founder wanted exactly where it matters.
- *Pack-driven or performer-chosen real objects?* Pack-driven: deterministic runtime, zero free-text surface, curated bilingual comedy, difficulty tiers; room-chosen objects also let the performer pick something trivially visible.
- *Salvageable physical twist?* Reserved `bonusFetch` param (default false, no-op v1): after a validated find, 8 s for the first player to physically brandish a matching object, +5, confirmed by one group tap. v1.1 if playtests want chaos.
- *Share a template with devine-l-action ("même mécanique")?* Yes — both ship as game_configs + packs on PERFORM_JUDGE (this design's PERFORM_GUESS spec is the seed of the `credit` mode; future packs: emotions, jobs, movies, songs).
- *Harder objects score more?* Flat 10/10 (+5/+5) in v1 — legible at a party, no fairness arguments; the fast bonus already rewards skill and session XP is placement-based anyway.

**Risks.** Rides the PERFORM_JUDGE build. Redaction: `current.object` never in a non-performer view, phaseKey or analytics pre-claim (leakedSecrets over the undrawn deck + in-flight object + individual validate votes). IRL honor system (hostile rooms can grief 'invalid' — ties-to-valid, zero-to-valid, unscored votes; monitor contested-rate). MUST converge with devine-l-action on the one shared module + pack schema before either builds (this doc rules it — §5.4). 16 players × 2 laps ≈ 30+ min (cap maxPlayers ~12 or auto-scale to 1 lap at 10+). Inclusivity: miming excludes shy/low-mobility players (pass economy, 0-cost misses, copy never mocks; describe-without-the-word accessibility variant as future pack/param).

---

### 2.16 `trouvez-la-regle` — Trouvez la Règle / Find the Rule — RULE_HUNT

**Mechanic.** Inverted social deduction: 1–2 PUBLIC detectives step out (virtually); everyone else privately receives a secret behavioral rule ("touch your ear before every sentence") and must obey it during a 3-minute free-play clock while the detectives observe and interrogate. Followers self-police via accusation tribunals (every conviction is a juicy clue); detectives spend limited guesses on an 8-candidate rule grid. Survive unguessed = followers win; a perfect round (zero convictions) is the top prize.

**Phases.**

| Phase | Duration | Beat |
|---|---|---|
| `briefing:r{n}` | 20 s | detectives publicly announced; followers privately read the rule, tap OK; early on all-acked |
| `live:r{n}:s{seg}` | 180 s (banked) | free play in the room; the clock PAUSES on interrupts and resumes with the banked remainder; deadline → reveal (followers survive) |
| `tribunal:r{n}:i{k}` | 25 s | a follower spends their accusation token; eligible followers (not the accused; detectives excluded) vote guilty/not-guilty; majority of cast convicts → eliminated +1 infraction; tie/zero/deadline → not guilty; resume live |
| `guess:r{n}:i{k}` | 20 s | a detective opens the 8-candidate grid (1 real + 7 decoys, seed-shuffled, wrong picks greyed) and locks ONE; correct → detectives win the round; wrong → attempt spent, resume; deadline = attempt spent with no pick (anti-stalling) |
| `reveal:r{n}` | 12 s | rule shown to everyone + outcome + exact points; `round_completed`; → next round (rotated detectives) or over |
| `over` | untimed | standings; cloned gameOver scores |

**Params.**

```json
{ "totalRounds": 3, "briefingMs": 20000, "liveMs": 180000, "tribunalMs": 25000,
  "guessMs": 20000, "revealMs": 12000, "detectiveCount": "auto", "teamGuesses": 3,
  "candidateCount": 8, "accusationsPerPlayer": 1 }
```

**Content item.** `{ id, category:'gesture'|'verbal'|'social', difficulty, spicy, rule:{fr,en} (imperative, ≤ 120 chars; followers-private, public at reveal), decoys: exactly 7 × {fr,en} — offline-AI-generated plausible alternates: same category, observably-distinct behaviors, mutually distinct under normalizeText }`. The runtime guess grid is the seeded shuffle of [rule, …decoys]; `trueCandidateIndex` HIDDEN until reveal.

**Sample items (compressed; full decoy lists in the raw design).**

```json
[{ "id": "rh-ear-touch", "category": "gesture", "difficulty": "easy",
   "rule": { "fr": "Touche ton oreille avant chaque phrase que tu prononces.", "en": "Touch your ear before every sentence you say." },
   "decoys": "7 same-category alternates (touch head before questions, cross arms when looked at, nod on your name, blink twice before answering, hand behind back, point at interlocutor, smile when someone talks to the detective)" },
 { "id": "rh-no-yes", "category": "verbal", "difficulty": "medium",
   "rule": { "fr": "Interdiction de dire « oui » — trouve toujours une autre façon d'acquiescer.", "en": "Never say the word \"yes\" — always find another way to agree." },
   "decoys": "7 verbal alternates (never 'no', answer questions with questions, never first names, end sentences with 'voilà', never 'je', past tense only, repeat the last word spoken)" },
 { "id": "rh-relay-answer", "category": "social", "difficulty": "hard",
   "rule": { "fr": "Ne réponds jamais directement au détective : fais passer ta réponse par un autre joueur.", "en": "Never answer the detective directly: relay your answer through another player." },
   "decoys": "7 social alternates (no eye contact with the detective, ≤ 3-word answers, change seats when addressed, weather in every answer, ignore first question, repeat the question aloud, always address the whole group)" }]
```

**Scoring (exact).** Round guessed → each detective +4, each surviving follower +1, eliminated followers 0. Time-up AND perfect (zero convictions — the brief's "ni enfreinte ni devinée") → each follower +3, each detective +1. Time-up with infractions → surviving followers +2, eliminated followers +1 (they took the fall), detectives +1. Tribunals and wrong guesses move no points directly.

**Recommendations.**
- *"Un ou deux joueurs" — how many detectives?* Auto-scale: 1 for 4–7 players, 2 for 8–16, sharing one pool of 3 guesses (small rooms need followers to behave "normally"; one detective can't watch 12+ people; two detectives whispering theories is great content).
- *"X minutes" — clock length?* 180 s default (120–300 s param range); a full round ≈ 4.5 min, a 3-round session ≈ 13 min.
- *How does the app judge "la règle a été devinée" with no runtime AI?* 8-candidate multiple-choice grid, deterministic index compare; decoy generation/scoring is exactly the offline pipeline's job; UI nudges the detective to shout the guess before locking.
- *How are infractions detected when the app can't see the room?* Follower self-policing: 1 accusation token each → 25 s tribunal → conviction eliminates the breaker. The tribunal is the genius loop: every conviction is a giant clue ("what did Léa just do?"), creating the tension between enforcing the rule and feeding the enemy information.
- *Does ONE broken rule lose the round outright (strict brief reading)?* No — softened: a conviction eliminates the breaker and downgrades the team award; only a correct guess ends the round early; the brief's full condition survives as the perfect-round top prize. Instant team loss on one slip is rage-inducing and anti-brand.
- *Do detectives vote in tribunals?* No — they don't know the rule (pure noise + griefing vector); watching who gets accused IS their clue.
- *Hidden or public detectives?* Public, announced at briefing — faithful to the parlor game; hidden seekers would collapse this into SECRET_ROLE territory and kill the interrogation dynamic.

**Risks.** New template (Cadence A; schedule on the battle-tested kit). Decoy quality load-bearing (too obvious = guess #1 wins; near-duplicates = unguessable; offline plausibility + distinctness scoring + human gate). Honor-system core (round intro copy must sell "coûte que coûte"). Accusation griefing (1 token cap + majority tribunal + consolation point; monitor). **The pause/resume clock bank is the trickiest determinism surface on the platform so far** (event-`at` arithmetic only; explicit replay tests, interrupt-vs-deadline race, tiny-remainder resume). Spectator/redaction: the guess grid CONTAINS the true rule → omitted for unknown viewers; trueCandidateIndex never serialized pre-reveal; candidate order byte-identical across viewers; per-voter tribunal ballots never leave hidden state. Eliminated-player boredom (≤ ~3 min, resets every round; watch abandons). All-detectives-disconnect = followers cruise (rare, self-inflicted; room-collapse guard at < 3 connected).

---

### 2.17 `loup-garou` — Loup-Garou / Werewolf — NIGHT_DAY

**Mechanic.** Moderator-less werewolf: the app replaces the game master. Night cycles run as sequential role-gated sub-phases (seer peeks → wolves pick a victim seeing each other's votes → witch sees the victim and may heal/poison) under a decoy protocol — every player gets an identical-looking screen and taps something every night sub-phase, so neither shoulder-surfing nor early phase-end leaks who holds a role. Dawn resolves deaths atomically; the day is an IRL debate + simultaneous secret lynch vote. v1 roles: wolves, villagers, seer, witch.

**Phases.**

| Phase | Duration | Beat |
|---|---|---|
| `roleReveal` | 15 s | private role card (wolves also see the pack roster); all-ack or deadline |
| `night:r{n}:seer` | 25 s | seer picks; result echoed only to her (seerLog); others tap decoys; skipped if dead & revealRoleOnDeath, else runs decoy-only |
| `night:r{n}:wolves` | 30 s | wolves vote a victim, seeing each other's live picks (wolves-only view); plurality, tie → earliest first-vote (deterministic from event order); zero votes → no victim |
| `night:r{n}:witch` | 25 s | witch (only her) sees the pending victim; one heal + one poison per game, both usable the same night; timeout = no potions |
| `dawn:r{n}` | 10 s | atomic death resolution + narration card (roles iff revealRoleOnDeath); win-check |
| `debate:r{n}` | 90 s | IRL shouting; readyToVote early-exit (all alive ∧ connected) |
| `vote:r{n}` | 30 s | simultaneous secret lynch vote; first vote locks; self-vote inert; hasVoted booleans public, targets hidden; tie at top → no lynch |
| `lynch:r{n}` | 10 s | public reveal (evicted, tally, abstainers, role iff configured); win-check; `round_completed`; → next night or over |
| `over` | untimed | full reveal: all roles, winners, endReason; cloned gameOver scores; between-match interstitial only |

**Params.**

```json
{ "seerEnabled": true, "witchEnabled": true, "hunterEnabled": false, "maxWolves": 4,
  "revealRoleOnDeath": true, "lynchTieBreak": "noLynch", "witchSelfHeal": true, "maxRounds": 10,
  "roleRevealMs": 15000, "nightSeerMs": 25000, "nightWolvesMs": 30000, "nightWitchMs": 25000,
  "dawnMs": 10000, "debateMs": 90000, "voteMs": 30000, "lynchRevealMs": 10000 }
```

Role table (deterministic from seed): wolves = min(4, max(1, floor(n/4))) → 5–7p: 1, 8–11p: 2, 12–15p: 3, 16p: 4; +1 seer, +1 witch, rest villagers; `composition` public, assignments secret.

**Content item.** Flavor-only pack (mechanics never depend on content → themed reskins are pure config+pack): `{ id, type:'roleCard'|'narration', role? (roleCard), slot? ('night.intro'|'dawn.death'|'dawn.noDeath'|'lynch.wolf'|'lynch.villager'|'lynch.none'|'over.village'|'over.wolves'), name?:{fr,en}, text:{fr,en}, tags? }`. Exactly one roleCard per enabled role + ≥ 3 narration variants per slot (seeded draw, no repeated lines). `{victim}`/`{target}` tokens substituted client-side with nicknames.

**Sample items.**

```json
[{ "id": "rolecard-witch", "type": "roleCard", "role": "witch", "name": { "fr": "La Sorcière", "en": "The Witch" },
   "text": { "fr": "Tu possèdes deux potions pour toute la partie : une potion de vie pour sauver la victime des loups, et un poison pour éliminer un joueur. Chaque nuit, l'app te montre qui les loups ont croqué — à toi de décider.",
             "en": "You hold two potions for the whole game: one healing potion to save the wolves' victim, and one poison to take a player out. Each night the app shows you who the wolves bit — your call." } },
 { "id": "narration-night-intro-01", "type": "narration", "slot": "night.intro",
   "text": { "fr": "La nuit tombe sur le village. Tout le monde baisse les yeux sur son téléphone... et personne ne fait confiance à son voisin.",
             "en": "Night falls on the village. Everyone, eyes down on your phone... and nobody trust their neighbor." } },
 { "id": "narration-dawn-death-01", "type": "narration", "slot": "dawn.death",
   "text": { "fr": "Le soleil se lève sur le village... {victim} ne se réveillera plus jamais. Quelqu'un autour de cette table sait exactement pourquoi.",
             "en": "The sun rises over the village... {victim} will never wake again. Someone around this table knows exactly why." } }]
```

**Scoring (exact, match-end only).** villageWins → +2 each LIVING village-team player, +1 each dead village-team player, 0 wolves. wolvesWin (parity, or maxRounds tiebreak) → +3 each living wolf, +1 each dead wolf, +1 each village-team player (consolation). roomCollapsed → gameOver with current scores. Win-check order: zero wolves → village; wolves ≥ non-wolves → wolves; alive ∧ connected < 3 → roomCollapsed; round ≥ 10 → side with more alive (tie → wolves).

**Recommendations.**
- *SECRET_ROLE extension or new template?* NEW:NIGHT_DAY — confirmed (see §5.6). Impostor's skeleton is structurally opposite (no clues; wolves MUST see each other; sequential role-gated sub-phases; cross-role secret disclosure to the witch). A "mode" sharing ~0 % reducer code is the anti-pattern §7 Q1 warns against.
- *Minimal v1 role set?* Wolves + villagers + seer + witch. Hunter is v2 #1 — the only classic role with a death-triggered REACTIVE sub-phase, which is the single mechanic that complicates the linear night pipeline. v2 order: chasseur, cupidon, salvateur, capitaine, petite fille.
- *Role leaks in a same-room night?* The decoy protocol (above) — the template's signature trick, tested structurally (actor and non-actor view shapes have identical keys).
- *Reveal roles on death?* Yes by default (readable for casuals); the expert `false` variant keeps dead-role sub-phases running decoy-only so the skip itself can't leak which role died.
- *Ties?* Lynch tie → no lynch (deterministic, dramatic, no revote — impostor §4.5 verbatim). Wolf tie → earliest first-vote among tied (a no-kill night is anticlimactic; pure from the event log).
- *Dead-player spectating?* NOT omniscient — a dead player sees a living non-actor's view + own role/logs. Ghost-omniscience leaks through table talk in a same-room game.
- *Floor & wolf scaling:* minPlayers 5 ("best at 7+" copy); floor(n/4) table keeps wolves a strict minority at every count (parity win requires it).
- *Pacing & ads:* the catalog's long-form anchor (10–15 min match), honestly positioned; interstitial ONLY at the over boundary; aggressive timers + all-acted early-end everywhere; maxRounds cap.

**Risks.** **Largest redaction surface on the platform**: four secret classes (roles, wolf votes, seer log, witch state) + two deliberate asymmetric disclosures (wolf pack; the witch sees the victim) — a single leak kills the genre; leakedSecrets audits across every phase × 4 viewer kinds; build AFTER impostor on the hardened harness. Impostor-scale-or-more effort (the post-impostor flagship, not a quick add). Pacing strains the quick-rounds session model (positioning + timers). Shoulder-surfing mitigated, not eliminated (hold-to-peek, dimmed night screens). Sole-wolf permanent disconnect = kill-less nights (village lynches the silent seat; roomCollapse + maxRounds floors; playtest whether a replacement rule is needed). 5–6 player balance is swingy (tune from 5 % rollout analytics; village win-rate target ~55–65 %). Night-1 deaths spectate 10+ min (v2 ghost minigame / fast rematch — flagged, not solved).

---

## Section 3 — Template gap analysis (the consolidated set)

### 3.1 The ruling: 8 proposed new templates → 5

The raw wave-2 designs proposed 8 NEW templates (SCALE_GUESS, REVERSE_GUESS, PERFORM_RATE, TIMED_VERDICT, PERFORM_GUESS, LAST_STANDING, RULE_HUNT, NIGHT_DAY) — one per game, which is exactly the per-game-template sprawl the template-architecture doc exists to prevent. After consolidation:

| Consolidated template | Absorbs (proposed) | Serves (wave-2 games) | Also serves | Complexity |
|---|---|---|---|---|
| **PERFORM_JUDGE** | PERFORM_RATE + TIMED_VERDICT + PERFORM_GUESS (+ devine-l-action's TRUTH_DARE@2 rider) | mime-inverse (`puppet`), devine-l-objet (`credit`), devine-l-action (`guided`), double-le-mouvement (`rate`) | "Name 3 in 5s" as future `blitz` mode (resolves template-architecture §7 Q1); future packs: emotions, jobs, movies, songs, solo-mime, air-band | ~1.5–2 weeks (4 resolvers + 3-way redaction matrix + 4 client screen variants) — **~3–4 days/game effective** |
| **SPOTLIGHT_GUESS** | SCALE_GUESS + REVERSE_GUESS | jeu-de-la-note (`scale`, + `la-roue` config rider), devine-la-question (`reverse-question`) | future "sprint" 2-tier configs, spicy packs, themed scales | ~1–1.5 weeks (2 modes, shared spotlight/buffer/tier machine) |
| **LAST_STANDING** | (itself) | jeu-du-theme | future 18+ theme packs (config-only) | ~1 week |
| **RULE_HUNT** | (itself) | trouvez-la-regle | future rule packs (config-only) | ~1–1.5 weeks (pause/resume clock determinism is the hard part) |
| **NIGHT_DAY** | (itself) | loup-garou | mafia/vampire/space reskins (pure config+pack) | ~2–3 weeks (impostor-scale+; biggest redaction surface) |

### 3.2 PERFORM_JUDGE — the unified performance template

All four games share one skeleton: rotating spotlight/crew via `nextActiveSeat`, a secret prompt drawn from a seeded deck, a timed IRL performance with enum-only actions, room adjudication into a hidden buffer (allActed + deadline), an atomic reveal, `${phase}:${turnSeq}` keys, scoreboard ad slots, and the void-on-spotlight-leave rule. The differences are exactly three parameter axes plus per-mode resolvers:

- **`promptVisibility`**: `'performer'` (devine-l-objet, double-le-mouvement's mover) | `'others'` (mime-inverse, devine-l-action) | `'all'` (future blitz). This is a first-class, mode-tested redaction axis — designed in from day one, NOT retrofitted onto TRUTH_DARE (the "redaction footgun" the devine-l-objet raw spec correctly warns about; that warning is the reason devine-l-action moves here).
- **`adjudication`**: `'verdict'` (binary yes/no with threshold; mime-inverse, devine-l-action, blitz) | `'stars'` (1–5 average; double-le-mouvement) | `'claim-validate'` (performer claims WHO found it, room validates; devine-l-objet). The hidden buffer generalizes to `Record<PlayerId, enum|1..5>`; each adjudication is a pure resolver branch.
- **`claimBy` / `crewSize` / `earlyMajorityResolve` / pass-economy / point knobs**: small per-config scalars.

Compromises accepted per game: double-le-mouvement is the furthest outlier (crew of 2 + numeric ballots) — its mover/dubber pair is modeled as `crewSize: 2` with the dubber as a prompt-blind crew member, and the star buffer rides the generalized judgment buffer; devine-l-action gives up the TRUTH_DARE deck/pass code it hoped to reuse (pass economy and intensity tiers are re-homed in PERFORM_JUDGE's config — they were already in the PERFORM_GUESS spec); mime-inverse's "taps carry over as pre-cast verdict votes" stays a `puppet`-mode-only branch. The client cost does not fully consolidate: star-rater, verdict chips and claim-grid are distinct UI components — but inside ONE GameScreen package with shared scaffolding (countdown stage, role cards, reveal card), versus four full packages.

### 3.3 SPOTLIGHT_GUESS — secret-holder + converging guesses

Shared machine: rotating spotlight holds a per-round secret (a seeded number, or a pack `realIndex`); a spotlight-prep phase (target-read / answer-pick); an optional verbal beat (`talkMs`, 0 to skip); 1..N guess windows (`hintTiers` — 1 for scale, 3 with pack hints for reverse-question); a hidden guess buffer with allActed early-resolve; closeness/correctness scoring with a spotlight read-bonus; void-on-spotlight-leave; scoreboard cadence. Mode deltas: guess domain validation (integer dial vs candidate index), lock semantics (`lockOnSubmit` false for scale, true for reverse — the tier ladder demands commitment), and the per-mode scoring resolver (distance bands + lower-median vs tierPoints + per-correct reader bonus). Compromise: the two reveal renderings (dial plot vs candidate highlight) are separate client components; the reducer is genuinely one machine.

**Kept-single templates, justified:** LAST_STANDING's elimination loop, decaying shot clock and variable turn count are an outer machine none of the above has — forcing it into PERFORM_JUDGE would bloat the shared state with `alive` maps and per-lap clock math for one game (its bid to absorb `blitz` is rejected for the same reason: blitz has no elimination). RULE_HUNT's pausable banked clock + interrupt sub-phases are unique. NIGHT_DAY is self-evidently its own machine.

### 3.4 What existing templates cover (no new module)

| Template work | Games unlocked | Effort |
|---|---|---|
| **VOTE@1 as-is** | pires-potes (pack collapses to tracer's `{ prompts: string[] }`) | 0 — pure Cadence B |
| **VOTE@2** — one bundle: `ballotKind:'players'\|'options'`, `scoring:'vote-leader'\|'majority-herd'\|'predict-majority'`, `debateMs` (0=off) + `debateSkipThreshold`, `voteMs`/`revealMs` overrides, plus the already-planned `revealStyle`/`selfVoteAllowed`/`targetScore` | tu-preferes, gauche-ou-droite (+ Pass the Bloop from the vision; + pires-potes' exact timers) | ~2–3 days, one deploy |
| **TRUTH_DARE@1 as-is** | truth-or-dare-2 fun + lover (pure configs + packs) | 0 once the wave-1 module ships |
| **TRUTH_DARE@2** — `allowedChoices`, `escapeMode:'pass'\|'forfeit-draw'`, `labels` (+ pre-scoped `tierProgression`) | truth-or-drink + truth-or-forfeit sibling | ~1–2 days (note: `promptHiddenFromActive` is REMOVED from this scope — devine-l-action moved to PERFORM_JUDGE) |
| **SECRET_ROLE@2** — `roundMode:'elimination'\|'accusation'`, `clueMode:'turns'\|'none'`, `maxVoteRounds`, `revealRoleToSelf`, `impostorGuessEnabled` (+ already-planned `secretKind:'word'\|'directive'`) | double-jeu (+ NPC Infiltrator from the vision) | ~2–3 days, scheduled WITH the impostor build |
| **INPUT_GUESS v1** — modes `closest-number` then `crowd-target` (both zero-text; `collab-one-word` text mode and `fool`/`freestyle` deferred; `blitz` REMOVED from this template) | quizz-culture-ge, cinquante-cinquante | ~1 week for skeleton + both numeric modes — the missing template ships its two easiest slices first |

Net wave-2 honest bill: **5 new modules + 4 small template bumps + 1 planned module** cover all 17 games, versus the raw designs' implicit 8 new modules + 5 bumps. Every game thereafter multiplies config-only (siblings, spicy packs, themed reskins).

---

## Section 4 — Recommended build order

Wave-1 ordering (rank-friends → hot-seat → truth-or-dare → impostor, then INPUT_GUESS) is unchanged; wave 2 layers onto it. Within each wave, items are ordered.

### Wave A — config & small params on existing/in-flight templates (quick wins)

| # | Item | Unlocks | Rationale (one line) |
|---|---|---|---|
| A1 | `pires-potes` config + pack | 1 tile | Literally a tracer pack — zero code, ships the day the catalog plumbing exists. |
| A2 | VOTE@2 bundle | `tu-preferes`, `gauche-ou-droite` (+ Pass the Bloop) | One 2–3-day template bump turns three tiles into pure config, and permanently unlocks the option-ballot family. |
| A3 | `truth-or-dare-2` fun + lover configs/packs | 2 tiles | Pure Cadence B the moment wave-1 TRUTH_DARE ships; the cost is content volume, not code. |
| A4 | TRUTH_DARE@2 (`allowedChoices`/`escapeMode`/`labels`) | `truth-or-drink` + safe sibling | 1–2-day rider on a module being built anyway; 18+ flag/legal sign-off is the real gate, start it now. |
| A5 | SECRET_ROLE@2 (accusation mode) | `double-jeu` | Schedule the param branch WITH the impostor build so the module is parameterized once, not patched after. |

### Wave B — new templates with multi-game leverage

| # | Item | Unlocks | Rationale |
|---|---|---|---|
| B1 | INPUT_GUESS (`closest-number` → `crowd-target`) | `quizz-culture-ge`, `cinquante-cinquante` | The already-planned missing template, de-risked by building its two zero-text modes first — no moderation surface, pure numeric reducers. |
| B2 | **PERFORM_JUDGE** (`credit` → `puppet` → `guided` → `rate`) | `devine-l-objet`, `mime-inverse`, `devine-l-action`, `double-le-mouvement` | The single highest-leverage build of the whole wave: one module = four tiles (+ future blitz); start with `credit` (simplest adjudication), end with `rate` (crew of 2). |
| B3 | **SPOTLIGHT_GUESS** (`scale` → `reverse-question`) | `jeu-de-la-note` (+ `la-roue` config), `devine-la-question` | Two tiles + a free config rider; reuses rank-friends' hidden buffer + hot-seat's rotation; zero text, builds before the INPUT_GUESS text modes ever need to exist. |

### Wave C — heavy bespoke singles (each one game, honestly priced)

| # | Item | Unlocks | Rationale |
|---|---|---|---|
| C1 | **LAST_STANDING** | `jeu-du-theme` | Self-contained survival machine, smallest redaction surface of the new set — a good "first single-game template" while content pipelines mature. |
| C2 | **RULE_HUNT** | `trouvez-la-regle` | The pausable clock bank is the platform's trickiest determinism surface — build after the kit and replay harness are thoroughly battle-tested. |
| C3 | **NIGHT_DAY** | `loup-garou` | LAST, after impostor: the biggest redaction surface on the platform must land on the most-hardened audit harness; it is the long-form anchor, not a launch blocker. |

---

## Section 5 — Reconciliation with existing designs

### 5.1 `double-jeu` vs the impostor design (2026-06-10) — **COEXIST, one module**

Ruling: both games ship as separate catalog tiles on ONE SECRET_ROLE module. The impostor design doc remains the canonical module spec (state, redaction rules, role table, tie rulings — double-jeu reuses §4.5 ties and §3 redaction verbatim); double-jeu is a `game_config` plus the SECRET_ROLE@2 additive param branch (`roundMode:'accusation'`, `clueMode:'none'`, `maxVoteRounds:2`, `revealRoleToSelf:false`, `impostorGuessEnabled:false`). Rationale: the two are different player fantasies (structured clue-bluffing flagship vs free-talk accusation paranoia) over an ~80 %-identical reducer/redaction skeleton; a separate ODD_ONE_OUT template would duplicate that skeleton and double the registry/catalog surface. The @2 params are designed into the module during the impostor build (wave-1 #4), not bolted on after.

### 5.2 `truth-or-dare-2` vs the truth-or-dare design (2026-06-10) — **INSTANTIATE (no supersession)**

Ruling: truth-or-dare-2 is not a design at all in the module sense — it is two `game_config` + pack families (fun, lover) on the existing TRUTH_DARE template, exactly the "config-only per variant" cell of the template-architecture effort taxonomy. The 2026-06-10 design doc stays the sole authoritative module spec, untouched. Catalog note: `truth-or-dare-fun-2026` becomes the flagship all-ages tile (its pack physically contains no spicy entries, removing the dormant-spicy-tier ambiguity the generic `tod-classic` pack carried); the lover tile is gated by the still-open ToD §9 Q2 product/legal sign-off. One pre-scoped, non-blocking @2 param is registered from this wave: `tierProgression:'fixed-highest'|'escalate'` (lover rooms currently open straight at spicy — playtest first).

### 5.3 `truth-or-drink` vs the truth-or-dare design — **COEXIST via TRUTH_DARE@2 additive params**

Ruling: same module, version-bumped with three strictly additive params (`allowedChoices`, `escapeMode`, `labels`); every existing config keeps defaults and is untouched. The forfeit pool reuses `choice:'dare'` rows — zero new content schema, zero new redaction surface. The drink config is 18+ behind the spicy flag with the alcohol-compliance lint; the safe `truth-or-forfeit` sibling is the default-surfaced variant.

### 5.4 `devine-l-action` — **MOVED: TRUTH_DARE@2 proposal superseded by PERFORM_JUDGE `guided`**

The raw devine-l-action design proposed riding TRUTH_DARE@2 with `promptHiddenFromActive`; the raw devine-l-objet design independently argued that conditional prompt-visibility inside TRUTH_DARE is a redaction footgun (its views are public-prompt-by-design) and that the two games share one mechanic ("même mécanique" per the brief). Ruling: devine-l-objet's argument wins. devine-l-action ships as a PERFORM_JUDGE `guided` config; TRUTH_DARE@2's scope SHRINKS to truth-or-drink's three params (no `promptHiddenFromActive`, no `choiceMode:'fixed-action'`, no `helperPoints` in TRUTH_DARE — they live in PERFORM_JUDGE). All of devine-l-action's content design (the 5 help channels, pre-paired at authoring; forbidden words; safety lints) carries over unchanged.

### 5.5 The "Name 3 in 5s" (blitz) double-claim — **PERFORM_JUDGE wins; template-architecture §7 Q1 resolved**

Both mime-inverse (as TIMED_VERDICT `blitz`) and jeu-du-theme (as a LAST_STANDING config "with elimination off") claimed the vision's blitz concept. Ruling: blitz = spotlight + public prompt + short timer + peer-tap validation — that is PERFORM_JUDGE's exact skeleton with `promptVisibility:'all'` and a 5 s timer; LAST_STANDING's claim requires disabling its own core loop (elimination, decaying clock). Blitz becomes a future PERFORM_JUDGE mode/config; per the standing question in template-architecture §7 Q1, **INPUT_GUESS slims to its non-performative modes** (`closest-number`, `crowd-target`, later `collab-one-word`/`fool`/`freestyle`) and the "timed verdict" family has a home.

### 5.6 `loup-garou` / `trouvez-la-regle` vs SECRET_ROLE — **confirmed NEW templates**

Both raw designs correctly self-assessed against the template-architecture honesty test and are upheld: werewolf shares ~0 % reducer code with impostor (sequential role-gated night sub-phases, mandatory wolf mutual visibility, cross-role disclosure to the witch — each structurally opposite to an impostor invariant); rule-hunt inverts the secrecy direction entirely (public seekers, majority-held secret, pausable clock). Neither is a SECRET_ROLE mode.

---

## Section 6 — Offline AI content pipeline requirements

All packs (every game) go through the standard template-architecture §6 gate: schema validation, sizing lints, obscenity scan, replay smoke with `leakedSecrets`, human playtest before `enabled:true` / rolloutPct promotion — plus the wave-2-wide rule that **bilingual authoring masters are split into single-locale sibling packs (`<base>-fr` / `<base>-en`) at publish**, with per-locale naturalness sign-off (transcreation, never literal translation). Beyond that baseline, these games need PRE-COMPUTED AI data baked into pack items (never computed at runtime — the deterministic-replay contract forbids it):

| Game | needsOfflineAiPipeline | Exactly what the pipeline pre-computes |
|---|---|---|
| `cinquante-cinquante` | **yes** | `crowdYesPct` per completion **per locale** (LLM persona-ensemble ≥ 20 demographic personas, majority-vote, temperature-varied, calibrated on real published polls, provenance stored) + distribution lints (pairwise ≥ 3 distinct, ≥ 1 card within 12 of target, ≤ 1 in bullseye window, target-flavor mix ⅓/⅓/⅓) |
| `quizz-culture-ge` | **yes** | verified numeric `answer` + `source` + `verifiedAt` per question (AI-drafted, human fact-checked — non-negotiable gate); `funFact` punchlines natively funny per locale; time-stable-facts lint; `scale` rendering hint |
| `devine-la-question` | **yes** | decoy questions + progressive hints generation, then **cross-plausibility scoring** (every answer option must plausibly answer the real question AND all 4 decoys; hints narrow without revealing) with auto-reject below threshold, **per locale independently** |
| `trouvez-la-regle` | **yes** | exactly 7 decoy rules per item: plausibility scoring + mutual distinctness under `normalizeText` + same-category constraint, per locale |
| `jeu-du-theme` | **yes** | per-(theme × letter × locale) feasibility scoring — letter lists pass the ≥ 15-common-words gate (LLM + wordlist cross-check); `exampleWords` QA evidence generated then STRIPPED at publish |
| `double-jeu` | **yes** | `closeness` (semantic distance) scoring of each majority/impostor pair, **per locale** (pairs must be equally hard in FR and EN); v2: pre-rendered slightly-different image pairs (generated + QA'd offline, R2-hosted) |
| `devine-l-action` | **yes** | action × help-channel pre-pairing (feasible AND funny combos only) + `difficulty` pre-scoring + physical-safety lint (no climbing/chugging/blindfolds/non-players), human-reviewed |
| `gauche-ou-droite` | no (v2: yes) | nothing at launch; v2 option: `crowdPct` per item if the "what the internet thinks" beat is ever wanted |
| `tu-preferes`, `pires-potes`, `truth-or-dare-2`, `truth-or-drink`, `jeu-de-la-note`, `double-le-mouvement`, `mime-inverse`, `devine-l-objet`, `loup-garou` | no | no pre-computed values — but AI-ASSISTED drafting at volume is recommended (e.g. ~770 bilingual ToD2 entries, 150+ pires-potes cards/locale/tier, 200+ dilemmas) behind the same human gate; pires-potes additionally needs a similarity audit against the "Amis de merde" published deck |

Pipeline build note: the highest-stakes pre-compute surfaces are cinquante-cinquante's percentages (player trust) and quizz-culture-ge's verified answers (factual correctness) — both ship in wave B1, so the persona-ensemble estimator and the fact-check workflow are the first two pipeline components to build. The scoring/lint components (closeness, cross-plausibility, letter feasibility, decoy distinctness) follow with waves B2–C2.

