# CLIP: always load the -quickgelu config for OpenAI weights

> open_clip's plain `ViT-L-14` config runs OpenAI-pretrained weights with the wrong activation (nn.GELU vs QuickGELU), silently degrading every embedding.

**Type**: correction (caught during Stage 2 verification)

**Why it mattered**: the mismatch produces no error — just a one-line `UserWarning`
buried in startup logs — while every embedding is computed through the wrong
activation function. Duplicate clustering quality would have quietly suffered with
nothing pointing at the cause. Fixed in `pipeline/.../models/clip_model.py` by
mapping the env model name to the `-quickgelu` open_clip config.

**How to apply**: treat model-loading warnings as errors during review — especially
"config mismatch" style warnings, which mean *wrong results*, not *cosmetic noise*.
If another OpenAI-pretrained CLIP variant is ever configured, it needs `-quickgelu`
too.
