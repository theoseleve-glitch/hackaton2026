"""Track fingerprint registry + recognition confidence on unresolved rows.

Revision ID: 0006_track_fingerprints
Revises: 0005_drift_ledger_append_only
Create Date: 2026-06-10
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0006_track_fingerprints"
down_revision = "0005_drift_ledger_append_only"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "track_fingerprints",
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column(
            "canonical_track_id", UUID(as_uuid=True),
            sa.ForeignKey("tracks.canonical_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("source", sa.Text(), nullable=False, server_default="gt_anchor"),
        sa.Column("fingerprint", sa.ARRAY(sa.Double()), nullable=False),
        sa.Column("length_m", sa.Double(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("canonical_track_id", "source", name="track_fingerprints_track_source_uq"),
    )
    op.create_index(
        "ix_track_fingerprints_canonical_track_id",
        "track_fingerprints", ["canonical_track_id"],
    )
    op.add_column(
        "unresolved_canonicals",
        sa.Column("recognition_confidence", sa.Double(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("unresolved_canonicals", "recognition_confidence")
    op.drop_index("ix_track_fingerprints_canonical_track_id", table_name="track_fingerprints")
    op.drop_table("track_fingerprints")
