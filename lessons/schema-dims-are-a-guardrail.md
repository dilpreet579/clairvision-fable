# Hard-typed VECTOR dims are a guardrail — keep them strict

> `VECTOR(768)` rejected a 512-dim test model at insert time, enforcing the spec's "do not downgrade CLIP" rule at the database layer.

**Type**: confirmed approach

**Why it mattered**: I tried to shortcut a smoke test with ViT-B/32 (512-dim) to
avoid the 1.7 GB ViT-L/14 download; the schema refused the insert and the event
failed loudly with a clear dim-mismatch error. The "inconvenience" was the schema
doing its job — any accidental model substitution in production would be caught the
same way instead of silently polluting the index with incompatible vectors.

**How to apply**: never loosen the vector column dims or make them configurable.
Plumbing tests must use the real product models (weights download once, then cache
in `~/.cache/huggingface` and `~/.insightface`). Side effect worth keeping: the
failure also motivated isolating per-image *persist* errors (`PERSIST_FAILED`) like
any other per-image failure.
