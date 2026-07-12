from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from clairvision_shared.config import get_settings

from .deps import get_redis
from .routers import auth, events, gallery, images, organizers, public, search

app = FastAPI(title="ClairVision API")

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins_list,
    allow_methods=["*"],
    allow_headers=["*"],
    # Required now that organizer auth uses a session cookie. Safe only
    # because cors_allow_origins_list is (and must stay) an explicit
    # trusted list — never "*" combined with credentials.
    allow_credentials=True,
)

app.include_router(auth.router)
app.include_router(organizers.router)
# public before events: /events/directory must win over /events/{event_id}.
app.include_router(public.router)
app.include_router(events.router)
app.include_router(gallery.router)
app.include_router(images.router)
app.include_router(search.router)


@app.get("/healthz")
def healthz() -> dict:
    from clairvision_shared.db.session import get_engine

    with get_engine().connect() as conn:
        conn.execute(text("SELECT 1"))
    get_redis().ping()
    return {"status": "ok"}
