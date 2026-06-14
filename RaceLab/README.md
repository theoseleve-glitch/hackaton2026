# RaceLab

**The Strava of RC racing.** Store your setup sheets, comment and version them, get condition-aware AI tuning advice, and share setups with the community.

> 📦 **New here (hi Théo 👋)?** Read in this order:
>
> 1. [`docs/00_CONTEXT.md`](docs/00_CONTEXT.md) — everything decided so far, competitor analysis, glossary
> 2. [`docs/01_CONCEPT.md`](docs/01_CONCEPT.md) — the vision and the core loop
> 3. [`docs/02_FEATURES_CORE.md`](docs/02_FEATURES_CORE.md) — **committed features** (the product we are building)
> 4. [`docs/03_FEATURES_EXPLORATORY.md`](docs/03_FEATURES_EXPLORATORY.md) — **idea backlog** (proposed, NOT committed — react to these)
> 5. [`docs/04_AI_RACE_ENGINEER_SPEC.md`](docs/04_AI_RACE_ENGINEER_SPEC.md) — deep spec of the AI advisor (our #1 differentiator)
> 6. [`docs/05_SOCIAL_SPEC.md`](docs/05_SOCIAL_SPEC.md) — deep spec of the sharing/social layer (our #2 differentiator)
> 7. [`DEV_PLAN.md`](DEV_PLAN.md) — execution: stack, roadmap, work split, monetization

**The two files that matter most right now:** `02_FEATURES_CORE.md` (agreed scope) vs `03_FEATURES_EXPLORATORY.md` (ideas to debate). Keep them strictly separated: an idea only moves from 03 → 02 by team decision, logged in `00_CONTEXT.md §Decisions`.

## Status

- **Phase:** MVP built — full Expo app live in `apps/mobile` (garage · setup sheets · tracks · run log · 8-part engineer report · race planner · pit strategy) + 14 pure-TS packages (all suites green) + a code-ready Tier-B `server/` (Stripe/entitlement/backup/share/content/GDPR/push — **NOT deployed**, gated on accounts/keys). Branch: `racelab` (B0 unified both teams' work).
- **Where things are:** [`CONTRACTS.md`](CONTRACTS.md) = the frozen package/API surfaces (the frontend border) · [`packages/README.md`](packages/README.md) = narrative package status · [`docs/BACKEND_STATUS.md`](docs/BACKEND_STATUS.md) = the server tier (done / code-ready / blocked).
- **Team:** William (product, design/DA ✅ done, content, 63-rule tuning KB, monetization) · Théo (app / frontend)
- **Competitor to beat:** [So Dialed](https://www.sodialed.com/) — see teardown in `00_CONTEXT.md`
