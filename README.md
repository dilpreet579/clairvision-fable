# ClairVision

AI-powered event photo curation. A photographer submits an event (name + source URL of a
remote image collection); a three-stage ML pipeline filters blurry shots, collapses
near-duplicate bursts to the single best frame, and builds a face-identity index — then a
web gallery serves the curated results with instant face search and a CLIP-embedding
cluster map.

**Architecture**: a GPU-bound batch pipeline (Celery worker) fully decoupled from a
CPU-only always-on web stack (FastAPI + Next.js). Original images are never stored on
disk — bytes stream from the source URL, embeddings and metadata are the only things
persisted (PostgreSQL + pgvector as source of truth; per-event FAISS indexes as derived
search accelerators).

> **Security note**: v1 has no authentication by design (single-operator internal tool).
> All published ports are bound to `127.0.0.1`. Do **not** expose this stack to the
> internet as-is.

## Status

Phase 1 (foundation) complete: shared package, database schema, Docker Compose
(db + redis). Pipeline stages, API, and frontend land in subsequent phases —
see the build order in the project spec (`clairvisionProject.txt`).

## Setup

Prerequisites: Docker + Docker Compose; Python 3.11 (for running migrations locally);
NVIDIA container runtime (for the pipeline worker, from Phase 2 onward).

```bash
# 1. Configure environment (values are pre-tuned for accuracy — don't change
#    thresholds unless you know why; each has an explanatory comment)
cp .env.example .env

# 2. Start infrastructure
docker compose up -d db redis

# 3. Install the shared package + run migrations
pip install -e shared
alembic upgrade head
```

## Triggering a pipeline run

(From Phase 2 onward.) Submit an event via the API — `POST /events` with
`{"name": "...", "source_url": "https://..."}` — or through the web UI's ingestion form.
Pipeline status progresses `pending → processing → ready` (or `failed` with an error
message). The gallery becomes accessible once ready.

## Repository layout

```
shared/     clairvision_shared — config, DB models/enums, API schemas, hardened source fetcher
pipeline/   GPU Celery worker: 3-stage ML pipeline (Phase 2+)
api/        CPU-only FastAPI service (Phase 5+)
frontend/   Next.js 14 App Router UI (Phase 6+)
infra/      Postgres init + Alembic migrations, ops scripts
```
