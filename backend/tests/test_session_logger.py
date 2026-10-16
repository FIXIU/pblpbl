"""Unit tests for session CSV logging and file management."""

import csv
from pathlib import Path
import pytest
from backend.services.session_logger import CSV_HEADERS, SessionLogger


def test_session_logger_lifecycle(tmp_path: Path):
    logger = SessionLogger(data_dir=tmp_path)
    assert logger.is_active is False

    # Start session
    status = logger.start_session(session_name="Reflective_White", coating_name="TiO2_Nanocoat")
    assert logger.is_active is True
    assert status["session_name"] == "Reflective_White"

    # Log 3 ticks
    for i in range(3):
        logger.log_tick(
            mode="MANUAL_PWM",
            ssr_power_pct=50.0,
            max6675_temp_c=30.0 + i,
            roi_avg_temp_c=45.0 + i,
            roi_max_temp_c=50.0 + i,
            roi_min_temp_c=40.0 + i,
            delta_t_insulation=15.0,
            is_clean_snapshot=False,
        )

    # Stop session
    end_status = logger.stop_session()
    assert logger.is_active is False
    assert end_status["sample_count"] == 3

    # Verify CSV contents
    csv_files = list(tmp_path.glob("*.csv"))
    assert len(csv_files) == 1

    with open(csv_files[0], "r", encoding="utf-8") as f:
        reader = csv.reader(f)
        rows = list(reader)
        assert rows[0] == CSV_HEADERS
        assert len(rows) == 4  # Header + 3 rows
        assert rows[1][2] == "Reflective_White"
        assert rows[1][3] == "TiO2_Nanocoat"
