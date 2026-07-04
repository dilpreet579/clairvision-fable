# Lessons

Working memory for this project. One lesson per file under `lessons/`, each with a
one-line summary at the top. Maintained by Claude during development; humans welcome
to add/edit.

## Rules

- **One lesson per file**, one-line summary at the top.
- Record **corrections and confirmed approaches alike**, always with *why it mattered*.
- **Don't** record what the repo, code comments, or git history already record.
- **Update** an existing lesson rather than creating a near-duplicate.
- **Delete** lessons that turn out to be wrong.

## Index

- [clip-quickgelu-variant](lessons/clip-quickgelu-variant.md) — open_clip's plain configs silently run OpenAI CLIP weights with the wrong activation.
- [validate-test-assets-before-pipeline-runs](lessons/validate-test-assets-before-pipeline-runs.md) — synthetic images from one generator all cluster as "duplicates"; check pairwise CLIP sims offline first.
- [schema-dims-are-a-guardrail](lessons/schema-dims-are-a-guardrail.md) — hard-typed VECTOR dims caught a wrong model in testing; keep them strict.
- [per-image-isolation-proved-in-failure](lessons/per-image-isolation-proved-in-failure.md) — a run where 100% of images failed still ended in a clean terminal state; keep this pattern for all future stages.
- [facenet-pytorch-needs-no-deps](lessons/facenet-pytorch-needs-no-deps.md) — facenet-pytorch pins an ancient torch; install with --no-deps everywhere, including Docker.
- [celery-on-windows-dev](lessons/celery-on-windows-dev.md) — worker needs --pool=solo on Windows and a restart after any shared-code change.
- [smoke-test-fetch-paths-end-to-end](lessons/smoke-test-fetch-paths-end-to-end.md) — unit-green code still had a URL-joining bug only a real run caught.
- [blur-threshold-vs-soft-focus](lessons/blur-threshold-vs-soft-focus.md) — Laplacian gate rejects artistic soft-focus portraits; accepted tradeoff, revisit with real event photos.
- [dev-workflow-conventions](lessons/dev-workflow-conventions.md) — confirmed working agreements: venv for iteration + Docker as truth, commit per verified phase, SOURCE_FETCH_ALLOW_PRIVATE for local test sources.
- [security-tests-need-prod-posture](lessons/security-tests-need-prod-posture.md) — the dev SSRF flag legitimately opens the gate being tested; security checks must run with dev flags off.
- [compose-env-file-optional](lessons/compose-env-file-optional.md) — `env_file: .env` breaks every compose command on fresh clones; use the `required: false` long-form.
