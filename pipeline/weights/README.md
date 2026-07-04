# Model weights

## nima.pth

AVA-trained NIMA weights: VGG16 conv backbone → global average pool →
`Linear(512, 10)` softmax head, matching `clairvision_pipeline/models/nima_model.py`
(loads with `strict=True`).

**Source**: `NIMA_VGG16_ava-dc4e8265.pth` from
https://huggingface.co/chaofengc/IQA-PyTorch-Weights (the pyiqa project's
mirror), converted to this module's key layout with:

```python
from clairvision_pipeline.models.nima_model import convert_pyiqa_checkpoint
convert_pyiqa_checkpoint("pipeline/weights/NIMA_VGG16_ava-dc4e8265.pth",
                         "pipeline/weights/nima.pth")
```

**Calibration record (2026-07-04)**, validating the spec's
`BLUR_NIMA_THRESHOLD=4.2`: real photos scored 5.6–5.9 (pass); heavily blurred
3.94 and blur+dark+noise 4.02 (reject); very dark 4.42 (borderline pass —
acceptable, AVA treats low-key photos as legitimate). Good/degraded separation
is clean around 4.2; do not raise above 4.5 per the spec's env comment.

Note: the same HF repo has `NIMA_koniq-250367ae.pth` (trained on KonIQ-10k,
*technical* distortion quality rather than AVA aesthetics). If real-event
tuning ever shows the aesthetic model passing technically-bad shots, that
checkpoint is the drop-in alternative to evaluate — different score
distribution, so the threshold would need recalibrating.

The file is volume-mounted read-only into the pipeline container at
`/app/weights/nima.pth` (NIMA_WEIGHTS_PATH).
