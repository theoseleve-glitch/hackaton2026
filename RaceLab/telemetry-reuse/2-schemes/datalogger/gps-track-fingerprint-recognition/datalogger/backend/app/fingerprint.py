"""Curvature fingerprint of a track from a raw GPS trace.

Self-contained port of the math contract in lap_web's
``telemetry_tool/track_surface/track_matcher.py`` (200-point,
length-normalized signed-curvature signature + circular
cross-correlation matching), computed directly from a WGS84 lat/lon
trace instead of a FrenetFrame, with numpy only (no scipy).

The fingerprint is invariant to world position, orientation and
start/finish offset (the matcher cross-correlates circularly), and the
kappa * L normalization makes it dimensionless so tracks of different
sizes are comparable. Matching thresholds (0.85 similarity, 5 % length
window) mirror the lap_web matcher and are validated against the 8
GT-anchored tracks in tests/test_recognize_eval.py.
"""

from __future__ import annotations

import math

import numpy as np

FINGERPRINT_LENGTH = 200
MIN_SIMILARITY = 0.85
MAX_LENGTH_DIFF_PCT = 5.0

_EARTH_RADIUS_M = 6_371_000.0


def _latlon_to_local_xy(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    """Equirectangular projection around the trace centroid → (n, 2) metres."""
    lat0 = float(np.mean(lat))
    lon0 = float(np.mean(lon))
    x = np.radians(lon - lon0) * _EARTH_RADIUS_M * math.cos(math.radians(lat0))
    y = np.radians(lat - lat0) * _EARTH_RADIUS_M
    return np.column_stack([x, y])


def fingerprint_from_latlon(
    lat: list[float] | np.ndarray,
    lon: list[float] | np.ndarray,
) -> tuple[np.ndarray, float]:
    """Compute the (FINGERPRINT_LENGTH,) curvature signature + lap length.

    Curvature is the heading derivative d(theta)/ds of the polyline,
    resampled to a uniform normalized-distance grid and scaled by total
    length (dimensionless "turn per lap"). Degenerate traces (< 3 points
    or near-zero length) return a zero fingerprint and 0.0 length.
    """
    lat = np.asarray(lat, dtype=np.float64)
    lon = np.asarray(lon, dtype=np.float64)
    if lat.size < 3 or lat.size != lon.size:
        return np.zeros(FINGERPRINT_LENGTH), 0.0

    xy = _latlon_to_local_xy(lat, lon)

    # Drop consecutive duplicates (stationary GPS samples) — they produce
    # zero-length segments and undefined headings.
    seg = np.diff(xy, axis=0)
    seg_len = np.hypot(seg[:, 0], seg[:, 1])
    keep = np.concatenate([[True], seg_len > 1e-3])
    xy = xy[keep]
    if xy.shape[0] < 3:
        return np.zeros(FINGERPRINT_LENGTH), 0.0

    # Treat the lap as a closed loop: append the start point unless the
    # trace already closes itself. The matcher's start-offset invariance
    # depends on curvature being computed circularly.
    if np.hypot(*(xy[-1] - xy[0])) > 1e-3:
        xy = np.vstack([xy, xy[0]])

    seg = np.diff(xy, axis=0)
    seg_len = np.hypot(seg[:, 0], seg[:, 1])
    total_length = float(np.sum(seg_len))
    if total_length < 1e-6:
        return np.zeros(FINGERPRINT_LENGTH), 0.0

    # Resample the polyline itself to uniform arc-length spacing BEFORE
    # differentiating. This both low-passes vertex noise (dense GPS traces
    # have jittery headings) and makes a start rotation an exact circular
    # shift of the signature.
    n_resample = 4 * FINGERPRINT_LENGTH
    s_vertex = np.concatenate([[0.0], np.cumsum(seg_len)])
    s_uniform = np.linspace(0.0, total_length, n_resample, endpoint=False)
    x_u = np.interp(s_uniform, s_vertex, xy[:, 0])
    y_u = np.interp(s_uniform, s_vertex, xy[:, 1])

    # Circular segment headings + wrapped heading deltas (signed, in
    # (-pi, pi]) — curvature kappa = dtheta / ds on the uniform grid.
    dx = np.roll(x_u, -1) - x_u
    dy = np.roll(y_u, -1) - y_u
    heading = np.arctan2(dy, dx)
    dtheta = np.diff(heading, append=heading[:1])
    dtheta = (dtheta + math.pi) % (2.0 * math.pi) - math.pi
    ds = total_length / n_resample
    kappa = dtheta / ds

    # Circular low-pass (boxcar over ~2 % of the lap): hairpin curvature is
    # a near-impulse on the fine grid, and impulses correlate poorly under
    # the half-bin phase noise that polyline resampling introduces. Both
    # query and registry blur identically, so discrimination is preserved
    # (validated against the GT corpus in tests/test_recognize_eval.py).
    window = 16
    kernel = np.ones(window) / window
    kappa = np.real(np.fft.ifft(np.fft.fft(kappa) * np.fft.fft(kernel, n=kappa.size)))

    # Decimate 4:1 by block-averaging (exact bin alignment).
    kappa_fp = kappa.reshape(FINGERPRINT_LENGTH, 4).mean(axis=1)

    return kappa_fp * total_length, total_length


def match_fingerprints(
    fingerprint_a: np.ndarray,
    fingerprint_b: np.ndarray,
    length_a: float,
    length_b: float,
    max_length_diff_pct: float = MAX_LENGTH_DIFF_PCT,
) -> float:
    """Similarity in [0, 1]; 0.0 when the length gate or shape fails.

    Same contract as lap_web's ``match_tracks``: hard length gate first,
    then the peak of the circular cross-correlation of the L2-normalized
    signatures (handles start/finish offset differences).
    """
    if length_a <= 0 or length_b <= 0:
        return 0.0

    avg_len = (length_a + length_b) / 2.0
    if abs(length_a - length_b) / avg_len * 100.0 > max_length_diff_pct:
        return 0.0

    a = np.asarray(fingerprint_a, dtype=np.float64)
    b = np.asarray(fingerprint_b, dtype=np.float64)

    norm_a = float(np.linalg.norm(a))
    norm_b = float(np.linalg.norm(b))
    if norm_a < 1e-12 or norm_b < 1e-12:
        # both flat (straight) => identical; one flat => no match
        return 1.0 if (norm_a < 1e-12 and norm_b < 1e-12) else 0.0

    a_norm = a / norm_a
    b_norm = b / norm_b

    # Circular cross-correlation peak via FFT, evaluated at 8x sub-bin
    # resolution (spectral zero-padding): a start/finish offset rarely
    # lands on an integer bin of the 200-point grid, and integer-only
    # shifts under-read the true peak for high-bandwidth signatures.
    n = a_norm.size
    upsample = 8
    spec = np.fft.rfft(a_norm) * np.conj(np.fft.rfft(b_norm))
    xcorr = np.fft.irfft(spec, n=n * upsample) * upsample
    similarity = float(np.max(xcorr))

    return max(0.0, min(1.0, similarity))
