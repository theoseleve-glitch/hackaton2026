import pytest
import uuid6
from pydantic import ValidationError

from lap_schemas.v1.lap_record import LapRecord


def test_lap_record_accepts_valid_timed_lap() -> None:
    lap = LapRecord(
        id=uuid6.uuid7(),
        session_id=uuid6.uuid7(),
        lap_number=5,
        time_ms=84_321,
        sector_times_ms=(28_100, 27_950, 28_271),
        valid=True,
        flags=("personal_best",),
    )
    assert lap.lap_number == 5
    assert lap.time_ms == 84_321
    assert lap.sector_times_ms == (28_100, 27_950, 28_271)
    assert lap.valid is True
    assert lap.flags == ("personal_best",)


def test_lap_record_accepts_out_lap_with_no_time() -> None:
    lap = LapRecord(
        id=uuid6.uuid7(),
        session_id=uuid6.uuid7(),
        lap_number=0,
        valid=False,
        flags=("out_lap",),
    )
    assert lap.lap_number == 0
    assert lap.time_ms is None
    assert lap.sector_times_ms == ()
    assert lap.valid is False


def test_lap_record_rejects_negative_lap_time() -> None:
    with pytest.raises(ValidationError):
        LapRecord(
            id=uuid6.uuid7(),
            session_id=uuid6.uuid7(),
            lap_number=1,
            time_ms=-1,
        )
