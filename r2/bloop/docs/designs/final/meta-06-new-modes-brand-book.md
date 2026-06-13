# Meta-06 — The Three Brand-Book Modes (FINAL, DECIDED)

| Field | Value |
|---|---|
| **Domain** | `new-modes` — the three modes the Bloop Brand Book v1.0 proposed but that were never designed or built: **Who Said That?**, **Courtroom**, **Red Flag / Green Flag**. |
| **Status** | **FINAL / DECIDED.** Each mode is brought to the exact bar of a wave-2 §2 entry (mechanic, phases+durations, params, content shape with 3 bilingual samples, exact scoring, redaction, players, spicy, template mapping, build-cost class). No TBD inside the mechanics; open *product* calls (with my recommendation) are isolated at the bottom. |
| **Grounds in** | Brand Book v1.0 (`docs/da/brand/bloop-brand-book-v1.pdf`, mode list + monetisation/a11y rules); `2026-06-11-wave2-17-games-design.md` §2 (entry format) / §3.4 (VOTE@1/@2 + INPUT_GUESS coverage) / §5 (reconciliation pattern) / §6 (offline AI gate); `2026-06-12-content-voice-guide.md` (editorial law — evidence→verdict, conflict-is-the-product, hard floor); `2026-06-10-cross-game-synthesis.md` §1.7 (placement-XP), §1.3 (skip-quorum over connected set); the shipped modules `packages/games/option-vote` (VOTE@2), `packages/games/input-guess` (INPUT_GUESS), `packages/games/tracer` (VOTE@1), `packages/games/secret-role` (per-viewer redaction), `packages/games/hot-seat` (rotating-spotlight redaction + attribution reveal). |
| **Platform invariants honored** | Anonymous forever (no accounts/profiles); CF Durable Objects + KV catalog + R2 packs; pure-TS GameModule (server-authoritative, per-viewer redaction, seeded RNG, NO wall-clock / ambient-RNG, NO live AI at runtime — AI is offline pipeline only); React-Native/Expo client; ads-only; ad interstitial fires CLIENT-SIDE off the `phaseKey → over` / `scoreboard:*` transition; cross-game XP is **placement-based, not raw points**. |

---

## Decisions (the short list)

1. **All three modes are zero-new-module: each is a `game_config` + R2 pack on an EXISTING shipped template, plus at most one small additive param branch.** No new GameModule is created. This is exactly the wave-2 §3.4 reuse pattern that turned `pires-potes`/`tu-preferes`/`gauche-ou-droite` into config — the brand book's "INPUT_GUESS+VOTE / VOTE / VOTE@2" framings map cleanly onto the modules we already shipped.
   - **Who Said That?** → **VOTE@2 `attribution`** mode on `option-vote` (one new additive scoring branch + a wider ballot domain). Build-cost class **B (small param)**, ~2–3 days, bundled with the VOTE@2 work.
   - **Courtroom** → **VOTE@2 `majority-herd` + debate**, pure config on `option-vote` AS SHIPPED today (verdict ballot + the existing `debate` phase). Build-cost class **A (config-only)**, 0 new code.
   - **Red Flag / Green Flag** → **VOTE@2 `predict-majority` + debate**, pure config on `option-vote` AS SHIPPED today (the `tu-preferes` scoring path with `debateMs > 0`). Build-cost class **A (config-only)**, 0 new code.
2. **The free-text moderation surface that killed "Who Said That?" in the brand book is designed OUT, not in.** Players never type. Each round is a **pack-authored prompt with 4–6 pre-written answer cards**; each present player privately **claims one card as "the one that's most me"** (an honest self-pick, like `crowd-target`'s pick), and the room then **attributes each revealed card to a player by voting a roster member** (the VOTE@1 ballot domain). Attribution is a tap on an avatar, never a free-text guess about who wrote what. This keeps the "whose answer is this?!" party beat with **zero UGC** (synthesis §6 gate trivially satisfied — `needsOfflineAiPipeline:false`).
3. **Courtroom and Red Flag / Green Flag require literally NO code** — they are catalog rows + packs on the already-merged `option-vote` module. Courtroom is the **verdict** flavor of `gauche-ou-droite` (a two-option ballot — GUILTY/NOT GUILTY — with the debate phase as the "advocates argue" beat). Red Flag / Green Flag is the **predict-the-room** flavor of `tu-preferes` with the debate phase switched on (red/green ballot + a correct-majority-prediction score + debate). The only "design" work is the pack, the axis labels, and the timers.
4. **The debate phase is the brand-book "advocates argue" / "debate" beat, verbatim — it already exists in `option-vote`** (`debateMs`, `debateSkipThreshold`, skip-quorum over the *connected* set, `debateStarter` one-liner as fuel). No advocate role, no turn order, no typed argument is modeled: arguing is IRL, the phone is a timer + a "On passe / Next" skip button. This is the same ruling wave-2 made for `gauche-ou-droite` and `loup-garou`'s day debate.
5. **Spicy posture (binds to meta-03):** all three launch **spicy-0 (classic, all-ages, `tone:'classic'`)**. Red Flag / Green Flag and Who Said That? each get a **decided-but-deferred `spicy-1` (taboo-adjacent, opt-in toggle, NOT 18+) sibling pack** (dating/ex material) — pure Cadence B, no new code. Courtroom stays spicy-0-only (a mock trial of a *behavior* is funniest clean; 18+ accusations drift toward the hard floor). No 18+/`spicy-2` sibling for any of the three at any horizon.
6. **Redaction reuses an already-audited shape per mode.** Courtroom and Red Flag inherit `option-vote`'s exact redaction (`hasSubmitted` booleans + owner-echo `myBallot`; ballots hidden until the atomic reveal — for Red Flag the `predict` field stays private forever, only `awarded` is public). Who Said That?'s `attribution` mode adds ONE new per-round secret class — the **author→card map** — handled with the HOT_SEAT/`crowd-target` pattern (self-picks live in the hidden buffer; promoted atomically at the attribution reveal); the field-level `leakedSecrets` audit treats each player's self-pick as a secret owned by that player until reveal.
7. **All three obey the platform ad rule unchanged:** the interstitial fires client-side off `phaseKey` reaching `over` (and, where a mid-game scoreboard beat exists, `scoreboard:*`) — never a reducer effect. `option-vote` already emits `round_completed` at the debate/round boundary and `gameOver` at `over`; nothing in these three configs changes that.

---

## 0. Why these three, why now, and the one-line reuse map

The Brand Book v1.0 listed three modes it wanted but never speced: **Who Said That?** ("INPUT_GUESS + VOTE"), **Courtroom** ("VOTE"), **Red Flag / Green Flag** ("VOTE/debate"). Wave-2 already built the machinery all three need and never claimed them:

| Brand-book mode | Brand-book framing | Decided template (shipped module) | New code? | Build-cost class |
|---|---|---|---|---|
| **Who Said That?** | INPUT_GUESS + VOTE-style attribution | **VOTE@2 `attribution`** (`option-vote` + 1 additive scoring branch + roster ballot domain) | small param branch | **B** (~2–3 days, rides the VOTE@2 bundle) |
| **Courtroom** | VOTE | **VOTE@2 `majority-herd` + debate** (`option-vote` config, as shipped) | none | **A** (config-only, 0 days code) |
| **Red Flag / Green Flag** | VOTE@2 predict-majority + debate | **VOTE@2 `predict-majority` + debate** (`option-vote` config, as shipped) | none | **A** (config-only, 0 days code) |

The reuse base is **`packages/games/option-vote/src/option-vote.ts`** (the wave-2 VOTE@2 module). It already ships:
- a two-option hidden ballot with atomic reveal (`resolveChoose`),
- BOTH scoring modes the brand book needs: `majority-herd` (Courtroom) and `predict-majority` (Red Flag),
- the **debate phase** with `debateStarter` fuel and a connected-set skip-quorum (Courtroom + Red Flag "argue" beat),
- public avatar-chip reveal (`picks` + `awarded`), the `minorityCount` superlative, `round_completed`/`gameOver` effects, and the placement-XP-compatible match-local `scores`.

So two of the three are **pure catalog rows today**, and the third is one additive branch on the same module — the cheapest possible way to ship three brand-book-promised tiles.

**Build-cost class legend** (matches wave-2 §3.4 / template-arch effort taxonomy):
- **A — config-only:** a `game_config` + pack(s); zero TypeScript; ships the day the catalog plumbing + pack exist.
- **B — small param:** one additive, backward-compatible param branch on an existing module (existing configs untouched); ~1–3 days incl. tests.
- **C — new module:** a new GameModule. **None of these three is class C.**

---

## 1. `qui-a-dit-ca` — Who Said That? — VOTE@2 `attribution` (build-cost **B**)

### Mechanic

The party "whose answer is THIS?!" beat, made UGC-free. Each round shows a pack-authored prompt ("The most unhinged thing in this room's group chat is…") and **4–6 pre-written answer cards**. Every present player privately **claims the one card that is most _them_** (honest self-pick — the same secret-buffer move as `crowd-target`). The reveal then shows the cards that were actually claimed, anonymised, and the room **attributes each claimed card to a player** by tapping the avatar they think owns it (the VOTE@1 roster-ballot domain). Points go to **correct attributors** and to players whose card **fooled the room** (nobody guessed them). No one types; the comedy is the mismatch between who you'd expect and who actually owns the card.

> Why this and not "submit a free-text answer, then attribute it" (the brand-book literal): free text is the moderation surface the brand book itself flagged as the reason this mode was deferred, and it is undecidable to score (you can't deterministically match a typed guess to a typed author). The pack-authored hand keeps all three beats — read the prompt, own a card, guess who owns each card — with zero UGC, exactly as `cinquante-cinquante` redesigned its free-text completion into a pre-scored hand (§2.5).

### Phases

| Phase | Duration | Beat |
|---|---|---|
| `claim:r{n}` | 18 s | prompt + 4–6 seed-shuffled cards (identical order for all viewers); each present player taps the ONE card "that's most me" into the HIDDEN buffer (owner-echo only); early-resolve on allActed(connected); timeout = no claim, excluded from this round's attribution pool |
| `attribute:r{n}` | 25 s | the **claimed** cards are revealed anonymised (text only, no owner); for each claimed card the room privately attributes it to a roster player (one tap per card; partial submissions allowed); hidden buffer; early-resolve on allActed(connected); timeout = unattributed cards score nobody |
| `reveal:r{n}` | 8 s | atomic: each card's true owner pops with their avatar; ✅ badges on correct attributors; "🎭 personne ne t'a trouvé" fooled-the-room badge; +points count-up; emits `round_revealed`; → next round or over |
| `over` | untimed | podium; "Le caméléon / The Chameleon" (most-fooling) + "Profiler" (best attributor) superlatives; cloned `gameOver` scores; placement → session XP |

Two working phases + reveal, mirroring `option-vote`'s `choose → reveal` shape (here `claim → attribute → reveal`). No mid-game scoreboard phase (rounds are short; the ad fires only at `over`).

### Params

```json
{ "scoring": "attribution", "ballotKind": "self-claim", "totalRounds": 7,
  "cardsPerRound": 6, "claimMs": 18000, "attributeMs": 25000, "revealMs": 8000,
  "debateMs": 0, "debateSkipThreshold": 0.5,
  "pointsCorrectAttribution": 1, "pointsFooledTheRoom": 2, "anonymousClaims": true }
```

`scoring:"attribution"` is the ONE new additive branch on `OptionVoteScoring` (today `'predict-majority' | 'majority-herd'`); `ballotKind:"self-claim"` + `cardsPerRound` are the only new config fields. Existing `tu-preferes`/`gauche-ou-droite` configs are untouched (they never set these). `debateMs:0` disables the debate phase (this mode's tension is the attribution, not an argument).

### Content item shape

One round = one prompt + a hand of cards. **All text is pack-authored** (zero UGC):

```ts
{ id, prompt: {fr,en} (≤120 chars, "complete this about someone in the room"),
  cards: 4..6 × { id:'a'..'f', text: {fr,en} (≤90 chars, a plausible self-claim) },
  category: 'chat'|'social'|'confession'|'habits'|'group', spicy: 0|1, tags? }
```

At `init`: seed-shuffle items, take `totalRounds`; per item seed-shuffle the cards once (identical order for all viewers — the `crowd-target` pattern). Pool ≥ `totalRounds × 3` per category mix (~120+ items). Cards must be **self-claimable by anyone** (no card presupposes a specific player) — the offline lint target, but no AI *scoring* is needed (`needsOfflineAiPipeline:false`; AI-assisted drafting only, behind the §6 human gate).

### 3 bilingual samples

```json
[{ "id": "wsdt-chat-001", "category": "chat", "spicy": 0,
   "prompt": { "fr": "Dans le groupe WhatsApp, c'est toi qui…",
               "en": "In the group chat, you're the one who…" },
   "cards": [
     { "id": "a", "text": { "fr": "laisse en vu pendant 3 jours puis répond « dsl j'avais pas vu »", "en": "leaves it on read for 3 days then says 'sry didn't see this'" } },
     { "id": "b", "text": { "fr": "envoie 14 messages d'affilée pour une seule idée", "en": "sends 14 messages in a row for one single thought" } },
     { "id": "c", "text": { "fr": "réagit 😂 et participe jamais", "en": "💀-reacts and never actually replies" } },
     { "id": "d", "text": { "fr": "lance le sondage pour la sortie que personne fera jamais", "en": "starts the poll for the hangout that will never happen" } },
     { "id": "e", "text": { "fr": "balance le screen de la conversation privée au pire moment", "en": "drops the screenshot of the private DM at the worst possible time" } },
     { "id": "f", "text": { "fr": "vocal de 7 minutes à 2h du mat", "en": "7-minute voice note at 2am" } } ] },
 { "id": "wsdt-confession-014", "category": "confession", "spicy": 0,
   "prompt": { "fr": "Le crime que cette personne a déjà commis sans aucun remords…",
               "en": "The crime this person has absolutely committed with zero remorse…" },
   "cards": [
     { "id": "a", "text": { "fr": "a mangé un truc d'un·e coloc et nié en bloc", "en": "ate a flatmate's food and denied it to their face" } },
     { "id": "b", "text": { "fr": "a ghosté quelqu'un présent dans cette pièce", "en": "ghosted someone currently in this room" } },
     { "id": "c", "text": { "fr": "a stalké un ex jusqu'en 2019 à 3h du mat", "en": "stalked an ex back to 2019 at 3am" } },
     { "id": "d", "text": { "fr": "a dit « je suis là dans 5 min » en sortant juste de la douche", "en": "said 'I'm 5 min away' while still in the shower" } },
     { "id": "e", "text": { "fr": "a liké une photo de 2018 par accident… assumé", "en": "accident-liked a 2018 photo… and owned it" } } ] },
 { "id": "wsdt-habits-027", "category": "habits", "spicy": 0,
   "prompt": { "fr": "Le red flag de coloc' qui colle parfaitement à quelqu'un ici…",
               "en": "The roommate red flag that fits someone here perfectly…" },
   "cards": [
     { "id": "a", "text": { "fr": "vaisselle « à tremper » depuis le mandat de Hollande", "en": "dishes 'soaking' since the last presidential term" } },
     { "id": "b", "text": { "fr": "thermostat à 26°C en plein hiver, facture partagée", "en": "thermostat at 79°F mid-winter, bill split equally" } },
     { "id": "c", "text": { "fr": "ramène l'after sans prévenir, à 4h, à 11 personnes", "en": "brings the afterparty home unannounced, 4am, 11 people" } },
     { "id": "d", "text": { "fr": "parle au téléphone en haut-parleur dans toutes les pièces", "en": "takes every call on speaker, every room" } } ] }]
```

### Scoring (exact)

Resolved in `attribute → reveal`. Let `owner(c)` = the player whose claim was card `c` (from the hidden claim buffer). For each present attributor `a` and each claimed card `c` they attributed to player `t`:
- **Correct attribution:** if `t === owner(c)`, attributor `a` gets `+pointsCorrectAttribution` (**+1**). (One point per card guessed right; a player can score up to one point per claimed card they attributed correctly.)
- **Fooled the room:** for each owner `o`, if **zero** attributors guessed `o`'s card correctly, `o` gets `+pointsFooledTheRoom` (**+2**) — being unreadable is the flex. (Requires ≥1 attribution attempt on that card; an entirely un-attributed card scores nobody.)
- Self-attribution is inert (you can't be asked to attribute your own card — your own claimed card is omitted from the cards YOU attribute). Timeout/non-claimers are not owners and score nothing. Non-attributors score nothing.

Match-local `scores`; the shell awards session XP off placement (§1.7), so the 1/2 internal scale never needs to match other games. Degenerate guard: at exactly 3 players each round has ≤3 claimed cards and 2 attributable per player — meaningful; below `minPlayers:4` the attribution collapses (see Players), so config-tighten to 4.

### Redaction

Two hidden secret classes, both promoted atomically at `reveal`:
1. **Claim buffer** (`claim` phase): each player's self-picked card index. Exposed via `hasSubmitted` booleans + owner-echo only — the HOT_SEAT `answers`/`option-vote` `ballots` pattern verbatim. NEVER any other player's claim value pre-reveal.
2. **Attribution buffer** (`attribute` phase): each player's card→player guesses. Same boolean+owner-echo redaction. The **author→card map is the load-bearing secret** — `attribute`-phase views show claimed card TEXT (anonymised) but never the owner; `owner(c)` is only revealed at the atomic `reveal`. `leakedSecrets` audit treats each player's claim and each player's attributions as per-owner secrets; field-level test asserts the serialized `claim`/`attribute` views contain no owner map and no other player's buffer entry. Unknown/spectator viewers get the public projection minus any owner-echo (always safe).

### Players / spicy / template

- **Players:** **4–16** (config-tighten from `option-vote`'s `minPlayers:3`; at 3 the attribution pool is too thin to fool anyone). Sweet spot 5–10.
- **Spicy:** launch **spicy-0** (`qui-a-dit-ca`, all-ages). Decided-but-deferred **spicy-1 sibling** (`qui-a-dit-ca-cash`, taboo-adjacent dating/ex/phone-stakes cards, opt-in toggle, NOT 18+ — meta-03 tier-1) — pure pack swap. No 18+ sibling.
- **Template mapping:** **VOTE@2 `attribution`** mode on `option-vote`. It is **config + a small param** (build-cost **B**): one new `scoring` branch (`'attribution'`), one new `ballotKind` (`'self-claim'`), a second hidden buffer for attributions, and the card-hand fields — bundled with the existing VOTE@2 work, ~2–3 days incl. tests. Everything else (init/shuffle, hidden-buffer plumbing, atomic reveal, `round_completed`/`gameOver`, debate-off path) reuses the shipped module. `needsOfflineAiPipeline:false`.

---

## 2. `le-tribunal` — Courtroom — VOTE@2 `majority-herd` + debate (build-cost **A, config-only**)

### Mechanic

A playful trial. Each round the app reads an **accusation** ("L'accusé a déjà fait semblant d'aimer un cadeau pour ne pas vexer mamie") and the room votes a **verdict — COUPABLE / NON COUPABLE** (GUILTY / NOT GUILTY) into a hidden ballot. The reveal shows the verdict split with avatar chips ("WHO voted guilty?!"), the majority verdict is rendered as the court's ruling, and a timed **deliberation/argument beat** (the brand-book "advocates argue") follows — fueled by a pack-authored `debateStarter` one-liner ("La défense plaide : on a TOUS déjà fait ça") — before the next case. Phones vote; the room argues; the app is judge's gavel + timer.

This is mechanically **`gauche-ou-droite` with a verdict axis** — a two-option ballot (`majority-herd` scoring) plus the debate phase — so it is literally a different pack + different axis labels on the **already-merged** `option-vote` module. No advocate role is modeled (arguing is IRL); "advocates argue" is the existing `debate` phase, exactly as wave-2 ruled for `gauche-ou-droite`.

### Phases (the shipped `option-vote` phases, verbatim)

| Phase | Duration | Beat |
|---|---|---|
| `vote:r{n}` (internal `choose`) | 15 s | the accusation fills the screen; secret COUPABLE/NON COUPABLE vote into the HIDDEN buffer; early-resolve on allActed(connected); timeout = non-voters score 0 |
| `reveal:r{n}` | 7 s | atomic split bars + avatar chips per verdict; the court's ruling crowned (majority side); +1 to majority voters; exact tie = "Délibération sans majorité" sticker, no points; emits `round_revealed` |
| `debate:r{n}` | 35 s | `debateStarter` ("plaidoirie") one-liner + countdown; arguing is IRL; ends early when >50% of connected players tap "Verdict suivant"; emits `round_completed` at the boundary (the ad-cue) |
| `over` | untimed | scoreboard; winner = "Juré en chef / Head Juror" (most-with-the-majority); non-scoring "L'avocat·e du diable / Devil's Advocate" from `minorityCount`; cloned `gameOver` scores |

### Params (a `game_config` only — no new fields)

```json
{ "scoring": "majority-herd", "totalRounds": 7,
  "chooseMs": 15000, "revealMs": 7000, "debateMs": 35000, "debateSkipThreshold": 0.5,
  "pointsCorrect": 1 }
```

Identical SHAPE to `GAUCHE_DROITE_CONFIG` in `packages/games/option-vote/src/state.ts` (only timer/round values differ if desired). The pack supplies the COUPABLE/NON COUPABLE axis labels (`optionA`/`optionB` per item) and the `debateStarter`. **Zero TypeScript.**

### Content item shape

Reuses `OptionVoteItem` exactly (`optionA`/`optionB` = the two verdicts, repeated per item by the pack build; `prompt` = the accusation; `debateStarter` = the one-line plaidoirie):

```ts
{ id, prompt: {fr,en} (≤120 chars — the accusation, an evidence-then-charge line),
  optionA: {fr,en} ("Coupable"/"Guilty"), optionB: {fr,en} ("Non coupable"/"Not guilty"),
  emoji?, debateStarter: {fr,en} (≤120 chars — the defence/prosecution hook),
  category: 'pettyCrime'|'social'|'datingCourt'|'foodCrime'|'roommate', spicy: 0, tags? }
```

The two options are constant across the pack (every item is the same GUILTY/NOT GUILTY ballot); the pack build repeats them so the runtime stays the generic `OptionVoteItem`. Pool ≥ 7 per category mix (~80+ items; the `category` drives variety, not a runtime filter).

### 3 bilingual samples

```json
[{ "id": "trib-foodcrime-003", "category": "foodCrime", "spicy": 0, "emoji": "🍍",
   "prompt": { "fr": "L'accusé met de l'ananas sur la pizza ET le défend en public.",
               "en": "The defendant puts pineapple on pizza AND defends it in public." },
   "optionA": { "fr": "Coupable", "en": "Guilty" },
   "optionB": { "fr": "Non coupable", "en": "Not guilty" },
   "debateStarter": { "fr": "La défense plaide le goût. Le ministère public plaide le crime contre l'humanité.",
                      "en": "The defence pleads good taste. The prosecution pleads crime against humanity." } },
 { "id": "trib-social-018", "category": "social", "spicy": 0, "emoji": "🎁",
   "prompt": { "fr": "L'accusé a fait semblant d'adorer un cadeau pourri pour ne pas vexer sa daronne.",
               "en": "The defendant faked loving an awful gift just to not hurt their mum's feelings." },
   "optionA": { "fr": "Coupable", "en": "Guilty" },
   "optionB": { "fr": "Non coupable", "en": "Not guilty" },
   "debateStarter": { "fr": "Mensonge éhonté, ou seul comportement décent possible ? Le jury tranche.",
                      "en": "Bald-faced lie, or the only decent move available? The jury decides." } },
 { "id": "trib-datingcourt-031", "category": "datingCourt", "spicy": 0, "emoji": "📱",
   "prompt": { "fr": "L'accusé a répondu « haha » tout court à un message qui méritait une vraie réponse.",
               "en": "The defendant replied just 'haha' to a text that deserved an actual answer." },
   "optionA": { "fr": "Coupable", "en": "Guilty" },
   "optionB": { "fr": "Non coupable", "en": "Not guilty" },
   "debateStarter": { "fr": "Crime de désintérêt prémédité, ou la personne avait juste pas d'énergie ? Plaidez.",
                      "en": "Premeditated disinterest, or were they simply out of social battery? Make your case." } }]
```

### Scoring (exact)

`option-vote` `majority-herd` resolver, verbatim (`resolveChoose`): count COUPABLE vs NON COUPABLE over SUBMITTED votes only. Strict-majority verdict → each of its voters **+1** (`pointsCorrect`); exact tie (incl. zero votes) → **0** for all + "hung jury" splash; timeout non-voters always 0. Minority voters feed the non-scoring `minorityCount` → end-screen "Devil's Advocate" superlative (display-only, never negative). Match-local; placement → session XP.

> Design note: "read the room" (herd) scoring, NOT "the correct verdict." There is no ground-truth guilt — the comedy is the split and the argument, so siding with the majority is the only scoreable axis. This is the same call wave-2 made for `gauche-ou-droite`.

### Redaction

Inherits `option-vote` redaction unchanged: ballots HIDDEN until the atomic `reveal` (`hasSubmitted` booleans + owner-echo `myBallot`); `picks` and `awarded` public only at reveal; debate `skips` public as a count only. Already `leakedSecrets`-audited by the shipped module — **no new redaction surface.**

### Players / spicy / template

- **Players:** **3–16** (`option-vote` default). Sweet spot 4–12 (more jurors = louder split).
- **Spicy:** **spicy-0 only, every horizon.** A mock trial of an absurd *behaviour* is funniest clean; 18+ accusations drift toward the meta-03 hard floor (real private individuals, sexual frankness about someone present). No spicy sibling. The editorial floor (no real politicians/celebrities-as-criminals, no protected-trait charges) is the §3 lint.
- **Template mapping:** **VOTE@2 `majority-herd` + debate**, a **`game_config` on `option-vote` AS SHIPPED** — build-cost **A**, **0 lines of TypeScript**. Ships the day the pack + catalog row exist. `needsOfflineAiPipeline:false` (AI-assisted drafting only, behind the §6 gate).

---

## 3. `red-flag-green-flag` — Red Flag / Green Flag — VOTE@2 `predict-majority` + debate (build-cost **A, config-only**)

### Mechanic

The dating-radar party game. Each round shows a **trait or behaviour** ("Te texte « bonne nuit » tous les soirs sans exception") and every player makes **two taps in one atomic action**: their own verdict — 🚩 RED FLAG / 🟢 GREEN FLAG — AND their **prediction of the room's majority**. The reveal shows the split with avatars (debate fuel — "TOI t'as mis green ?!"); **points go ONLY to correct majority-predictions**, so your own verdict stays pure honest expression. A `debateStarter` opens a short argue-it-out beat ("La défense : c'est mignon. L'accusation : c'est étouffant"). The skill is reading the room; the heat is the debate.

This is **exactly `tu-preferes` with `debateMs > 0`** — the `predict-majority` scoring path (already shipped) plus the debate phase (already shipped). The brand book's own framing ("VOTE@2 predict-majority, sibling of tu-preferes") is the decided mapping verbatim. The two-tap atomic `{ pick, predict }` ballot is the shipped `option-vote` `predict-majority` action — no new code.

### Phases (shipped `option-vote` phases + the debate phase switched on)

| Phase | Duration | Beat |
|---|---|---|
| `choose:r{n}` | 15 s | trait card 🚩 vs 🟢; one atomic action `{ pick, predict }` into the HIDDEN buffer (your verdict + your room-majority guess); early-advance on allActed(connected); timeout = non-submitters excluded, shown "asleep" |
| `reveal:r{n}` | 8 s | atomic bar-race split + avatars under each flag; ✅ badges on correct predictors; perfect tie → "ÉGALITÉ — c'est VOUS le red flag" banner, no points; emits `round_revealed` |
| `debate:r{n}` | 30 s | `debateStarter` one-liner + countdown; arguing is IRL; ends early when >50% of connected players tap "On passe"; emits `round_completed` at the boundary |
| `over` | untimed | podium; "Détecteur de red flags / The Flag Whisperer" crown (best predictor); cloned `gameOver` scores; placement → session XP |

(Add an optional `scoreboard:*` beat only if product wants more ad slots; default is ad-at-`over` only, matching `tu-preferes`.)

### Params (a `game_config` only — no new fields)

```json
{ "scoring": "predict-majority", "totalRounds": 8,
  "chooseMs": 15000, "revealMs": 8000, "debateMs": 30000, "debateSkipThreshold": 0.5,
  "pointsCorrect": 1 }
```

This is `TU_PREFERES_CONFIG` with `debateMs: 30000` (shipped value is 0) and `revealMs` trimmed to 8 000. **Zero TypeScript** — `option-vote` already runs the debate phase after reveal whenever `debateMs > 0` (`afterReveal` in `option-vote.ts`). The pack supplies the 🚩/🟢 axis labels and `debateStarter`s.

### Content item shape

Reuses `OptionVoteItem` (`optionA`/`optionB` = the two flags, repeated per item; `prompt` = the trait/behaviour being judged; `debateStarter` = the argue hook):

```ts
{ id, prompt: {fr,en} (≤110 chars — the dating-profile trait/behaviour judged),
  optionA: {fr,en} ("Red flag 🚩"), optionB: {fr,en} ("Green flag 🟢"),
  emoji?, debateStarter: {fr,en} (≤120 chars — the both-sides hook),
  category: 'texting'|'dating'|'social'|'money'|'lifestyle'|'ick', spicy: 0|1, tags? }
```

The two flag options are constant across the pack (repeated by the pack build → generic `OptionVoteItem`). Pool ≥ `3 × totalRounds` (~200+ traits) so the prediction skill has room and items don't recur within a session. No pre-computed crowd values — the "majority" is the room's own votes (the same property that made `tu-preferes` `needsOfflineAiPipeline:false`).

### 3 bilingual samples

```json
[{ "id": "rfgf-texting-006", "category": "texting", "spicy": 0, "emoji": "🌙",
   "prompt": { "fr": "Te texte « bonne nuit » tous les soirs sans exception, dès le 3e jour.",
               "en": "Texts you 'goodnight' every single night, starting day 3." },
   "optionA": { "fr": "Red flag 🚩", "en": "Red flag 🚩" },
   "optionB": { "fr": "Green flag 🟢", "en": "Green flag 🟢" },
   "debateStarter": { "fr": "Attentionné, ou love-bombing à la chaîne ? Le groupe est divisé, prouvez votre camp.",
                      "en": "Thoughtful, or assembly-line love-bombing? The room's split — defend your side." } },
 { "id": "rfgf-social-022", "category": "social", "spicy": 0, "emoji": "👥",
   "prompt": { "fr": "T'ajoute sur tous les réseaux dans l'heure qui suit le premier date.",
               "en": "Adds you on every social platform within an hour of the first date." },
   "optionA": { "fr": "Red flag 🚩", "en": "Red flag 🚩" },
   "optionB": { "fr": "Green flag 🟢", "en": "Green flag 🟢" },
   "debateStarter": { "fr": "Enthousiasme assumé, ou début de dossier de surveillance ? Plaidez.",
                      "en": "Honest enthusiasm, or opening a surveillance file? Make your case." } },
 { "id": "rfgf-money-039", "category": "money", "spicy": 0, "emoji": "🧾",
   "prompt": { "fr": "Calcule au centime près qui doit quoi sur l'addition partagée, à chaque fois.",
               "en": "Splits the bill to the exact cent, every single time, with a calculator out." },
   "optionA": { "fr": "Red flag 🚩", "en": "Red flag 🚩" },
   "optionB": { "fr": "Green flag 🟢", "en": "Green flag 🟢" },
   "debateStarter": { "fr": "Sain et carré, ou radin déguisé en « équitable » ? La table tranche.",
                      "en": "Healthy and fair, or stingy cosplaying as 'equitable'? The table decides." } }]
```

### Scoring (exact)

`option-vote` `predict-majority` resolver, verbatim (`resolveChoose`): majority = the flag with STRICTLY more submitted picks. Every player whose **`predict` equals the majority** gains **+1** (`pointsCorrect`). **Your own verdict never scores** (honest expression is dominant — you can call something a green flag and still win by correctly predicting the room calls it red). Perfect tie → nobody scores + "you're all the red flag" banner. Timeout non-submitters → 0. The `predict` field stays PRIVATE forever (only the public `pick` split + `awarded` predictors are revealed). Match-local; placement → session XP.

> Design note: predict-majority is the only model where total honesty about your own verdict is dominant while adding a real skill axis (reading the room) — the exact reasoning wave-2 used to reject majority-conformity / minority-reward for `tu-preferes`.

### Redaction

Inherits `option-vote` `predict-majority` redaction unchanged: the atomic `{ pick, predict }` ballot is HIDDEN until reveal; at reveal only `picks` (verdicts) and `awarded` (correct predictors) go public — **individual predictions are never exposed** (already enforced in the shipped `resolveChoose` + view, the comment on `RoundResult.awarded` says so verbatim). Debate `skips` public as a count only. No new redaction surface.

### Players / spicy / template

- **Players:** **3–16** (`option-vote` default; the §2.2 `tu-preferes` recommendation tightened to 3 — at 2 the prediction collapses to "do we agree?"). Sweet spot 4–12.
- **Spicy:** launch **spicy-0** (`red-flag-green-flag`, all-ages — relationship/social behaviours clean). Decided-but-deferred **spicy-1 sibling** (`red-flag-green-flag-dating`, taboo-adjacent ex/dating-frankness traits, opt-in toggle, NOT 18+ — meta-03 tier-1) — pure pack swap. No 18+ sibling.
- **Template mapping:** **VOTE@2 `predict-majority` + debate**, a **`game_config` on `option-vote` AS SHIPPED** — build-cost **A**, **0 lines of TypeScript**. The single most literal brand-book→shipped-module match in this doc. `needsOfflineAiPipeline:false`.

---

## 4. Build & catalog summary (the bill, honestly priced)

| Mode | id | Template (shipped module) | New code | Build-cost class | Effort | Offline AI? |
|---|---|---|---|---|---|---|
| Courtroom | `le-tribunal` | VOTE@2 `majority-herd` + debate (`option-vote`) | **none** | **A — config-only** | 0 days code (pack + catalog row) | no |
| Red Flag / Green Flag | `red-flag-green-flag` | VOTE@2 `predict-majority` + debate (`option-vote`) | **none** | **A — config-only** | 0 days code (pack + catalog row) | no |
| Who Said That? | `qui-a-dit-ca` | VOTE@2 `attribution` (`option-vote` + 1 additive branch) | **1 small param branch** | **B — small param** | ~2–3 days incl. tests (bundle w/ VOTE@2) | no |

**Net new modules: 0.** **Net new param branches: 1** (`scoring:'attribution'` + `ballotKind:'self-claim'` + the attribution buffer on `option-vote`). Two of three are pure Cadence-B catalog work; the third is a backward-compatible rider on a module being built anyway.

**Recommended order:** ship **Courtroom** and **Red Flag / Green Flag** in the **VOTE@2 wave (wave-2 §A2)** alongside `tu-preferes`/`gauche-ou-droite` — they are the same module, so the marginal cost is two packs and two KV rows. Ship **Who Said That?** immediately after, as the additive `attribution` branch, while the VOTE@2 module is fresh and its test harness is open.

**Catalog rows (meta-03 / template-arch `gameConfigSchema`):** all three `tone:'classic'`, `minAge:0`, `enabled:true`, `rolloutPct` staged at 5 then 100. The deferred spicy-1 siblings (`qui-a-dit-ca-cash`, `red-flag-green-flag-dating`) are separate config rows + separate pack ids, `tone:'classic'` with item `spicy:1` behind the lobby "spicier cards" opt-in toggle (NOT the 18+ age gate — meta-03 §1.1 tier-1 nuance), authored later, content-ops only.

**A11y (brand book):** all three are tap-only (44pt targets — flag buttons, verdict buttons, avatar chips, card tiles), WCAG-AA palette (Coral CTA / Teal / Cobalt on Cream, Ink text), reduced-motion respects the reveal animations, long-press-to-report keyed by `item.id`/`card.id` (meta-03 §9). No mode requires audio, typing, or motion.

---

## 5. Cross-reference against the 18 shipped games (no overlap, clean reuse)

- **vs `gauche-ou-droite`:** Courtroom IS its verdict-axis sibling (same `majority-herd`+debate path). Distinct *fantasy* (a trial vs a coded-judgment meme) over the identical reducer — the §5.1 "coexist, one module" pattern. No new code, no registry bloat.
- **vs `tu-preferes`:** Red Flag / Green Flag IS its debate-on sibling (same `predict-majority` path). Distinct fantasy (judge a dating trait vs choose a dilemma) over the identical reducer. The brand book's framing maps 1:1.
- **vs `pires-potes` (VOTE@1 designation):** Who Said That? borrows the **roster-ballot domain** (tap a player) for the attribution step, but adds a self-claim buffer + a per-card attribution that pires-potes doesn't have — hence VOTE@2 `attribution`, not VOTE@1.
- **vs `hot-seat`:** Who Said That? shares hot-seat's hidden-buffer-then-attribution-reveal redaction shape and its "read the room about a person" energy — but hot-seat rotates ONE spotlight and predicts a binary self-answer, whereas Who Said That? has EVERY player claim a card and attributes the whole hand. Different state machine → it stays on `option-vote`, not hot-seat.
- **vs `cinquante-cinquante` (`crowd-target`):** Who Said That? reuses crowd-target's "pick a pre-authored card from a seed-shuffled hand into a hidden buffer" move to keep itself UGC-free — the exact redesign that removed free text from Fifty-Fifty.
- **vs `loup-garou` / `trouvez-la-regle` debate beats:** Courtroom and Red Flag use the same "IRL argue, phone is a timer + skip-quorum" debate model — no advocate role, no turn order, consistent with every debate beat on the platform.

No shipped game is displaced, renamed, or re-pointed. These three are purely additive tiles.

---

## Open product calls (with my recommendation)

1. **Who Said That? — self-claim vs assign-a-card.** I decided **self-claim** (each player owns the card "most them", then the room attributes). The alternative is **the app secretly assigns each player a card** and the room guesses the assignment — zero self-expression but a cleaner "who got which" puzzle. **Recommendation: ship self-claim** (self-implication is the cheapest, safest edge per voice-guide §1.7, and "I genuinely picked the 2am-voice-note card" is funnier than a random deal). Keep assign-a-card as a future `dealMode:'assigned'` param if playtests find self-claim too easy to read.
2. **Who Said That? — fooled-the-room bonus value (+2).** Set higher than a correct attribution (+1) so being unreadable is the win condition, not a consolation. **Recommendation: keep +2 at launch; watch the analytics** — if "chameleon" players run away with it at 4–5 players, drop to +1 (param, no deploy).
3. **Courtroom — does the verdict score at all, or is it pure debate theatre?** I decided **herd-scoring** (side with the majority = +1), matching `gauche-ou-droite`. The alternative is a **non-scoring "for laughs" mode** (the trial is its own reward, XP flat). **Recommendation: keep herd-scoring** for a real leaderboard and placement-XP; offer a `scoring:'none'` chill variant later only if playtests say the points sour the bit.
4. **Red Flag / Green Flag — debate length (30 s) vs none.** `tu-preferes` ships with NO debate; I added a 30 s debate because the brand book explicitly lists this mode as "VOTE/debate" and red/green traits are maximally arguable. **Recommendation: launch with the 30 s debate**; if pacing analytics show drop-off, the debate is one param (`debateMs:0`) away from the lean `tu-preferes` cadence — no deploy.
5. **Spicy-1 siblings timing for Who Said That? + Red Flag.** Both have obvious taboo-adjacent dating/ex packs. **Recommendation: ship classic-only at launch; author the spicy-1 siblings in the first content-ops wave** (opt-in toggle, NOT 18+ — they're screenshot-clean per meta-03 tier-1). Courtroom gets no spicy sibling (a clean behaviour-trial is the funnier register, and 18+ accusations risk the hard floor).
6. **Courtroom catalog framing — one tile, or themed packs (`food-court`, `dating-court`, `roommate-court`)?** The `category` field already supports themed packs config-only. **Recommendation: launch ONE general `le-tribunal` tile** with a mixed pack; mint themed sibling tiles later if a category over-indexes — pure Cadence B, no code.
