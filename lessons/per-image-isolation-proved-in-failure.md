# Per-image isolation + stage guards survived a 100%-failure run

> A run where every single image failed (bad URL join) still ended in a clean terminal state — no hung event, no crashed chord, full error audit trail.

**Type**: confirmed approach

**Why it mattered**: the design goal "an event can never hang in processing" was
proven by accident before it was proven on purpose. All 10 images 404'd, each was
individually marked `failed` with a `pipeline_task_errors` row, the chord callback
still fired, the empty-set guard saw zero survivors, and the event resolved to
`ready` with 0 images. Separately, the `link_error` callback flipped an event to
`failed` with a readable ChordError when a task raised unexpectedly.

**How to apply**: every future per-item pipeline task copies this exact shape:
catch-all inside the task body → log to `pipeline_task_errors` → mark the item
failed → **return normally, never raise**. Every chord callback starts with an
explicit "did anything survive?" guard, and every chord gets `.on_error(...)`
attached. Deviating from this shape reintroduces the stuck-in-processing failure
mode.
