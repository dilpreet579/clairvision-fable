# Validate synthetic test assets' pairwise CLIP sims before pipeline runs

> Synthetic scenes from the same generator all look alike to CLIP — everything merged into one 7-member "duplicate group" at the 0.92 threshold.

**Type**: correction (Stage 2 first full run)

**Why it mattered**: the clustering code was correct; the test data was the lie.
Random-colored-rectangle scenes differ pixel-wise but are semantically identical to
CLIP (sims 0.93+ across "different" scenes), so the run looked like an over-merging
bug and cost a full worker restart cycle to disprove.

**How to apply**: before using generated images to test similarity-based behavior,
embed them and print the pairwise matrix offline (seconds, no worker needed).
Intra-group should sit near 0.99, cross-group comfortably below the threshold
(0.73–0.83 worked). Genuinely distinct scene *types* (rectangles / concentric
circles / gradient waves / checkerboard) achieve this; same-generator variations do
not. Assets live in the session scratchpad under `testevent3`/`testevent4`.
