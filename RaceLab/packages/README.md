# RaceLab packages

## `kb/` — Tuning Knowledge Base (data only)

The AI race engineer's brain (docs/04 §3). Pure data, reviewed by William, ships inside the app bundle for the offline path (D13).

- `taxonomy.yaml` — feedback-tag taxonomy (symptom × phase × evolution), condition vocabulary, and the engine-scope refusal keywords/text (D13)
- `rules/*.yaml` — **63 cause→effect tuning rules**, every one sourced from the HUDY Off-Road Set-Up Book (page-cited) with effects, conditions, counter-indications, magnitude guidance, reversal cost and confidence
- `chassis/inferno-mp11.json` — machine-readable MP11 template (canonical setting ids + legal values); **the template IS the guard layer's bounds database**

Adding a rule = adding YAML; the engine validates every rule against the taxonomy at load time (unknown symptom/condition = hard error).

## `engine/` — Race Engineer chatbot (deterministic, no API — D18)

TypeScript implementation of the docs/04 §4 pipeline. **Zero external dependencies at advice time**: no LLM, no API key, no server — it runs entirely on-device.

```
driver text → deterministic NLU (nlu.ts: pit-lane vocabulary → symptom × phase
tags + condition hints) → engine-scope refusal (D13) → dialogue state machine
(chat.ts: asks the one clarifying question, runs the better/same/worse loop)
→ pure-function KB retrieval (retrieval.ts) → race-day filter (guard.ts)
→ templated card rendered from the rule itself (offline.ts)
```

### Run it

```sh
cd packages/engine
npm install
npm run chat                # interactive chatbot REPL (talk to your race engineer)
npm run chat -- scenarios/01-push-mid-corner-low-grip.json   # with that session context
npm run cli -- scenarios/01-push-mid-corner-low-grip.json    # one-shot card
npm test                    # NLU cases + scripted conversations + 10 eval scenarios
```

### Status

- ✅ **NLU 19/19** pit-lane phrasings parsed ("loose under braking" ≠ "loose on power")
- ✅ **Conversation tests green**: clarifying question, outcome loop (worse → revert + next), race-day mode, engine-question refusal, new-problem interrupt
- ✅ **Eval 10/10** (8 real scenarios + 2 nitro-engine traps)
- ✅ Citations valid by construction — the card IS the retrieved rule, rendered
- 🗃 An LLM-backed variant existed and was removed per D18 (git `d8a8b81`) — possible V2 premium prose layer, never a dependency
- ⏳ Next (Gate A): run the same scenarios against So Dialed's AI Mechanic and compare
