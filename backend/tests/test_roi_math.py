"""Unit tests for MLX90640 Region of Interest (ROI) math and boundary handling."""

import pytest
from backend.hardware.mlx90640_driver import MLX90640Driver, ROIConfig, TOTAL_PIXELS


def test_roi_config_validation():
    # Negative bounds should clamp to 0
    roi = ROIConfig(x_min=-5, x_max=50, y_min=-2, y_max=30).validate()
    assert roi.x_min == 0
    assert roi.x_max == 31
    assert roi.y_min == 0
    assert roi.y_max == 23

    # Inverted bounds should ensure min < max
    roi2 = ROIConfig(x_min=20, x_max=10, y_min=15, y_max=5).validate()
    assert roi2.x_min < roi2.x_max
    assert roi2.y_min < roi2.y_max


def test_roi_statistics_calculation():
    # 32x24 grid filled with 20.0°C everywhere except a 2x2 hot region at x in [5,6], y in [5,6] with 80.0°C
    frame = [20.0] * TOTAL_PIXELS

    # Hotspot at (5,5), (6,5), (5,6), (6,6)
    for y in [5, 6]:
        for x in [5, 6]:
            frame[y * 32 + x] = 80.0

    # Test ROI covering ONLY the cold region
    cold_roi = ROIConfig(x_min=0, x_max=4, y_min=0, y_max=4)
    stats_cold = MLX90640Driver.calculate_roi_stats(frame, cold_roi)
    assert stats_cold.t_surf_avg == 20.0
    assert stats_cold.t_surf_max == 20.0
    assert stats_cold.t_surf_min == 20.0
    assert stats_cold.delta_t_uniformity == 0.0

    # Test ROI covering ONLY the hot region
    hot_roi = ROIConfig(x_min=5, x_max=6, y_min=5, y_max=6)
    stats_hot = MLX90640Driver.calculate_roi_stats(frame, hot_roi)
    assert stats_hot.t_surf_avg == 80.0
    assert stats_hot.t_surf_max == 80.0
    assert stats_hot.t_surf_min == 80.0
    assert stats_hot.delta_t_uniformity == 0.0

    # Global max should be 80.0 regardless of ROI
    assert stats_cold.global_max == 80.0
    assert stats_cold.global_min == 20.0
