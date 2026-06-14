from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from lap_schemas.v1.ids import UUID7
from lap_schemas.v1.session_context import SessionContext
from lap_schemas.v1.success_condition import SuccessCondition

PrescriptionPriority = Literal["p0", "p1", "p2"]
PrescriptionStatus = Literal[
    "proposed",
    "accepted",
    "in_progress",
    "completed",
    "skipped",
    "expired",
]


class ActionPrescription(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    id: UUID7
    driver_id: UUID7
    weakness_episode_id: UUID7 | None = None
    created_at: datetime

    priority: PrescriptionPriority
    due_before_session_id: UUID7 | None = None
    valid_until: datetime | None = None

    title: str
    rationale: str
    drill_template_id: str | None = None
    expected_context: SessionContext
    success_condition: SuccessCondition

    status: PrescriptionStatus
    accepted_at: datetime | None = None
    outcome_id: UUID7 | None = None


# T217 — list-view shape for `GET /api/v1/driver/:id/prescriptions`.
# Slimmer than ActionPrescription: drops expected_context (which is
# a structured SessionContext that gets attached only when the
# prescription is bound to a specific upcoming session) so the list
# endpoint can ship rows the moment they're generated, even before
# a target session exists.
class ActionPrescriptionListItem(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    id: UUID7
    driver_id: UUID7
    weakness_episode_id: UUID7 | None = None
    created_at: datetime
    priority: PrescriptionPriority
    title: str = Field(min_length=1)
    rationale: str = Field(min_length=1)
    drill_template_id: str | None = None
    success_condition: dict[str, object] = Field(default_factory=dict)
    status: PrescriptionStatus
    accepted_at: datetime | None = None


class ActionPrescriptionList(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    items: tuple[ActionPrescriptionListItem, ...]
    total: int = Field(ge=0)
