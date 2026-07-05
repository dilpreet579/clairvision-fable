# passlib[bcrypt] is permanently broken — use the bcrypt package directly

> passlib is unmaintained; its bcrypt backend's version-detection code doesn't understand modern bcrypt (4.x), raising both an AttributeError and a hard 72-byte password-limit failure on any current install.

**Type**: correction (Phase A auth implementation, real-event-style verification caught it immediately)

**Why it mattered**: `passlib[bcrypt]>=1.7` looks like the standard, safe choice — it's the library everyone's tutorials use. But passlib's last release predates bcrypt 4.x's stricter API (no more `__about__` attribute, and it now raises `ValueError` instead of silently truncating passwords over 72 bytes). The failure isn't a version-pinning fluke to work around; passlib itself is unmaintained, so this incompatibility is permanent, not transient.

**How to apply**: use the `bcrypt` package directly (`shared/clairvision_shared/auth/passwords.py`) — `bcrypt.hashpw`/`bcrypt.checkpw`, with explicit UTF-8-encode-then-truncate-to-72-bytes applied identically in both hash and verify (bcrypt's hard algorithm limit). Don't reach for `passlib[bcrypt]` in any future Python project without checking its bcrypt-compat status first; if hashing suddenly raises on install-time-fresh dependencies, this incompatibility is the first thing to suspect.
