# Bloop Monetisation — Ads-Only, Store-Compliant (FINAL)

**Domain:** meta-02 / monetization
**Date:** 2026-06-13
**Status:** DECIDED. This is the finished spec, not a survey. Build against it.
**Owner:** Lead game designer (monetisation)
**Grounds in:**
- Platform invariants (CF Durable Objects, Hono front-door, KV config, R2 packs, pure-TS GameModule, **anonymous-forever**, ads-only).
- Brand Book v1.0 (`docs/da/brand/bloop-brand-book-v1.pdf`): NO ads during gameplay; interstitial BETWEEN games, skippable after 5s; rewarded-video unlocks spicy packs; £1.99 night pass; AdMob + UMP consent; WCAG AA / 44pt / reduced-motion / spicy age-gated.
- `2026-06-10-server-shell-design.md` §4.3 (`gameOver` → `roundOver`, ad slot is a CLIENT concern, server only signals), §0.1 + §10 (`phaseKey`).
- `2026-06-10-cross-game-synthesis.md` §1.7 (placement-based session XP), R1/§5.4 (ad fires off `phaseKey` transition, NEVER an `Effect`).
- `2026-06-10-mobile-design-system.md` §4.5/§4.6 (`AdInterstitialScreen` / `interstitial.tsx`), §4.9 (`ConsentSheet`), `react-native-google-mobile-ads`.
- `2026-06-11-wave2-17-games-design.md` (18-game catalog, `tone: classic|spicy`, `minAge`, spicy siblings).

---

## Decisions (the short list)

1. **One ad surface only: the between-games interstitial.** It is a CLIENT-side gate that mounts on the `phaseKey` transition into a terminal/scoreboard key (`over`, `scoreboard:*`, `roundOver`). It is **never** a reducer `Effect`, never fires mid-gameplay, and the server never sees an ad identifier. (Confirms cross-game-synthesis R1/§5.4 and brand-book "no ads during gameplay".)
2. **Skippable after 5s.** AdMob interstitials are not natively skippable, so we wrap the AdMob format with our own `AdInterstitialScreen` chrome that exposes a **"Skip ▸" button enabled after a 5.0s countdown**, plus an always-present **"Close ✕"** that returns to the game. We close the underlying ad object on skip. We never gate gameplay on the ad: state has already advanced server-side (`status='roundOver'`).
3. **Frequency cap = "1 ad per ≥ 2 completed games AND ≥ 4 minutes, hard ceiling 1 per 90s, max 8/session/device."** First-session grace: **no interstitial before the 2nd game-over of a device's very first session ever.** All numbers are remote-config (KV `/config` → `ads.*`), tunable without a deploy.
4. **Counters are per-device, on-device, anonymous.** Cap state (last-ad timestamp, games-since-ad, session ad count, first-session flag) lives in `expo-secure-store`/`AsyncStorage` on the device — never on the server, never tied to identity. Rooms are TTL-wiped; ad pacing must not depend on server room state.
5. **AdMob via `react-native-google-mobile-ads`, gated behind the UMP consent flow.** UMP (Google's GDPR/IAB-TCF CMP) runs once at first launch BEFORE any ad request and before tracking. ATT prompt (iOS) is sequenced after UMP. **No PII, no custom user id, no ad-targeting signals are sent by us** — we request **non-personalised ads (NPA) by default** and only allow personalised ads if UMP returns consent. Consent re-entry lives in Settings → "Privacy & Ads".
6. **Rewarded-video unlocks ONE spicy pack for the current session, per device.** Watching a rewarded ad to completion sets a device-local, session-scoped unlock flag for a specific spicy `packId`. It does NOT bypass the **18+ age gate** (a self-attested DOB/age gate is a separate, hard prerequisite). Rewarded video is the only place a rewarded format exists.
7. **£1.99 "Night Pass" = a non-consumable, device-scoped store IAP that (a) removes ALL interstitials for the device, forever, and (b) unlocks ALL spicy packs without per-session rewarded gating (age gate still applies).** Purchased via Apple/Google IAP through `react-native-iap`/`expo-in-app-purchases`; **no account** — entitlement is restored via the store's native "Restore Purchases" (Apple ID / Google account, which we never read), persisted device-locally. It is a remove-ads + unlock pass, not a subscription.
8. **Fill-failure / no-fill / consent-declined / load-timeout all auto-advance to the next phase within ≤ 2.5s.** The interstitial is best-effort revenue, never a blocker. We preload the next interstitial during gameplay so the slot is usually warm; a cold/empty slot is invisible to players.
9. **Kids vs spicy: hard separation.** Default-surfaced catalog is classic/all-ages. Spicy packs are 18+ behind an age gate + (rewarded-unlock OR Night Pass). We **do not** target the "designed for families/children" store category; ad content rating is set to **`MaxAdContentRating.PG`** for classic-only sessions and is irrelevant once spicy is unlocked (still PG-rated ad inventory — ad rating ≠ game content rating). `tagForChildDirectedTreatment`/`tagForUnderAgeOfConsent` are **left unset/false** because Bloop is a general-audience (teen+) app, not a child-directed one; this is the correct, compliant posture for a party app with an 18+ spicy tier.
10. **Every touchpoint maps to the session loop** (§7). The only two ad-bearing moments are: between-games interstitial (passive) and the optional spicy-unlock rewarded video (active, user-initiated from the pack picker). Nothing else shows an ad.

---

## 1. Where money happens: the session loop and its two (only) ad touchpoints

The shipped session loop (server-shell §4.3, mobile §4.5–4.8):

```
Home → Create/Join room → Lobby → [pick game] → GAME (phases…) → gameOver/over
   → (server: status='roundOver')  → CLIENT interstitial decision  → Results/Scoreboard
   → "Play Again" / pick next game → Lobby/GAME …  (repeat, ~45-min session)
```

Ad-bearing moments — **exactly two**, both client-side:

| # | Touchpoint | Trigger | Format | User-initiated? | Frequency-capped? |
|---|---|---|---|---|---|
| A | **Between-games interstitial** | `phaseKey` enters terminal key (`over` / `scoreboard:*` / `roundOver`) AND cap allows | AdMob Interstitial, wrapped, skip-after-5s | No (passive) | Yes (§3) |
| B | **Spicy-pack rewarded unlock** | User taps "Watch to unlock 🌶" on a locked spicy pack in the game/category picker | AdMob Rewarded | Yes (active) | No cap, but age-gated (§5) |

There is **no** banner ad, **no** native ad in the lobby, **no** ad on Home, **no** rewarded-interstitial, **no** app-open ad. The brand rule "NO ads during gameplay" is enforced structurally: the only interstitial trigger is a *terminal* `phaseKey`, which by construction occurs after the round's last broadcast.

### 1.1 Why the trigger is `phaseKey`, not an `Effect` or a server signal

- Reducers are pure and must never describe ads (cross-game-synthesis R1 rejected an `adSlot` Effect; the only Effects are `analytics` and `gameOver`).
- The server's `gameOver` Effect sets `status='roundOver'` and broadcasts the terminal `view` with `deadlineAt: null` (server-shell §4.3). That is a **signal**, not an ad command.
- The client shell (mobile §4.5 step 3) already tracks `phaseKey` deltas to drive transition motion. The ad decision is **one branch on that same delta**: when `prevPhaseKey` is non-terminal and `nextPhaseKey` is terminal (`over`, `scoreboard:*`, or the shell sees `status==='roundOver'`), consult the cap, and if due, route to `interstitial.tsx` BEFORE mounting Results.
- This keeps ads 100% client-side and anonymity intact: the DO never knows whether, when, or which ad showed.

**Terminal-key contract (normative for game authors):** the terminal/ad-eligible `phaseKey`s a game may emit are the bare strings/prefixes `over`, `scoreboard:*`, `roundOver`. The shell's `isRoundBoundary(prev, next)` (mobile registry §4.5) returns true iff `next` matches `/^(over|scoreboard|roundOver)\b/` and `prev` does not. Games must not invent other terminal keys (e.g. `night-day` uses `over`; `last-standing` uses `over`; VOTE games end at `over`). A game with multiple ad-eligible boundaries per match (e.g. a multi-match game like `double-jeu`, 3 matches) emits `scoreboard:<matchIndex>` at each match boundary so the cap (§3) — not the game — decides whether an ad actually shows.

---

## 2. The interstitial: behaviour, UX, skippability

### 2.1 The wrapped interstitial (`AdInterstitialScreen` / `room/[code]/interstitial.tsx`)

AdMob interstitials are full-screen and **not natively skippable**; the SDK only fires `onAdDismissed` when the user closes via the ad's own controls (often after a vendor-imposed few seconds). To honour the brand rule "skippable after 5s" deterministically, we **do not** rely on the ad's native close. We present a thin Bloop chrome layer and control dismissal ourselves:

1. On the round boundary, if the cap allows AND an interstitial is **preloaded** (`interstitial.loaded === true`), navigate to `interstitial.tsx`.
2. Render the branded "intermission" (mobile §4.6: Bubblegum bg, floating `Mascot`, "Next round in a sec…", round-progress "Round 2 of 5"). Start a **5.0s countdown ring**.
3. Call `interstitial.show()`. The AdMob full-screen takes over.
4. We track our own 5s timer in parallel (started at `show()`). When it elapses, our overlay's **"Skip ▸"** affordance becomes enabled (before 5s it shows the countdown, disabled, 44pt target). The **"Close ✕"** is always present in the safe-area top-right for accessibility/emergency exit but visually de-emphasised before 5s.
5. On `onAdDismissed` (native close), on **Skip** tap (we call `interstitial.show` teardown / advance), or on **Close**, we: record the impression in the cap (§3), preload the NEXT interstitial, and navigate to Results.
6. **Auto-advance fallbacks** (§4): no-fill, load error, consent-declined, or a **2.5s load-timeout** → skip the ad entirely, go straight to Results. The player sees at most the branded intermission for a beat.

> Implementation note: because AdMob's own overlay sits above our RN view, the "Skip after 5s" we control is enforced on the *transition back* — i.e. we never re-show or re-request within the same boundary, and our 5s timer governs when the user's tap is honoured as a clean dismiss vs a "still loading, please wait" state. If a future AdMob policy forbids overlaying a skip control on a paid interstitial, the fallback (kept in `ads.skipMode` config) is `nativeDismiss` — rely on the SDK's own close affordance and treat 5s as a *minimum dwell on our intermission screen before show()*, so the perceived "5s then skippable" still holds. Default `ads.skipMode = "overlay"`.

### 2.2 Hard rules for the interstitial

- **Never during gameplay.** Trigger is a terminal `phaseKey` only. A CI/lint check greps the mobile shell to assert `interstitial.show()` is reachable only from the round-boundary branch.
- **Never blocks correctness.** Server state advanced before the client decided to show an ad; the screen is a pure client gate (mobile §4.6).
- **Reduced-motion:** the countdown ring degrades to a numeric "Skip in 5… 4…"; mascot float suppressed (mobile §6 / brand A11y).
- **44pt touch targets** for Skip/Close; AA contrast on all chrome.
- **One ad per boundary, max.** Never stack two interstitials.
- **Night Pass owners and the first-session grace bypass step 1 entirely** — they never even mount `interstitial.tsx`; they cut straight to Results.

---

## 3. Frequency capping (concrete numbers, all remote-config)

Counters are **device-local** (`AsyncStorage` namespace `bloop.ads.v1`), reset semantics defined below. The server is never consulted for pacing (rooms are ephemeral/anonymous).

```jsonc
// KV: client-config → ads  (served by GET /config, cached 60s; mobile reads at launch)
"ads": {
  "interstitial": {
    "minGamesBetween": 2,        // ≥ 2 completed games since last interstitial
    "minSecondsBetween": 240,    // AND ≥ 4 minutes since last interstitial
    "hardFloorSeconds": 90,      // absolute floor: never < 90s apart even if games are very short
    "maxPerSession": 8,          // safety ceiling per app session per device
    "firstSessionGraceGames": 2, // suppress until the 2nd game-over of the device's FIRST session ever
    "loadTimeoutMs": 2500,       // no-fill/slow → auto-advance
    "skipAfterMs": 5000,         // brand rule: skippable after 5s
    "skipMode": "overlay"        // "overlay" | "nativeDismiss" (fallback)
  }
}
```

**The cap decision (client, at each round boundary):**

```
showInterstitial =
     nightPass == false
  && firstSessionGraceSatisfied            // (firstSessionEver ? gameOversThisSession >= 2 : true)
  && gamesSinceLastAd   >= minGamesBetween
  && secondsSinceLastAd >= minSecondsBetween
  && secondsSinceLastAd >= hardFloorSeconds
  && adsThisSession      <  maxPerSession
  && consentResolved                       // UMP flow has completed (consent OR NPA)
  && interstitial.loaded                   // a preloaded ad exists (else auto-advance)
```

**Counter lifecycle:**
- `gamesSinceLastAd` increments on every game-over (terminal `phaseKey`); resets to 0 when an interstitial is shown (or skipped after showing — a shown-then-skipped ad still counts as an impression for pacing).
- `secondsSinceLastAd` derived from a stored `lastAdAt` epoch ms.
- `adsThisSession` increments per shown interstitial; resets when the app cold-starts (a new "session").
- `firstSessionEver` is a one-time device flag set to true on first launch, flipped to false at the end of the first session. While true, `firstSessionGraceGames` suppresses the first N game-overs — a new user finishes ~2 games ad-free before the first interstitial.

**Worked example (default config):** a group plays five ~30s VOTE rounds back-to-back inside one "game", then plays a second game. The interstitial can first fire at the **2nd game-over**, but only if ≥ 240s have also elapsed — so in practice a fast pair of games yields the first ad around the 4-minute mark, never more often than every 90s, and at most 8 per session. This matches the brand intent of a between-games "intermission", not an ad treadmill.

---

## 4. Fill-failure & resilience (best-effort revenue, never a blocker)

Preloading and graceful no-op are the whole game here.

- **Preload during gameplay.** When a game starts (and after each shown interstitial), call `interstitial.load()`. Party rounds last 30s–4min, so the slot is warm by the boundary almost always.
- **At the boundary, the decision tree:**
  - cap blocks → straight to Results, no screen flash.
  - cap allows but `!interstitial.loaded` → mount intermission, start `loadTimeoutMs` (2500ms) wait; if it loads in time, show; else auto-advance to Results and `load()` again for next time.
  - `show()` then `onAdFailedToShow` → advance to Results, count nothing, reload.
  - consent declined / NPA unavailable / SDK not initialised → **never request**, advance silently.
- **No-fill is not an error state.** No mascot-sad screen, no retry spinner that strands players. The intermission is at most a 1–2.5s branded beat.
- **Offline / airplane mode:** ad requests fail fast; the loop never waits on the network for ads (gameplay WS is separate). Auto-advance.
- **Session-long no-fill:** if 3 consecutive boundaries no-fill, back off `load()` attempts to once per 2 boundaries (avoid hammering AdMob), reset on first successful fill. Config: `ads.interstitial.backoffAfterNoFill = 3` (optional, defaulted in code).

---

## 5. AdMob integration + UMP consent flow (GDPR, anonymous, no PII)

### 5.1 SDK & init order (`react-native-google-mobile-ads`)

Init happens once in the RN root (`app/_layout.tsx`, mobile §3) and is strictly ordered so **no ad request precedes consent resolution**:

```
1. App launch → mount root.
2. Configure RequestConfiguration:
     maxAdContentRating: PG          // ad inventory rating; classic-default
     tagForChildDirectedTreatment: UNSPECIFIED (false)   // general-audience app
     tagForUnderAgeOfConsent: UNSPECIFIED (false)
     testDeviceIdentifiers: [...] in dev only
3. UMP consent gathering (AdsConsent):
     AdsConsent.requestInfoUpdate()  → may show the IAB-TCF consent form
     If form available & required → AdsConsent.showForm()
4. Resolve consent:
     canRequestAds = AdsConsent.getConsentInfo().canRequestAds
     personalised  = (consent status === OBTAINED for ad-personalisation purpose)
5. mobileAds().initialize()   // only AFTER UMP, per Google policy
6. iOS only: sequence ATT prompt (expo-tracking-transparency) AFTER UMP form,
     before any personalised request. If ATT denied → NPA forced.
7. Preload first interstitial with the chosen NPA flag.
```

- **Default to non-personalised ads (NPA).** We pass `requestNonPersonalizedAdsOnly: true` unless UMP returned explicit ad-personalisation consent. This is the safe, compliant default for an anonymous app and keeps us clean in GDPR/UK-GDPR regions.
- **`canRequestAds === false`** (user refused all, or in a region requiring consent that wasn't given) → **no ads at all** this session; loop runs ad-free. Revenue 0 is acceptable and correct; we never dark-pattern around UMP.

### 5.2 What we DO and DO NOT send (anonymity firewall)

- **We never set a publisher-provided user id, never set custom targeting keywords derived from the user, never pass nickname/avatar/room code to AdMob.** The only data AdMob's SDK collects is what Google's SDK collects by default under the user's UMP/ATT choices — which the user has consented to (or not, → NPA).
- **No PII crosses our boundary.** Identity is on-device only (mobile §5: nickname/avatar are device-local strings). The server (anonymous-forever) is never in the ad path.
- **Consent string** (IAB-TCF) is stored by the UMP SDK in device storage; we do not read or transmit it ourselves.
- **PostHog (client analytics)** is never given ad identifiers and is independent of the ad SDK; we log only coarse, non-PII funnel events (e.g. `interstitial_shown`, `interstitial_nofill`, `rewarded_completed`) with no user id.

### 5.3 Consent UX (`ConsentSheet`, mobile §4.9)

- First-launch: the UMP form appears as Google renders it (we don't reskin the regulated form). We may precede it with a one-line plain-language `BottomSheet` ("We show ads between games to keep Bloop free — your call on personalisation.") only if it doesn't violate UMP's "no pre-prompt that biases consent" rule; default **off** to stay clean (open item §10).
- **Re-entry:** Settings → "Privacy & Ads" → `AdsConsent.showPrivacyOptionsForm()` (UMP privacy options) + ATT status display + honest copy: "No accounts. Nothing about you is stored on our servers." (mobile §4.9, spec §11 honest framing).

---

## 6. Rewarded-video spicy unlock (Touchpoint B)

### 6.1 The path

Spicy packs (`tone: 'spicy'`, `minAge: 18` per wave2 catalog: `pires-potes` flagship, `truth-or-dare-lover-2026`, `truth-or-drink`, `tu-preferes-spicy`, `cinquante-cinquante-after-dark`, etc.) appear in the game/category picker as **locked tiles** with a 🌶 badge and a lock glyph. Tapping a locked spicy pack opens a `BottomSheet` with two unlock routes:

1. **"Watch a short video to unlock for this session"** → AdMob **Rewarded** ad. On `onUserEarnedReward`, set a **device-local, session-scoped** unlock for that specific `packId` (`bloop.spicy.session.<packId> = true`, cleared on cold start). The pack tile unlocks for the rest of the session.
2. **"Get the Night Pass — £1.99, unlock all spicy forever, no more ads"** → IAP (§7).

### 6.2 Hard gates (in strict order — all must pass)

1. **Age gate FIRST.** Before either unlock route is offered, the device must have passed the **18+ self-attested age gate** (a neutral DOB/age screen, brand A11y "spicy content age-gated"). The age-gate result is device-local, set once. **Rewarded video does NOT replace or bypass the age gate** — it only removes the paywall/grind, never the maturity gate. If age gate not passed → tapping a spicy tile opens the age gate, not the unlock sheet.
2. **Consent.** If `canRequestAds === false`, the rewarded route is unavailable (no ad to serve); only the Night Pass route shows. We never block spicy entirely on ad consent — the paid route is always available to a consenting-age adult.
3. **Unlock scope:** rewarded unlock is **per-pack, per-session**. It is deliberately not permanent — that's the Night Pass's job, which is the conversion lever.

### 6.3 Why rewarded (not interstitial) here

Rewarded is user-initiated, expected to be longer/non-skippable, and exchanges attention for a concrete unlock — the only place that contract is appropriate. It is **never** auto-triggered and never appears in the passive loop.

---

## 7. £1.99 Night Pass (store IAP, no account)

### 7.1 What it is and what it does

A **non-consumable in-app purchase**, **device-scoped**, priced at the storefront equivalent of **£1.99** (Apple/Google price tier; one-time, not a subscription). On purchase it grants a device-local entitlement `bloop.entitlement.nightPass = true` that:

- **Removes ALL interstitials** for the device, permanently (the cap decision short-circuits on `nightPass`; `interstitial.tsx` is never mounted).
- **Unlocks ALL spicy packs** without per-session rewarded gating. (The **18+ age gate still applies** — paying does not make a minor an adult; the age gate is a maturity attestation, not a paywall.)
- Optional cosmetic ("Night Owl" badge / Night Pop theme accent) — nice-to-have, not load-bearing; ship if cheap.

The name "Night Pass" reads as both "spicy after-dark content" and "lights-out the ads" — intentional double meaning matching the brand.

### 7.2 No-account purchase & restore (anonymity preserved)

- Purchased through native **StoreKit (iOS) / Play Billing (Android)** via `react-native-iap` (or `expo-in-app-purchases`). The store handles payment, receipt, and the user's Apple ID / Google account — **we never read or store that identity.**
- Entitlement is **derived from the local receipt**, cached in `expo-secure-store`. On reinstall / new device, the user taps **"Restore Purchases"** → the store returns the prior non-consumable → entitlement re-granted. No Bloop account, no server profile, fully consistent with anonymous-forever.
- **No server-side receipt validation tied to identity.** For a £1.99 cosmetic/remove-ads pass with no server entitlement to protect (everything is device-local and content is in R2 by KV catalog, not paywalled server-side), client-trusted local validation is acceptable for v1. (Open item §10: optional anonymous, stateless receipt-verification edge function that returns valid/invalid for a receipt **without** storing or correlating it — strengthens against trivial tampering while keeping zero PII. Recommended but not launch-blocking.)
- **Device-scoped, not transferable across platforms** (an iOS purchase doesn't unlock an Android device — standard for accountless IAP). Stated plainly in the purchase sheet to avoid store-review "misleading" flags.

### 7.3 Store compliance for the IAP

- It is a **digital-goods purchase consumed in-app → MUST use the platform IAP** (no external payment, no Stripe for this). `react-native-iap` is the correct rail.
- Price shown is the **localised store price**, never a hard-coded "£1.99" string in non-GB storefronts (display `product.localizedPrice`).
- **Restore Purchases** affordance is mandatory (Apple guideline) — present in Settings and on the purchase sheet.
- Clear, non-misleading description: "Removes between-game ads on this device + unlocks all spicy packs. One-time, no subscription. 18+ packs still require age confirmation."

---

## 8. Kids / age / spicy compliance posture

| Concern | Decision |
|---|---|
| **App store age rating** | Rate for the **18+ spicy tier present in the binary** (PEGI 18 / ESRB Mature / 17+ App Store) even though default surface is classic. Do **not** ship spicy in a separately-rated build for v1; one binary, content gated. |
| **Child-directed flags** | `tagForChildDirectedTreatment = false/unspecified`, `tagForUnderAgeOfConsent = false/unspecified`. Bloop is **general-audience (teen+), not child-directed** — this is the compliant posture and keeps full ad inventory. We do NOT enter the "Designed for Families" / "Kids" store programs. |
| **Ad content rating** | `maxAdContentRating = PG` always (ad inventory ≤ PG regardless of game tone — we never want a Mature *ad* even in a spicy session). |
| **Spicy content gate** | Self-attested 18+ age gate (device-local, once) is a hard prerequisite for ANY spicy pack, before rewarded-unlock or Night Pass. Classic default surface needs no gate. |
| **Spicy authoring guardrails** | Carried from wave2: "funny never cruel" lint, no identity/appearance/trauma targeting, per-pack `kill switch` in KV, long-press-to-report on cards (brand A11y). Monetisation never overrides moderation — a killed pack is unavailable even to Night Pass owners. |
| **COPPA/under-13** | Not targeted; no child-directed treatment; if a user fails the age gate they simply stay on classic content with the normal (consented) ad loop. We never knowingly collect data from children (we collect ~nothing anyway). |

---

## 9. Touchpoint → session-loop map (every moment accounted for)

| Loop moment | Ad/monetisation behaviour |
|---|---|
| **First launch** | Age gate (if user wants spicy later) deferred until first spicy tap; **UMP consent** runs before any ad; first-session grace armed (no interstitial before 2nd game-over). |
| **Home** | No ads. Night Pass upsell may appear as a subtle, dismissible card ("Go ad-free + unlock spicy — £1.99") — non-intrusive, brand-clean. |
| **Create/Join/Lobby** | No ads. Locked spicy tiles show 🌶+lock in the game picker. |
| **Game (any phase)** | **No ads, ever** (structural: only terminal `phaseKey` triggers). |
| **Game-over (`over`/`scoreboard:*`/`roundOver`)** | Client cap decision (§3). If due + loaded + consented + not Night-Pass + grace-satisfied → **interstitial** (skip-after-5s), else straight to Results. |
| **Results / Scoreboard** | XP/placement animates (placement-based session XP, cross-game-synthesis §1.7 — independent of ads). "Play Again" / next game. |
| **Picking a spicy pack** | Age gate → unlock sheet: **rewarded video** (session unlock) or **Night Pass** (forever). |
| **Settings** | "Privacy & Ads" → UMP privacy options + ATT status + honest copy. Night Pass purchase + **Restore Purchases**. |
| **Session end / cold start** | Session ad counters reset; per-session spicy rewarded-unlocks clear; Night Pass + age-gate persist; first-session flag flips false after first session. |

---

## 10. Open product calls (with my recommendation)

1. **Night Pass price & geo.** Spec says £1.99; storefronts auto-localise. **Recommend:** ship at the Apple/Google tier nearest £1.99/$2.49/€2.49, display `localizedPrice`, and A/B a £0.99 vs £1.99 tier post-launch via store pricing experiments. **Decision needed:** confirm the launch tier and whether to run the price test. *(My pick: launch £1.99, revisit after 4 weeks of conversion data.)*
2. **Server-side anonymous receipt verification for Night Pass.** v1 trusts the local receipt. **Recommend** adding a **stateless, PII-free** verification edge function (Hono route) that validates a receipt with Apple/Google and returns valid/invalid **without storing or correlating it** — modest anti-tamper, preserves anonymity. **Decision needed:** is the (small) eng cost worth it pre-launch, or defer to v1.1? *(My pick: defer to v1.1; £1.99 cosmetic/remove-ads is low-incentive to crack.)*
3. **UMP pre-prompt.** Whether to show a one-line plain-language sheet before Google's UMP form. **Recommend OFF** to stay unambiguously within UMP's "no biasing pre-prompt" guidance; the honest framing lives in Settings instead. **Decision needed:** product/legal sign-off on omitting it. *(My pick: omit.)*
4. **Age-gate strength.** Self-attested DOB is standard for app stores and proportional for soft-spicy party content, but jurisdictions vary on "robust age assurance" for explicit content. The spicy tier here is "embarrassing/absurd 18+", not explicit. **Recommend** self-attested DOB gate for v1; revisit only if a pack ever crosses into genuinely explicit territory. **Decision needed:** legal confirmation that self-attestation suffices for the launch spicy catalogue. *(My pick: self-attested is fine for the current content.)*
5. **First-session grace length.** Default 2 game-overs ad-free. **Recommend** keeping 2 (lets a new group feel the loop before the first ad) but instrument retention vs ad-revenue to tune. **Decision needed:** confirm 2, or push to 3 for softer onboarding. *(My pick: 2, remote-config so we can move it without a build.)*
6. **Rewarded unlock scope.** Currently per-pack, per-session. **Alternative:** per-pack, time-boxed (e.g. 24h) to reduce repeat-watching friction without giving away the Night Pass value. **Decision needed:** session-only vs 24h unlock. *(My pick: session-only at launch — preserves Night Pass conversion incentive; loosen to 24h only if data shows rage-quit at the re-watch.)*
7. **Night Pass scope: device vs "unlock everything incl. future spicy".** Decision says all spicy forever incl. future packs. **Confirm** product is comfortable that a one-time £1.99 covers all future spicy content (vs a future "season pass"). *(My pick: keep £1.99 = all current + future spicy; it's the simplest honest promise and future premium content can be a separate, clearly-new SKU.)*
