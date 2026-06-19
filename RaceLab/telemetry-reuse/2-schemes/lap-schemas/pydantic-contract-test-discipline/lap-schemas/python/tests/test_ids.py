import uuid

import pytest
import uuid6
from pydantic import BaseModel, ValidationError

from lap_schemas.v1.ids import UUID7


def test_uuid6_generates_version_7() -> None:
    u = uuid6.uuid7()
    assert isinstance(u, uuid.UUID)
    assert u.version == 7


def test_uuid7_annotation_accepts_v7() -> None:
    class M(BaseModel):
        id: UUID7

    u = uuid6.uuid7()
    assert M(id=u).id == u


def test_uuid7_annotation_rejects_v4() -> None:
    class M(BaseModel):
        id: UUID7

    with pytest.raises(ValidationError):
        M(id=uuid.uuid4())
