# Web Subscription (Live) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement Parts B–C task-by-task. Part A is human/account setup (William). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn RaceLab from fully-free/offline into web-first paid: account on racelabrc.app (Clerk), pay via Stripe Checkout, app validates entitlement against the deployed server and gates premium features — advisor stays free forever (D18).

**Architecture:** Clerk owns identity, Stripe owns money, our Neon DB owns the one fact the app reads (`subscriptions.status` + `expires_at`). The app never writes payment state — it opens the web checkout, signs in with Clerk to obtain a bearer, and reads `GET /api/subscription/status`, caching the result on-device (valid until `expires_at` + GRACE_DAYS=7, then premium fails closed). Cancellation is a pure web/Stripe action (Customer Portal) — no app logic.

**Tech Stack:** Expo SDK 56 RN app · `@clerk/clerk-expo` · `packages/account` (entitlements/validate, already built) · `server/` Vercel functions + Neon Postgres (already built; webhook added 2026-06-19) · Stripe Checkout + Customer Portal · web app in `apps/web`.

---

## Status (done 2026-06-19)
- ✅ **Stripe webhook keystone** — `server/api/stripe/webhook.ts`, `server/src/stripe.ts` (pure `mapEvent`), `server/src/handlers/stripeWebhook.ts`, `db.upsertSubscription`. Signature-authed, +14 tests, server tsc 0. The only writer of `subscriptions`.
- ✅ **Domain** racelab.app → racelabrc.app across app/web/docs; `SUBSCRIBE_WEB_BASE = https://racelabrc.app`.
- ✅ **Already existed (William's foundation):** `GET /api/subscription/status`, `/api/trial/start`, backup push/restore, `/api/account` delete; `packages/account` `canUse`/`touchPremiumFeature`/`validateSubscription`; entitlement model (`FREE_FEATURES=["advisor"]`, 8 premium features), GRACE_DAYS=7, offline policy, tamper-guarded clock.

## The gap (what makes this "live")
The app currently uses a **local** `apps/mobile/src/accountstore.ts` (profile + cosmetic trial countdown banner) that is **disconnected from `packages/account`**, has **no Clerk identity**, and **gates nothing** — every premium feature is open. Going live needs: (1) Clerk sign-in in the app, (2) bridge the app to `packages/account`'s entitlement state + `validateSubscription`, (3) actual gates on the 8 premium features, (4) the subscribe CTA, (5) the web checkout + portal pages, (6) deploy + a fresh AAB.

---

## Part A — External accounts (WILLIAM, critical path — start immediately, in parallel)

These are the long pole. The app/web code below cannot be end-to-end tested until at least Clerk (publishable key) and a deployed server exist.

- [ ] **A1 Clerk** — create a production instance. Capture: `CLERK_PUBLISHABLE_KEY` (app), `CLERK_JWKS_URL` = `https://<frontend-api>/.well-known/jwks.json`, `CLERK_ISSUER` = `https://<frontend-api>` (server). Enable email + (optional) social sign-in.
- [ ] **A2 Neon** — create a Postgres DB (Vercel Marketplace → Neon). Capture `DATABASE_URL`. Apply schema: `psql "$DATABASE_URL" -f server/db/schema.sql`.
- [ ] **A3 Stripe** — account in **live** mode (business verification can take time — start now). Create one Product "RaceLab Premium" with **two prices**: 9,99 €/month and 99,99 €/year (matches `apps/web/src/config.js`). **No Stripe-side trial** (the app runs the 15-day local trial). Enable the **Customer Portal** (allow cancel + payment-method update). Capture `STRIPE_SECRET_KEY` + the two **price IDs**.
- [ ] **A4 Vercel deploy** — deploy `server/` (its `vercel.json` exposes `api/*.ts`). Set env: `DATABASE_URL`, `CLERK_JWKS_URL`, `CLERK_ISSUER`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. (`server/src/deploy.ts` installs `@neondatabase/serverless jose stripe` at build.)
- [ ] **A5 Stripe webhook** — in Stripe, add endpoint `https://<deploy>/api/stripe/webhook` for `customer.subscription.created`, `.updated`, `.deleted`. Copy its signing secret → `STRIPE_WEBHOOK_SECRET` (redeploy). Send a test event; confirm a row appears in `subscriptions`.

## Part B — App paywall layer (code; needs A1 + A4 to boot/verify)

**Files:** `apps/mobile/app.json` (Clerk key + redirect scheme), `apps/mobile/App.tsx` (ClerkProvider + entitlement provider), new `apps/mobile/src/entitlements.ts` (bridge to `packages/account`), new `apps/mobile/src/screens/PaywallSheet.tsx`, gate call-sites across screens, `apps/mobile/src/components/TrialBanner.tsx` (CTA), `SettingsScreen.tsx` (account row / sign-in / restore).

- [ ] **B1 Add Clerk** — `npx expo install @clerk/clerk-expo expo-secure-store`. Wrap the app in `<ClerkProvider publishableKey={…} tokenCache={secureStoreCache}>` in `App.tsx` (outermost, above `RepoProvider`). Add a minimal sign-in/sign-up screen (Clerk hooks) reachable from Settings; the app stays usable signed-out (advisor + trial).
- [ ] **B2 Entitlement bridge** — new `src/entitlements.ts`: a hook/provider that (a) builds `EntitlementDeps` over an AsyncStorage `KV` + a clock, (b) on foreground/sign-in/checkout-return calls `validateSubscription(deps, await getToken())` when signed in + online, (c) exposes `useEntitlement(feature) -> EntitlementResult` backed by `canUse`/`touchPremiumFeature`. Reuse the existing local `trial_started_at` to seed `packages/account`'s trial. NEVER gate the advisor.
- [ ] **B3 Paywall sheet** — `PaywallSheet.tsx`: explains premium, "Subscribe on the web" → `Linking.openURL(buildSubscribeUrl(SUBSCRIBE_WEB_BASE, userId))`, "I already paid — refresh" → re-run `validateSubscription`. Bilingual (i18n `t({en,fr})`).
- [ ] **B4 Gates** (wrap each premium action; show PaywallSheet on `allowed:false`):
  - `multi_car` — GarageScreen: free = 1 car; 2nd "Add car" → gate.
  - `strategy_planner` — EngineerHub/strategy entry.
  - `full_version_history` — sheet version history beyond latest.
  - `analytics` — analytics/insights view.
  - `speedhive_import` — Speedhive import action.
  - `auto_weather` — auto-weather toggle.
  - `pdf_export` — report PDF export.
  - `public_sharing` — share-to-public (note: social is hidden in v1 — gate only if surfaced).
- [ ] **B5 Deep-link return** — register the `racelab://` redirect so returning from web checkout re-validates (foreground listener calling B2's validate).
- [ ] **B6 Verify** — app `tsc --noEmit` 0; boot in the emulator (needs A1 key); manual loop: sign in → tap a premium feature → paywall → (web pay in test mode) → return → feature unlocks → advisor works signed-out.

## Part C — Web checkout + portal (code; needs A3 price IDs)

**Files:** `apps/web` — a `/subscribe` route/page + a "Manage subscription" link.

- [ ] **C1 `/subscribe`** — reads `?user_id=<clerk id>`, requires Clerk sign-in (so anonymous users sign in first), creates a Stripe Checkout Session server-side with **`client_reference_id`** AND **`subscription_data.metadata.user_id` = clerk id** (the attribution contract `server/src/stripe.ts` depends on), monthly/annual toggle. Success/cancel return URLs deep-link back to `racelab://`.
- [ ] **C2 Customer Portal** — a "Manage / cancel" button that creates a Billing Portal session for the signed-in customer and redirects. (Cancellation needs zero app code — webhook + read API handle it.)
- [ ] **C3 Verify** — `apps/web` config test stays green; manual: web sign-in → checkout (Stripe test card) → row written → portal cancel → row flips.

## Part D — Ship
- [ ] **D1** Rebuild the AAB (`eas build -p android --profile production`) — the paywall code must be in the binary.
- [ ] **D2** Smoke-test the full purchase loop on a device build.
- [ ] **D3** Upload to **Internal testing** first; verify billing end-to-end; only then promote to Production.

---

## Feasibility for "tomorrow" (honest)
Tight, and **billing fully live + verified on the public Play track tomorrow is unlikely to be safe**, because: A3 (Stripe live verification) and D (AAB rebuild + Play review) have external latency outside our control; Part B is a real app-identity change (anonymous→account + 8 gates + upsell) that can't be tested until A1/A4 exist; and it must meet the same safety bar as the advice engine (never lock out a payer, never charge-without-unlock).

**Recommended rollout:** Build Parts B–C now, deploy A1–A5, and ship to the **Internal/Closed testing track tomorrow** (not Production) so the purchase loop is verified on real Stripe+Clerk before any public user can pay. Promote to Production once green. The advisor-free design means there is no rush to gate — the app is fully valuable while billing finishes hardening.

## Google Play policy (accepted risk — keep visible)
Selling subscriptions for in-app features via web-only checkout and gating app features can violate Play's Payments policy (rejection/removal). Mitigation in our favor: the advisor is free and the app is fully usable without paying. If review pushes back, the compliant fallback is Google Play Billing for the in-app upgrade (contradicts the web-only/no-cut decision — William's call).
