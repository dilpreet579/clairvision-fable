"""Small DB helpers shared by pipeline tasks."""
import logging
import uuid

from clairvision_shared.db.enums import EventStatus, PipelineStage
from clairvision_shared.db.models import Event, PipelineTaskError
from clairvision_shared.db.session import get_sessionmaker

logger = logging.getLogger(__name__)


def record_task_error(
    event_id: str,
    stage: PipelineStage,
    error_type: str,
    error_detail: str,
    image_id: str | None = None,
) -> None:
    """Log a per-image or stage-level failure. Never raises — error logging
    must not be able to kill the batch it exists to protect."""
    try:
        Session = get_sessionmaker()
        with Session() as session:
            session.add(
                PipelineTaskError(
                    event_id=uuid.UUID(event_id),
                    image_id=uuid.UUID(image_id) if image_id else None,
                    stage=stage,
                    error_type=error_type,
                    error_detail=error_detail[:4000],
                )
            )
            session.commit()
    except Exception:
        logger.exception("failed to record pipeline_task_error for event %s", event_id)


def fail_event(event_id: str, stage: PipelineStage, error_type: str, detail: str) -> None:
    """Unrecoverable stage-level failure: surface it, never hang in processing."""
    logger.error("event %s failed at %s: %s", event_id, stage.value, detail)
    record_task_error(event_id, stage, error_type, detail)
    try:
        Session = get_sessionmaker()
        with Session() as session:
            event = session.get(Event, uuid.UUID(event_id))
            if event is not None and event.status != EventStatus.FAILED:
                event.status = EventStatus.FAILED
                event.error_message = detail[:2000]
                session.commit()
    except Exception:
        logger.exception("failed to mark event %s as failed", event_id)
