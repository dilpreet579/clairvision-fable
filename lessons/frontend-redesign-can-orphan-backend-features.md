# A frontend redesign can silently orphan a backend feature

> Phase 9 built a UMAP cluster-map endpoint + a Three.js frontend scatter view together. A later frontend redesign deleted the frontend half (ClusterCanvas, ClusterView, the /cluster page) but never touched the backend — the endpoint, service, schema, and umap-learn/scikit-learn dependency chain kept shipping and running for a feature nothing called anymore.

**Type**: correction

**Why it mattered**: the two halves of a feature were built in the same commit, then
separated by several commits and a full visual redesign later — nothing forced a
symmetric removal. The backend kept looking "used" (it had a route, a service, tests
would still exercise it in isolation) even though grepping the frontend for `cluster`
turned up zero matches. It was only caught while investigating memory footprint for a
resource-constrained deploy — a first pass "fix" (lazy-load the heavy import) would
have kept an entirely dead dependency chain shipping in the image indefinitely.

**How to apply**: when a frontend redesign removes a view, page, or component, check
whether it was the *only* consumer of a backend endpoint before leaving the backend in
place "just in case." `grep` the frontend tree for the route/feature name — no matches
means the backend is orphaned, not just quiet. Conversely, when investigating a backend
endpoint's cost (memory, deps, latency), check it still has a live consumer before
optimizing it — the cheapest fix for dead code is deletion, not a smarter warm-up.
