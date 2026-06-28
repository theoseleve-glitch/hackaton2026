import { parseFeedback } from "./nlu";

interface Case {
  text: string;
  symptom: string;
  phase?: string;
  conditions?: string[];
}

const CASES: Case[] = [
  { text: "it pushes mid-corner everywhere", symptom: "understeer", phase: "mid_corner" },
  { text: "the car won't turn in", symptom: "understeer", phase: "corner_entry" },
  { text: "front just washes out through the sweeper", symptom: "understeer" },
  { text: "loose on power out of the infield", symptom: "oversteer", phase: "on_power" },
  { text: "rear steps out when I get on the throttle", symptom: "oversteer", phase: "on_power" },
  { text: "it fishtails out of the corner", symptom: "oversteer", phase: "corner_exit" },
  { text: "rear swaps side to side under braking", symptom: "unstable_braking", phase: "braking" },
  { text: "car is loose when braking for the hairpin", symptom: "unstable_braking" },
  { text: "it pogos through the braking bumps", symptom: "bouncy", phase: "rough_section" },
  { text: "chassis slaps on the big double landing", symptom: "bottoming", phase: "jumps" },
  { text: "I traction rolled twice in the sweeper", symptom: "traction_roll" },
  { text: "spinning up the tires out of every corner", symptom: "no_forward_bite", phase: "corner_exit" },
  { text: "can't put the power down", symptom: "no_forward_bite" },
  { text: "it nose dives off the triple", symptom: "nosedive_jumps", phase: "jumps" },
  { text: "steering feels lazy", symptom: "sluggish_steering" },
  { text: "the car is twitchy at high speed on the straight", symptom: "twitchy", phase: "high_speed" },
  { text: "it kicks sideways over the rough section", symptom: "poor_bump_handling", phase: "rough_section" },
  { text: "track is dusty and slippery and the car pushes", symptom: "understeer", conditions: ["dusty", "low_grip"] },
  { text: "blue groove came in and now it traction rolls", symptom: "traction_roll", conditions: ["blue_groove"] },
  // ── hardening guards (engine-hardening sweep) ───────────────────────────────
  // gerund / past forms of "steps out" (was unrecognized → false refusal)
  { text: "rear's stepping out on exit", symptom: "oversteer", phase: "corner_exit" },
  { text: "the back stepped out mid corner", symptom: "oversteer", phase: "mid_corner" },
  // dropped-g colloquialisms for "pushing" (was unrecognized → false refusal)
  { text: "car's pushin' like a pig mid-corner", symptom: "understeer", phase: "mid_corner" },
  { text: "it's just pushin everywhere", symptom: "understeer" },
  // rotation vocabulary (was unrecognized → false refusal)
  { text: "car won't rotate in the hairpin", symptom: "understeer", phase: "low_speed" },
  { text: "not enough rotation through the infield", symptom: "understeer" },
  // rear traction loss is a SYMPTOM, not a low_grip TRACK read ("no grip" must not
  // map to the low_grip condition any more)
  { text: "rear has no grip on power", symptom: "no_forward_bite", phase: "on_power", conditions: [] },
  { text: "no rear bite coming out of the slow stuff", symptom: "no_forward_bite" },
];

// Multi-symptom clause binding: each symptom must bind to its OWN clause's phase,
// never cross-product. "loose on entry but pushes on exit" must NOT assert
// understeer@corner_entry (the opposite of what the driver said).
{
  const { tags } = parseFeedback("loose on entry but pushes on exit");
  const has = (s: string, p: string) => tags.some((t) => t.symptom === s && t.phase === p);
  const bad = has("understeer", "corner_entry") || has("oversteer", "corner_exit");
  const good = has("oversteer", "corner_entry") && has("understeer", "corner_exit");
  if (bad || !good) {
    console.log(`✗ clause-binding: 'loose on entry but pushes on exit' → ${JSON.stringify(tags)}`);
    process.exit(1);
  }
  // the INVERSE complaint must produce the INVERSE tags (not a byte-identical set)
  const inv = parseFeedback("pushes on entry but loose on exit").tags;
  const invGood = inv.some((t) => t.symptom === "understeer" && t.phase === "corner_entry") &&
    inv.some((t) => t.symptom === "oversteer" && t.phase === "corner_exit");
  if (!invGood) {
    console.log(`✗ clause-binding inverse: 'pushes on entry but loose on exit' → ${JSON.stringify(inv)}`);
    process.exit(1);
  }
}

let passed = 0;
const failures: string[] = [];

for (const c of CASES) {
  const { tags, conditions } = parseFeedback(c.text);
  const problems: string[] = [];
  if (!tags.some((t) => t.symptom === c.symptom)) {
    problems.push(`expected symptom ${c.symptom}, got [${tags.map((t) => t.symptom).join(", ") || "none"}]`);
  }
  if (c.phase && !tags.some((t) => t.phase === c.phase)) {
    problems.push(`expected phase ${c.phase}, got [${tags.map((t) => t.phase).join(", ")}]`);
  }
  for (const cond of c.conditions ?? []) {
    if (!conditions.includes(cond)) problems.push(`expected condition ${cond}, got [${conditions.join(", ")}]`);
  }
  if (problems.length === 0) {
    passed++;
  } else {
    failures.push(`✗ "${c.text}": ${problems.join("; ")}`);
  }
}

console.log(`NLU: ${passed}/${CASES.length} cases passed`);
for (const f of failures) console.log(`  ${f}`);
if (failures.length > 0) process.exit(1);
