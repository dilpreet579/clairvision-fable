from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from clairvision_shared.config import get_settings

from .deps import get_redis
from .routers import events, gallery, images

app = FastAPI(title="ClairVision API")

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins_list,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(events.router)
app.include_router(gallery.router)
app.include_router(images.router)


@app.get("/healthz")
def healthz() -> dict:
    from clairvision_shared.db.session import get_engine

    with get_engine().connect() as conn:
        conn.execute(text("SELECT 1"))
    get_redis().ping()
    return {"status": "ok"}
