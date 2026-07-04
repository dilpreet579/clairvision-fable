import uuid

from pydantic import BaseModel, ConfigDict

from ..db.enums import ImageStatus


class DuplicateGroupSummary(BaseModel):
    id: uuid.UUID
    member_count: int


class ImageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: ImageStatus
    width: int | None = None
    height: int | None = None
    face_count: int
    duplicate_group: DuplicateGroupSummary | None = None


class DuplicateGroupRead(BaseModel):
    id: uuid.UUID
    selected_image_id: uuid.UUID | None
    member_count: int
    members: list["DuplicateGroupMember"]


class DuplicateGroupMember(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    width: int | None = None
    height: int | None = None
    laplacian_score: float | None = None
    nima_score: float | None = None
    is_selected: bool = False


class ImagePage(BaseModel):
    """Gallery pagination envelope — shape must stay in sync with
    frontend/lib/types.ts (the frontend was built against this contract)."""

    items: list[ImageRead]
    page: int
    page_size: int
    total: int
