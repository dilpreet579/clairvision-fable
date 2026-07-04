# Laplacian blur gate rejects artistic soft-focus portraits

> A perfectly good soft-focus glamour portrait scored Laplacian variance below 80 and was rejected at Stage 1 — by design, but worth knowing when tuning.

**Type**: observation / accepted tradeoff

**Why it mattered**: the spec explicitly prefers false rejections over blurry images
in the gallery, so this is correct behavior — but it demonstrates the *kind* of image
the threshold sacrifices: shallow depth-of-field portraits, dreamy/hazy styles,
motion-intent shots. On a real event set the rejection rate of intentional
soft-focus work is worth measuring before declaring the default final.

**How to apply**: when a photographer reports "missing" images, check
`images.status = 'stage1_rejected_blur'` and the stored `laplacian_score` first.
Tuning knob is `BLUR_LAPLACIAN_THRESHOLD` (lower = more permissive); per the spec's
env comments, adjust deliberately and never let clearly blurry images through.
