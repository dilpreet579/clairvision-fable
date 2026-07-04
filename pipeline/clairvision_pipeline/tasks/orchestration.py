"""Pipeline entrypoint and event status machine.

orchestrate_event: pending → processing, discover the manifest, create image
rows, kick off the Stage 1 chord. Every stage boundary has an explicit
empty-set guard (a chord over an empty group is a Celery footgun), and a
link_error callback ensures unexpected exceptions flip the event to failed
instead of leaving it stuck in processing.
"""
import logging
import uuid

from celery import chord

from clairvision_shared.db.enums import EventStatus, ImageStatus, PipelineStage
from clairvision_shared.db.models import Event, Image
from clairvision_shared.db.session import get_sessionmaker

from .. import errors
from ..celery_app import celery_app
from ..io.manifest import fetch_manifest
from .db_helpers import fail_event

logger = logging.getLogger(__name__)


@celery_app.task(name="pipeline.pipeline_failed")
def pipeline_failed(request, exc, traceback, event_id: str, stage: str) -> None:
    """link_error callback: any uncaught task exception fails the event."""
    fail_event(
        event_id,
        PipelineStage(stage),
        errors.STAGE_FAILED,
        f"unhandled pipeline error: {exc!r}",
    )


@celery_app.task(name="pipeline.orchestrate_event", bind=True)
def orchestrate_event(self, event_id: str) -> None:
    from .stage1_tasks import process_image_quality, stage1_complete

    Session = get_sessionmaker()
    try:
        with Session() as session:
            event = session.get(Event, uuid.UUID(event_id))
            if event is None:
                logger.error("orchestrate_event: unknown event %s", event_id)
                return
            # Idempotency: a redelivered orchestrate task must not re-ingest.
            if event.status != EventStatus.PENDING:
                logger.warning(
                    "orchestrate_event: event %s is %s, skipping",
                    event_id,
                    event.status.value,
                )
                return
            event.status = EventStatus.PROCESSING
            event.current_stage = PipelineStage.INGESTION
            source_url = event.source_url
            session.commit()

        refs = fetch_manifest(source_url)
        if not refs:
            fail_event(
                event_id,
                PipelineStage.INGESTION,
                errors.MANIFEST_FAILED,
                "no images found at source URL",
            )
            return

        with Session() as session:
            event = session.get(Event, uuid.UUID(event_id))
            image_ids: list[str] = []
            for ref in refs:
                image = Image(
                    event_id=event.id,
                    source_ref=ref,
                    status=ImageStatus.PENDING,
                )
                session.add(image)
                session.flush()
                image_ids.append(str(image.id))
            event.total_image_count = len(image_ids)
            event.current_stage = PipelineStage.STAGE1_QUALITY
            session.commit()

        logger.info("event %s: %d images queued for stage 1", event_id, len(image_ids))
        header = [process_image_quality.s(image_id) for image_id in image_ids]
        callback = stage1_complete.s(event_id).on_error(
            pipeline_failed.s(event_id, PipelineStage.STAGE1_QUALITY.value)
        )
        chord(header)(callback)

    except Exception as exc:
        fail_event(
            event_id,
            PipelineStage.INGESTION,
            errors.MANIFEST_FAILED,
            f"ingestion failed: {exc}",
        )
