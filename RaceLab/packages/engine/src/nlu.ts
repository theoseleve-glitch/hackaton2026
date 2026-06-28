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
      /(swaps?|wanders?|loose|unstable|nervous|step(s|ping|ped)? out).{0,30}(under |when |while )?brak/i,
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
      // rear traction loss on power ("rear has no grip on power", "no rear bite")
      /(rear|back end) (has |got |with )?(no|lost|losing|loses?|lacks?) (grip|traction|bite)/i,
      /(no|lost|losing|loses?|lacks?) (the )?(rear|back) (grip|traction|bite)/i,
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
      /push(es|ing|in'?|y)?\b/i,
      /(won'?t|wont|doesn'?t|will not) turn/i,
      // "won't rotate" / "not enough rotation" — insufficient/negated rotation only
      // (a bare /rotat/ would mis-tag "rotates too much", which is oversteer)
      /(won'?t|wont|doesn'?t|will not|not enough|no|lacks?|lacking|needs? more) rotat(e|ion|ing)/i,
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
      /step(s|ping|ped)? out/i,
      /(too much|excess(ive)?|loads of) rotat(e|ion|ing)/i,
      /kicks? (out|sideways)/i,
      /rear (comes|came|steps|stepping|stepped|swings|swinging) (around|out|wide)/i,
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
  // "no grip" is deliberately NOT a track signal: it almost always describes the
  // car's balance ("no rear grip", "no front grip") — that path is a symptom, not a
  // surface read. A driver describing the TRACK says "low grip"/"slippery"/"green".
  { condition: "low_grip", patterns: [/low.?grip|slippery|green track|loose dirt/i] },
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

function detectSymptoms(text: string): string[] {
  const symptoms: string[] = [];
  for (const { symptom, patterns } of SYMPTOM_PATTERNS) {
    if (patterns.some((p) => p.test(text)) && !symptoms.includes(symptom)) {
      symptoms.push(symptom);
    }
  }
  // unstable_braking subsumes both the braking-phase oversteer reading AND the
  // generic "nervous" (twitchy) reading of the same words — "nervous under
  // braking" is one behaviour, not two unrelated symptoms pulling retrieval apart.
  if (symptoms.includes("unstable_braking")) {
    return symptoms.filter((s) => s !== "oversteer" && s !== "twitchy");
  }
  return symptoms;
}

function detectPhases(text: string): string[] {
  return PHASE_PATTERNS.filter(({ patterns }) => patterns.some((p) => p.test(text))).map(
    (p) => p.phase,
  );
}

/** Split free text on coordinating conjunctions / punctuation into clauses and
 *  bind each clause's symptom(s) to that clause's OWN phase(s). Returns bound tags
 *  only when ≥2 clauses each carry a symptom (a genuine multi-symptom sentence);
 *  otherwise null so the caller falls back to the global reading. Without this,
 *  "loose on entry but pushes on exit" would cross-product to understeer@entry —
 *  the exact opposite of what the driver said. */
function parseClauseBound(text: string): FeedbackTag[] | null {
  const clauses = text
    .split(/\b(?:but|then|whereas|while|and)\b|[;,]/i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (clauses.length < 2) return null;
  const perClause = clauses.map((c) => ({ symptoms: detectSymptoms(c), phases: detectPhases(c) }));
  if (perClause.filter((c) => c.symptoms.length > 0).length < 2) return null;

  const tags: FeedbackTag[] = [];
  const seen = new Set<string>();
  const add = (symptom: string, phase?: string) => {
    const key = `${symptom}|${phase ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    tags.push(phase ? { symptom, phase } : { symptom });
  };
  for (const { symptoms, phases } of perClause) {
    for (const symptom of symptoms.slice(0, 2)) {
      if (phases.length === 0) add(symptom);
      else for (const phase of phases.slice(0, 2)) add(symptom, phase);
    }
  }
  return tags.length > 0 ? tags : null;
}

export function parseFeedback(text: string): NLUResult {
  const conditions = CONDITION_PATTERNS.filter(({ patterns }) =>
    patterns.some((p) => p.test(text)),
  ).map((c) => c.condition);

  const symptoms = detectSymptoms(text);

  // A genuine multi-symptom sentence ("X on entry but Y on exit") must bind each
  // symptom to its own clause's phase, never cross-product all symptoms × all phases.
  if (symptoms.length >= 2) {
    const bound = parseClauseBound(text);
    if (bound) return { tags: bound, conditions };
  }

  const phases = detectPhases(text);
  const tags: FeedbackTag[] = [];
  for (const symptom of symptoms.slice(0, 2)) {
    if (phases.length === 0) {
      tags.push({ symptom });
    } else {
      for (const phase of phases.slice(0, 2)) tags.push({ symptom, phase });
    }
  }

  return { tags, conditions };
}
