# Build context = repo root (so shared/ can be copied). CPU-only by design.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY shared/ /app/shared/
RUN pip install -e /app/shared

COPY api/pyproject.toml /app/api/pyproject.toml
COPY api/clairvision_api/ /app/api/clairvision_api/
# Pre-install torch from the CPU wheel index (this container is CPU-only
# by design). Done FIRST and pinned to the cpu index: with a mere
# --extra-index-url, pip can resolve torch from PyPI instead, pulling
# multi-GB CUDA libraries for nothing.
RUN pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu \
    && pip install -e /app/api \
    # facenet-pytorch pins torch<2.3; --no-deps avoids the conflict.
    && pip install --no-deps "facenet-pytorch>=2.6"

# FAISS indexes are volume-mounted read-only at /app/indexes (Phase 7).

# Migrations aren't run from the host in production (unlike local dev) —
# the deploy pipeline runs `alembic upgrade head` inside this image instead,
# so alembic.ini and the migration scripts need to be present here too.
COPY alembic.ini /app/alembic.ini
COPY infra/postgres/migrations/ /app/infra/postgres/migrations/

CMD ["uvicorn", "clairvision_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
