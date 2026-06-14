from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from lap_schemas.v1.ids import UUID7

InsightSeverity = Literal["low", "medium", "high"]


class CoachingInsight(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    id: UUID7
    session_id: UUID7
    driver_id: UUID7
    created_at: datetime

    rule_id: str
    rule_version: str

    observation: str
    evidence: tuple[str, ...] = Field(default_factory=tuple)
    likely_cause: str | None = None

    severity: InsightSeverity
    confidence: float = Field(ge=0, le=1)
    corner_tag: str | None = None

    suggested_prescription_id: UUID7 | None = None
    flagged_false_positive: bool = False
