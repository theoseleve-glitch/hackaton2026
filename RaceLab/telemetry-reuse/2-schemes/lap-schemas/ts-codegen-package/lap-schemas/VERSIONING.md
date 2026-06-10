# lap-schemas versioning

Per T055. Defines how `lap-schemas` is versioned, when each component bumps, and what breaking means in a schema registry.

## Scheme: `YYYY.MM.N` (calver)

```
2026.04.3
│    │  └── release counter within the month
│    └───── two-digit month (zero-padded: 01–12)
└────────── four-digit year
```

- `YYYY` — four-digit year.
- `MM`   — two-digit month, `01`–`12`.
- `N`    — monotonically increasing counter within that month. Starts at `1` on the first release of the month and resets on the month rollover.

Examples: `2026.04.1`, `2026.04.2`, `2026.05.1`.

Calver is chosen because `lap-schemas` is an internal contract package — consumers pin by range (e.g. `>=2026.04`) and we care about "how stale is this?" more than we care about semver-style promises. The calendar is a better answer to that question than integers.

## When each component bumps

| Change | `YYYY.MM` | `N` | Package namespace (`vN`) |
|---|---|---|---|
| Pre-release patch | month rolls | `+1` | unchanged |
| Additive field (new optional field, new enum value) | month rolls | `+1` | unchanged |
| Additive model (new Pydantic class) | month rolls | `+1` | unchanged |
| Rename, removal, or type narrowing | ❌ forbidden at current `vN` | — | `vN → vN+1` |
| Nothing meaningful changed (docs, CI, codegen config) | does **not** trigger a release | — | unchanged |

## What counts as "breaking"

A change is breaking iff at least one of the following is true for an existing consumer reading the new wire format:

1. A previously required field is removed or renamed.
2. A field's type narrows (e.g., `str → Literal["a", "b"]`, `list[Foo] → tuple[Foo, Bar]`).
3. A field's allowed value set shrinks (e.g., an enum member is removed).
4. A bound tightens on a previously valid value (e.g., `ge=0, le=100` → `ge=0, le=10` when some recorded values were in `(10, 100]`).
5. An existing optional field becomes required.

Additive changes — new optional fields, new enum members, new models, loosening bounds — are **not** breaking.

## Breaking-change procedure

Breaking changes do not bump `YYYY.MM.N`. They introduce a **new package namespace**:

```
python/src/lap_schemas/
    v1/        # current models — frozen post-launch
    v2/        # new models with the breaking changes
```

Rules:

1. The old namespace (`v1/`) stays untouched. Consumers on `v1` keep working.
2. The new namespace (`v2/`) ships the changed models. It is a parallel file tree, not a diff.
3. Codegen emits both under their own paths:
   - TS: `generated/v1/schema.d.ts`, `generated/v2/schema.d.ts`
   - Swift: `Generated/v1/Models/`, `Generated/v2/Models/`
   - Kotlin: `com.lap.schemas.generated.v1.*`, `com.lap.schemas.generated.v2.*`
4. An ADR documents the rationale for the `vN → vN+1` bump — what broke, why, migration path.
5. `v1` is frozen but not deleted until every consumer repo has migrated off it. Deletion happens in a later release with its own ADR.

This means the `YYYY.MM.N` number keeps rolling during the transition — `v2` may ship in `2026.07.1` while `v1` is still the default in `2026.06.3`. The namespace, not the version, is what tells a consumer "the contract changed."

## Pre-release convention (current state)

Until the first real release, `python/pyproject.toml` holds `version = "0.0.1"`. This is a deliberate pre-release marker — it means "calver hasn't started yet, consumers should only depend via a local path, not a version range." The first tagged release flips the version to `YYYY.MM.1` matching the release date.

## Tagging

Releases are tagged at the repo root:

```
v2026.04.1        # marks the first release of April 2026
v2026.04.2
v2026.05.1
```

Each tag points at the exact `pyproject.toml` version it publishes. The tag is the source of truth; reviewers can always run `git show v2026.04.2:python/pyproject.toml` to see what was released.

## Consumer guidance

- **Python backend (`lap-backend`)** — depend via local path source (`[tool.uv.sources] lap-schemas = { path = "...", editable = true }`). No version pinning until the package publishes to a real registry.
- **TypeScript (`lap-webapp`)** — depend on `@lap/schemas` via workspace (`"@lap/schemas": "workspace:*"`). Regen after schema changes.
- **Swift (`lap-mobile`)** — output lands directly in `lap-mobile/Generated/` via `make swift-codegen`. Commit the generated files into the mobile repo if they need to ship offline; otherwise rerun the Makefile in CI.
- **Kotlin (`lap-mobile-android`)** — the `:schemas` Gradle module lives in `lap-schemas/kotlin/` and is included via `projectDir` override. Run `npm run generate:kotlin` before Android builds if the schema changed.

## See also

- `README.md` — overview and regen workflow.
- `.github/workflows/schema-sync.yml` — CI gate that prevents shipping unbuildable schemas.
- `.githooks/post-commit` — advisory reminder when you change Pydantic without regenerating.
