# RaceLab — In-App Purchases setup (RevenueCat + Google Play)

**The code is done** (`src/iap.ts`, `entitlements.tsx`, `Paywall.tsx`, `Settings`, schema `source:"iap"`; anonymous, advisor free, local 15-day trial, offline-grace; tsc + tests green; adversarially reviewed, 0 defects). These steps make purchases **real**. Everything below needs accounts you own — no secret goes in the app (only the public SDK keys).

Products/IDs the code expects: entitlement **`pro`**, products **`racelab_pro_monthly`** (4,99 €/mo) + **`racelab_pro_annual`** (39,99 €/yr), an Offering whose `current` has a **monthly** + **annual** package.

---

## Part 1 — Google Play Console
1. [ ] The **app** exists in Play Console (`app.racelab`) — same app you'd ship anyway.
2. [ ] **Create 2 subscriptions** (Monetize → Products → Subscriptions → Create):
   - Product ID `racelab_pro_monthly` → base plan **monthly**, price **4,99 €** (Play auto-converts currencies).
   - Product ID `racelab_pro_annual` → base plan **yearly**, price **39,99 €**.
   - **No Play free-trial / intro offer** — the app runs its own 15-day local trial (adding a Play trial = double trial). *(If you'd rather Google manage the trial, add an intro offer and tell me — I'll drop the local trial.)*
   - **Activate** both.
3. [ ] **License testers** (so you buy without real charges): Setup → License testing → add tester Google accounts (their purchases are test/refundable).
4. [ ] **Internal testing track**: create one, add the testers, share the opt-in link. *(Products only resolve for an app version that's on a track — you must upload a build at least once.)*
5. [ ] **Service account for RevenueCat** (so RC can read Play): Setup → API access → create/link a Google Cloud service account → grant **"View financial data"** + **"Manage orders and subscriptions"** → download the **JSON key**.

## Part 2 — RevenueCat dashboard
6. [ ] Create a RevenueCat account → **Project** "RaceLab".
7. [ ] Add **App → Google Play**: package `app.racelab`, upload the **service-account JSON** from step 5.
8. [ ] **API keys** (Project Settings → API keys): copy the **Android public SDK key** (`goog_…`) and a **test key** (`test_…` / `rcb_…`) for Expo Go Preview Mode.
9. [ ] **Products**: import `racelab_pro_monthly` + `racelab_pro_annual` from Play.
10. [ ] **Entitlement**: create **`pro`**; attach both products to it.
11. [ ] **Offering**: create the **`current`** (default) Offering with two **Packages** — Monthly → `racelab_pro_monthly`, Annual → `racelab_pro_annual`. *(The app reads `offerings.current.monthly` / `.annual`, with a PACKAGE_TYPE fallback.)*

## Part 3 — Keys into the app (the only code edit)
12. [ ] Edit `apps/mobile/src/config.ts`:
   ```ts
   export const RC_GOOGLE_API_KEY  = "goog_xxx";   // Android public SDK key (step 8)
   export const RC_EXPO_GO_TEST_KEY = "test_xxx";  // or rcb_xxx (Expo Go preview)
   export const RC_ENTITLEMENT_ID  = "pro";        // leave as-is unless you renamed it
   ```
   These are **public** keys — safe in the client bundle. The service-account JSON and any RevenueCat **secret** key stay in RevenueCat, never in the app.

## Part 4 — Build & test (Expo Go can't do real purchases)
13. [ ] Ensure `apps/mobile/eas.json` has a dev-client profile (add if missing):
   ```json
   { "build": { "development": { "developmentClient": true, "distribution": "internal" } } }
   ```
14. [ ] `eas build -p android --profile development` → install the build on a device/emulator **signed into a license-tester Google account**. *(Native module required — Expo Go only runs the mocked Preview Mode.)*
15. [ ] Upload a build to the **Internal testing** track once so Play recognizes the products.
16. [ ] **Verify the loop**: hit a premium feature → trial starts → after trial → paywall → "S'abonner — 9,99 €/mois" → Google test-purchase sheet → complete → `pro` active → premium unlocks. Then **cancel** in Play → confirm it lapses at period end. **Reinstall** → paywall → "Restaurer mes achats" → unlocks.

## Part 5 — Listing & compliance
17. [ ] **Data safety form** changes: you now collect **Purchase history** and share it with **RevenueCat** (a processor) — declare it. *(This supersedes the old "no data collected" line — IAP + RevenueCat means a third party processes purchase data.)*
18. [ ] IAP is the **compliant** billing path — no web-only-billing rejection risk. Keep the in-app "Manage subscription in Google Play" link (already wired in Settings) + your terms/privacy URLs.

---

### Pre-ship checklist (copy/paste)
- [ ] Play: 2 subs active (`racelab_pro_monthly` 9,99 € · `racelab_pro_annual` 99,99 €)
- [ ] Play: license testers + Internal track live; one build uploaded
- [ ] Play: service-account JSON linked to RevenueCat
- [ ] RC: Android app + `goog_` key · entitlement `pro` · Offering `current` with monthly+annual packages
- [ ] `config.ts`: `RC_GOOGLE_API_KEY` + `RC_EXPO_GO_TEST_KEY` set
- [ ] EAS dev build on a license-tester device
- [ ] Verified: buy → unlock · cancel → lapse · reinstall → restore
- [ ] Data-safety form updated (purchase history via RevenueCat)

*Until steps 1–12 are done, the app ships fine in **trial-only** mode: advisor free, 15-day trial, the paywall shows the buy buttons but `getOfferings` is empty so a tap is inert (no charge). Nothing breaks; purchases simply light up once the dashboard is configured + a real build is installed.*
