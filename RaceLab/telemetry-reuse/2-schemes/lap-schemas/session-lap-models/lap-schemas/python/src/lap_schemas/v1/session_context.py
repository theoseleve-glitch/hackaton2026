from pydantic import BaseModel, ConfigDict

from lap_schemas.v1.environment import EnvironmentTag
from lap_schemas.v1.ids import UUID7


class SessionContext(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    car_id: UUID7
    track_id: UUID7
    track_layout: str
    environment_tag: EnvironmentTag | None = None
    conditions: str | None = None
