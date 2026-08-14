from datetime import date

import pytest

from app.core.map_grid import compute_map
from app.core.visibility import compute_visibility_point


@pytest.mark.slow
def test_map_sanity_contains_categories_and_markers():
    # Known new moon near 2024-04-08 (solar eclipse). Use dayOffset=1 for more coverage.
    res = compute_map(date(2024, 4, 8), day_offset=1, resolution=5.0)
    cats = set(res.categories)
    # Expect at least some of the standard A-F categories somewhere at coarse resolution.
    assert len(set(cats) & {"A", "B", "C", "D", "E", "F"}) >= 4
    # Telescope marker should be <= naked-eye marker age when both exist.
    m1 = res.markers.get("firstNakedEye")
    m2 = res.markers.get("firstOpticalAid")
    if m1 and m2:
        assert m2.age_hours <= m1.age_hours + 1e-6


@pytest.mark.slow
def test_map_detects_high_latitude_grazing_moonset_like_point_calculation():
    date_label = date(2026, 7, 14)
    result = compute_map(date_label, day_offset=0, resolution=5.0)
    lat = 67.5
    lon = 97.5
    lat_index = round((result.lat0 - lat) / result.resolution)
    lon_index = round((lon - result.lon0) / result.resolution)
    index = lat_index * result.nLon + lon_index
    point = compute_visibility_point(lat, lon, date_label, 0)

    assert result.categories[index] == point.category
    assert result.qValues[index] is not None
    assert point.q is not None
    assert abs(result.qValues[index] - point.q) < 0.02
