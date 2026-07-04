"""NIMA (Neural Image Assessment) — learned aesthetic/technical quality, 0-10.

MobileNetV2 backbone + 10-way softmax head over score buckets 1..10;
the scalar score is the distribution's expected value. Pretrained weights
are loaded from NIMA_WEIGHTS_PATH (see pipeline/weights/README.md for the
expected checkpoint format).
"""
import torch
import torch.nn as nn
import torchvision.transforms as T
from torchvision.models import mobilenet_v2

from clairvision_shared.io.image_utils import PILImage


class NIMA(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        base = mobilenet_v2(weights=None)
        self.features = base.features
        self.pool = nn.AdaptiveAvgPool2d(1)
        self.classifier = nn.Sequential(
            nn.Dropout(0.75),
            nn.Linear(base.last_channel, 10),
            nn.Softmax(dim=1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.features(x)
        x = self.pool(x).flatten(1)
        return self.classifier(x)


class NimaScorer:
    def __init__(self, weights_path: str, device: str) -> None:
        self.device = device
        self.model = NIMA()
        state = torch.load(weights_path, map_location=device, weights_only=True)
        self.model.load_state_dict(state)
        self.model.to(device).eval()
        self.transform = T.Compose(
            [
                T.Resize(256),
                T.CenterCrop(224),
                T.ToTensor(),
                T.Normalize(
                    mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]
                ),
            ]
        )
        self._buckets = torch.arange(1, 11, dtype=torch.float32, device=device)

    @torch.no_grad()
    def score(self, img: PILImage.Image) -> float:
        x = self.transform(img).unsqueeze(0).to(self.device)
        dist = self.model(x)[0]
        return float((dist * self._buckets).sum().item())
