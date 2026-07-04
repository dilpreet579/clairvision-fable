# Build context = repo root (so shared/ can be copied). CPU-only by design.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY shared/ /app/shared/
RUN pip install -e /app/shared

COPY api/pyproject.toml /app/api/pyproject.toml
COPY api/clairvision_api/ /app/api/clairvision_api/
# CPU torch wheel index — this container is CPU-only by design; the
# default PyPI torch would pull multi-GB CUDA libraries for nothing.
RUN pip install -e /app/api \
        --extra-index-url https://download.pytorch.org/whl/cpu \
    # facenet-pytorch pins torch<2.3; --no-deps avoids the conflict.
    && pip install --no-deps "facenet-pytorch>=2.6"

# FAISS indexes are volume-mounted read-only at /app/indexes (Phase 7).

CMD ["uvicorn", "clairvision_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
