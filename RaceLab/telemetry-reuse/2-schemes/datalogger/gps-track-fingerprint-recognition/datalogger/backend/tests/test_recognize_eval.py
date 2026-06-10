"""Real-data evaluation of the recognizer thresholds (WS3 gate).

Validates the 0.85 similarity / 5 % length thresholds against the 8
GT-anchored tracks (gt_*.geojson, schema trackreco_ground_truth_v1)
before declaring the recognizer done:

  1. self-match: every track, replayed from a rotated start point,
     must clear the 0.85 gate and rank itself top-1;
  2. cross-track: no pair of DIFFERENT tracks within the 5 % length
     window may reach 0.85 (no false accept).

Pure-math eval (no DB). Skips when the GT corpus is not on this
machine — set LAP_GT_DIR or keep the default lap_web checkout layout.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np
import pytest

from app.fingerprint import (
    MAX_LENGTH_DIFF_PCT,
    MIN_SIMILARITY,
    fingerprint_from_latlon,
    match_fingerprints,
)

_DEFAULT_GT_DIR = Path(r"C:\Users\Admin\Documents\Telemetry\lap_web\data\ground_truth")
_GT_DIR = Path(os.environ.get("LAP_GT_DIR", _DEFAULT_GT_DIR))

pytestmark = pytest.mark.skipif(
    not _GT_DIR.exists(), reason=f"GT corpus not found at {_GT_DIR}",
)

# The hand-traced *_gt boundaries ARE the ground truth anchors. The *_pred
# features can span multiple laps (rkj's centerline_pred is ~9 laps long),
# which is not a single-lap fingerprint.
_PREFERRED_ROLES = ("left_boundary_gt", "right_boundary_gt", "centerline_pred")


def _load_trace(path: Path) -> tuple[list[float], list[float]] | None:
    doc = json.loads(path.read_text(encoding="utf-8"))
    features = {f["properties"].get("role"): f for f in doc.get("features", [])}
    for role in _PREFERRED_ROLES:
        feat = features.get(role)
        if not feat:
            continue
        coords = feat["geometry"]["coordinates"]
        # Two encodings exist in the corpus: plain [lon, lat] pairs and
        # {"value": [lon, lat], "Count": n} objects.
        lonlat = [c["value"] if isinstance(c, dict) else c for c in coords]
        if len(lonlat) >= 10:
            lat = [p[1] for p in lonlat]
            lon = [p[0] for p in lonlat]
            return lat, lon
    return None


def _corpus() -> dict[str, tuple[np.ndarray, float, list[float], list[float]]]:
    out = {}
    for path in sorted(_GT_DIR.glob("gt_*.geojson")):
        if ".OLD" in path.name:
            continue
        trace = _load_trace(path)
        assert trace is not None, f"{path.name}: no usable boundary/centerline"
        lat, lon = trace
        fp, length = fingerprint_from_latlon(lat, lon)
        assert length > 100.0, f"{path.name}: degenerate length {length}"
        out[path.stem.removeprefix("gt_")] = (fp, length, lat, lon)
    return out


@pytest.fixture(scope="module")
def corpus():
    c = _corpus()
    assert len(c) == 8, f"expected the 8 GT anchors, found {sorted(c)}"
    return c


def test_self_match_from_rotated_start_clears_gate(corpus):
    failures = []
    for name, (fp, length, lat, lon) in corpus.items():
        k = len(lat) // 3
        lat2, lon2 = lat[k:] + lat[:k], lon[k:] + lon[:k]
        fp2, len2 = fingerprint_from_latlon(lat2, lon2)
        sim = match_fingerprints(fp, fp2, length, len2)
        if sim < MIN_SIMILARITY:
            failures.append(f"{name}: self-similarity {sim:.3f} < {MIN_SIMILARITY}")
    assert not failures, "\n".join(failures)


def test_self_match_is_top1_against_full_registry(corpus):
    failures = []
    for name, (_, _, lat, lon) in corpus.items():
        k = len(lat) // 4
        fp_q, len_q = fingerprint_from_latlon(lat[k:] + lat[:k], lon[k:] + lon[:k])
        scores = {
            cand: match_fingerprints(fp_q, fp_c, len_q, len_c)
            for cand, (fp_c, len_c, _, _) in corpus.items()
        }
        best = max(scores, key=scores.get)
        if best != name:
            failures.append(f"{name}: top-1 was {best} ({scores[best]:.3f} vs self {scores[name]:.3f})")
    assert not failures, "\n".join(failures)


def test_no_cross_track_false_accept(corpus):
    """No pair of different tracks may clear the gate.

    On this corpus every pair differs in length by > 5 %, so the length
    gate alone would make the test vacuous — the shape check therefore
    runs with the length gate DISABLED, validating that the curvature
    signature discriminates on its own.
    """
    failures = []
    names = sorted(corpus)
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            fp_a, len_a, _, _ = corpus[a]
            fp_b, len_b, _, _ = corpus[b]
            sim = match_fingerprints(
                fp_a, fp_b, len_a, len_b, max_length_diff_pct=float("inf"),
            )
            if sim >= MIN_SIMILARITY:
                diff_pct = abs(len_a - len_b) / ((len_a + len_b) / 2) * 100.0
                failures.append(
                    f"{a} vs {b}: shape similarity {sim:.3f} >= {MIN_SIMILARITY} "
                    f"(lengths {len_a:.0f}/{len_b:.0f} m, diff {diff_pct:.1f} %)"
                )
    assert not failures, "FALSE ACCEPTS (length gate disabled):\n" + "\n".join(failures)
