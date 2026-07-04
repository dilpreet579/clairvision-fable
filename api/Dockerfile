# Build context = repo root (so shared/ can be copied). CPU-only by design.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY shared/ /app/shared/
RUN pip install -e /app/shared

COPY api/pyproject.toml /app/api/pyproject.toml
COPY api/clairvision_api/ /app/api/clairvision_api/
RUN pip install -e /app/api

# FAISS indexes are volume-mounted read-only at /app/indexes (Phase 7).

CMD ["uvicorn", "clairvision_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
