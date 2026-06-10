# CLAUDE.md — lap-schemas

## Context
Schema registry. All data contracts. One source (Pydantic) → many consumers (TS, Swift, Kotlin).

## Conventions
- Pydantic v2 only. No Pydantic v1 BaseModel.
- One file per domain concept (session.py, driver.py, coaching.py, etc.).
- Every field typed strictly. `Optional[T]` or `T | None`, not implicit.
- UUIDv7 for IDs (use `uuid6.uuid7()` in Python; strings in generated TS/Swift/Kotlin).
- Datetime fields always UTC, RFC3339 format.
- `model_config = ConfigDict(frozen=True, extra='forbid')` on all models unless justified.

## Forbidden
- Schema changes without regen of TS/Swift/Kotlin.
- Pydantic models with raw `dict` fields (lose type safety).
- Breaking changes without version bump.
- Circular imports (use TYPE_CHECKING guards).

## /loop rules
- This repo is mostly populated by lap-backend sprint tasks T021-T055.
- No standalone sprint file. If a /loop is pointed here, it should pull tasks from sprint-backend.md that touch `lap-schemas/`.
