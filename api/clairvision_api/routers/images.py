import uuid

import redis
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from clairvision_shared.constants import THUMBNAIL_SIZES

from ..deps import get_db, get_redis
from ..services import image_cache_service as cache

router = APIRouter(prefix="/events/{event_id}/images/{image_id}", tags=["images"])


def _serve(fn, *args) -> Response:
    try:
        body = fn(*args)
    except cache.ImageNotFound:
        raise HTTPException(status_code=404, detail="image not found")
    except cache.SourceUnavailable as exc:
        # Distinct from 404: exists in our DB, source can't serve it now.
        raise HTTPException(status_code=502, detail=f"source unavailable: {exc}")
    return Response(content=body, media_type="image/jpeg")


@router.get("/full")
def get_full_image(
    event_id: uuid.UUID,
    image_id: uuid.UUID,
    db: Session = Depends(get_db),
    r: redis.Redis = Depends(get_redis),
) -> Response:
    return _serve(cache.get_original, db, r, event_id, image_id)


@router.get("/thumbnail")
def get_thumbnail(
    event_id: uuid.UUID,
    image_id: uuid.UUID,
    size: int = Query(...),
    db: Session = Depends(get_db),
    r: redis.Redis = Depends(get_redis),
) -> Response:
    # Whitelist, not a free integer — otherwise one client can explode the
    # Redis keyspace and burn CPU on arbitrary resizes.
    if size not in THUMBNAIL_SIZES:
        raise HTTPException(
            status_code=422, detail=f"size must be one of {list(THUMBNAIL_SIZES)}"
        )
    return _serve(cache.get_thumbnail, db, r, event_id, image_id, size)
