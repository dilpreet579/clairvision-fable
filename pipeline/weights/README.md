# Model weights

## nima.pth

Pretrained NIMA weights (MobileNetV2 backbone + 10-way softmax head, the
architecture in `clairvision_pipeline/models/nima_model.py`). The checkpoint
must be a plain `state_dict` loadable with `strict=True` against that module.

Common sources: train per the NIMA paper (Talebi & Milanfar, 2018) on AVA, or
convert a public PyTorch NIMA(MobileNetV2) checkpoint. Place the file here as
`nima.pth`; it is mounted read-only into the pipeline container at
`/app/weights/nima.pth` (NIMA_WEIGHTS_PATH).

For a plumbing-only smoke test (scores will be meaningless), you can generate
random-initialized weights:

```python
import torch
from clairvision_pipeline.models.nima_model import NIMA
torch.save(NIMA().state_dict(), "pipeline/weights/nima.pth")
```
