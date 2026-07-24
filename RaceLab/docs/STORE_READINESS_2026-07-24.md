# RaceLab — Design & App-Store Publish Readiness (2026-07-24)

> Part 4 of the state-of-the-art mission: "make sure everything's fine once we publish it on the app
> store." Two gates: **Gate A** = the free Android side-load for the Phase-3 field test (minimal),
> **Gate B** = a real public store submission (full). Facts below are current as of July 2026 and
> cited. Companion to `STATE_OF_THE_ART_2026-07-24.md` + `LAUNCH_PLAN_2026-07-24.md`.

---

## 1. Design assessment — the foundation is good; the gap is store *assets*, not visual design

The app already has a coherent design system, and it is **not** the launch blocker:

- **Design tokens** (`apps/mobile/src/theme.ts`): a complete dark pit-lane palette (bg `#0E0F12`,
  card `#1A1C21`, racing-orange accent `#FF5A26`, semantic good/warn/gold), a 4-pt spacing scale, a
  radius scale, and one elevation token. Used consistently across all 21 components — this is a real
  design system, not ad-hoc styling.
- **Icons/splash** are store-grade: 1024² `icon.png`, a full Android adaptive set
  (foreground/background/monochrome), splash icon, favicon. No regeneration needed.
- **Onboarding** is a clean 2-step flow with a clear pitch and level-based personalization.

**What design work actually remains for the store (all real, none blocking today):**

| Design task | Why | Owner |
|---|---|---|
| **App Store / Play screenshots** (6.7"/6.5" iPhone, 12.9" iPad, Android phone/tablet) with a narrative: "pick your car → describe the problem → get one grounded change → apply it" | Store listings sell on the screenshot story, not the icon | W (design) |
| **Feature graphic** (Play, 1024×500) + a 30-sec preview video (optional but high-converting) | Play listing above-the-fold | W |
| **Onboarding polish**: remove the anti-steering "Cheaper on the web" card (illegal outside US, moot under free-v1); add a "100% offline · grounded or silent" trust badge on step 1 | Trust before the ask; the moat must be *visible* (D53 hid it — reverse for the pitch) | W |
| **Empty/refusal states**: the honest "I don't have a verified rule for that yet" needs a designed state, not raw text — it's a *feature* (honesty), so it should look intentional | Refusals are frequent by design; they must read as integrity, not breakage | W + T |
| **A per-advice trust chip** ("grounded in HUDY p.26", tap to reveal) | Invisible integrity converts nobody; this is the visible differentiator vs the incumbent's "may hallucinate" LLM | W (content) + T (surface) |

**Verdict: design is the least of the problems.** The publish blockers are *config* and *compliance*.

---

## 2. Gate A — the free field-test build (Phase 3)  ·  what it takes: ~half a day

For putting a build on ~5 phones at one club, **no store account and no money is required**:

- **Android:** an EAS "preview" APK via a **free** Expo account, side-loaded, or Expo Go for a dev
  build. No Google Play, no $25 fee. This is the D24 Android-first path.
- **iOS:** a free Apple ID gives a 7-day dev-signed build via a Mac — usable but painful; for a
  field test, Android side-load is the pragmatic route.
- **Blocking config even for a dev build:** the app calls camera/location/photo APIs with **no
  purpose strings**, so on iOS the permission request crashes and on Android the request is denied.
  These must be added regardless (see §4). Under free-v1 the fabricated-data and anti-steering issues
  are deleted in Phase 0, so Gate A is clean once §4's config lands.

---

## 3. Gate B — real public store submission  ·  the full checklist (Phase 4, only if field-proven)

### 3.1 Ship blockers (the app CANNOT be submitted until these are fixed)

| # | Blocker | Evidence | Fix |
|---|---|---|---|
| B1 | **No store binary can be produced** — no `eas.json`, no `ios.bundleIdentifier`, no `android.package` | `app.json` read in full | §4 config + William chooses the bundle id (permanent — see below) |
| B2 | **No permission purpose strings** for camera/location/photo → guaranteed iOS rejection + runtime crash | `expo-camera`/`expo-location`/`expo-image-picker` used in 3 components; `app.json` has no `infoPlist` | §4 `infoPlist` block |
| B3 | **No privacy manifest** (`PrivacyInfo.xcprivacy`) — the app uses AsyncStorage (a UserDefaults-backed *required-reason API*), and this is **enforced without exception in 2026** | RN AsyncStorage; Apple requirement since 2024-05-01 | Add the manifest (Expo config plugin or `app.json` `ios.privacyManifests`) |
| B4 | **No privacy policy URL + no App Privacy / Play Data-safety disclosure** | none in repo | Publish a policy page; fill App Store Connect App Privacy + Play Console Data-safety |
| B5 | **Anti-steering copy is a 3.1.1 rejection outside the US** — "Cheaper on the web / skips app-store fees" | `OnboardingScreen.tsx:73-79`, `SettingsScreen.tsx:122-125` | Delete (Phase 0). *Nuance:* this copy is **permitted on the US storefront** post-Epic (May 2025, no entitlement needed), but a **rejection on every other storefront** without the External-Link-Account entitlement |
| B6 | **Fabricated data shown as real** (Speedhive 1970 laps, Social invented drivers + Follow) — misleading-content rejection + trust death | `speedhive.ts:16`, `socialnet.ts:18` | Delete (Phase 0) |
| B7 | **If accounts ever ship: in-app account deletion is mandatory** (Apple, since 2022-06-30) | — | Free-v1 has no accounts → not a v1 blocker, but a hard gate the moment `packages/account` is wired |

### 3.2 The monetization-shape decision (the one that changes everything)

The "external-web subscribe, no IAP ever" design is **not store-legal outside the US**:
- **US storefront:** external purchase links are now allowed (post-Epic, May 2025). External-web
  subscribe *could* work — but Apple's link-out still carries a commission (the "no fees" pitch is
  false), and you cannot offer IAP alongside it on the same storefront.
- **EU + everywhere else:** external links require the External-Link-Account entitlement; the app as
  written gets rejected. The compliant path there is **native IAP (StoreKit) via RevenueCat**.
- **Recommendation:** for Gate B, ship **native IAP (StoreKit + RevenueCat)** at the re-priced
  **€39–49/yr / €19.99 lifetime** — it's the only universally-compliant shape, and RevenueCat's data
  puts the 15-day trial in the optimal 17–32-day conversion band. Keep the marketing-site web
  checkout as an *additional* channel, not the in-app one.

### 3.3 Store accounts + money (William's reserved calls — do NOT spend before Phase-4 gate)

- Apple Developer Program: **$99/yr**. Google Play Console: **$25 one-time**.
- Age rating (likely 4+/Everyone), export-compliance (no non-exempt crypto), review notes explaining
  the offline deterministic engine.
- TestFlight (iOS) / Play internal testing before public — cheap dress rehearsal.

---

## 4. Ready-to-apply config spec (`app.json` additions + `eas.json`)

> **Reserved for William:** the bundle identifier is *permanent once published* and brand-adjacent
> (GripLab vs RaceLab is still unsigned-off, D19). The values below use `app.griplab` as a
> placeholder — **William confirms the final id + brand before this is committed.** Everything else
> is safe, additive config.

**`app.json` — add under `expo`:**
```jsonc
{
  "ios": {
    "supportsTablet": true,
    "bundleIdentifier": "app.griplab.mobile",   // ← William: permanent, brand decision
    "infoPlist": {
      "NSCameraUsageDescription": "RaceLab scans a shared-setup QR code to import a setup sheet.",
      "NSLocationWhenInUseUsageDescription": "RaceLab tags a track with its location so your setups are grouped by where you race.",
      "NSPhotoLibraryUsageDescription": "RaceLab attaches a photo to your driver profile or a setup."
    },
    "privacyManifests": {
      "NSPrivacyAccessedAPITypes": [
        { "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryUserDefaults",
          "NSPrivacyAccessedAPITypeReasons": ["CA92.1"] }   // app's own storage
      ]
    }
  },
  "android": {
    "package": "app.griplab.mobile",             // ← William: permanent, brand decision
    // (adaptiveIcon block already present)
    "permissions": ["CAMERA", "ACCESS_FINE_LOCATION", "READ_MEDIA_IMAGES"]
  }
}
```

**`eas.json` (new file) — build profiles:**
```jsonc
{
  "cli": { "version": ">= 12.0.0" },
  "build": {
    "preview":    { "distribution": "internal", "android": { "buildType": "apk" } }, // Gate A field test
    "production": { "autoIncrement": true }                                          // Gate B
  },
  "submit": { "production": {} }
}
```

**Not yet decided (needs William):** final bundle id + brand name; whether the marketing-site domain
is `griplab.app` (currently the CTA target — and per the audit, that domain is presently serving a
*different company's* site, so it must be secured or changed before any link points at it).

---

## 5. One-line readiness verdict

**Design: ready. Config: ~1 day of additive work + one William brand decision. Compliance: fully
solved by the Phase-0 honesty purge + free-v1 shape. The store is not the hard part — the field
proof in Phase 3 is.**

---

Sources (store rules, current July 2026): Apple external-purchase-link / anti-steering (US-only,
post-Epic May 2025) — [Superwall](https://superwall.com/blog/apple-allows-external-payment-links-in-the-app-store-everything-you-need-to),
[iClarified](https://www.iclarified.com/97192/apple-updates-app-store-rules-to-allow-external-purchase-links-in-us);
in-app account deletion mandatory since 2022-06-30 —
[TermsFeed](https://www.termsfeed.com/blog/apple-requirement-in-app-deletion-accounts/);
privacy manifest enforced in 2026 —
[Apple Developer](https://developer.apple.com/documentation/bundleresources/adding-a-privacy-manifest-to-your-app-or-third-party-sdk).
