"""Coaching rule public listing schema (T202 / ADR-013).

Minimal "rule reference" shape exposed by `GET /api/v1/coaching/rules`
— enough for the web app to render a rule index and for clients
to validate that a `rule_id` returned from a session corresponds
to a known active rule. Full rule content (detection condition,
explanation templates, prescription) lives behind the bundle
endpoint (T204), not here.

Why split index from bundle: the index stays small (sub-10KB even
with 100+ rules) and changes infrequently in shape; the bundle is
larger and changes content with every rule edit. Different cache
profiles, different consumer needs.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

RuleCategory = Literal["technique", "setup", "strategy"]
RuleDifficulty = Literal["beginner", "intermediate", "advanced"]


class CoachingRulePublic(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str = Field(min_length=1)
    version: int = Field(ge=1)
    category: RuleCategory
    subcategory: str = Field(min_length=1)
    difficulty: RuleDifficulty


class CoachingRuleList(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    items: tuple[CoachingRulePublic, ...]
    total: int = Field(ge=0)
