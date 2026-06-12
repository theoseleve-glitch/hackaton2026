# 08 — Backend Plan (William + Claude own this; Théo owns the frontend)

> **Team split (D25):** Théo = frontend (screens, components, design, UX features in `apps/mobile/src/screens|components`, theme). William+Claude = **backend** = everything else: domain packages, storage, server side, content pipeline, contracts, CI. The border crossing is `CONTRACTS.md` — the frontend codes against contracts, never against our internals.
>
> "Backend" for RaceLab is two-tier by design (D18/D11): **Tier A — on-device backend** (the packages: domain logic, storage, advisor — the product works 100% offline) and **Tier B — cloud backend** (Vercel: auth, backup, sharing, PDF service — sync-when-online enrichments, never load-bearing for advice).

## The map

Tasks are `B0…B11`. ⛔ = blocks what follows · 🎯 = V1.0 critical path · 🔶 = V1.1 · Each card = one cook session (or one ultracode session where marked).

> **Status after the 2026-06-12 ultracode session (D26–D31):**
> ✅ **Pre-B1 keystone**: `packages/schema` (unified domain contract, 203+ tests, absorbs Théo's logbook vocab verbatim + bridge lifts → B0 becomes mechanical).
> ✅ **B1**: `CONTRACTS.md` at repo root (all package surfaces + stability promises) — Théo's review/sign-off pending.
> ✅ **B2**: `packages/storage` (137 tests — repos, same-transaction outbox, quarantine, idempotent legacy migration; expo-sqlite glue needs one device smoke test).
> ✅ **B3**: `packages/weather` (129 tests — Open-Meteo forecast+archive, no key, stale-if-offline cache, backfill; ⚠ free tier is non-commercial → William licensing call before launch).
> ✅ **B4+**: engine overhaul (history read-half with track-isolated ±1-tier re-ranking, `proposePlan` ≤3 ranked cited changes, `analyzeRuns` reports, `planRaceDay`; 13/13 eval scenarios).
> ✅ **B5/B6 (code-ready, NOT deployed)**: `packages/account` + `server/` (135 tests — 15-day trial, external web subscribe, deletion+tombstone, backup push/restore handlers; blocked on Vercel/Clerk/Neon accounts = William).
> ✅ **B9**: `packages/speedhive` (130 checks — verified public endpoints + lapchart, quarantined unverified paths, politePoll; practice API shapes from William's intercept, paths unverified).
> ✅ **B10 (class slice)**: `kb/chassis/registry.json` (11 entries) + `kb/classes/1-8-tt-buggy.json` + `packages/kb` validators (93 checks); chassis #2+ PDF extractions still pending (needs PDFs).
> ⏭ **B0** unification merge (now mechanical via `schema/src/bridge.ts`), **B7/B8/B11** unstarted.

| # | Task | Tier | Pri | Depends | Definition of done |
|---|---|---|---|---|---|
| **B0** | **Unification merge** — merge `theo/racelab` + `william/racelab` into shared `racelab`: ONE run-log domain (Théo's richer run schema — tyres, sky, evolution, temps — inside our session container + outcome attribution + hardened persistence), keep his report/tips/compare + our chat hooks, renumber D-rows (his D22-24 → D23-25 slots resolved in the merge), all suites green | A | ⛔🎯 | — | Single branch both teams base on; sessions+logbook merged into one package; every test green; D-log linear (ultracode recommended) |
| **B1** | **Contracts** — `CONTRACTS.md` + barrel exports: the exact types/functions the frontend may import from each package, stability promises, and a changelog section. Théo reviews & signs | A | ⛔🎯 | B0 | Théo can build any screen without reading package internals; CI fails if a contract export breaks |
| **B2** | **Storage core** — decide & implement D11 properly: expo-sqlite repository layer (or justified AsyncStorage keep), per-domain stores behind one interface, **append-only outbox** journal of mutations, migration from current blobs, never-wipe semantics everywhere | A | 🎯 | B1 | All domains persist through one storage interface; outbox records every mutation; blob→sqlite migration tested; kill-app-mid-write test passes |
| **B3** | **Weather module** — `packages/weather`: Open-Meteo client (no key needed), forecast fetch when online, **historical backfill** for sessions logged offline (GPS+timestamp → conditions), cache; feeds `RunConditions` | A | 🎯 | B1 | Session conditions auto-fill when online; offline sessions backfill on reconnect; unit-tested with recorded fixtures |
| **B4** | **Learning-loop read half** — outcomes → `ContextBundle.history`; the engineer cites past results ("softer front bar rated better here last time"); per-driver/per-track re-ranking of retrieval | A | 🎯 | B0 | Engine tests prove a past "worse" outcome demotes that rule; chat visibly references history; eval extended |
| **B5** | **Auth** — Clerk: sign-in (email+Apple+Google), cached-user-id (local data NEVER session-gated — airplane-mode-48h test), in-app account deletion path (D17), privacy policy page | B | 🎯 | B2 | Sign in/out works; offline app fully usable signed-out; deletion wipes server data + works from the app |
| **B6** | **Backup/restore** — Vercel + Neon: push the outbox when online (append-only, idempotent), restore-on-fresh-install, per-user isolation; this is NOT sync (D11) | B | 🎯 | B2,B5 | Wipe device → sign in → full history back; interrupted upload resumes; server never holds the only copy of anything newer than the device |
| **B7** | **Sharing backend** — publish endpoint (immutable setup snapshot → public id), static share page (rendered sheet image/PDF + install CTA, D10), import-by-link into the app with provenance | B | 🎯 | B5,B8 | Share a setup → friend opens URL on the web → taps import in app → fork with lineage |
| **B8** | **PDF service** — `packages/pdf` → Vercel function: setup JSON → filled MP11 AcroForm + generic layout fallback; consumed by share page + an in-app export button (button = Théo, endpoint = us) | B | 🎯 | B1 | POST setup → correct PDF bytes; pixel-verified vs the local PoC output |
| **B9** | **Speedhive adapter** — `packages/speedhive`: eventresults + practice API clients behind OUR interface (their API is unofficial — one file to fix if it shifts), polite polling + cache, session lap-import; OAuth account link later (flagged beta) | B | 🔶 | B1 | Pull a real RC club event's laps end-to-end; import attaches laps to a session run; adapter swappable |
| **B10** | **KB/content pipeline** — chassis #2-8 extraction (needs PDFs from William), KB bundle versioning + changelog, eval-set growth, optional remote KB data refresh (data-only download, advice path stays offline) | A | 🎯 (content) | — | Each new chassis = md spec + template + pdf-map + bundle rebuild + eval pass |
| **B11** | **Ops/CI** — GitHub Actions: all package tests + tsc + expo export on every push; Sentry crash reporting; analytics event contract (PostHog) written for Théo to fire from UI | B | 🎯 | B0 | Red CI blocks merge; crashes visible; events documented in CONTRACTS.md |

**Order of battle:** B0 → B1 → then two lanes in parallel: *device lane* B2→B3→B4 (pure TS, fully verifiable locally) and *cloud lane* B5→B6→B7/B8 (needs Vercel/Clerk accounts — William creates them once, ~30 min human task). B9 anytime after B1. B10/B11 continuous.

**Human-only prerequisites (William, once):** Vercel account + project, Clerk account, Neon via Vercel marketplace, Apple/Google dev accounts (D17), chassis PDFs for B10. Until these exist, cloud-lane tasks stop at "ready to deploy".

## The prompt library (copy-paste these)

**1. The standard backend cook** (one task card per session):
```
Cook. You're chief officer of RaceLab — follow CLAUDE.md to the letter.
Target: B<N> from docs/08_BACKEND_PLAN.md — read the task card first.
Backend rules: contract-first (update CONTRACTS.md + types BEFORE implementation);
do NOT touch apps/mobile screens/components/theme (Théo's zone) — wiring beyond
the contract goes in a "frontend handoff" note in the final summary instead.
Ship: package + tests + verification + docs sync + push. End with TLDR,
improvement ritual, frontend-handoff note (what Théo can now build), next task.
```

**2. The unification merge (B0 — run this FIRST):**
```
Cook ultracode. Target: B0 unification merge per docs/08_BACKEND_PLAN.md.
Merge theo/racelab + william/racelab into a new shared branch `racelab`:
one run-log domain (Théo's run schema richness + our session container,
outcome attribution, hardened persistence), keep his report/tips/compare
AND our chat hooks/Sessions wiring, renumber the D-log linearly, resolve
App.tsx/EngineerScreen/engine-index conflicts. Fan out reviewers on the
merged domain model before committing. Every suite green + Metro export
green. Push `racelab` and update both CLAUDE.md state + CONTRACTS.md stub.
```

**3. Integration day** (run ~every 2-3 days or after Théo pushes):
```
Cook. Integration day: fetch all branches, report Théo's frontend changes,
verify they only touch his zone, run every suite + tsc + expo export against
the merged state, fix any contract breakage ON OUR SIDE (or flag his), update
CONTRACTS.md changelog, push. Then continue the highest-leverage B-task.
```

**4. Big slice, max firepower** (cloud lane or anything multi-package):
```
Cook ultracode. Target: B<N> per docs/08_BACKEND_PLAN.md. Orchestrate:
contract-first builders with strict file ownership, an integrator that runs
all verifications, adversarial reviewers on the data/security model before
commit (for B5-B7: attack auth boundaries, idempotency, never-wipe, GDPR
deletion). Apply must-fixes, ship, push.
```

**5. Content session (B10, when you have a new chassis PDF):**
```
Cook. Target: B10 — extract <brand model> from the PDFs I dropped in the
repo: chassis md spec (typed params, kit defaults, option catalogs, part
numbers), kb template JSON, pdf-map probe, KB rules additions if the manual
has tuning tables, bundle rebuild, eval re-run, push.
```

## Working rules that make this efficient

1. **One B-task per session, finished** — a half-done backend task blocks Théo; a finished small one unblocks him.
2. **Contracts before code** — every session that changes a package surface updates `CONTRACTS.md` in the same commit. That file is Théo's only required reading.
3. **The frontend zone is read-only for us** (`apps/mobile/src/screens|components`, `theme.ts`) — we hand off integration notes, he wires UI. `App.tsx`/`store.ts` are shared seam files: changes there must be contract-driven and called out in the handoff note.
4. **Cloud is never load-bearing** — every Tier-B feature must leave the app fully functional when the endpoint is down (D18/D11 spirit). Reviewers attack this explicitly.
5. **Tests are the API police** — each package keeps its own suite; CI (B11) runs everything; a contract change without a changelog line fails review.
