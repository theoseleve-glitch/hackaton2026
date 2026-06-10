"""Track catalog wire schemas (T140 / ADR-014).

Server-curated track catalog exposed to clients for offline cache.
The shape mirrors `coaching/catalog/loader.TrackCatalogEntry` but
strips internal fields like `source_provider`.
"""

from pydantic import BaseModel, ConfigDict, Field


class SectorCheckpointPublic(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    distance_m: float = Field(ge=0)
    name: str


class TrackCatalogPublic(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    master_track_id: str
    name: str
    layout_name: str
    length_m: float = Field(gt=0)
    start_finish_lat: float = Field(ge=-90.0, le=90.0)
    start_finish_lon: float = Field(ge=-180.0, le=180.0)
    start_finish_heading_deg: float = Field(ge=0.0, lt=360.0)
    sector_checkpoints: tuple[SectorCheckpointPublic, ...]
    corner_names: tuple[str, ...]


class TrackCatalogList(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    items: tuple[TrackCatalogPublic, ...]
    total: int = Field(ge=0)
    limit: int = Field(ge=1)
    offset: int = Field(ge=0)
