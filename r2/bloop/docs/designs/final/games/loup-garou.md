# Loup-Garou / Werewolf — Final Game Design (SHIPPED)

| Field | Value |
|---|---|
| **Game id** | `loup-garou` |
| **Name (FR / EN)** | Loup-Garou / Werewolf |
| **Template + mode** | `NIGHT_DAY` (new module `packages/games/night-day`); `loup-garou` is the template's first — and currently only — `game_config` (`LOUP_GAROU_CONFIG`) |
| **Players (from the module)** | `minPlayers: 5`, `maxPlayers: 16` (lobby copy: "best at 7+") |
| **Spicy tier** | 0 (no spicy sibling — see §5) |
| **Physical** | Seated (IRL debate out loud; phones are taps/votes only — no standup) |
| **Status** | **SHIPPED** — `createNightDay('loup-garou', LOUP_GAROU_CONFIG)`, content pack `content/packs/loup-garou.json` (141 items) |

It ships as the **dedicated `NIGHT_DAY` module**, not a mode on SECRET_ROLE. The wave-2 ruling (§5.6, confirmed): werewolf's skeleton — no clues, wolves MUST see each other, sequential role-gated night sub-phases, and a cross-role secret disclosure (the witch is shown the wolves' victim) — shares ~0% reducer/view code with impostor, so bolting it onto SECRET_ROLE would have been the anti-pattern the template-architecture doc rejects. `createNightDay(id, config)` is built so future mafia / vampire / space reskins are pure config+pack drops.

---

## 1. Pitch & room fantasy

**Pitch (one line).** The app is the game master: it deals secret roles, runs the night in identical-looking decoy screens so nobody can shoulder-surf who's acting, resolves the kill at dawn, and lets the table argue itself to a lynch — village wins by exterminating the wolves, wolves win by reaching parity.

**Room fantasy — dark-epic paranoia, not slapstick.** This is the catalog's long-form anchor (10–15 min match), and the *one* Bloop game where the app drops the roast register entirely (voice guide §5.17). The fun is not the app's jokes — it's the players' paranoia. The text's job is atmosphere: village-gothic narration with one cold image per death ("Une chaise vide ce matin : {victim}. Et quelque part autour de la table, quelqu'un boit son café en face de son œuvre."). The manufactured drama is the **table arguing about who's lying to their face** — the seer who knows the truth but dies if she speaks too early; the wolves who mourn loudly with the people they ate; the witch sitting on one save and one kill, choosing who lives. The decoy night protocol replaces "everyone close your eyes" with "everyone, eyes down on your phone, tap something" — so neither a glance at a neighbour's screen nor an early phase-end betrays who holds a role. Every match ends with the full reveal and a narration line that either crowns the survivors over the empty chairs or chills the room with how long the wolves laughed alongside them.

---

## 2. Shipped ruleset (AUTHORITATIVE — from `LOUP_GAROU_CONFIG` + `night-day.ts` / `logic.ts` / `views.ts`)

### Phases (one match = one `GameModule` instance; `maxRounds: 10` cap)

`phaseKey(state)` is secret-free and changes on every shell-observable transition — each night sub-phase is its own key so each gets a fresh alarm. Night/day cycle counter `round` is 0-based.

| Phase | `phaseKey` | Duration | Beat |
|---|---|---|---|
| roleReveal | `roleReveal` | `roleRevealMs: 15_000` | One-time private role card; each wolf's card also lists the wolf pack. All alive ack OR deadline → night 0. |
| nightSeer | `night:r{round}:seer` | `nightSeerMs: 25_000` | Seer picks a living non-self target; `{round,target,isWolf}` appended to her `seerLog`, echoed only in her view. Others tap decoys. Timeout/disconnect = no peek. |
| nightWolves | `night:r{round}:wolves` | `nightWolvesMs: 30_000` | Each living wolf casts `wolfVote` (target alive, non-wolf); wolves see each other's live picks. Plurality; tie → earliest first-vote among tied (`wolfVoteSeq`, deterministic from event order); zero votes → no victim. Sets `pendingKill`. |
| nightWitch | `night:r{round}:witch` | `nightWitchMs: 25_000` | Witch's view (hers only) shows `pendingKill`. `witchAct{heal:true}` cancels it (consumes `healLeft`; self-heal allowed since `witchSelfHeal:true`); `poisonTarget` kills any living player (consumes `poisonLeft`); both usable the same night. Timeout = no potions. |
| dawn | `dawn:r{round}` | `dawnMs: 10_000` | Deaths resolve atomically: unhealed `pendingKill` + `pendingPoison` flip `alive=false`; `lastDawn` published (roles iff `revealRoleOnDeath`); narration drawn from `dawn.death`/`dawn.noDeath`. Win-check runs on the deadline. Emits `night_resolved`. |
| debate | `debate:r{round}` | `debateMs: 90_000` | IRL shouting; phones show the death recap + a "ready to vote" toggle. All alive∧connected ready OR deadline → vote. |
| vote | `vote:r{round}` | `voteMs: 30_000` | Simultaneous secret lynch vote; target alive; self-vote inert; first vote locks. `hasVoted` booleans public, targets hidden. All voted OR deadline (abstainers omitted). |
| lynchReveal | `lynch:r{round}` | `lynchRevealMs: 10_000` | `lastLynch` public (evicted, tally, abstained, role iff `revealRoleOnDeath`). Win-check on deadline → next night (round+1) or over. Emits `round_completed` (the shell's ad-cadence signal). |
| over | `over` | `null` (untimed) | Full reveal: `finalRoles`, `winners`, `endReason`, final `scores`; `gameOver(scores)` emitted with cloned scores. Client fires the interstitial off the `over` transition only. |

**Skip vs decoy rule** (`stepMode`, the config-flip the `revealRoleOnDeath=false` expert variant relies on): a night sub-phase whose role is dead/disabled is **skipped** when `revealRoleOnDeath:true` (the death is already public, so skipping leaks nothing). When `false`, the dead-role sub-phase still **runs full-length decoy-only**, so its absence can't reveal which role died. Wolves' step is always enabled; it returns `skip`/`decoy` only when *all* wolves are dead (game already over by win-check, so unreachable in practice).

**Worst-case match length** is bounded by `maxRounds:10` × (25+30+25+10+90+30+10 = 220 s/cycle) + 15 s reveal ≈ 37 min absolute ceiling; typical real match is ~3 cycles, 10–15 min. Every gated phase ends early on all-acted over the **alive∧connected** set (`aliveConnected`), so a disconnected or passive seat can never stall past the deadline.

### Scoring (exact, `enterOver`, match-end only)

Scores are zero throughout the match and computed in one pure pass at `over` (folding a visible mid-match point would leak information). Per-player:

| Outcome | Wolf | Village-team (villager / seer / witch) |
|---|---|---|
| **villageWins** | `0` | living → `+2`, dead → `+1` |
| **wolvesWin** (parity or maxRounds tiebreak) | living → `+3`, dead → `+1` | `+1` (consolation, living or dead) |
| **roomCollapsed** | `0` (current/zero scores) | `0` (current/zero scores) |

Cross-game session XP is **placement-based** (cross-game-synthesis §1.7): the shell awards XP off per-match placement, so this internal 0–3 scale never needs to be comparable to any other game's scale.

### Win / draw / tie rules (`winCheck`, pure, ordered; runs at dawn and lynchReveal deadlines)

Let `wolves` = living wolves, `nonWolves` = living non-wolves, `roundIfContinue` = the round the game would advance to.

1. `wolves === 0` → **villageWins**.
2. `wolves >= nonWolves` → **wolvesWin** (parity).
3. `aliveConnected < 3` → **roomCollapsed** (winners = side with more alive; rule 2 already caught wolves≥nonWolves, so this resolves to **village**).
4. `roundIfContinue >= maxRounds (10)` → side with more alive wins (`wolves >= nonWolves ? wolves : village` — i.e. **tie → wolves**).
5. Else → continue (round+1).

Lynch ties (`resolveLynch`): tie at the top **or** zero votes → `evicted = null`, nobody dies — deterministic, no revote (`lynchTieBreak: 'noLynch'`). Wolf-vote ties (`resolveWolves`): broken by earliest first-vote among tied targets via `wolfVoteSeq`, so a no-kill night never happens just because wolves disagreed.

### Presence / disconnect behaviour

`playerLeft`/`playerRejoined` flip `connected` **only** — never `alive`, never `roles` (presence ≠ elimination). A disconnected actor's sub-phase resolves at the deadline with no peek / no kill / no potion; rejoin restores acting if the phase is still open. A `playerLeft` that completes the expected (alive∧connected) set advances the phase immediately so an absent seat can never block. Sole-wolf permanent disconnect → kill-less nights; the village still wins by lynching the silent seat, with roomCollapse (<3 connected) and maxRounds as floors.

### Redaction (the platform's largest secret surface — `buildView`)

Base envelope every viewer gets identically: `round`, `composition` (PUBLIC — the role census is announced, classic rule), `seats[{id,alive,connected}]`, `scores`, `myRole` (own only; `null` for spectators/non-roster), `myRoleCard` (own), `iAmAlive`, `narration`.

Secret classes and their deliberate disclosures:

- **roles map** — never in any pre-over view. *Exception:* `wolfPack` (the living roster of wolves) is carried in **each wolf's** view, alive or dead — the deliberate asymmetric disclosure (wolves MUST see each other). Non-wolves / dead non-wolves / spectators never receive it.
- **wolfVotes** + live wolf tally — living wolves only, only during `nightWolves` (dead wolves keep `wolfPack` but lose the live huddle).
- **seerLog** — seer only; survives her death (own log, not ghost omniscience).
- **witchState** `{healLeft,poisonLeft}` — witch only (survives her death). **pendingKill** — living witch only, only during `nightWitch`; never anywhere else pre-dawn.
- **lynch votes** — hidden buffer; `hasVoted` booleans public, `myVote = votes[viewer] ?? null` owner-echo only, promoted to a public `tally` at `lynchReveal`.
- **nightActed** — public booleans, uniform by the decoy protocol (keys never depend on roles; the three night sub-phases share ONE view shape with identical keys for actor and non-actor).
- **Dead players are NOT omniscient** — a dead player's view = a living non-actor's view + their own role/logs. Ghost-omniscience is rejected because same-room table talk and facial reactions would leak it instantly.
- **Narration is public flavor and must never encode a secret**: when `revealRoleOnDeath:false`, the side-coded lynch slot (`lynch.wolf` vs `lynch.villager`) would leak the evicted player's side, so `narrationFor` returns `null` for that case.

Actions are zod-validated at the DO boundary (`nightDayActionSchema`); wrong-phase / wrong-role / dead / duplicate / non-roster / self-target are all inert via same-reference return. **Zero free-text surface** → no profanity-filter / moderation path at all.

---

## 3. Content model

**Pack item shape** (`NightDayItem` = `RoleCardItem | NarrationItem`, flavor-only — mechanics never depend on content):

```ts
// roleCard: { id, type:'roleCard', role:'wolf'|'villager'|'seer'|'witch', name:{fr,en}, text:{fr,en}, tags? }
// narration: { id, type:'narration', slot, text:{fr,en}, tags? }
// slot ∈ night.intro | dawn.death | dawn.noDeath | lynch.wolf | lynch.villager | lynch.none | over.village | over.wolves
```

`{victim}`/`{target}` tokens are substituted **client-side** with lobby nicknames — the engine never sees names (synthesis §3.4). Bilingual `{fr,en}` at authoring time; the build step splits into single-locale packs before R2 upload.

**Shipped counts** (`content/packs/loup-garou.json`, 141 items): **9 roleCards** (one per role — the 4 v1 roles wolf/villager/seer/witch PLUS 5 authored-ahead v2 roles hunter/cupid/guardian/littleGirl/captain, which `init` drops because only `V1_ROLES` are loaded) and **132 narration variants** across the 8 slots: night.intro 18, dawn.death 20, dawn.noDeath 16, lynch.wolf 16, lynch.villager 18, lynch.none 16, over.village 14, over.wolves 14. Every slot far exceeds the ≥3-variants-per-slot floor, so repeated nights never repeat a line; `init` seeded-shuffles each slot's list and views draw `round % length`.

**AI-precomputed offline?** **None.** `needsOfflineAiPipeline:false` — no per-item precomputed values; mechanics are pure. (Authoring at volume may be AI-*assisted* behind the human gate, but nothing is computed at runtime — there is no live AI, consistent with the platform invariant.)

**Voice / tone note** (voice guide §5.17 — `loup-garou`: dark-epic, not slapstick): village-gothic narration with dry menace; deaths get gravitas and one cold image, never jokes at the corpse's expense. Lynch copy is judicial and irreversible; wolf-win copy is quietly chilling. This is **the only game where the app drops the roast register entirely** — the comedy comes from the players' paranoia and the text's job is atmosphere. **No memes, no slang, no aura points in narration**; role cards may keep one wry line max (e.g. the seer's "c'est exactement pour ça qu'on tue les voyantes en premier"). FR/EN are transcreated, not translated.

---

## 4. RESOLVED DECISIONS

Every former defer / v2 / open-question / spicy / host-tunable bullet from §2.17 and the by-game `recommendations[]`, decided. No TBD.

| # | Was (deferred / open / proposed) | FINAL decision | Why |
|---|---|---|---|
| D1 | SECRET_ROLE extension vs new template? | **Ship v1: NEW `NIGHT_DAY` module.** | Shipped. ~0% shared reducer code with impostor; the wolf-must-see-wolf + witch-sees-victim disclosures have no SECRET_ROLE analog. Upside: mafia/vampire/space are now config+pack only. |
| D2 | Minimal v1 role set? | **Ship v1: wolf + villager + seer + witch.** Hunter cut from v1. | Seer = info drama, witch = one save + one kill; both are plain linear night sub-phases. Hunter is the only classic role that triggers reactively ON DEATH → deferred (see D9). |
| D3 | Role leaks in a same-room night? | **Ship v1: decoy protocol.** | Shipped — identical screens + identical tap counts; `nightAck` no-op; phase ends on all-acted(alive∧connected) or deadline. Structurally tested (actor/non-actor view keys identical). |
| D4 | Reveal a dead player's role? | **Ship v1: `revealRoleOnDeath:true` default; `false` is a host-tunable expert variant** with the decoy-skip rule. | Role-on-death is readable for casuals. The `false` path keeps dead-role sub-phases running decoy-only and nulls side-coded lynch narration so the variant is a pure config flip. |
| D5 | Lynch tie handling? | **Ship v1: no-lynch on tie** (`lynchTieBreak:'noLynch'`), deterministic, no revote. | Mirrors impostor §4.5; a hung jury is dramatic and keeps pacing. v2 captain (D11) replaces this with a tie-break vote. |
| D6 | Wolf-vote tie handling? | **Ship v1: earliest first-vote among tied** (`wolfVoteSeq`). | A no-kill night is anticlimactic for wolves, so their tie resolves to a victim deterministically from the event log — no rng, no wall clock. |
| D7 | Dead players spectate with full info? | **Ship v1: NO ghost omniscience.** | A dead player sees a living non-actor's view + own role/logs only. Same-room table talk/faces would leak full vision instantly. |
| D8 | Player floor & wolf scaling? | **Ship v1: `minPlayers:5`** ("best at 7+" copy), `wolves = min(4, max(1, floor(n/4)))` (5–7p:1, 8–11p:2, 12–15p:3, 16p:4). | Below 5 the seer near-solves it; floor(n/4) keeps wolves a strict minority at every count (the parity win requires it); cap 4 keeps the huddle phone-manageable. |
| D9 | Chasseur / Hunter | **Roadmap v2 (#1).** Spec: death-triggered `hunterShot:r{round}` sub-phase, fires at dawn or lynch, chains at most once. `hunterEnabled` already exists in config (must stay `false` in v1 — guarded). | The single reactive mechanic; the night pipeline is an ordered array precisely so it appends without rearchitecting. First v2 because it is the most-requested classic role. |
| D10 | Cupidon / Cupid | **Roadmap v2.** Spec: round-0-only first-wake step; pairs two lovers (linked deaths) + a third "lovers win" condition. | Needs a new win condition + linked-death resolution; clean to append after hunter. |
| D11 | Salvateur / Guardian | **Roadmap v2.** Spec: wakes before the wolves; per-night protect; never the same target two nights running. | Pure new night step in the ordered array (`v2NightWakeOrder: cupid, seer, guardian, wolves, witch`). |
| D12 | Capitaine / Captain | **Roadmap v2.** Spec: elected status (no night step); vote weight 2 + breaks lynch ties (replaces `noLynch`). | Changes the lynch resolver, so it ships after the simpler additive roles. |
| D13 | Petite fille / Little Girl | **Roadmap v3 (last).** Spec: risky peek during the wolves' huddle — a NEW disclosure surface (wolves can "feel" her glance). | Explicitly flagged "design carefully" — it adds a disclosure path to the most sensitive secret (the wolf huddle). Lowest priority; ships only after the redaction harness has proven stable on the additive roles. |
| D14 | Pacing / ads fit | **Ship v1: long-form anchor positioning.** Interstitial fires client-side off `phaseKey → over` only; aggressive timers + all-acted early-end everywhere; `maxRounds:10` ceiling. | A mid-night ad would destroy tension; per-match ad cadence + bounded worst case is the shipped answer (`round_completed` is the cadence *signal*, never an ad trigger). |
| D15 | Sole-actor disconnect replacement rule | **Ship v1 as-is; Roadmap v2 "replace disconnected wolf" only if 5% analytics demand it.** | Shipped behaviour (kill-less nights, lynch the silent seat, roomCollapse/maxRounds floors) is acceptable; a replacement rule is held until rollout data shows it's needed (kept as a tunable lever, not a launch blocker). |
| D16 | Night-1 death = 10+ min spectating | **Roadmap v2: fast-rematch flow first; "ghost minigame" v3 (or cut).** | The cheap mitigation (instant rematch CTA at `over`, dead players auto-spectate the live game) ships v2. A dedicated ghost minigame is a separate feature with its own redaction risk — v3 or cut if rematch flow proves sufficient. |
| D17 | Themed reskins (mafia / vampire / space) | **Roadmap v2+ as pure config+pack drops (Cadence-B).** | The module is content-agnostic by construction; reskins need zero reducer change — a new `game_config` + a translated pack. Ship opportunistically post-launch. |

---

## 5. The 18+ spicy sibling config

**No spicy tier. (`spicyLevel: 0`, and it stays 0.)** This is a reasoned decision, not an omission:

1. **The genre fights an 18+ skin.** Loup-Garou's edge is *paranoia and betrayal between friends*, not sexual frankness or substances. The content surface is **narration + role cards only** — there are no prompts, no truths, no dares, no player-authored text, and no votable verdicts about real people to make "spicier." A spicy pack could only make the *narration* cruder, which directly contradicts the shipped tone law (§5.17: "dark-epic, not slapstick; no memes, no slang … atmosphere").
2. **Zero free-text / zero moderation surface** is one of this game's structural advantages (no profanity path at all). A spicy sibling adds an age-gate and a second pack to maintain for **no new mechanic** — all of `seerEnabled/witchEnabled/maxWolves/revealRoleOnDeath/lynchTieBreak/maxRounds` and the timers are tone-neutral; none of them would change for an 18+ tier.
3. **The hard floor already covers the only real risk** (graphic violence): narration is "hyperbolic cartoon menace" displaced onto an absurd frame ("ce qu'ils ont laissé de {victim} ne remplira pas le cercueil") — already shipped at spicy-0, no anatomy, no real victim, store-survivable.

**If a darker pack is ever wanted**, it ships as a **content-only reskin** (D17 mechanism), *not* a spicy tier: a new `game_config` with the same params + a `nuit-sanglante`-style pack (gorier narration, `minAge` gate at the *pack* level, separate pack id) — with **identical mechanics, identical anonymity, identical public/secret surface**. No `loup-garou-spicy` config is created; the lobby exposes no spicy toggle for this game.

---

## 6. Host-tunable params (lobby allowlist for THIS game)

The shipped `LOUP_GAROU_CONFIG` is fully overridable via `game_config.params`. The lobby exposes a curated, safe-ranged subset:

| Param | Default | Safe range / values | Notes |
|---|---|---|---|
| `seerEnabled` | `true` | `true` / `false` | Disable for a pure wolves-vs-village expert game. |
| `witchEnabled` | `true` | `true` / `false` | Toggles both potions; `witchState` inits `false/false` when disabled. |
| `revealRoleOnDeath` | `true` | `true` (casual) / `false` (expert) | The skip-vs-decoy variant flips here; well-specced as a pure config flip. |
| `witchSelfHeal` | `true` | `true` / `false` | Whether the witch may heal herself when she is the wolves' victim. |
| `maxWolves` | `4` | `1`–`4` | Caps the floor(n/4) scaling; never raise above 4 (huddle stays phone-manageable). Min 1. |
| `maxRounds` | `10` | `5`–`12` | The session-length ceiling / final tiebreak boundary. Below 5 truncates real games; above 12 strains the quick-rounds session model. |
| `debateMs` | `90_000` | `45_000`–`180_000` | The IRL-talk length — the single biggest knob on match feel; ends early on all-ready. |
| `voteMs` | `30_000` | `20_000`–`60_000` | Lynch-vote window. |

**Not host-exposed:** the per-sub-phase night timers (`roleRevealMs`, `nightSeerMs`, `nightWolvesMs`, `nightWitchMs`, `dawnMs`, `lynchRevealMs`) are tuned constants — leaving them fixed keeps the night cadence and the decoy-screen symmetry predictable; `lynchTieBreak` is fixed `'noLynch'` until v2 captain; `hunterEnabled` is hard-`false` (the sub-phase isn't implemented in v1).

---

## 7. Future modes roadmap

Each as one decided line.

- **v2 — Hunter (`hunterEnabled:true`):** death-triggered `hunterShot:r{round}` sub-phase, fires at dawn or lynch, chains once. **Ship-later** (the first v2; config flag already present).
- **v2 — Cupid:** round-0 first-wake; pairs lovers (linked deaths) + a third "lovers win" condition. **Ship-later.**
- **v2 — Guardian:** wakes before the wolves; per-night protect, no-repeat target. **Ship-later** (additive night step).
- **v2 — Captain:** elected status; vote weight 2 + lynch tie-break replacing `noLynch`. **Ship-later** (modifies the lynch resolver).
- **v3 — Little Girl:** risky wolf-huddle peek (new disclosure surface). **Roadmap v3, last** — only after the redaction harness is proven on the additive roles; cut if it can't be made leak-safe in same-room play.
- **v2 — Fast-rematch / dead-player engagement:** instant rematch CTA at `over` + dead seats auto-spectate. **Ship-later** (cheap mitigation for night-1 deaths, D16).
- **v3 — Ghost minigame for eliminated players:** **Roadmap v3 or CUT** — only pursued if v2 fast-rematch proves insufficient; its own redaction surface makes it a deliberate, separate feature.
- **v2+ — Themed reskins (mafia / vampire / space):** pure config+pack Cadence-B drops, zero reducer change. **Ship opportunistically.**
- **Replace-disconnected-wolf rule:** **Roadmap v2, conditional** — implemented only if 5% rollout analytics show sole-wolf disconnects materially degrade match quality; otherwise the shipped floors (roomCollapse/maxRounds) stand and this is **cut**.

---

## 8. Risks & content-ops notes

- **Largest redaction surface on the platform.** Four secret classes (roles, wolf votes, seer log, witch state) + two deliberate asymmetric disclosures (`wolfPack`; the witch's `pendingKill`). A single leak kills the genre. **Mitigation (shipped):** `leakedSecrets` audits across every phase × 4 viewer kinds (role-actor / other-alive / dead / unknown), an explicit `wolfPack` non-leak test, and the dead-non-omniscience test. Built AFTER impostor on the hardened harness per the synthesis build-order.
- **Shoulder-surfing is mitigated, not eliminated.** The decoy protocol equalizes screens and tap counts, but a determined neighbour reading a held-up phone still wins. **Content-ops / UI:** push privacy affordances (hold-to-peek role card, dimmed night screens, small fonts on secret surfaces) — these live in the client GameScreen, not the reducer.
- **Pacing strains the quick-rounds session model.** ~220 s/cycle, 10–15 min typical. **Mitigation:** aggressive timers + all-acted early-end everywhere + `maxRounds:10` cap + honest catalog positioning as the heavyweight anchor (and a host `debateMs` lever, §6).
- **Small-room balance (5–6p) is swingy.** Night-1 kills are information-free; the lone seer is strong vs one wolf. **Content-ops:** tune from the 5% rollout analytics — target village win-rate ~55–65%, watch match length; `maxWolves`/`seerEnabled` are the levers.
- **Pack sizing / freshness (content-ops lint).** Pack lint must enforce: exactly one roleCard per **enabled** role (extra v2 roleCards are tolerated and dropped by `init`, but should be tagged `v2` so the lint distinguishes them) and **≥3 narration variants per slot** — shipped at 14–20/slot (132 total), comfortably above floor, so repeated nights never repeat a line. Because mechanics never depend on content, **freshness/decay is purely additive**: new narration variants can be dropped into any slot via OTA pack update with no code change and no schema migration. Token discipline lint: every `dawn.death`/`lynch.*` variant must contain its `{victim}`/`{target}` token; `night.intro`/`dawn.noDeath`/`over.*` must not.
- **Moderation surface: none.** Zero free text, taps only — no profanity path. The only moderation concern is *authored* narration tone, governed by the §5.17 voice law (no protected-trait punching, no real individuals, hyperbolic-not-graphic violence) — a one-time human authoring gate, not a runtime surface.
