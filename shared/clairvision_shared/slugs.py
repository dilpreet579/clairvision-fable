"""Event slug generation — friendly public URLs like /e/summer-wedding-2026.

Pure functions with no framework dependency: used by the event-creation/
rename endpoints (via an ORM Session) AND by the Alembic migration's
backfill step (via a raw Connection) — both accept anything with
.execute(text(...)), so no duplicate collision logic exists in the migration.
"""
import re
import unicodedata

from sqlalchemy import text


def slugify(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")
    return slug or "event"


def unique_slug(conn, base_slug: str, exclude_event_id=None) -> str:
    """Appends -2, -3, ... on collision. `conn` is anything exposing
    .execute(text(...)) -> rows with a `.slug` (an ORM Session or a raw
    Alembic/SQLAlchemy Connection both satisfy this)."""
    params = {"prefix": f"{base_slug}%"}
    query = "SELECT slug FROM events WHERE slug LIKE :prefix"
    if exclude_event_id is not None:
        query += " AND id != :exclude_id"
        params["exclude_id"] = exclude_event_id
    existing = {row[0] for row in conn.execute(text(query), params)}

    if base_slug not in existing:
        return base_slug
    n = 2
    while f"{base_slug}-{n}" in existing:
        n += 1
    return f"{base_slug}-{n}"
