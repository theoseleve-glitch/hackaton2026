/**
 * racelab-speedhive — B9 Speedhive adapter for the UNOFFICIAL MYLAPS API.
 *
 * Isolation layout (the whole point of this package):
 *  - types.ts  — raw SH* wire shapes (payload drift lands here)
 *  - client.ts — SpeedhiveApi + HttpSpeedhiveClient; EVERY URL lives in its
 *                ENDPOINTS map (path drift lands here)
 *  - poll.ts   — politePoll, 30 s floored interval, injected sleep
 *  - import.ts — the only SH* → schema translation (ImportedLaps →
 *                RunTimingInput via schema toLapSeries)
 *
 * Tier-B enrichment only (D18): nothing on the advice path imports this; the
 * app is fully functional with every Speedhive endpoint down. All I/O is
 * injected (fetch, token store, sleep, imported_at) — zero globals, zero
 * node built-ins, zero runtime deps.
 */

// ── raw wire types (SH-prefixed, never leak past import.ts) ──────────────────
export type {
  SHCountry,
  SHLocation,
  SHOrganization,
  SHEvent,
  SHSession,
  SHSessionGroup,
  SHEventSessions,
  SHDifference,
  SHClassificationRow,
  SHClassification,
  SHLap,
  SHCompetitorLaps,
  SHLapchart,
  SHLapchartCell,
  SHLapchartStartPosition,
  SHBestLap,
  SHPracticeStats,
  SHPracticeLap,
  SHPracticeSubSession,
  SHChip,
  SHPracticeSession,
  SHPracticeSessionList,
} from "./types";

// ── client ───────────────────────────────────────────────────────────────────
export { HttpSpeedhiveClient, DEFAULT_BASE_URLS, ENDPOINTS } from "./client";
export type {
  SpeedhiveApi,
  SpeedhiveUnverifiedApi,
  SpeedhiveBaseUrls,
  SpeedhiveResult,
  SpeedhiveFailure,
  TokenStore,
  FetchLike,
  HttpResponseLike,
  HttpRequestInit,
  PracticeListQuery,
} from "./client";

// ── polling ──────────────────────────────────────────────────────────────────
export { politePoll, POLL_MIN_INTERVAL_FLOOR_MS } from "./poll";
export type { PolitePollOptions, PolitePollOutcome, SleepFn } from "./poll";

// ── mapping into schema ──────────────────────────────────────────────────────
export {
  fromEventLaps,
  fromPracticeSession,
  findTransponderResults,
  competitorLapchartPositions,
  buildRunTiming,
  parseClockTime,
  lapSeconds,
  normalizeTransponder,
} from "./import";
export type {
  ImportMetaInput,
  MapLapsResult,
  MapLapsFailure,
  TransponderMatch,
  LapchartPosition,
} from "./import";
