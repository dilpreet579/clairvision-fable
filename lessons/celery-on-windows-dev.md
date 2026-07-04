# Celery dev-worker on Windows: --pool=solo, restart after shared-code edits

> The prefork pool doesn't work on Windows; and because models + code load at process init, a running worker never sees code changes.

**Type**: environment gotcha (confirmed twice)

**Why it mattered**: two silent-staleness traps. (1) Without `--pool=solo` the
worker fails or misbehaves on Windows. (2) After editing anything in `shared/` or
`pipeline/`, the running worker keeps executing the *old* code — the join_source_ref
fix looked ineffective until the worker was restarted.

**How to apply**: dev worker invocation is
`.venv/Scripts/python -m celery -A clairvision_pipeline.celery_app worker --loglevel=info --pool=solo`
with env: `POSTGRES_HOST=localhost`, `CELERY_BROKER_URL=redis://localhost:6379/0`,
`CELERY_RESULT_BACKEND=redis://localhost:6379/1`, `SOURCE_FETCH_ALLOW_PRIVATE=true`,
`NIMA_WEIGHTS_PATH=pipeline/weights/nima.pth`, and a Windows-valid
`FAISS_INDEX_PATH`. **Always stop + restart the worker after code changes** before
re-running a smoke test, or you are testing stale code.
