import { drivingTips } from "./driving-tips";
import { loadKBData } from "./node-kb";
import { buildReport } from "./report";
import { ruleToOption } from "./offline";
import type { ContextBundle, KBRule } from "./types";

/** Tests for the structured 8-part engineer report (D22) + driving tips (D23). */

const data = loadKBData();

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`✓ ${label}`);
  } else {
    failures++;
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function bundle(overrides: Partial<ContextBundle> = {}): ContextBundle {
  return {
    chassis_template_id: "kyosho-inferno-mp11",
    setup: { front_diff_oil: 8000, center_diff_oil: 5000, rear_diff_oil: 3000, front_sway_bar: 2.3, rear_sway_bar: 2.8 },
    track: { name: "Club Track", surface: "clay", grip: "green", conditions: ["low_grip", "dusty"] },
    feedback: { tags: [{ symptom: "understeer", phase: "mid_corner" }] },
    mode: "practice",
    ...overrides,
  };
}

// 1. Full report shape on a known-good scenario (push mid-corner, low grip)
{
  const r = buildReport(bundle(), data);
  check("kind is report", r.kind === "report", r.kind);
  check("diagnosis names the symptom and context", /understeer/.test(r.diagnosis) && /green grip clay/.test(r.diagnosis), r.diagnosis);
  check("primary change exists with citation", r.primary !== undefined && r.primary.citations.length > 0);
  check("secondary uses a DIFFERENT lever", r.secondary === undefined || r.secondary.setting !== r.primary!.setting);
  check("do_not_touch always closes with one-change-at-a-time", r.do_not_touch[r.do_not_touch.length - 1].includes("one change at a time"));
  check("expected behavior present", r.expected_behavior !== undefined && r.expected_behavior.length > 0);
  check("confidence mirrors the primary rule", r.confidence === r.primary!.confidence);
  check("rationale cites the rule id", r.primary!.citations.every((c) => r.rationale.includes(c)), r.rationale);
  check("rationale invites rating when no history", /rate this run/i.test(r.rationale), r.rationale);
}

// 2. History is surfaced in the rationale (the learning loop made visible)
{
  const r = buildReport(
    bundle({
      history: [
        { change: 'ran "Softer front"', conditions: "green grip clay", outcome: "better" },
        { change: 'ran "Q2 sheet"', conditions: "green grip clay", outcome: "worse" },
      ],
    }),
    data,
  );
  check("history counts surfaced", /1 run rated better, 1 worse, of 2 rated/.test(r.rationale), r.rationale);
}

// 3. Engine-scope question → hard refusal, no setup advice (D13)
{
  const r = buildReport(bundle({ question: "should I lean the HSN a bit?" }), data);
  check("needle question refused", r.kind === "refusal" && r.primary === undefined);
  check("refusal carries the canned message", (r.message ?? "").includes("out of my scope"));
}

// 4. Race day + unknown symptom → do_nothing protects the result
{
  const r = buildReport(
    bundle({ mode: "race_day", feedback: { tags: [{ symptom: "nosedive_jumps" }] } }),
    data,
  );
  check(
    "race day below the bar → do_nothing or high-confidence-only report",
    r.kind === "do_nothing" || (r.kind === "report" && r.confidence === "high"),
    r.kind,
  );
}

// 5. Driving tips — change-driven, condition-driven, tyre-driven (D23)
{
  const b = bundle({ tyres: { wear: "worn" }, track: { name: "T", surface: "carpet", grip: "high", conditions: ["high_grip"], evolution: "degrading" } });
  const tips = drivingTips(b);
  check("tips fire from conditions/tyres/evolution without a rule", tips.length > 0 && tips.length <= 3, String(tips.length));
  check("worn tyres tip present", tips.some((t) => t.includes("worn tyres")));

  const report = buildReport(bundle(), data);
  check("report includes driving tips", report.driving_tips.length > 0);
  check("tips capped at 3", report.driving_tips.length <= 3);
}

// 6. Determinism: same bundle → identical report (D18)
{
  const a = JSON.stringify(buildReport(bundle(), data));
  const b = JSON.stringify(buildReport(bundle(), data));
  check("report is deterministic", a === b);
}

// 7. R2-3 quantification plumbing — OPTIONAL KB fields surface when present,
//    fall back gracefully when absent.
{
  // The example-seeded rule kb-diff-rear-thinner-005 carries all three fields.
  const seeded = data.rules.find((r) => r.id === "kb-diff-rear-thinner-005") as KBRule;
  check("R2-3: example rule kb-diff-rear-thinner-005 exists", seeded !== undefined);
  check("R2-3: seeded rule carries mechanism_brief", typeof seeded.mechanism_brief === "string" && seeded.mechanism_brief.length > 0);
  check("R2-3: seeded rule carries lap_time_impact_s", typeof seeded.lap_time_impact_s === "number" && Number.isFinite(seeded.lap_time_impact_s));
  check("R2-3: seeded rule has an effect with magnitude_estimate", seeded.effects.some((e) => typeof e.magnitude_estimate === "string"));

  const optSeeded = ruleToOption(seeded, bundle());
  check(
    "R2-3: mechanism_brief leads the mechanism ('… This produces: …')",
    optSeeded.mechanism.startsWith(seeded.mechanism_brief!) && optSeeded.mechanism.includes("This produces:"),
    optSeeded.mechanism,
  );
  check(
    "R2-3: magnitude_estimate surfaces in the effects ([…])",
    optSeeded.expected_effect.includes("[noticeably more rear bite"),
    optSeeded.expected_effect,
  );

  // Fallback: a rule with NONE of the optional fields keeps the terse form.
  const bare = data.rules.find(
    (r) => r.mechanism_brief === undefined && r.lap_time_impact_s === undefined && r.effects.every((e) => e.magnitude_estimate === undefined),
  ) as KBRule;
  check("R2-3: at least one rule still has no optional fields (fallback path)", bare !== undefined);
  const optBare = ruleToOption(bare, bundle());
  check(
    "R2-3: bare rule mechanism falls back to terse 'Per <source>: …'",
    optBare.mechanism.startsWith("Per "),
    optBare.mechanism,
  );
  check(
    "R2-3: bare rule effects carry no '[' magnitude bracket",
    !optBare.expected_effect.includes("["),
    optBare.expected_effect,
  );

  // lap_time_impact_s surfaces in the report rationale when the rule is primary.
  // oversteer mid_corner on medium clay → kb-diff-rear-thinner-005 is in scope;
  // build a bundle where it actually becomes primary by addressing it directly.
  const oversteerReport = buildReport(
    bundle({
      setup: { rear_diff_oil: 4000 },
      track: { name: "T", surface: "clay", grip: "medium", conditions: [] },
      feedback: { tags: [{ symptom: "understeer", phase: "mid_corner" }] },
    }),
    data,
  );
  // Whatever the primary is, IF its cited rule carries lap_time_impact_s the
  // rationale must surface it; otherwise it must NOT invent one. Assert the
  // invariant holds for the actual primary rule chosen.
  if (oversteerReport.primary) {
    const cited = data.rules.find((r) => r.id === oversteerReport.primary!.citations[0])!;
    const surfaced = /s\/lap potential/.test(oversteerReport.rationale);
    check(
      "R2-3: lap_time_impact surfaces IFF the primary rule carries it",
      surfaced === (cited.lap_time_impact_s !== undefined),
      `surfaced=${surfaced} hasField=${cited.lap_time_impact_s !== undefined} | ${oversteerReport.rationale}`,
    );
    check("R2-3: rationale never renders NaN/Infinity for lap-time", !/NaN|Infinity/.test(oversteerReport.rationale), oversteerReport.rationale);
  }
}

// 8. R2-4 confidence calibration — high-confidence rule + thin/mixed/no YOUR-car
//    history reads as "high in theory, unproven on your car"; enum stays valid.
{
  // No history, high-confidence primary → "from the verified set-up science …".
  const noHist = buildReport(bundle(), data);
  check("R2-4: confidence enum still valid (high)", noHist.confidence === "high", String(noHist.confidence));
  check(
    "R2-4: no-history high-confidence → calibrated wording (verified science / no rated runs)",
    /verified set-up science/i.test(noHist.rationale) && /no rated runs on your car/i.test(noHist.rationale),
    noHist.rationale,
  );

  // Mixed history (1 better / 1 worse) on the primary → "mixed … treat as a test".
  const primaryId = noHist.primary!.citations[0];
  const mixed = buildReport(
    bundle({
      track: { track_id: "trk-1", name: "Club Track", surface: "clay", grip: "green", conditions: ["low_grip", "dusty"] },
      history: [
        { change: "x", conditions: "green grip clay", outcome: "worse", citations: [primaryId], track_id: "trk-1" },
        { change: "x", conditions: "green grip clay", outcome: "better", citations: [primaryId], track_id: "trk-1" },
      ],
    }),
    data,
  );
  check(
    "R2-4: mixed YOUR-car history tempers high confidence in WORDING",
    /your own runs are mixed/i.test(mixed.rationale) && mixed.confidence === "high",
    mixed.rationale,
  );

  // Thin history (1 'better' only) → "limited data on YOUR car … verify on track".
  const thin = buildReport(
    bundle({
      track: { track_id: "trk-1", name: "Club Track", surface: "clay", grip: "green", conditions: ["low_grip", "dusty"] },
      history: [{ change: "x", conditions: "green grip clay", outcome: "better", citations: [primaryId], track_id: "trk-1" }],
    }),
    data,
  );
  check(
    "R2-4: thin YOUR-car history → 'limited data on YOUR car' wording",
    /limited data on YOUR car/i.test(thin.rationale),
    thin.rationale,
  );
}

// 9. R3-1 ROI ranking — when two equally-grounded rules both carry
//    lap_time_impact_s, the higher-gain one becomes primary AND the rationale
//    says WHY ("highest estimated lap-time gain"). The locking eval scenario
//    (scenarios/15) covers the ordering; here we assert the rationale clause and
//    that a single-impact-rule report does NOT over-claim.
{
  // kb-diff-rear-thinner-005 (0.2) vs kb-diff-front-thinner-001 (0.1): tied on
  // history-tier + score, both rev=12, both high — impact decides. This mirrors
  // eval scenario 15.
  const roi = buildReport(
    bundle({
      setup: { front_diff_oil: 7000, rear_diff_oil: 4000 },
      track: { name: "Club Track", surface: "clay", grip: "medium", conditions: [] },
      feedback: {
        tags: [
          { symptom: "sluggish_steering", phase: "corner_entry" },
          { symptom: "oversteer", phase: "mid_corner" },
          { symptom: "understeer", phase: "corner_entry" },
        ],
      },
    }),
    data,
  );
  check("R3-1: ROI primary is the higher-gain rule (rear-thinner 0.2)", roi.primary?.citations[0] === "kb-diff-rear-thinner-005", roi.primary?.citations[0]);
  check(
    "R3-1: rationale states impact decided it ('highest estimated lap-time gain')",
    /highest estimated lap-time gain/i.test(roi.rationale) && /~0\.2s\/lap/.test(roi.rationale),
    roi.rationale,
  );

  // Single-impact-rule case: kb-diff-rear-thinner-005 is primary but no tied
  // rival carries impact → it must NOT claim it was chosen FOR the gain; it shows
  // the softer "estimated upside" line instead.
  const single = buildReport(
    bundle({
      setup: { rear_diff_oil: 4000 },
      track: { name: "T", surface: "clay", grip: "medium", conditions: [] },
      feedback: { tags: [{ symptom: "understeer", phase: "mid_corner" }] },
    }),
    data,
  );
  if (single.primary?.citations[0] === "kb-diff-rear-thinner-005") {
    check(
      "R3-1: lone impact rule does NOT over-claim 'chosen because highest gain'",
      !/highest estimated lap-time gain/i.test(single.rationale) && /estimated upside/i.test(single.rationale),
      single.rationale,
    );
  }
  check("R3-1: rationale never renders NaN/Infinity", !/NaN|Infinity/.test(roi.rationale) && !/NaN|Infinity/.test(single.rationale));
}

// 10. R3-2 root-cause diagnosis — diagnosis explains the likely ROOT CAUSE, not
//     just echoes the symptom. Grounded/universal chassis dynamics, deterministic.
{
  const understeerEntry = buildReport(
    bundle({ feedback: { tags: [{ symptom: "understeer", phase: "corner_entry" }] } }),
    data,
  );
  check(
    "R3-2: understeer-on-entry diagnosis names the root cause (front not biting / weight to front)",
    /isn't biting|front.*grip|weight.*front/i.test(understeerEntry.diagnosis),
    understeerEntry.diagnosis,
  );

  const oversteerExit = buildReport(
    bundle({ feedback: { tags: [{ symptom: "oversteer", phase: "corner_exit" }] } }),
    data,
  );
  check(
    "R3-2: oversteer-on-exit diagnosis names the root cause (rear losing grip / too much power)",
    /rear.*grip|rear.*let go|too much.*power|rear steps/i.test(oversteerExit.diagnosis),
    oversteerExit.diagnosis,
  );

  const bouncy = buildReport(
    bundle({ feedback: { tags: [{ symptom: "bouncy" }] } }),
    data,
  );
  check(
    "R3-2: bouncing diagnosis names the root cause (damping / suspension not absorbing)",
    /damp|absorb|spring|rebound/i.test(bouncy.diagnosis),
    bouncy.diagnosis,
  );

  // The root-cause clause must NOT break determinism or emit NaN.
  const d1 = buildReport(bundle({ feedback: { tags: [{ symptom: "understeer", phase: "corner_entry" }] } }), data);
  const d2 = buildReport(bundle({ feedback: { tags: [{ symptom: "understeer", phase: "corner_entry" }] } }), data);
  check("R3-2: diagnosis is deterministic", d1.diagnosis === d2.diagnosis);
  check("R3-2: diagnosis is NaN-free", !/NaN|Infinity|undefined|\[object Object\]/.test(understeerEntry.diagnosis));

  // No-symptom baseline must NOT fabricate a root cause.
  const noSym = buildReport(bundle({ feedback: { tags: [] } }), data);
  check("R3-2: no symptom → no fabricated root cause", /No symptom reported/.test(noSym.diagnosis), noSym.diagnosis);
}

// 11. R4-2 multi/conflicting-symptom diagnosis — the diagnosis SYNTHESIZES the
//     combined picture (a balance problem across the corner), names which end the
//     engineer attacks first and WHY, and summarizes non-conflicting multi as a
//     dominant theme. Grounded/universal, pure, deterministic, NaN-free.
{
  // Conflicting: understeer-entry + oversteer-exit → balance problem, entry first.
  const conflict = buildReport(
    bundle({
      feedback: {
        tags: [
          { symptom: "understeer", phase: "corner_entry" },
          { symptom: "oversteer", phase: "corner_exit" },
        ],
      },
    }),
    data,
  );
  check(
    "R4-2: conflicting understeer+oversteer reads as a balance problem across the corner",
    /balance problem across the corner/i.test(conflict.diagnosis),
    conflict.diagnosis,
  );
  check(
    "R4-2: conflict diagnosis prioritizes the EARLIER phase first (understeer/entry) and says why",
    /fixes the understeer first/i.test(conflict.diagnosis) && /brake in before you power out/i.test(conflict.diagnosis),
    conflict.diagnosis,
  );

  // Reversed phases: understeer-exit + oversteer-entry → oversteer (entry) first.
  const reversed = buildReport(
    bundle({
      feedback: {
        tags: [
          { symptom: "understeer", phase: "corner_exit" },
          { symptom: "oversteer", phase: "corner_entry" },
        ],
      },
    }),
    data,
  );
  check(
    "R4-2: when oversteer is the earlier phase, IT is fixed first (phase-ordered, not list-ordered)",
    /fixes the oversteer first/i.test(reversed.diagnosis),
    reversed.diagnosis,
  );

  // Conflicting steering-response pair: twitchy + sluggish.
  const steer = buildReport(
    bundle({
      feedback: {
        tags: [
          { symptom: "twitchy", phase: "high_speed" },
          { symptom: "sluggish_steering", phase: "corner_entry" },
        ],
      },
    }),
    data,
  );
  check(
    "R4-2: twitchy+sluggish reads as a steering-response balance problem",
    /steering-response balance problem/i.test(steer.diagnosis),
    steer.diagnosis,
  );

  // Non-conflicting multi → dominant theme + one-change-at-a-time discipline.
  const multi = buildReport(
    bundle({
      feedback: {
        tags: [
          { symptom: "understeer", phase: "mid_corner" },
          { symptom: "poor_bump_handling", phase: "rough_section" },
        ],
      },
    }),
    data,
  );
  check(
    "R4-2: non-conflicting multi summarizes the dominant theme + one lever at a time",
    /dominant thread/i.test(multi.diagnosis) && /one lever at a time/i.test(multi.diagnosis),
    multi.diagnosis,
  );

  // Single symptom must STILL get the R3-2 lead root cause, not the synthesis.
  const single = buildReport(
    bundle({ feedback: { tags: [{ symptom: "understeer", phase: "corner_entry" }] } }),
    data,
  );
  check(
    "R4-2: single symptom keeps the R3-2 root cause (no multi-synthesis leakage)",
    !/balance problem across the corner/i.test(single.diagnosis) && /isn't biting|weight.*front/i.test(single.diagnosis),
    single.diagnosis,
  );

  // Determinism + NaN-free for the synthesis path.
  const m1 = buildReport(bundle({ feedback: { tags: [{ symptom: "understeer", phase: "corner_entry" }, { symptom: "oversteer", phase: "corner_exit" }] } }), data);
  const m2 = buildReport(bundle({ feedback: { tags: [{ symptom: "understeer", phase: "corner_entry" }, { symptom: "oversteer", phase: "corner_exit" }] } }), data);
  check("R4-2: multi-symptom diagnosis is deterministic", m1.diagnosis === m2.diagnosis);
  check("R4-2: multi-symptom diagnosis NaN-free", !/NaN|Infinity|undefined|\[object Object\]/.test(conflict.diagnosis));
}

// 12. R4-3 plain-language headline — present on every verdict, matches the call,
//     NaN-free. Built from primary change + confidence + (when present) gain.
{
  // Report verdict: headline names the primary action + confidence, no NaN.
  const rep = buildReport(bundle(), data);
  check("R4-3: report carries a non-empty headline", typeof rep.headline === "string" && rep.headline!.trim().length > 0, String(rep.headline));
  check(
    "R4-3: headline confidence matches the report verdict's confidence",
    rep.headline!.toLowerCase().includes(`${rep.confidence} confidence`),
    rep.headline,
  );
  check(
    "R4-3: headline names the primary lever (setting words appear)",
    rep.primary!.setting.split("_").every((w) => rep.headline!.toLowerCase().includes(w)),
    `${rep.headline} | setting=${rep.primary!.setting}`,
  );
  check("R4-3: headline is NaN/undefined-free", !/NaN|Infinity|undefined|\[object Object\]/.test(rep.headline!), rep.headline);

  // ROI report (primary carries lap_time_impact_s) → gain surfaces in headline.
  const roi = buildReport(
    bundle({
      setup: { front_diff_oil: 7000, rear_diff_oil: 4000 },
      track: { name: "Club Track", surface: "clay", grip: "medium", conditions: [] },
      feedback: {
        tags: [
          { symptom: "sluggish_steering", phase: "corner_entry" },
          { symptom: "oversteer", phase: "mid_corner" },
          { symptom: "understeer", phase: "corner_entry" },
        ],
      },
    }),
    data,
  );
  if (roi.primary?.citations[0] === "kb-diff-rear-thinner-005") {
    check(
      "R4-3: when the primary carries lap-time impact, the headline surfaces ~Ns/lap",
      /s\/lap on the table/.test(roi.headline!) && /~0\.2s\/lap/.test(roi.headline!),
      roi.headline,
    );
  }

  // Refusal verdict (engine scope) → headline summarizes "keep your setup", no advice.
  const refusal = buildReport(bundle({ question: "should I lean the HSN a bit?" }), data);
  check("R4-3: refusal carries a headline", typeof refusal.headline === "string" && refusal.headline!.trim().length > 0, String(refusal.headline));
  check(
    "R4-3: refusal headline says keep your current setup (no fabricated change)",
    /keep your current setup/i.test(refusal.headline!),
    refusal.headline,
  );

  // Do-nothing verdict (race day below the bar) → headline says keep setup + log a run.
  const doNothing = buildReport(
    bundle({ mode: "race_day", feedback: { tags: [{ symptom: "nosedive_jumps" }] } }),
    data,
  );
  if (doNothing.kind === "do_nothing") {
    check(
      "R4-3: do-nothing headline says keep setup + log another run",
      /keep your current setup/i.test(doNothing.headline!) && /log another run/i.test(doNothing.headline!),
      doNothing.headline,
    );
  }

  // Headline determinism.
  const h1 = buildReport(bundle(), data).headline;
  const h2 = buildReport(bundle(), data).headline;
  check("R4-3: headline is deterministic", h1 === h2);
}

// 13. R6-1 driving-tips actionability — the symptom tips are SPECIFIC and
//     BEHAVIORAL per symptom + corner phase, capped at 3, deterministic, NaN-free,
//     universal technique (no KB citation), and tempered by scarce-grip conditions.
{
  // understeer-on-entry → the brake-earlier/finish-before-turn-in/no-trail-brake tip.
  const usEntry = drivingTips(bundle({ track: { name: "T", surface: "clay", grip: "medium", conditions: [] }, feedback: { tags: [{ symptom: "understeer", phase: "corner_entry" }] } }));
  check(
    "R6-1: understeer-entry tip is behavioral + phase-specific (brake earlier, before turn-in, no trail-braking)",
    usEntry.some((t) => /brake a touch earlier/i.test(t) && /before you turn in/i.test(t) && /trail-brak/i.test(t)),
    usEntry.join(" | "),
  );

  // oversteer-on-exit → the feed-don't-stab-the-throttle tip.
  const osExit = drivingTips(bundle({ track: { name: "T", surface: "clay", grip: "medium", conditions: [] }, feedback: { tags: [{ symptom: "oversteer", phase: "corner_exit" }] } }));
  check(
    "R6-1: oversteer-exit tip is behavioral (feed the throttle progressively, squeeze not stab)",
    osExit.some((t) => /feed the throttle in progressively/i.test(t) && /squeezing instead of stabbing/i.test(t) && /rear planted/i.test(t)),
    osExit.join(" | "),
  );

  // The SAME symptom at a different phase yields a DIFFERENT tip (phase-specific,
  // not one generic understeer line).
  const usMid = drivingTips(bundle({ track: { name: "T", surface: "clay", grip: "medium", conditions: [] }, feedback: { tags: [{ symptom: "understeer", phase: "mid_corner" }] } }));
  check(
    "R6-1: tip differs by corner phase (entry vs mid understeer are not identical)",
    usEntry[0] !== usMid[0] && /Mid-corner understeer/i.test(usMid[0]),
    `${usEntry[0]}\n   vs ${usMid[0]}`,
  );

  // Scarce-grip conditions temper the leading behavioral tip with a conservative coda.
  const wet = drivingTips(bundle({ track: { name: "T", surface: "clay", grip: "green", conditions: ["wet"] }, feedback: { tags: [{ symptom: "oversteer", phase: "corner_exit" }] } }));
  check("R6-1: wet conditions append a conservative coda to the behavioral tip", wet.some((t) => /wet surface, dial all of this back further/i.test(t)), wet.join(" | "));
  const lowGrip = drivingTips(bundle({ track: { name: "T", surface: "clay", grip: "green", conditions: ["low_grip"] }, feedback: { tags: [{ symptom: "understeer", phase: "corner_entry" }] } }));
  check("R6-1: low-grip conditions append a 'leave more margin' coda", lowGrip.some((t) => /low-grip surface, leave a bit more margin/i.test(t)), lowGrip.join(" | "));

  // Capped at 3 even when many triggers fire at once.
  const loaded = drivingTips(
    bundle({
      tyres: { wear: "worn" },
      track: { name: "T", surface: "clay", grip: "green", conditions: ["low_grip", "wet", "bumpy"], evolution: "degrading" },
      feedback: { tags: [{ symptom: "understeer", phase: "corner_entry" }, { symptom: "oversteer", phase: "corner_exit" }] },
    }),
  );
  check("R6-1: tips stay capped at 3 under many simultaneous triggers", loaded.length <= 3, String(loaded.length));

  // Deterministic + NaN-free.
  const t1 = drivingTips(bundle({ feedback: { tags: [{ symptom: "understeer", phase: "corner_entry" }] } }));
  const t2 = drivingTips(bundle({ feedback: { tags: [{ symptom: "understeer", phase: "corner_entry" }] } }));
  check("R6-1: driving tips are deterministic", JSON.stringify(t1) === JSON.stringify(t2));
  check("R6-1: driving tips are NaN/undefined-free", [...usEntry, ...osExit, ...usMid, ...wet, ...lowGrip, ...loaded].every((t) => !/NaN|Infinity|undefined|\[object Object\]/.test(t)));
}

// 14. R6-2 secondary-change "why #2 + when" — the secondary option's
//     `if_it_does_not_help` reads as the FALLBACK ("only if the primary doesn't
//     fully fix it") and names WHY it's a DIFFERENT lever (stacks, not fights).
//     The primary's own field stays the generic line. Grounded/pure/NaN-free.
{
  // A scenario that yields BOTH a primary and a secondary on different levers.
  const r = buildReport(bundle(), data);
  if (r.secondary) {
    check(
      "R6-2: secondary says try it ONLY IF the primary doesn't fully fix it",
      /try this only if the primary/i.test(r.secondary.if_it_does_not_help) && r.secondary.if_it_does_not_help.includes(humanize(r.primary!.setting)),
      r.secondary.if_it_does_not_help,
    );
    check(
      "R6-2: secondary explains it works a DIFFERENT lever that STACKS rather than fights",
      /different lever/i.test(r.secondary.if_it_does_not_help) && /stacks with the first change rather than fighting it/i.test(r.secondary.if_it_does_not_help),
      r.secondary.if_it_does_not_help,
    );
    check(
      "R6-2: secondary framing names BOTH lever families (vs)",
      / vs /.test(r.secondary.if_it_does_not_help),
      r.secondary.if_it_does_not_help,
    );
    check(
      "R6-2: the PRIMARY option keeps the generic 'if it does not help' line (not the secondary framing)",
      !/try this only if the primary/i.test(r.primary!.if_it_does_not_help),
      r.primary!.if_it_does_not_help,
    );
    check("R6-2: secondary framing is NaN/undefined-free", !/NaN|Infinity|undefined|\[object Object\]/.test(r.secondary.if_it_does_not_help), r.secondary.if_it_does_not_help);
    // Determinism of the secondary framing.
    const r2 = buildReport(bundle(), data);
    check("R6-2: secondary framing is deterministic", r2.secondary?.if_it_does_not_help === r.secondary.if_it_does_not_help);
  } else {
    check("R6-2: base scenario produced a secondary to frame", false, "no secondary on the base bundle");
  }
}

function humanize(id: string): string {
  return id.replace(/_/g, " ");
}

if (failures > 0) {
  console.error(`\n${failures} report test(s) failed`);
  process.exit(1);
}
console.log("\nAll report tests passed");
