from celery import Celery

from clairvision_shared.config import get_settings

settings = get_settings()

celery_app = Celery(
    "clairvision_pipeline",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "clairvision_pipeline.tasks.orchestration",
        "clairvision_pipeline.tasks.stage1_tasks",
        "clairvision_pipeline.tasks.stage2_tasks",
        "clairvision_pipeline.tasks.stage3_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    # Chord bookkeeping is the only consumer of results; status lives in Postgres.
    result_expires=3600,
    # Per-image tasks are small, but a whole event's run is long: a generous
    # visibility timeout prevents Redis redelivering in-flight tasks mid-run.
    # Tasks are idempotent (status-check-then-process) so a redelivery that
    # does slip through is harmless.
    broker_transport_options={"visibility_timeout": 43200},
    worker_prefetch_multiplier=1,
    task_track_started=True,
)
