#!/usr/bin/env python3
"""Eval hooks stub (v1-build §12): prints metric names, exits 0 with empty gold.

No new deps. This is a Phase C minimum stub; full labeled eval comes later.
"""
from __future__ import annotations

import sys


def main() -> int:
    # v1-build §12 metric names (verbatim, correct order)
    metrics = [
        "Recall@k",
        "nDCG",
        "CER / WER",
        "Field exact-match",
        "Slot exact-match",
        "Money invariant",
    ]

    # Print metric names (one per line) as the stub contract
    for m in metrics:
        print(m)

    # Empty gold corpus - exit 0
    return 0


if __name__ == "__main__":
    sys.exit(main())