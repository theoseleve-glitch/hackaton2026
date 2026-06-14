from datetime import datetime
from uuid import uuid4

from geoalchemy2 import Geometry
from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from trackreco_platform.db import Base
from trackreco_platform.domain.enums import (
    CropStatus,
    ExtractionRunStatus,
    ImageryStatus,
    JobStatus,
    JobType,
    LayoutStatus,
    PublishAction,
    ReviewActionType,
    ReviewStatus,
    VenueStatus,
)


class AuditMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by: Mapped[str | None] = mapped_column(String(120))
    updated_by: Mapped[str | None] = mapped_column(String(120))


class Venue(Base, AuditMixin):
    __tablename__ = "venues"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    slug: Mapped[str] = mapped_column(String(160), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[VenueStatus] = mapped_column(Enum(VenueStatus), default=VenueStatus.ACTIVE, nullable=False)
    country_code: Mapped[str] = mapped_column(String(2), default="FR", nullable=False)
    working_bbox: Mapped[str | None] = mapped_column(Geometry("POLYGON", srid=4326))


class VenueAlias(Base, AuditMixin):
    __tablename__ = "venue_aliases"
    __table_args__ = (UniqueConstraint("venue_id", "alias", name="uq_venue_alias"),)

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    venue_id: Mapped[str] = mapped_column(ForeignKey("venues.id", ondelete="CASCADE"), nullable=False)
    alias: Mapped[str] = mapped_column(String(255), nullable=False)
    source_ref: Mapped[str | None] = mapped_column(String(255))


class ImageryAsset(Base, AuditMixin):
    __tablename__ = "imagery_assets"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    venue_id: Mapped[str] = mapped_column(ForeignKey("venues.id", ondelete="CASCADE"), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    source_name: Mapped[str] = mapped_column(String(80), nullable=False)
    source_metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    raw_path: Mapped[str] = mapped_column(Text, nullable=False)
    normalized_path: Mapped[str] = mapped_column(Text, nullable=False)
    thumbnail_path: Mapped[str | None] = mapped_column(Text)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[ImageryStatus] = mapped_column(Enum(ImageryStatus), default=ImageryStatus.INGESTING, nullable=False)


class WorkingAreaVersion(Base, AuditMixin):
    __tablename__ = "working_area_versions"
    __table_args__ = (
        UniqueConstraint("venue_id", "version", name="uq_working_area_version"),
        CheckConstraint("area_ha > 0", name="ck_area_positive"),
    )

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    venue_id: Mapped[str] = mapped_column(ForeignKey("venues.id", ondelete="CASCADE"), nullable=False, index=True)
    imagery_asset_id: Mapped[str] = mapped_column(ForeignKey("imagery_assets.id", ondelete="RESTRICT"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    bbox: Mapped[str] = mapped_column(Geometry("POLYGON", srid=4326), nullable=False)
    boundary_polygon: Mapped[str] = mapped_column(Geometry("POLYGON", srid=4326), nullable=False)
    area_ha: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[CropStatus] = mapped_column(Enum(CropStatus), default=CropStatus.DRAFT, nullable=False)
    retired_reason: Mapped[str | None] = mapped_column(Text)


class ExtractionRun(Base, AuditMixin):
    __tablename__ = "extraction_runs"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    venue_id: Mapped[str] = mapped_column(ForeignKey("venues.id", ondelete="CASCADE"), nullable=False)
    working_area_version_id: Mapped[str] = mapped_column(ForeignKey("working_area_versions.id", ondelete="RESTRICT"), nullable=False)
    status: Mapped[ExtractionRunStatus] = mapped_column(Enum(ExtractionRunStatus), default=ExtractionRunStatus.QUEUED, nullable=False)
    config_snapshot: Mapped[dict] = mapped_column(JSON, default=dict)
    failure_reason: Mapped[str | None] = mapped_column(Text)


class Layout(Base, AuditMixin):
    __tablename__ = "layouts"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    venue_id: Mapped[str] = mapped_column(ForeignKey("venues.id", ondelete="CASCADE"), nullable=False, unique=True)
    active_version_id: Mapped[str | None] = mapped_column(ForeignKey("layout_versions.id", ondelete="RESTRICT"))


class LayoutVersion(Base, AuditMixin):
    __tablename__ = "layout_versions"
    __table_args__ = (UniqueConstraint("layout_id", "version", name="uq_layout_version"),)

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    layout_id: Mapped[str] = mapped_column(ForeignKey("layouts.id", ondelete="CASCADE"), nullable=False)
    extraction_run_id: Mapped[str] = mapped_column(ForeignKey("extraction_runs.id", ondelete="RESTRICT"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[LayoutStatus] = mapped_column(Enum(LayoutStatus), default=LayoutStatus.DRAFT, nullable=False)
    review_status: Mapped[ReviewStatus] = mapped_column(Enum(ReviewStatus), default=ReviewStatus.DRAFT, nullable=False)
    boundary_polygon: Mapped[str] = mapped_column(Geometry("POLYGON", srid=4326), nullable=False)
    centerline: Mapped[str] = mapped_column(Geometry("LINESTRING", srid=4326), nullable=False)
    start_finish: Mapped[str] = mapped_column(Geometry("POINT", srid=4326), nullable=False)
    sectors: Mapped[dict] = mapped_column(JSON, default=dict)
    corner_graph_ref: Mapped[str | None] = mapped_column(Text)
    supersedes_layout_version_id: Mapped[str | None] = mapped_column(ForeignKey("layout_versions.id", ondelete="RESTRICT"))
    immutable_hash: Mapped[str] = mapped_column(String(64), nullable=False)


class ValidationReport(Base, AuditMixin):
    __tablename__ = "validation_reports"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    layout_version_id: Mapped[str] = mapped_column(ForeignKey("layout_versions.id", ondelete="CASCADE"), nullable=False)
    validator_version: Mapped[str] = mapped_column(String(60), nullable=False)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    findings: Mapped[dict] = mapped_column(JSON, default=dict)


class ReviewAction(Base, AuditMixin):
    __tablename__ = "review_actions"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    layout_version_id: Mapped[str] = mapped_column(ForeignKey("layout_versions.id", ondelete="CASCADE"), nullable=False)
    action: Mapped[ReviewActionType] = mapped_column(Enum(ReviewActionType), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)


class PublishHistory(Base, AuditMixin):
    __tablename__ = "publish_history"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    layout_version_id: Mapped[str] = mapped_column(ForeignKey("layout_versions.id", ondelete="RESTRICT"), nullable=False)
    previous_layout_version_id: Mapped[str | None] = mapped_column(ForeignKey("layout_versions.id", ondelete="RESTRICT"))
    action: Mapped[PublishAction] = mapped_column(Enum(PublishAction), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)


class ProcessingJob(Base, AuditMixin):
    __tablename__ = "processing_jobs"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    job_type: Mapped[JobType] = mapped_column(Enum(JobType), nullable=False)
    status: Mapped[JobStatus] = mapped_column(Enum(JobStatus), default=JobStatus.QUEUED, nullable=False)
    requested_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    result_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    error_code: Mapped[str | None] = mapped_column(String(80))
    error_message: Mapped[str | None] = mapped_column(Text)


class ArtifactReference(Base, AuditMixin):
    __tablename__ = "artifact_references"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    entity_type: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False)
    artifact_type: Mapped[str] = mapped_column(String(80), nullable=False)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    checksum: Mapped[str | None] = mapped_column(String(64))


class User(Base, AuditMixin):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    role: Mapped[str] = mapped_column(String(40), nullable=False)


class RolePermission(Base):
    __tablename__ = "role_permissions"
    __table_args__ = (UniqueConstraint("role", "permission", name="uq_role_permission"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    role: Mapped[str] = mapped_column(String(40), nullable=False)
    permission: Mapped[str] = mapped_column(String(80), nullable=False)


class AuditEvent(Base, AuditMixin):
    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    event_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    correlation_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
