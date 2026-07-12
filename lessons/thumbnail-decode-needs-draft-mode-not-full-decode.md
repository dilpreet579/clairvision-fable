# Full-resolution JPEG decode for a thumbnail is a real OOM risk

> `get_thumbnail` decoded the full cached original (a 24MP DSLR photo →
> ~35MB raw pixel data) just to shrink it to 400px, twice per image (once
> in `_fetch_and_cache_original`, again in `get_thumbnail`). A gallery
> firing off a handful of concurrent cold-cache thumbnail requests was
> enough to OOM-kill the API container on the web VM's 913MB RAM — caught
> live via `docker inspect` (`RestartCount: 2`) and a request log that
> jumps straight from a `200 OK` to `Started server process [1]` with no
> exception in between (the signature of a SIGKILL — no chance to log).

**Type**: correction

**Why it mattered**: this is invisible in local dev and in synthetic
testing with small images — it only bites with real, full-resolution
photos and real concurrent browser traffic (a gallery grid loading many
thumbnails at once). It's also a genuinely different problem from "not
enough RAM" — decoding 35MB to produce a 16KB thumbnail is *inherently*
wasteful regardless of instance size.

**How to apply**: when decoding an image only to produce a smaller result,
use the codec's native scaled decode instead of full-decode-then-resize.
PIL's JPEG draft mode (`img.draft("RGB", (max_size, max_size))` before
`img.load()`) decodes directly at the nearest DCT-native downscale (1/2,
1/4, 1/8) — verified 16x less memory and 5x faster on a real 24MP photo.
Keep the full-resolution decode path for callers that actually need every
pixel (pipeline processing, face-search embedding, viewing a full-size
original) — don't apply this globally, only at the specific call site that
only needs a small result.
