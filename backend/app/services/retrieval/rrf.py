"""Weighted Reciprocal Rank Fusion — from-scratch (no LangChain EnsembleRetriever).

Formula (Cormack et al.; PRD §3.3 / Phase 3):
    score(d) = Σ_i  w_i / (rank_i(d) + c)

Ranks are fused, not raw scores. Default c=60, w_bm25=0.5, w_vector=0.5.
"""

from __future__ import annotations


def weighted_rrf(
    ranked_lists: list[list[str]],
    weights: list[float],
    *,
    c: int = 60,
) -> list[tuple[str, float]]:
    """Fuse ranked document-id lists via weighted RRF.

    Args:
        ranked_lists: Each list is best-first (rank 1 at index 0).
        weights: Per-list weights; must match ``ranked_lists`` length.
        c: RRF constant (PRD default 60).

    Returns:
        ``(doc_id, score)`` pairs sorted by descending fused score.
        Documents appearing in no list are omitted.
    """
    if len(ranked_lists) != len(weights):
        raise ValueError("ranked_lists and weights must have the same length")
    if c < 0:
        raise ValueError("c must be non-negative")

    scores: dict[str, float] = {}
    # Tie-break: prefer docs that ranked better on the first list (BM25 when
    # callers pass [bm25, vector]) so equal RRF scores stay deterministic.
    first_list_rank: dict[str, int] = {}
    for list_index, (ranked, weight) in enumerate(
        zip(ranked_lists, weights, strict=True)
    ):
        for rank, doc_id in enumerate(ranked, start=1):
            scores[doc_id] = scores.get(doc_id, 0.0) + weight / (rank + c)
            if list_index == 0 and doc_id not in first_list_rank:
                first_list_rank[doc_id] = rank

    return sorted(
        scores.items(),
        key=lambda item: (
            item[1],
            -first_list_rank.get(item[0], 10**9),
        ),
        reverse=True,
    )
