# RaceLab — Overnight Session (started 2026-06-20, William asleep)

Autonomous loop: **scan · check · revise · improve · detect failures** across the ENTIRE project, to
accelerate the release and buy time to do things clean. In-zone reversible fixes are **done + committed**;
everything needing a human call (product decisions, bigger builds, brand/money/Théo-zone) is logged below as
a **SUGGESTION** for William + Théo to review tomorrow. Perspective: a **real competitive RC racer**
(off-road: Ongaro, Boots, Cañas · on-road: Kurzbuch, Rheinard, Balestri) — i.e. "would this actually help
me win at a track day?". Standing orders honored throughout (D18 grounded-or-silent, one change at a time,
tested+pushed, no new models tonight unless flagged).

---

## MISSION QUEUE (self-extending — new missions added as they surface)

- [x] **M1 — Competitive-racer advisor-quality audit** (running) — embody the named racers; judge the
  advisor against what a top driver actually needs (symptom→fix coverage, adjustment priority, race-day
  workflow, realism, missing levers). Produces suggestions + eval gaps.
- [x] **M2 — Whole-project failure re-audit** — 17 findings, 7 fixed (2 P1 + 5 P2/P3), 4 in-zone queued, server+kb rate-limited.
- [x] **M2b — Re-run rate-limited server + kb audits** (the gap from M2 throttling).
- [ ] **M3 — Wire the harvested data into flagship templates** — fold D66 catalog / D68 ranges / D69
  option-parts into the flagship category templates' option lists (D65 validator guards them).
- [ ] **M4 — F1 + 1/12 pan rule packs** (the fast grounded coverage wins; templates+models already exist).
- [ ] **M5 — Per-corner (LF/RF/LR/RR) data-model design** (Phase-0 foundation, as a reviewable contract).
- [ ] **M6 — More RC-world web scanning** (fallback when the queue dries — deeper option-parts/tuning per
  existing model, surface/tyre depth).

## LOG (what got done each iteration)

- **2026-06-20 — Night session opened.** Scaffold created; M1 launched.
- **M1 DONE** — competitive-racer audit: 41 suggestions logged below (33 in-zone, 5 theo-app, 3 human-gated).
- **✅ FIX shipped (commit 3337364)** — authored 1/8 buggy+truggy **tyre rules** (the #1 off-road lever, was dark): 4 grounded rules mirroring the validated 1/10 family, 413→417 live rules, all validate-live gates pass, new eval scenario proves `tire_compound` now fires for a 1/8 buggy. **Resolves M1 suggestion #1** — the rest of the tyre cluster (on-road additive/insert, proactive race-day tyre read, tyre-first answer surface) stays in the suggestions list as it needs product/KB calls.
- **M2 launched** — whole-project failure re-audit.
- **✅ M2 — 7 in-zone fixes shipped** (17 confirmed findings; server+kb audits got rate-limited → re-run queued as M2b):
  - **P1** `fix(strategy)` — `Infinity` race_length_s no longer hangs the pit planner (`Number.isFinite` guards). `commit`
  - **P1** `fix(engine)` — race-day bar now applied to the full pool BEFORE the top-N slice (was post-slice → could starve eligible high-confidence rules into a false "do nothing"). regression test added. `commit`
  - **P2** `fix(kb)` — MP11 flagship template now exposes `tire_compound`/`tire_insert` (alias) so the new 1/8 tyre rules reach it; eval 28.
  - **P2** `fix(social)` — value-level validation on imported share payloads (untrusted deep-link/file injection guard).
  - **P3** `fix(tracks,strategy)` — finite-guard the read paths (NaN lap can't silently poison the library / cliff).
  - **P2/P3 docs** — de-lied stale counts (413→417, eval→28), CONTRACTS kit_default, AUDIT tracker #18-21.
  - **Remaining in-zone (queued, next iteration):** #9 historyFromTuples sort-before-slice · #10 D13 refusal ordered before resolveTemplate · #13 shared nextId NaN-guard · #4 bridge surface-id family mapping.
- **M2b launched** — re-run the rate-limited server + kb subsystem audits for full coverage.
- **✅ M2b — 4 in-zone fixes shipped** (10 confirmed findings):
  - **P1** `fix(server)` — GDPR tombstone on **backup/push + share/import** (the two resurrection paths the trial/stripe fixes left open); deleted account can't be re-created by its own sync/fork retry. regression added.
  - **P1** `fix(server)` — entitlement clamps token exp to the paid period **only when status==active** (a trial user with a stale canceled sub no longer gets an already-expired token). regression added.
  - **P2** `fix(server)` — rate-limit `share/import` (sibling `publish` was capped, it wasn't).
  - **P3** `fix(kb)` — tidied rule 904 (redundant `astroturf` in both forbidden_on + reduced_on).
  - **Remaining (logged for review / next iteration):** #3 alert-metrics emitted by nothing (P2) · #5 39 ruleless models always-refuse (→ suggestion, same as M1 #10) · #6 store-SQL FK-cascade divergence (P3) · #7 ruleless-refusal test (P3) · #8 tyre-rule [section TBD] cite (→ William's book pass) · #10 registry load permissive vs kb gate (P3).
- **✅ Tick — 4 more queued in-zone fixes shipped:** CLAUDE.md route count 17→19 (closes #14; the working-tree edit was external/not mine, verified correct) · `fix(engine)` historyFromTuples sorts chronologically before the most-recent-N tail (#9) · `fix(tracks,garage,social)` nextId throws on a bad clock + guaranteed 8-char suffix, adopting the sessions discipline (#13) · `fix(engine)` D13 engine-scope refusal now runs BEFORE the template check in all 3 entrypoints, so a nitro question on a pending chassis gets the canned engine refusal not the generic one (#10). All full-suite green.
- **⏸ DEFERRED to review — #4 bridge surface-id:** `liftTheoRunEntry` rejects any surface outside the legacy 6-value `SURFACES` (drops runs carrying real rcdata ids like `loamy_clay`). Relaxing it is correct given `Surface` is now a free string (D57), BUT `test-schema.ts:626` explicitly asserts `"dirt"` → reject, so it's a migration-contract change that depends on what Théo's legacy data actually contains. **Needs William/Théo's call** (strict legacy vs. accept-any vs. map-to-family). Not changed autonomously.
- **✅ Tick — M2b queue cleared (3 more in-zone fixes):** `fix(server)` wired the alert-catalog metrics (auth-fail / stripe-signature-fail / webhook-fail / backup-409 were defined+tested but emitted by NOTHING) centrally in the router off response status (#3) · `fix(server)` aligned the store `*_SCHEMA_SQL` reference mirrors with `db/schema.sql`'s FK cascades — share_snapshots/share_imports/stripe_subscriptions were missing `REFERENCES users(id) ON DELETE CASCADE` (#6) · `fix(engine)` registry load now uses the canonical kb `parseChassisRegistry` instead of a looser local Zod schema, single source of truth (#10). All suites green; bundle.json byte-unchanged. **M2/M2b in-zone queue now empty except the deferred #4.**
- **✅ Tick — full monorepo verification:** ran the root `test-all` (15 packages + server) — **all green** after the night's ~20 commits. Branch is healthy. Failure-detection queue is exhausted; remaining missions (M3 wire harvested data into templates, M4 F1/pan rule packs, M5 per-corner model) change the app-facing template contract or need tuning-direction calls → left for the William+Théo review (see suggestions + `docs/DATABASE_EXPANSION.md`), not made autonomously.
- **✅ Tick (idle, no new pushes) — focused grounding scan:** honored the "scan when idle" instruction LEANLY (one research agent, not a workflow). Gathered grounded **on-road tyre prep / additive / insert / foam** tuning knowledge → `docs/research/ONROAD_TYRE_PREP.md`, which **unblocks racer-audit suggestion #4** (the on-road tyre rule pack): additive soak-windows + zone→balance, firmer/softer insert directions, the harder-when-hot/softer-when-cold mirrored pair + load-shedding, and foam shore-by-temp/stagger/diameter. Honestly flags what's strong-enough-to-author vs under-sourced (oil-vs-solvent, dual-stage inserts, longevity numbers). So when you greenlight #4, the grounding is pre-gathered.
- **✅ Tick (idle) — grip-evolution grounding scan:** one focused agent → `docs/research/GRIP_EVOLUTION.md`, pre-grounding the **#2 racer-audit theme** (suggestions #2/#3/#5/#6/#23: surface-state evolution, retrieval keying on evolution, grip-coming-up planner, qualifier→final). Master principle ("grip up → harder/flatter; grip down → softer/freer") + a KB-author-ready 11-lever direction map + honest flags (HUDY off-road ≠ on-road, forum-as-sole-citation weak, F1 marbling out-of-domain). **The top-2 racer themes (tyres #4 + grip-evolution) are now both pre-grounded.** Scaling cadence down — grounding backlog for the headline themes is covered.
- **⚠ SELF-CORRECTION (logged honestly):** the MP11 tyre-alias commit (98726e0) was pushed after running only `eval`, not the **full** engine suite — it broke `test-raceday` (the alias let the 1/8 tyre rules fire in the weather race-day planner, where the per-tag cap let a tyre rule crowd out a shock-oil weather adjustment). Caught + fixed (`cd6262d`): tyre settings are now excluded from the weather planner (they stay on the symptom path); HEAD green. **Process note: always run the full package suite, not just eval, before committing engine/kb.**

---

## ⭐ SUGGESTIONS FOR WILLIAM + THÉO (review together tomorrow)

> Each item: **what · why (racer/eng rationale) · impact · effort · who/zone**. Nothing here is auto-applied —
> these are calls for you two. (In-zone reversible fixes are NOT listed here; they're committed directly and
> appear in the LOG + git history.)

### M1 — Competitive-racer audit (41 items) — Ongaro/Boots/Cañas · Kurzbuch/Rheinard/Balestri

_One-line verdict: a genuinely race-engineer-shaped tool for the 8 ruled classes, but a winner flags two things hardest — **tyres are under-served** (dark entirely for 1/8 buggy/truggy; compound-only on-road) and **grip-evolution across a race day is cosmetic** (parsed, shown, then dropped by retrieval). Tag key: Impact·Effort·Zone._

**🛞 Tyres (the #1 lever)**
- `H·M·in-zone` **No tyre/insert/tread rule for 1/8 buggy or truggy — the single biggest off-road lever is dark** — Author a tyre family (tire_compound / tire_insert / tire_tread) for scope 1-8-offroad and 1-8-truggy, mirroring the existing 1/10 rules (kb-2wd-reartire-softer/harder-036/037, kb-2wd-rearinsert-firmer/softer-038/039): softer compound for lo…
- `H·M·in-zone` **On-road tyres are compound-only — no additive timing, no foam/insert rule** — Author a tyre family for 1-10-touring and 1-8-gt matching nitro-onroad: tire_additive (apply/soak-time on prepared rubber, surface/temp gated) and an insert/foam rule (firmer = more cornering / less rolling-resistance; softer = more tractio…
- `H·M·in-zone` **Tyre choice is symptom-gated, not a proactive race-day call — the #1 decision is reactive only** — Add a proactive 'tyre/compound read' to planRaceDay that, given surface + air/track temp + grip, recommends a compound DIRECTION (and where a brand system is known, a starting compound) using the relative tyre rules that already exist (tire…
- `H·L·in-zone` **Make tyre + insert a first-class recommendation, not a fallback refusal** — Add a 'what tyre/compound/insert for this surface+temp' answer surface backed by KB rules. Today tyres exist only as a `setting` the engine can nudge (tire_compound/tire_insert/tire_rear_compound), and when no chassis rule matches the chat/…
- `M·S·in-zone` **No tyre-overheat / greasy-tyre symptom — the on-road thermal failure mode is invisible** — Add a symptom (e.g. tyre_overheating: greasy/off as tyres get too hot) and address it from the existing harder-compound/firmer-insert rules plus wider track / higher roll-centre to shed load. Today the only outlet is no_forward_bite@corner_…
- `M·M·in-zone` **Ranking has no deliberate tuning-priority order (droop/RH/camber/RC/diff before tyres/flex)** — Encode the on-road tuning order a winner follows (mechanical-balance levers — droop, ride height, camber, roll-centre, sway-bar, diff — before tyres/big-revert changes) as an explicit family/priority weight in the retrieval sort, rather tha…
- `M·S·in-zone` **Eval set has no transient/grip-evolution or tyre-prep scenarios** — Once evolution + tyre rules land, extend the engine eval (currently 26) with on-road trap cases: 'good early, loose as grip comes up', 'understeer cold then greasy hot', 'additive soak-time on carpet', and a foam-insert GT case — each with …
- `L·S·in-zone` **Add an eval scenario that exercises the chat loop end-to-end with a tyre-first complaint** — Extend the eval set with a scenario where the winning answer is a tyre/insert change and the driver works the better/same/worse loop across a 3-change plan — asserting the system does not deflect to the 'check tyres' fallback. Current eval …

**📈 Grip-evolution & race-day workflow**
- `H·M·in-zone` **Surface-STATE evolution is cosmetic — engine can't react like a pit board across a race day** — Make the evolution axis active: (a) add NLU patterns for 'track's coming in / coming up / blueing over / dusting out / as it grips up / as the day goes' → evolution + grip/dusty tags; (b) add rules (or a planner pass) that key off evolution…
- `H·M·in-zone` **Retrieval ignores the grip-evolution dimension a touring race is won on** — Wire FeedbackTag.evolution (as_grip_comes_up / as_tires_heat / from_start / when_pushing) into retrieve() scoring, and add an evolution axis to rules so a complaint that changes through the run gets a different answer than a steady-state on…
- `H·M·in-zone` **Grip-coming-up drives nothing but a driving tip — the dominant weekend variable is unwired** — Feed track.evolution (improving/degrading) AND the green→medium→high→blue_groove progression into the raceday/next-plan path as a first-class condition driver, not just into drivingTips. When grip is coming up across the day, the planner sh…
- `H·M·in-zone` **No baseline / 'where do I start' for a fresh track or first practice run** — Add a cold-start path: given chassis_template_id + surface + class + (optional) temp/grip, return the kit/category baseline setup (the chassis template already carries kit defaults per CLAUDE.md) plus the 2-3 highest-value surface-amplified…
- `H·M·in-zone` **The 2-minute pit-board call has no fast 'last run → this run' delta** — Add a single-run 'between-runs' entrypoint: input = the run you just finished (conditions + the ONE change you made + better/same/worse + optional lap series) → output = a one-line verdict (keep it / back it out) + the single next change to…
- `H·M·in-zone` **Weather→shock-oil pack exists only for 1/8 off-road; on-road race-day weather is effectively dark** — Generalize the hot/cold/wet shock-oil rules (kb-weather-*-30x, currently scope:[1-8-offroad]) to every scope that has shock-oil settings — or author per-scope equivalents. The temperature→silicone-viscosity mechanism is class-independent an…
- `M·M·in-zone` **Race-day planner ignores power class and surface-grip level, only forecast weather tags** — Let planRaceDay take a power tag and the surface grip level so legal_in_power and grip-amplified rules can participate (today it explicitly skips legal_in_power because RaceDayInput carries no power input, and it only acts on hot/cold/wet/w…
- `M·M·in-zone` **Pace/analysis never A/B-attributes a change across setup versions** — In paceSection/setupChangesSection, when two runs share conditions but differ by exactly one setup_version_id (one logged change), compute and surface the lap-time delta attributable to that change ('+0.3s/lap after the rear-oil step in mat…
- `M·M·in-zone` **Qualifier→final and stint-length aren't modeled in the race-day reasoning** — Let the planner reason about run TYPE and length: tyre-cliff timing (detectTyreCliff is already wired into reports.ts) should drive a compound/insert-life call for the FINAL's duration, and the 'thicken for the main, not a hot qualifier' wi…
- `M·S·in-zone` **No eval scenario exercises a full weekend progression** — Add eval scenarios that walk a weekend: green-morning practice baseline → grip coming up over qualifiers (assert tyre/stiffening direction shifts) → hot dry final (assert harder compound + thicker oil) → a cold+wet round (assert the merge t…
- `M·M·in-zone` **Race-day bar is a hard cliff at confidence:high + ≤15min; good medium levers vanish when you most want options** — Soften raceDayFilter from a binary gate to a tiered presentation: still lead with high+fast, but allow ONE clearly-flagged medium-confidence / slower-revert option as a labelled 'if you have a few minutes' alternative instead of dropping it…
- `M·M·in-zone` **planRaceDay can't gate legal_in_power (no power input in RaceDayInput) — could surface a mod-only change to a spec/blinky racer** — Add an optional power field to RaceDayInput and apply the same legal_in_power gate the live retrieval path uses, instead of the current documented bypass. Even though gearing/timing weather interplay is thin today, the contract gap means a …
- `L·M·human-gated` **Wind is always a flat refusal — but it changes the weekend setup, especially on-road/large scale** — Either add a minimal grounded wind handling (front/rear wing or ride-height on high-wing classes; lower CG / more steady-state stability for crosswind-sensitive 1/8 and pan cars) OR downgrade the wind refusal from a hard 'no recommendation'…

**🎯 Coverage & precision gaps**
- `H·L·in-zone` **39 of 237 advertised models (pan, F1, crawler, large-scale) have ZERO live rules — silent total refusal** — Either author Tier-A rule packs for 1_12_pan / f1 / crawler / large_scale_1_5, OR gate those category_templates out of the model picker / surface them as an explicit 'coverage coming' state. Today retrieval intersects rule.scope with templa…
- `M·M·in-zone` **Off-road jump/rut failure vocabulary is shallow beyond nosedive + bottoming** — Extend NLU + (where grounded) rules for the specific air/rut complaints racers use: 'swaps/kicks sideways in the air', 'lands nose-high / wheelies off the face', 'knifes in / tucks the front into a rut', 'blows through the rut / climbs out'…
- `M·M·in-zone` **Diff-fluid priority is right for nitro 1/8 but the 2WD/4WD diff lever leans on ball-diff/slipper only — verify it leads where it should** — Confirm and, where thin, deepen the drive-train lever ordering per class: for 1/8 nitro buggy the front/center/rear diff oils are present and well-grounded (Mugen MSR) — good. For 2WD the ball-diff + slipper rules exist but several are conf…
- `M·L·in-zone` **No traction-roll prevention vs reaction distinction, and no explicit blue-groove pre-emption package** — Add a planner/report mode that, given a high_grip+blue_groove+smooth surface, proactively lists the anti-traction-roll package (wider track, thicker rear oil, stiffer rear spring/bar, lower ride height, firmer insert) as a pre-race bundle r…
- `M·S·in-zone` **No Ackermann on-road — a primary corner-entry/mid steering tool is missing** — Add Ackermann rules scoped to 1-10-touring / 1-8-gt / 1-10-nitro-onroad (more/less Ackermann → mid-corner vs entry steering, sweep vs aggressive). geometry.yaml already has an Ackermann rule but it is scope:[1-8-offroad] only.
- `M·S·in-zone` **Retrieval ties break on reversal_cost before magnitude/leverage — cheapest-to-undo can outrank the actually-bigger fix** — Reconsider the sort tiebreak in retrieve(): after history/score/confidence it sorts by reversal_cost_minutes ascending, so an 8-min sway-bar tweak outranks a 15-min shock-oil change at equal score even when the shock change is the larger, m…
- `M·S·in-zone` **powerTypeToTags collapses ALL brushless to stock_blinky — every modified_power-gated rule is dark for modified racers** — Carry the car's actual power sub-class (blinky vs modified/boosted) from the garage into powerTypeToTags rather than defaulting all non-nitro to stock_blinky. As written, a modified-class racer never emits the modified_power tag, so any rul…
- `L·S·in-zone` **Wet shock-oil rules have reduced_on:[] — wet+other-low-grip conditions can't down-weight them and hot+wet only refuses, never reconciles** — Revisit the wet pack's empty reduced_on and the cross-condition resolution. On a hot+wet day the planner refuses front_shock_oil entirely (hot wants thicker, wet wants thinner) — defensible, but a racer would expect a net call (wet usually …
- `L·M·in-zone` **No magnitude scaling with severity — one forecast step regardless of a 5°C vs 25°C swing or light-rain vs standing-water** — Let magnitude_guidance optionally scale with the trigger delta. The cold rule's own text says '~50 cSt per 10° below baseline', but the engine always advises exactly one step regardless of whether it's 5° or 25° off baseline. Surface the pr…

**🧪 Eval coverage**
- `M·S·in-zone` **Add an off-road racer eval scenario set so these gaps are guarded going forward** — Add eval scenarios for: 1/8 buggy tyre-compound on a green vs blue-groove track (asserts a tire_* primary), surface-evolution ('track's coming in' should shift to anti-traction-roll), in-air swap/rut-knife NLU, and a 2WD slipper-on-low-grip…
- `M·M·in-zone` **Eval set (26 scenarios) is thin relative to 417 rules across 8 classes — class/condition coverage of the eval is the real blind spot** — Grow the eval to assert at least one diagnosis per LIVE class and per weather condition, plus trap cases for the dark classes (assert F1/pan/crawler return an explicit 'class not yet supported' rather than a generic no-rule refusal). Today …

**📱 Product / app**
- `H·M·theo-app` **Wire the deterministic chatbot into the app — it is the headline feature and it is dead code** — Route RaceEngineerChat (packages/engine/src/chat.ts) into a live screen. EngineerScreen.tsx is unrouted (FEATURES.md §9 marks the interactive chat ⬜ dead code, superseded by the report-first hub D28). The conversational better/same/worse lo…
- `M·S·theo-app` **Ship a gear-ratio / rollout calculator** — Add a pinion/spur → FDR + rollout calculator as an Engineer/Tools surface. Grep shows gearing is only a sheet field section (SheetEditorScreen.tsx 'Drivetrain' matcher /gearing|clutch|spur/), with no calculator anywhere in apps/mobile or pa…
- `M·M·theo-app` **Wire PDF setup-sheet export into the app** — Connect the verified packages/pdf fill PoC to the SheetEditor so a saved version exports to a manufacturer/category PDF. No PDF/export code exists in apps/mobile/src (grep found none); the PoC lives only in packages/pdf.
- `M·L·human-gated` **Close the social loop: shared-setups + public-track sync (the 'Strava of RC' promise)** — Ship server-backed share/import + the public track library. FEATURES.md marks public tracks 🟡 'needs sync (not shipped)' and the social tier is offline-mock (D45/D46). The share/import handlers are built+tested in server/ but NOT app-wired…
- `M·M·theo-app` **Make trial entitlement real — premium is currently un-gated** — Gate premium behind the trial/subscription. FEATURES.md §1: 'Trial enforcement ⬜ — countdown is cosmetic only; no entitlement gating yet.' The signed EdDSA entitlement token exists in server/ but the app never enforces it.
- `L·M·theo-app` **Add a starred-settings / vs-compare setup workflow in the sheet** — Bring the validated So Dialed UX patterns into the SheetEditor: starred (frequently-tuned) settings surfaced first, diff-on-duplicate with changed-field highlights, and a one-tap 'vs kit' / 'vs version' compare. The immutable-versions model…

**📚 KB quality**
- `M·M·human-gated` **22 LIVE rules carry # REVIEW flags where the cited book contradicts or only partially supports the stated effect** — Resolve the # REVIEW-flagged rules (e.g. kb-tc-shock-rear-thinner-403: NT1 says thinner rear oil increases braking grip but DECREASES corner-exit forward bite — the OPPOSITE of the rule's forward-bite address). Each flag is a rule whose use…
- `M·L·in-zone` **Reduce single-source / # REVIEW rules on high-stakes settings** — Promote a second independent source onto the many rules that are single-source and carry '# REVIEW' flags where the cited book actually contradicts the stated effect (e.g. touring rear-shock-oil 403/404 where NT1 p.11 says the opposite of t…
- `M·M·in-zone` **Broaden NLU vocabulary and add a clarify-on-ambiguity path** — Expand parseFeedback beyond ~12 symptoms and add disambiguation when free text is mixed/ambiguous instead of silently dropping to two tags (nlu.ts slices to 2 symptoms / 2 phases, returns empty on no-match → generic 'couldn't pin it down').…

---

## D71 — Discovery sweep (2026-06-20, 6-lens read-only workflow, 35 agents)

A second night pass: a read-only fan-out over the zones NO prior audit had dug into (apps/web, packages/pdf,
app-tier UX, doc-drift, launch-blockers, RC-world research), each finding skeptic-verified for real+novel
against this list and STRENGTHEN. **26 confirmed-novel findings.** 6 in-zone ones already FIXED + committed
this pass (✅); the rest are below for your review. **Read the 3 🚨 P1s first — two of them mean the 417-rule
engine precision is DARK in the shipped app right now.**

### 🚨 P1 launch-blockers (review FIRST)
- `H·M·theo-app` 🚨 **On-road cars are silently given the OFF-ROAD generic template → off-road rules FIRE on a touring/GT car (mis-cited), and every D55 on-road rule is unreachable.** `NewCarForm.tsx:46-50 templateFor()` only matches 'mp11'/'inferno' by model and returns `generic-offroad` (scope `[1-8-offroad,1-10-offroad]`) for everything else; the user-picked `category` is captured but never consulted. retrieval.ts:53 intersects scope → off-road shock/camber rules pass for an on-road car while on-road-scoped rules go dark. **This is worse than silence: confidently wrong, off-road-book-cited advice on the most common path.** Fix: select the template from the picked category/scale/power (map to a categoryTemplate / registry id, let `resolveTemplate` finish). *(Already named as a Théo task in CLAUDE.md "Next" — this escalates it to P1 with the wrong-advice consequence.)*
- `H·S·theo-app` 🚨 **Surface-family + power tags never reach the engine in the app → surface amplification dark, `forbidden_on` dark, EVERY `legal_in_power` rule dropped for all users.** The app's only tag producer is the hand-rolled `conditionTags()` in `logbook/src/bundle.ts:12-35` (emits grip/bump/dusty/wet/hot/cold only); `buildConditionTags`/`surfaceToTags`/`powerTypeToTags` (built D52/D57/D63) have ZERO callers in apps/mobile; retrieval reads only `bundle.track.conditions`. So a rule the KB flags WRONG-for-this-surface can still be offered, and all 38 live gearing/power-gated rules vanish. Fix: replace `conditionTags` with one `buildConditionTags(conditions, surface, powerType)` call. **Low effort, huge payoff — this lights up the bulk of the 417 rules.** *(Also a listed Théo task; escalated.)*
- `S·human-gated` 🚨 **Every web CTA points at the unregistered placeholder `griplab.app` — the whole funnel dead-ends the moment the site is public.** `apps/web/src/config.js` LINKS.trial/account both = `https://griplab.app`; hero/nav/pricing/final/footer all resolve to it; `test/config.test.mjs` even asserts the placeholder. Don't deploy the public site until the domain/brand is ratified and repointed (depends on D19 brand + a real web-subscribe URL from server/).

### ✅ Fixed + committed this pass (in-zone, reversible)
- ✅ **`analyzeRuns` cross-track context-mix (#26)** — grounded the next-plan in the feedback run's OWN context; refuses when the complaint is from a different track than the latest run (was lighting wrong surface rules). `commit f36b395`
- ✅ **Dead code removed (#24)** — `invalidCitations` + `RuleHistory.last`. `commit 5b22760`
- ✅ **Doc de-lie** — CLAUDE.md current-state (frozen at D57 → D58-D71 bullet, 417 live, eval 28/28), FEATURES.md eval 10/10→28/28, CONTRACTS.md cold air-only→air OR track, BACKEND_STATUS.md 18→24 suites / 12→19 api. `commit 7e031c8`
- ✅ **PDF PoC un-broke (#pdf_source)** — `pdf_source` + probe/rects/list-fields pointed at the moved chassis path; fill.ts runs again (51 fields). `commit 8098d77`

### 🌐 apps/web (marketing site — Théo zone unless noted)
- `L·theo-app` **100% of page copy is JS-injected via third-party CDN ESM (jsdelivr), no fallback** — a CDN outage/block → blank page; non-JS crawlers see empty `<main>` (OG tags ARE present, so share previews survive). Self-host three/gsap/lenis + add a static hero-copy fallback. (`index.html` empty section shells; `main.js:1-3` top-level CDN imports.)
- `S·human-gated` **Sample report copy cites a fabricated 'HUDY rule 4.2'** (`config.js:49`) — contradicts D53 (citations internal) + its own 'every change cites a KB rule' line, and surfaces a competitor trademark as the authority. Replace with a non-fabricated, non-trademarked confidence line; William signs off any public HUDY mention.
- `S·theo-app` **SEO/social meta gaps** — no Twitter card, no og:url/canonical, og:image root-relative, no robots.txt/sitemap.xml. One-time static edits.
- `S·human-gated` **`<title>`/og:title ship the codename 'RaceLab'** while the funnel points at griplab.app — drive title from the BRAND token once brand is ratified (no codename in prod).

### 📄 packages/pdf (export pipeline — in-zone, but precondition builds for app-wiring)
- `M·in-zone` **fill path has zero error handling** — one missing/renamed field or oversized value aborts the whole export (probe.ts guards setText, fill.ts dropped it). Per-field try/catch → {field,reason} fill-report, continue.
- `M·in-zone` **No importable API** — fill.ts is a hardcoded top-level-await demo; extract a pure `fillSheet(pdfBytes, map, values, checks): Promise<Uint8Array>` + add package main/exports. This is the real precondition for SheetEditor PDF export.
- `M·in-zone` **Checkbox group resolution unimplemented** — keys encode `field=value` but fill.ts checks hardcoded boxes; a non-default option (e.g. diff_gear_front='12/18') matches nothing → silently exports a kit-default sheet (confidently wrong). Parse `field=value`, group, match the setup's value, flag unmatched.
- `L·human-gated` **Coverage reality** — only MP11 has a pdf-map and only ~49 of its boxes are real AcroForm fields (the rest need an overlay mode that doesn't exist); 0/236 other models. Decide: build overlay mode, or gate export to mapped chassis + label the rest 'export coming'.

### 📱 app-tier UX (Théo zone, flag-only — racer trackside friction)
- `S·theo-app` **Run-form weather autofill fetches 'now', ignoring the run's date/time** (`RunFormV2.tsx:210`) — backfilled/Speedhive-imported runs get wrong air temp → engine reads the wrong hot/cold tag (silently wrong). Pass the run's chosen instant (weather pkg already accepts a historical whenIso).
- `S·theo-app` **Track form silently defaults surface to 'clay' when none tapped** (`TrackForm.tsx:135`) — surface is THE grounding axis; an on-road/carpet racer who skips it ships a track tagged off-road dirt → wrong advice for the track's life. Require a surface (or derive from car category).
- `M·theo-app` **Conditions not carried forward between consecutive runs** — every heat re-enters grip/weather/length/sky/bumpiness (`RunFormV2.tsx:163-168`). A 6-10-run club day = repeated friction that makes racers stop logging → starves the learning loop. Prefill (greyed/override) from the last run at this track.
- `L·theo-app` **No path to apply an engineer recommendation to the sheet** — report says 'front shock oil 2 steps thicker', racer must remember + switch tabs + hand-edit. Add 'Apply to a new setup version' on grounded cards (preserves immutable-version model + makes it diffable for the next outcome rating).
- `S·theo-app` **Sheet editor has no field search/filter** — finding one setting trackside = scrolling 6 sections (Starred only helps if pre-starred). Add a filter box over the field list.
- `S·theo-app` **Run outcome (better/same/worse) never prompted after a setup-change run** — rating is a hidden post-hoc gesture (`RunsScreen.tsx:343-353`), so most runs ship outcome=undefined → the condition-segmented learning loop is starved of its #1 signal. Surface a one-tap prompt at save/celebration.

### 🛞 RC-world coverage gaps (in-zone authoring — need grounding + a William scope call)
- `M·in-zone` **Chassis flex (top-deck/stiffener) entirely absent** — not even a recordable field; it's a signature on-road grip lever (more flex = mechanical grip on low-bite, less = sharper on high-bite). Add `chassis_flex` to on-road templates + grounded rules (So Dialed / CompetitionX / rctech).
- `M·in-zone` **No asymmetric-handling symptom or cross-weight (tweak) lever** — 'turns sharper one way' is unparseable; the `tweak` field has zero rules. Add NLU `asymmetric_handling` + a cross-weight rule (equalise toward ~50%). Distinct from the M5 per-corner data-model.
- `P3·in-zone` **On-road template fields exposed-but-dark** — anti_dive, belt_tension_front/rear, body_mounting are recordable but have no rules. Either author thin grounded packs or mark record-only so the exposed-vs-ruled set stays honest.
- `S·human-gated` **Drag brake (electric ESC) uncovered** — a daily corner-entry rotation lever for electric racers; sits near the D13 nitro/engine refuse boundary → needs a scope ruling (in like gearing, or canned refusal).
