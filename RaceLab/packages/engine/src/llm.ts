import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { ContextBundle, KBRule } from "./types.js";

const MODEL = process.env.RACELAB_MODEL ?? "claude-opus-4-8";

const OptionSchema = z.object({
  setting: z.string(),
  change: z.string(),
  mechanism: z.string(),
  expected_effect: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  citations: z.array(z.string()),
  revert: z.string(),
  if_it_does_not_help: z.string(),
});

const EngineerOutputSchema = z.object({
  decision: z.enum(["recommend", "do_nothing", "refuse_out_of_kb"]),
  primary: OptionSchema.nullable(),
  alternatives: z.array(OptionSchema),
  reason: z.string().nullable(),
});

export type EngineerOutput = z.infer<typeof EngineerOutputSchema>;

const SYSTEM = `You are RaceLab's race engineer for 1/8 offroad RC cars. You advise on CHASSIS tuning only.

HARD RULES — violating any of these makes the answer worthless:
1. You may ONLY justify a change using the retrieved knowledge-base rules provided in the user message. Every option's "citations" array must contain ONLY ids of those retrieved rules. If none of them address the problem, set decision to "refuse_out_of_kb".
2. Exactly ONE primary change (real race engineers isolate variables) and at most 2 alternatives, each touching a DIFFERENT setting.
3. The "setting" field of each option must be the canonical setting id exactly as it appears in the retrieved rule you cite.
4. In race_day mode propose only high-confidence, fast-reversible changes; when nothing qualifies, set decision to "do_nothing" — saying "stick with what you have" is what good race engineers do.
5. Never advise on engine internals (needles, plugs, mixture, temperatures) — that is out of scope.
6. Echo the track/weather conditions in your "mechanism" texts so the advice is visibly specific to today's conditions.
7. Propose concrete values when the current setup provides them (e.g. "7000 → 5000 cSt"), one step at a time per the rule's magnitude guidance.
8. Use the driver's reported history: do not re-propose a change rated "worse" in similar conditions; prefer directions previously rated "better".`;

export async function llmRecommend(
  bundle: ContextBundle,
  retrieved: KBRule[],
): Promise<EngineerOutput> {
  const client = new Anthropic();

  const userMessage = [
    "## Context bundle",
    "```json",
    JSON.stringify(bundle, null, 2),
    "```",
    "",
    "## Retrieved KB rules (the ONLY citable sources)",
    "```json",
    JSON.stringify(retrieved, null, 2),
    "```",
    "",
    "Produce the recommendation.",
  ].join("\n");

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: SYSTEM,
    messages: [{ role: "user", content: userMessage }],
    output_config: { format: zodOutputFormat(EngineerOutputSchema) },
  });

  const parsed = response.parsed_output;
  if (!parsed) throw new Error("LLM returned no parseable structured output");
  return parsed;
}
