# Verify the code inside a container after rebuilding — builds can silently no-op

> A `docker compose build` completed exit-0 but the running worker still had the old NIMA class; 37 per-image failures later, `docker images` showed the tag still pointed at the pre-edit image.

**Type**: correction (real-event test, stale-image incident)

**Why it mattered**: exit code 0 from `build` + `up -d` is not proof the container
runs new code. Compounding it, model preload failures didn't stop the worker — it
reported `ready.` and then failed every task at inference time (now fixed:
`preload_models` does `os._exit(1)` on any load failure, so a worker that can't
load models never consumes tasks).

**How to apply**: after any rebuild that matters, verify *inside* the container —
e.g. `docker compose exec <svc> python -c "import inspect; ..."` asserting on a
distinctive source string, or check `docker images` creation time vs edit time.
When in doubt: `build --no-cache` + `up -d --force-recreate`. The root
`.dockerignore` (added same day) also keeps context hashing lean and predictable.
