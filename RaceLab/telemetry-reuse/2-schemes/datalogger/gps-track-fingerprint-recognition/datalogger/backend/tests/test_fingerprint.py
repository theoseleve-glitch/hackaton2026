"""Unit tests for app.fingerprint — curvature fingerprint from GPS traces.

Pure math, no DB. Mirrors the contract of lap_web's
telemetry_tool/track_surface/track_matcher.py (200-point, length-normalized
signed-curvature signature + circular cross-correlation matching) but
computed straight from a WGS84 lat/lon trace.
"""

from __future__ import annotations

import math

import numpy as np
import pytest

from app.fingerprint import (
    FINGERPRINT_LENGTH,
    fingerprint_from_latlon,
    match_fingerprints,
)


def _circle_trace(radius_m: float = 100.0, n: int = 400,
                  lat0: float = 47.0, lon0: float = 5.0,
                  rotation_rad: float = 0.0) -> tuple[list[float], list[float]]:
    """Closed circular GPS trace of given radius around (lat0, lon0)."""
    earth = 6_371_000.0
    theta = np.linspace(0.0, 2.0 * math.pi, n, endpoint=False) + rotation_rad
    x = radius_m * np.cos(theta)
    y = radius_m * np.sin(theta)
    lat = lat0 + np.degrees(y / earth)
    lon = lon0 + np.degrees(x / (earth * math.cos(math.radians(lat0))))
    return lat.tolist(), lon.tolist()


def _oval_trace(n: int = 600) -> tuple[list[float], list[float]]:
    """Closed oval (ellipse) trace — distinct curvature profile from a circle."""
    earth = 6_371_000.0
    lat0, lon0 = 47.0, 5.0
    theta = np.linspace(0.0, 2.0 * math.pi, n, endpoint=False)
    x = 300.0 * np.cos(theta)
    y = 80.0 * np.sin(theta)
    lat = lat0 + np.degrees(y / earth)
    lon = lon0 + np.degrees(x / (earth * math.cos(math.radians(lat0))))
    return lat.tolist(), lon.tolist()


class TestFingerprintFromLatLon:
    def test_circle_gives_constant_two_pi_signature(self):
        lat, lon = _circle_trace()
        fp, length_m = fingerprint_from_latlon(lat, lon)
        assert fp.shape == (FINGERPRINT_LENGTH,)
        # circumference of a 100 m circle
        assert length_m == pytest.approx(2 * math.pi * 100.0, rel=0.01)
        # kappa * L = (1/R) * 2*pi*R = 2*pi at every sample
        assert np.allclose(fp, 2 * math.pi, rtol=0.05)

    def test_world_rotation_invariance(self):
        lat_a, lon_a = _circle_trace(rotation_rad=0.0)
        lat_b, lon_b = _circle_trace(rotation_rad=1.234)
        fp_a, _ = fingerprint_from_latlon(lat_a, lon_a)
        fp_b, _ = fingerprint_from_latlon(lat_b, lon_b)
        assert match_fingerprints(fp_a, fp_b, 628.0, 628.0) > 0.99

    def test_too_few_points_returns_zeros(self):
        fp, length_m = fingerprint_from_latlon([47.0, 47.001], [5.0, 5.0])
        assert np.all(fp == 0.0)

    def test_distinct_shapes_have_distinct_fingerprints(self):
        lat_c, lon_c = _circle_trace(radius_m=206.0)   # ~1294 m
        lat_o, lon_o = _oval_trace()                   # similar length oval
        fp_c, len_c = fingerprint_from_latlon(lat_c, lon_c)
        fp_o, len_o = fingerprint_from_latlon(lat_o, lon_o)
        # lengths engineered within 5% so the length gate doesn't hide shape
        assert abs(len_c - len_o) / ((len_c + len_o) / 2) * 100 < 5.0
        assert match_fingerprints(fp_c, fp_o, len_c, len_o) < 0.85


class TestMatchFingerprints:
    def test_identical_is_one(self):
        lat, lon = _oval_trace()
        fp, length = fingerprint_from_latlon(lat, lon)
        assert match_fingerprints(fp, fp, length, length) == pytest.approx(1.0, abs=1e-6)

    def test_start_offset_invariance(self):
        """Same lap recorded from a different start/finish point still matches."""
        lat, lon = _oval_trace()
        k = 217
        lat2, lon2 = lat[k:] + lat[:k], lon[k:] + lon[:k]
        fp_a, len_a = fingerprint_from_latlon(lat, lon)
        fp_b, len_b = fingerprint_from_latlon(lat2, lon2)
        assert match_fingerprints(fp_a, fp_b, len_a, len_b) > 0.98

    def test_length_gate_rejects_over_5_pct(self):
        lat, lon = _oval_trace()
        fp, _ = fingerprint_from_latlon(lat, lon)
        assert match_fingerprints(fp, fp, 1000.0, 1060.0) == 0.0

    def test_nonpositive_length_is_zero(self):
        fp = np.ones(FINGERPRINT_LENGTH)
        assert match_fingerprints(fp, fp, 0.0, 100.0) == 0.0

    def test_zero_fingerprints_both_straight_match(self):
        z = np.zeros(FINGERPRINT_LENGTH)
        assert match_fingerprints(z, z, 100.0, 100.0) == 1.0
        assert match_fingerprints(z, np.ones(FINGERPRINT_LENGTH), 100.0, 100.0) == 0.0
