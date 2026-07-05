# MTCNN's lowered O-Net threshold passes reflections/fragments as faces

Stage 3's MTCNN cascade runs `mtcnn_thresholds = "0.6,0.7,0.7"` — the O-Net
stage is deliberately lowered from the 0.9 default to recover angled/occluded
faces. The side effect: window reflections, headrests, and edge fragments clear
0.70 and were stored as real faces (genuine frontal faces score >0.99). The
detector filtered only on `face_min_size` (40px), never on confidence, so junk
with a normal-sized box sailed through.

**Fix:** a separate `face_min_confidence` gate (default **0.90**) applied to the
returned `prob` in `FaceDetector.detect()`, independent of the cascade
thresholds — keeps the cascade's recall, gates the final output on confidence.

**Why 0.90 (calibrated, not guessed):** the real confidence distribution on the
first real event was sharply bimodal — 79% of faces at ≥0.98 (a dense spike) and
a thin, flat junk tail scattered 0.70–0.96. The tell-tale false positives were
single-face images whose lone "face" scored 0.71 / 0.77 (a real solo portrait
scores >0.98). No clean gap exists inside the tail, so 0.90 is a judgment cut:
it removes the obvious junk while preserving the sparse 0.90–0.98 band of
genuine-but-imperfect faces. Env-tunable — raise toward 0.95 for stricter
curation, lower toward 0.85 for recall of profile/backlit faces.

**Retroactive note:** the gate only applies at detection time. Events processed
before it need a prune, not a reprocess: `DELETE FROM faces WHERE
detection_confidence < <threshold>` (face_embeddings cascade via FK), recompute
the denormalized `images.face_count`, then rebuild the affected event's FAISS
index with `build_and_publish_face_index(event_id)` run inside a
`pipeline-worker-cpu` one-off (the API's `faiss_indexes` mount is read-only).
