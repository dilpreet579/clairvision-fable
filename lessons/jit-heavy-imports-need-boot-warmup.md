# JIT-heavy libraries (umap/numba) need a boot-time warmup, not lazy import

> The first /cluster request took 70 seconds — not UMAP computing, but numba JIT-compiling on first import; a daemon-thread warmup at API startup absorbs it invisibly.

**Type**: correction (Phase 9)

**Why it mattered**: lazy imports are the right default for heavy deps, but for
numba-backed libraries the deferred cost isn't load time, it's *compilation* time —
and it lands on whichever user makes the first request. 70s looks like a hang, not
a slow endpoint. The actual UMAP fit afterwards is fast, and cached responses are
~75ms.

**How to apply**: keep the lazy import in the service, but fire a
`threading.Thread(target=lambda: import umap, daemon=True)` from the FastAPI
lifespan hook (see `api/clairvision_api/main.py`). Same pattern applies to any
future numba/JAX/triton-style dependency. Boot stays fast (thread is background);
the first request only blocks if it arrives within the first ~minute after boot.
