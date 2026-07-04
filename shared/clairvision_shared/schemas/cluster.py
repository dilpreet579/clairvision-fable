import uuid

from pydantic import BaseModel


class ClusterPoint(BaseModel):
    """One image in the 2D UMAP projection of an event's CLIP embeddings.
    Shape must stay in sync with frontend/lib/types.ts."""

    image_id: uuid.UUID
    x: float
    y: float
    duplicate_group_id: uuid.UUID | None = None
