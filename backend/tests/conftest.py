"""Keep background reads from racing tests that replace analysis functions."""

import pytest

from kira.services import analysis


@pytest.fixture(autouse=True)
def quiescent_analysis_cache(monkeypatch):
    # A run schedules speculative reads in production. Tests often monkeypatch
    # those same reads to assert call counts, so launch them explicitly only in
    # the scheduler test. Commit scheduling and actual warming have separate tests.
    original = analysis.schedule_warm
    monkeypatch.setattr(analysis, "schedule_warm", lambda engine: None)
    yield original
