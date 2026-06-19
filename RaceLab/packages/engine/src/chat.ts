import { getTemplate, type KBData } from "./data";
import { parseFeedback } from "./nlu";
import { proposePlan } from "./plan";
import { engineScopeViolation } from "./guard";
import { conditionsEcho } from "./offline";
import type { ContextBundle, FeedbackTag, RecommendationOption } from "./types";

/**
 * RaceLab's deterministic race-engineer chatbot (D18) — no API, no model.
 * A dialogue state machine over the KB: parse the complaint, ask the one
 * clarifying question a real engineer would ask, propose a RANKED PLAN of up
 * to 3 cited changes — applied and rated ONE AT A TIME (D6: never two
 * untested changes on the car) — then walk the better/same/worse loop.
 */

type State = "awaiting_problem" | "awaiting_phase" | "awaiting_outcome";

const PHASE_QUESTION =
  "When does it do that? Tell me where in the corner: entry / mid-corner / exit / on power / off power / braking — or jumps / bumps / high speed / low speed. That's what decides which lever fixes it.";

const PROBLEM_PROMPT =
  'Describe what the car is doing — like you\'d tell your pit man: the symptom, when in the corner it happens, and the conditions. e.g. "it pushes mid-corner on the dusty low-grip stuff", "loose on power out of the infield", "bounces through the braking bumps".';

/** R5-1 — the marker the rendered `change` text uses to carry a rule's hard
 *  safety caveat (M1-M3: " ⚠️ SAFETY: <danger>"). The chat splits on it so the
 *  danger note becomes its OWN prominent line, never buried at the end of the
 *  change text. */
const SAFETY_MARKER = "⚠️ SAFETY:";

/** R5-1 — split an option's `change` into the bare action and (when present) the
 *  hard danger note, so the chat can render the danger on its own ⚠️ line. The
 *  danger is the SAME advice path as the report's — surfacing it is mandatory.
 *  Pure string split; no new content, NaN-free. */
function splitDanger(change: string): { action: string; danger: string | null } {
  const i = change.indexOf(SAFETY_MARKER);
  if (i === -1) return { action: change.trim(), danger: null };
  return {
    action: change.slice(0, i).trim(),
    danger: change.slice(i + SAFETY_MARKER.length).trim(),
  };
}

/** R5-1 — one plain-language framing line, the chat echo of the report's headline:
 *  what this change IS for the racer, keyed on confidence, with the danger framing
 *  taking precedence so a physical-risk change is never oversold. Pure + total. */
function framing(confidence: RecommendationOption["confidence"], hasDanger: boolean): string {
  if (hasDanger) return "the clearest single change to try here — go gently, it has a hard safety limit";
  if (confidence === "high") return "your highest-confidence, lowest-risk change to try first";
  if (confidence === "medium") return "the most promising single change to test next";
  return "worth a controlled test — low confidence, so prove it on track before you trust it";
}

/** R5-1 — confidence in evidence-strength words, mirroring the report's calibrated
 *  wording: a verified-science 'high' is stated as exactly that. Pure + total. */
function confidenceWording(confidence: RecommendationOption["confidence"]): string {
  switch (confidence) {
    case "high":
      return "high — from the verified set-up science; rate the run and it gets confirmed on YOUR car";
    case "medium":
      return "medium — a solid lead, not a certainty; the run tells us";
    default:
      return "low — treat it as an experiment, not a fix";
  }
}

export interface OutcomeEvent {
  outcome: "better" | "same" | "worse";
  option: RecommendationOption | null;
  /** The setup version the change was trialed AGAINST, captured when the
   *  recommendation was presented — not when the driver rated it (a save or
   *  load in between must not mis-attribute the outcome). */
  setup_version_id: string | null;
  /** 1-based rank of the rated change inside its plan (additive — absent on
   *  events emitted before the plan protocol existed). */
  plan_position?: number;
  /** Total changes in the plan the rated change belonged to. */
  plan_size?: number;
}

export interface ChatHooks {
  onOutcome?: (e: OutcomeEvent) => void;
}

export class RaceEngineerChat {
  private state: State = "awaiting_problem";
  private bundle: ContextBundle;
  private pendingSymptoms: FeedbackTag[] = [];
  private queue: RecommendationOption[] = [];
  private current?: RecommendationOption;
  private currentVersionId: string | null = null; // stamped at trial time
  private planSize = 0; // changes in the active plan (0 = no plan presented)
  private planPos = 0; //  1-based position of `current` within the plan
  private data: KBData;
  private template;
  private hooks: ChatHooks;

  constructor(bundle: ContextBundle, data: KBData, hooks: ChatHooks = {}) {
    this.bundle = bundle;
    this.data = data;
    this.hooks = hooks;
    this.template = getTemplate(data, bundle.chassis_template_id);
  }

  greeting(): string[] {
    return [
      `Race engineer ready — ${this.template.brand} ${this.template.model}.`,
      `Session: ${conditionsEcho(this.bundle)}.`,
      "I read what the car is doing and give you ONE grounded chassis change at a time — the lever, how far to move it, what to expect, and how to undo it — all from verified set-up rules (no guessing, chassis only, not engine).",
      PROBLEM_PROMPT,
    ];
  }

  /** Update the track context IN PLACE — the dialogue (pending recommendation,
   *  mode, queue) survives. Returns an acknowledgement line for the feed. */
  updateTrack(track: ContextBundle["track"]): string[] {
    this.bundle.track = { ...track, conditions: [...track.conditions] };
    return [`📍 Conditions updated: ${conditionsEcho(this.bundle)}.`];
  }

  /** Refresh the setup values (and their base version) without resetting the
   *  conversation — call after the driver edits/saves/loads a sheet. The
   *  CURRENT recommendation keeps its trial-time version attribution. */
  updateSetup(setup: ContextBundle["setup"], setupVersionId?: string): void {
    this.bundle.setup = { ...setup };
    this.bundle.setup_version_id = setupVersionId;
  }

  handle(rawInput: string): string[] {
    const input = rawInput.trim();
    if (!input) {
      // R5-1: an empty turn gets a SPECIFIC ask, not a vague "I'm listening" —
      // tell the racer exactly what three things to give me.
      return [
        "I'm listening — give me the symptom, when in the corner it happens, and the conditions.",
        PROBLEM_PROMPT,
      ];
    }

    // global commands work in any state
    const cmd = this.handleCommand(input);
    if (cmd) return cmd;

    // engine-scope refusal beats everything (D13)
    const refusal = engineScopeViolation(
      { ...this.bundle, question: input, feedback: { tags: [], text: input } },
      this.data.taxonomy,
    );
    if (refusal) return [`🚫 ${refusal}`];

    switch (this.state) {
      case "awaiting_problem":
        return this.onProblem(input);
      case "awaiting_phase":
        return this.onPhase(input);
      case "awaiting_outcome":
        return this.onOutcome(input);
    }
  }

  private handleCommand(input: string): string[] | null {
    const lower = input.toLowerCase();
    if (/^(race ?day|main|qualif)/.test(lower)) {
      this.bundle.mode = "race_day";
      return ["⏱ Race-day mode: I'll only propose high-confidence changes you can revert fast."];
    }
    if (/^practice/.test(lower)) {
      this.bundle.mode = "practice";
      return ["🔧 Practice mode: we can experiment."];
    }
    if (/^(next|continue|keep going)\b/.test(lower)) {
      if (this.state === "awaiting_outcome") {
        return ['Rate the current change first — better / same / worse? (one change at a time)'];
      }
      if (this.queue.length > 0) return this.presentNext(false);
      return ["No plan pending — describe what the car is doing."];
    }
    if (/^(help|\?)$/.test(lower)) {
      return [
        PROBLEM_PROMPT,
        'After a suggestion, tell me "better", "same" or "worse". Say "race day" or "practice" to switch mode.',
      ];
    }
    return null;
  }

  private onProblem(input: string): string[] {
    const parsed = parseFeedback(input);
    if (parsed.conditions.length > 0) {
      this.bundle.track.conditions = [
        ...new Set([...this.bundle.track.conditions, ...parsed.conditions]),
      ];
    }
    if (parsed.tags.length === 0) {
      // R5-1: a SPECIFIC clarification — name the grip-feel words I understand and
      // the three things I need, so the racer knows exactly how to rephrase.
      return [
        "I couldn't pin the symptom down from that. Tell me how the car FEELS in grip terms — does it push/understeer, go loose/oversteer, bounce, bottom out, traction-roll, or feel twitchy?",
        "And WHEN it happens (corner entry / mid / exit, on or off power, braking, jumps, bumps) — that's what points to the right lever.",
      ];
    }
    const hasPhase = parsed.tags.some((t) => t.phase);
    if (!hasPhase) {
      this.pendingSymptoms = parsed.tags;
      this.state = "awaiting_phase";
      return [`Got it — ${parsed.tags.map((t) => t.symptom.replace(/_/g, " ")).join(" + ")}.`, PHASE_QUESTION];
    }
    return this.recommendFor(parsed.tags);
  }

  private onPhase(input: string): string[] {
    const parsed = parseFeedback(input);
    const phases = parsed.tags.map((t) => t.phase).filter(Boolean) as string[];
    const phaseFromText = phases[0] ?? this.matchBarePhase(input);
    const tags = this.pendingSymptoms.map((t) => ({
      ...t,
      phase: phaseFromText ?? undefined,
    }));
    this.pendingSymptoms = [];
    return this.recommendFor(tags);
  }

  private matchBarePhase(input: string): string | null {
    const lower = input.toLowerCase();
    if (/everywhere|always|all the time|the whole lap/.test(lower)) return null;
    const map: Record<string, string> = {
      entry: "corner_entry",
      "turn in": "corner_entry",
      mid: "mid_corner",
      apex: "mid_corner",
      exit: "corner_exit",
      "on power": "on_power",
      throttle: "on_power",
      "off power": "off_power",
      braking: "braking",
      brakes: "braking",
      jumps: "jumps",
      jump: "jumps",
      bumps: "rough_section",
      rough: "rough_section",
      "high speed": "high_speed",
      fast: "high_speed",
      "low speed": "low_speed",
      slow: "low_speed",
      tight: "low_speed",
    };
    for (const [k, v] of Object.entries(map)) if (lower.includes(k)) return v;
    return null;
  }

  private recommendFor(tags: FeedbackTag[]): string[] {
    this.bundle.feedback = { tags, text: "" };
    const plan = proposePlan(this.bundle, this.data);
    if (plan.kind !== "plan") {
      this.state = "awaiting_problem";
      this.queue = [];
      this.planSize = 0;
      this.planPos = 0;
      // R5-2: a "no grounded change" verdict in chat is HELPFUL, not a dead-end.
      // Do-nothing carries the enriched race-day-bar explanation; the refusal
      // says WHY there's no grounded change and what to do (and falls back to the
      // plan's own enriched message when it has one, e.g. unknown template).
      if (plan.kind === "do_nothing") {
        return [`🤝 ${plan.message}`];
      }
      return [
        plan.message
          ? `🚫 ${plan.message}`
          : "🚫 I don't have a verified chassis rule for that one, and I won't guess. Before touching the chassis, check tyres/inserts for this surface — that's the usual cause when no rule matches. Or log a run with the symptom + conditions and I'll have more to work with.",
      ];
    }
    this.queue = plan.changes.map((c) => c.option);
    this.planSize = plan.changes.length;
    this.planPos = 0;
    const header: string[] = [];
    if (this.planSize > 1) {
      header.push(
        `Plan: ${this.planSize} grounded changes, ranked. ONE at a time — apply, run, rate, then we decide.`,
      );
      // R5-1: in the scannable header, show the bare action + a compact ⚠️ flag for
      // any change that carries a hard safety limit (the full caveat rides its own
      // line when that change is actually presented). Keeps risk visible up front.
      for (const c of plan.changes) {
        const { action, danger } = splitDanger(c.option.change);
        header.push(`  ${c.position}. ${action}${danger ? " ⚠️ (has a safety limit — details when we get to it)" : ""}`);
      }
    }
    return [...header, ...this.presentNext(true)];
  }

  private presentNext(first: boolean): string[] {
    this.current = this.queue.shift();
    // trial-time attribution: whatever base version the setup had when this
    // recommendation goes on the car is what the outcome belongs to
    this.currentVersionId = this.bundle.setup_version_id ?? null;
    if (!this.current) {
      this.state = "awaiting_problem";
      this.planSize = 0;
      this.planPos = 0;
      return [
        "We've been through my whole list for that symptom. Revert to your last good setup and let's look at tires — or describe what changed.",
      ];
    }
    this.planPos += 1;
    this.state = "awaiting_outcome";
    const o = this.current;
    const lead = first ? "Try ONE change:" : "Next on my list:";
    const planTag = this.planSize > 1 ? ` (change ${this.planPos} of ${this.planSize})` : "";
    // R5-1: pull the hard safety caveat out of `change` onto its OWN ⚠️ line so it
    // can't be buried — the chat MUST surface a recommended rule's danger. Then
    // lead with a plain-language framing (the chat echo of the report headline)
    // and state confidence in evidence-strength words.
    const { action, danger } = splitDanger(o.change);
    return [
      `${lead}${planTag}`,
      `🔧 ${action}`,
      `   in plain terms: ${framing(o.confidence, danger !== null)}.`,
      ...(o.magnitude ? [`   how much: ${o.magnitude}`] : []),
      ...(danger ? [`   ⚠️ SAFETY: ${danger}`] : []),
      `   why: ${o.mechanism}`,
      ...(o.history_note ? [`   📒 history: ${o.history_note}`] : []),
      `   confidence: ${confidenceWording(o.confidence)}`,
      `   revert: ${o.revert}  ·  source: ${o.citations.join(", ")}`,
      `Run it, then tell me: better / same / worse?`,
    ];
  }

  private emitOutcome(outcome: OutcomeEvent["outcome"]): void {
    this.hooks.onOutcome?.({
      outcome,
      option: this.current ?? null,
      setup_version_id: this.currentVersionId,
      ...(this.planSize > 0 ? { plan_position: this.planPos, plan_size: this.planSize } : {}),
    });
  }

  private onOutcome(input: string): string[] {
    const lower = input.toLowerCase();
    if (/better|good|fixed|solved|works/.test(lower)) {
      this.emitOutcome("better");
      this.state = "awaiting_problem";
      const lines = ["✅ Keep it — note it on the setup sheet so the change is traceable."];
      if (this.queue.length > 0) {
        lines.push(
          `That was change ${this.planPos} of ${this.planSize}. The car's better — you can stop here, or say "next" to try #${this.planPos + 1} from the plan.`,
        );
      }
      lines.push("Anything else the car is doing?");
      return lines;
    }
    if (/worse|bad|horrible/.test(lower)) {
      this.emitOutcome("worse");
      return [`↩ Revert that first (${this.current?.revert ?? "put it back"}). One variable at a time.`, ...this.presentNext(false)];
    }
    if (/same|no change|nothing|identical/.test(lower)) {
      this.emitOutcome("same");
      return ["↩ Revert it — a change that does nothing is just wear. Next:", ...this.presentNext(false)];
    }
    // driver described a NEW problem instead of an outcome
    const parsed = parseFeedback(input);
    if (parsed.tags.length > 0) {
      return this.onProblem(input);
    }
    return ['Tell me "better", "same" or "worse" — or describe a new problem.'];
  }
}
