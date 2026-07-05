"""MTCNN face detection (facenet-pytorch).

Stage 2 uses only max_confidence() for the best-frame face bonus.
Stage 3 uses detect() for full boxes + 5-point landmarks.
"""
from dataclasses import dataclass

from clairvision_shared.config import get_settings
from clairvision_shared.io.image_utils import PILImage


@dataclass
class FaceDet:
    bbox_x: int
    bbox_y: int
    bbox_w: int
    bbox_h: int
    confidence: float
    # 5 (x, y) points: left eye, right eye, nose, mouth-left, mouth-right —
    # the order insightface's ArcFace alignment template expects.
    landmarks: list[list[float]]


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

    def detect(self, img: PILImage.Image) -> list[FaceDet]:
        """All faces with boxes + landmarks, filtered to FACE_MIN_SIZE and
        FACE_MIN_CONFIDENCE.

        The 40x40 floor is applied here (not raised elsewhere) — smaller
        faces are too low-resolution for reliable ArcFace identity. The
        confidence floor drops marginal detections (reflections, edge
        fragments) that clear MTCNN's permissive O-Net threshold.
        """
        settings = get_settings()
        boxes, probs, points = self.mtcnn.detect(img, landmarks=True)
        if boxes is None:
            return []
        dets: list[FaceDet] = []
        for box, prob, pts in zip(boxes, probs, points):
            if prob is None or prob < settings.face_min_confidence:
                continue
            x1, y1, x2, y2 = (float(v) for v in box)
            w, h = x2 - x1, y2 - y1
            if w < settings.face_min_size or h < settings.face_min_size:
                continue
            dets.append(
                FaceDet(
                    bbox_x=int(round(x1)),
                    bbox_y=int(round(y1)),
                    bbox_w=int(round(w)),
                    bbox_h=int(round(h)),
                    confidence=float(prob),
                    landmarks=[[float(p[0]), float(p[1])] for p in pts],
                )
            )
        return dets
