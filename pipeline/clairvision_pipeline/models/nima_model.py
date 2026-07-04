"""NIMA (Neural Image Assessment) — learned aesthetic/technical quality, 0-10.

VGG16 conv backbone -> global average pool -> 10-way softmax over score
buckets 1..10; the scalar score is the distribution's expected value
(Talebi & Milanfar, 2018). Weights: the AVA-trained VGG16 checkpoint from
pyiqa (chaofengc/IQA-PyTorch-Weights, NIMA_VGG16_ava), converted to this
module's layout by convert_pyiqa_checkpoint — see weights/README.md.
"""
import torch
import torch.nn as nn
import torchvision.transforms as T
from torchvision.models import vgg16

from clairvision_shared.io.image_utils import PILImage


class NIMA(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.features = vgg16(weights=None).features
        self.pool = nn.AdaptiveAvgPool2d(1)
        self.classifier = nn.Sequential(
            nn.Dropout(0.75),
            nn.Linear(512, 10),
            nn.Softmax(dim=1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.features(x)
        x = self.pool(x).flatten(1)
        return self.classifier(x)


def convert_pyiqa_checkpoint(src_path: str, dst_path: str) -> None:
    """Remap a pyiqa NIMA_VGG16_ava checkpoint into this module's layout.

    pyiqa names conv layers base_model.features_N (underscore); torchvision
    uses features.N (dot). pyiqa's head is classifier.2 (indices 0-1 are
    parameterless); ours is classifier.1. Result loads with strict=True.
    """
    ckpt = torch.load(src_path, map_location="cpu", weights_only=True)
    if isinstance(ckpt, dict) and "params" in ckpt:
        ckpt = ckpt["params"]
    remapped = {}
    for key, value in ckpt.items():
        if key.startswith("base_model.features_"):
            layer = key.removeprefix("base_model.features_")  # "N.weight"
            remapped[f"features.{layer}"] = value
        elif key.startswith("classifier.2."):
            remapped[key.replace("classifier.2.", "classifier.1.")] = value
        else:
            raise ValueError(f"unexpected checkpoint key: {key}")
    NIMA().load_state_dict(remapped, strict=True)  # validate before writing
    torch.save(remapped, dst_path)


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
