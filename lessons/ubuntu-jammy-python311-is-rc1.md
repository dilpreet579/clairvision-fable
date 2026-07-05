# Ubuntu 22.04's python3.11 apt package is a release candidate — avoid it

> The GPU worker crashed on every task with "sys has no attribute get_int_max_str_digits": jammy's python3.11 package is frozen at 3.11.0rc1, which predates that (security-related) attribute, and modern torch._dynamo references it unconditionally at import.

**Type**: correction (first real GPU deployment, GCP T4)

**Why it mattered**: nothing about "apt install python3.11 on Ubuntu 22.04" looks
wrong, the image builds fine, and the crash appears only at torch import time
inside the running worker — three layers removed from the cause. The CPU images
never hit it because they use the official `python:3.11-slim` image (a real
release build).

**How to apply**: never take Python from jammy's apt for this project. The GPU
Dockerfile now uses `nvidia/cuda:12.6.3-cudnn-runtime-ubuntu24.04` (noble's
python3 = 3.12 proper) with `PIP_BREAK_SYSTEM_PACKAGES=1` for PEP 668. Related
gotcha fixed in the same cycle: never `pip install --upgrade pip` over an
apt-installed pip (no RECORD file → uninstall fails and kills the build); apt's
pip is sufficient.

**Deployment facts worth keeping** (verified on the T4): all four models fit in
~1.9GB VRAM at concurrency=1 (~2.8GB peak during a run) — a 15GB T4 could run
several worker processes if throughput ever demands it. GPU vs CPU on the same
133-photo event: 7m38s vs ~30min end-to-end with byte-identical curation results;
remaining GPU-run time is mostly source-fetch network I/O.
