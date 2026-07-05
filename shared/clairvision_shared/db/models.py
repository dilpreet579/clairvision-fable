"""SQLAlchemy ORM models — the single schema shared by pipeline and API.

pgvector rows are the durable source of truth for all embeddings;
per-event FAISS indexes are derived, rebuildable accelerators.
"""
import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Identity,
    Index,
    Integer,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from ..constants import CLIP_EMBEDDING_DIM, FACE_EMBEDDING_DIM
from .enums import (
    AuthTokenPurpose,
    EventStatus,
    EventVisibility,
    ImageStatus,
    PipelineStage,
)


def _pg_enum(py_enum, name: str) -> Enum:
    # Store enum *values* (lowercase strings), not member names.
    return Enum(py_enum, name=name, values_callable=lambda e: [m.value for m in e])


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class Event(TimestampMixin, Base):
    __tablename__ = "events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    source_url: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[EventStatus] = mapped_column(
        _pg_enum(EventStatus, "event_status"),
        nullable=False,
        default=EventStatus.PENDING,
    )
    current_stage: Mapped[PipelineStage] = mapped_column(
        _pg_enum(PipelineStage, "pipeline_stage"),
        nullable=False,
        default=PipelineStage.NONE,
    )
    error_message: Mapped[str | None] = mapped_column(Text)
    total_image_count: Mapped[int | None] = mapped_column(Integer)
    selected_image_count: Mapped[int | None] = mapped_column(Integer)

    # Organizer-controlled publication state — independent of `status` above
    # (pipeline progress). See EventVisibility docstring.
    slug: Mapped[str] = mapped_column(Text, nullable=False, unique=True, index=True)
    visibility: Mapped[EventVisibility] = mapped_column(
        _pg_enum(EventVisibility, "event_visibility"),
        nullable=False,
        default=EventVisibility.DRAFT,
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    images: Mapped[list["Image"]] = relationship(
        back_populates="event", cascade="all, delete-orphan", passive_deletes=True
    )


class DuplicateGroup(TimestampMixin, Base):
    __tablename__ = "duplicate_groups"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # use_alter breaks the circular FK with images.duplicate_group_id.
    selected_image_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey(
            "images.id",
            ondelete="SET NULL",
            use_alter=True,
            name="fk_duplicate_groups_selected_image",
        )
    )
    member_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    images: Mapped[list["Image"]] = relationship(
        back_populates="duplicate_group", foreign_keys="Image.duplicate_group_id"
    )


class Image(TimestampMixin, Base):
    __tablename__ = "images"
    __table_args__ = (Index("ix_images_event_status", "event_id", "status"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), nullable=False
    )
    source_ref: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[ImageStatus] = mapped_column(
        _pg_enum(ImageStatus, "image_status"),
        nullable=False,
        default=ImageStatus.PENDING,
    )
    failure_reason: Mapped[str | None] = mapped_column(Text)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    laplacian_score: Mapped[float | None] = mapped_column(Float)
    nima_score: Mapped[float | None] = mapped_column(Float)
    # Max MTCNN confidence captured during Stage 2 Phase A; input to the
    # best-frame face bonus. Stage 3 still runs full detection.
    face_confidence_hint: Mapped[float | None] = mapped_column(Float)
    duplicate_group_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("duplicate_groups.id", ondelete="SET NULL"), index=True
    )
    duplicate_score: Mapped[float | None] = mapped_column(Float)
    face_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Organizer-controlled, fully reversible display-layer exclusion.
    # Independent of `status` (pipeline-driven) — never touches FAISS/embeddings.
    hidden: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    event: Mapped["Event"] = relationship(back_populates="images")
    duplicate_group: Mapped["DuplicateGroup | None"] = relationship(
        back_populates="images", foreign_keys=[duplicate_group_id]
    )
    faces: Mapped[list["Face"]] = relationship(
        back_populates="image", cascade="all, delete-orphan", passive_deletes=True
    )


class ClipEmbedding(Base):
    __tablename__ = "clip_embeddings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    image_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("images.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    # Denormalized: per-event FAISS/UMAP rebuilds read by event_id without a join.
    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True
    )
    embedding: Mapped[list[float]] = mapped_column(
        Vector(CLIP_EMBEDDING_DIM), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Face(Base):
    __tablename__ = "faces"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    image_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("images.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Original-image pixel coords; powers the click-to-search overlay.
    bbox_x: Mapped[int] = mapped_column(Integer, nullable=False)
    bbox_y: Mapped[int] = mapped_column(Integer, nullable=False)
    bbox_w: Mapped[int] = mapped_column(Integer, nullable=False)
    bbox_h: Mapped[int] = mapped_column(Integer, nullable=False)
    detection_confidence: Mapped[float] = mapped_column(Float, nullable=False)
    landmarks: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    image: Mapped["Image"] = relationship(back_populates="faces")
    embedding: Mapped["FaceEmbedding | None"] = relationship(
        back_populates="face", cascade="all, delete-orphan", passive_deletes=True
    )


class FaceEmbedding(Base):
    __tablename__ = "face_embeddings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    face_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("faces.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True
    )
    embedding: Mapped[list[float]] = mapped_column(
        Vector(FACE_EMBEDDING_DIM), nullable=False
    )
    # FAISS-native int64 id (IndexIDMap2) — makes FAISS results directly
    # queryable without a JSON idmap sidecar.
    faiss_seq_id: Mapped[int] = mapped_column(
        BigInteger, Identity(), nullable=False, unique=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    face: Mapped["Face"] = relationship(back_populates="embedding")


class PipelineTaskError(Base):
    __tablename__ = "pipeline_task_errors"
    __table_args__ = (Index("ix_pipeline_task_errors_event_stage", "event_id", "stage"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), nullable=False
    )
    # NULL image_id = stage-level (not image-level) failure.
    image_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("images.id", ondelete="CASCADE")
    )
    stage: Mapped[PipelineStage] = mapped_column(
        _pg_enum(PipelineStage, "pipeline_stage"), nullable=False
    )
    error_type: Mapped[str] = mapped_column(Text, nullable=False)
    error_detail: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Organizer(TimestampMixin, Base):
    """A user who can create/manage events. Shared team access — every
    organizer has identical permissions, so there is no role column."""

    __tablename__ = "organizers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(Text, nullable=False, unique=True, index=True)
    # NULL + is_active=False together mean "invited, not yet activated" —
    # accepting the invite (or a successful password reset) sets both.
    password_hash: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    invited_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("organizers.id", ondelete="SET NULL")
    )
    invited_by: Mapped["Organizer | None"] = relationship(remote_side=[id])


class AuthToken(Base):
    """Single-use, expiring, opaque bearer token bound to one organizer —
    shared shape for both invite and password-reset flows (see
    AuthTokenPurpose). Only a hash of the raw token is ever stored."""

    __tablename__ = "auth_tokens"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organizer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(Text, nullable=False, unique=True, index=True)
    purpose: Mapped[AuthTokenPurpose] = mapped_column(
        _pg_enum(AuthTokenPurpose, "auth_token_purpose"), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class OrganizerSession(Base):
    """DB-backed session — deleting a row is an instant, real revocation.
    The cookie carries only this row's id."""

    __tablename__ = "organizer_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organizer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
