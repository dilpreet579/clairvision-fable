# NEXT_PUBLIC_* env is baked at build — container builds need build args

> The frontend image would have silently shipped in MOCK mode: NEXT_PUBLIC_USE_MOCKS defaults to true unless explicitly "false", and Next.js inlines NEXT_PUBLIC_* at `npm run build`, not at container start.

**Type**: correction (caught before first container build)

**Why it mattered**: runtime `environment:` in docker-compose does nothing for
values Next.js already inlined into the static bundle. The failure mode is nasty —
the containerized app "works" perfectly against fake data, and nothing errors.

**How to apply**: `frontend/Dockerfile` declares `ARG NEXT_PUBLIC_API_URL` /
`ARG NEXT_PUBLIC_USE_MOCKS` in the *builder* stage and compose passes them under
`build.args` (not `environment`). Any new NEXT_PUBLIC_ variable must be added to
both places. Rebuild the image to change them — restarting is not enough.
