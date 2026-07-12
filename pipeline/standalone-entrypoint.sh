#!/bin/bash
# Entrypoint for the on-demand EC2 pipeline VM only — NOT used by local dev
# or CI, which keep the Dockerfile's default CMD. Runs the idle-watchdog
# alongside the Celery worker so the VM can detect its own idleness and
# self-terminate; started via `docker run ... {image} /app/standalone-entrypoint.sh`.
set -e

python -m clairvision_pipeline.idle_watchdog &
exec python -m celery -A clairvision_pipeline.celery_app worker --loglevel=info -Q celery --concurrency=1
