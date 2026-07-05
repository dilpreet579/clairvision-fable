"""Redis-only image serving — no image bytes ever touch disk.

Keys: img:{event_id}:{image_id}:orig (re-encoded JPEG) and
img:{event_id}:{image_id}:thumb:{size}. Fixed-window TTLs from settings;
Redis allkeys-lru is the backstop. Cache miss re-streams from the event's
source URL through the shared SSRF-hardened fetcher, re-encodes (we never
echo raw fetched bytes), and populates both variants.
"""
import uuid

import redis
from sqlalchemy.orm import Session

from clairvision_shared.config import get_settings
from clairvision_shared.db.models import Event, Image
from clairvision_shared.io.image_utils import (
    ImageDecodeError,
    decode_image,
    encode_jpeg,
    make_thumbnail,
)
from clairvision_shared.io.source_fetcher import fetch_bytes, join_source_ref


class ImageNotFound(Exception):
    pass


class SourceUnavailable(Exception):
    """Image exists in our DB but the source can't serve it right now."""


def _orig_key(event_id: uuid.UUID, image_id: uuid.UUID) -> str:
    return f"img:{event_id}:{image_id}:orig"


def _thumb_key(event_id: uuid.UUID, image_id: uuid.UUID, size: int) -> str:
    return f"img:{event_id}:{image_id}:thumb:{size}"


def _fetch_and_cache_original(
    db: Session, r: redis.Redis, event_id: uuid.UUID, image_id: uuid.UUID
) -> bytes:
    image = db.get(Image, image_id)
    if image is None or image.event_id != event_id:
        raise ImageNotFound()
    event = db.get(Event, event_id)
    try:
        url = join_source_ref(event.source_url, image.source_ref)
        raw = fetch_bytes(url)
        jpeg = encode_jpeg(decode_image(raw))
    except ImageDecodeError as exc:
        raise SourceUnavailable(f"source returned undecodable bytes: {exc}") from exc
    except Exception as exc:
        raise SourceUnavailable(str(exc)) from exc
    r.setex(
        _orig_key(event_id, image_id),
        get_settings().image_cache_ttl_original_seconds,
        jpeg,
    )
    return jpeg


def get_original(
    db: Session, r: redis.Redis, event_id: uuid.UUID, image_id: uuid.UUID
) -> bytes:
    cached = r.get(_orig_key(event_id, image_id))
    if cached is not None:
        return cached
    return _fetch_and_cache_original(db, r, event_id, image_id)


def purge_event_cache(r: redis.Redis, event_id: uuid.UUID) -> int:
    """Delete every cached image byte-string AND cluster projection for an
    event (used on event delete). scan_iter, not blocking KEYS. Returns the
    number of keys removed."""
    removed = 0
    pipe = r.pipeline()
    for pattern in (f"img:{event_id}:*", f"cluster:{event_id}:*"):
        for key in r.scan_iter(match=pattern, count=500):
            pipe.delete(key)
            removed += 1
    pipe.execute()
    return removed


def get_thumbnail(
    db: Session, r: redis.Redis, event_id: uuid.UUID, image_id: uuid.UUID, size: int
) -> bytes:
    key = _thumb_key(event_id, image_id, size)
    cached = r.get(key)
    if cached is not None:
        return cached
    orig = get_original(db, r, event_id, image_id)
    thumb = make_thumbnail(decode_image(orig), size)
    r.setex(key, get_settings().image_cache_ttl_thumbnail_seconds, thumb)
    return thumb
