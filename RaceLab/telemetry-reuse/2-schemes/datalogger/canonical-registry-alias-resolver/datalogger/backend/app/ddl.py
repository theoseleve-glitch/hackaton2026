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
CREATE OR REPLACE TRIGGER canonical_drifts_no_update
BEFORE UPDATE ON canonical_drifts
FOR EACH ROW EXECUTE FUNCTION canonical_drifts_append_only();
"""

DRIFT_APPEND_ONLY_DOWN = """
DROP TRIGGER IF EXISTS canonical_drifts_no_update ON canonical_drifts;
DROP FUNCTION IF EXISTS canonical_drifts_append_only();
"""
