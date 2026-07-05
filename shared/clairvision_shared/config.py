"""Single source of truth for all environment-driven configuration.

Every threshold and model choice comes from the spec's .env values —
never hardcode a threshold in logic; read it from Settings.
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ── Database ──
    postgres_host: str = "db"
    postgres_port: int = 5432
    postgres_db: str = "clairvision"
    postgres_user: str = "clairvision"
    postgres_password: str = "changeme"

    # ── Redis / Celery ──
    redis_url: str = "redis://redis:6379/0"
    celery_broker_url: str = "redis://redis:6379/0"
    celery_result_backend: str = "redis://redis:6379/1"

    # ── Models ──
    clip_model: str = "ViT-L/14"
    arcface_model: str = "buffalo_l"
    nima_weights_path: str = "/app/weights/nima.pth"

    # ── Stage 1: blur & quality ──
    blur_laplacian_threshold: float = 80
    blur_nima_threshold: float = 4.2

    # ── Stage 2: duplicates ──
    duplicate_similarity_threshold: float = 0.92
    duplicate_best_frame_nima_weight: float = 0.6
    duplicate_best_frame_laplacian_weight: float = 0.4
    duplicate_face_confidence_bonus: float = 0.1
    duplicate_face_bonus_confidence_floor: float = 0.95

    # ── Stage 3: face detection ──
    face_min_size: int = 40
    mtcnn_thresholds: str = "0.6,0.7,0.7"
    mtcnn_keep_all: bool = True

    # ── Stage 3: face search ──
    face_search_similarity_threshold: float = 0.55
    face_search_top_k: int = 100

    # ── FAISS ──
    faiss_index_type: str = "IVFFlat"
    faiss_nlist: int = 100
    faiss_nprobe: int = 20
    faiss_index_path: str = "/app/indexes"
    faiss_max_loaded_indexes: int = 20

    # ── Image cache (API) ──
    image_cache_ttl_original_seconds: int = 900
    image_cache_ttl_thumbnail_seconds: int = 3600

    # ── API & fetch hardening ──
    cors_allow_origins: str = "http://localhost:3000"
    source_fetch_max_bytes: int = 52_428_800
    source_fetch_timeout_seconds: float = 30.0
    source_fetch_max_redirects: int = 3
    # DEV ONLY: disables the private/loopback IP block-list so local test
    # image servers work. Must stay false in any real deployment.
    source_fetch_allow_private: bool = False

    # ── Auth (organizer sessions, invite/reset tokens) ──
    session_cookie_name: str = "cv_session"
    session_ttl_seconds: int = 60 * 60 * 24 * 14
    invite_token_ttl_seconds: int = 60 * 60 * 24 * 7
    password_reset_token_ttl_seconds: int = 60 * 60
    # False only for local http:// dev; must be true wherever the app is
    # reachable over anything but localhost.
    cookie_secure: bool = True
    # Frontend base URL, used to build invite/reset links embedded in emails.
    public_app_url: str = "http://localhost:3000"

    # ── Resend (transactional email) ──
    resend_api_key: str = ""
    resend_from_address: str = "ClairVision <noreply@example.com>"

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def mtcnn_thresholds_tuple(self) -> tuple[float, float, float]:
        p, r, o = (float(v.strip()) for v in self.mtcnn_thresholds.split(","))
        return (p, r, o)

    @property
    def cors_allow_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_allow_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
