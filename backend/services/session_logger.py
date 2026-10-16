"""Session CSV and Raw Thermal Frame Data Logger for Research Experiments."""

import csv
import json
import logging
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

CSV_HEADERS = [
    "timestamp",
    "elapsed_sec",
    "session_name",
    "coating_name",
    "mode",
    "ssr_power_pct",
    "max6675_temp_c",
    "roi_avg_temp_c",
    "roi_max_temp_c",
    "roi_min_temp_c",
    "delta_t_insulation",
    "is_clean_snapshot",
]


class SessionLogger:
    """Handles logging of experiment sessions to CSV and clean-frame JSON records."""

    def __init__(self, data_dir: Path):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)

        self.is_active: bool = False
        self.session_name: str = ""
        self.coating_name: str = ""
        self.start_monotonic: float = 0.0
        self.start_datetime: Optional[datetime] = None
        self.sample_count: int = 0

        self._csv_file = None
        self._csv_writer = None
        self._current_filepath: Optional[Path] = None
        self._clean_frames_filepath: Optional[Path] = None
        self._clean_frames: List[Dict[str, Any]] = []

    def start_session(
        self, session_name: str = "Test_Session", coating_name: str = "Standard"
    ) -> Dict[str, Any]:
        """Starts a new experiment recording session."""
        if self.is_active:
            self.stop_session()

        # Sanitize names for filesystem
        safe_session = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in session_name.strip())
        safe_coating = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in coating_name.strip())
        timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{timestamp_str}_{safe_session}_{safe_coating}.csv"
        clean_frames_filename = f"{timestamp_str}_{safe_session}_{safe_coating}_clean_frames.json"

        self._current_filepath = self.data_dir / filename
        self._clean_frames_filepath = self.data_dir / clean_frames_filename
        self._clean_frames = []

        self._csv_file = open(self._current_filepath, mode="w", newline="", encoding="utf-8")
        self._csv_writer = csv.writer(self._csv_file)
        self._csv_writer.writerow(CSV_HEADERS)
        self._csv_file.flush()

        self.is_active = True
        self.session_name = session_name
        self.coating_name = coating_name
        self.start_monotonic = time.monotonic()
        self.start_datetime = datetime.now()
        self.sample_count = 0

        logger.info(f"Started experiment session '{session_name}' ({coating_name}) -> {filename}")
        return self.get_status()

    def log_tick(
        self,
        mode: str,
        ssr_power_pct: float,
        max6675_temp_c: float,
        roi_avg_temp_c: float,
        roi_max_temp_c: float,
        roi_min_temp_c: float,
        delta_t_insulation: float,
        is_clean_snapshot: bool = False,
        raw_thermal_frame: Optional[List[float]] = None,
    ) -> None:
        """Appends a new sample row to the CSV file if session is active."""
        if not self.is_active or self._csv_writer is None:
            return

        now = time.monotonic()
        elapsed = round(now - self.start_monotonic, 2)
        iso_ts = datetime.now().isoformat()

        row = [
            iso_ts,
            elapsed,
            self.session_name,
            self.coating_name,
            mode,
            round(ssr_power_pct, 1),
            round(max6675_temp_c, 2),
            round(roi_avg_temp_c, 2),
            round(roi_max_temp_c, 2),
            round(roi_min_temp_c, 2),
            round(delta_t_insulation, 2),
            is_clean_snapshot,
        ]

        self._csv_writer.writerow(row)
        self.sample_count += 1

        # Periodically or on clean snapshot, flush to disk
        if is_clean_snapshot or self.sample_count % 10 == 0:
            self._csv_file.flush()

        # If clean snapshot is triggered, store 768 matrix in JSON
        if is_clean_snapshot and raw_thermal_frame and self._clean_frames_filepath:
            self._clean_frames.append(
                {
                    "timestamp": iso_ts,
                    "elapsed_sec": elapsed,
                    "roi_avg_temp_c": roi_avg_temp_c,
                    "roi_max_temp_c": roi_max_temp_c,
                    "max6675_temp_c": max6675_temp_c,
                    "frame_32x24": raw_thermal_frame,
                }
            )
            try:
                with open(self._clean_frames_filepath, "w", encoding="utf-8") as jf:
                    json.dump(self._clean_frames, jf, indent=2)
            except Exception as exc:
                logger.error(f"Failed to write clean frame JSON: {exc}")

    def stop_session(self) -> Dict[str, Any]:
        """Stops current recording session and closes file handles."""
        if not self.is_active:
            return {"status": "inactive", "is_active": False}

        self.is_active = False
        status = self.get_status()

        if self._csv_file:
            try:
                self._csv_file.flush()
                self._csv_file.close()
            except Exception as exc:
                logger.error(f"Error closing CSV file: {exc}")
            self._csv_file = None
            self._csv_writer = None

        logger.info(f"Session '{self.session_name}' stopped. Saved {self.sample_count} samples.")
        return status

    def get_status(self) -> Dict[str, Any]:
        """Returns current session metadata and elapsed time."""
        elapsed = round(time.monotonic() - self.start_monotonic, 1) if self.is_active else 0.0
        return {
            "is_active": self.is_active,
            "session_name": self.session_name,
            "coating_name": self.coating_name,
            "filename": self._current_filepath.name if self._current_filepath else None,
            "elapsed_sec": elapsed,
            "sample_count": self.sample_count,
            "start_time": self.start_datetime.isoformat() if self.start_datetime else None,
        }

    def list_sessions(self) -> List[Dict[str, Any]]:
        """Lists all recorded CSV sessions in the data directory."""
        results = []
        if not self.data_dir.exists():
            return results

        for p in sorted(self.data_dir.glob("*.csv"), key=os.path.getmtime, reverse=True):
            stat = p.stat()
            results.append(
                {
                    "filename": p.name,
                    "size_bytes": stat.st_size,
                    "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                }
            )
        return results

    def get_session_file(self, filename: str) -> Optional[Path]:
        """Returns path to CSV file if it exists and is within data_dir."""
        # Prevent directory traversal
        safe_name = os.path.basename(filename)
        path = self.data_dir / safe_name
        if path.exists() and path.is_file():
            return path
        return None

    def delete_session_file(self, filename: str) -> bool:
        """Deletes session CSV and companion clean frames JSON."""
        target = self.get_session_file(filename)
        if target:
            try:
                target.unlink()
                # Check companion JSON
                companion = target.with_name(target.stem + "_clean_frames.json")
                if companion.exists():
                    companion.unlink()
                return True
            except Exception as exc:
                logger.error(f"Failed to delete {filename}: {exc}")
        return False
