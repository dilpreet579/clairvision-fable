import redis
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from clairvision_shared.db.models import Event
from clairvision_shared.schemas import ClusterPoint

from ..auth_deps import require_published_or_organizer
from ..deps import get_db, get_redis
from ..services.umap_service import get_cluster_points

router = APIRouter(prefix="/events/{event_id}", tags=["cluster"])


# Sync `def` on purpose: UMAP is CPU-heavy and must run in the threadpool,
# not on the event loop.
@router.get("/cluster", response_model=list[ClusterPoint])
def get_cluster(
    event: Event = Depends(require_published_or_organizer),
    db: Session = Depends(get_db),
    r: redis.Redis = Depends(get_redis),
) -> list[ClusterPoint]:
    return get_cluster_points(db, r, event.id)
