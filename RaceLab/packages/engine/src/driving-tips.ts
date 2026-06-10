import type { ContextBundle, KBRule } from "./types";

/**
 * Layer 4 — driving adaptation tips (D23). Sometimes the right answer is not
 * (only) "change the setup" but "the car's behavior will change — drive it
 * differently". Deterministic data table, same D18 discipline as KB rules:
 * a tip fires from the recommended change's effect axes, the current
 * conditions, tyre state, or track evolution. Never from free association.
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
    /** fires when this symptom was reported */
    symptom?: string;
  };
  tip: string;
}

const TIPS: TipRule[] = [
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
  // — tied to reported symptoms (driver-side half of the fix)
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

/** Deterministic tip selection: change-driven tips first (most actionable),
 *  then conditions, tyres, evolution, symptoms. Capped — a wall of tips is
 *  noise between heats. */
export function drivingTips(bundle: ContextBundle, recommendedRule?: KBRule): string[] {
  const tips: string[] = [];
  const conditions = new Set(bundle.track.conditions);
  const symptoms = new Set(bundle.feedback.tags.map((t) => t.symptom));
  const wear = bundle.tyres?.wear;

  for (const t of TIPS) {
    if (tips.length >= MAX_TIPS) break;
    const w = t.when;
    let fires = false;
    if (w.effect && recommendedRule) {
      fires = recommendedRule.effects.some(
        (e) => e.axis.includes(w.effect!.axis_includes) && e.change.includes(w.effect!.change),
      );
    } else if (w.condition) {
      fires = conditions.has(w.condition);
    } else if (w.tyre_wear) {
      fires = wear !== undefined && (w.tyre_wear as string[]).includes(wear);
    } else if (w.evolution) {
      fires = bundle.track.evolution === w.evolution;
    } else if (w.symptom) {
      fires = symptoms.has(w.symptom);
    }
    if (fires) tips.push(t.tip);
  }
  return tips;
}
