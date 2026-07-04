# Build context = repo root (so shared/ can be copied).
FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3.11 python3.11-venv python3-pip libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && python3.11 -m pip install --upgrade pip

WORKDIR /app

COPY shared/ /app/shared/
RUN python3.11 -m pip install -e /app/shared

COPY pipeline/pyproject.toml /app/pipeline/pyproject.toml
COPY pipeline/clairvision_pipeline/ /app/pipeline/clairvision_pipeline/
RUN python3.11 -m pip install -e /app/pipeline \
    # facenet-pytorch pins torch<2.3; --no-deps avoids the conflict (its
    # runtime needs are already installed by the pipeline package).
    && python3.11 -m pip install --no-deps "facenet-pytorch>=2.6"

# NIMA weights and FAISS indexes are volume-mounted at runtime:
#   ./pipeline/weights -> /app/weights (ro), faiss_indexes -> /app/indexes

CMD ["python3.11", "-m", "celery", "-A", "clairvision_pipeline.celery_app", \
     "worker", "--loglevel=info", "-Q", "celery"]
