"""T001 (sprint2-backend) — driver timeline list-view schemas.

`GET /api/v1/driver/timeline` returns paginated `TimelineEntry`
rows wrapped in `TimelineResponse`. Each entry is a per-session
summary, not the full SessionRecord — drilldown lives at
`/api/v1/sessions/:id`.

`badges` is the list of session-level achievements the row earned
(e.g. "personal_best", "first_session"). Strings rather than enum
on purpose: new badges should be additive without forcing every
client to update its enum at the same time as the backend ships.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from lap_schemas.v1.ids import UUID7


class TimelineEntry(BaseModel):
    """One row in the driver's session timeline.

    Lighter than `SessionRecord` (no manifest, no schema_version) —
    optimized for list-view rendering. The full record is one
    follow-on request away at `/api/v1/sessions/:id`.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    session_id: UUID7
    processed_at: datetime
    best_lap_ms: int | None = Field(default=None, ge=0)
    total_laps: int = Field(default=0, ge=0)
    valid_laps: int = Field(default=0, ge=0)
    badges: list[str] = Field(default_factory=list)


class TimelineResponse(BaseModel):
    """Paginated timeline payload.

    `next_cursor` is None when no more pages exist — the natural
    terminal that lets clients loop until null without a special
    "is_last" flag.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    entries: list[TimelineEntry]
    next_cursor: str | None = None
