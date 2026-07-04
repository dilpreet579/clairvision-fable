"""Face search — FAISS candidates filtered by the recall-biased threshold.

Two query paths:
- by-upload: single-image MTCNN + ArcFace inference in this CPU process
  (models lazy-loaded once); the most confident detected face is the query.
- by-face: a gallery face's precomputed embedding, no re-inference.

FACE_SEARCH_TOP_K candidates come back from FAISS, then the
FACE_SEARCH_SIMILARITY_THRESHOLD filter applies (deliberately low —
missing a real match is the critical failure mode). Multiple matched
faces in one image dedupe to that image's best similarity.
"""
import logging
import threading
import uuid

import numpy as np
from sqlalchemy.orm import Session

from clairvision_shared.config import get_settings
from clairvision_shared.db.models import Face, FaceEmbedding, Image
from clairvision_shared.io.image_utils import PILImage
from clairvision_shared.ml.align import norm_crop
from clairvision_shared.schemas import SearchResult

from .faiss_manager import get_manager

logger = logging.getLogger(__name__)

_models_lock = threading.Lock()
_models: dict[str, object] = {}


class NoFaceDetected(Exception):
    pass


def _get_face_models():
    """Lazy singletons — the API only pays the model load cost if selfie
    upload is actually used, and only once."""
    with _models_lock:
        if "mtcnn" not in _models:
            from clairvision_shared.ml.arcface import ArcFaceEmbedder
            from clairvision_shared.ml.mtcnn import FaceDetector

            settings = get_settings()
            logger.info("Loading MTCNN + ArcFace for upload search (cpu)")
            _models["mtcnn"] = FaceDetector("cpu")
            _models["arcface"] = ArcFaceEmbedder(settings.arcface_model, "cpu")
        return _models["mtcnn"], _models["arcface"]


def embed_uploaded_face(img: PILImage.Image) -> np.ndarray:
    """Embedding of the most confident face in an uploaded photo."""
    mtcnn, arcface = _get_face_models()
    detections = mtcnn.detect(img)
    if not detections:
        raise NoFaceDetected()
    best = max(detections, key=lambda d: d.confidence)
    img_bgr = np.asarray(img)[:, :, ::-1].copy()
    return arcface.embed(norm_crop(img_bgr, best.landmarks))


def search_by_embedding(
    db: Session, event_id: uuid.UUID, embedding: np.ndarray
) -> list[SearchResult]:
    settings = get_settings()
    index = get_manager().get_index(str(event_id))
    if index is None:
        return []  # zero-face event: no index was ever published

    sims, seq_ids = index.search(
        embedding.astype(np.float32)[np.newaxis], settings.face_search_top_k
    )
    hits = {
        int(seq): float(sim)
        for sim, seq in zip(sims[0], seq_ids[0])
        if seq != -1 and sim >= settings.face_search_similarity_threshold
    }
    if not hits:
        return []

    rows = (
        db.query(FaceEmbedding.faiss_seq_id, Face.id, Image.id, Image.width, Image.height)
        .join(Face, Face.id == FaceEmbedding.face_id)
        .join(Image, Image.id == Face.image_id)
        .filter(
            FaceEmbedding.event_id == event_id,
            FaceEmbedding.faiss_seq_id.in_(hits.keys()),
        )
        .all()
    )

    best_per_image: dict[uuid.UUID, SearchResult] = {}
    for seq_id, face_id, image_id, width, height in rows:
        sim = hits[seq_id]
        current = best_per_image.get(image_id)
        if current is None or sim > current.similarity:
            best_per_image[image_id] = SearchResult(
                image_id=image_id,
                matched_face_id=face_id,
                similarity=sim,
                width=width,
                height=height,
            )
    return sorted(best_per_image.values(), key=lambda r: r.similarity, reverse=True)
