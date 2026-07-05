import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from clairvision_shared.config import get_settings

from .deps import get_redis
from .routers import auth, cluster, events, gallery, images, organizers, public, search


def _warm_umap() -> None:
    # numba JIT-compiles UMAP on first import (~1 min cold). Warming in a
    # daemon thread at boot means no user request ever pays that cost.
    import umap  # noqa: F401


@asynccontextmanager
async def lifespan(_app: FastAPI):
    threading.Thread(target=_warm_umap, daemon=True).start()
    yield


app = FastAPI(title="ClairVision API", lifespan=lifespan)

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
app.include_router(cluster.router)


@app.get("/healthz")
def healthz() -> dict:
    from clairvision_shared.db.session import get_engine

    with get_engine().connect() as conn:
        conn.execute(text("SELECT 1"))
    get_redis().ping()
    return {"status": "ok"}
