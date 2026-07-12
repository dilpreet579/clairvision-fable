# Cleanup tasks can't assume an on-demand worker will be there to run them

> `delete_event` enqueued `pipeline.delete_event_index` for a Celery worker
> to consume, then evicted the local cache and committed the DB delete. That
> worked when a worker was always running (local dev, the old always-on
> GPU box) but the whole point of the on-demand pipeline VM is that it
> self-terminates once idle — by the time an organizer deletes an old
> event, there's usually *no* worker running at all, so the enqueued task
> just sits in an empty queue forever and the S3 FAISS index is orphaned.

**Type**: correction

**Why it mattered**: this is an architectural assumption that held for the
entire life of the project until the on-demand worker was introduced, and
nothing about it looked wrong in code review — `enqueue_X` reads the same
whether or not something is guaranteed to consume the queue. Caught by
actually deleting a real test event and checking S3 afterward, not by
reasoning about the code.

**How to apply**: once any consumer becomes optional/ephemeral (spins up
on demand, terminates when idle), audit every producer that assumes a
consumer exists — not just the "happy path" ones (event creation, which
already triggers a spin-up) but the cleanup/maintenance ones too, which
are easy to forget precisely because they're not on the main feature path.
Where the action is simple enough (a single S3 delete, here), doing it
directly from the always-on caller — instead of only enqueuing for a
worker that may never come — removes the dependency entirely.
