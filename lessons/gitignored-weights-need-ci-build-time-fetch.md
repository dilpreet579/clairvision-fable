# A gitignored weight file only "exists" via the local bind-mount — CI has nothing

> `pipeline/weights/*.pth` is gitignored (a 58MB binary, correctly kept out
> of git). Local dev never notices because `docker-compose.yml` bind-mounts
> `./pipeline/weights:/app/weights:ro` from the host disk. The first time a
> Dockerfile tried `COPY pipeline/weights/ /app/weights/` for a genuinely
> standalone image (no repo checkout, no bind-mount — the on-demand
> pipeline VM), it only copied `weights/README.md` and the build failed
> with `FileNotFoundError` on `nima.pth`.

**Type**: correction

**Why it mattered**: `git status` and a local `docker compose build` both
look completely fine — the gap only exists in the specific combination of
"gitignored file" + "no bind-mount available" (a bare `docker run` on a
fresh EC2 instance), which nothing in the normal dev loop or existing CI
exercises.

**How to apply**: when converting a bind-mount-dependent dev setup into a
truly standalone image, don't assume `COPY` from the repo covers files
that are gitignored for good reason (checked-out-locally-only, LFS,
generated, downloaded). Either fetch+reconstruct the file at build time
(here: `weights/README.md` already documented the exact reproducible
conversion from a public source checkpoint —
`convert_pyiqa_checkpoint(...)` — so the Dockerfile just runs that same
procedure against a fresh download instead of relying on the file being
present), or use git-lfs / a build secret if reconstruction isn't
possible. Verify locally by simulating the standalone case (`docker build`
from a clean checkout with the gitignored files actually absent) before
trusting a CI build to catch it first.
