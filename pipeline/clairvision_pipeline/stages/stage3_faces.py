"""Stage 3 — face alignment (pure logic).

norm_crop implements the standard ArcFace 5-point similarity alignment to
a 112x112 frame — the same canonical template insightface's
face_align.norm_crop uses, so embeddings are comparable regardless of
which ArcFace execution path is active.
"""
import cv2
import numpy as np

from clairvision_shared.constants import FACE_ALIGN_SIZE

# Canonical ArcFace destination landmarks for a 112x112 crop:
# left eye, right eye, nose, mouth-left, mouth-right.
_ARCFACE_TEMPLATE = np.array(
    [
        [38.2946, 51.6963],
        [73.5318, 51.5014],
        [56.0252, 71.7366],
        [41.5493, 92.3655],
        [70.7299, 92.2041],
    ],
    dtype=np.float32,
)


def norm_crop(img_bgr: np.ndarray, landmarks: list[list[float]]) -> np.ndarray:
    """Similarity-warp a face to the standard 112x112 ArcFace frame."""
    src = np.asarray(landmarks, dtype=np.float32)
    matrix, _ = cv2.estimateAffinePartial2D(
        src, _ARCFACE_TEMPLATE, method=cv2.LMEDS
    )
    if matrix is None:
        raise ValueError("could not estimate alignment transform from landmarks")
    return cv2.warpAffine(
        img_bgr, matrix, (FACE_ALIGN_SIZE, FACE_ALIGN_SIZE), borderValue=0
    )
