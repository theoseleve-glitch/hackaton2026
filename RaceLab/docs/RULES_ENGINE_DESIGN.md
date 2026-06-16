# Model-aware rules engine — design

*Phase 2 of the world-map work (D48). How the deterministic engineer gives advice precise to the
**category AND the exact model**, never suggesting a part the car doesn't have.*

---

## v2 — post-review corrections (2 adversarial reviewers, both corroborated)

The v1 draft below oversold "what already works." Two independent reviews (scope + technical) verified against
the code and found the model-precision would silently degrade to category-precision for 236/237 cars. **The
build order of operations, before authoring ANY rules:**

1. **Bundle + resolve category templates (CRITICAL).** `node-kb.ts` reads `chassis/*.json` non-recursively, so
   the 16 `chassis/categories/*.json` are NOT in the bundle, and `engineer.ts:23` refuses on an unknown
   `template_id`. Fix: load category templates into a separate `categoryTemplates` map (keyed by `template_id`),
   and add registry→template resolution (`chassis_id → full template, else its `category_template``) that
   retains the model identity. Validate every registry `category_template` link. *Without this, model-gating is vapor.*
2. **ONE scope vocabulary + validator (CRITICAL).** Three non-intersecting dialects exist: rules/MP11 use
   hyphenated `1-8-offroad`; category templates use slash `1/8_offroad_nitro`; v1 invented a third.
   `retrieval.ts:36` is exact-string intersection → zero rules fire for every category. Fix: canonical
   hyphenated `scopes:` in `taxonomy.yaml`, rewrite the 16 category templates' `scope`, add a validator that
   every rule/template scope tag ∈ the declared set (today a typo ships silently and just never fires).
3. **Draft-staging by SUBDIRECTORY, not a flag (HIGH/D18 risk).** `RuleSchema` (zod) strips unknown keys, so a
   `status: draft` flag is a silent no-op and the rule ships live. Fix: authored drafts live in
   `kb/rules/drafts/` which the non-recursive loader already skips — make that explicit + add a test asserting
   the live loader ignores it. This is the actual D18 safety net.
4. **DROP the `option_catalogs` / `requires_options` gate this phase (CRITICAL data gap).** `option_catalogs`
   exists nowhere in the KB. Gate purely on **field existence** (`templateExposes`): precise for `full`
   templates, class-level for pending. True per-model option precision arrives **as we extract per-model
   manuals** (William's Layer-2 ask) — the mechanism is ready, the data fills in over time.
5. **`templateExposes` must be alias/derived-aware and tested on a CATEGORY fixture** (not just MP11, where
   alias keys happen to be literal fields). Exposed iff: concrete `fields` key present, OR an `alias`/`derived`
   whose `of[]` targets are all present. Pure boolean (determinism).
6. **Hard-exclusion gates are NEW machinery, not "just tags":** add `forbidden_on: string[]` (a rule that is
   *wrong* on a surface must be excluded, not merely de-weighted — `reduced_on` only subtracts 2 and a strong
   symptom match survives) and `legal_in_power: string[]` (don't recommend an illegal mod to a spec entrant).
   Both need a `continue` in `retrieval.ts`, a `ContextBundle.power` field, the power-tag mapping (built+tested),
   and matching **zod** fields in `RuleSchema` (or they're silently stripped like the draft flag).
7. **Author per parameter-family with contradiction detection**, NOT a 21-symptom × N-category × surface × power
   cross-product (generates contradictory junk; `offline.ts` dedupes by setting, not direction). Add a
   build check: no two rules sharing `scope ∩ symptom` may have opposing `direction` on the same `setting`
   without disjoint conditions. Plus a citation cross-check: every `sources[]` entry resolves to a `sources.json` id.
8. **Eval additions come AFTER 1–2:** a pending_pdf model returning category-filtered advice; a rule dropped
   because the model lacks the part; a `forbidden_on`/`legal_in_power` exclusion; the alias cases.

Honest surface area: **one new filter + ~4 schema/type fields + 2 hard-exclusion gates + a registry-resolution
step + a scope-vocabulary migration + a draft-staging mechanism** — then the authoring fan-out. The v1 text
below is kept for context but is superseded by this section wherever they disagree.

---

---

## 1. What already exists (and works)

The current engine (1/8-buggy KB, 68 rules, MP11 template) already implements two of the five gating axes:

- **Category gating** — `retrieval.ts:36`: `if (!rule.scope.some(s => template.scope.includes(s))) continue;`
  A rule fires only if its `scope` class-tag intersects the resolved template's `scope`. Today every rule is
  `scope: [1-8-offroad]` and the MP11 template carries that tag.
- **Condition gating** — each rule's `conditions.amplified_on / reduced_on` reference taxonomy tags
  (`low_grip`, `bumpy`, `wet`, `hot`, `cold`…). The weather pack (D40/D43) proved this: tags re-rank and
  amplify/refuse rules per run context. **Surface and power sub-class are just more tags.**

Rule shape today (YAML → bundle): `id, setting, direction, effects[], addresses[{symptom,phase}],
conditions{amplified_on,reduced_on}, counter_indications[], magnitude_guidance, reversal_cost_minutes,
confidence, sources[], scope[]`.

## 2. The one new mechanism — model-capability gating

**Problem:** two cars in one category don't expose the same adjustable parts. A rule may target
`front_sway_bar`, but a given model has no sway bars — recommending it is wrong. Scope alone can't catch
this (both cars are the same category).

**Solution — a setting-existence filter in `retrieval.ts`, right after the scope filter:**

```
// model-capability filter: the car must actually expose the part this rule changes
if (!templateExposes(template, rule.setting)) continue;
```

`templateExposes(template, setting)` = the rule's `setting` (resolving aliases/derived, e.g.
`ride_height → front/rear_ride_height`, `shock_pistons → front/rear_shock_piston`) is present in the
**resolved capability set** of the model:

- **`full` model** (e.g. MP11): capability set = the template's `fields` keys **+** any `option_catalogs`
  it ships → the precise, real per-model part list. This is where "reset his mind per model" bites hardest.
- **`pending_pdf` model** (the other 236): capability set = its `category_template`'s `fields` keys → the
  class-typical part list. Coarser, but class-correct and never claims a part the category doesn't have.

**Optional explicit gate** for parts that are genuinely *optional* within a class (not in the base field
set) or *class-illegal*: a rule may carry `requires_options: [option_class_id]` (from the ontology's 17
option classes) and/or `legal_in_power: [modified]`. The engine drops the rule unless the model's option
catalog lists that option class (and the run's power sub-class permits it — e.g. boost/turbo timing is
illegal in `stock_blinky`). For the common case the setting-existence filter alone suffices.

**Net effect:** symptom match → scope (category) → **capability (model)** → conditions (surface/power/
weather) → rank → one-change-at-a-time. A B6.4 and an RC8B4.1 with the same "understeer mid-corner"
complaint get genuinely different change-lists, because the candidate pool is filtered to each car's parts.

## 3. Taxonomy additions (tags, not new machinery)

Add to `taxonomy.yaml` (`conditions:` list — pure vocab, validated, no code change):

- **Surface:** `clay`, `loose_dirt`, `astroturf`, `carpet`, `asphalt`, `indoor`, `outdoor`
  (existing `low_grip/high_grip/blue_groove/dusty/wet/bumpy/smooth` stay and compose).
- **Power sub-class:** `stock_blinky`, `modified_power`, `spec_locked`, `nitro_power`, `gas_power`.

Add **scope class-tags** (one per class the rules cover), declared on each category template's `scope`:
`1-8-offroad`, `1-8-truggy`, `1-8-gt`, `1-10-2wd-offroad`, `1-10-4wd-offroad`, `1-10-stadium`,
`1-10-shortcourse`, `1-10-touring`, `1-10-nitro-onroad`. (Pan/F1/large-scale/crawler get tags only when
their grounding tier allows rules — see §4.)

The run context → tags mapping (surface/power) is built from the car's `power_type` + class rules + the
track/run's surface field, mirroring how weather → hot/cold/wet already works (`schema conditionsToTags`).

## 4. Grounding discipline (D18 stays intact)

Rules are authored **only** for categories with real, page-citable sources (`WORLD_MAP.md §5 / sources.json`):

- **Tier A — author now** (free citable PDFs: AE RC Cheat Sheets, HUDY, XRAY, TLR, Mugen): 1/8 off-road
  buggy + truggy, 1/10 2WD/4WD off-road, stadium truck, short course, 1/10 electric touring, 1/8 GT &
  1/10 nitro on-road.
- **Tier B — refuse until a book is acquired:** 1/12 pan, 1/10 F1 (single-source).
- **Tier C — refuse:** 1/5 large scale, crawler (no citable authority).

Every authored rule cites a real page/source. Authored rules land as **drafts** (a `rules/` subtree or a
`status: draft` flag, NOT bundled) until William verifies the citations — exactly how the category
templates and the weather citations are staged. The live deterministic engine never ships an unverified rule.

## 5. Authoring plan (the "huge file")

Agent fan-out, **one agent per Tier-A category**, each producing a YAML rule set in the existing shape,
grounded to that category's sources, covering the 21 symptoms × the category's available parameters, with
correct `scope`, `conditions` (surface/power), `sources`, and `requires_options` where a part is optional.
A second adversarial pass (refute-by-default, like the wet-pack 3/3 review) culls any rule whose source or
mechanism doesn't hold. Then: bundle behind the draft flag, extend eval with category/model/option-gated
scenarios, green gate, ship.

## 6. Open product-scope calls for William (do NOT block Tier-A)

- **Oval** (dirt + paved): a whole asymmetric weight/stagger/wedge engine. Grounded (Murfdogg + AE cheat
  sheets cover it) but a large, distinct paradigm. Build it, or stay symmetric-track only?
- **Drift** (judged not timed), **Mini-Z** (new scale), **M-chassis**, **USVTA vintage**: add as classes?
- **Book acquisitions** to unlock Tier-B pan/F1 grounding (Dave B Stevens guides).

---

*Inputs: `WORLD_MAP.md`, `docs/research/world-map/{sources,ontology}.json`. Touch points:
`engine/src/retrieval.ts` (add capability filter), `engine/src/types.ts` (`requires_options?`,
`legal_in_power?`), `kb/taxonomy.yaml` (tags), `kb/chassis/categories/*.json` (`scope` tags),
`kb/rules/<category>/*.yaml` (the authored rules).*
