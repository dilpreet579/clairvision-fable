# Laplacian variance is resolution-dependent — normalize before thresholding

> The first real-event run rejected ALL 95 downloadable photos as "blurry": full-res 24MP DSLR shots score 5–80 where web-size images score hundreds; the fix is scoring on a fixed 1024px reference edge, and the threshold then needed data-driven recalibration (80 → 25 locally).

**Type**: correction (first real-event test, 133 R2-hosted DSLR photos)

**Why it mattered**: the spec's `BLUR_LAPLACIAN_THRESHOLD=80` implicitly assumed a
resolution. On raw DSLR files the variance shrinks (proportionally more smooth area
per edge pixel), so a "calibrated" threshold silently became reject-everything.
After normalization (`LAPLACIAN_REF_EDGE=1024` in shared constants), measured
distribution on the real set: genuine blur ≤6, in-focus shallow-DoF portraits
37–43 (visually verified keepers), unambiguously sharp shots 100–1050.

**How to apply**: scores are now resolution-independent — thresholds transfer
across events regardless of camera. 80 still rejects in-focus bokeh portraits, so
this deployment's `.env` overrides `BLUR_LAPLACIAN_THRESHOLD=25` (4× above the
blur ceiling, below the keeper floor); `.env.example` keeps the spec's 80.
When tuning for a new photography style, pull `laplacian_score` per status from
Postgres and place the threshold between the blur ceiling and the keeper floor —
and *look at* the borderline images before deciding (two "rejects" here were
keeper portraits from a burst).
