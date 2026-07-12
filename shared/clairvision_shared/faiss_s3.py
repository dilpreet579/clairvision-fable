"""S3 handoff for per-event FAISS face indexes.

The pipeline VM and the API's local FAISS cache are two independent
copies (no shared volume once the pipeline runs on its own EC2 host),
so S3 is the durable source of truth for a built index. Key convention:
s3://{bucket}/{event_id}/faces.index

Publication mirrors faiss_index/builder.py's own atomic-publish
pattern: download to a .tmp sibling, then os.replace onto the final
path, so a reader never observes a partially-written file.
"""
import logging
import os
import time

import boto3
from botocore.exceptions import ClientError

from clairvision_shared.config import get_settings
from clairvision_shared.faiss_paths import event_index_dir, faces_index_path

logger = logging.getLogger(__name__)

_UPLOAD_MAX_ATTEMPTS = 3
_UPLOAD_BACKOFF_BASE_SECONDS = 1


def _s3_client():
    settings = get_settings()
    return boto3.client("s3", region_name=settings.aws_region)


def _object_key(event_id: str) -> str:
    return f"{event_id}/faces.index"


def upload_face_index(event_id: str) -> None:
    """Uploads the local face index to S3. Retries with exponential
    backoff since a failed upload here means permanent data loss — the
    VM that built it is about to self-terminate. Raises after
    exhausting retries so the caller can route to its own failure path."""
    settings = get_settings()
    local_path = faces_index_path(event_id)
    key = _object_key(event_id)
    client = _s3_client()

    last_exc: Exception | None = None
    for attempt in range(1, _UPLOAD_MAX_ATTEMPTS + 1):
        try:
            client.upload_file(local_path, settings.s3_faiss_bucket, key)
            logger.info(
                "event %s: uploaded face index to s3://%s/%s (attempt %d)",
                event_id, settings.s3_faiss_bucket, key, attempt,
            )
            return
        except Exception as exc:
            last_exc = exc
            logger.warning(
                "event %s: face index upload attempt %d/%d failed: %s",
                event_id, attempt, _UPLOAD_MAX_ATTEMPTS, exc,
            )
            if attempt < _UPLOAD_MAX_ATTEMPTS:
                time.sleep(_UPLOAD_BACKOFF_BASE_SECONDS * (2 ** (attempt - 1)))

    logger.error(
        "event %s: face index upload failed after %d attempts, giving up",
        event_id, _UPLOAD_MAX_ATTEMPTS,
    )
    raise last_exc


def download_face_index(event_id: str) -> bool:
    """Ensures the local face index exists, lazily pulling it from S3 if
    not already present. Returns True if a local file exists after this
    call, False if S3 has no object for this event (expected for a
    zero-face event — not an error). Other S3 errors (auth, network)
    propagate."""
    final_path = faces_index_path(event_id)
    if os.path.exists(final_path):
        return True

    settings = get_settings()
    key = _object_key(event_id)
    client = _s3_client()

    tmp_path = f"{final_path}.tmp"
    os.makedirs(event_index_dir(event_id), exist_ok=True)
    try:
        client.download_file(settings.s3_faiss_bucket, key, tmp_path)
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code", "")
        status_code = (
            exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        )
        if error_code in ("404", "NoSuchKey") or status_code == 404:
            logger.info(
                "event %s: no face index at s3://%s/%s (zero-face event)",
                event_id, settings.s3_faiss_bucket, key,
            )
            try:
                os.remove(tmp_path)
            except OSError:
                pass
            return False
        raise

    os.replace(tmp_path, final_path)
    logger.info(
        "event %s: downloaded face index from s3://%s/%s",
        event_id, settings.s3_faiss_bucket, key,
    )
    return os.path.exists(final_path)


def delete_face_index(event_id: str) -> None:
    """Best-effort delete of the S3 object. This runs as cleanup on an
    already-committed delete, so failures are logged, never raised."""
    settings = get_settings()
    key = _object_key(event_id)
    try:
        client = _s3_client()
        client.delete_object(Bucket=settings.s3_faiss_bucket, Key=key)
        logger.info(
            "event %s: deleted face index s3://%s/%s",
            event_id, settings.s3_faiss_bucket, key,
        )
    except Exception as exc:
        logger.warning(
            "event %s: failed to delete face index s3://%s/%s: %s",
            event_id, settings.s3_faiss_bucket, key, exc,
        )
