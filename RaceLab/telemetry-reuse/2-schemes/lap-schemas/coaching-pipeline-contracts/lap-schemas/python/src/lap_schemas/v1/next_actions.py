"""T224 / WA-009 — `GET /api/v1/sessions/:id/next_actions` response.

Bundles the post-session debrief view: the WeaknessEpisodes
opened/escalated by this session plus the open prescriptions
linked to them. Replaces the frontend's old SessionDebrief
heuristic — copy comes from server-rendered templates, not
client-side string-stitching.
"""

from pydantic import BaseModel, ConfigDict

from lap_schemas.v1.action_prescription import ActionPrescriptionListItem
from lap_schemas.v1.ids import UUID7
from lap_schemas.v1.weakness_episode import WeaknessEpisode


class NextActionsResponse(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    session_id: UUID7
    weakness_episodes: tuple[WeaknessEpisode, ...]
    action_prescriptions: tuple[ActionPrescriptionListItem, ...]
