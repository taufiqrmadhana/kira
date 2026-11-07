# Visual standardization

- 2026-11-07 18:48 WIB — Added roving focus, arrow keys and Home/End to shared segmented controls and selectable tables; verified existing tabs. Tests written first, five checks pass. Merged: yes (integrated on dev).
- 2026-11-07 18:52 WIB — Standardized Insights scatter with the shared dark evidence tooltip, keyboard point navigation, matching legend, real-number summary and evidence drilldown; anomaly links now open the evidence tab. Added result-ring guidance/legend/summary and roving rule ticks in matching Step 4. Seventeen targeted tests and production build pass. Merged: yes (integrated on dev).

- 2026-11-07 19:01 WIB — Browser QA on the local production preview with real Zestly Demo: ten outlets, complete profile/anomaly loads, chart hover/focus tooltips, roving point navigation, Escape dismissal, no tooltip/anchor overlap, no page overflow, and text at least 12 px at 1440/768/390. Captured and reviewed `artifacts/day-grid/screenshots/insights-*.png` and `insights-tooltip-*.png`. Zero browser/API errors. Removed the SVG native title popup while retaining the accessible chart name. Merged: yes (integrated on dev).
