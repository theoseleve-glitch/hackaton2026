/** RaceLab engine — public API. Pure data + pure functions (D18): no fs, no
 *  network, no node built-ins anywhere on this surface, so it bundles into
 *  the app unchanged. Feed it packages/kb/bundle.json as KBData. */
export { RaceEngineerChat } from "./chat";
export type { ChatHooks, OutcomeEvent } from "./chat";
export { recommend } from "./engineer";
export { buildReport } from "./report";
export type { EngineerReport } from "./report";
export { buildRacePlan } from "./planner";
export type { Forecast, RacePlan, RaceWindow, SelectedRunSummary } from "./planner";
export { drivingTips } from "./driving-tips";
export { parseFeedback } from "./nlu";
export {
  assertValidKBData,
  getTemplate,
  validateRulesAgainstTaxonomy,
  validateRegistryAndClasses,
} from "./data";
export type { KBData, KBClassDef, ChassisRegistryEntry } from "./data";
export type {
  ChassisTemplate,
  ContextBundle,
  FeedbackTag,
  HistoryEntry,
  KBRule,
  Recommendation,
  RecommendationOption,
  Taxonomy,
} from "./types";

// ── learning-loop read half (docs/04 §6) ─────────────────────────────────────
export { historyFromTuples, historyForRule, historyNote, historyTier } from "./history";
export type { RuleHistory } from "./history";

// ── multi-change plans (one-at-a-time application protocol) ──────────────────
export { proposePlan, MAX_PLAN_CHANGES } from "./plan";
export type { PlannedChange, RecommendationPlan, ProposePlanOptions } from "./plan";

// ── run analysis reports (multi-run analysis; distinct from report.ts's
//    single-run 8-part EngineerReport — that one stays the app-facing report) ──
export { analyzeRuns } from "./reports";
export type {
  AnalyzeRunsOptions,
  RunAnalysisReport,
  ReportLine,
  ReportLineKind,
  ReportSection,
} from "./reports";

// ── race-day planner (practice + forecast → grounded adjustments) ────────────
//    NB: distinct from planner.ts's buildRacePlan — this is the cited-adjustment
//    planner; it lives in raceday.ts so both planners coexist post-B0 merge.
export {
  planRaceDay,
  PLANNER_HOT_AIR_C,
  PLANNER_COLD_AIR_C,
  PLANNER_WIND_ASPECT_KMH,
} from "./raceday";
export type {
  PlannedAdjustment,
  PlannerRefusal,
  RaceDayInput,
  RaceDayPlan,
  RaceDayRejectReason,
} from "./raceday";
