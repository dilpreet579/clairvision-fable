import uuid

import redis
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from clairvision_shared.db.models import Event
from clairvision_shared.schemas import ClusterPoint

from ..deps import get_db, get_redis
from ..services.umap_service import get_cluster_points

router = APIRouter(prefix="/events/{event_id}", tags=["cluster"])


# Sync `def` on purpose: UMAP is CPU-heavy and must run in the threadpool,
# not on the event loop.
@router.get("/cluster", response_model=list[ClusterPoint])
def get_cluster(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    r: redis.Redis = Depends(get_redis),
) -> list[ClusterPoint]:
    if db.get(Event, event_id) is None:
        raise HTTPException(status_code=404, detail="event not found")
    return get_cluster_points(db, r, event_id)
