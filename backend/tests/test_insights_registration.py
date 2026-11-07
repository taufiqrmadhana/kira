"""Insights is part of the normal application, without feature-local setup."""
from kira.api.app import create_app
from kira.db import Base


def test_insights_routes_and_model_registered():
    paths = set(create_app().openapi()["paths"])
    assert {
        "/api/performance/outlets",
        "/api/performance/anomalies",
        "/api/performance/outlet-profiles",
    } <= paths
    assert "outlet_profiles" in Base.metadata.tables


def test_insights_tools_registered():
    from kira.agent.agent import TOOLS
    from kira.agent.tools_insights import INSIGHTS_TOOLS
    assert all(tool in TOOLS for tool in INSIGHTS_TOOLS)
