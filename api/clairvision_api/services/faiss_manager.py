"""Lazy-loading LRU manager for per-event FAISS indexes.

Indexes are derived artifacts (pgvector is the source of truth), built by
the pipeline worker and published to S3. The API's local copy under
FAISS_INDEX_PATH is an independent cache, not a shared volume — missing
locally, it's pulled from S3 on first search for an event, then loaded and
evicted LRU beyond FAISS_MAX_LOADED_INDEXES — eviction just drops the
reference (S3/disk is authoritative), keeping the always-on CPU API from
ballooning across many events.
"""
import logging
import os
import threading
from collections import OrderedDict

import faiss

from clairvision_shared.config import get_settings
from clairvision_shared.faiss_paths import faces_index_path

logger = logging.getLogger(__name__)


class FaissIndexManager:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._loaded: OrderedDict[str, faiss.Index] = OrderedDict()

    def get_index(self, event_id: str) -> faiss.Index | None:
        """The event's face index, or None if no index exists (zero-face
        events never publish one)."""
        settings = get_settings()
        with self._lock:
            if event_id in self._loaded:
                self._loaded.move_to_end(event_id)
                return self._loaded[event_id]

        path = faces_index_path(event_id)
        if not os.path.exists(path):
            # Local import avoids any import-cycle risk between faiss_manager
            # and clairvision_shared.faiss_s3.
            from clairvision_shared.faiss_s3 import download_face_index

            if not download_face_index(event_id):
                # No S3 object either — legitimate zero-face event.
                return None
        index = faiss.read_index(path)
        try:
            faiss.extract_index_ivf(index).nprobe = settings.faiss_nprobe
        except RuntimeError:
            pass  # flat fallback index — no nprobe to set

        with self._lock:
            self._loaded[event_id] = index
            self._loaded.move_to_end(event_id)
            while len(self._loaded) > settings.faiss_max_loaded_indexes:
                evicted_id, _ = self._loaded.popitem(last=False)
                logger.info("evicted FAISS index for event %s (LRU)", evicted_id)
        return index

    def invalidate(self, event_id: str) -> None:
        with self._lock:
            self._loaded.pop(event_id, None)


_manager = FaissIndexManager()


def get_manager() -> FaissIndexManager:
    return _manager
