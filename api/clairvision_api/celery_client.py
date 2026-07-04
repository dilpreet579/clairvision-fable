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
