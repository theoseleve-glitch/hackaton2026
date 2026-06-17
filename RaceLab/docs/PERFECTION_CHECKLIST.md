# RaceLab — Perfection Checklist (Backend + Setup Engineer)

> **⚡ STATUS (2026-06-17, D57): the in-zone P0/P1s below are DONE** — see the D57 decision row. Executed: P0-1 (resolveTemplate), P0-2 (4 rules quarantined), P0-3/P0-4 (validate-live gate + root runner), P1-E1/E2/E3, P1-B1/B2/B3/B5/B6/B7/B8 (server hardening, 24/24), P1-D* (docs de-lied). **Resolved-as-non-issue:** P1-K3 (D53 — blogs are acceptable internal grounding). **Still open (human/Théo):** CI activation (move `ci/` to the shared repo-root `.github/`, William's call) · the 4 quarantined rules' true direction + D29 price (William) · app model-picker + `surfaceToTags`/`powerTypeToTags` union + EdDSA client-verify (Théo, §0.2 + `PIT_BOARD.md`) · backend wire-or-cut (§0.1) · most P2/P3 polish. The §2–§5 items below are the original audit text, kept for reference.
>
> **Continuum loop — D58 (2026-06-17):** storage **single-writer wedge** (audit HIGH) fixed — `Repos` mutations now serialize through a write-chain so two concurrent un-awaited writes can't collide a seq and permanently brick the offline store; regression added (parallel puts → distinct seqs, store survives). storage 144/144.
> **Continuum loop — D59 (2026-06-17):** storage **sqlite `commit()` duplicate-seq divergence** (P2) fixed — `commit()` (the path `mutate()` uses) now disambiguates a seq collision to `duplicate_seq` instead of a generic `driver_error`, matching `append()`/memory/kv; uniformity test extended to `commit()` across all adapters. storage 148/148. *(Remaining storage P2: the in-session `seq_desync` self-heal — own iteration, lower priority now D58 removed the main trigger.)*
> **Continuum loop — D60 (2026-06-17):** **weather + speedhive request timeouts** (P2) — every network request is now bounded by a clearable `Promise.race` timeout (default 10s) so a hung upstream returns `network_error` instead of blocking the caller forever; tests assert a never-settling fetch is bounded. weather + speedhive green.


*Produced 2026-06-17 by a 13-subsystem adversarial audit (each unit audited + re-verified by a skeptical second reviewer + two completeness-critic passes; ~90 raw findings, deduplicated here). Every critical/high was evidence-backed at file:line; the headline `resolveTemplate` bug was additionally hand-verified by William's Claude. Full raw findings: the three workflow outputs under `tasks/wyxun31n0|w8w3183ab|wz0ilqce0.output`.*

> **Scope of "perfect":** correct · grounded (D18) · secure · tested · CI-gated · docs that don't lie. Items are tagged **P0** (ship-blocking / invariant-violating), **P1** (high), **P2** (medium), **P3** (polish), with effort **S/M/L** and the owning area.

---

## 0. The meta-truth — read this first

Three findings reframe everything below; until they're settled, individual fixes are lower-leverage than the decisions:

1. **🔴 Split-brain: the entire backend tier is dead code from the app's view.** `apps/mobile` imports **zero** of `schema / storage / server / account / weather / speedhive`. The app persists via AsyncStorage and runs only on the app-tier packages. So every backend security finding (IDOR, Stripe, entitlement, FKs) is **real in the code but moot for shipped behaviour** — and CLAUDE.md/CONTRACTS call `schema` "the app's data layer" when nothing imports it. **Decision required (William/Théo): is the backend the next wiring task, or speculative? Nothing else about the backend can be correctly prioritised until this is answered.**

2. **🔴 The 237-model engine is unreachable from the app.** `EngineerScreen.tsx:50` and `RunForm.tsx:91` hardcode `MP11_ID`; `garagestore` seeds MP11; unknown cars fall back to `generic-offroad`. The whole D47 registry + D49 model-gating never gets exercised by a real user path. Combined with bug P0-1 below, the model-aware story is doubly dark.

3. **🔴 CI has never run. Grounding gates are dark on the live path.** `ci/racelab-ci.yml` exists but `.github/workflows/` does not. There is no root workspace runner — "all green" means a human ran `npm test` in 16 packages by hand. `validate-drafts` (the citation/contradiction/capability/caster gates) runs only over the now-**empty** `drafts/` dir and isn't in any `npm test`. **D18 — the product's core promise — is currently unenforced by any automation.**

---

## 1. What's genuinely solid (don't "fix" these)

The audit was adversarial; these survived it with evidence:

- **D18 is structurally enforced, not asserted.** Grep of `Math.random|Date.now|fetch|node:` across `packages/engine/src` is clean on the advice surface (one code *comment* aside); `index.ts` exports only pure data + pure functions. The app-bundled engine cannot make a network call.
- **The confidence qualifier is provably additive** — it softens wording but never feeds back into ranking (`offline.ts`); **history re-ranking is honestly clamped** to ±1 tier and runs *after* all exclusion filters, so it can reorder grounded rules but never resurrect a filtered one.
- **Scope isolation in the 417-rule KB is real, not asserted** — a cross-file contradiction scan restricted to rules that can co-load on one car returns **0**; the bundle-freshness guard re-serialises and byte-compares, so a forgotten `npm run bundle` fails the suite.
- **Storage atomicity is genuine** — outbox row + data row commit all-or-nothing per adapter; kill-mid-write recovery is *tested as behaviour* at every fault offset; migration idempotence is structural (seeded RNG) and never-wipe is honoured everywhere (corrupt cells are quarantined, never overwritten).
- **Schema is deterministic and defensive** — no `Date.now`/`random`, deep-freeze top-to-bottom, discriminated `{ok}` results, load-path validators mirror write-time invariants, NaN/Infinity pre-scan before `JSON.stringify`.
- **Refusal discipline is careful** — word-boundary scope matching (no more `clean`/`leans` false-refusals), unknown chassis refuses in-band rather than throwing, honest `do_nothing` vs `refusal` split on race day.

---

## 2. P0 — Critical (invariant-violating or self-contradictory; fix before any "done" claim)

### P0-1 · Chatbot / race-day planner / run-analysis refuse on 236 of 237 models  ·  engine · **S**
`recommend()`/`buildReport` correctly use `resolveTemplate` (D49 category fallback), but **three siblings do a raw `data.templates[id]` lookup** that is `undefined` for every `pending_pdf` model → in-band refusal:
- `plan.ts:59` (`proposePlan`) · `raceday.ts:80` (`planRaceDay`) · `reports.ts:278` (`analyzeRuns`)
- Effect: the chatbot greets *"Race engineer ready — <brand> <model>"* then refuses *"…not in the KB"* on the very next turn, for 99.6% of the catalogue.
- **Fix:** replace the 3 lookups with `resolveTemplate(data, id)` (already exported from `./data`; add the import these 3 files lack). Add an end-to-end test driving a `pending_pdf` chassis (e.g. `kyosho-inferno-mp10`) through chat/proposePlan/planRaceDay/analyzeRuns asserting a grounded card. *(Verified by hand.)*

### P0-2 · LIVE rules cite the page that states the OPPOSITE effect  ·  KB · **M**
3 promoted on-road rule files carry `# REVIEW: DIRECTLY CONTRADICTS` / `INVERTED on NT1` / `may be inverted`, shipping at `confidence:high` in `bundle.json`:
- `kb-no-rollcenter-rear-higher-511` (`1-10-nitro-onroad.yaml:255`), `kb-gt-rollcenter-rear-higher-530` (`1-8-gt.yaml:686`), `kb-gt-front-spring-stiffer` (`1-8-gt.yaml:140`), `kb-gt-diff-rear-thicker` (`1-8-gt.yaml:880`).
- `offline.ts:112` surfaces `Per <sources[0]>: …`, so the user is shown the contradicting page as the *ground* for advice that page says makes it worse — the exact "guess dressed as a citation" D18 forbids.
- **Fix (William's call on direction):** pull these back to `drafts/` or flip them to match the cited effect. Add a build gate: a rule whose YAML contains `DIRECTLY CONTRADICTS`/`INVERTED`/`may be inverted` may not live at `confidence:high`.

### P0-3 · CI parked + live grounding gate dark  ·  cross-cutting · **M**
No `.github/workflows/`; `validate-drafts` runs on the empty `drafts/` dir and isn't in `npm test`. A future fabricated citation, contradiction, or caster inversion on a live rule ships green.
- **Fix:** (a) point `validate-drafts` at `kb/rules/*.yaml` (the gate logic already exists — just change the target dir) and add a `validate-live` step to `packages/kb` test; (b) move `ci/racelab-ci.yml` into `.github/workflows/`; (c) add a root `package.json` with a `test-all` script so CI and humans verify the same thing.

### P0-4 · Bundle staleness can silently ship old advice  ·  cross-cutting · **S**
The app loads `packages/kb/bundle.json` verbatim (D18 offline). The `registry/rules → npm run bundle → bundle.json` chain is manual; freshness is tested but not CI-gated.
- **Fix:** add `npm run bundle --check` (or assert `bundle.json` matches current registry+rule counts) to the CI gate from P0-3.

> **P0 decisions (cannot be coded around) — see §6:** the backend wire-or-cut call (§0.1) and the model-selection wire-or-scope call (§0.2) are themselves P0 for honesty even though they're not code edits.

---

## 3. P1 — High

### Setup Engineer
- **P1-E1 · `legal_in_power` gate has no production data source**  ·  engine · **M.** The 4 live gearing rules (`pinion_teeth`, `[stock_blinky,modified_power]`) are dropped for *every* run because no producer ever emits a power tag into `track.conditions` (`conditionsToTags`/`surfaceToTags` don't). Tests pass only because they inject the tag by hand. **Fix:** add a pure `power_type → tag` mapper in schema and union it into the bundle (mirrors `surfaceToTags`); add a test on a real-built bundle.
- **P1-E2 · `raceday.ts` skips the `templateExposes` capability gate**  ·  engine · **S.** `planRaceDay` can recommend a setting the resolved category template doesn't expose. **Fix:** apply the same capability filter `retrieve()` uses.
- **P1-E3 · `readinessFacts` clears all symptoms when any later run is rated "better"**  ·  engine · **S.** `planner.ts` over-broadly wipes symptom history regardless of which symptom improved → wrong race-plan readiness. **Fix:** scope the clear to the symptom actually rated better.
- **P1-K1 · 39 models have wired templates but zero live rules**  ·  KB · **M.** 4 category templates resolve but the advisor always generic-refuses. **Fix:** author rules for those categories or mark them explicitly "category pending."
- **P1-K2 · 84 LIVE rules name "HUDY:" in user-facing guidance with no HUDY cite in `sources[]`**  ·  KB · **M.** Provenance drift; where NT1/HUDY disagree, the HUDY-named guidance masks an unverified claim. **Fix:** strip the `HUDY:` prefix where unsourced, or add the real page; add a lint (guidance-named source must be in `sources[]`).
- **P1-K3 · 4 of 5 weather rules ship `confidence:high` grounded only on hobby blogs**  ·  KB · **M.** `planRaceDay` surfaces "Per JQRacing…" as forecast provenance. **Fix:** drop to `confidence:low`/`drafts` until page-cited, or register blog sources as `page_cited:false` and require a page-cited co-source.

### Testing
- **P1-T1 · eval only exercises `recommend()`**  ·  test · **M.** The 26 scenarios never touch `buildReport`/`proposePlan`/`chat` — exactly the paths with the P0-1 bug. **Fix:** add scenario coverage through those entry points.
- **P1-T2 · `settings_any_of` too loose in 21/26 scenarios**  ·  test · **M.** Can't catch primary-ranking regressions. **Fix:** assert the expected primary (`primary_cites`) on ranking-sensitive scenarios.
- **P1-T3 · no negative-assertion coverage for `forbidden_on` / `legal_in_power` / race-day reversal-cost filter**  ·  test · **S.** The exclusions are never proven to exclude. **Fix:** add trap scenarios asserting the rule is *absent*.

### Backend (real in code; gated behind the §0.1 wire-or-cut decision)
- **P1-B1 · `rateLimit` is wired to NO route**  ·  server · **S.** Every endpoint is unthrottled — incl. the auth-free Stripe webhook and the EdDSA signing endpoint. (Converges across server-infra/account/money/data audits.) **Fix:** attach the limiter in the router; populate client IP on `HttpRequest`.
- **P1-B2 · EdDSA offline entitlement token is not verified client-side**  ·  server · **M.** The forgery guarantee doesn't currently hold end-to-end. **Fix:** implement client verification against the published public key; add a tamper test.
- **P1-B3 · No token revocation path**  ·  server · **S.** A canceled sub keeps PRO until the cached token expires (≤24 h). **Fix:** short TTL + a revocation/`updated_at`-receipt check.
- **P1-B4 · Tombstone does NOT block re-trial / re-signup**  ·  account · **M.** A deleted user re-trials freely. **Fix:** check the tombstone on `trial/start` + signup; add the regression test (P1-B's missing invariant test).
- **P1-B5 · Missing FKs → PII/billing survives deletion**  ·  server · **S.** `stripe_subscriptions`, `share_snapshots`, `share_imports` have no `REFERENCES users(id) ON DELETE CASCADE` — deleted-user rows persist and can re-apply. **Fix:** add FKs + cascade in `schema.sql`.
- **P1-B6 · `media.confirmed` column has no write path and isn't in the SQL schema**  ·  server · **M.** Quota is permanently overstated; presign path broken. **Fix:** add the column + confirm write, or recompute quota from actual blobs.
- **P1-B7 · metrics emit nowhere; async workers have no cron/entry**  ·  server · **H/M.** The alert catalog can never fire; GDPR export jobs stay `pending` forever once deployed. **Fix:** wire a metrics sink + a cron/api trigger for `exportAssembler`/`pushReceipts`/`mediaMaintenance`.
- **P1-B8 · `schema.SURFACES` enum is dead vocabulary vs the app's 58 `rcdata` surface ids**  ·  schema · **M.** Only `grass` overlaps; `parseTrack`/`parseRunEntry` would reject every real surface on load → silent total history loss the moment storage is wired. **Fix (do before wiring):** loosen `Track.surface` to `string` + `nonEmptyStr` validation (matches how `packages/tracks` already models it).

### Docs (they actively lie — cheap, high-trust fixes)
- **P1-D1 · CONTRACTS.md fabricates an `outcomes.ts` module** (exports live in `runs.ts`); claims `updateTrack` exists (it doesn't); wrong kb facet vocab + registry count (11 vs 237); omits `KBData.categoryTemplates` (the entire D49 mechanism). · **S each.**
- **P1-D2 · `04_AI_RACE_ENGINEER_SPEC.md`**: wrong rule count (80 vs 417), deprecated slash-scope example that *silently fires on zero models*, wrong `analyzeRuns` return type. · **S–M.**
- **P1-D3 · `CLAUDE.md`/CONTRACTS call schema "the app data layer"** while the app imports zero schema (the §0.1 lie). · **S.**

---

## 4. P2 — Medium (one-line; full detail in the audit outputs)

**Engine/KB:** `raceday` `toAdjustment()` reads `sources[0]` with no fallback (garbled output on a zero-source rule); `conditionsShift` hardcodes "all dry" even when wet runs are selected; weather rules have no `recommend()`-path eval; `validate-drafts` absent from CI (folds into P0-3).
**Schema:** `conditionsToTags` cold tag checks only `air_temp_c` (hot checks both) → cold rules miss on IR-gun-only frigid tracks; `conditionsFromTags` silently drops hot/cold on the bridge; `surfaceToTags` maps granite/fire_road into `loose_dirt` (wrong family).
**Storage:** sqlite `commit()` reports duplicate-seq as generic `driver_error` (diverges from memory/kv, untested); `duplicate_seq` is unrecoverable in-session (no self-heal from the persisted high-water mark).
**Adapters:** no request timeout/`AbortController` on any network call; Open-Meteo non-commercial-licensing risk has no code representation + base URLs not injectable; a **second, contradictory speedhive impl lives in the app** (`apps/mobile/src/speedhive.ts`, uses global `fetch`/`new Date()`).
**Account/Money:** trial boundary off-by-one (client inclusive / server exclusive); Clerk identity not deleted on account deletion (Apple 5.1.1(v)); `updated_at` derived from stale Stripe event epoch not receipt time; `subscriptionStatus` treats canceled-but-paid-through as active (diverges from entitlement).
**Data path:** `processReceipts` early-returns on first prune failure (discards the batch); `exportStore` job-id falls back to guessable `Date.now()+Math.random()`; export archive signed URL is caller-supplied with no expiry/domain check.
**Docs:** BACKEND.md route shapes (missing `/api/` prefixes, path-vs-query, entitlement response omits `token`/`server_time`); RunEntry shape mismatch (logbook shape documented, schema `session_id` undocumented).

## 5. P3 — Low / polish (one-line)

`history.last` dead field; two dead `guard.ts` exports (`settingUnknownToTemplate`, `invalidCitations` — the latter encodes a real invariant, consider wiring it); bare `lean`/`rich` keywords can false-refuse a chassis phrase; `SOURCE_ANCHORS`/`PAGE_CITED` hardcoded (no `sources.json` registry); 3 live rule files still carry "DRAFT, NOT bundled" headers; orphan `monster_truck`/`rally` templates; `cst` vs `cSt` casing across 12/16 templates; 10 registry entries with identity-only provenance; failed quarantine stash swallowed in `readAll`; `corruptUndoKey` single fixed key; non-atomic cross-kind migration; `TRIAL_DAYS=15` defined twice; anonymous-deletion offline cleanup gap; `race_avg_lap_s` misnamed (it's the min practice avg); various missing IDOR/trap/refusal-message tests.

---

## 6. Decisions only William (or William+Théo) can make

1. **Backend: wire or cut?** Wire `apps/mobile` onto `schema`+`storage` via `bridge.ts` (then all §3/§4 backend items become live and must be fixed) — or formally mark the backend speculative and stop documenting it as live. *Until decided, the backend audit findings are correct-but-moot.*
2. **Model selection: wire or scope?** Add a car/model picker that feeds registry ids into the bundle (makes the D47/D49 engine reachable — and makes P0-1 user-visible, so fix it first) — or document that v1 ships MP11 + generic-offroad only.
3. **The contradicting LIVE rules (P0-2):** flip to match the cited source, or pull to drafts — needs your tuning judgment on the true direction.
4. **Weather rules (P1-K3):** accept blog grounding at low confidence, or hold for HUDY/XRAY page cites.
5. **Pricing (still open from D29):** 9.99€/99.99€ unratified — blocks the money path either way.

---

## 7. Recommended execution order (highest leverage first)

1. **P0-1** resolveTemplate (S, pure win, no decision needed) — + the end-to-end test.
2. **P0-3 / P0-4** stand up CI + live grounding/bundle gates (turns every future regression into a red build).
3. **P0-2** quarantine/flip the contradicting rules + add the `DIRECTLY CONTRADICTS`-can't-be-high gate.
4. **§6 decisions 1 & 2** (backend wire-or-cut, model wire-or-scope) — these re-rank everything below.
5. **P1-E1/E2/E3** engine correctness (power gate, capability gate, readiness) — they make the *advice itself* right.
6. **P1-D1/D2/D3** doc de-lying — cheap, restores trust in the map the team navigates by.
7. Backend P1s (B1–B8) **iff** decision-1 = wire; otherwise file under "pre-wire blockers."
8. Sweep P2/P3 opportunistically alongside the above.

*Nothing in §2–§5 was started — per William's "I'll see this tomorrow." P0-1, P0-3, P0-4, P1-D* are reversible, decision-free, and ready to execute on the word go.*
