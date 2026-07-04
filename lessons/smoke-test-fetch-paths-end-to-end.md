# Smoke-test fetch/URL paths end-to-end; unit-green is not enough

> join_source_ref passed its unit checks yet resolved refs *under* the manifest file (`.../manifest.json/img.jpg` → 404) — only a real pipeline run exposed it.

**Type**: correction (Stage 1 first live run)

**Why it mattered**: the unit tests validated the security properties (escapes and
absolute refs rejected) but encoded the same wrong assumption as the implementation
— that a source URL is always a directory. The very first realistic input (a source
URL pointing at a manifest *file*) broke every image fetch. Fixed: refs now resolve
against the URL's directory component.

**How to apply**: for any code that joins/derives URLs or paths, the cheap local
end-to-end run (http.server + tiny manifest + real worker) is the test that counts;
unit tests written by the same author encode the author's assumptions. Budget one
real-run smoke per stage — each one so far (Stages 1, 2, and 3) caught something
units missed.
