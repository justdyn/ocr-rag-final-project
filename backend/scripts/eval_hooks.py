#!/usr/bin/env python3
"""Kapita Layer 5 eval stub (CG-9): metric names only, empty gold OK."""

from __future__ import annotations

import sys

METRICS = (
    "Recall@k (retrieval)",
    "nDCG@k (retrieval)",
    "hybrid_rrf vs vector_only (toggle)",
    "SPJ line field accuracy (rules extract)",
    "SPJ document_total vs gold sum",
    "cost_per_chat_call (USD placeholder)",
    "refusal_rate_out_of_corpus_questions",
)


def main() -> int:
    print("DocIntel eval hooks (empty gold — names only)")
    for name in METRICS:
        print(f"  - {name}: (no gold loaded)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
