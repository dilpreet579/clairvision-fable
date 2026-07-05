"""Password hashing — the single implementation shared by the API's
login/accept-invite/reset-password handlers and the CLI bootstrap script.

Uses the `bcrypt` package directly, not passlib[bcrypt]: passlib is
unmaintained and its bcrypt backend's version-detection code is broken
against modern bcrypt (4.x) releases — a permanent incompatibility, not
a transient bug (confirmed: passlib raises "password cannot be longer
than 72 bytes" / AttributeError on bcrypt.__about__ on any current
install). bcrypt itself is actively maintained with prebuilt wheels for
Windows (this project's dev host).
"""
import bcrypt

# bcrypt's algorithm has a hard 72-byte limit; truncate consistently in
# both hash and verify so long passwords compare correctly rather than
# raising ValueError.
_MAX_BCRYPT_BYTES = 72


def _prepare(raw: str) -> bytes:
    return raw.encode("utf-8")[:_MAX_BCRYPT_BYTES]


def hash_password(raw: str) -> str:
    return bcrypt.hashpw(_prepare(raw), bcrypt.gensalt()).decode("utf-8")


def verify_password(raw: str, hashed: str) -> bool:
    return bcrypt.checkpw(_prepare(raw), hashed.encode("utf-8"))
