from typing import Literal

from pydantic import BaseModel, ConfigDict

Comparison = Literal["gte", "lte", "within_pct"]
MeasurementWindow = Literal["next_session", "next_3_sessions", "next_7_days"]


class SuccessCondition(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    metric: str
    target_value: float
    comparison: Comparison
    target_pct: float | None = None
    measurement_window: MeasurementWindow
