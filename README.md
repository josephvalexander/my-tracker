# Portfolio Tracker

A Buffett-checklist-based PWA for tracking and analyzing long-term Indian
equity positions. Local-first storage (IndexedDB), manual sync to Google
Drive, Screener `.xlsx` import, and NSE-sourced shareholding/bulk-deal/
corporate-action data.

## Status of each piece — read this before debugging

This was built and tested in pieces. Some parts are verified against
real data; one part is a structurally-sound scaffold that needs your
own verification once it runs in a real browser against the real NSE
site. Knowing which is which will save you time:

| Module | Status |
|---|---|
| `js/calculations.js` | **Tested** against the real Caplin Point Screener export. ROE, D/E, EPS CAGR, Cash EPS gap, retained earnings ratio, verdict logic all verified to produce correct, sane numbers — including correctly handling a real data gap (a missing FY26 share count) without crashing. |
| `js/screenerParser.js` | **Tested** end-to-end against your actual uploaded file. Parses company name, 10 years of P&L/balance sheet/cash flow correctly. One caveat: it assumes Screener's "Data Sheet" tab layout stays stable — if Screener changes their export template, the row-label lookups in `ROW_LABELS` are the first thing to check. |
| `js/holdingsCalculations.js` | **Tested** with synthetic numbers matching the original mockup design — allocation %, profit %, totals all compute correctly. |
| `js/storage.js` | **Not yet run in a real browser.** IndexedDB code is standard and should work, but only Node-side logic was tested in this build session (no real browser/IndexedDB available in the dev sandbox). Test this first when you load the app for real. |
| `js/nseClient.js` | **Unverified scaffold.** The fetch logic, error handling, and batch-refresh-with-delay structure are sound, but the actual field names used to parse NSE's JSON responses (`promoterGroup`, `fii`, etc. in `fetchShareholding`) are educated guesses — I could not call the real NSE API from this environment to confirm response shape. **This is the first thing to debug** once you try a real fetch: open browser devtools, look at the actual JSON NSE returns, and adjust the field mappings in `nseClient.js` to match. |
| `js/driveSync.js` | **Unverified scaffold**, intentionally minimal. Wire your existing OAuth token flow from V-Plantations/Veettu Chilavu into the `accessToken` parameter — this file assumes that already exists rather than rebuilding it. |
| UI screens (`js/screens/*.js`, `css/styles.css`) | **Not visually verified** — written carefully against the mockup designs from planning, but never actually rendered in a browser during this build session. Expect minor CSS/layout fixes once you open it for real. |

## Setup

1. Copy this whole folder into your GitHub repo.
2. Enable GitHub Pages on the repo (Settings → Pages → deploy from branch).
3. Open the deployed URL. The app shell, watchlist, and all screens
   should load with an empty state ("No stocks yet").
4. To see it working with real data: open browser devtools console,
   paste the contents of `docs/seedSampleData.js`, press enter, then
   reload the page. This seeds one real stock (Caplin Point) with the
   actual numbers from your uploaded Screener file.
5. Try the "+ Add" flow to add a second stock and upload a fresh
   Screener `.xlsx` export for it — this exercises the real parser path.

## What still needs building

- **Icons**: `icons/icon-192.png` and `icons/icon-512.png` referenced in
  `manifest.json` don't exist yet — add your own app icon at those sizes
  or the PWA install prompt will look broken.
- **Stock charts/sector/notes sub-screens**: the detail screen's tab row
  links to `#stockCharts/`, `#stockSector/`, `#stockNotes/` routes that
  aren't registered yet — these are the Charts, vs Sector, and My Thesis
  tabs from the mockups. Same pattern as the other screen files; build
  these next following the same `registerScreen()` convention.
- **Add Holding screen**: `#addHolding` is referenced from the Holdings
  tab's empty state but not yet built — same pattern as `addStock.js`.
- **Batch NSE refresh UI**: `nseClient.js batchRefresh()` exists and
  works structurally, but the screen that lets you select stocks and
  watch progress (from the earlier mockup) isn't wired up yet.
- **Google OAuth**: reuse your existing flow; just call
  `driveSync.pushToDrive(accessToken, await exportAll())` and
  `driveSync.pullFromDrive(accessToken)` from wherever you get a token.

## Data schema

See `docs/DATA_SCHEMA.md` for the full shape of a Stock record and
where each field comes from (Screener export, NSE fetch, or manual
entry). This is the contract every module assumes — change it
carefully and update `calculations.js` and `screenerParser.js` together.

## Buffett rule thresholds (current defaults)

- ROE ≥ 15% green, ≥ 10% yellow, else red
- ROCE ≥ 15% green, ≥ 10% yellow, else red
- D/E ≤ 0.1 green, ≤ 0.2 yellow, else red
- EPS CAGR ≥ 12% green, ≥ 6% yellow, else red
- Earnings consistency ≥ 8/10 green, ≥ 6/10 yellow, else red (N/A if <10y data)
- Promoter holding ≥ 50% green, ≥ 40% yellow, else red
- Promoter pledging = 0% green, else red (any pledging is a hard flag)
- Retained earnings ratio ≥ 1.0 green, ≥ 0.6 yellow, else red

Adjustable in Settings → "Buffett rule thresholds" (currently only D/E
is wired to the UI; the rest are in `js/calculations.js DEFAULT_RULES`).

## The 10-year ownership verdict

Auto-derived, never manually set — see `deriveVerdict()` in
`calculations.js`. Any one hard flag (ROE <15%, D/E >0.2, any pledging,
declining promoter holding) forces "No". Otherwise, 2+ soft flags
(EPS CAGR <12%, consistency <8/10, retained earnings ratio <1.0) forces
"No". The verdict banner shows the actual checks that passed/failed, not
just the headline answer.
