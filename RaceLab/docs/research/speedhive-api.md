# MYLAPS Speedhive API — integration research (RaceLab)

Tested live on **2026-06-12** with real `curl` calls against public data.
Product goal: pilot links transponder/account once → on app launch we poll
Speedhive for new practice/race sessions → lap times prefill a new run log.

## TL;DR

- There is **no official public Speedhive developer API / portal / key program.** What
  exists are the **semi-public REST backends that the Speedhive web app itself calls**.
  They are reachable today with **no API key and no login** for any data that is public
  on the website (which is the default for RC practice + event results).
- Two backends matter for us:
  - **Practice API** — `https://practice-api.speedhive.com` — personal/club practice
    sessions, lookup **by transponder (chip) number**. This is the one RaceLab wants.
  - **Event Results API** — `https://eventresults-api.speedhive.com` — organized race
    events, sessions, classifications, lap data.
- The Practice API rejects requests with **`401 Bearer` unless an `Origin` header is
  sent** (`Origin: https://speedhive.mylaps.com` or `https://sporthive.com`). With that
  header, public reads return `200`. The Event Results API needs no special header.
- A logged-in OAuth2 token (Azure AD B2C, tenant `mylapsb2cprd`,
  client `d9109f5a-bce9-4ff7-8c8f-71bf4fb68c40`) is only needed for **private/account**
  data (following, friends, hidden sessions). RC practice data is public by default, so
  **for v1 we do not need OAuth.**

## How the web app is wired (discovered)

The SPA at `speedhive.mylaps.com` boots from `/assets/main-*.js` and fetches its runtime
config from **`GET https://speedhive.mylaps.com/api/clientSettings`** (no auth). Key fields:

```json
{
  "eventResultApiUrl": "https://eventresults-api.speedhive.com",
  "practiceApiUrl":    "https://practice-api.speedhive.com",
  "usersAndProductsApiUrl": "https://usersandproducts-api.speedhive.com",
  "liveTimingApiUrl":  "https://lt-api.speedhive.com",
  "searchApiUrl":      "https://search.speedhive.com",
  "tenantId": "mylapsb2cprd",
  "clientId": "d9109f5a-bce9-4ff7-8c8f-71bf4fb68c40",
  "accountPortalUrl": "https://account.mylaps.com"
}
```

The bundle sets `Authorization: Bearer <token>` only when a logged-in token exists; for
public reads it sends just `Origin` + `Accept: application/json`. Auth is OAuth2
Authorization-Code + PKCE against Azure AD B2C (`usersandproducts-api` / `account.mylaps.com`).

OpenAPI/Swagger for the Practice API is live and self-documenting:
**`https://practice-api.speedhive.com/swagger/docs/v1`** (Swagger 2.0). The Event Results
swagger path 404s now, but endpoint shapes are confirmed by the community Go client
`github.com/ysmilda/speedhive-go` (which mirrors `/swagger/docs/v1`) and by our live calls.

## Endpoint table

Auth column: **none** = works with just `Accept`; **+Origin** = also requires the
`Origin: https://speedhive.mylaps.com` header (else `401 Bearer`); **OAuth** = needs a
logged-in B2C bearer token.

### Practice API — `https://practice-api.speedhive.com` (the one we use)

| Endpoint | Method | Auth | Params | Returns |
|---|---|---|---|---|
| `/api/health` | GET | none | — | `{ redisConnected, version, ... }` |
| `/api/v1/sports` | GET | +Origin | — | list of sport codes |
| `/api/v1/locations` | GET | +Origin | `country`,`sport`,`sportCategory`,`status` | `{ locations: [...] }` — tracks |
| `/api/v1/locations/{id}` | GET | +Origin | — | single track w/ sectors |
| `/api/v1/locations/{id}/activities` | GET | +Origin | `year`,`sport`,`count`,`offset`,`order` | `{ location, activities[], activityCount }` |
| **`/api/v1/chips/{chipNumber}/training/activities`** | GET | +Origin | `locationId`,`year`,`sport`,`count`,`offset`,`order` | `{ activities[], activityCount }` — **lookup by transponder #** |
| `/api/v1/chips/code/{chipCode}/training/activities` | GET | +Origin | same | same (lookup by chip *code* string) |
| `/api/v1/accounts/{id}/training/activities` | GET | +Origin | `locationId`,`year`,`sport`,`count`,`offset`,`order` | `{ activities[], activityCount }` — lookup by MYLAPS account/userId |
| `/api/v1/accounts/{id}/training/activities/years` | GET | +Origin | — | list of years with data |
| `/api/v1/training/activities/{activityId}` | GET | +Origin | `chips`,`sessions`,`order` | activity detail |
| **`/api/v1/training/activities/{activityId}/sessions`** | GET | +Origin | `format`,`numlaps` | `{ bestLap, stats, sessions[], sections[] }` — **session detail + laps** |
| `/api/v1/training/activities/{activityId}/statistics` | GET | +Origin | — | aggregate stats |
| `/api/v1/training/activities/{activityId}/chips` | GET | +Origin | — | chips in the activity |

Notes:
- "Activity" = one practice block at a track on one day for one transponder (has a
  `startTime`/`endTime`). It contains one or more numbered "sessions"; each session has
  `bestLap`, `aveLapDuration`, `medianLapDuration`, and a `laps[]` array.
- `chipNumber` is the numeric transponder ID printed on the device (e.g. `4548663`).
  `chipCode` path variant takes the same value as a string.
- Unknown transponder → `200 { "activities": [], "activityCount": 0 }` (not 404). Good:
  linking is "soft" — we can store any number and just get an empty list until it has runs.

### Event Results API — `https://eventresults-api.speedhive.com` (organized races)

| Endpoint | Method | Auth | Params | Returns |
|---|---|---|---|---|
| `/api/v0.2.3/eventresults/events` | GET | none | `sport`,`sportCategory`,`startDate`,`endDate`,`country`,`count`,`offset` | `[ EventDto ]` |
| `/api/v0.2.3/eventresults/events/{id}` | GET | none | `sessions`,`guid` | single event |
| `/api/v0.2.3/eventresults/events/{id}/sessions` | GET | none | `guid` | `{ sessions[], groups[] }` |
| `/api/v0.2.3/eventresults/sessions/{id}` | GET | none | — | session |
| `/api/v0.2.3/eventresults/sessions/{id}/classification` | GET | none | — | results table + `bestLap` per driver |
| `/api/v0.2.3/eventresults/sessions/{id}/lapchart` | GET | none | — | lap chart |
| `/api/v0.2.3/eventresults/sessions/{id}/lapdata/{finishPos}/laps` | GET | none | `count`,`offset` | per-driver lap times |
| `/api/v0.2.3/eventresults/sessions/{id}/csv` | GET | none | — | CSV export |
| `/api/v0.2.3/eventresults/organizations/{id}/events` | GET | none | `sportCategory`,`count`,`offset` | events for a club |
| `/api/v0.2.3/accounts/{userId}/sessions` | GET | OAuth | `eventId`,`count`,`offset` | logged-in user's race sessions (404 without a real token) |

### Other backends (not needed for v1)
- `usersandproducts-api.speedhive.com` — OAuth2 only (account, transponder registration).
- `lt-api.speedhive.com` / `notifications.speedhive.com` — live timing (out of scope).
- `search.speedhive.com` — search (its exact path wasn't probed; not required).

## Required headers (what actually works today)

```
Accept: application/json
Origin: https://speedhive.mylaps.com      # MANDATORY for practice-api (else 401 Bearer)
```
No API key, no cookie, no User-Agent requirement. CORS `Vary: Origin` is present — note
this is a server-side allow-list trick, **not** browser CORS protection; native fetch from
React Native (no enforced CORS) sends the header and works fine.

## Sample responses (real, fetched 2026-06-12, truncated)

### Activities by transponder — `GET /api/v1/chips/4548663/training/activities?count=2&order=desc`
(RC track "AMCA Apeldoorn", sport `RC`)
```json
{
  "activities": [
    {
      "id": 7904009191,
      "name": "Practice",
      "startTime": "2026-06-11T10:20:15+02:00",
      "endTime":   "2026-06-11T11:35:42+02:00",
      "location": { "name": "AMCA Apeldoorn", "id": 49322608, "trackLength": 218,
                    "status": "ACTIVE", "sport": "RC", "country": "nl",
                    "sections": [ { "name": "Sector 1", "length": 80 }, ... ] },
      "accountId": 0,
      "userId": "MYLAPS-GA-bf5caec6dcc04653892c16f3ae0e5755",
      "chipLabel": "Mika",
      "chipCode": "4548663"
    }
  ],
  "activityCount": 7955
}
```

### Session detail + laps — `GET /api/v1/training/activities/7904009191/sessions`
```json
{
  "bestLap": { "sessionId": 3, "lapNr": 36, "duration": "18.630",
               "speed": { "kph": 42.12, "mps": 11.70 } },
  "stats": { "lapCount": 90, "fastestTime": "18.630", "averageTime": "25.133",
             "medianTime": "21.630", "activeTrainingTime": "37:42.001",
             "chip": { "code": "4548663", "codeNr": 4548663, "id": 45486630 } },
  "sections": [ { "name": "Sector 1", "length": 80 }, ... ],
  "sessions": [
    {
      "id": 1,
      "chipId": 45486630,
      "dateTimeStart": "2026-06-11T10:20:30.998+02:00",
      "bestLap": { "nr": 6, "duration": "23.330", "speed": { "kph": 33.6 } },
      "aveLapDuration": "23.895",
      "medianLapDuration": "23.928",
      "duration": "2:47.268",
      "laps": [
        { "nr": 1, "dateTimeStart": "2026-06-11T10:20:30.998+02:00",
          "duration": "24.248", "sessionDuration": "24.248", "status": "NONE",
          "sections": [ { "name": "Sector 1", "duration": "7.688" }, ... ],
          "dataAttributes": [ { "type": "VOLTAGE", "value": 8.2 },
                              { "type": "TEMPERATURE", "value": 30.0 } ] },
        { "nr": 2, "duration": "24.109", "diffPrevLap": "-0.139",
          "status": "FASTER", "sections": [ ... ] }
      ]
    }
  ]
}
```
Lap `duration` values are **seconds as a decimal string** (`"24.248"`); longer ones are
`"m:ss.mmm"` (`"2:47.268"`). Parse accordingly. `status` ∈ NONE/SLOWER/EQUAL/FASTER/
SESSIONBEST/REPORTBEST.

### Event Results lap data — `GET /api/v0.2.3/eventresults/sessions/12255955/lapdata/1/laps?count=5`
```json
{
  "lapDataInfo": { "participantInfo": { "name": "Rashid", "class": "JUNIOR",
                   "startNr": "12", "fieldFinishPos": 1 },
                   "lapCount": 8, "firstLapNr": 2, "sessionId": 12255955 },
  "laps": [
    { "lapNr": 2, "lapTime": "2:18.679", "diffWithBestLap": "59.043",
      "speed": 31.255, "sectionTimes": ["01:42.244","01:43.320","01:16.263"],
      "status": ["GREEN"] }
  ]
}
```
(Event-results lap times are formatted `"m:ss.mmm"` / `"ss.mmm"`, a slightly different
shape from practice — handle both if we ever ingest race results.)

## Auth model recommendation for RaceLab

**Recommendation: one-time "link by transponder number", no OAuth, no per-launch login.**

1. **Link once.** In onboarding/settings the pilot enters their **transponder number**
   (the number printed on the MYLAPS device, e.g. `4548663`). We store it locally
   (`linkAccount(identifier)`). No password, no MYLAPS login, no token to refresh — and
   nothing private leaves the device.
2. **Poll on app open.** On launch call
   `GET /api/v1/chips/{transponder}/training/activities?order=desc&count=20` and keep
   activities whose `startTime` is newer than our last-seen timestamp; for each, fetch
   `/training/activities/{id}/sessions` to pull `bestLap`/`ave`/`median`/`laps[]` and
   prefill a draft run log.
3. **Why not OAuth?** RC practice data is public by default and keyed by transponder,
   which is exactly our use case. The B2C OAuth flow (PKCE, Azure AD B2C tenant
   `mylapsb2cprd`) adds a login screen, token storage, refresh handling, and a redirect
   URI — all for data we can already read. Reserve OAuth for a future "private/hidden
   sessions" feature only.
4. **Edge case — transponder reassigned/second-hand.** The number is the identity, so a
   resold transponder would surface the new owner's runs. Acceptable for v1; if it bites,
   add an optional account-link (`/accounts/{userId}/...`) later. Store the transponder as
   editable in settings.

## Rate limits / ToS

No documented public API program, no published rate limits, and no rate-limit headers were
returned in testing (`X-RateLimit-*`, `Retry-After` all absent). These are the website's
own backends, so treat them as a courtesy: poll **only on app open** (and maybe a manual
"refresh"), not on a timer; request small pages (`count<=20`); cache the last-seen
timestamp so each launch makes ~2 small calls. MYLAPS's general terms forbid "intercepting
and decoding data streams" and placing "an unreasonable or disproportionate burden on the
infrastructure" — read-only, low-frequency, public-data polling with a normal `Origin` is
low-risk but is **not a contractually sanctioned API**. It can change or start requiring
auth without notice, so the client must degrade gracefully (our `SPEEDHIVE_MOCK` fallback
and try/catch return-null pattern handle this). For a commercial launch, email
`support.speedhive@mylaps.com` / `support@mylaps.com` to ask about official/partner access.

## Risks
- **Unofficial / undocumented.** Endpoints, the `v0.2.3` version segment, and the `Origin`
  gate can change. Mitigation: thin client, feature-flag (`SPEEDHIVE_MOCK`), graceful
  null-return on any non-200 (mirrors `weather.ts`).
- **`Origin` gate.** Practice API returns `401 Bearer` without the header — easy to miss;
  it is set as a constant in our client.
- **Identity = transponder number.** No verification that the pilot owns it (second-hand
  risk, above).
- **Time formats vary** between practice (`"24.248"` / `"2:47.268"`) and event-results
  (`"2:18.679"`); centralize parsing.

## Production endpoint we'd use
```
GET https://practice-api.speedhive.com/api/v1/chips/{transponder}/training/activities
    ?order=desc&count=20[&sport=RC]
Headers: Accept: application/json
         Origin: https://speedhive.mylaps.com
```
then per new activity:
```
GET https://practice-api.speedhive.com/api/v1/training/activities/{activityId}/sessions
```

## Sources
- https://practice-api.speedhive.com/swagger/docs/v1 (live Swagger 2.0)
- https://speedhive.mylaps.com/api/clientSettings (live SPA runtime config)
- https://github.com/ysmilda/speedhive-go (Go client mirroring both APIs)
- https://github.com/ncrosty58/speedhive-tools (Python client, token-based variant)
- https://www.mylaps.com/privacy-speedhive/ (data sharing / privacy)
- https://help.mylaps.com/s/product-speedhive
