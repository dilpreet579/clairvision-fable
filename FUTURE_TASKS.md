# Future Tasks

Deferred feature ideas — not scheduled, not forgotten. Each entry: what it is,
why it's needed, and a rough shape of the fix. Maintained by Claude during
development; humans welcome to add/edit. Move an entry out (delete it) once
it's actually built — this file tracks what's *missing*, not a changelog.

## Organizer per-face removal

Right now there's no way for an organizer to remove a single false-positive
face while keeping the rest of a photo's faces intact. The only existing
control is image-level hide/unhide (`PATCH /images/{id}/hide`), which hides
the *whole photo* from the gallery and has no effect on face search — a
hidden image's faces still match in face search, and there's no way to
target one bad face within an otherwise-good photo.

**Why it's needed:** Stage 3's MTCNN detector keeps producing confident false
positives that no algorithmic filter fully catches — confidence gating and an
aspect-ratio guard were both added (see
[lessons/mtcnn-needs-post-detection-confidence-gate.md](lessons/mtcnn-needs-post-detection-confidence-gate.md))
but manual review of the 0.90–0.95 confidence band found real and fake faces
fully interleaved (stenciled wall text, a hand holding a phone, a blurry
light, and mechanical parts all scored 0.91–0.94 — the same range as several
genuine faces). Every correction so far has required going into the database
directly. As more events get processed, this doesn't scale — organizers need
a self-serve way to strike a specific bad detection.

**Rough shape:**
- `DELETE /events/{event_id}/faces/{face_id}` (organizer-only) — deletes the
  `Face` row (cascades to `FaceEmbedding` via FK), decrements
  `image.face_count`, enqueues a FAISS index rebuild (same
  "API enqueues, worker executes" pattern already used for
  `pipeline.delete_event_index`).
- Frontend: `ImageCard` already renders per-face tap targets (the
  search-by-face links) — the natural place is a small organizer-only
  "remove" control on each face box, with a confirm before delete.
