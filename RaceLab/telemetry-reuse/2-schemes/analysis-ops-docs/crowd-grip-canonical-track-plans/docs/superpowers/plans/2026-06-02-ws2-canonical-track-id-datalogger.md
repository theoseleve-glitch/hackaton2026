# WS2 — CanonicalTrackId hardening (datalogger) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add type-safety and append-only enforcement on top of the *already-working* canonical-track resolver + drift ledger in `datalogger/backend`, without changing the wire contract or breaking the existing bare-UUID call sites.

**Architecture:** The canonical registry (`0002`), session canonical FKs (`0003`), drift ledger (`0004`), and a deterministic VALIDATION-mode resolver (`app/resolver.py`) already exist and are wired through the bundle-ingest path. This plan adds: (1) a `CanonicalTrackId` value object — a `uuid.UUID` *subclass* so equality/hashing/binding stay transparent, but a distinct type at boundaries; (2) an opt-in SQLAlchemy `TypeDecorator` applied to `Session.canonical_track_id` only; (3) a DB-level append-only trigger on `canonical_drifts`; (4) a real invariant meta-test; (5) cleanup of dead code. No PostGIS/h3, no scheduler change, no frontend dependency, **not on the launch path**.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0 async, Pydantic v2 (`pydantic_core`), asyncpg, PostgreSQL 16 (alpine — plpgsql only, no extensions), Alembic, pytest + pytest-asyncio. DB-backed tests are gated by `TEST_DATABASE_URL`.

**Why these choices (read before starting):**
- A `uuid.UUID` subclass (not `NewType`, not a wrapping `BaseModel`) keeps `CanonicalTrackId(x) == uuid.UUID(x)` true and lets SQLAlchemy joins / `on_conflict` / asyncpg binding work unchanged — the prior failure modes were value-layer, not type-checker.
- `__get_pydantic_core_schema__` wraps pydantic's built-in uuid schema, so OpenAPI stays byte-identical (`type: string, format: uuid`) → **no `@lap/schemas` TS regen**.
- **Opt-in** decorator (Session.canonical_track_id only). Do NOT retrofit `Track.canonical_id`, `TrackAlias`, or the ingest path in this window — that touches ~6 bare-UUID call sites and risks regressions.
- The plan's original `grep track_uuid` meta-test is struck: **no repo ever had that column.** The meaningful invariant is determinism + no-silent-overwrite + append-only, tested below.

---

## File Structure

- **Create** `app/types.py` — `CanonicalTrackId` value object + `CanonicalTrackIdType` TypeDecorator. Standalone (no `app.*` imports) to avoid cycles.
- **Create** `app/ddl.py` — the append-only trigger SQL as shared constants (imported by both the migration and the test, so they can't drift).
- **Create** `alembic/versions/0005_drift_ledger_append_only.py` — chains off `0004_drift_tracking`; emits the trigger.
- **Create** `tests/test_canonical_track_id.py` — no-DB unit tests for the value object + TypeDecorator.
- **Create** `tests/test_drift_ledger_invariants.py` — DB-gated invariant meta-test (determinism, drift symmetry, append-only).
- **Modify** `app/models.py:95-97` — apply `CanonicalTrackIdType()` to `Session.canonical_track_id`.
- **Modify** `app/schemas.py:160,212` — type `canonical_track_id` as `CanonicalTrackId | None` in `SessionSummary` + `SessionDetail`.
- **Modify** `app/resolver.py:17,51-55` — remove the dead `lru_cache` import + misleading caching docstring.
- **Modify** `scripts/backfill_resolver.py:9,19` — fix the docstring/code drift (claims to clear resolved drifts; it doesn't) + remove unused `update`/`func` imports.

> All commits include the repo's `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer (shown once below; repeat on every commit).

---

### Task 1: `CanonicalTrackId` value object

**Files:**
- Create: `app/types.py`
- Test: `tests/test_canonical_track_id.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_canonical_track_id.py
"""Unit tests for CanonicalTrackId — no DB needed."""
from __future__ import annotations

import uuid

import pytest
from pydantic import BaseModel

from app.types import CanonicalTrackId


def test_is_uuid_subclass_with_value_equality():
    raw = uuid.uuid4()
    cid = CanonicalTrackId(raw)
    assert isinstance(cid, uuid.UUID)
    assert cid == raw                 # value equality both directions
    assert raw == cid
    assert hash(cid) == hash(raw)     # usable as dict key / set member interchangeably
    assert str(cid) == str(raw)


def test_constructs_from_str_and_uuid():
    raw = uuid.uuid4()
    assert CanonicalTrackId(str(raw)) == raw
    assert CanonicalTrackId(raw) == raw


def test_is_immutable():
    cid = CanonicalTrackId(uuid.uuid4())
    with pytest.raises(Exception):     # uuid.UUID raises TypeError on attribute set
        cid.int = 0  # type: ignore[misc]


class _M(BaseModel):
    id: CanonicalTrackId | None = None


def test_pydantic_validates_str_and_uuid_and_coerces_type():
    raw = uuid.uuid4()
    assert isinstance(_M(id=str(raw)).id, CanonicalTrackId)
    assert isinstance(_M(id=raw).id, CanonicalTrackId)
    assert _M(id=None).id is None


def test_pydantic_serializes_to_str():
    raw = uuid.uuid4()
    assert _M(id=raw).model_dump(mode="json")["id"] == str(raw)


def test_openapi_contract_is_byte_identical_string_uuid():
    # The whole point: emitted JSON schema must stay string/uuid so @lap/schemas
    # TypeScript needs no regeneration.
    schema = _M.model_json_schema()
    id_schema = schema["properties"]["id"]
    # anyOf[string(uuid), null] for the Optional field
    variants = id_schema.get("anyOf", [id_schema])
    str_variant = next(v for v in variants if v.get("type") == "string")
    assert str_variant["format"] == "uuid"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_canonical_track_id.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.types'`

- [ ] **Step 3: Write minimal implementation**

```python
# app/types.py
"""Typed value object for canonical track identifiers.

`CanonicalTrackId` is a `uuid.UUID` SUBCLASS so value equality, hashing and
SQLAlchemy/asyncpg binding work transparently with the existing bare-UUID
`tracks.canonical_id` column — but it is a *distinct type*, so a canonical
TRACK id can't be silently passed where a car id or an arbitrary UUID is
expected at a typed boundary.

Pydantic v2: `__get_pydantic_core_schema__` wraps the built-in uuid schema, so
the emitted OpenAPI is byte-identical (`type: string, format: uuid`) and the
generated @lap/schemas TypeScript needs NO regeneration.
"""
from __future__ import annotations

import uuid
from typing import Any

from pydantic import GetCoreSchemaHandler
from pydantic_core import core_schema
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.types import TypeDecorator


class CanonicalTrackId(uuid.UUID):
    __slots__ = ()

    def __init__(self, value: uuid.UUID | str) -> None:
        if isinstance(value, uuid.UUID):
            super().__init__(int=value.int)   # uuid.UUID.__init__ uses object.__setattr__
        else:
            super().__init__(hex=str(value))

    @classmethod
    def __get_pydantic_core_schema__(
        cls, source: Any, handler: GetCoreSchemaHandler
    ) -> core_schema.CoreSchema:
        # Reuse pydantic's uuid schema (validates str|UUID, serializes to str,
        # JSON schema = string/uuid) then coerce the result into our subclass.
        return core_schema.no_info_after_validator_function(cls._coerce, handler(uuid.UUID))

    @classmethod
    def _coerce(cls, value: uuid.UUID) -> CanonicalTrackId:
        return value if isinstance(value, cls) else cls(value)


class CanonicalTrackIdType(TypeDecorator):
    """Maps CanonicalTrackId <-> Postgres uuid. OPT-IN: applied only to
    Session.canonical_track_id, never retrofitted onto every FK at once."""

    impl = PG_UUID(as_uuid=True)
    cache_ok = True

    def process_bind_param(self, value: Any, dialect: Any) -> uuid.UUID | None:
        if value is None:
            return None
        # Normalize CanonicalTrackId/str to a plain uuid.UUID for asyncpg binding.
        return value if type(value) is uuid.UUID else uuid.UUID(str(value))

    def process_result_value(self, value: Any, dialect: Any) -> CanonicalTrackId | None:
        return None if value is None else CanonicalTrackId(value)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_canonical_track_id.py -v`
Expected: PASS (6 tests).
If `test_openapi_contract...` fails, the likely cause is the pydantic version handling `handler(uuid.UUID)` differently — inspect `_M.model_json_schema()` and adjust the assertion to the actual (still string/uuid) shape; do NOT switch to `no_info_plain_validator_function`, which loses the uuid JSON-schema.

- [ ] **Step 5: Commit**

```bash
git add app/types.py tests/test_canonical_track_id.py
git commit -m "feat(types): add CanonicalTrackId value object + TypeDecorator

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: TypeDecorator bind/result roundtrip (no DB)

**Files:**
- Test: `tests/test_canonical_track_id.py` (append)

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_canonical_track_id.py
from app.types import CanonicalTrackIdType


def test_typedecorator_bind_returns_plain_uuid():
    td = CanonicalTrackIdType()
    raw = uuid.uuid4()
    bound = td.process_bind_param(CanonicalTrackId(raw), dialect=None)
    assert type(bound) is uuid.UUID        # plain uuid for asyncpg, not the subclass
    assert bound == raw
    assert td.process_bind_param(None, dialect=None) is None


def test_typedecorator_result_returns_canonical_track_id():
    td = CanonicalTrackIdType()
    raw = uuid.uuid4()
    out = td.process_result_value(raw, dialect=None)
    assert isinstance(out, CanonicalTrackId)
    assert out == raw
    assert td.process_result_value(None, dialect=None) is None
```

- [ ] **Step 2: Run test to verify it fails (or passes)**

Run: `pytest tests/test_canonical_track_id.py -k typedecorator -v`
Expected: PASS if Task 1's implementation is correct (these exercise code written in Task 1). If you are doing strict TDD, write these *before* Task 1 Step 3 and watch them fail with `ImportError`.

- [ ] **Step 3: Commit**

```bash
git add tests/test_canonical_track_id.py
git commit -m "test(types): cover CanonicalTrackIdType bind/result roundtrip

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Apply the type opt-in to the ORM column + read schemas

**Files:**
- Modify: `app/models.py:95-97`
- Modify: `app/schemas.py` (imports + `SessionSummary.canonical_track_id:160`, `SessionDetail.canonical_track_id:212`)
- Test: `tests/test_canonical_track_id.py` (append a schema-level regression test)

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_canonical_track_id.py
from app import schemas


def test_session_summary_accepts_bare_uuid_and_yields_canonical_track_id():
    # read.py passes the ORM attribute straight in; a bare uuid must still validate
    # and the field must coerce to CanonicalTrackId.
    raw = uuid.uuid4()
    s = schemas.SessionSummary(
        session_id="s1", sim="iracing", track="spa", car="911", mode="sprint",
        driver_name="t", start_time="2026-01-01T00:00:00Z", end_time=None,
        sample_count=0, canonical_track_id=raw,
    )
    assert isinstance(s.canonical_track_id, CanonicalTrackId)
    assert s.canonical_track_id == raw
    assert s.model_dump(mode="json")["canonical_track_id"] == str(raw)
    # car id stays a plain uuid (opt-in is track-only)
    s2 = schemas.SessionSummary(
        session_id="s1", sim="iracing", track="spa", car="911", mode="sprint",
        driver_name="t", start_time="2026-01-01T00:00:00Z", end_time=None,
        sample_count=0, canonical_car_id=uuid.uuid4(),
    )
    assert not isinstance(s2.canonical_car_id, CanonicalTrackId)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_canonical_track_id.py -k session_summary -v`
Expected: FAIL — field is still `uuid.UUID`, so `isinstance(..., CanonicalTrackId)` is False.

- [ ] **Step 3: Apply the changes**

In `app/schemas.py`, add the import near the top:
```python
from app.types import CanonicalTrackId
```
Change `SessionSummary.canonical_track_id` (currently line 160) and `SessionDetail.canonical_track_id` (currently line 212) from:
```python
    canonical_track_id: uuid.UUID | None = None
```
to:
```python
    canonical_track_id: CanonicalTrackId | None = None
```
(Leave `canonical_car_id: uuid.UUID | None` unchanged — opt-in is track-only.)

In `app/models.py`, add the import:
```python
from app.types import CanonicalTrackId, CanonicalTrackIdType
```
Change `Session.canonical_track_id` (lines 95-97) from:
```python
    canonical_track_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("tracks.canonical_id"), nullable=True,
    )
```
to:
```python
    canonical_track_id: Mapped[CanonicalTrackId | None] = mapped_column(
        CanonicalTrackIdType(), ForeignKey("tracks.canonical_id"), nullable=True,
    )
```

- [ ] **Step 4: Run tests to verify they pass + no regression**

Run: `pytest tests/test_canonical_track_id.py tests/test_resolver.py -v`
Expected: PASS. (No DB needed for these.)

- [ ] **Step 5: Commit**

```bash
git add app/models.py app/schemas.py tests/test_canonical_track_id.py
git commit -m "feat(canonical): type Session.canonical_track_id + read schemas as CanonicalTrackId

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Append-only enforcement on `canonical_drifts` (migration 0005)

**Decision baked in (flag to reviewer):** the trigger blocks **UPDATE only**, not DELETE. `canonical_drifts.session_id` is `ondelete=CASCADE` (models.py:310), so blocking DELETE would break GDPR/user-cascade deletion. "Append-only" here = rows are never edited in place; removal happens only via parent cascade. The stricter alternative (hard-immutable incl. DELETE + switch the FK to `RESTRICT` + an explicit archival path) is a product decision — see the master plan's Open Decisions.

**Files:**
- Create: `app/ddl.py`
- Create: `alembic/versions/0005_drift_ledger_append_only.py`
- Test: `tests/test_drift_ledger_invariants.py`

- [ ] **Step 1: Write the failing test (DB-gated)**

```python
# tests/test_drift_ledger_invariants.py
"""DB-gated invariant meta-tests for the canonical drift ledger.

Replaces the plan's struck `grep track_uuid` meta-test (no repo ever had that
column) with the REAL invariants: append-only enforcement + resolver behaviour.

conftest's TRUNCATE list omits the canonical tables, so this module cleans
tracks/track_aliases/canonical_drifts itself.
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text

from app import models
from app.ddl import DRIFT_APPEND_ONLY_FN, DRIFT_APPEND_ONLY_TRIGGER
from tests.conftest import make_device, make_user, needs_db

pytestmark = [pytest.mark.asyncio, needs_db]


async def _install_trigger(db):
    # conftest builds schema via metadata.create_all (no Alembic), so the
    # migration's trigger is absent. Install the IDENTICAL SQL here.
    await db.execute(text(DRIFT_APPEND_ONLY_FN))
    await db.execute(text(DRIFT_APPEND_ONLY_TRIGGER))
    await db.commit()


async def _cleanup(db):
    await db.execute(text("TRUNCATE canonical_drifts, track_aliases, tracks CASCADE"))
    await db.commit()


async def test_canonical_drift_rows_are_update_immutable(db):
    await _install_trigger(db)
    user = await make_user(db, "drift@test.dev")
    device = await make_device(db, user)
    db.add(models.Session(
        session_id="sess-immut", user_id=user.id, device_token=device.device_token,
        envelope_id=uuid.uuid4(), sim="iracing", track="spa", car="911",
        mode="sprint", start_time="2026-01-01T00:00:00Z",
    ))
    drift = models.CanonicalDrift(
        session_id="sess-immut", user_id=user.id, field="canonical_track_id",
        submitted_value="a", backend_value="b", sim_id="iracing", raw_value="spa",
    )
    db.add(drift)
    await db.commit()

    with pytest.raises(Exception) as exc:   # asyncpg RaiseError surfaces as DBAPIError
        await db.execute(text(
            "UPDATE canonical_drifts SET backend_value = 'tampered' "
            "WHERE session_id = 'sess-immut'"
        ))
        await db.commit()
    await db.rollback()
    assert "append-only" in str(exc.value).lower()
    await _cleanup(db)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `TEST_DATABASE_URL=postgresql+asyncpg://lap_coach:lap_coach_dev_pw@localhost:5432/lap_coach_test pytest tests/test_drift_ledger_invariants.py -v`
(PowerShell: `$env:TEST_DATABASE_URL="postgresql+asyncpg://..."; pytest tests/test_drift_ledger_invariants.py -v`)
Expected: FAIL — `ModuleNotFoundError: No module named 'app.ddl'`. (If `TEST_DATABASE_URL` is unset the test SKIPS — that is acceptable locally but the CI/DB job must run it.)

- [ ] **Step 3: Write the DDL + migration**

```python
# app/ddl.py
"""Raw DDL shared between Alembic migrations and DB-gated tests so the two
can never drift. plpgsql only — safe on postgres:16-alpine (no extensions)."""
from __future__ import annotations

DRIFT_APPEND_ONLY_FN = """
CREATE OR REPLACE FUNCTION canonical_drifts_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'canonical_drifts is append-only (% blocked)', TG_OP;
END;
$$;
"""

DRIFT_APPEND_ONLY_TRIGGER = """
CREATE TRIGGER canonical_drifts_no_update
BEFORE UPDATE ON canonical_drifts
FOR EACH ROW EXECUTE FUNCTION canonical_drifts_append_only();
"""

DRIFT_APPEND_ONLY_DOWN = """
DROP TRIGGER IF EXISTS canonical_drifts_no_update ON canonical_drifts;
DROP FUNCTION IF EXISTS canonical_drifts_append_only();
"""
```

```python
# alembic/versions/0005_drift_ledger_append_only.py
"""Append-only (UPDATE-blocking) trigger on canonical_drifts.

Revision ID: 0005_drift_ledger_append_only
Revises: 0004_drift_tracking
Create Date: 2026-06-02
"""
from __future__ import annotations

from alembic import op

from app.ddl import DRIFT_APPEND_ONLY_DOWN, DRIFT_APPEND_ONLY_FN, DRIFT_APPEND_ONLY_TRIGGER

revision = "0005_drift_ledger_append_only"
down_revision = "0004_drift_tracking"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(DRIFT_APPEND_ONLY_FN)
    op.execute(DRIFT_APPEND_ONLY_TRIGGER)


def downgrade() -> None:
    op.execute(DRIFT_APPEND_ONLY_DOWN)
```

> Verify `alembic/env.py` can import `app.ddl` (it already imports `app.models`, so `app` is on the path). If migrations run with a different sys.path, inline the SQL constants into the migration and have the test import them from the migration via `importlib` — but prefer `app.ddl`.

- [ ] **Step 4: Run test to verify it passes**

Run: `TEST_DATABASE_URL=... pytest tests/test_drift_ledger_invariants.py -v`
Expected: PASS. Also confirm the migration applies on a scratch DB: `alembic upgrade head && alembic downgrade -1 && alembic upgrade head`.

- [ ] **Step 5: Commit**

```bash
git add app/ddl.py alembic/versions/0005_drift_ledger_append_only.py tests/test_drift_ledger_invariants.py
git commit -m "feat(drift): append-only (UPDATE-blocking) trigger on canonical_drifts

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Resolver invariant meta-test (determinism + drift symmetry)

**Files:**
- Test: `tests/test_drift_ledger_invariants.py` (append)

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_drift_ledger_invariants.py
from app.resolver import BackendResolver


async def _seed_track(db, *, sim="iracing", raw="spa", layout="", name="Spa"):
    track = models.Track(canonical_id=uuid.uuid4(), canonical_name=name)
    db.add(track)
    await db.flush()
    db.add(models.Sim(sim_id=sim, display_name=sim) if not await db.get(models.Sim, sim) else None)
    db.add(models.TrackAlias(sim_id=sim, raw_id=raw, raw_layout=layout,
                             canonical_id=track.canonical_id, canonical_layout=layout or None))
    await db.commit()
    return track


async def test_resolver_is_deterministic(db):
    track = await _seed_track(db)
    r = BackendResolver()
    a = await r.resolve_track(db, "iracing", "spa", None)
    b = await r.resolve_track(db, "iracing", "spa", "")
    assert a is not None and b is not None
    assert a.canonical_id == b.canonical_id == track.canonical_id   # None and "" sentinel agree
    await _cleanup(db)


async def test_detect_drift_only_when_both_sides_present_and_differ(db):
    track = await _seed_track(db)
    r = BackendResolver()
    other = uuid.uuid4()
    drifts = await r.detect_drift(
        db, sim_id="iracing", raw_car="x", raw_track="spa", raw_layout=None,
        submitted_car_id=None, submitted_track_id=other,
        submitted_car_class=None, submitted_track_layout=None,
    )
    assert any(d.field == "canonical_track_id" for d in drifts)     # differ -> drift
    drifts2 = await r.detect_drift(
        db, sim_id="iracing", raw_car="x", raw_track="spa", raw_layout=None,
        submitted_car_id=None, submitted_track_id=track.canonical_id,
        submitted_car_class=None, submitted_track_layout=None,
    )
    assert not any(d.field == "canonical_track_id" for d in drifts2)  # agree -> no drift
    drifts3 = await r.detect_drift(
        db, sim_id="iracing", raw_car="x", raw_track="unknown", raw_layout=None,
        submitted_car_id=None, submitted_track_id=other,
        submitted_car_class=None, submitted_track_layout=None,
    )
    assert not any(d.field == "canonical_track_id" for d in drifts3)  # backend None -> no drift
    await _cleanup(db)
```

- [ ] **Step 2: Run test to verify it fails, then passes**

Run: `TEST_DATABASE_URL=... pytest tests/test_drift_ledger_invariants.py -v`
Expected: these PASS against the *existing* resolver (Task 5 is characterization — it documents and locks current behaviour). If `test_resolver_is_deterministic` fails on the None/"" sentinel, that is a real resolver bug to fix in `resolve_track` (it already coalesces `raw_layout or ""`, so expect PASS).

- [ ] **Step 3: Commit**

```bash
git add tests/test_drift_ledger_invariants.py
git commit -m "test(resolver): lock determinism + drift-symmetry invariants

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Dead-code cleanup

**Files:**
- Modify: `app/resolver.py:17,51-55`
- Modify: `scripts/backfill_resolver.py:9,19`

- [ ] **Step 1: Remove the dead `lru_cache` import + misleading docstring in `resolver.py`**

Delete line 17 `from functools import lru_cache` (never used). In the `BackendResolver` docstring (lines 48-55), delete the paragraph claiming an LRU cache warms up across a backfill batch — no caching is implemented; every call hits the DB. Replace with a one-line note: `"""Stateless resolver — one instance per request; pure DB reads."""`

- [ ] **Step 2: Fix `backfill_resolver.py` docstring/code drift + unused imports**

The module docstring (line ~9) claims it clears resolved `canonical_drifts`; the code only deletes `UnresolvedCanonical` rows. Either (a) correct the docstring to say it only clears unresolved entries, or (b) implement the drift clearing — **but only if** the append-only decision (Task 4) permits deleting drift rows. Default: correct the docstring (do NOT delete drift rows; they are the audit trail). Remove the unused `update`/`func` imports (line ~19).

- [ ] **Step 3: Run the full suite**

Run: `pytest -v` (no DB) and `TEST_DATABASE_URL=... pytest -v` (with DB).
Expected: all PASS, no import errors.

- [ ] **Step 4: Commit**

```bash
git add app/resolver.py scripts/backfill_resolver.py
git commit -m "chore(resolver): drop dead lru_cache import; fix backfill docstring drift

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** WS2-A (CanonicalTrackId + TypeDecorator + read-schema typing) → Tasks 1-3. WS2-B (append-only migration 0005) → Task 4. WS2-C (invariant meta-test + backfill cleanup) → Tasks 4-6. The struck `grep track_uuid` premise is explicitly replaced by Task 4/5 invariants.

**Placeholder scan:** No TBD/TODO. Every code step shows complete code. The two genuinely uncertain spots are flagged with the likely fix inline: (1) the pydantic JSON-schema assertion in Task 1 Step 4; (2) `app.ddl` import path from `env.py` in Task 4 Step 3.

**Type consistency:** `CanonicalTrackId` / `CanonicalTrackIdType` names are consistent across `app/types.py`, `app/models.py`, `app/schemas.py`, and both test files. The DDL constant names (`DRIFT_APPEND_ONLY_FN`/`_TRIGGER`/`_DOWN`) match between `app/ddl.py`, the migration, and the test. The trigger name `canonical_drifts_no_update` is consistent.

**Effort:** ~2.5–4 days, one engineer, independent of the frontend, **not on the launch path** (datalogger is the isolated FastAPI service, not the live Flask app). Safe to execute during the launch window.
