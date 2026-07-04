# Confirmed dev-workflow conventions for this project

> Working agreements confirmed with the project owner: host venv for fast iteration with Docker as source of truth; commit after each verified phase; SSRF escape hatch for local test sources.

**Type**: confirmed approach (owner-approved)

**Why it mattered**: these were each explicitly discussed and settled — re-litigating
them wastes time, and violating them (e.g., committing unverified work, or removing
the venv) goes against what the owner chose.

**How to apply**:
- **Venv hybrid**: `.venv` at repo root (gitignored) is for dev-loop speed only;
  nothing may *depend* on it. Docker Compose is the deployment truth, and each
  phase's final verification should eventually run containerized.
- **Commit cadence**: one commit per phase, only after live verification passes;
  commit messages record what was verified.
- **Local test sources**: `SOURCE_FETCH_ALLOW_PRIVATE=true` (dev-only env flag) is
  required for `http://127.0.0.1` image servers because the SSRF guard correctly
  blocks private addresses by default. Never set it outside local dev.
- **Parallelism**: pipeline/backend work stays inline (context-heavy, sequential);
  well-specified, decoupled chunks (frontend scaffold) go to background agents with
  self-contained briefs.
