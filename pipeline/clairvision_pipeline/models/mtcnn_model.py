"""MTCNN face detection (facenet-pytorch).

Stage 2 uses only max_confidence() for the best-frame face bonus.
Stage 3 extends this wrapper with full detection + landmark alignment.
"""
from clairvision_shared.config import get_settings
from clairvision_shared.io.image_utils import PILImage


class FaceDetector:
    def __init__(self, device: str) -> None:
        from facenet_pytorch import MTCNN

        settings = get_settings()
        self.mtcnn = MTCNN(
            keep_all=settings.mtcnn_keep_all,
            thresholds=list(settings.mtcnn_thresholds_tuple),
            device=device,
        )

    def max_confidence(self, img: PILImage.Image) -> float | None:
        """Highest face-detection confidence in the frame, or None if no faces."""
        boxes, probs = self.mtcnn.detect(img)
        if boxes is None or probs is None:
            return None
        valid = [float(p) for p in probs if p is not None]
        return max(valid) if valid else None
