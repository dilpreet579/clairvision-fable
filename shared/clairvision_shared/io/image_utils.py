"""Safe decode/encode of untrusted image bytes.

Every byte entering these functions is attacker-supplied (source URLs,
selfie uploads). Decompression bombs are capped via MAX_IMAGE_PIXELS and
malformed files raise ImageDecodeError for the caller's per-image
failure-isolation path — never a worker/API crash.
"""
import io

from PIL import Image as PILImage
from PIL import ImageOps

from ..constants import MAX_IMAGE_PIXELS

PILImage.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS


class ImageDecodeError(Exception):
    pass


def decode_image(data: bytes) -> PILImage.Image:
    try:
        img = PILImage.open(io.BytesIO(data))
        img.load()
        # Apply EXIF orientation: DSLR portrait shots store rotation as
        # metadata. Without this, faces arrive sideways at MTCNN (killing
        # recall) and stored width/height are transposed.
        img = ImageOps.exif_transpose(img)
    except Exception as exc:  # Pillow raises many types; all mean "not a valid image"
        raise ImageDecodeError(f"failed to decode image: {exc}") from exc
    if img.mode != "RGB":
        img = img.convert("RGB")
    return img


def decode_image_scaled(data: bytes, max_size: int) -> PILImage.Image:
    """Like decode_image, but for callers that only need a small result
    (thumbnails) — draft mode uses the JPEG codec's native DCT downscaling
    (1/2, 1/4, 1/8) to decode directly at a reduced resolution, instead of
    a full-resolution decode followed by a resize. A 24MP DSLR original
    decoded in full just to produce a 400px thumbnail transiently holds
    100MB+ of raw pixel data — on a memory-constrained host, a handful of
    concurrent cold-cache thumbnail requests is enough to OOM the whole
    process. No-op (still correct, just not faster) for non-JPEG sources,
    since draft() only applies to JPEG."""
    try:
        img = PILImage.open(io.BytesIO(data))
        img.draft("RGB", (max_size, max_size))
        img.load()
        img = ImageOps.exif_transpose(img)
    except Exception as exc:  # Pillow raises many types; all mean "not a valid image"
        raise ImageDecodeError(f"failed to decode image: {exc}") from exc
    if img.mode != "RGB":
        img = img.convert("RGB")
    return img


def encode_jpeg(img: PILImage.Image, quality: int = 85) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


def make_thumbnail(img: PILImage.Image, size: int, quality: int = 80) -> bytes:
    thumb = img.copy()
    thumb.thumbnail((size, size))
    return encode_jpeg(thumb, quality=quality)
