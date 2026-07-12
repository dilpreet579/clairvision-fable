# ClairVision

AI-powered event photo curation. A photographer submits an event (name + source URL of a
remote image collection); a three-stage ML pipeline filters blurry shots, collapses
near-duplicate bursts to the single best frame, and builds a face-identity index — then a
web gallery serves the curated results with instant face search.

**Architecture**: a GPU-bound batch pipeline (Celery worker) fully decoupled from a
CPU-only always-on web stack (FastAPI + Next.js). Original images are never stored on
disk — bytes stream from the source URL, embeddings and metadata are the only things
persisted (PostgreSQL + pgvector as source of truth; per-event FAISS indexes as derived
search accelerators).

> **Security note**: v1 has no authentication by design (single-operator internal tool).
> All published ports are bound to `127.0.0.1`. Do **not** expose this stack to the
> internet as-is.

## Status

All spec features implemented and verified: 3-stage ML pipeline, gallery with
duplicate-group override, face search (selfie upload + click-a-face), and the
full containerized stack.

## Setup

Prerequisites: Docker + Docker Compose; Python 3.11 (for running migrations from the
host); NVIDIA container runtime only if using the GPU worker.

```bash
# 1. Configure environment (values are pre-tuned for accuracy — don't change
#    thresholds unless you know why; each has an explanatory comment)
cp .env.example .env

# 2. Build and start the stack
#    With an NVIDIA GPU:
docker compose --profile pipeline up -d --build
#    Without a GPU (dev/CI — same code, models fall back to CPU, slower):
docker compose --profile pipeline-cpu up -d --build

# 3. Run migrations (from the host, against the containerized Postgres)
pip install -e shared
POSTGRES_HOST=localhost alembic upgrade head
```

Frontend: http://localhost:3000 · API: http://localhost:8000 (both localhost-bound).
First worker boot downloads model weights (~2 GB, cached in a named volume);
NIMA weights must be placed at `pipeline/weights/nima.pth` (see
`pipeline/weights/README.md`).

## Triggering a pipeline run

Submit an event via the ingestion form at http://localhost:3000/events, or
`POST /events` with `{"name": "...", "source_url": "https://..."}`. The source URL
may be a JSON manifest (array of image refs, or `{"images": [...]}`) or an HTML
directory index. Pipeline status progresses `pending → processing → ready` (or
`failed` with an error message). The gallery becomes accessible once ready.

## Repository layout

```
shared/     clairvision_shared — config, DB models/enums, API schemas, hardened source fetcher
pipeline/   GPU Celery worker: 3-stage ML pipeline (Phase 2+)
api/        CPU-only FastAPI service (Phase 5+)
frontend/   Next.js 14 App Router UI (Phase 6+)
infra/      Postgres init + Alembic migrations, ops scripts
```
