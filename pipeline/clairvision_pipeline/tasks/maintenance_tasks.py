"""Maintenance tasks the API enqueues but cannot run itself.

delete_event_index: the API's faiss_indexes mount is read-only (only the
worker writes/deletes there), so removing a deleted event's FAISS
directory has to happen on the worker side — same "API enqueues, worker
executes" separation as orchestrate_event.
"""
import logging
import shutil

from clairvision_shared.faiss_paths import event_index_dir

from ..celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="pipeline.delete_event_index")
def delete_event_index(event_id: str) -> None:
    """Best-effort removal of an event's FAISS index directory. Idempotent:
    a missing directory (zero-face event, or a retry) is a no-op."""
    path = event_index_dir(event_id)
    shutil.rmtree(path, ignore_errors=True)
    logger.info("removed FAISS index directory for event %s (%s)", event_id, path)
