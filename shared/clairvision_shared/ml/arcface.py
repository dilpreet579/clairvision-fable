"""ArcFace identity embeddings — insightface buffalo_l recognition model.

Detection stays with MTCNN per the spec; only buffalo_l's recognition
model (w600k_r50.onnx) runs here, on MTCNN-aligned 112x112 crops.
Embeddings are L2-normalized so inner product == cosine similarity.

The primary path uses the insightface package (as the container does).
On dev machines where insightface's native build is unavailable, a
fallback runs the *same* buffalo_l ONNX graph through onnxruntime with
identical preprocessing — the weights and outputs are the same model.
"""
import logging
import os
import zipfile

import numpy as np

logger = logging.getLogger(__name__)

_BUFFALO_L_URL = (
    "https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip"
)
_REC_ONNX = "w600k_r50.onnx"


def _model_dir(pack_name: str) -> str:
    root = os.path.expanduser(os.path.join("~", ".insightface", "models", pack_name))
    os.makedirs(root, exist_ok=True)
    return root


def _ensure_weights(pack_name: str) -> str:
    """Returns the path to the recognition onnx, downloading the pack if needed."""
    model_dir = _model_dir(pack_name)
    rec_path = os.path.join(model_dir, _REC_ONNX)
    if os.path.exists(rec_path):
        return rec_path
    import httpx

    logger.info("Downloading %s pack (~275MB, one-time)", pack_name)
    zip_path = os.path.join(model_dir, f"{pack_name}.zip")
    with httpx.stream(
        "GET", _BUFFALO_L_URL, follow_redirects=True, timeout=600
    ) as response:
        response.raise_for_status()
        with open(zip_path, "wb") as f:
            for chunk in response.iter_bytes():
                f.write(chunk)
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(model_dir)
    os.remove(zip_path)
    if not os.path.exists(rec_path):
        raise FileNotFoundError(f"{_REC_ONNX} missing from {pack_name} pack")
    return rec_path


class ArcFaceEmbedder:
    def __init__(self, pack_name: str, device: str) -> None:
        rec_path = _ensure_weights(pack_name)
        ctx_id = 0 if device == "cuda" else -1
        try:
            from insightface.model_zoo import get_model

            self._model = get_model(rec_path)
            self._model.prepare(ctx_id=ctx_id)
            self._session = None
            logger.info("ArcFace via insightface (%s)", rec_path)
        except ImportError:
            import onnxruntime as ort

            providers = (
                ["CUDAExecutionProvider", "CPUExecutionProvider"]
                if device == "cuda"
                else ["CPUExecutionProvider"]
            )
            self._model = None
            self._session = ort.InferenceSession(rec_path, providers=providers)
            self._input_name = self._session.get_inputs()[0].name
            logger.info("ArcFace via onnxruntime fallback (%s)", rec_path)

    def embed(self, aligned_bgr: np.ndarray) -> np.ndarray:
        """512-dim L2-normalized embedding for a 112x112 BGR uint8 crop."""
        if aligned_bgr.shape[:2] != (112, 112):
            raise ValueError(f"expected 112x112 aligned crop, got {aligned_bgr.shape}")
        if self._model is not None:
            feat = self._model.get_feat(aligned_bgr).flatten()
        else:
            # Mirrors insightface ArcFaceONNX preprocessing exactly:
            # BGR -> RGB, (x - 127.5) / 127.5, NCHW.
            rgb = aligned_bgr[:, :, ::-1].astype(np.float32)
            blob = ((rgb - 127.5) / 127.5).transpose(2, 0, 1)[np.newaxis]
            feat = self._session.run(None, {self._input_name: blob})[0].flatten()
        feat = feat.astype(np.float32)
        return feat / np.linalg.norm(feat)
