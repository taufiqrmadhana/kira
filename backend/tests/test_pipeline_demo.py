"""R6 loading preserves day 8 and resumes without another learning decision."""

from pathlib import Path

import pytest
from test_pipeline_files import client as client

from scripts import load_demo


def test_missing_demo_sources_fail_before_upload(tmp_path):
    with pytest.raises(ValueError, match="day-01"):
        load_demo.source_days(tmp_path)


def test_resume_after_cleaning_and_completed_reload_preserve_seven_decisions(client, monkeypatch):
    pytest.importorskip("kira.services.match")
    root = Path(__file__).resolve().parents[2] / "data/with-exceptions"
    if not root.exists():
        pytest.skip("Drive with-exceptions fixtures are not installed")
    days = load_demo.source_days(root)
    assert len(days) == 7 and sum(map(len, days)) == 21
    assert all("day-08" not in str(path) for day in days for _, path in day)
    original = load_demo.call

    def stop_after_save(client, method, path, **kwargs):
        result = original(client, method, path, **kwargs)
        if path == "/cleaning/save":
            raise RuntimeError("Interrupted after saving cleaning")
        return result

    monkeypatch.setattr(load_demo, "call", stop_after_save)
    with pytest.raises(RuntimeError, match="Interrupted"):
        load_demo.load_client(client, "r6-test", "R6 test", days, progress=lambda _: None)
    monkeypatch.setattr(load_demo, "call", original)
    result = load_demo.load_client(client, "r6-test", "R6 test", days, progress=lambda _: None)
    assert result["questions"] == 7 and result["match_rate"] == 98.3
    assert (
        load_demo.load_client(client, "r6-test", "R6 test", days, progress=lambda _: None) == result
    )
