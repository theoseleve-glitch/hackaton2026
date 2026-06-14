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
