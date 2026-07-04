"""Per-event FAISS index layout under FAISS_INDEX_PATH."""
import os

from clairvision_shared.config import get_settings

FACES_INDEX_FILENAME = "faces.index"


def event_index_dir(event_id: str) -> str:
    return os.path.join(get_settings().faiss_index_path, event_id)


def faces_index_path(event_id: str) -> str:
    return os.path.join(event_index_dir(event_id), FACES_INDEX_FILENAME)
