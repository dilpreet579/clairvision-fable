"""Server-side UMAP projection of an event's CLIP embeddings.

Computed on first request for an event, cached in Redis keyed by
event_id + embedding count so a re-run of the pipeline (different count)
invalidates naturally. UMAP is CPU-heavy — routes calling this must be
sync `def` endpoints so FastAPI runs them in the threadpool, never on
the event loop.

Tiny events: UMAP needs n_neighbors < n_samples. For n <= 3 we place
points deterministically instead of fitting; for small n we shrink
n_neighbors accordingly.
"""
import json
import uuid

import numpy as np
import redis
from sqlalchemy.orm import Session

from clairvision_shared.constants import CLUSTER_CACHE_TTL_SECONDS
from clairvision_shared.db.enums import ImageStatus
from clairvision_shared.db.models import ClipEmbedding, Image
from clairvision_shared.schemas import ClusterPoint

_GALLERY_STATUSES = (ImageStatus.STAGE2_SELECTED, ImageStatus.STAGE2_NOT_SELECTED)


def _cache_key(event_id: uuid.UUID, count: int) -> str:
    return f"cluster:{event_id}:{count}"


def _project(matrix: np.ndarray) -> np.ndarray:
    n = matrix.shape[0]
    if n == 1:
        return np.zeros((1, 2), dtype=np.float32)
    if n <= 3:
        # Too few samples to fit UMAP; spread evenly on a line.
        return np.stack(
            [np.linspace(-1.0, 1.0, n), np.zeros(n)], axis=1
        ).astype(np.float32)
    import umap

    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=min(15, n - 1),
        metric="cosine",
        random_state=42,
    )
    return reducer.fit_transform(matrix).astype(np.float32)


def get_cluster_points(
    db: Session, r: redis.Redis, event_id: uuid.UUID
) -> list[ClusterPoint]:
    rows = (
        db.query(Image.id, Image.duplicate_group_id, ClipEmbedding.embedding)
        .join(ClipEmbedding, ClipEmbedding.image_id == Image.id)
        # Hidden images are excluded for everyone (viewers AND organizer
        # preview): hiding removes a photo from viewer-facing surfaces, and
        # organizers review hidden photos via the gallery's show_hidden
        # toggle, not the cluster map. Always-excluding also keeps the
        # Redis cache single-variant: the key's embedded count changes on
        # hide/unhide, so stale projections are never served.
        .filter(
            Image.event_id == event_id,
            Image.status.in_(_GALLERY_STATUSES),
            Image.hidden == False,  # noqa: E712
        )
        .order_by(Image.id)
        .all()
    )
    if not rows:
        return []

    key = _cache_key(event_id, len(rows))
    cached = r.get(key)
    if cached is not None:
        return [ClusterPoint(**p) for p in json.loads(cached)]

    matrix = np.asarray([np.asarray(row[2], dtype=np.float32) for row in rows])
    coords = _project(matrix)
    points = [
        ClusterPoint(
            image_id=row[0],
            x=float(coords[i, 0]),
            y=float(coords[i, 1]),
            duplicate_group_id=row[1],
        )
        for i, row in enumerate(rows)
    ]
    r.setex(
        key,
        CLUSTER_CACHE_TTL_SECONDS,
        json.dumps([p.model_dump(mode="json") for p in points]),
    )
    return points
