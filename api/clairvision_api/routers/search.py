import uuid

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from clairvision_shared.constants import MAX_UPLOAD_BYTES
from clairvision_shared.db.models import Event, FaceEmbedding
from clairvision_shared.io.image_utils import ImageDecodeError, decode_image
from clairvision_shared.schemas import SearchResult

from ..deps import get_db
from ..services.search_service import (
    NoFaceDetected,
    embed_uploaded_face,
    search_by_embedding,
)

router = APIRouter(prefix="/events/{event_id}/search", tags=["search"])


def _get_ready_event(db: Session, event_id: uuid.UUID) -> Event:
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="event not found")
    return event


@router.post("/by-upload", response_model=list[SearchResult])
async def search_by_upload(
    event_id: uuid.UUID, file: UploadFile, db: Session = Depends(get_db)
) -> list[SearchResult]:
    _get_ready_event(db, event_id)
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="upload exceeds 10 MB limit")
    try:
        img = decode_image(data)
    except ImageDecodeError:
        raise HTTPException(status_code=422, detail="file is not a readable image")
    try:
        embedding = embed_uploaded_face(img)
    except NoFaceDetected:
        # Spec-mandated clear error for the no-face case.
        raise HTTPException(
            status_code=422,
            detail="No face detected in the uploaded photo — please try a clearer photo.",
        )
    return search_by_embedding(db, event_id, embedding)


@router.post("/by-face/{face_id}", response_model=list[SearchResult])
def search_by_face(
    event_id: uuid.UUID, face_id: uuid.UUID, db: Session = Depends(get_db)
) -> list[SearchResult]:
    _get_ready_event(db, event_id)
    row = (
        db.query(FaceEmbedding)
        .filter(FaceEmbedding.face_id == face_id, FaceEmbedding.event_id == event_id)
        .one_or_none()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="face not found in this event")
    embedding = np.asarray(row.embedding, dtype=np.float32)
    return search_by_embedding(db, event_id, embedding)
