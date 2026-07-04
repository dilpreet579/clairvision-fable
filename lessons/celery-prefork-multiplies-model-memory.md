# Celery prefork multiplies model memory by core count — pin concurrency

> In the Linux container the default prefork pool spawned 8 children, EACH loading its own full copy of CLIP+NIMA+MTCNN+ArcFace (~4GB+ per child, 8 simultaneous CLIP downloads).

**Type**: correction (containerized regression)

**Why it mattered**: the venv never showed this — Windows forces `--pool=solo`, one
process. The container defaulted to `nproc` children, and because models load per
worker process (the `worker_process_init` design, correct for CUDA), memory usage
multiplies by core count. On a GPU box this would mean N processes fighting over
one GPU's VRAM.

**How to apply**: both pipeline Dockerfiles pin `--concurrency=1`. Scale throughput
with more *containers* (one per GPU), not more pool children. If per-container
parallelism is ever wanted for CPU-only work, raise concurrency deliberately with a
RAM budget of roughly (model footprint × children).
