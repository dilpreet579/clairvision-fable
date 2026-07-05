import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from clairvision_shared.constants import MAX_PAGE_SIZE
from clairvision_shared.db.enums import EventStatus, ImageStatus
from clairvision_shared.db.models import DuplicateGroup, Event, Face, Image, Organizer
from clairvision_shared.schemas import FaceRead
from clairvision_shared.schemas.image import (
    DuplicateGroupMember,
    DuplicateGroupRead,
    DuplicateGroupSummary,
    ImagePage,
    ImageRead,
)

from ..auth_deps import (
    get_current_organizer_optional,
    require_organizer,
    require_published_or_organizer,
)
from ..deps import get_db

router = APIRouter(prefix="/events/{event_id}", tags=["gallery"])


def _image_read(image: Image, group: DuplicateGroup | None) -> ImageRead:
    return ImageRead(
        id=image.id,
        status=image.status,
        width=image.width,
        height=image.height,
        face_count=image.face_count,
        hidden=image.hidden,
        duplicate_group=(
            DuplicateGroupSummary(id=group.id, member_count=group.member_count)
            if group is not None
            else None
        ),
    )


@router.get("/images", response_model=ImagePage)
def list_images(
    event: Event = Depends(require_published_or_organizer),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=MAX_PAGE_SIZE),
    show_hidden: bool = Query(False),
    db: Session = Depends(get_db),
    organizer: Organizer | None = Depends(get_current_organizer_optional),
) -> ImagePage:
    base = db.query(Image, DuplicateGroup).outerjoin(
        DuplicateGroup, Image.duplicate_group_id == DuplicateGroup.id
    ).filter(
        Image.event_id == event.id,
        Image.status == ImageStatus.STAGE2_SELECTED,
    )
    # Hidden is a read-path filter only; show_hidden is honored solely for
    # an authenticated organizer (preview mode).
    if not (show_hidden and organizer is not None):
        base = base.filter(Image.hidden == False)  # noqa: E712
    total = base.count()
    rows = (
        base.order_by(Image.created_at, Image.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return ImagePage(
        items=[_image_read(img, grp) for img, grp in rows],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.get("/duplicate-groups/{group_id}", response_model=DuplicateGroupRead)
def get_duplicate_group(
    group_id: uuid.UUID,
    event: Event = Depends(require_published_or_organizer),
    db: Session = Depends(get_db),
) -> DuplicateGroupRead:
    group = db.get(DuplicateGroup, group_id)
    if group is None or group.event_id != event.id:
        raise HTTPException(status_code=404, detail="duplicate group not found")
    members = (
        db.query(Image)
        .filter(Image.duplicate_group_id == group.id)
        .order_by(Image.duplicate_score.desc())
        .all()
    )
    return DuplicateGroupRead(
        id=group.id,
        selected_image_id=group.selected_image_id,
        member_count=group.member_count,
        members=[
            DuplicateGroupMember(
                id=m.id,
                width=m.width,
                height=m.height,
                laplacian_score=m.laplacian_score,
                nima_score=m.nima_score,
                is_selected=(m.id == group.selected_image_id),
            )
            for m in members
        ],
    )


class SelectImageRequest(BaseModel):
    image_id: uuid.UUID


@router.patch("/duplicate-groups/{group_id}/select", response_model=DuplicateGroupRead)
def select_group_image(
    event_id: uuid.UUID,
    group_id: uuid.UUID,
    payload: SelectImageRequest,
    db: Session = Depends(get_db),
    _organizer: Organizer = Depends(require_organizer),
) -> DuplicateGroupRead:
    """Organizer-only (re-gated — this was fully open pre-auth): overriding
    the pipeline's best-frame choice is a curation decision."""
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="event not found")
    # Overrides mid-pipeline would race Stage 3's selected-set query.
    if event.status != EventStatus.READY:
        raise HTTPException(status_code=409, detail="event is not ready")
    group = db.get(DuplicateGroup, group_id)
    if group is None or group.event_id != event.id:
        raise HTTPException(status_code=404, detail="duplicate group not found")
    new_selected = db.get(Image, payload.image_id)
    # Never trust a client-supplied id without checking parentage.
    if new_selected is None or new_selected.duplicate_group_id != group.id:
        raise HTTPException(
            status_code=422, detail="image does not belong to this group"
        )

    if group.selected_image_id != new_selected.id:
        old = db.get(Image, group.selected_image_id)
        if old is not None:
            old.status = ImageStatus.STAGE2_NOT_SELECTED
        new_selected.status = ImageStatus.STAGE2_SELECTED
        group.selected_image_id = new_selected.id
        db.commit()

    return get_duplicate_group(group_id, event, db)


def _set_hidden(
    event_id: uuid.UUID, image_id: uuid.UUID, db: Session, hidden: bool
) -> ImageRead:
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="event not found")
    image = db.get(Image, image_id)
    if image is None or image.event_id != event.id:
        raise HTTPException(status_code=404, detail="image not found")
    if image.hidden != hidden:
        image.hidden = hidden
        db.commit()
    group = (
        db.get(DuplicateGroup, image.duplicate_group_id)
        if image.duplicate_group_id is not None
        else None
    )
    return _image_read(image, group)


@router.patch("/images/{image_id}/hide", response_model=ImageRead)
def hide_image(
    event_id: uuid.UUID,
    image_id: uuid.UUID,
    db: Session = Depends(get_db),
    _organizer: Organizer = Depends(require_organizer),
) -> ImageRead:
    """Display-layer curation only — never touches FAISS/embeddings, so
    it's instantly reversible via unhide."""
    return _set_hidden(event_id, image_id, db, hidden=True)


@router.patch("/images/{image_id}/unhide", response_model=ImageRead)
def unhide_image(
    event_id: uuid.UUID,
    image_id: uuid.UUID,
    db: Session = Depends(get_db),
    _organizer: Organizer = Depends(require_organizer),
) -> ImageRead:
    return _set_hidden(event_id, image_id, db, hidden=False)


@router.get("/images/{image_id}/faces", response_model=list[FaceRead])
def list_image_faces(
    image_id: uuid.UUID,
    event: Event = Depends(require_published_or_organizer),
    db: Session = Depends(get_db),
) -> list[Face]:
    image = db.get(Image, image_id)
    if image is None or image.event_id != event.id:
        raise HTTPException(status_code=404, detail="image not found")
    return db.query(Face).filter(Face.image_id == image_id).all()
