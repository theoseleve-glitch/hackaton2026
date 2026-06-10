import { createInterface } from "node:readline/promises";
import { readFileSync } from "node:fs";
import { RaceEngineerChat } from "./chat";
import { loadKBData } from "./node-kb";
import type { ContextBundle } from "./types";

const file = process.argv.slice(2).find((a) => !a.startsWith("--"));

const defaultBundle: ContextBundle = {
  chassis_template_id: "kyosho-inferno-mp11",
  setup: {
    front_diff_oil: 8000,
    center_diff_oil: 5000,
    rear_diff_oil: 3000,
    front_sway_bar: 2.3,
    rear_sway_bar: 2.8,
    rear_toe: 3,
    front_camber: -1,
    rear_camber: -2,
  },
  track: { name: "Club Track", surface: "clay", grip: "medium", conditions: [] },
  feedback: { tags: [] },
  mode: "practice",
};

const bundle: ContextBundle = file
  ? (JSON.parse(readFileSync(file, "utf8")).bundle as ContextBundle)
  : defaultBundle;

const chat = new RaceEngineerChat(bundle, loadKBData());
for (const line of chat.greeting()) console.log(line);

const rl = createInterface({ input: process.stdin, output: process.stdout });
process.stdout.write("\nyou> ");
for await (const input of rl) {
  if (/^(quit|exit|q)$/i.test(input.trim())) break;
  const echo = process.stdin.isTTY ? "" : `${input}\n`;
  if (echo) process.stdout.write(echo);
  for (const line of chat.handle(input)) console.log(line);
  process.stdout.write("\nyou> ");
}
rl.close();
