"""Tests for lap_schemas.v1.organization."""

import pytest
from pydantic import ValidationError

from lap_schemas.v1.organization import OrganizationInvitationCreate


def test_invitation_email_is_lowercased() -> None:
    """Invitation email is normalized to lowercase at the boundary
    so a case-mismatched accept-time equality check
    (`Alice@racing.com` invite vs `alice@racing.com` user) cannot
    403 on the recipient. RFC 5321 says the local-part is
    case-sensitive, but in practice every major mail provider
    treats it as case-insensitive — normalizing at the boundary
    matches user expectation.
    """
    invite = OrganizationInvitationCreate(
        email="Alice@Racing.COM",
        role="coach",
    )
    assert invite.email == "alice@racing.com"


def test_invitation_email_strips_surrounding_whitespace() -> None:
    """Leading/trailing whitespace is stripped before regex check
    so a pasted email with a trailing space is tolerated rather
    than rejected with a confusing 'invalid email' message.
    """
    invite = OrganizationInvitationCreate(
        email="  alice@racing.com  ",
        role="coach",
    )
    assert invite.email == "alice@racing.com"


def test_invitation_email_still_rejects_invalid_shapes() -> None:
    """Normalization runs before pattern check, but the pattern
    still applies — empty / whitespace-only / no-@ / no-TLD must
    still fail validation after strip+lower.
    """
    for bad in ("", "   ", "no-at-sign", "missing@tld", "@no-local.com"):
        with pytest.raises(ValidationError):
            OrganizationInvitationCreate(email=bad, role="coach")
