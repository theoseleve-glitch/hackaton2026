from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from lap_schemas.v1.ids import UUID7
from lap_schemas.v1.session import SessionManifest


class SessionRecord(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    id: UUID7
    session_id: UUID7
    manifest: SessionManifest
    processed_at: datetime
    schema_version: Literal["v1"]

    best_lap_ms: int | None = Field(default=None, ge=0)
    avg_lap_ms: int | None = Field(default=None, ge=0)
    peak_speed_mps: float | None = Field(default=None, ge=0)
    consistency_index: float | None = Field(default=None, ge=0, le=1)
    total_laps: int = Field(default=0, ge=0)
    valid_laps: int = Field(default=0, ge=0)
