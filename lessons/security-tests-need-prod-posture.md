# Security tests must run in prod posture, not the dev environment

> The SSRF test against POST /events returned 201 instead of 422 — not a bug, but the dev flag (SOURCE_FETCH_ALLOW_PRIVATE=true) the API needs for local test sources legitimately opens the gate being tested.

**Type**: confirmed approach (testing gotcha, Phase 5 verification)

**Why it mattered**: the same env flag that makes local development possible
(fetching from a 127.0.0.1 test image server) disables the exact control the
security test probes. A passing *or* failing security check under dev flags proves
nothing; worse, a 201 here initially read as a vulnerability.

**How to apply**: every security-posture check (SSRF gate, and any future
auth/rate-limit checks) must run with dev flags OFF — either a separate process
without `SOURCE_FETCH_ALLOW_PRIVATE`, or a direct unit call to the guard
(`validate_source_url`) in a clean env. The containerized regression pass should
run the SSRF checks against the compose stack, which never sets the dev flag.
