"""CLIP ViT-L/14 — visual semantic embeddings for duplicate clustering.

Uses open_clip with the original OpenAI ViT-L/14 weights (pretrained
"openai"), i.e. the exact model the spec mandates — open_clip is just the
loader. Embeddings are L2-normalized so dot product == cosine similarity.
"""
import numpy as np
import torch

from clairvision_shared.io.image_utils import PILImage


class ClipEmbedder:
    def __init__(self, model_name: str, device: str) -> None:
        import open_clip

        self.device = device
        # env value "ViT-L/14" → open_clip naming "ViT-L-14", plus the
        # -quickgelu variant: OpenAI-pretrained CLIP uses QuickGELU, and the
        # plain config would silently run the weights with the wrong
        # activation (open_clip warns "QuickGELU mismatch").
        name = model_name.replace("/", "-")
        if not name.endswith("-quickgelu"):
            name = f"{name}-quickgelu"
        self.model, _, self.preprocess = open_clip.create_model_and_transforms(
            name, pretrained="openai"
        )
        self.model.to(device).eval()

    @torch.no_grad()
    def embed(self, img: PILImage.Image) -> np.ndarray:
        x = self.preprocess(img).unsqueeze(0).to(self.device)
        feats = self.model.encode_image(x)[0]
        feats = feats / feats.norm()
        return feats.cpu().numpy().astype(np.float32)
