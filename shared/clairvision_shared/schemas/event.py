import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from ..db.enums import EventStatus, PipelineStage


class EventCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    source_url: str = Field(min_length=1, max_length=2000)


class EventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    status: EventStatus
    current_stage: PipelineStage
    error_message: str | None = None
    total_image_count: int | None = None
    selected_image_count: int | None = None
    created_at: datetime
