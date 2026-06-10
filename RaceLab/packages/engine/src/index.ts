/** RaceLab engine — public API. Pure data + pure functions (D18): no fs, no
 *  network, no node built-ins anywhere on this surface, so it bundles into
 *  the app unchanged. Feed it packages/kb/bundle.json as KBData. */
export { RaceEngineerChat } from "./chat";
export type { ChatHooks, OutcomeEvent } from "./chat";
export { recommend } from "./engineer";
export { parseFeedback } from "./nlu";
export { assertValidKBData, getTemplate, validateRulesAgainstTaxonomy } from "./data";
export type { KBData } from "./data";
export type {
  ChassisTemplate,
  ContextBundle,
  FeedbackTag,
  KBRule,
  Recommendation,
  RecommendationOption,
  Taxonomy,
} from "./types";
