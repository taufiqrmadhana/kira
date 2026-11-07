# Cache and legacy route fixes

- Time: 2026-11-07 12:18 WIB
- Task: Make direct HTML entry points revalidate the current release, and retain workspace and filter query parameters when migrating legacy hash bookmarks. Query parameters inside the hash route deliberately override matching outer parameters. API responses and application data are unchanged.
- Verification: Tests written first; the direct `/index.html` cache regression failed before the fix. `uv run pytest -q tests/test_ui_cache.py tests/test_api.py`: 13 passed. `npm test -- src/lib/legacyHashRoute.test.ts`: 6 passed.
- Finding: These are confirmed routing/cache edge cases. They do not establish why the user's current browser shows the old design.
- Merged: no; changes prepared in the shared dev checkout for integration and deployment by the parent task.
