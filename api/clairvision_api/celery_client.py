"""Thin Celery producer — the API only enqueues, it never runs pipeline code."""
from functools import lru_cache

from celery import Celery

from clairvision_shared.config import get_settings


@lru_cache
def _client() -> Celery:
    settings = get_settings()
    return Celery("clairvision_api", broker=settings.celery_broker_url)


def enqueue_orchestrate_event(event_id: str) -> None:
    _client().send_task("pipeline.orchestrate_event", args=[event_id])


def enqueue_delete_event_index(event_id: str) -> None:
    """FAISS-directory cleanup runs on the worker (read-write mount); the
    API can only enqueue it."""
    _client().send_task("pipeline.delete_event_index", args=[event_id])
