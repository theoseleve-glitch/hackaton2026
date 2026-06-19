# RaceLab — Google Play Data Safety form answers (IAP rail)

How to fill Play Console → **App content → Data safety** for RaceLab as it actually behaves on the **in-app-purchase (RevenueCat/Play Billing)** rail. This supersedes the old "no data collected" answer (that was only true on the now-dormant fully-offline build). **This is a legal declaration — confirm each line against your shipped config and, if in doubt, have it reviewed.**

Key Play definition: data is **"collected"** only when it is **transmitted off the device**. Everything RaceLab stores on-device (cars, runs, setups, profile, preferences) is **NOT** "collected" — declare it as such.

## Top-level
- **Does your app collect or share any of the required user data types?** → **Yes** (purchase data via Google Play/RevenueCat; plus optional location/IDs only when the user uses Speedhive import or auto-weather).
- **Is all collected data encrypted in transit?** → **Yes** (HTTPS).
- **Do you provide a way for users to request data deletion?** → **Yes** (uninstall removes local data; manage/cancel in Play; a contact email for purchase-data requests). Provide the email + privacy-policy URL `https://racelabrc.app/privacy`.

## Data types to DECLARE as collected/shared

| Play data type | Collected | Shared | Purpose | Required/Optional | Notes |
|---|---|---|---|---|---|
| **Financial info → Purchase history** | Yes | Yes | App functionality (subscription management) | Required (for premium) | Processed by **Google Play** (payment) + **RevenueCat** (entitlements). No card data reaches us. |
| **Device or other IDs** | Yes | Yes | App functionality | Required | RevenueCat assigns an **anonymous app user id** and its SDK may process device/IP data. Also the **transponder id** you enter is sent to Speedhive/MyLaps (optional). |
| **Location → Approximate location** | Yes | Yes | App functionality (weather) | **Optional** | ONLY if you use **auto-weather**: a track's GPS coordinates are sent to the weather provider (Open-Meteo). Mark **"processed ephemerally"** (not stored). *If you ship without auto-weather, omit this row.* |

## Data types to declare NOT collected
Name · Email address · Phone · Address · Contacts · Messages · Photos/Videos · Audio · Calendar · **App activity** (no search/usage history leaves the device) · Web browsing · Health/Fitness · Installed apps. All of RaceLab's racing data (cars, runs, setups, lap times, profile) lives **on-device only** → not collected.

## Third parties (for the form's "shared with" / processors)
- **Google Play Billing** — payment processing.
- **RevenueCat** — subscription/entitlement management ([privacy](https://www.revenuecat.com/privacy)).
- **MyLaps / Speedhive** — only if the user imports sessions (transponder id).
- **Open-Meteo** — only if the user uses auto-weather (GPS coordinates).
- **No advertising / analytics SDKs.**

## Judgment calls to confirm before submitting
1. **Location row:** keep it only if auto-weather ships in this build. It's optional + ephemeral.
2. **"Device or other IDs":** RevenueCat's anonymous app user id + SDK telemetry — the conservative (safe) declaration is to include it. Confirm against RevenueCat's current data practices.
3. If you later add **accounts/email** (you removed Clerk for IAP), you must add **Personal info → Email** and re-file.

Privacy policy backing these answers: `apps/web/privacy/` → `https://racelabrc.app/privacy`.
