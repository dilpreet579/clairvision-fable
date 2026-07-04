# facenet-pytorch must be installed with --no-deps

> facenet-pytorch pins an ancient torch (<2.3); installed normally it would downgrade/conflict with our torch — it runs fine on torch 2.12 with --no-deps.

**Type**: correction (dependency gotcha)

**Why it mattered**: a plain `pip install facenet-pytorch` would try to replace the
working torch install and can break the whole environment resolution. With
`--no-deps` (its real runtime needs — torch, torchvision, numpy, Pillow, requests —
are already present) MTCNN works correctly on modern torch; its weights ship inside
the package, so no downloads either.

**How to apply**: every environment that installs the pipeline must install
facenet-pytorch with `--no-deps`. It is deliberately absent from
`pipeline/pyproject.toml` dependencies (a comment there points here);
`pipeline/Dockerfile` installs it as a separate `--no-deps` step, and `requests`
(its one non-covered runtime need) is a regular pipeline dependency. Revisit when
facenet-pytorch relaxes its torch pin.
