# Outlet Insights core

- Time: 2026-11-07 04:36 UTC (11:36 WIB).
- Task: Added pure outlet performance calculations, median quadrants with payout evidence, missing-money/match/deduction/weekday anomaly checks, city seeding, and Jakarta calendar periods with data coverage. Only new feature files were created.
- Tests: Wrote the core acceptance tests first. Initial uv execution was blocked by cache permissions and then OneDrive hardlink incompatibility during dependency setup; the root run completed setup with copy mode. `backend/.venv/Scripts/python.exe -m pytest -q tests/test_performance_core.py`: 17 passed. Ruff format/check passed for both new core files.
- Decisions: Money ratios use fractions; match rate preserves the existing analysis percentage units. Unassigned credits stay outside outlet rows. Undefined ratios and zero-MAD comparisons are not guessed. The last-quarter check resolves to 2026-07-01 through 2026-09-30 with zero coverage for October demo dates. Sale/payout money-gap kinds are not matching-record reasons, so their drilldowns retain outlet/date scope with a blank reason.
- Merged: no; integration is reserved for Taufiq.
