"""Stage 1 tasks — per-image quality filtering + the stage boundary callback.

The per-image task embodies the isolation pattern every stage copies:
its whole body is wrapped so any failure (download, decode, inference)
marks THAT image failed and returns normally — a single bad image must
never fail the chord or block the batch.
"""
import logging
import uuid

from clairvision_shared.db.enums import EventStatus, ImageStatus, PipelineStage
from clairvision_shared.db.models import Event, Image
from clairvision_shared.db.session import get_sessionmaker
from clairvision_shared.io.image_utils import ImageDecodeError, decode_image
from clairvision_shared.io.source_fetcher import (
    SourceFetchError,
    fetch_bytes,
    join_source_ref,
)

from .. import errors
from ..celery_app import celery_app
from ..stages.stage1_quality import assess_quality
from .db_helpers import fail_event, record_task_error

logger = logging.getLogger(__name__)


@celery_app.task(name="pipeline.process_image_quality")
def process_image_quality(image_id: str) -> str:
    """Fetch → decode → Laplacian → NIMA. Returns the image_id regardless of
    outcome; per-image state lives in Postgres, not in task results."""
    Session = get_sessionmaker()
    with Session() as session:
        image = session.get(Image, uuid.UUID(image_id))
        if image is None:
            logger.error("stage1: unknown image %s", image_id)
            return image_id
        # Idempotency: a redelivered task must not re-process.
        if image.status != ImageStatus.PENDING:
            return image_id
        event_id = str(image.event_id)
        source_url = session.get(Event, image.event_id).source_url
        source_ref = image.source_ref

    try:
        url = join_source_ref(source_url, source_ref)
        data = fetch_bytes(url)
    except SourceFetchError as exc:
        _mark_failed(image_id, event_id, errors.DOWNLOAD_FAILED, str(exc))
        return image_id

    try:
        img = decode_image(data)
    except ImageDecodeError as exc:
        _mark_failed(image_id, event_id, errors.CORRUPT_IMAGE, str(exc))
        return image_id
    finally:
        del data  # original bytes are never persisted; drop them eagerly

    try:
        result = assess_quality(img)
    except Exception as exc:
        _mark_failed(image_id, event_id, errors.MODEL_INFERENCE_ERROR, str(exc))
        return image_id

    with Session() as session:
        image = session.get(Image, uuid.UUID(image_id))
        image.width, image.height = img.size
        image.laplacian_score = result.laplacian_score
        image.nima_score = result.nima_score
        image.status = result.status
        session.commit()
    return image_id


def _mark_failed(image_id: str, event_id: str, error_type: str, detail: str) -> None:
    record_task_error(
        event_id, PipelineStage.STAGE1_QUALITY, error_type, detail, image_id=image_id
    )
    Session = get_sessionmaker()
    with Session() as session:
        image = session.get(Image, uuid.UUID(image_id))
        if image is not None:
            image.status = ImageStatus.FAILED
            image.failure_reason = f"{error_type}: {detail}"[:2000]
            session.commit()


@celery_app.task(name="pipeline.stage1_complete")
def stage1_complete(_results: list, event_id: str) -> None:
    """Stage 1 → Stage 2 boundary with explicit empty-set guards."""
    from celery import chord

    from .orchestration import pipeline_failed
    from .stage2_tasks import embed_image_clip, finalize_duplicate_groups

    try:
        Session = get_sessionmaker()
        with Session() as session:
            passed_ids = [
                str(row[0])
                for row in session.query(Image.id).filter(
                    Image.event_id == uuid.UUID(event_id),
                    Image.status == ImageStatus.STAGE1_PASSED,
                )
            ]

        if not passed_ids:
            # All images rejected/failed is a valid outcome, not an error.
            with Session() as session:
                event = session.get(Event, uuid.UUID(event_id))
                event.status = EventStatus.READY
                event.selected_image_count = 0
                session.commit()
            logger.info("event %s: 0 images passed stage 1, marked ready", event_id)
            return

        logger.info(
            "event %s: %d images passed stage 1, starting stage 2",
            event_id,
            len(passed_ids),
        )
        with Session() as session:
            event = session.get(Event, uuid.UUID(event_id))
            event.current_stage = PipelineStage.STAGE2_DUPLICATES
            session.commit()

        header = [embed_image_clip.s(image_id) for image_id in passed_ids]
        callback = finalize_duplicate_groups.s(event_id).on_error(
            pipeline_failed.s(event_id, PipelineStage.STAGE2_DUPLICATES.value)
        )
        chord(header)(callback)

    except Exception as exc:
        fail_event(
            event_id,
            PipelineStage.STAGE1_QUALITY,
            errors.STAGE_FAILED,
            f"stage1 completion failed: {exc}",
        )
