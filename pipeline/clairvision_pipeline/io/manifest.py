"""Discover image refs at a source URL.

Two supported manifest shapes:
  1. JSON — either a plain array of refs or {"images": [...]}
  2. HTML directory index — hrefs with image extensions

Refs are relative paths; join_source_ref() later rejects anything absolute
or escaping the source URL, so a hostile manifest can't redirect fetches.
"""
import json
from html.parser import HTMLParser

from clairvision_shared.io.source_fetcher import SourceFetchError, fetch_bytes

IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff")

# Manifests are text, not photos — cap far below the image fetch limit.
_MANIFEST_MAX_BYTES = 10 * 1024 * 1024


class _HrefCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.hrefs: list[str] = []

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag == "a":
            for name, value in attrs:
                if name == "href" and value:
                    self.hrefs.append(value)


def _is_image_ref(ref: str) -> bool:
    return ref.lower().rstrip("/").endswith(IMAGE_EXTENSIONS)


def fetch_manifest(source_url: str) -> list[str]:
    """Returns the (deduplicated, ordered) list of image refs at source_url."""
    raw = fetch_bytes(source_url, max_bytes=_MANIFEST_MAX_BYTES)
    text = raw.decode("utf-8", errors="replace").strip()

    refs: list[str]
    if text.startswith(("[", "{")):
        data = json.loads(text)
        if isinstance(data, dict):
            data = data.get("images", [])
        if not isinstance(data, list) or not all(isinstance(r, str) for r in data):
            raise SourceFetchError("JSON manifest must be a list of ref strings")
        refs = data
    else:
        parser = _HrefCollector()
        parser.feed(text)
        refs = [h for h in parser.hrefs if _is_image_ref(h)]

    seen: set[str] = set()
    unique = [r for r in refs if not (r in seen or seen.add(r))]
    return unique
