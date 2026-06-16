/**
 * racelab-schema — THE contract surface for the pivot: cars, tracks, runs,
 * weather, account, strategy, outbox. Pure data + pure functions, zero I/O,
 * zero runtime deps, no Date.now() (callers inject `now`). Theo's run
 * vocabulary is absorbed verbatim; everything else is additive.
 */

// ── vocabulary (Theo-compatible, `as const` single-source unions) ────────────
export {
  SURFACES,
  GRIPS,
  BUMPINESS_LEVELS,
  TRACK_EVOLUTIONS,
  SKIES,
  TYRE_WEARS,
  RUN_TYPES,
  OUTCOMES,
  TRAFFIC_LEVELS,
  POWER_TYPES,
} from "./vocab";
export type {
  IsoDateTime,
  IsoDate,
  Rating1to5,
  Rating1to10,
  Confidence,
  Surface,
  Grip,
  Bumpiness,
  TrackEvolution,
  Sky,
  TyreWear,
  RunType,
  Outcome,
  Traffic,
  PowerType,
} from "./vocab";

// ── ids ──────────────────────────────────────────────────────────────────────
export { ID_PREFIXES, makeId, isoToMs, isId } from "./ids";
export type { Id, IdPrefix, CarId, TrackId, SessionId, RunId, OutcomeId, OutboxId } from "./ids";

// ── cars (garage + conditional sheet sections) ───────────────────────────────
export {
  makeCar,
  classLabels,
  sheetSections,
  sectionApplies,
  visibleSections,
  COMMON_SECTIONS,
  NITRO_SECTIONS,
  BRUSHLESS_SECTIONS,
  CUSTOM_CHASSIS_ID,
} from "./cars";
export type {
  Car,
  MakeCarInput,
  CarRejectReason,
  ChassisRegistryEntry,
  CarClassLabels,
  CommonSectionId,
  NitroSectionId,
  BrushlessSectionId,
  SheetSectionId,
  SheetSection,
  SectionCondition,
  SectionContext,
} from "./cars";

// ── tracks ───────────────────────────────────────────────────────────────────
export {
  makeTrack,
  addTrackRecord,
  bestRecord,
  snapshotTrack,
  turnsReject,
  TURN_DIRECTIONS,
  CORNER_TYPES,
  BANKINGS,
  TRACK_RECORD_SOURCES,
} from "./tracks";
export type {
  Track,
  MakeTrackInput,
  TrackRejectReason,
  RecordRejectReason,
  TrackTurn,
  TurnDirection,
  CornerType,
  Banking,
  TrackRecord,
  TrackRecordSource,
  Gps,
  TrackSnapshot,
} from "./tracks";

// ── weather + condition resolution ───────────────────────────────────────────
export {
  makeWeatherObservation,
  resolveConditions,
  weatherAtTime,
  deriveSky,
  hasExplicitOffset,
  WEATHER_SOURCES,
  WEATHER_DERIVED_FIELDS,
  WEATHER_NUMERIC_FIELDS,
  RAIN_RISK_THRESHOLD_PCT,
  CLOUDY_THRESHOLD_PCT,
} from "./weather";
export type {
  WeatherObservation,
  WeatherSource,
  WeatherRejectReason,
  WeatherDerivedField,
  ConditionsProvenance,
  ResolvedRunConditions,
} from "./weather";

// ── runs (the ultimate run log) + learning-loop bridge ───────────────────────
export {
  makeRun,
  makeOutcomeRecord,
  effectiveTiming,
  lapStats,
  lapDeltas,
  fuelStats,
  toLapSeries,
  positionDeltas,
  learningTuples,
  renderConditions,
  conditionsToTags,
  surfaceToTags,
  toEngineHistory,
  LAP_SOURCES,
} from "./runs";
export type {
  RunConditions,
  TyreSet,
  RunResult,
  NonTimingResult,
  LapSource,
  LapTime,
  LapSeries,
  SpeedhiveImportMeta,
  ImportedLap,
  ImportedLaps,
  TimingStats,
  FuelLog,
  FuelStats,
  FeedbackTag,
  TurnFeedback,
  RunFeedback,
  DriverState,
  DriverStateInput,
  RunTiming,
  RunTimingInput,
  RunEntry,
  MakeRunInput,
  RunRejectReason,
  OutcomeRecord,
  MakeOutcomeInput,
  OutcomeRejectReason,
  LearningTuple,
  ContextHistoryEntry,
} from "./runs";

// ── bridge (one-shot lifts from the legacy sessions/logbook models) ──────────
export {
  liftSessionsRun,
  liftSessionsOutcome,
  liftTheoRunEntry,
  conditionsFromTags,
} from "./bridge";
export type {
  SessionsTrackInfo,
  SessionsRun,
  SessionsOutcomeRecord,
  SessionsLiftContext,
  TheoTrackInfo,
  TheoRunResult,
  TheoTyreSet,
  TheoRunEntry,
  TheoLiftContext,
  TheoLiftRejectReason,
} from "./bridge";

// ── parse (load-path validators — storage adapters MUST route loads here) ────
export {
  parseCar,
  parseTrack,
  parseWeatherObservation,
  parseRunEntry,
  parseOutcomeRecord,
  parseAccountState,
  parseOutboxState,
} from "./parse";
export type { ParseResult } from "./parse";

// ── account / entitlements ───────────────────────────────────────────────────
export {
  makeDriverProfile,
  initAccount,
  startTrial,
  effectiveSubscriptionStatus,
  checkEntitlement,
  DRIVER_LEVELS,
  SUBSCRIPTION_STATUSES,
  FEATURES,
  FREE_FEATURES,
  GRACE_DAYS,
} from "./account";
export type {
  DriverLevel,
  DriverProfile,
  MakeProfileInput,
  ProfileRejectReason,
  SubscriptionStatus,
  Subscription,
  AccountState,
  Feature,
  EntitlementResult,
  TrialRejectReason,
} from "./account";

// ── strategy (deterministic planners) ────────────────────────────────────────
export { planRace, detectTyreCliff } from "./strategy";
export type {
  PitStop,
  StintPlan,
  RacePlanInput,
  RacePlan,
  RacePlanRejectReason,
  TyreCliffEvidence,
  TyreCliffReport,
  TyreCliffOptions,
} from "./strategy";

// ── outbox (append-only mutation journal) ────────────────────────────────────
export { initOutbox, appendOutbox, entriesAfter, pruneOutbox, OUTBOX_DOMAINS, OUTBOX_OPS } from "./outbox";
export type { OutboxDomain, OutboxOp, OutboxEntry, OutboxState, OutboxRejectReason } from "./outbox";
