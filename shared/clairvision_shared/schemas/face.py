import uuid

from pydantic import BaseModel, ConfigDict


class FaceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    image_id: uuid.UUID
    bbox_x: int
    bbox_y: int
    bbox_w: int
    bbox_h: int
    detection_confidence: float


class SearchResult(BaseModel):
    image_id: uuid.UUID
    matched_face_id: uuid.UUID
    similarity: float
    width: int | None = None
    height: int | None = None
