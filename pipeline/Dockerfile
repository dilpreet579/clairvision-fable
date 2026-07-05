# Build context = repo root (so shared/ can be copied).
#
# Ubuntu 24.04 base (not 22.04/jammy): jammy's python3.11 apt package is
# stuck at 3.11.0rc1, which predates sys.get_int_max_str_digits (a
# security addition finalized only in the real 3.11.0 release) — modern
# torch._dynamo imports unconditionally reference it and crash at import
# time. 24.04's python3 (3.12) is a proper release build.
FROM nvidia/cuda:12.6.3-cudnn-runtime-ubuntu24.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_BREAK_SYSTEM_PACKAGES=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-venv python3-pip libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
# Not upgrading pip here: apt's pip (24.0) is sufficient, and `pip install
# --upgrade pip` fails trying to uninstall the apt-managed copy (no RECORD
# file — a Debian/pip packaging conflict, not specific to this image).

WORKDIR /app

COPY shared/ /app/shared/
RUN python3 -m pip install -e /app/shared

COPY pipeline/pyproject.toml /app/pipeline/pyproject.toml
COPY pipeline/clairvision_pipeline/ /app/pipeline/clairvision_pipeline/
RUN python3 -m pip install -e /app/pipeline \
    # facenet-pytorch pins torch<2.3; --no-deps avoids the conflict (its
    # runtime needs are already installed by the pipeline package).
    && python3 -m pip install --no-deps "facenet-pytorch>=2.6"

# NIMA weights and FAISS indexes are volume-mounted at runtime:
#   ./pipeline/weights -> /app/weights (ro), faiss_indexes -> /app/indexes

# concurrency=1: every prefork child loads its OWN copy of all models
# into VRAM/RAM; one process per GPU. Scale via multiple containers, not
# pool children.
CMD ["python3", "-m", "celery", "-A", "clairvision_pipeline.celery_app", \
     "worker", "--loglevel=info", "-Q", "celery", "--concurrency=1"]
