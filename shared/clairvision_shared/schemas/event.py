import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from ..db.enums import EventStatus, EventVisibility, PipelineStage


class EventCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    source_url: str = Field(min_length=1, max_length=2000)


class EventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    status: EventStatus
    current_stage: PipelineStage
    visibility: EventVisibility
    published_at: datetime | None = None
    error_message: str | None = None
    total_image_count: int | None = None
    selected_image_count: int | None = None
    created_at: datetime


class PublicEventSummary(BaseModel):
    """Deliberately small public-safe shape for the directory and slug
    resolution — no source_url, no error_message, no pipeline internals.
    Includes id because public pages resolve slug -> id once, then call
    the existing id-based endpoints."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str
    published_at: datetime | None = None
