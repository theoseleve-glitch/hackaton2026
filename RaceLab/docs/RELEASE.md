# RaceLab — Play Store release (v1.0.0)

The app is release-ready (config below). The build + signing + upload need **your** accounts — steps are spelled out.

## App-side config (done)
- `apps/mobile/app.json`: name **RaceLab**, version **1.0.0**, `android.package` **app.racelab** (PERMANENT — reverse-DNS of racelab.app), `android.versionCode` **1**, scheme **racelab**, dark UI, R-plate icon + adaptive icon + carbon splash.
- `apps/mobile/eas.json`: `production` profile builds an **AAB** (app-bundle, what Play Store wants).
- `SPEEDHIVE_MOCK = false` (no fake sessions in production). Social features removed for v1.
- Engine advice **safety-audited + hardened** (0 adversarial violations, CI gate `npm run test:safety`). ⚠ Provisional KB bounds (rear-camber −1.5°, centre-diff floor) await William's ratification — safe regardless via runtime guards.

## Build the AAB (EAS Build — cloud, manages signing)
1. Free Expo account at expo.dev. Then:
   ```bash
   npm i -g eas-cli
   cd apps/mobile
   eas login
   ```
2. First build (EAS creates + stores the Android signing keystore for you):
   ```bash
   eas build -p android --profile production
   ```
   Produces a signed `.aab`. **Keep the EAS-managed keystore** — losing it means you can never update the app.
3. (Optional) verify locally first with an installable APK:
   ```bash
   eas build -p android --profile preview   # .apk you can sideload to a device
   ```

## Play Console (your account)
1. Google Play Console account ($25 one-time), create app "RaceLab".
2. Store listing — copy is ready: **`docs/store-listing-fr.md`** (FR). Provide an EN listing too if targeting non-FR markets.
3. **Assets still needed (TODO):** phone screenshots (≥2), 512×512 icon (have `assets/icon.png`), 1024×500 feature graphic, short + full description (in the listing doc).
4. Data safety form: the app stores everything **on-device**, no accounts, no analytics SDK — declare accordingly (no data collected/shared). Speedhive/weather are optional network reads.
5. Content rating questionnaire, target audience, privacy policy URL (needed even for on-device apps — a simple page stating "all data stays on your device").
6. Upload the `.aab` to a **Closed/Internal testing** track first, smoke-test, then promote to Production.
   - Or automate the upload: `eas submit -p android` (needs a Google service-account key).

## Pre-submit checklist
- [ ] `eas build -p android --profile production` succeeds → `.aab`
- [ ] Sideload the preview APK; smoke test: add a car → log a run → generate an engineer report → force-quit mid-edit → relaunch (data intact)
- [ ] Confirm the engineer's advice shows ⚠️ SAFETY notes on risky changes
- [ ] Screenshots + feature graphic + privacy policy URL ready
- [ ] Data-safety form = "no data collected"
- [ ] Upload to Internal testing, verify, promote to Production

## Known v1 limitations (shipping intentionally)
- Social (share/feed/follow/import) removed for v1 — code on disk, re-wire later.
- `SheetScreen` setup-sheet "options" editing is inert post-migration (sheets-side field has no schema home yet) — see migration notes.
- Only the **MP11** chassis has a tuned KB template; all other cars use the (now safety-remapped) `generic-offroad` template.
- Backend sync / accounts not shipped — fully offline, web subscription link only.
