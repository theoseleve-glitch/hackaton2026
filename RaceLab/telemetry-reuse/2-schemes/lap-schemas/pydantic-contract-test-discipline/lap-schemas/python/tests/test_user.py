from datetime import datetime, timezone

import pytest
import uuid6
from pydantic import ValidationError

from lap_schemas.v1.user import User


def _example() -> User:
    return User(
        id=uuid6.uuid7(),
        clerk_user_id="user_abc123",
        email="driver@example.com",
        created_at=datetime(2026, 4, 24, 10, 0, tzinfo=timezone.utc),
        subscription_status="inactive",
        is_admin=False,
    )


def test_user_builds_with_defaults() -> None:
    u = _example()
    assert u.clerk_user_id == "user_abc123"
    assert u.subscription_status == "inactive"
    assert u.is_admin is False


def test_user_rejects_extra_fields() -> None:
    with pytest.raises(ValidationError):
        User(
            id=uuid6.uuid7(),
            clerk_user_id="x",
            email="x@y",
            created_at=datetime(2026, 4, 24, 10, 0, tzinfo=timezone.utc),
            subscription_status="inactive",
            is_admin=False,
            unknown_field="oops",  # type: ignore[call-arg]
        )


def test_user_rejects_invalid_subscription_status() -> None:
    with pytest.raises(ValidationError):
        User(
            id=uuid6.uuid7(),
            clerk_user_id="x",
            email="x@y",
            created_at=datetime(2026, 4, 24, 10, 0, tzinfo=timezone.utc),
            subscription_status="banana",  # type: ignore[arg-type]
            is_admin=False,
        )


def test_user_is_frozen() -> None:
    u = _example()
    with pytest.raises(ValidationError):
        u.email = "other@example.com"  # type: ignore[misc]


def test_user_v1_reexport() -> None:
    from lap_schemas.v1 import User as ReexportedUser

    assert ReexportedUser is User
