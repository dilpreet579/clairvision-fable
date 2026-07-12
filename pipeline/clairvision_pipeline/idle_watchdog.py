"""Idle-watchdog for the on-demand pipeline EC2 VM.

Runs alongside the Celery worker (see standalone-entrypoint.sh) — only on
the standalone EC2 deployment, never in local dev / CI, which don't invoke
this module. Polls for idleness and, once idle for
`pipeline_idle_grace_seconds` consecutive seconds, self-terminates the
instance via the EC2 API so the VM doesn't run (and bill) forever after its
last event finishes.

"Idle" requires ALL THREE of:
  - no active/reserved tasks on this Celery worker
  - the Redis `celery` queue is empty
  - no Event row is currently PROCESSING in Postgres

Postgres status alone is not enough: there is a gap between two chords of
the same event where no row is PROCESSING yet more work is about to be
dispatched. The Celery inspect + queue-length checks close that gap.
Hysteresis (consecutive idle polls) further guards against killing the VM
mid-transition.
"""
import logging
import time

import boto3
import redis
import requests

from clairvision_shared.config import get_settings
from clairvision_shared.db.enums import EventStatus
from clairvision_shared.db.models import Event
from clairvision_shared.db.session import get_sessionmaker

from .celery_app import celery_app

logger = logging.getLogger(__name__)

_IMDS_TOKEN_URL = "http://169.254.169.254/latest/api/token"
_IMDS_INSTANCE_ID_URL = "http://169.254.169.254/latest/meta-data/instance-id"
_IMDS_TOKEN_TTL_SECONDS = "21600"
_CELERY_QUEUE_NAME = "celery"


def _is_celery_idle() -> bool:
    """No task active or reserved on this worker right now."""
    inspect = celery_app.control.inspect(timeout=5)
    active = inspect.active() or {}
    reserved = inspect.reserved() or {}
    has_active = any(tasks for tasks in active.values())
    has_reserved = any(tasks for tasks in reserved.values())
    return not has_active and not has_reserved


def _is_queue_empty() -> bool:
    """No task waiting in Redis to be picked up either."""
    settings = get_settings()
    client = redis.Redis.from_url(settings.redis_url)
    return client.llen(_CELERY_QUEUE_NAME) == 0


def _has_processing_event() -> bool:
    """No Event row mid-pipeline in Postgres."""
    Session = get_sessionmaker()
    with Session() as session:
        return (
            session.query(Event.id)
            .filter(Event.status == EventStatus.PROCESSING)
            .first()
            is not None
        )


def _is_idle() -> bool:
    return _is_celery_idle() and _is_queue_empty() and not _has_processing_event()


def _get_own_instance_id() -> str:
    """IMDSv2: token first, then the metadata GET using that token."""
    token_resp = requests.put(
        _IMDS_TOKEN_URL,
        headers={"X-aws-ec2-metadata-token-ttl-seconds": _IMDS_TOKEN_TTL_SECONDS},
        timeout=5,
    )
    token_resp.raise_for_status()
    token = token_resp.text

    id_resp = requests.get(
        _IMDS_INSTANCE_ID_URL,
        headers={"X-aws-ec2-metadata-token": token},
        timeout=5,
    )
    id_resp.raise_for_status()
    return id_resp.text


def _terminate_self() -> None:
    settings = get_settings()
    instance_id = _get_own_instance_id()
    logger.critical(
        "idle-watchdog: instance %s idle for >= %ds — self-terminating now "
        "(this is the last line this process will ever log)",
        instance_id, settings.pipeline_idle_grace_seconds,
    )
    ec2 = boto3.client("ec2", region_name=settings.aws_region)
    ec2.terminate_instances(InstanceIds=[instance_id])


def run() -> None:
    settings = get_settings()
    consecutive_idle_seconds = 0
    logger.info(
        "idle-watchdog: starting — poll every %ds, terminate after %ds "
        "consecutive idle",
        settings.pipeline_idle_poll_seconds, settings.pipeline_idle_grace_seconds,
    )
    while True:
        time.sleep(settings.pipeline_idle_poll_seconds)
        try:
            if _is_idle():
                consecutive_idle_seconds += settings.pipeline_idle_poll_seconds
                logger.info(
                    "idle-watchdog: idle (%ds/%ds consecutive)",
                    consecutive_idle_seconds, settings.pipeline_idle_grace_seconds,
                )
                if consecutive_idle_seconds >= settings.pipeline_idle_grace_seconds:
                    _terminate_self()
                    return
            else:
                if consecutive_idle_seconds:
                    logger.info(
                        "idle-watchdog: activity detected, resetting idle counter"
                    )
                consecutive_idle_seconds = 0
        except Exception:
            # A transient Postgres/Redis/Celery-inspect hiccup must not kill
            # this loop — that would strand the VM running (and billing)
            # forever with no idle-detection at all.
            logger.exception("idle-watchdog: poll iteration failed, continuing")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
