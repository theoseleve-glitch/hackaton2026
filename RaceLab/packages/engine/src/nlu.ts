import type { FeedbackTag } from "./types";

/**
 * Deterministic NLU (D18): driver free text → feedback tags + condition hints.
 * Pure keyword/synonym matching over the pit-lane vocabulary — no model, no API.
 * Longest/most-specific patterns are checked first so "loose under braking"
 * lands on unstable_braking, not oversteer.
 */

interface SymptomPattern {
  symptom: string;
  patterns: RegExp[];
}

// Order matters: specific compound symptoms before generic ones.
const SYMPTOM_PATTERNS: SymptomPattern[] = [
  {
    symptom: "unstable_braking",
    patterns: [
      /(swaps?|wanders?|loose|unstable|nervous|steps? out).{0,30}(under |when |while )?brak/i,
      /brak\w*.{0,30}(swaps?|wanders?|loose|unstable|nervous)/i,
    ],
  },
  {
    symptom: "traction_roll",
    patterns: [/traction.?roll/i, /rolls? (over|it)/i, /rolled (it|over|twice|the car)/i, /tips? over/i, /grip.?roll/i],
  },
  {
    symptom: "nosedive_jumps",
    patterns: [/nose.?div/i, /noses? down/i, /lands? (on the )?front/i, /front.?heavy (off|over|on) (the )?jump/i],
  },
  {
    symptom: "no_forward_bite",
    patterns: [
      /no (forward |corner )?(bite|drive|traction)( out)?/i,
      /spin(s|ning)? (up|the tires|the tyres|the wheels)/i,
      /wheel.?spin/i,
      /can'?t (put|get) (the )?power down/i,
      /bogs? (down )?out of/i,
    ],
  },
  {
    symptom: "bottoming",
    patterns: [/bottom(s|ing)?( out)?/i, /chassis slap/i, /slaps? (the )?(ground|chassis|floor)/i],
  },
  {
    symptom: "bouncy",
    patterns: [/bounc/i, /pogo/i, /springy/i, /rebounds? too/i],
  },
  {
    symptom: "poor_bump_handling",
    patterns: [/(skips?|deflects?|kicks?|gets? upset|unsettled).{0,25}(bump|rough|rut|washboard)/i, /(bump|rough|rut)\w*.{0,25}(skips?|deflects?|kicks?|upsets?|unsettles?|throws)/i],
  },
  {
    symptom: "sluggish_steering",
    patterns: [/(lazy|slow|sluggish|not enough|delayed|weak) steering/i, /steering (is |feels )?(lazy|slow|sluggish|delayed)/i, /doesn'?t react/i],
  },
  {
    symptom: "twitchy",
    patterns: [/twitch/i, /darty?/i, /nervous/i, /edgy/i, /over.?sensitive/i, /every (steering )?input is a dart/i, /can'?t (hold|keep) it straight/i],
  },
  {
    symptom: "understeer",
    patterns: [
      /understeer/i,
      /push(es|ing|y)?\b/i,
      /(won'?t|wont|doesn'?t|will not) turn/i,
      /wash(es)?( out)?/i,
      /plows?|ploughs?/i,
      /no steering/i,
      /runs? wide/i,
      /front (just )?(gives up|slides|washes)/i,
    ],
  },
  {
    symptom: "oversteer",
    patterns: [
      /oversteer/i,
      /\bloose\b/i,
      /steps? out/i,
      /kicks? (out|sideways)/i,
      /rear (comes|came|steps|swings) (around|out|wide)/i,
      /fish.?tails?/i,
      /spins? out/i,
      /back end (comes|snaps)/i,
    ],
  },
  {
    symptom: "hard_to_drive",
    patterns: [/hard to drive/i, /exhausting/i, /inconsistent/i, /wears me (out|down)/i, /fighting (the car|it)/i],
  },
];

interface PhasePattern {
  phase: string;
  patterns: RegExp[];
}

const PHASE_PATTERNS: PhasePattern[] = [
  { phase: "braking", patterns: [/brak/i, /\bstopp/i] },
  { phase: "corner_entry", patterns: [/entry/i, /turn.?in/i, /into (the )?corner/i, /going in/i, /initial/i] },
  { phase: "mid_corner", patterns: [/mid.?corner/i, /middle of/i, /apex/i, /through the (corner|middle|sweeper)/i, /flat corner/i] },
  { phase: "corner_exit", patterns: [/exit/i, /out of (the |every |each )?(corner|turn|infield)/i, /coming out/i] },
  { phase: "on_power", patterns: [/on (the )?(power|throttle|gas)/i, /accelerat/i, /when i (gas|gun|punch) it/i, /under power/i] },
  { phase: "off_power", patterns: [/off (the )?(power|throttle|gas)/i, /coast/i, /lett?ing off/i, /lift(ing)?( off)?/i] },
  { phase: "jumps", patterns: [/jump/i, /landing/i, /double|triple|tabletop/i, /off the (face|ramp)/i, /in the air/i] },
  { phase: "rough_section", patterns: [/bump/i, /rough/i, /ruts?/i, /washboard/i, /braking bumps/i, /chop/i] },
  { phase: "high_speed", patterns: [/high.?speed/i, /fast (section|sweeper|straight)/i, /at speed/i, /straight(away)?/i, /flat out/i] },
  { phase: "low_speed", patterns: [/low.?speed/i, /slow (corner|section)/i, /tight (corner|section|turn)/i, /hairpin/i, /infield/i, /technical/i] },
];

const CONDITION_PATTERNS: { condition: string; patterns: RegExp[] }[] = [
  { condition: "dusty", patterns: [/dust/i] },
  { condition: "wet", patterns: [/wet|rain|damp|moist/i] },
  { condition: "blue_groove", patterns: [/blue.?groove|grooved (up|in)|the groove/i] },
  { condition: "high_grip", patterns: [/high.?grip|hooked.?up|lots of grip|tons of grip/i] },
  { condition: "low_grip", patterns: [/low.?grip|slippery|green track|no grip|loose dirt/i] },
  { condition: "bumpy", patterns: [/bumpy|rough track|ruts|washboard/i] },
  { condition: "smooth", patterns: [/smooth/i] },
  { condition: "big_jumps", patterns: [/big (jump|double|triple)|huge jump/i] },
  { condition: "hot", patterns: [/\bhot\b|heat|scorching/i] },
  { condition: "cold", patterns: [/\bcold\b|freezing|chilly/i] },
  { condition: "technical_tight", patterns: [/technical|tight track|infield heavy/i] },
  { condition: "fast_open", patterns: [/fast (and )?open|open track|flowing/i] },
];

export interface NLUResult {
  tags: FeedbackTag[];
  conditions: string[];
}

export function parseFeedback(text: string): NLUResult {
  const symptoms: string[] = [];
  for (const { symptom, patterns } of SYMPTOM_PATTERNS) {
    if (patterns.some((p) => p.test(text)) && !symptoms.includes(symptom)) {
      symptoms.push(symptom);
    }
  }

  // unstable_braking subsumes a braking-phase oversteer reading of the same words
  let filtered = symptoms;
  if (symptoms.includes("unstable_braking")) {
    filtered = symptoms.filter((s) => s !== "oversteer");
  }
  // twitchy's "can't hold it straight" overlaps poor_bump_handling wording only when bumps present
  const phases = PHASE_PATTERNS.filter(({ patterns }) => patterns.some((p) => p.test(text))).map(
    (p) => p.phase,
  );

  const tags: FeedbackTag[] = [];
  for (const symptom of filtered.slice(0, 2)) {
    if (phases.length === 0) {
      tags.push({ symptom });
    } else {
      for (const phase of phases.slice(0, 2)) tags.push({ symptom, phase });
    }
  }

  const conditions = CONDITION_PATTERNS.filter(({ patterns }) =>
    patterns.some((p) => p.test(text)),
  ).map((c) => c.condition);

  return { tags, conditions };
}
