# A worker death mid-chord wedges the event forever — three gaps compound

> The 4GB `c7i-flex.large` OOM-killed the worker on the *first* stage-2 task
> (CLIP ViT-L/14 + MTCNN ≈ 3.2GB RSS, on top of stage-1's still-resident models,
> exceeds ~4GB). That single transient kill left event `1e01708c` stuck
> `processing/stage2_duplicates` for ~10h with 0 embeddings and 0 error rows.

**Type**: correction (production incident, 2026-07-13)

**Why it mattered**: the OOM was only the trigger — three independent gaps turned a
recoverable transient failure into a *permanent* wedge, and none looks wrong in
isolation:
1. **Celery early-acks** (no `task_acks_late`), so the task the worker held when
   SIGKILL'd is gone — the stage-2 chord can never reach its expected count, so its
   `finalize_duplicate_groups` callback never fires.
2. The **idle-watchdog treats any `PROCESSING` event as "busy"**, so it never
   self-terminates a VM whose worker has already died; only the max-age safety-net
   eventually reaps the orphan (it saves the *VM*, not the *event*).
3. **Nothing re-launches a worker for an already-`PROCESSING` event** — the API only
   spins one up on event *creation* — so the queued embed tasks are never consumed.

A SIGKILL leaves **no error row**, so the DB looks clean; the only proof was the kernel
`Out of memory: Killed process` line from `aws ec2 get-console-output`, plus the Redis
queue length vs `clip_embeddings` count. A spot reclaim or any mid-run crash would wedge
an event exactly the same way.

**How to apply**:
- **Size the on-demand instance for a single worker's *peak* model footprint**, not just
  `--concurrency=1`: stage 2 needs ~3.2GB RSS, so `c7i-flex.large` (4GB) OOMs — use
  `m7i-flex.large` (8GB) or larger via `PIPELINE_INSTANCE_TYPE`. This is the memory
  *budget* companion to [celery-prefork-multiplies-model-memory](celery-prefork-multiplies-model-memory.md)
  (which fixed the *multiplier*).
- Set `task_acks_late=True` + `task_reject_on_worker_lost=True` in `celery_app.py` so a
  killed task is redelivered, not lost — tasks are already idempotent, so the chord can
  self-heal.
- Add a **resume path for events stuck in `PROCESSING`** with no live worker (a periodic
  sweep that re-drives or fails them). Same "on-demand worker may not exist" class as
  [async-cleanup-cant-depend-on-ephemeral-worker](async-cleanup-cant-depend-on-ephemeral-worker.md).
- **Manual recovery** (until the above land): relaunch a right-sized worker (one-off
  `docker exec -e PIPELINE_INSTANCE_TYPE=… api python -c 'ensure_pipeline_worker_running()'`),
  let it drain the queue, re-enqueue `pipeline.embed_image_clip` for `stage1_passed`
  images still missing a `clip_embedding`, then `send_task('pipeline.finalize_duplicate_groups', [[], event_id])`
  to push it through stage 3.
