import enum


class EventStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class PipelineStage(str, enum.Enum):
    """Used for events.current_stage (NONE..STAGE3) and error attribution
    (INGESTION..STAGE3)."""

    NONE = "none"
    INGESTION = "ingestion"
    STAGE1_QUALITY = "stage1_quality"
    STAGE2_DUPLICATES = "stage2_duplicates"
    STAGE3_FACES = "stage3_faces"


class ImageStatus(str, enum.Enum):
    PENDING = "pending"
    STAGE1_REJECTED_BLUR = "stage1_rejected_blur"
    STAGE1_REJECTED_QUALITY = "stage1_rejected_quality"
    STAGE1_PASSED = "stage1_passed"
    STAGE2_SELECTED = "stage2_selected"
    STAGE2_NOT_SELECTED = "stage2_not_selected"
    FAILED = "failed"


class EventVisibility(str, enum.Enum):
    """Organizer-controlled publication state — deliberately independent of
    EventStatus (pipeline progress). An event can be status=ready,
    visibility=draft (processed, awaiting organizer review) for a long time;
    publishing requires status=READY at the application layer, not the DB."""

    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class AuthTokenPurpose(str, enum.Enum):
    INVITE = "invite"
    PASSWORD_RESET = "password_reset"
