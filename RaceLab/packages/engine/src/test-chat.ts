import { RaceEngineerChat } from "./chat.js";
import type { ContextBundle } from "./types.js";

/** Scripted conversation test for the deterministic chatbot (D18). */

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
  const chat = new RaceEngineerChat(freshBundle());
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
  const chat = new RaceEngineerChat(freshBundle());
  const r1 = chat.handle("the car is loose");
  expect("asks WHEN when phase missing", r1, /When does it do that\?/);
  const r2 = chat.handle("on power out of corners");
  expect("recommends after phase given", r2, /Try ONE change/);
}

// 3. Engine-scope refusal (D13)
{
  const chat = new RaceEngineerChat(freshBundle());
  const r = chat.handle("should I lean the HSN? engine keeps flaming out");
  expect("nitro needle question refused", r, /🚫.*Engine tuning/s);
}

// 4. Race-day mode filters to fast-reversible
{
  const chat = new RaceEngineerChat(freshBundle());
  chat.handle("race day");
  const r = chat.handle("no forward bite out of corners");
  expect("race-day still answers (fast-reversible exists)", r, /Try ONE change|stick with what you have/i);
}

// 5. Unparseable input → re-prompt, not nonsense
{
  const chat = new RaceEngineerChat(freshBundle());
  const r = chat.handle("the vibes are off");
  expect("unknown symptom → asks again", r, /couldn't pin the symptom/);
}

// 6. New problem mid-outcome is handled
{
  const chat = new RaceEngineerChat(freshBundle());
  chat.handle("pushes mid corner");
  const r = chat.handle("actually now it bounces through the braking bumps");
  expect("new problem interrupts outcome loop", r, /Try ONE change/);
}

console.log(failures === 0 ? "\nCHAT: all conversation tests passed" : `\nCHAT: ${failures} failures`);
if (failures > 0) process.exit(1);
