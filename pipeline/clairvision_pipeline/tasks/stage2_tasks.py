"""Stage 2 tasks — CLIP embedding (per-image) + duplicate finalization (chord callback).

Phase A (embed_image_clip): re-streams bytes from source (originals are
never persisted between stages), CLIP-embeds into pgvector, and captures
the max MTCNN confidence as the face-bonus hint. Same per-image isolation
pattern as Stage 1.

Phase B (finalize_duplicate_groups): whole-event scope — clusters, scores,
selects best frames, writes groups.
"""
import logging
import uuid

import numpy as np

from clairvision_shared.config import get_settings
from clairvision_shared.db.enums import EventStatus, ImageStatus, PipelineStage
from clairvision_shared.db.models import ClipEmbedding, DuplicateGroup, Event, Image
from clairvision_shared.db.session import get_sessionmaker
from clairvision_shared.io.image_utils import ImageDecodeError, decode_image
from clairvision_shared.io.source_fetcher import (
    SourceFetchError,
    fetch_bytes,
    join_source_ref,
)

from .. import errors
from ..celery_app import celery_app
from ..models.model_registry import get_clip, get_mtcnn
from ..stages.stage2_duplicates import (
    MemberQuality,
    cluster_embeddings,
    score_group_members,
)
from .db_helpers import fail_event, record_task_error

logger = logging.getLogger(__name__)


@celery_app.task(name="pipeline.embed_image_clip")
def embed_image_clip(image_id: str) -> str:
    Session = get_sessionmaker()
    with Session() as session:
        image = session.get(Image, uuid.UUID(image_id))
        if image is None or image.status != ImageStatus.STAGE1_PASSED:
            return image_id
        # Idempotency: a redelivered task must not double-insert.
        exists = (
            session.query(ClipEmbedding.id)
            .filter(ClipEmbedding.image_id == image.id)
            .first()
        )
        if exists:
            return image_id
        event_id = str(image.event_id)
        source_url = session.get(Event, image.event_id).source_url
        source_ref = image.source_ref

    try:
        data = fetch_bytes(join_source_ref(source_url, source_ref))
        img = decode_image(data)
        del data
    except (SourceFetchError, ImageDecodeError) as exc:
        _mark_failed(image_id, event_id, errors.DOWNLOAD_FAILED, str(exc))
        return image_id

    try:
        embedding = get_clip().embed(img)
        face_hint = get_mtcnn().max_confidence(img)
    except Exception as exc:
        _mark_failed(image_id, event_id, errors.MODEL_INFERENCE_ERROR, str(exc))
        return image_id

    try:
        with Session() as session:
            image = session.get(Image, uuid.UUID(image_id))
            image.face_confidence_hint = face_hint
            session.add(
                ClipEmbedding(
                    image_id=image.id,
                    event_id=image.event_id,
                    embedding=embedding.tolist(),
                )
            )
            session.commit()
    except Exception as exc:
        # e.g. embedding dim mismatch — a data-shape problem with THIS image's
        # inference output, not a stage-level failure; isolate it.
        _mark_failed(image_id, event_id, errors.PERSIST_FAILED, str(exc))
    return image_id


def _mark_failed(image_id: str, event_id: str, error_type: str, detail: str) -> None:
    record_task_error(
        event_id,
        PipelineStage.STAGE2_DUPLICATES,
        error_type,
        detail,
        image_id=image_id,
    )
    Session = get_sessionmaker()
    with Session() as session:
        image = session.get(Image, uuid.UUID(image_id))
        if image is not None:
            image.status = ImageStatus.FAILED
            image.failure_reason = f"{error_type}: {detail}"[:2000]
            session.commit()


@celery_app.task(name="pipeline.finalize_duplicate_groups")
def finalize_duplicate_groups(_results: list, event_id: str) -> None:
    """Chord callback: cluster the event's CLIP embeddings, pick best frames."""
    try:
        settings = get_settings()
        Session = get_sessionmaker()

        with Session() as session:
            rows = (
                session.query(
                    Image.id,
                    Image.laplacian_score,
                    Image.nima_score,
                    Image.face_confidence_hint,
                    ClipEmbedding.embedding,
                )
                .join(ClipEmbedding, ClipEmbedding.image_id == Image.id)
                .filter(
                    Image.event_id == uuid.UUID(event_id),
                    Image.status == ImageStatus.STAGE1_PASSED,
                )
                .all()
            )

        if not rows:
            # Every Stage-1 survivor failed during embedding — valid outcome.
            with Session() as session:
                event = session.get(Event, uuid.UUID(event_id))
                event.status = EventStatus.READY
                event.selected_image_count = 0
                session.commit()
            logger.info("event %s: no embeddable images, marked ready", event_id)
            return

        image_ids = [r[0] for r in rows]
        matrix = np.asarray([np.asarray(r[4], dtype=np.float32) for r in rows])
        groups = cluster_embeddings(matrix, settings.duplicate_similarity_threshold)
        logger.info(
            "event %s: %d images -> %d duplicate groups",
            event_id,
            len(image_ids),
            len(groups),
        )

        with Session() as session:
            selected_total = 0
            for indices in groups:
                if len(indices) == 1:
                    # Singles: no group row, always selected.
                    image = session.get(Image, image_ids[indices[0]])
                    image.status = ImageStatus.STAGE2_SELECTED
                    selected_total += 1
                    continue

                members = [
                    MemberQuality(
                        laplacian_score=rows[i][1] or 0.0,
                        nima_score=rows[i][2] or 0.0,
                        face_confidence=rows[i][3],
                    )
                    for i in indices
                ]
                scores = score_group_members(members)
                best_local = int(np.argmax(scores))

                group = DuplicateGroup(
                    event_id=uuid.UUID(event_id), member_count=len(indices)
                )
                session.add(group)
                session.flush()

                for local, i in enumerate(indices):
                    image = session.get(Image, image_ids[i])
                    image.duplicate_group_id = group.id
                    image.duplicate_score = scores[local]
                    if local == best_local:
                        image.status = ImageStatus.STAGE2_SELECTED
                        group.selected_image_id = image.id
                        selected_total += 1
                    else:
                        image.status = ImageStatus.STAGE2_NOT_SELECTED
            session.commit()

        # Stage 2 → Stage 3 handoff.
        from celery import chord

        from .orchestration import pipeline_failed
        from .stage3_tasks import build_face_index, detect_and_embed_faces

        with Session() as session:
            event = session.get(Event, uuid.UUID(event_id))
            event.current_stage = PipelineStage.STAGE3_FACES
            selected_ids = [
                str(row[0])
                for row in session.query(Image.id).filter(
                    Image.event_id == uuid.UUID(event_id),
                    Image.status == ImageStatus.STAGE2_SELECTED,
                )
            ]
            session.commit()

        logger.info(
            "event %s: %d selected images, starting stage 3",
            event_id,
            len(selected_ids),
        )
        header = [detect_and_embed_faces.s(image_id) for image_id in selected_ids]
        callback = build_face_index.s(event_id).on_error(
            pipeline_failed.s(event_id, PipelineStage.STAGE3_FACES.value)
        )
        chord(header)(callback)

    except Exception as exc:
        fail_event(
            event_id,
            PipelineStage.STAGE2_DUPLICATES,
            errors.STAGE_FAILED,
            f"stage2 finalization failed: {exc}",
        )
