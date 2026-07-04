"""Stage 2 — duplicate clustering and best-frame scoring (pure logic).

Clustering: pairwise cosine similarity over L2-normalized CLIP embeddings
(dot product == cosine), union-find grouping above the configured
threshold. Similarities are computed blockwise so a 10k-image event never
materializes the full NxN matrix.

Scoring: NIMA is bounded 0-10 so it divides by 10; Laplacian variance is
unbounded (often 100s-1000s) so it is min-max normalized WITHIN each
group — without this it would swamp the configured 0.6/0.4 weighting.
"""
from dataclasses import dataclass

import numpy as np

from clairvision_shared.config import get_settings

_BLOCK = 512


class UnionFind:
    def __init__(self, n: int) -> None:
        self.parent = list(range(n))

    def find(self, i: int) -> int:
        while self.parent[i] != i:
            self.parent[i] = self.parent[self.parent[i]]
            i = self.parent[i]
        return i

    def union(self, i: int, j: int) -> None:
        ri, rj = self.find(i), self.find(j)
        if ri != rj:
            self.parent[rj] = ri


def cluster_embeddings(matrix: np.ndarray, threshold: float) -> list[list[int]]:
    """Groups of row indices whose cosine similarity exceeds threshold.
    Singles come back as 1-element groups."""
    n = matrix.shape[0]
    uf = UnionFind(n)
    for start in range(0, n, _BLOCK):
        block = matrix[start : start + _BLOCK]
        # Only compare against rows >= start to skip redundant pairs.
        sims = block @ matrix[start:].T
        rows, cols = np.nonzero(sims > threshold)
        for r, c in zip(rows.tolist(), cols.tolist()):
            i, j = start + r, start + c
            if i < j:
                uf.union(i, j)

    groups: dict[int, list[int]] = {}
    for i in range(n):
        groups.setdefault(uf.find(i), []).append(i)
    return list(groups.values())


@dataclass
class MemberQuality:
    laplacian_score: float
    nima_score: float
    face_confidence: float | None  # Stage 2 Phase A MTCNN hint


def score_group_members(members: list[MemberQuality]) -> list[float]:
    """Combined best-frame score per member, same order as input."""
    settings = get_settings()
    laps = [m.laplacian_score for m in members]
    lap_min, lap_max = min(laps), max(laps)
    lap_range = lap_max - lap_min

    scores = []
    for m in members:
        lap_norm = (m.laplacian_score - lap_min) / lap_range if lap_range > 0 else 1.0
        nima_norm = m.nima_score / 10.0
        score = (
            settings.duplicate_best_frame_nima_weight * nima_norm
            + settings.duplicate_best_frame_laplacian_weight * lap_norm
        )
        if (
            m.face_confidence is not None
            and m.face_confidence > settings.duplicate_face_bonus_confidence_floor
        ):
            score += settings.duplicate_face_confidence_bonus
        scores.append(score)
    return scores
