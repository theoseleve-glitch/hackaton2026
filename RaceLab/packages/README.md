# RaceLab packages

## `kb/` — Tuning Knowledge Base (data only)

The AI race engineer's brain (docs/04 §3). Pure data, reviewed by William, ships inside the app bundle for the offline path (D13).

- `taxonomy.yaml` — feedback-tag taxonomy (symptom × phase × evolution), condition vocabulary, and the engine-scope refusal keywords/text (D13)
- `rules/*.yaml` — **63 cause→effect tuning rules**, every one sourced from the HUDY Off-Road Set-Up Book (page-cited) with effects, conditions, counter-indications, magnitude guidance, reversal cost and confidence
- `chassis/inferno-mp11.json` — machine-readable MP11 template (canonical setting ids + legal values); **the template IS the guard layer's bounds database**

Adding a rule = adding YAML; the engine validates every rule against the taxonomy at load time (unknown symptom/condition = hard error).

## `engine/` — AI Race Engineer (Gate A prototype)

TypeScript implementation of the docs/04 §4 pipeline:

```
bundle → engine-scope refusal check → deterministic retrieval (pure function,
no vector store) → race-day filter → OFFLINE templated card  |  ONLINE Claude
(structured output, cites only retrieved rules) → post-LLM guard → contract output
```

### Run it

```sh
cd packages/engine
npm install
npm run eval                # 10 scenarios, offline deterministic path (no API key needed)
npm run eval:online         # same scenarios through Claude (needs ANTHROPIC_API_KEY)
npm run cli -- scenarios/01-push-mid-corner-low-grip.json [--online]
```

### Status

- ✅ Offline path: **10/10 eval scenarios pass** (8 real + 2 engine-scope traps)
- ✅ Guards: citation validity, template-known settings, ≤1 primary + ≤2 alternatives, distinct settings, race-day confidence/reversal bar, engine-question refusal
- ⏳ Online path implemented (`claude-opus-4-8`, structured output via `messages.parse` + zod) but not yet exercised — needs an `ANTHROPIC_API_KEY`; on any guard violation it falls back to the offline card
- ⏳ Next (Gate A): run the same scenarios against So Dialed's AI Mechanic + vanilla ChatGPT and compare (docs/04 §8)
