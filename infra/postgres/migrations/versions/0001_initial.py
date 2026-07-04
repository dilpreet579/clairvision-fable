"""Initial schema — created directly from the ORM metadata.

Using Base.metadata.create_all for the first migration guarantees the
schema exactly matches shared/clairvision_shared/db/models.py with zero
hand-transcription drift. Subsequent migrations should use normal
alembic autogenerate diffs against this baseline.
"""
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    from clairvision_shared.db.models import Base

    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    from clairvision_shared.db.models import Base

    Base.metadata.drop_all(bind=op.get_bind())
