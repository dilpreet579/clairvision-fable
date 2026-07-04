"""Stage 3 tasks — face detection/embedding (per-image) + FAISS build (callback).

Runs only on Stage-2-selected images. Per image: MTCNN full detection
(keep_all, env thresholds), drop faces under FACE_MIN_SIZE, align each to
112x112 via landmarks, ArcFace -> 512-dim L2-normalized embedding into
pgvector. Same per-image isolation pattern as Stages 1-2.

The chord callback builds the per-event FAISS index (atomic publish),
THEN flips the event to ready — order matters so the API can never load
a half-written index for a "ready" event.
"""
import logging
import uuid

import numpy as np

from clairvision_shared.db.enums import EventStatus, ImageStatus, PipelineStage
from clairvision_shared.db.models import Event, Face, FaceEmbedding, Image
from clairvision_shared.db.session import get_sessionmaker
from clairvision_shared.io.image_utils import ImageDecodeError, decode_image
from clairvision_shared.io.source_fetcher import (
    SourceFetchError,
    fetch_bytes,
    join_source_ref,
)

from .. import errors
from ..celery_app import celery_app
from ..faiss_index.builder import build_and_publish_face_index
from ..models.model_registry import get_arcface, get_mtcnn
from clairvision_shared.ml.align import norm_crop
from .db_helpers import fail_event, record_task_error

logger = logging.getLogger(__name__)


@celery_app.task(name="pipeline.detect_and_embed_faces")
def detect_and_embed_faces(image_id: str) -> str:
    Session = get_sessionmaker()
    with Session() as session:
        image = session.get(Image, uuid.UUID(image_id))
        if image is None or image.status != ImageStatus.STAGE2_SELECTED:
            return image_id
        # Idempotency: faces already recorded for this image -> skip.
        if session.query(Face.id).filter(Face.image_id == image.id).first():
            return image_id
        event_id = str(image.event_id)
        source_url = session.get(Event, image.event_id).source_url
        source_ref = image.source_ref

    try:
        data = fetch_bytes(join_source_ref(source_url, source_ref))
        img = decode_image(data)
        del data
    except (SourceFetchError, ImageDecodeError) as exc:
        # Selection already happened; a fetch failure here just means this
        # image contributes no faces. Log it, leave the image selected.
        record_task_error(
            event_id, PipelineStage.STAGE3_FACES, errors.DOWNLOAD_FAILED,
            str(exc), image_id=image_id,
        )
        return image_id

    try:
        detections = get_mtcnn().detect(img)
        img_bgr = np.asarray(img)[:, :, ::-1].copy()
        arcface = get_arcface()
        embeddings = []
        for det in detections:
            aligned = norm_crop(img_bgr, det.landmarks)
            embeddings.append((det, arcface.embed(aligned)))
    except Exception as exc:
        record_task_error(
            event_id, PipelineStage.STAGE3_FACES, errors.MODEL_INFERENCE_ERROR,
            str(exc), image_id=image_id,
        )
        return image_id

    try:
        with Session() as session:
            for det, embedding in embeddings:
                face = Face(
                    image_id=uuid.UUID(image_id),
                    event_id=uuid.UUID(event_id),
                    bbox_x=det.bbox_x,
                    bbox_y=det.bbox_y,
                    bbox_w=det.bbox_w,
                    bbox_h=det.bbox_h,
                    detection_confidence=det.confidence,
                    landmarks={"points": det.landmarks},
                )
                session.add(face)
                session.flush()
                session.add(
                    FaceEmbedding(
                        face_id=face.id,
                        event_id=uuid.UUID(event_id),
                        embedding=embedding.tolist(),
                    )
                )
            session.query(Image).filter(Image.id == uuid.UUID(image_id)).update(
                {Image.face_count: len(embeddings)}
            )
            session.commit()
    except Exception as exc:
        record_task_error(
            event_id, PipelineStage.STAGE3_FACES, errors.PERSIST_FAILED,
            str(exc), image_id=image_id,
        )
    return image_id


@celery_app.task(name="pipeline.build_face_index")
def build_face_index(_results: list, event_id: str) -> None:
    """Chord callback: publish the FAISS index, then (and only then) ready."""
    try:
        indexed = build_and_publish_face_index(event_id)

        Session = get_sessionmaker()
        with Session() as session:
            event = session.get(Event, uuid.UUID(event_id))
            selected = (
                session.query(Image.id)
                .filter(
                    Image.event_id == uuid.UUID(event_id),
                    Image.status == ImageStatus.STAGE2_SELECTED,
                )
                .count()
            )
            event.status = EventStatus.READY
            event.selected_image_count = selected
            session.commit()
        logger.info(
            "event %s: READY — %d selected images, %d faces indexed",
            event_id,
            selected,
            indexed,
        )
    except Exception as exc:
        fail_event(
            event_id,
            PipelineStage.STAGE3_FACES,
            errors.STAGE_FAILED,
            f"stage3 index build failed: {exc}",
        )
