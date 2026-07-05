"""Auth (organizers, invite/reset tokens, sessions) + event visibility
lifecycle + per-image hide/unhide.

This project's first real additive migration against a populated schema
(0001 was a from-scratch create_all). All changes here are additive —
no existing column, enum, or table is renamed or restructured.

Defensive/idempotent by necessity: migration 0001 does a LIVE
`Base.metadata.create_all()` against whatever shared/.../models.py
currently defines, not a frozen historical snapshot. Since the new
tables/columns this migration adds already live on the same model
classes, running `alembic upgrade head` on a brand-new database means
0001 already creates everything in one shot — so every step here checks
existence first rather than assuming a clean slate. On an
already-migrated database (0001 applied before these models existed),
this migration does the real work; on a fresh database, it is a no-op
that just fills in anything 0001 didn't happen to cover (e.g. the slug
backfill loop, which is harmless either way).
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as psql

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def _has_table(bind, name: str) -> bool:
    return sa.inspect(bind).has_table(name)


def _has_column(bind, table: str, column: str) -> bool:
    if not _has_table(bind, table):
        return False
    return any(c["name"] == column for c in sa.inspect(bind).get_columns(table))


def _has_enum_type(bind, name: str) -> bool:
    return bind.execute(
        sa.text("SELECT 1 FROM pg_type WHERE typname = :name"), {"name": name}
    ).first() is not None


def upgrade() -> None:
    bind = op.get_bind()

    # 1. New enum types
    if not _has_enum_type(bind, "event_visibility"):
        sa.Enum("draft", "published", "archived", name="event_visibility").create(bind)
    if not _has_enum_type(bind, "auth_token_purpose"):
        sa.Enum("invite", "password_reset", name="auth_token_purpose").create(bind)

    event_visibility = psql.ENUM(
        "draft", "published", "archived", name="event_visibility", create_type=False
    )
    auth_token_purpose = psql.ENUM(
        "invite", "password_reset", name="auth_token_purpose", create_type=False
    )

    # 2. New tables
    if not _has_table(bind, "organizers"):
        op.create_table(
            "organizers",
            sa.Column("id", psql.UUID(as_uuid=True), primary_key=True),
            sa.Column("email", sa.Text, nullable=False, unique=True),
            sa.Column("password_hash", sa.Text, nullable=True),
            sa.Column("is_active", sa.Boolean, nullable=False, server_default="false"),
            sa.Column(
                "invited_by_id",
                psql.UUID(as_uuid=True),
                sa.ForeignKey("organizers.id", ondelete="SET NULL"),
            ),
            sa.Column(
                "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
            ),
            sa.Column(
                "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
            ),
        )
        op.create_index("ix_organizers_email", "organizers", ["email"])

    if not _has_table(bind, "auth_tokens"):
        op.create_table(
            "auth_tokens",
            sa.Column("id", psql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "organizer_id",
                psql.UUID(as_uuid=True),
                sa.ForeignKey("organizers.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("token_hash", sa.Text, nullable=False, unique=True),
            sa.Column("purpose", auth_token_purpose, nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("used_at", sa.DateTime(timezone=True)),
            sa.Column(
                "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
            ),
        )
        op.create_index("ix_auth_tokens_organizer_id", "auth_tokens", ["organizer_id"])
        op.create_index("ix_auth_tokens_token_hash", "auth_tokens", ["token_hash"])

    if not _has_table(bind, "organizer_sessions"):
        op.create_table(
            "organizer_sessions",
            sa.Column("id", psql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "organizer_id",
                psql.UUID(as_uuid=True),
                sa.ForeignKey("organizers.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
            ),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index(
            "ix_organizer_sessions_organizer_id", "organizer_sessions", ["organizer_id"]
        )

    # 3. New columns on events — nullable first, backfilled, then constrained
    if not _has_column(bind, "events", "slug"):
        op.add_column("events", sa.Column("slug", sa.Text, nullable=True))
    if not _has_column(bind, "events", "visibility"):
        op.add_column(
            "events",
            sa.Column("visibility", event_visibility, nullable=False, server_default="draft"),
        )
    if not _has_column(bind, "events", "published_at"):
        op.add_column("events", sa.Column("published_at", sa.DateTime(timezone=True), nullable=True))

    # 4. Backfill slugs for any pre-existing events (no-op on an empty/fresh DB).
    # Raw connection, not the ORM, so this migration stays reproducible
    # independent of future model changes.
    from clairvision_shared.slugs import slugify, unique_slug

    rows = bind.execute(sa.text("SELECT id, name FROM events WHERE slug IS NULL")).fetchall()
    for row in rows:
        slug = unique_slug(bind, slugify(row.name))
        bind.execute(
            sa.text("UPDATE events SET slug = :slug WHERE id = :id"),
            {"slug": slug, "id": row.id},
        )

    # Only constrain once every row has a value (defensive: skip if the
    # constraint/NOT NULL already exists from 0001's live create_all).
    inspector = sa.inspect(bind)
    events_cols = {c["name"]: c for c in inspector.get_columns("events")}
    if events_cols.get("slug", {}).get("nullable", True):
        op.alter_column("events", "slug", nullable=False)
    existing_uniques = {uc["name"] for uc in inspector.get_unique_constraints("events")}
    if "uq_events_slug" not in existing_uniques:
        op.create_unique_constraint("uq_events_slug", "events", ["slug"])
    existing_indexes = {ix["name"] for ix in inspector.get_indexes("events")}
    if "ix_events_slug" not in existing_indexes:
        op.create_index("ix_events_slug", "events", ["slug"])

    # 5. New column on images
    if not _has_column(bind, "images", "hidden"):
        op.add_column(
            "images", sa.Column("hidden", sa.Boolean, nullable=False, server_default="false")
        )


def downgrade() -> None:
    op.drop_column("images", "hidden")
    op.drop_index("ix_events_slug", "events")
    op.drop_constraint("uq_events_slug", "events", type_="unique")
    op.drop_column("events", "published_at")
    op.drop_column("events", "visibility")
    op.drop_column("events", "slug")
    op.drop_table("organizer_sessions")
    op.drop_table("auth_tokens")
    op.drop_table("organizers")
    sa.Enum(name="auth_token_purpose").drop(op.get_bind())
    sa.Enum(name="event_visibility").drop(op.get_bind())
