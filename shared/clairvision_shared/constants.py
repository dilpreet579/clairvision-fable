"""Non-environment constants (structural facts, not tunable thresholds)."""

# Embedding dimensions are properties of the mandated models, not tunables.
CLIP_EMBEDDING_DIM = 768   # CLIP ViT-L/14
FACE_EMBEDDING_DIM = 512   # ArcFace buffalo_l

# MTCNN landmark alignment target (spec: standard 112x112 frame).
FACE_ALIGN_SIZE = 112

# Whitelisted thumbnail sizes. A free-form size param would let a client
# explode the Redis keyspace and burn CPU on arbitrary resizes.
THUMBNAIL_SIZES = (400, 100)

# Pillow decompression-bomb ceiling (~64 megapixels).
MAX_IMAGE_PIXELS = 64_000_000

# Images are downscaled to this longest edge before Laplacian scoring so
# sharpness scores (and BLUR_LAPLACIAN_THRESHOLD) are resolution-independent.
LAPLACIAN_REF_EDGE = 1024

# Max selfie upload accepted by the face-search endpoint.
MAX_UPLOAD_BYTES = 10 * 1024 * 1024

# Server-side cap on gallery pagination page size.
MAX_PAGE_SIZE = 100

# Cached UMAP projections live long (recomputed only when the event's
# embedding count changes — the cache key includes it).
CLUSTER_CACHE_TTL_SECONDS = 7 * 24 * 3600
