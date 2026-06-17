# RaceLab CONTRACTS — frozen package surfaces

> **How to read this file.** Every package below is a contract: the exported
> names, result shapes and invariants documented here are what the rest of the
> codebase (and Théo's frontend) may rely on. Changes to a frozen surface are
> ADDITIVE ONLY; anything else needs a logged decision (D-row) first.
>
> House rules that hold across every package:
> - **D18**: nothing on the advice path does I/O. Advisor + strategy math are
>   deterministic, on-device, zero network/LLM/key.
> - **Injected capabilities**: no `Date.now()`, `Math.random()` or global
>   `fetch` inside domain logic — clocks/entropy/fetch/storage are parameters.
> - **Discriminated results**: `{ok:true,...} | {ok:false,reason}` — packages
>   never throw across their boundary.
> - **Never-wipe**: corrupt persisted data is quarantined and reported, never
>   deleted or silently dropped.
> - **Offline-first**: every Tier-B enrichment (weather, Speedhive, server) can
>   be fully down without breaking any app flow.
>
> Imports are source-level relative paths (`../../packages/<name>/src`) until
> npm workspaces land. Status of each package: `packages/README.md`.
> Generated from the B2–B10 build session (2026-06-12); assembled by
> `scripts/assemble-contracts.mjs`.


---

## packages/schema (racelab-schema) — the unified domain contract (keystone)

**What it is:** the single source of truth for every domain shape: ids, vocab, cars, tracks, weather, runs, outcomes, account, strategy, outbox. Pure data + pure functions — zero I/O, zero runtime deps, zero node built-ins; bundles into React Native unchanged. The backend-tier packages import FROM schema (`engine`, `storage`, `weather`, `speedhive`, `account`, `kb`); schema imports from nothing. ⚠ **Not yet the app's data layer:** `apps/mobile` still runs on the app-tier packages (`garage`/`logbook`/`tracks`/`sheets`/`sessions`/`social`) over AsyncStorage and imports ZERO of schema/storage — migrating it onto schema/storage via `bridge.ts` is a pending task (see `docs/BACKEND_STATUS.md`). 203+ tests (`npm test` + `npm run typecheck` in `packages/schema`).

**Import:** `../../packages/schema/src/index` (everything re-exported from `index.ts`).

**Exports by module (one line each):**
- `ids.ts` — branded id types (`CarId`, `TrackId`, `RunId`, …); `makeId(prefix, now_ms, rand?)` → `prefix-<ts36>-<rand8>`; `isoToMs` (throws on garbage — storage guards it); rand is injectable (no `Math.random` inside).
- `vocab.ts` — Théo's logbook vocabulary absorbed VERBATIM (future B0 merge is renames-free): `Grip` (`green|medium|high|blue_groove`), `Bumpiness`, `TrackEvolution`, `Sky` (`sunny|cloudy|rain_risk|raining`), `TyreWear`, `RunType` (`practice|qualifier|main`), `Outcome` (`better|same|worse`), `Traffic`, `Surface`, `PowerType` (`nitro|brushless`).
- `cars.ts` — `Car`, `ChassisRegistryEntry`, `makeCar(input, now, registry)` (unknown `chassis_id` → `{ok:false,reason:"unknown_chassis"}`; reserved `CUSTOM_CHASSIS_ID = "custom"` escape hatch); `classLabels(car, registry)` → `{category, scale, type}` (NEVER stored on the car); `sheetSections(power_type)` → `COMMON_SECTIONS` + `NITRO_SECTIONS` (`engine|clutch|fuel_system|exhaust`) or `BRUSHLESS_SECTIONS` (`esc|motor|gearing|battery`); class facets FAIL CLOSED.
- `tracks.ts` — `Track`, `TrackTurn` (turn-by-turn array), `TrackRecord`, `Gps`, public/private flag; `makeTrack(input)` (validated, frozen) / `addTrackRecord(track, record)` (never mutates history — returns a new track) / `bestRecord(track, class)`; `snapshotTrack(track)` → frozen `TrackSnapshot` (turns INCLUDED so per-turn feedback survives relayouts).
- `weather.ts` — `WeatherObservation` (`air_temp_c`, `track_temp_c?`, `humidity_pct`, `pressure_hpa` = the nitro Patm, `wind_kmh`, `precipitation_*`, `sky`, `source: auto|manual|backfill`); timestamps REQUIRE an explicit UTC offset; `makeWeatherObservation` (NaN-guarded), `deriveSky` (+ exported thresholds), `resolveConditions(auto, manual)` (manual wins per-field; provenance records `auto_filled` AND `overridden`), `weatherAtTime(observations, atIso)` (at-or-before).
- `runs.ts` — `RunEntry`: the ultimate run log. Discriminated `RunTiming` `{kind:"summary", result}` | `{kind:"laps", laps, import?, result?: NonTimingResult}` (laps + summary coexistence is structurally impossible); frozen `TrackSnapshot` + conditions per run; `TyreSet`; `FuelLog`/`fuelStats`; `DriverState` (`feeling_1to10`, `fatigue_1to5`, `confidence_1to5`, clamped); per-turn feedback validated against the snapshot's turns; `makeRun` routes weather through `makeWeatherObservation`; `toLapSeries`/`effectiveTiming`/`lapStats`/`positionDeltas`; `ImportedLaps`/`SpeedhiveImportMeta`. **Also the outcome/learning surface** (there is NO separate `outcomes.ts`): `OutcomeRecord` + `makeOutcomeRecord` (`car_name` required; **trial-time** `setup_version_id` attribution); `learningTuples(runs, outcomes)`; `toEngineHistory` (rows shaped for engine `ContextBundle.history` — but prefer engine `historyFromTuples`, which keeps citations/track_id); `conditionsToTags` (hot ≥30°C air / ≥40°C track, cold ≤10°C air); `surfaceToTags(surface)` (D52 — maps a surface to its family tags + `wet`, never grip-level tags; complements `conditionsToTags`, which owns grip/bumps/temp).
- `account.ts` — `AccountState`, `startTrial` (ONCE ever), `checkEntitlement`, `effectiveSubscriptionStatus`, `FEATURES` (**advisor permanently free**), `FREE_FEATURES`, `GRACE_DAYS = 7`.
- `strategy.ts` — `planRace(input)` → `StintPlan`/`PitStop[]` (tank capacity, consumption L/lap, pit time loss → stint strategy); `detectTyreCliff(laps)` (lap-time drop detection). Deterministic, on-device (D29 — D18 extended to strategy).
- `outbox.ts` — `OutboxEntry`, `appendOutbox` (generic over payload; cycle-safe deep pre-scan rejects unserializable payloads; monotonic `seq`), `entriesAfter`, `pruneOutbox` (high-water mark survives pruning), `OUTBOX_DOMAINS`.
- `parse.ts` — load-path validators: `parseRunEntry`, `parseTrack`, `parseCar`, `parseOutcomeRecord`, `parseAccountState`, `parseWeatherObservation`, `parseOutboxState` — EVERY read from storage goes through these (quarantine, never wipe).
- `bridge.ts` — lifts for both legacy models: `liftSessionsRun`/`liftSessionsOutcome` (William's `packages/sessions`) and `liftTheoRunEntry` (Théo's `packages/logbook`, 4-point divergence mapping documented inline). Makes the B0 unification merge mechanical.

**Stability promise:** schema is FROZEN for this build phase — all evolution is additive and goes through a logged decision. Known queued unfreeze items: add `weather`/`reports` to `OUTBOX_DOMAINS`; fix `cars.ts` facet comment examples to the canonical kb vocabulary (`category="offroad"`, `scale="1/8"`, `type="buggy"`); reword the `ContextHistoryEntry` comment to "is assignable to" the engine row type.

---

## packages/storage (racelab-storage) — B2 storage core

**What it is:** D11 storage layer — local store is the ONLY source of truth; every mutation journals into the schema outbox in the same logical transaction; cloud backup is NOT sync. Zero runtime deps, zero node built-ins in src/ (bundles into RN); every I/O capability (storage drivers, clocks via per-call `now`, entropy via `rand`) is injected. Never throws across the package boundary; corrupt data is quarantined, never deleted.

**Import (frontend / other packages):** `import { ... } from "../../packages/storage/src"` (or `racelab-storage` once workspaces land). `expo-sqlite.ts` is device-only glue — app imports it; node tests never do.

**Exports (one line each):**
- `KeyValueDriver` — injected AsyncStorage-shaped driver `{getItem/setItem/removeItem/getAllKeys}` (per-key atomic assumed)
- `SqlExecutor` / `SqlStatement` / `SqlValue` — injected SQL driver `{execute(sql, params) -> {rows}}` with optional all-or-nothing `batch(statements)`
- `DocStore` — `{put/get/getAll/remove}(collection, id, doc)`; reads return parsed JSON or `{ok:false, reason, raw?}` for unreadable bytes
- `AppendLog` — `{append(OutboxEntry)/readFrom(after_seq)/prune(upto_seq)/lastSeq()}`; high-water mark survives pruning (seq never reused)
- `StorageAdapter` — `{docs, log, commit(ops, entry?)}`; `commit` is THE transactional write path (doc ops + outbox entry, atomic where the driver supports it)
- `memoryStorage()` / `MemoryStorage` — in-memory adapter (tests/reference; JSON round-trip identical to device); `pokeDoc/pokeLog` test hooks
- `memoryKeyValueDriver(initial?)` — in-memory AsyncStorage-shaped driver
- `openSqliteStorage(executor)` — adapter over SqlExecutor; tables `docs(collection,id,json)` / `log(seq,json)` / `meta(key,value)`; exported `SQL` constants are the exact parameterized statements
- `openKvStorage(kv, namespace?)` — adapter over KeyValueDriver; write-then-swap undo log; rolls back interrupted writes on open (returns `warnings`)
- `expoSqliteExecutor(db)` / `ExpoSqliteDatabase` — DEVICE-ONLY structural glue from expo-sqlite (SDK 56) to SqlExecutor; no expo dep in package.json
- `openRepos(storage, {rand?})` → `{ok, repos: Repos, warnings}` — rebuilds outbox state from the journal (corrupt entries quarantined, `next_seq` preserved)
- `Repos` — `cars/tracks/runs/outcomes: EntityRepo<Car|Track|RunEntry|OutcomeRecord>`, `weather_logs: KeyedDocRepo<WeatherObservation>`, `reports: EntityRepo<ReportDoc>`, `profile/account: SingletonRepo`, `outbox: OutboxView {state/entriesAfter/prune}`, `quarantine: {getAll}`
- Repo semantics: `put(value, now)` / `remove(id, now)` — parse-guarded on write, journaled `{domain, op, payload}` via schema `appendOutbox` in the same `commit`; `get/getAll` — ALL reads through schema parse.ts (+ local `parseReport`/`parseDriverProfile`); corrupt docs stashed to `quarantine` collection + discriminated result, originals untouched
- `COLLECTIONS`, `MutResult`, `GetOneResult<T>`, `GetAllResult<T>`, `ReportDoc`
- `migrateLegacyBlobs(kv)` → `{ok, lifted: {cars, tracks, runs, outcomes}, report}` — reads `racelab:sheets:*` / `racelab:sessions*`, lifts via schema bridge; writes/deletes NOTHING; deterministic (seeded ids → same blobs lift byte-identical)
- `applyMigration(repos, lifted, now)` — writes through repos (and therefore the outbox); idempotent (existing ids skipped, nothing journaled twice)
- `seededRand(seed)`, `LEGACY_SHEETS_PREFIX`, `LEGACY_SESSIONS_PREFIX`, report/result types

**Stability promise:** interfaces.ts driver shapes, the Repos surface, the outbox journaling contract (every mutation = one OutboxEntry, schema semantics), and the never-wipe/quarantine behavior are stable. The SQL table layout and kv key layout (`<ns>:docs:<collection>`, `<ns>:log`, `<ns>:undo`) are stable for data already written (any change ships with a migration). The weather/reports "sessions"-domain envelope payload is explicitly provisional until schema unfreezes OUTBOX_DOMAINS.

---

## packages/weather — Open-Meteo adapter (B3, Tier B enrichment, no API key)

Source-level import: `packages/weather/src/index` (relative path, like every package). Bundles into React Native: zero node built-ins, zero runtime deps; fetch / key-value storage / clock are ALL injected via parameters. **The advisor/engine must never import this package (D18) — it enriches session logging only, and every result is discriminated so the app works fully with every endpoint down.**

**Service (what the app calls):**
- `autoFillSession(deps, gps, sessionStartIso)` → `{ok:true, observations, rejected_rows, at_start?, from:"network"|"cache", stale, cache_corrupt?}` | `{ok:false, reason}` — live forecast auto-fill, cache-first, stale-if-offline; `at_start` = observation governing the session start. `cache_corrupt?:true` (additive) when an unreadable cache slot was seen but the read was rescued.
- `backfillSession(deps, gps, dateIso)` → same shape minus `at_start` — archive reconstruction for sessions logged offline (source `"backfill"`); a not-yet-published OR partially-published day (any null hour) returns `empty_row` rejections for its missing hours and is NOT cached — only a COMPLETE gap-free day is cached for the archive TTL (it refetches until whole, never pinning lost hours).
- `pickConditions(observations, atIso)` → `WeatherObservation | undefined` — schema `weatherAtTime` (at-or-before), resolves later runs without another network call.
- `applyManualOverride(auto, manual)` → schema `resolveConditions` verbatim: manual wins per-field, blanks auto-fill, `provenance.{auto_filled,overridden}` tracked.
- `WeatherDeps = { fetchFn, driver, now_ms, forecast_ttl_ms?, archive_ttl_ms? }`; `forecastWindow(now_ms, start_ms)` exported for inspection.

**Client (lower level, used by service):**
- `buildForecastUrl(gps, opts?)` / `buildArchiveUrl(gps, range)` — exact-string-tested URLs; archive hourly list has NO `precipitation_probability` (forecast-only variable).
- `fetchForecast(fetchFn, gps, opts?)` / `fetchArchive(fetchFn, gps, range)` / `fetchOpenMeteo(fetchFn, url)` → `{ok:true,data}` | `{ok:false, reason:"network_error"|"bad_status"|"bad_payload"}` — offline is a normal result, nothing throws.
- `validateOpenMeteoPayload(unknown)` — structural payload guard (also run on every cache read); `payloadHasData(data)` — at-least-one-value detector; `payloadDayComplete(data)` — gap-free-day detector (the archive-cache gate).
- Types: `FetchLike`, `FetchResponseLike`, `OpenMeteoResponse`, `OpenMeteoHourly`, `ForecastOpts`, `IsoDateRange`, `FetchFailure`.

**Map:**
- `mapForecastResponse(resp)` (source `"auto"`) / `mapArchiveResponse(resp)` (source `"backfill"`) / `mapOpenMeteoHourly(resp, source)` → `{observations, rejected}` — every row built through schema `makeWeatherObservation`; failures REPORTED (`invalid_timestamp` | `non_finite_numeric` | `empty_row`), never silently dropped.
- `skyFromWmoCode(code)` / `deriveSkyForRow(code, row)` — documented rule: WMO precip codes (51–67, 71–77, 80–86, 95–99) → `raining`; fog 45/48 → `cloudy`; else schema `deriveSky` thresholds (mm > 0 raining, ≥30% rain_risk, ≥60% cloudy/sunny); codes 0–3 only as last-resort fallback.
- `offsetSuffix(utcOffsetSeconds)` — appends the explicit offset (`Z` / `±hh:mm`) schema requires; all requests use `timezone=UTC`.
- `surface_pressure` → `pressure_hpa` is STATION-LEVEL hPa at the track's elevation = the Patm nitro racers tune needles against (deliberately not sea-level `pressure_msl`).

**Cache:**
- `KeyValueDriver = { getItem(k): Promise<string|null>, setItem(k,v): Promise<void> }` — AsyncStorage-shaped, injected.
- Keys: `weather:fc:{lat2dp},{lon2dp}:{YYYY-MM-DDTHH}` + `weather:fc:{cell}:latest` pointer; `weather:ar:{cell}:{start}..{end}`. 2-decimal gps cell ≈ 1.1 km.
- `fetchWithCache(deps, entryKey, latestKey, doFetch)` — fresh-hit → no network; expired + network failure → payload served with `stale:true` (stale-if-offline); corrupt entries reported via `cache_corrupt`, never deleted; cache write failure never fails a fetch; optional `should_cache` gate.
- `DEFAULT_FORECAST_TTL_MS` (30 min) / `DEFAULT_ARCHIVE_TTL_MS` (30 days); `forecastCacheKey` / `forecastLatestKey` / `archiveCacheKey` / `hourBucketUtc` / `roundCoord`.

**Stability promise:** URL strings, cache key scheme, failure discriminants (`network_error`/`bad_status`/`bad_payload`/`invalid_input`), the WMO→Sky table and the result shapes above are frozen; evolution is additive only. Observations are never persisted by this package — only validated raw API payloads are cached; `WeatherObservation`s are rebuilt through schema `makeWeatherObservation` on every read.

---

## racelab-speedhive (`packages/speedhive`) — B9 Speedhive adapter (UNOFFICIAL MYLAPS API)

**Tier-B enrichment only (D18): nothing on the advice path may import this package; the app must be fully functional with every Speedhive endpoint down.** All I/O is injected (fetch, token store, sleep, `imported_at`) — zero globals, zero node built-ins, zero runtime deps; bundles into React Native.

**Import from:** `packages/speedhive/src/index.ts` (relative path, e.g. `../../packages/speedhive/src` from the app). Other packages should consume only the schema-typed outputs of `import.ts`; SH* wire types must never leak past an adapter call site.

**Isolation layout (the point of B9):** path drift → `client.ts` `ENDPOINTS` only; payload drift → `types.ts` (+ `import.ts` mapping) only. Nothing outside `packages/speedhive` ever changes.

## Exports
- `HttpSpeedhiveClient(fetchFn, tokenStore, baseUrls?) → SpeedhiveApi` — factory, injected fetch + caller-owned `TokenStore` (client only ever READS the token; an auth failure never clears it). The bearer is scoped to the practice host ONLY — it never travels to the public event-results host (cross-host leak guard, test-locked).
- `SpeedhiveApi` — `getEvent`, `getEventSessions`, `getSessionClassification`, `getSessionLapchart` (VERIFIED live 2026-06-12 — the real public per-lap POSITION source), `getPracticeSessions({count?,offset?})`, `getPracticeSessionLaps(id)`; every method returns `Promise<SpeedhiveResult<T>>`, never throws.
- `SpeedhiveApi.unverified.getCompetitorLaps(session_id, startNumber)` — QUARANTINED: per-lap TIMES path is a best guess that 404'd live; call sites must spell `unverified.` so the risk is visible in code. Needs one real app intercept; fix is a one-line `ENDPOINTS` edit.
- `SpeedhiveResult<T>` / `SpeedhiveFailure` — `{ok:true,data}` | `{ok:false,reason:'network_error'|'bad_status'(+status)|'bad_payload'|'auth_required'}`; 401 AND 403 → `auth_required` (MYLAPS answers 403, probed live), exactly one fetch, never retried; practice calls with no token → `auth_required` with ZERO network calls.
- `TokenStore` — `{get():string|null; set(token); clear()}`; persistence (SecureStore) lives with the app.
- `FetchLike` / `HttpResponseLike` / `HttpRequestInit` — minimal structural fetch slice (RN/global fetch is assignable).
- `DEFAULT_BASE_URLS` / `SpeedhiveBaseUrls` — `event_results` (verified live 2026-06-12) + `practice`; partial override via factory arg.
- `ENDPOINTS` — the single URL source, each builder annotated VERIFIED/UNVERIFIED.
- `politePoll(fn, {min_interval_ms, max_attempts, sleep, shouldStop?})` + `POLL_MIN_INTERVAL_FLOOR_MS` (30 000) — interval hard-floored at 30 s, `auth_required` aborts immediately, injected sleep, outcome `{ok:true,data,attempts}` | `{ok:false,reason:'auth_required'|'stopped'|'max_attempts'(+last)|'bad_options'}`.
- `fromEventLaps(laps, meta) → MapLapsResult` — SHLap[] → schema `ImportedLaps`; sequential lap numbers guaranteed (wire numbers kept when already strictly increasing, else renumbered with `renumbered:true` reported); positions carried; one bad lap rejects the whole import with `lap_index` (never-wipe).
- `fromPracticeSession(detail, meta, session_index=0) → MapLapsResult` — one sub-session = one run; ms durations → seconds; defaults `speedhive_session_id`←detail.id, `track_name`←location.name, `transponder_id`←chip.code (caller meta wins).
- `findTransponderResults(classification, transponder_id)` — normalized match (case/punctuation-insensitive) → `{ok:true,row,row_index}` | `{ok:false,reason:'no_rows'|'not_found'}`.
- `competitorLapchartPositions(lapchart, start_number) → LapchartPosition[]` — one car's `{lap, position}` series out of a verified `/lapchart` payload (column 0 = start grid); tolerant startNumber matching; retired cars yield only the columns they ran.
- `buildRunTiming(imported)` — `ImportedLaps` → schema `RunTimingInput {kind:'laps'}` via schema `toLapSeries` (same guards as `makeRun`). **Manual fallback is NOT this package:** it is the schema's `{kind:'summary', result}` branch built directly by the app.
- `parseClockTime(s)` / `lapSeconds(shLap)` / `normalizeTransponder(s)` — exposed parsing helpers.
- `ImportMetaInput` — `{imported_at: IsoDateTime (REQUIRED, injected — no clock in this package), speedhive_session_id?, event_name?, session_name?, track_name?, driver_name?, transponder_id?}`.
- Wire types (read-only at call sites): `SHEvent, SHEventSessions, SHSession(Group), SHClassification(Row), SHLap, SHCompetitorLaps, SHLapchart(Cell/StartPosition), SHPracticeSession(List), SHPracticeSubSession, SHPracticeLap, SHPracticeStats, SHBestLap, ...`.

## Stability promise
STABLE: the `SpeedhiveApi` method set, the discriminated failure reasons, `politePoll` semantics (30 s floor, auth-abort), `TokenStore`, and the mapping outputs (`ImportedLaps`/`RunTimingInput` — frozen schema shapes). UNSTABLE BY DESIGN: `ENDPOINTS` paths and `SH*` field lists track the unofficial API and may change without notice — that churn is contained inside this package.

---

## packages/account — Tier A client account logic (`racelab-account`)

Import via relative path: `../../packages/account/src` (from apps/mobile: add to metro watchFolders like the other packages). Bundles into RN: zero runtime deps, zero node built-ins; storage/fetch/clock/tokens are ALL injected.

**What the frontend may import (everything in `src/index.ts`):**
- `TrialService` — class over `TrialDeps {store, fetchFn, now, tokens?, apiBase?}`; `ensureTrialState()` starts the one 15-day trial at first premium touch (offline ok), records/reconciles with the server (server FIRST-SEEN start wins) → `{ok, account, status, started, sync}`.
- `TRIAL_DAYS` — 15 (William's decision).
- `guardedNow(deps)` / `noteServerTime(store, iso)` — tamper-guarded clock: effective now = max(device clock, persisted local+server floors); rollback never extends entitlements.
- `canUse(feature, {store, now})` — schema `checkEntitlement` over the guarded clock; FREE features (advisor) return before ANY I/O (airplane-mode invariant is structural); cached subscription valid offline through expiry + `GRACE_DAYS`(7); premium fails closed on store error. Never throws.
- `touchPremiumFeature(feature, trialDeps)` — canUse + auto-start trial on first `requires_subscription`.
- `SUBSCRIBE_WEB_BASE` (placeholder) / `buildSubscribeUrl(base, user_id?)` — external web checkout URL; app opens it with `Linking.openURL` (NO IAP, ever).
- `validateSubscription({fetchFn, store, now, apiBase?}, token)` — GET /api/subscription/status → `{ok, status: none|active|expired, expires_at?, account}` cached with `validated_at` (stamped only on paid statuses — preserves trial_expired vs subscription_expired copy).
- `deleteAccount(deletionDeps, localWipe)` — DELETE /api/account → localWipe → `{ok, server: deleted|queued|anonymous}`; server-down still wipes locally and queues a tombstone (written AFTER the wipe). `retryPendingDeletion(deps)` drains it.
- `TokenProvider` interface + `ANONYMOUS_TOKENS` — the Clerk boundary; `@clerk/clerk-expo` mapping documented in `src/auth.ts`, no clerk dep here.
- `STORAGE_KEYS`, `loadAccount`/`saveAccount` (parse-validated, corrupt blobs stashed never wiped), `KV`/`FetchLike`/`Clock` types; re-exports `GRACE_DAYS`/`FEATURES`/`FREE_FEATURES`/`Feature`/`EntitlementResult`/`AccountState` from schema.

**Stability promise:** the exported names, result-union shapes (`{ok:true,...}|{ok:false,reason}`), `STORAGE_KEYS` values, and the offline policy (advisor free forever, trial fully offline, GRACE_DAYS offline grace) are frozen. `SUBSCRIBE_WEB_BASE`/`DEFAULT_API_BASE` values WILL change at domain sign-off (names won't).

## server — Tier B Vercel functions (`racelab-server`, NOT bundled into the app)

Enrichment only: every client flow works with this whole tier down. No committed runtime deps; db driver + Clerk JWKS verification are injected (deploy wiring + checklist in `src/deploy.ts`). Nothing deploys yet (no accounts).

**Endpoints (all bearer-authed, all responses carry `server_time`):**
- `GET /api/subscription/status` → `{status: none|active|expired, expires_at?, server_time}` (grace is client-side).
- `POST /api/trial/start` body `{trial_started_at?}` → idempotent first-seen registry; future claims clamped to server now; returns the stored start.
- `POST /api/backup/push` body `{entries:[{entry_id|id, ts, domain, op, payload}]}` → idempotent on (user_id, entry_id); duplicates return `{ok, inserted, skipped}`; malformed entry rejects the whole batch (`{error, index, field}`); max 500.
- `GET /api/backup/restore?after_seq=&limit=` → `{entries, next_after_seq, has_more}` over the SERVER-assigned seq cursor; strictly per-user.
- `DELETE /api/account` → atomic wipe (users+subscriptions+backup_entries) + deletions tombstone (first requested_at wins); idempotent 200.

**BACKEND.md module endpoints (B0+, code-ready/not-deployed — full status matrix in `docs/BACKEND_STATUS.md`):**
- `POST /api/webhooks/stripe` (auth-free, Stripe signature + raw body) → idempotent on `event.id`, out-of-order watermark, writes `stripe_subscriptions` (the post-Stripe subscription truth both `/subscription/status` and `/entitlement` read).
- `GET /api/entitlement` → signed EdDSA offline token `{status:trial|active|expired|none, plan?, current_period_end?, trial_ends_at?, token, server_time}`; public key pinned in app; **gates Pro only, never the advisor**.
- `POST /api/media/upload-url` body `{mime, bytes}` → `{media_id, upload_url, expires_at}`; mime allowlist + atomic per-user quota + declared-bytes ceiling + user_id charset guard.
- `GET|PUT /api/backup/blob?domain=` → whole-domain `{format,state}` envelope (verbatim, D11); PUT optimistic-concurrency → 409 `server_newer`; owner-scoped.
- `POST /api/share/publish` → `{token, share_url, artifacts}` (immutable snapshot, payload scrubbed) · `GET /api/share/get?token=` (**auth-free**, no owner PII) · `POST /api/share/import?token=` (fork + `forked_from` lineage).
- `GET /api/content/rcdata` · `GET /api/content/kb` (auth-free) → signed manifest `{name, version, content_hash, url, signature}`; monotonic version.
- `POST|GET /api/me/export` → async GDPR archive job (owner-scoped; assembly worker deferred).
- `POST|DELETE /api/push/token` body `{device_id, token, prefs?}` → device-scoped, marketing-consent gated, idempotent.

**Internal contract:** handlers are pure `(ctx, HttpRequest) → HttpResponse` where `ctx` is `AppCtx` (src/appCtx.ts = ServerCtx + per-module seams); the router (src/handler.ts) adapts AppCtx down to each handler's minimal ctx. Every external capability (DB query, Stripe verify, EdDSA sign, blob presign, render) is an injected seam, built in `src/deploy.ts` with **graceful per-seam degradation**; `makeSql*` impls mirror `db/schema.sql`. **Stability promise:** routes, response field names, idempotency/owner-scoping semantics, and `db/schema.sql` columns are frozen; deploy wiring may evolve.

**Error envelope (frozen):** every non-2xx is `{ error: "<snake_case>", server_time, ...context? }` — never a stack/detail leak. Canonical reason → status:

| reason | status | when |
|---|---|---|
| `unauthorized` | 401 | missing/invalid bearer (auth'd routes) |
| `not_found` | 404 | unknown path, or resource missing for the caller |
| `method_not_allowed` | 405 | known path, wrong method (carries `allow[]` + `Allow` header) |
| `bad_request` | 400 | malformed/invalid body or query (canonical; finer field reasons below) |
| `payload_too_large` | 413 | body/blob/entry over the documented byte cap (+ `index` for batches) |
| `unsupported_media_type` | 415 | media mime not in the allowlist |
| `quota_exceeded` | 409 | per-user media quota would be exceeded |
| `server_newer` | 409 | backup-blob optimistic-concurrency conflict (+ `current_updated_at`) |
| `invalid_event` / `invalid_signature` / `raw_body_required` | 400 / 400 / 500 | Stripe webhook: bad event shape / bad signature / body-parser misconfig |
| `internal_error` | 500 | a handler threw (logged server-side with a correlation id) |
| `server_misconfigured` | 500 | deploy context failed to build (Tier-B down → app treats as offline) |

Field-specific 400 reasons (narrower than `bad_request`, kept stable): `invalid_trial_started_at`, `invalid_after_seq`, `invalid_limit`, `invalid_entry` (+ `index`,`field`), `batch_too_large`.

---

## packages/kb — class/registry data layer + validation gate (B10)

Static JSON consumed by schema functions and the engine bundle, plus `racelab-kb`: a zero-dep, RN-safe validation package (`npm test` / `npm run typecheck` in `packages/kb` — malformed KB data is a build error, not a warning).

**What other packages may import:**
- `kb/chassis/registry.json` — array of **237** flat `ChassisRegistryEntry`-shaped objects (D47 — the full competitive scene; 1 `full`/MP11, the rest `pending_pdf`) with fields `chassis_id`, `template_id`, `brand`, `model`, `category`, `scale`, `type`, `default_power_type` plus kb extras: `power_types: PowerType[]`, `template_status: "full" | "pending_pdf"`, `template_file?` (full entries only; forward-looking metadata resolved relative to `kb/chassis/`, the registry's own directory — the engine joins templates by `template_id`, never by this field), `category_template?` (non-`full` entries: the `CATEGORY_TEMPLATES` id whose setup page backs this model — D49 model-aware resolution), `provenance: string`. Pass it verbatim as the `registry` argument of schema `makeCar` / `classLabels`. Consumed by `packages/engine/src/node-kb.ts` (optional `KBData.registry`) and shipped in `kb/bundle.json` by `npm run bundle`.
- `kb/classes/1-8-tt-buggy.json` — class declaration `{ class_id, label, category: "offroad", scale: "1/8", type: "buggy", power_types: ["nitro","brushless"], sections: { common, nitro, brushless }, notes }`; section id arrays are byte-identical (order included) to schema `COMMON_SECTIONS` / `NITRO_SECTIONS` / `BRUSHLESS_SECTIONS` (test-enforced). Consumed by node-kb.ts (optional `KBData.classes`, keyed by `class_id`) and bundled.
- `packages/kb/src/index.ts` — pure validators + vocabulary (zero I/O, zero node built-ins, zero runtime deps): `parseChassisRegistry(unknown)` / `parseClassDecl(unknown)` → `{ ok: true, value } | { ok: false, reason }` (stable reasons `not_an_array` / `not_an_object` / `duplicate:[i].chassis_id` / `invalid:<path>`; never throw; unknown extra keys tolerated; output deep-frozen), constants `FACET_CATEGORIES = ["offroad","onroad"]`, `FACET_SCALES = ["1/8","1/10","1/12","1/5"]`, `FACET_TYPES = ["buggy","truggy","short_course","stadium_truck","monster_truck","gt","touring","pan","f1","crawler","rally"]`, `CATEGORY_TEMPLATES` (the 16 category-template ids a `pending_pdf` entry's `category_template` must name — `1_8_offroad_nitro`, `1_8_offroad_electric`, `1_8_truggy`, `1_8_gt`, `1_10_offroad_2wd`, `1_10_offroad_4wd`, `stadium_truck`, `short_course`, `1_10_touring_electric`, `1_10_nitro_onroad`, `1_12_pan`, `f1`, `large_scale_1_5`, `monster_truck`, `crawler`, `rally`), `TEMPLATE_STATUSES`, types `KbChassisRegistryEntry`, `KbClassDecl`, `TemplateStatus`, `KbParseResult`.
- `kb/classes/README.md` — facet vocabulary, join-key semantics, pending_pdf pipeline, grounding rule (humans only).

**Canonical facet vocabulary:** `category ∈ {offroad, onroad}`, `scale ∈ {1/8, 1/10, 1/12, 1/5}`, `type ∈ {buggy, truggy, short_course, stadium_truck, monster_truck, gt, touring, pan, f1, crawler, rally}` — the VALUES are owned by kb (`FACET_*` constants; schema owns only the SHAPE) and are test-pinned end-to-end against schema `classLabels`/`sectionApplies`. The facet values shown in schema cars.ts comments and its test fixture ("buggy"/"offroad-competition") are placeholders, not vocabulary. A chassis template's own `category` field (e.g. `"1-8-nitro-buggy"`) is a different fact: the `chassis/<cat>/` extraction-directory name.

**Stability promise:** entry shape is frozen to schema `ChassisRegistryEntry` plus the kb extras above (enforced by `parseChassisRegistry` and the test gate); `chassis_id` / `template_id` values never change once published — new chassis are appended, `template_status` flips `pending_pdf` → `full` (adding `template_file`) without renaming ids. Identity facts only in pending entries — never kit values (grounding rule; every entry carries a non-empty `provenance`).

---

## packages/engine (racelab-engine)

**What the frontend / other packages may import:** everything from `packages/engine/src/index.ts` (the app already imports it via relative path `../../packages/engine/src`). Pure data + pure functions, zero I/O, zero runtime deps in src (D18) — bundles into React Native unchanged. Feed it `packages/kb/bundle.json` as `KBData`. Engine now also imports type/pure-function helpers from `packages/schema/src` (relative path), so the app bundle must include both packages.

**Exports (one line each):**
- `RaceEngineerChat` — dialogue state machine; constructor `(bundle: ContextBundle, data: KBData, hooks?: ChatHooks)`; `greeting() / updateTrack(track) / updateSetup(setup, versionId?) / handle(text)` all return `string[]`. UNCHANGED signatures; now presents a ranked plan (max 3) and walks it one change at a time ("next" command continues after a "better").
- `ChatHooks` / `OutcomeEvent` — `OutcomeEvent` gained OPTIONAL `plan_position?: number` and `plan_size?: number` (additive).
- `recommend(bundle, data): Recommendation` — single-card pipeline, unchanged shape; retrieval now history-aware.
- `proposePlan(bundle, data, opts?): RecommendationPlan` — `{ kind: "plan"|"do_nothing"|"refusal", changes: PlannedChange[] (max 3, ranked, distinct settings, each cited), message?, conditions_echo }`; never throws (unknown template → in-band refusal). `MAX_PLAN_CHANGES = 3`.
- `PlannedChange` — `{ position: 1-based, option: RecommendationOption, rationale: string }`.
- `analyzeRuns(runs: RunEntry[], data, opts?: { outcomes?, current_setup?, mode? }): RunAnalysisReport` — **(B0: renamed from `EngineerReport` to disambiguate from `report.ts`'s app-facing one)** id-less pure object `{ kind, source, run_count, track_names, span?, sections[] }` with sections `summary | conditions | pace | tyres | setup_changes | next_plan`; every line is `{ kind: "observation"|"recommendation"|"refusal", text, citations? }`; JSON-round-trips identically (storage persists it as an opaque doc).
- `planRaceDay(input: RaceDayInput, data): {ok:true, plan: RaceDayPlan} | {ok:false, reason:"unknown_template"}` — (lives in `raceday.ts` post-B0) input `{ practice: LearningTuple[], forecast: WeatherObservation[], track: TrackSnapshot, chassis_template_id, current_setup? }`; plan has `forecast_read / practice_read / adjustments (cited, race-day-safe) / refusals (explicit ungrounded aspects) / assumptions`. Thresholds exported: `PLANNER_HOT_AIR_C` (30), `PLANNER_COLD_AIR_C` (10), `PLANNER_WIND_ASPECT_KMH` (25).
- **(B0 merge — Théo's app-facing engine surface, now unified in the same package):** `buildReport(bundle, data): EngineerReport` — the 8-part single-run report the app renders (diagnosis → primary → secondary → don't-touch-yet → expected → driving tips → confidence → why). `buildRacePlan(...)` + types `Forecast / RacePlan / RaceWindow / SelectedRunSummary` — race-plan-from-runs+forecast. `drivingTips(bundle, rule?): string[]` — deterministic adaptation-tip table (D23). **Two distinct report types coexist:** `EngineerReport` (`report.ts`, app-facing single-run 8-part) vs `RunAnalysisReport` (`reports.ts`, multi-run analysis). **Two planners:** `buildRacePlan` (`planner.ts`) vs `planRaceDay` (`raceday.ts`).
- `historyFromTuples(tuples: LearningTuple[], filter?: { track_id?, car_id?, limit? }): HistoryEntry[]` — THE way to populate `ContextBundle.history` (keeps citations + track_id that schema's `toEngineHistory` drops). Also `historyForRule / historyTier / historyNote`, type `RuleHistory`.
- `HistoryEntry` — `{ change, conditions, outcome, citations?, track_id? }`; schema `ContextHistoryEntry` rows stay assignable (required fields identical).
- `ContextBundle` — `track` gained optional `track_id?: string` (set it to enable track-isolated history); `history?: HistoryEntry[]`.
- `RecommendationOption` — gained optional `history_note?: string` (deterministic "Rated worse here last time…" template) and optional `confidence_qualifier?: string` (M3 — a deterministic honest read: match strength + source breadth + this-condition history + revert cost, e.g. "High confidence — exact match, rated better here in similar conditions, multi-source, ~12 min to revert"). Both ADDITIVE; the base `confidence` field + all ranking/cap/race-day-bar logic are unchanged. `confidenceDetail(rule, bundle, history?)` is exported.
- `analyzeRuns` tyres section (M2) — when a run has lap-series timing and `detectTyreCliff` finds a drop, adds a quantified observation (`tyres fell off ~lap N, pace dropped X%`) + a pit-timing recommendation; SILENT on summary-only/flat runs (no invented cliff); cliff lines carry no KB citation (per-run lap math, not a rule).
- `KBData` — gained OPTIONAL `registry?: ChassisRegistryEntry[]` (type re-exported from schema), `classes?: Record<string, KBClassDef>`, and (D49 model-aware) `categoryTemplates?: Record<string, ChassisTemplate>` (the kb category-template setup-page scaffolds, keyed by `template_id`); `validateRegistryAndClasses` exported; absence of all is fully supported. `node-kb.ts` populates `categoryTemplates` from `bundle.json` (16 templates).
- `resolveTemplate(data, id): ChassisTemplate | undefined` — (D49) the canonical chassis→template resolver every planner/report uses: a bundled `full` per-model template by `template_id` first, else (for a `pending_pdf` model) the category template named by its registry `category_template` — so a not-yet-extracted model still gets class-level cited advice. Returns `undefined` when neither resolves; callers refuse in-band, never throw.
- Unchanged: `parseFeedback`, `assertValidKBData`, `getTemplate`, `validateRulesAgainstTaxonomy`, types `ChassisTemplate / KBRule / Taxonomy / FeedbackTag / Recommendation`.

**Stability promise:** the pre-existing surface is source-compatible (apps/mobile tsc verified untouched); all additions are additive. `RaceEngineerChat` constructor+methods, `Recommendation`/`RecommendationOption` required fields, and `OutcomeEvent` required fields will not change without a major version note in CONTRACTS.md. D18/D13 invariants are load-bearing: no I/O, no network, every recommendation cites a KB rule id, engine/nitro questions refuse.
