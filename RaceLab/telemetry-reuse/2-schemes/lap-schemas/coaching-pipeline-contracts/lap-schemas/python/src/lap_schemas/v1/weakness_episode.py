from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from lap_schemas.v1.environment import EnvironmentTag
from lap_schemas.v1.ids import UUID7
from lap_schemas.v1.weakness_category import WeaknessCategory

EpisodeSeverity = Literal["low", "medium", "high"]
EpisodeStatus = Literal["open", "improving", "resolved", "dormant"]


class WeaknessEpisode(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    id: UUID7
    driver_id: UUID7
    category: WeaknessCategory
    subcategory: str
    corner_tag: str | None = None
    environment_scope: tuple[EnvironmentTag, ...] = Field(default_factory=tuple)

    first_observed_at: datetime
    last_observed_at: datetime
    recurrence_count: int = Field(ge=0)
    sessions_affected: tuple[UUID7, ...] = Field(default_factory=tuple, max_length=50)

    severity: EpisodeSeverity
    confidence: float = Field(ge=0, le=1)
    confidence_decay_per_day: float = Field(default=0.02, ge=0)

    status: EpisodeStatus
    resolved_at: datetime | None = None

    linked_prescriptions: tuple[UUID7, ...] = Field(default_factory=tuple)
    linked_insights: tuple[UUID7, ...] = Field(default_factory=tuple)

    library_rule_id: str
