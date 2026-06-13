import { RaceEngineerChat, type OutcomeEvent } from "./chat";
import { loadKBData } from "./node-kb";
import type { ContextBundle } from "./types";

/** Scripted conversation test for the deterministic chatbot (D18). */

const data = loadKBData();

function freshBundle(): ContextBundle {
  return {
    chassis_template_id: "kyosho-inferno-mp11",
    setup: { front_diff_oil: 8000, center_diff_oil: 5000, rear_diff_oil: 3000, front_sway_bar: 2.3, rear_sway_bar: 2.8, rear_toe: 3 },
    track: { name: "Club Track", surface: "clay", grip: "green", conditions: ["low_grip", "dusty"] },
    feedback: { tags: [] },
    mode: "practice",
  };
}

let failures = 0;
function expect(label: string, lines: string[], pattern: RegExp): void {
  const text = lines.join("\n");
  if (pattern.test(text)) {
    console.log(`✓ ${label}`);
  } else {
    failures++;
    console.log(`✗ ${label}\n    expected ${pattern}\n    got: ${text.replace(/\n/g, " | ")}`);
  }
}

// 1. Full happy path: complaint with phase → one change → worse → revert + next → better
{
  const chat = new RaceEngineerChat(freshBundle(), data);
  expect("greets with session context", chat.greeting(), /green grip clay/);
  const r1 = chat.handle("it pushes mid-corner everywhere");
  expect("one change proposed with citation", r1, /Try ONE change[\s\S]*source: kb-/);
  expect("asks for outcome", r1, /better \/ same \/ worse/);
  const r2 = chat.handle("worse");
  expect("worse → revert + next option", r2, /Revert[\s\S]*Next on my list/);
  const r3 = chat.handle("better");
  expect("better → keep + note on sheet", r3, /Keep it/);
}

// 2. Missing phase → clarifying question → phase answer → recommendation
{
  const chat = new RaceEngineerChat(freshBundle(), data);
  const r1 = chat.handle("the car is loose");
  expect("asks WHEN when phase missing", r1, /When does it do that\?/);
  const r2 = chat.handle("on power out of corners");
  expect("recommends after phase given", r2, /Try ONE change/);
}

// 3. Engine-scope refusal (D13)
{
  const chat = new RaceEngineerChat(freshBundle(), data);
  const r = chat.handle("should I lean the HSN? engine keeps flaming out");
  expect("nitro needle question refused", r, /🚫.*Engine tuning/s);
}

// 4. Race-day mode filters to fast-reversible
{
  const chat = new RaceEngineerChat(freshBundle(), data);
  chat.handle("race day");
  const r = chat.handle("no forward bite out of corners");
  expect("race-day still answers (fast-reversible exists)", r, /Try ONE change|stick with what you have/i);
}

// 5. Unparseable input → re-prompt, not nonsense
{
  const chat = new RaceEngineerChat(freshBundle(), data);
  const r = chat.handle("the vibes are off");
  expect("unknown symptom → asks again", r, /couldn't pin the symptom/);
}

// 6. New problem mid-outcome is handled
{
  const chat = new RaceEngineerChat(freshBundle(), data);
  chat.handle("pushes mid corner");
  const r = chat.handle("actually now it bounces through the braking bumps");
  expect("new problem interrupts outcome loop", r, /Try ONE change/);
}

// 7. Outcome hook fires on better/worse with the current option, never for new problems
{
  const events: OutcomeEvent[] = [];
  const chat = new RaceEngineerChat(freshBundle(), data, {
    onOutcome: (e) => events.push(e),
  });
  chat.handle("it pushes mid-corner everywhere");
  chat.handle("worse");
  chat.handle("better");
  if (events.length === 2) {
    console.log("✓ outcome hook fired twice for worse → better");
  } else {
    failures++;
    console.log(`✗ outcome hook fired twice for worse → better\n    expected 2 events, got ${events.length}`);
  }
  if (events[0]?.outcome === "worse" && typeof events[0]?.option?.setting === "string" && events[0].option.setting.length > 0) {
    console.log("✓ first event is worse with option.setting defined");
  } else {
    failures++;
    console.log(`✗ first event is worse with option.setting defined\n    got: ${JSON.stringify(events[0])}`);
  }
  if (events[1]?.outcome === "better") {
    console.log("✓ second event is better");
  } else {
    failures++;
    console.log(`✗ second event is better\n    got: ${JSON.stringify(events[1])}`);
  }
  // a plain new-problem message must NOT fire the hook — neither as a fresh
  // complaint nor as a new-problem interrupt mid-outcome
  const before = events.length;
  chat.handle("it pushes mid-corner everywhere"); // fresh complaint → recommendation
  chat.handle("actually now it bounces through the braking bumps"); // interrupt while awaiting outcome
  if (events.length === before) {
    console.log("✓ no event for plain new-problem messages");
  } else {
    failures++;
    console.log(`✗ no event for plain new-problem messages\n    expected ${before} events, got ${events.length}`);
  }
}

// 8. Trial-time version attribution: outcome carries the base version the
//    recommendation was presented against, even if the setup is updated
//    (saved/loaded) between trial and rating.
{
  const events: OutcomeEvent[] = [];
  const bundle = { ...freshBundle(), setup_version_id: "sv-trial-base" };
  const chat = new RaceEngineerChat(bundle, data, { onOutcome: (e) => events.push(e) });
  chat.handle("it pushes mid-corner everywhere"); // recommendation presented
  chat.updateSetup({ ...bundle.setup, front_sway_bar: 2.2 }, "sv-after-save"); // driver saved mid-loop
  chat.handle("better");
  if (events[0]?.setup_version_id === "sv-trial-base") {
    console.log("✓ outcome attributes to the TRIAL-time version, not the rating-time one");
  } else {
    failures++;
    console.log(`✗ outcome attributes to the TRIAL-time version\n    got: ${events[0]?.setup_version_id}`);
  }
  // next recommendation after the save attributes to the new base
  chat.handle("still pushes mid corner");
  chat.handle("worse");
  if (events[1]?.setup_version_id === "sv-after-save") {
    console.log("✓ next recommendation attributes to the refreshed base version");
  } else {
    failures++;
    console.log(`✗ next recommendation attributes to the refreshed base\n    got: ${events[1]?.setup_version_id}`);
  }
}

// 9. updateTrack mid-conversation preserves the pending recommendation
{
  const events: OutcomeEvent[] = [];
  const chat = new RaceEngineerChat(freshBundle(), data, { onOutcome: (e) => events.push(e) });
  chat.handle("it pushes mid-corner everywhere"); // pending recommendation
  const ack = chat.updateTrack({ name: "Club Track", surface: "clay", grip: "blue_groove", conditions: ["high_grip", "blue_groove"] });
  expect("updateTrack acknowledges new conditions", ack, /Conditions updated.*blue.?groove/i);
  const r = chat.handle("better");
  expect("pending recommendation survives updateTrack", r, /Keep it/);
  if (events.length === 1 && events[0].option !== null) {
    console.log("✓ outcome hook still fires after updateTrack");
  } else {
    failures++;
    console.log(`✗ outcome hook still fires after updateTrack\n    got ${events.length} events`);
  }
}

// ── Multi-change plan protocol (ranked plan, applied ONE at a time) ──────────

// 10. Plan presented numbered; outcome loop walks it one change at a time;
//     OutcomeEvents carry plan metadata; "next" continues after a "better".
{
  const events: OutcomeEvent[] = [];
  const chat = new RaceEngineerChat(freshBundle(), data, { onOutcome: (e) => events.push(e) });
  const r1 = chat.handle("it pushes mid-corner everywhere");
  expect("plan presented as a numbered ranked list", r1, /Plan: 3 grounded changes[\s\S]*1\.[\s\S]*2\.[\s\S]*3\./);
  expect("plan applies one change at a time", r1, /ONE at a time/);
  expect("first change tagged with plan position", r1, /Try ONE change.*\(change 1 of 3\)/);
  const r2 = chat.handle("worse");
  expect("worse → revert + offer plan change #2", r2, /Revert[\s\S]*Next on my list.*\(change 2 of 3\)/);
  const r3 = chat.handle("better");
  expect("better mid-plan → keep + offer to continue or stop", r3, /Keep it[\s\S]*change 2 of 3[\s\S]*stop here[\s\S]*"next"/);
  const r4 = chat.handle("next");
  expect('"next" continues the plan with change #3', r4, /Next on my list.*\(change 3 of 3\)/);
  const r5 = chat.handle("same");
  expect("plan exhausted after #3 rated same", r5, /Revert it[\s\S]*whole list/);
  if (
    events.length === 3 &&
    events[0].outcome === "worse" && events[0].plan_position === 1 && events[0].plan_size === 3 &&
    events[1].outcome === "better" && events[1].plan_position === 2 && events[1].plan_size === 3 &&
    events[2].outcome === "same" && events[2].plan_position === 3 && events[2].plan_size === 3
  ) {
    console.log("✓ outcome events carry plan_position/plan_size through the whole walk");
  } else {
    failures++;
    console.log(`✗ outcome events carry plan_position/plan_size\n    got: ${JSON.stringify(events.map((e) => ({ o: e.outcome, p: e.plan_position, n: e.plan_size })))}`);
  }
}

// 11. "next" without a pending plan is handled, never nonsense
{
  const chat = new RaceEngineerChat(freshBundle(), data);
  const r = chat.handle("next");
  expect('"next" with no plan → helpful re-prompt', r, /No plan pending/);
  chat.handle("it pushes mid-corner everywhere"); // plan presented, awaiting outcome
  const r2 = chat.handle("next");
  expect('"next" while awaiting outcome → asks for the rating first', r2, /Rate the current change first/);
}

// 12. Single-rule symptom stays the degenerate 1-change plan (no plan header)
{
  const chat = new RaceEngineerChat(freshBundle(), data);
  const r = chat.handle("it nosedives off the jumps");
  expect("single-change plan has no plan header", r, /^(?![\s\S]*Plan: \d)[\s\S]*Try ONE change/);
  expect("single-change plan has no position tag", r, /Try ONE change:(?! \(change)/);
}

// 13. History read half in the card text: a past 'worse' at THIS track is
//     surfaced with a deterministic note; another track's history never bleeds.
{
  const bundle = freshBundle();
  bundle.track.track_id = "trk-here";
  bundle.history = [
    {
      change: "wing_angle: steeper",
      conditions: "grip green, dusty",
      outcome: "worse",
      citations: ["kb-wing-steeper-307"],
      track_id: "trk-here",
    },
  ];
  const chat = new RaceEngineerChat(bundle, data);
  const r = chat.handle("it nosedives off the jumps");
  expect("past-worse change carries a history note in the card", r, /📒 history: Rated worse here last time/);
}
{
  const bundle = freshBundle();
  bundle.track.track_id = "trk-here";
  bundle.history = [
    {
      change: "front_sway_bar: softer",
      conditions: "grip high",
      outcome: "worse",
      citations: ["kb-swaybar-front-softer-301"],
      track_id: "trk-somewhere-else",
    },
  ];
  const chat = new RaceEngineerChat(bundle, data);
  const r = chat.handle("it pushes mid-corner everywhere");
  expect("other-track history does not demote (sway bar stays #1)", r, /Try ONE change[\s\S]*source: kb-swaybar-front-softer-301/);
  expect("other-track history shows no note", r, /^(?![\s\S]*📒)/);
}

console.log(failures === 0 ? "\nCHAT: all conversation tests passed" : `\nCHAT: ${failures} failures`);
if (failures > 0) process.exit(1);
