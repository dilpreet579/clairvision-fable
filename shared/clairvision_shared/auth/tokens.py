"""Invite / password-reset token generation.

The raw token (256 bits, URL-safe) goes in the emailed link; only its
SHA-256 digest is ever stored. Fast hashing is correct here — the token
is already high-entropy random data, not a human secret, so there is no
need to pay bcrypt-style slow-hash cost on every link click.
"""
import hashlib
import secrets


def generate_raw_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()
