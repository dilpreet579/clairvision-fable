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
- [jit-heavy-imports-need-boot-warmup](lessons/jit-heavy-imports-need-boot-warmup.md) — numba JIT makes the first UMAP request cost ~70s; warm the import in a daemon thread at API boot.
- [celery-prefork-multiplies-model-memory](lessons/celery-prefork-multiplies-model-memory.md) — default prefork spawned 8 children each loading all models; pin --concurrency=1, scale via containers.
- [next-public-env-is-baked-at-build](lessons/next-public-env-is-baked-at-build.md) — NEXT_PUBLIC_* inlines at build; without Docker build args the frontend image ships in mock mode.
- [laplacian-needs-resolution-normalization](lessons/laplacian-needs-resolution-normalization.md) — full-res DSLR photos scored 5–80 vs the 80 threshold (everything rejected); normalize to a 1024px edge, then recalibrate from data.
- [exif-orientation-must-be-applied](lessons/exif-orientation-must-be-applied.md) — DSLR portraits arrive sideways without exif_transpose; silently kills face recall.
- [verify-container-code-after-rebuild](lessons/verify-container-code-after-rebuild.md) — an exit-0 rebuild left the old image running; verify code inside the container, and preload failures now kill the worker instead of failing every task.
- [ubuntu-jammy-python311-is-rc1](lessons/ubuntu-jammy-python311-is-rc1.md) — jammy's python3.11 apt package is 3.11.0rc1 and crashes modern torch at import; GPU image now uses the 24.04 CUDA base. Includes verified T4 VRAM/benchmark facts.
- [passlib-bcrypt-incompatible](lessons/passlib-bcrypt-incompatible.md) — passlib is unmaintained and permanently broken against bcrypt 4.x; use the bcrypt package directly instead.
