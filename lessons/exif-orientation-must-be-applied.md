# EXIF orientation must be applied at decode or portrait photos arrive sideways

> Real DSLR portrait shots store rotation as EXIF metadata; without ImageOps.exif_transpose the decoded pixels are sideways — MTCNN face recall collapses and stored width/height are transposed.

**Type**: correction (first real-event test)

**Why it mattered**: every synthetic/test image so far had no EXIF, so nothing
caught it. Spotted only by *looking at* a downloaded real photo during threshold
debugging — it rendered rotated 90°. Sideways faces are the worst kind of failure
for this system: face search silently misses people (the spec's critical failure
mode) with no error anywhere.

**How to apply**: `decode_image` in `shared/clairvision_shared/io/image_utils.py`
now applies `ImageOps.exif_transpose` for every consumer (pipeline stages, API
image serving, selfie upload). Any future decode path added outside this helper
must do the same — better: never decode outside this helper.
