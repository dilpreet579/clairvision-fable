"""SSRF-hardened fetching of source-URL bytes.

This module is the single choke point through which the pipeline worker
AND the API fetch anything from a user-supplied source URL. Guards:

- scheme whitelist (http/https only)
- DNS resolution + block-list check on every resolved address
  (private, loopback, link-local, metadata, reserved ranges)
- redirects followed manually, each hop re-validated
- hard response-size cap, streaming abort once exceeded
- connect/read timeouts

Residual risk note: validation happens immediately before the request
rather than pinning the resolved IP into the TLS connection itself, so a
pathologically fast DNS-rebind between check and connect is theoretically
possible; the window is minimized by resolving at request time. Full
socket-level pinning is a follow-up hardening item.

Fetched bytes are NEVER returned to a client raw — callers must decode
them as an image (see image_utils.decode_image) and re-encode.
"""
import ipaddress
import socket
from urllib.parse import urljoin, urlsplit

import httpx

from ..config import get_settings


class SourceFetchError(Exception):
    """Base for all fetch failures (maps to 502 at the API layer)."""


class BlockedURLError(SourceFetchError):
    """URL failed SSRF validation (maps to 422 at the API layer)."""


class ResponseTooLargeError(SourceFetchError):
    pass


_ALLOWED_SCHEMES = {"http", "https"}


def _validate_resolved_ips(hostname: str) -> None:
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror as exc:
        raise SourceFetchError(f"cannot resolve host {hostname!r}") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            raise BlockedURLError(
                f"host {hostname!r} resolves to a blocked address ({ip})"
            )


def validate_source_url(url: str) -> None:
    """Raises BlockedURLError/SourceFetchError if the URL must not be fetched."""
    parts = urlsplit(url)
    if parts.scheme not in _ALLOWED_SCHEMES:
        raise BlockedURLError(f"scheme {parts.scheme!r} not allowed")
    if not parts.hostname:
        raise BlockedURLError("URL has no host")
    try:
        ip = ipaddress.ip_address(parts.hostname)
    except ValueError:
        _validate_resolved_ips(parts.hostname)
    else:
        # Literal-IP URLs get the same block-list treatment.
        if not ip.is_global:
            raise BlockedURLError(f"literal IP {ip} is blocked")


def join_source_ref(source_url: str, source_ref: str) -> str:
    """Join a manifest entry against the event's source URL.

    A hostile manifest must not be able to redirect individual image
    fetches to a different host: absolute URLs, scheme-relative refs,
    and path escapes above the source URL are all rejected.
    """
    if "://" in source_ref or source_ref.startswith("//"):
        raise BlockedURLError(f"absolute source_ref rejected: {source_ref!r}")
    base = source_url if source_url.endswith("/") else source_url + "/"
    joined = urljoin(base, source_ref)
    if not joined.startswith(base):
        raise BlockedURLError(f"source_ref escapes source URL: {source_ref!r}")
    return joined


def fetch_bytes(
    url: str,
    *,
    max_bytes: int | None = None,
    timeout: float | None = None,
) -> bytes:
    """Fetch a validated URL, following at most N redirects, capped in size."""
    settings = get_settings()
    max_bytes = max_bytes or settings.source_fetch_max_bytes
    timeout = timeout or settings.source_fetch_timeout_seconds
    current = url

    for _ in range(settings.source_fetch_max_redirects + 1):
        validate_source_url(current)
        try:
            with httpx.Client(follow_redirects=False, timeout=timeout) as client:
                with client.stream("GET", current) as response:
                    if response.is_redirect:
                        location = response.headers.get("location")
                        if not location:
                            raise SourceFetchError("redirect without Location header")
                        current = urljoin(current, location)
                        continue
                    response.raise_for_status()
                    buf = bytearray()
                    for chunk in response.iter_bytes():
                        buf.extend(chunk)
                        if len(buf) > max_bytes:
                            raise ResponseTooLargeError(
                                f"response exceeded {max_bytes} bytes"
                            )
                    return bytes(buf)
        except httpx.HTTPStatusError as exc:
            raise SourceFetchError(
                f"source returned {exc.response.status_code} for {current!r}"
            ) from exc
        except httpx.HTTPError as exc:
            raise SourceFetchError(f"fetch failed for {current!r}: {exc}") from exc

    raise SourceFetchError(
        f"too many redirects (>{settings.source_fetch_max_redirects})"
    )
