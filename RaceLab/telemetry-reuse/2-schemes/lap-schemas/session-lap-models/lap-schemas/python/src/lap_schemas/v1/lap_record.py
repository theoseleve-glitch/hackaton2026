from pydantic import BaseModel, ConfigDict, Field

from lap_schemas.v1.ids import UUID7


class LapRecord(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    id: UUID7
    session_id: UUID7
    lap_number: int = Field(ge=0)
    time_ms: int | None = Field(default=None, ge=0)
    sector_times_ms: tuple[int, ...] = Field(default_factory=tuple)
    valid: bool = True
    flags: tuple[str, ...] = Field(default_factory=tuple)
