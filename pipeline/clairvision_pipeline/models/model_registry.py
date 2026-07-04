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


def get_clip():
    if "clip" not in _registry:
        from .clip_model import ClipEmbedder

        settings = get_settings()
        logger.info("Loading CLIP %s", settings.clip_model)
        _registry["clip"] = ClipEmbedder(settings.clip_model, _device())
    return _registry["clip"]


def get_mtcnn():
    if "mtcnn" not in _registry:
        from clairvision_shared.ml.mtcnn import FaceDetector

        logger.info("Loading MTCNN")
        _registry["mtcnn"] = FaceDetector(_device())
    return _registry["mtcnn"]


def get_arcface():
    if "arcface" not in _registry:
        from clairvision_shared.ml.arcface import ArcFaceEmbedder

        settings = get_settings()
        logger.info("Loading ArcFace %s", settings.arcface_model)
        _registry["arcface"] = ArcFaceEmbedder(settings.arcface_model, _device())
    return _registry["arcface"]


@worker_process_init.connect
def preload_models(**_kwargs) -> None:
    """Eager-load everything at worker boot so the first task isn't slow and
    a bad weights file fails loudly at startup, not mid-event.

    A raised exception here does NOT stop Celery — the worker would report
    ready and then fail every single task. Exit hard instead: a worker that
    cannot load its models must not consume tasks.
    """
    import os

    try:
        get_nima()
        get_clip()
        get_mtcnn()
        get_arcface()
    except Exception:
        logger.critical("model preload failed — worker cannot run", exc_info=True)
        os._exit(1)
    logger.info("All pipeline models loaded (device=%s)", _device())
