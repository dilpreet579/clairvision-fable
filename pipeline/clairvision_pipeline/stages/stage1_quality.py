"""Stage 1 — blur & quality filtering.

Two-step cascade: Laplacian variance first (cheap, every image), NIMA only
on survivors. Pure functions here; task wrapping/DB writes live in
tasks/stage1_tasks.py.
"""
from dataclasses import dataclass

import cv2
import numpy as np

from clairvision_shared.config import get_settings
from clairvision_shared.db.enums import ImageStatus
from clairvision_shared.io.image_utils import PILImage

from ..models.model_registry import get_nima


def laplacian_variance(img: PILImage.Image) -> float:
    gray = cv2.cvtColor(np.asarray(img), cv2.COLOR_RGB2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


@dataclass
class QualityResult:
    status: ImageStatus
    laplacian_score: float
    nima_score: float | None  # None when rejected at the Laplacian step


def assess_quality(img: PILImage.Image) -> QualityResult:
    settings = get_settings()

    lap = laplacian_variance(img)
    if lap < settings.blur_laplacian_threshold:
        return QualityResult(ImageStatus.STAGE1_REJECTED_BLUR, lap, None)

    nima = get_nima().score(img)
    if nima < settings.blur_nima_threshold:
        return QualityResult(ImageStatus.STAGE1_REJECTED_QUALITY, lap, nima)

    return QualityResult(ImageStatus.STAGE1_PASSED, lap, nima)
