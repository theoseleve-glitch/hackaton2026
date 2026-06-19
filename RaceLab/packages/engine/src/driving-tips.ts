import type { ContextBundle, KBRule } from "./types";

/**
 * Layer 4 — driving adaptation tips (D23). Sometimes the right answer is not
 * (only) "change the setup" but "the car's behavior will change — drive it
 * differently". Deterministic data table, same D18 discipline as KB rules:
 * a tip fires from the reported symptom + corner phase, the recommended
 * change's effect axes, the current conditions, tyre state, or track
 * evolution. Never from free association.
 *
 * R6-1 — actionability. The symptom tips are now SPECIFIC and BEHAVIORAL per
 * symptom + corner phase: not "be smooth" but the exact pedal/wheel input that
 * stops the car making this symptom worse (understeer-entry → brake earlier,
 * finish braking before turn-in, don't trail-brake; oversteer-exit → feed,
 * don't stab, the throttle out). They stay UNIVERSAL driving technique — no KB
 * citation — and a low-grip/wet condition appends a conservative coda so the
 * advice tracks the surface. Pure, deterministic, capped at 3.
 */

interface TipRule {
  id: string;
  when: {
    /** fires when the recommended rule has an effect on a matching axis */
    effect?: { axis_includes: string; change: "more" | "less" };
    /** fires when this taxonomy condition tag is present */
    condition?: string;
    /** fires on tyre wear state */
    tyre_wear?: ("medium" | "worn")[];
    /** fires on track evolution */
    evolution?: "improving" | "degrading";
    /** fires when this symptom was reported (optionally narrowed to phases) */
    symptom?: string;
    /** narrows a symptom tip to specific corner phases (any-of). When set, the
     *  tip only fires if the reported tag for that symptom carries one of these
     *  phases; an unphased or different-phase tag falls through to the generic
     *  symptom tip below it. */
    phase_in?: string[];
  };
  tip: string;
}

/** Corner phases grouped for symptom-tip matching. A reported tag's `phase`
 *  picks the most specific behavioral tip; an absent/other phase falls through
 *  to the generic per-symptom tip. */
const ENTRY_PHASES = ["corner_entry", "braking", "off_power"];
const EXIT_PHASES = ["corner_exit", "on_power"];
const MID_PHASES = ["mid_corner"];

const TIPS: TipRule[] = [
  // ── reported symptom + phase (driver-side half of the fix) — MOST actionable,
  //    so these lead. Each names the exact input change that stops the symptom
  //    getting worse, grounded in universal car-control technique.
  // understeer (push) ───────────────────────────────────────────────────────
  {
    id: "tip-understeer-entry",
    when: { symptom: "understeer", phase_in: ENTRY_PHASES },
    tip: "Understeer on entry: brake a touch earlier and get all your braking DONE before you turn in, then ease the wheel in smoothly — trail-braking deep or yanking more lock just washes the front wider here.",
  },
  {
    id: "tip-understeer-mid",
    when: { symptom: "understeer", phase_in: MID_PHASES },
    tip: "Mid-corner understeer: stop adding steering lock — it's already past grip and more angle only scrubs speed. Wait, let the front load and bite, then pick the car up and get back to throttle.",
  },
  {
    id: "tip-understeer-exit",
    when: { symptom: "understeer", phase_in: EXIT_PHASES },
    tip: "Understeer on exit (the nose runs wide as you pick up power): wait a beat longer and straighten the wheel BEFORE you commit to throttle — squeezing power into steering lock pushes the front straight on.",
  },
  {
    id: "tip-understeer",
    when: { symptom: "understeer" },
    tip: "For the push: be patient on the wheel — turn in once, smoothly, and let the front load instead of winding in more lock, which only scrubs the front and slows you.",
  },
  // oversteer (loose) ─────────────────────────────────────────────────────────
  {
    id: "tip-oversteer-entry",
    when: { symptom: "oversteer", phase_in: ENTRY_PHASES },
    tip: "Oversteer on entry/braking: come off the brakes a fraction sooner and release them progressively, not abruptly — snapping off the brake pitches the rear light and provokes the slide as you turn in.",
  },
  {
    id: "tip-oversteer-exit",
    when: { symptom: "oversteer", phase_in: EXIT_PHASES },
    tip: "Oversteer on exit: feed the throttle in progressively out of the corner — squeezing instead of stabbing keeps the rear planted. Wait until the car is straighter before you ask for full power.",
  },
  {
    id: "tip-oversteer-mid",
    when: { symptom: "oversteer", phase_in: MID_PHASES },
    tip: "Mid-corner oversteer: ease your mid-corner speed a hair and keep the throttle neutral through the apex — abrupt lifts or stabs both unsettle the rear; let it settle before you load power.",
  },
  {
    id: "tip-oversteer",
    when: { symptom: "oversteer" },
    tip: "For the loose rear: be progressive with both brake and throttle — release the brake smoothly and squeeze the power; sudden changes are what step the rear out.",
  },
  // braking / drive / response symptoms ───────────────────────────────────────
  {
    id: "tip-unstable-braking",
    when: { symptom: "unstable_braking" },
    tip: "Rear wandering under braking: brake in a straight line and get the heavy braking done before you start to turn — overlapping hard braking with steering is what lets the back end step out.",
  },
  {
    id: "tip-no-forward-bite",
    when: { symptom: "no_forward_bite" },
    tip: "No forward bite: roll the throttle on more gently and a touch later out of the corner — feeding power progressively lets the tyres hook up instead of spinning; stabbing it just lights them up.",
  },
  {
    id: "tip-traction-roll",
    when: { symptom: "traction_roll" },
    tip: "On the edge of a traction roll: soften your steering inputs and avoid sudden direction changes at high lateral load — a sharp flick when the car is loaded is what tips it over. Bleed speed before, not during, the load.",
  },
  {
    id: "tip-sluggish-steering",
    when: { symptom: "sluggish_steering" },
    tip: "Lazy steering response: turn in slightly earlier and more deliberately to load the front and make it answer — waiting for the nose then adding lock just delays the response further.",
  },
  // — tied to the recommended change (the car is ABOUT to behave differently)
  {
    id: "tip-more-steering",
    when: { effect: { axis_includes: "steering", change: "more" } },
    tip: "This change adds steering — be smoother on entry: slower hands, same line, or the front will bite more than you expect.",
  },
  {
    id: "tip-less-steering",
    when: { effect: { axis_includes: "steering", change: "less" } },
    tip: "This change calms the front end — commit to entry earlier and use more steering lock instead of waiting for the nose.",
  },
  {
    id: "tip-more-rear-traction",
    when: { effect: { axis_includes: "rear_traction", change: "more" } },
    tip: "With more rear traction, rotate earlier and stop over-slowing the corner — the rear will hold where it used to step out.",
  },
  {
    id: "tip-more-stability",
    when: { effect: { axis_includes: "stability", change: "more" } },
    tip: "More stable car: carry more entry speed and trust the rear — protect the lap time the stability buys you.",
  },
  {
    id: "tip-more-responsiveness",
    when: { effect: { axis_includes: "respons", change: "more" } },
    tip: "Sharper car incoming: shorter inputs, fewer corrections — let it settle before the next input.",
  },
  // — tied to conditions (the TRACK demands an adaptation)
  {
    id: "tip-low-grip",
    when: { condition: "low_grip" },
    tip: "Low grip: delay full throttle on exit and open the steering earlier — drive the car straight before feeding power.",
  },
  {
    id: "tip-high-grip",
    when: { condition: "high_grip" },
    tip: "High grip: reduce steering aggression — the car turns more than your hands think, and over-input causes traction rolls.",
  },
  {
    id: "tip-bumpy",
    when: { condition: "bumpy" },
    tip: "Rough track: brake before the bumps, not on them, and stay light on inputs while the chassis is working.",
  },
  {
    id: "tip-wet",
    when: { condition: "wet" },
    tip: "Wet surface: every input at half strength — brake earlier and straighter, and keep the throttle progressive.",
  },
  // — tied to tyres
  {
    id: "tip-worn-tyres",
    when: { tyre_wear: ["medium", "worn"] },
    tip: "On worn tyres, brake straighter and avoid late rotation — the rear has less to give at the end of the corner.",
  },
  // — tied to track evolution
  {
    id: "tip-grip-degrading",
    when: { evolution: "degrading" },
    tip: "Grip is dropping run by run — back off half a beat earlier each run and expect the car to slide progressively more.",
  },
  {
    id: "tip-grip-improving",
    when: { evolution: "improving" },
    tip: "Grip is coming up — the car will rotate harder lap by lap; tighten your line gradually instead of fighting it.",
  },
  // — tied to reported symptoms (driver-side, no specific phase needed)
  {
    id: "tip-hard-to-drive",
    when: { symptom: "hard_to_drive" },
    tip: "Aim for 95% pace you can hold a full run — consistency wins club races, not one hero lap.",
  },
  {
    id: "tip-twitchy",
    when: { symptom: "twitchy" },
    tip: "While the car is nervous: relax your grip on the wheel and widen your vision down the track — chasing every twitch makes it worse.",
  },
];

const MAX_TIPS = 3;

/** R6-1 — a conservative coda the surface demands, appended once to the first
 *  symptom/change tip when grip is genuinely scarce. Keeps a single tip honest
 *  about the conditions ("…and on this low-grip/wet surface, leave more margin —
 *  the car punishes a rushed input harder here.") without adding a whole extra
 *  line. Deterministic: derived purely from the condition set. */
function lowGripCoda(conditions: Set<string>): string {
  const wet = conditions.has("wet");
  const lowGrip = conditions.has("low_grip") || conditions.has("cold") || conditions.has("dusty");
  if (wet) {
    return " On a wet surface, dial all of this back further — smaller, earlier, gentler inputs, because the car punishes a rushed one much harder here.";
  }
  if (lowGrip) {
    return " On this low-grip surface, leave a bit more margin and be even gentler — there's less grip to catch a rushed input.";
  }
  return "";
}

/** Phases that warrant a symptom tip's phase-specific (vs generic) variant. */
function tagPhasesFor(bundle: ContextBundle, symptom: string): Set<string> {
  const phases = new Set<string>();
  for (const t of bundle.feedback.tags) {
    if (t.symptom === symptom && t.phase) phases.add(t.phase);
  }
  return phases;
}

/** Deterministic tip selection: reported-symptom (phase-specific) tips first —
 *  the most actionable, driver-side half of the fix — then change-driven,
 *  conditions, tyres, evolution. Capped — a wall of tips is noise between heats.
 *  A scarce-grip coda is folded into the FIRST behavioral (symptom/change) tip
 *  only, so the conditions temper the advice without spending a whole tip slot. */
export function drivingTips(bundle: ContextBundle, recommendedRule?: KBRule): string[] {
  const tips: string[] = [];
  const conditions = new Set(bundle.track.conditions);
  const symptoms = new Set(bundle.feedback.tags.map((t) => t.symptom));
  const wear = bundle.tyres?.wear;
  const coda = lowGripCoda(conditions);
  let codaUsed = false;
  // Track which symptoms already produced a tip so a generic per-symptom tip
  // never doubles up behind its own phase-specific variant.
  const symptomTipDone = new Set<string>();

  for (const t of TIPS) {
    if (tips.length >= MAX_TIPS) break;
    const w = t.when;
    let fires = false;
    // A "behavioral" tip is one that shapes a driver INPUT — the symptom tips
    // and the change-driven tips. Only these earn the scarce-grip coda; a
    // condition/tyre/evolution tip is already condition-specific.
    let behavioral = false;
    if (w.symptom) {
      behavioral = true;
      if (!symptoms.has(w.symptom)) {
        fires = false;
      } else if (w.phase_in) {
        // phase-specific variant: only when the reported tag for this symptom
        // carries a matching phase. Otherwise fall through to the generic tip.
        const phases = tagPhasesFor(bundle, w.symptom);
        fires = w.phase_in.some((p) => phases.has(p));
      } else {
        // generic per-symptom tip: fire only if no phase-specific variant for
        // this symptom already fired (avoid doubling up on one symptom).
        fires = !symptomTipDone.has(w.symptom);
      }
      if (fires) symptomTipDone.add(w.symptom);
    } else if (w.effect && recommendedRule) {
      behavioral = true;
      fires = recommendedRule.effects.some(
        (e) => e.axis.includes(w.effect!.axis_includes) && e.change.includes(w.effect!.change),
      );
    } else if (w.condition) {
      fires = conditions.has(w.condition);
    } else if (w.tyre_wear) {
      fires = wear !== undefined && (w.tyre_wear as string[]).includes(wear);
    } else if (w.evolution) {
      fires = bundle.track.evolution === w.evolution;
    }
    if (!fires) continue;
    let line = t.tip;
    if (!codaUsed && coda && behavioral) {
      line += coda;
      codaUsed = true;
    }
    tips.push(line);
  }
  return tips;
}
