/** RaceLab engine — public API. Pure data + pure functions (D18): no fs, no
 *  network, no node built-ins anywhere on this surface, so it bundles into
 *  the app unchanged. Feed it packages/kb/bundle.json as KBData.
 *
 *  Reconciled barrel (Phase 1): William's engine adopted additively, but the
 *  app's product contract is preserved — `EngineerReport` is Theo's FLAT
 *  8-part report (`./report`), the canonical type every card renders.
 *  William's run-set debrief report is exported under the alias `RunSetReport`
 *  so the two coexist without clashing (spec §2). */

// ── core advice path (unchanged: byte-identical engineer + nlu + guard) ───────
export { recommend } from "./engineer";
export { parseFeedback } from "./nlu";

// ── deterministic chatbot (William's plan-protocol chat; hooks optional) ──────
export { RaceEngineerChat } from "./chat";
export type { ChatHooks, OutcomeEvent } from "./chat";

// ── flat 8-part engineer report — THE app/card contract (Theo, unchanged) ─────
export { buildReport } from "./report";
export type { EngineerReport } from "./report";

// ── Layer-4 deterministic driving tips (Theo, unchanged) ──────────────────────
export { drivingTips } from "./driving-tips";

// ── race-plan façade — flat report + (optional) William cited adjustments ──────
export { buildRacePlan } from "./race-plan";
export type { Forecast, RacePlan, RaceWindow, SelectedRunSummary } from "./race-plan";

// ── race-day planner (practice + forecast → grounded cited adjustments) ───────
export {
  planRaceDay,
  PLANNER_HOT_AIR_C,
  PLANNER_COLD_AIR_C,
  PLANNER_WIND_ASPECT_KMH,
} from "./planner";
export type {
  PlannedAdjustment,
  PlannerRefusal,
  RaceDayInput,
  RaceDayPlan,
  RaceDayRejectReason,
} from "./planner";

// ── multi-change plans (one-at-a-time application protocol) ───────────────────
export { proposePlan, MAX_PLAN_CHANGES } from "./plan";
export type { PlannedChange, RecommendationPlan, ProposePlanOptions } from "./plan";

// ── learning-loop read half (docs/04 §6) ──────────────────────────────────────
export { historyFromTuples, historyForRule, historyNote, historyTier } from "./history";
export type { RuleHistory } from "./history";

// ── run-set analysis report (William, net-new; aliased to avoid the clash) ─────
export { analyzeRuns } from "./reports";
export type { EngineerReport as RunSetReport } from "./reports";
export type {
  AnalyzeRunsOptions,
  ReportLine,
  ReportLineKind,
  ReportSection,
} from "./reports";

// ── KB data + validators ──────────────────────────────────────────────────────
export {
  assertValidKBData,
  getTemplate,
  validateRulesAgainstTaxonomy,
  validateRegistryAndClasses,
} from "./data";
export type { KBData, KBClassDef, ChassisRegistryEntry } from "./data";

// ── shared engine types ───────────────────────────────────────────────────────
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
