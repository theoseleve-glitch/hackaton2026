try:
    from enum import StrEnum
except ImportError:  # py<3.11
    from enum import Enum

    class StrEnum(str, Enum):
        pass




class VenueStatus(StrEnum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class ImageryStatus(StrEnum):
    INGESTING = "ingesting"
    READY = "ready"
    FAILED = "failed"


class CropStatus(StrEnum):
    DRAFT = "draft"
    ACTIVE = "active"
    RETIRED = "retired"


class ExtractionRunStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class LayoutStatus(StrEnum):
    DRAFT = "draft"
    VALIDATED = "validated"
    PUBLISHED = "published"
    UNPUBLISHED = "unpublished"


class ReviewStatus(StrEnum):
    DRAFT = "draft"
    IN_REVIEW = "in_review"
    CHANGES_REQUESTED = "changes_requested"
    APPROVED = "approved"
    REJECTED = "rejected"


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class JobType(StrEnum):
    VENUE_IMPORT = "venue_import"
    IMAGERY_INGESTION = "imagery_ingestion"
    EXTRACTION = "extraction"


class ReviewActionType(StrEnum):
    SUBMIT_FOR_REVIEW = "submit_for_review"
    APPROVE = "approve"
    REJECT = "reject"
    REQUEST_CHANGES = "request_changes"


class PublishAction(StrEnum):
    PUBLISH = "publish"
    UNPUBLISH = "unpublish"
    ROLLBACK = "rollback"