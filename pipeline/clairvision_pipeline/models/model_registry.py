"""Singleton model loading — models load once per worker process, never per task.

Loading hooks into Celery's worker_process_init signal so each prefork child
holds its own model instances (CUDA contexts cannot be shared across forks).
Stage functions access models only through the get_* accessors.
"""
import logging

from celery.signals import worker_process_init

from clairvision_shared.config import get_settings

logger = logging.getLogger(__name__)

_registry: dict[str, object] = {}


def _device() -> str:
    import torch

    return "cuda" if torch.cuda.is_available() else "cpu"


def get_nima():
    if "nima" not in _registry:
        from .nima_model import NimaScorer

        settings = get_settings()
        logger.info("Loading NIMA weights from %s", settings.nima_weights_path)
        _registry["nima"] = NimaScorer(settings.nima_weights_path, _device())
    return _registry["nima"]


# Stage 2/3 accessors (get_clip, get_mtcnn, get_arcface) land with their stages.


@worker_process_init.connect
def preload_models(**_kwargs) -> None:
    """Eager-load everything at worker boot so the first task isn't slow and
    a bad weights path fails loudly at startup, not mid-event."""
    get_nima()
    logger.info("All pipeline models loaded (device=%s)", _device())
