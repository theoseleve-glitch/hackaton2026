# lap-schemas

Single source of truth for LAP data contracts. Pydantic v2 source → OpenAPI 3.1 → TypeScript / Swift / Kotlin codegen.

## Layout

```
python/        # Pydantic v2 source. The ONE place schema is defined.
typescript/    # openapi-typescript wrapper → generated/schema.d.ts. Consumed by lap-webapp.
swift/         # openapi-generator (swift5) → Generated/Models/*.swift. Consumed by lap-mobile.
kotlin/        # openapi-generator (kotlin)  → src/main/kotlin/com/lap/schemas/generated/*.kt. Consumed by lap-mobile-android.
Makefile       # Regeneration entrypoints (openapi, swift-codegen).
.githooks/     # Opt-in post-commit warning when Pydantic models change.
```

Generated artifacts (`openapi.json`, `generated/`, `Generated/`, `com/lap/schemas/generated/`) are **gitignored** — they are rebuilt on demand and in CI. Only the Pydantic source and the codegen tooling are committed.

## Prerequisites

- Python 3.12 + `uv`
- Node ≥ 18 + `npm`
- Java 17+ (for the OpenAPI Generator CLI used by Swift and Kotlin)

## Regen workflow

Every Pydantic change requires a full regen of the OpenAPI spec and each downstream target language.

```bash
# 1. Regenerate the OpenAPI 3.1 document from Pydantic models.
make openapi
# equivalent:  (cd python && uv run python -m lap_schemas.generate_openapi openapi.json)

# 2. Regenerate TypeScript types.
(cd typescript && npm install && npm run generate:ts)
# produces typescript/generated/schema.d.ts

# 3. Regenerate Swift types (writes into the sibling lap-mobile repo).
make swift-codegen
# produces ../lap-mobile/Generated/Models/*.swift

# 4. Regenerate Kotlin types.
(cd kotlin && npm install && npm run generate:kotlin)
# produces kotlin/src/main/kotlin/com/lap/schemas/generated/*.kt
```

Running any step without an up-to-date `openapi.json` will use the stale spec. When in doubt, re-run step 1 first.

## Pydantic workflow

```bash
cd python
uv sync --all-groups       # install the package + dev tools
uv run pytest -q           # run the model contract tests
```

Edit a model under `python/src/lap_schemas/v1/` and add tests in `python/tests/`. Every model in the codebase is covered by at least three behavioural tests (happy path, minimal/alternate form, rejection of an invalid value). Keep that discipline.

## Consuming the package

- Python: `pip install -e lap-schemas/python` (or in a `uv` workspace, add the local path source). Imports live at `lap_schemas.v1.*`.
- TypeScript: `@lap/schemas` is a private npm workspace. Consumers import from the package root (`exports["."] → generated/schema.d.ts`).
- Swift: point a Swift package or Xcode target at `../lap-mobile/Generated/` once regenerated.
- Kotlin: the module is already wired as a Gradle `:schemas` project via `include(":schemas")` + `projectDir` override in the Android repo's `settings.gradle.kts`.

## Post-commit drift reminder (opt-in)

A `post-commit` hook in `.githooks/` warns when a commit touches `python/src/lap_schemas/v1/`. Enable it once per clone:

```bash
git config core.hooksPath .githooks
```

The hook is advisory — it never blocks a commit. It just prints the regen commands so you don't push stale bindings.

## CI enforcement

`.github/workflows/schema-sync.yml` runs the `schema-sync-check` job on every push and PR:

1. Regenerates `openapi.json` from the current Pydantic source.
2. Regenerates TypeScript, Swift, and Kotlin bindings end-to-end.
3. Fails if any step errors out.

A breaking Pydantic change that can't cleanly codegen to all three targets therefore fails CI before it reaches consumers.

## Versioning

Calver: `YYYY.MM.N`. Full policy — what counts as breaking, when `vN` bumps, consumer migration — lives in [`VERSIONING.md`](VERSIONING.md).

## ADRs

- **ADR-004** — Schema registry design.
- **ADR-005** — Seven canonical backend objects (field shapes).
- **ADR-006** — `SessionManifest` + `SessionRecord` shape.
- **ADR-007** — Dual-timestamp `TelemetrySample`.

## Status

Seeded 2026-04-23. Scaffold comes from backend sprint tasks T021–T055.
