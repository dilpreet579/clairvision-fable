"""Build + atomically publish the per-event face FAISS index.

pgvector is the durable source of truth; this index is a derived,
rebuildable accelerator. METRIC_INNER_PRODUCT because embeddings are
L2-normalized (inner product == cosine similarity).

IVFFlat needs enough training vectors relative to nlist — small events
fall back to an exact IndexFlatIP (still no quantisation, so the spec's
"no IVFPQ / no precision loss" rule holds; a flat index is MORE exact).

Publication is atomic: write to a temp file, then os.replace, and only
after that does the caller flip the event to ready — the API (read-only
mount) can never see a partially-written index.
"""
import logging
import os
import uuid

import faiss
import numpy as np

from clairvision_shared.config import get_settings
from clairvision_shared.constants import FACE_EMBEDDING_DIM
from clairvision_shared.db.models import FaceEmbedding
from clairvision_shared.db.session import get_sessionmaker

from clairvision_shared.faiss_paths import event_index_dir, faces_index_path

logger = logging.getLogger(__name__)

# IVF training wants several examples per cell; below this, exact flat
# search is both more accurate and fast enough.
_MIN_VECTORS_FOR_IVF_FACTOR = 4


def build_and_publish_face_index(event_id: str) -> int:
    """Builds the event's face index from pgvector rows. Returns the number
    of vectors indexed (0 = no index file written)."""
    settings = get_settings()
    Session = get_sessionmaker()
    with Session() as session:
        rows = (
            session.query(FaceEmbedding.faiss_seq_id, FaceEmbedding.embedding)
            .filter(FaceEmbedding.event_id == uuid.UUID(event_id))
            .all()
        )

    if not rows:
        logger.info("event %s: no face embeddings, skipping index build", event_id)
        return 0

    ids = np.asarray([r[0] for r in rows], dtype=np.int64)
    vectors = np.asarray([np.asarray(r[1], dtype=np.float32) for r in rows])

    n = len(rows)
    if n < settings.faiss_nlist * _MIN_VECTORS_FOR_IVF_FACTOR:
        index = faiss.IndexIDMap2(faiss.IndexFlatIP(FACE_EMBEDDING_DIM))
        index.add_with_ids(vectors, ids)
        kind = "FlatIP (small-event fallback)"
    else:
        quantizer = faiss.IndexFlatIP(FACE_EMBEDDING_DIM)
        ivf = faiss.IndexIVFFlat(
            quantizer,
            FACE_EMBEDDING_DIM,
            settings.faiss_nlist,
            faiss.METRIC_INNER_PRODUCT,
        )
        ivf.train(vectors)
        ivf.add_with_ids(vectors, ids)
        ivf.nprobe = settings.faiss_nprobe
        index = ivf
        kind = f"IVFFlat nlist={settings.faiss_nlist}"

    os.makedirs(event_index_dir(event_id), exist_ok=True)
    final_path = faces_index_path(event_id)
    tmp_path = f"{final_path}.tmp"
    faiss.write_index(index, tmp_path)
    os.replace(tmp_path, final_path)
    logger.info("event %s: published %s with %d vectors", event_id, kind, n)
    return n
