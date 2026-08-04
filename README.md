# Buffett Compos

A Buffett-checklist-based PWA for tracking and analyzing long-term Indian
equity positions. Local-first storage (IndexedDB), manual sync to Google
Drive, Screener `.xlsx` import, and NSE-sourced shareholding/bulk-deal/
corporate-action data.

## Status of each piece — read this before debugging

This was built and tested in pieces over many rounds, several of which
caught real bugs by testing against the actual uploaded Caplin Point
and eClerx Screener files rather than synthetic data. Knowing what's
verified vs not will save you time:

| Module | Status |
|---|---|
| `js/calculations.js` | **Tested** against real Screener exports (Caplin Point, eClerx). ROE, D/E, EPS CAGR, Cash EPS gap, retained earnings ratio, FCF/OCF-based DCF, verdict logic all verified against real numbers — including a real eClerx D/E discrepancy that turned out to be correct (lease liabilities under Ind AS 116 count as "borrowings" in Screener's data; two independent third-party sources confirmed the ~0.15-0.19 range). |
| `js/screenerParser.js` | **Tested** end-to-end against real uploaded files. Parses company name, 10 years of P&L/balance sheet/cash flow correctly. One caveat: it assumes Screener's "Data Sheet" tab layout stays stable — if Screener changes their export template, the row-label lookups in `ROW_LABELS` are the first thing to check. |
| `js/holdingsCalculations.js` | **Tested** with synthetic numbers matching the original mockup design — allocation %, profit %, totals all compute correctly. |
| `js/storage.js` | Tested via a real browser DOM simulation (jsdom) including last-write-wins timestamp logic for Drive sync conflicts. Worth a final sanity check in an actual browser, but the core logic has been exercised end-to-end. |
| `js/driveSync.js` | **Implemented for real** — Google Identity Services OAuth token flow, auto-pull-on-open, manual push. **Needs one setup step before it works**: create an OAuth 2.0 Client ID (Web application type) in Google Cloud Console, add your GitHub Pages URL under "Authorized JavaScript origins", enable the Drive API on that project, then paste the client ID into `DRIVE_CLIENT_ID` at the top of `js/driveSync.js`. Until that's done, "Connect Drive" will fail with an auth error — that's expected, not a bug. |
| `js/geminiClient.js` | **Confirmed working pattern** — rebuilt to mirror a separately-confirmed-working direct browser-to-Gemini integration (API key as a `?key=` query param, not a custom header, which risks a blocked CORS preflight). Needs your own Gemini API key (free tier) in Settings to test. |
| NSE live price/shareholding data | **Built** — a Cloudflare Worker (`worker/`) proxies NSE requests server-side, solving the CORS block. Needs one-time setup (deploy via Wrangler, paste the URL into `js/nseClient.js`) — see `worker/README.md`. Field-name mapping in the Worker is unverified against a live NSE response (no outbound network access to nseindia.com in the build environment); expect to fix at least one field on first real use. Manual entry remains the fallback. |
| UI screens (`js/screens/*.js`, `css/styles.css`) | Exercised via jsdom-based route tests across every screen with real Screener data, but final visual polish (spacing, mobile responsiveness) is worth a pass in an actual browser. |

## Setup

1. Copy this whole folder into your GitHub repo.
2. Enable GitHub Pages on the repo (Settings → Pages → deploy via the
   included GitHub Actions workflow, `.github/workflows/deploy.yml`).
3. Open the deployed URL. The app shell, watchlist, and all screens
   should load with an empty state ("No stocks yet").
4. To see it working with real data: open browser devtools console,
   paste the contents of `docs/seedSampleData.js`, press enter, then
   reload the page. This seeds one real stock (Caplin Point) with the
   actual numbers from a real Screener file.
5. Try the "+ Add" flow to add a second stock and upload a fresh
   Screener `.xlsx` export for it — this exercises the real parser path.

## What still needs building

- **Icons**: `icons/icon-192.png` and `icons/icon-512.png` referenced in
  `manifest.json` — placeholder icons exist; swap for real branding
  whenever you want.
- **Add Holding screen**: `#addHolding` is referenced from the Holdings
  tab's empty state but not yet built — same pattern as `addStock.js`.
- **Deploy the NSE proxy Worker** — code is written (`worker/`), but
  needs you to actually run `npx wrangler deploy` once and paste the
  resulting URL into `js/nseClient.js` before the live-fetch buttons
  do anything but fail. See `worker/README.md`.

## Price, market cap, 52-week range, shareholding — live via a proxy Worker

**Real-time NSE data turned out not to be achievable directly from a
static, backend-less PWA** — NSE's servers block direct browser
requests (CORS), confirmed against a real deployment. Two earlier
workarounds were tried and explicitly rejected: a scheduled Puppeteer
scraper (solved CORS but wasn't real-time) and Alpha Vantage (same
CORS block as NSE, plus a 25-requests/day free-tier cap).

**What's actually built now**: a small Cloudflare Worker
(`worker/src/index.js`) that proxies requests to NSE server-side,
where CORS doesn't apply at all — only the browser enforces CORS, and
there's no browser involved in a server-to-server call. The Worker
adds a clean CORS header on its way back to the PWA, which is the part
that actually unblocks the browser. This is genuinely real-time: every
fetch triggers a fresh call to NSE at that moment, no scheduled-scrape
staleness.

**Setup required** (one-time, see `worker/README.md` for full steps):
deploy the Worker via Wrangler (`npx wrangler deploy` inside the
`worker/` folder), then paste the deployed URL into `WORKER_BASE_URL`
at the top of `js/nseClient.js`.

**On each stock's detail page**: a "Fetch live data" button calls the
Worker for current price, market cap, 52-week range, and shareholding
pattern. All-time high/low is NOT covered (would need full price
history, not just a quote lookup) — that stays a manual field, set
once since it rarely changes. A manual-entry form is also always
available as a fallback if the live fetch fails.

**Known unverified risks, stated plainly**:
- NSE's exact JSON field names (in `worker/src/index.js`) were a
  best-effort mapping, not verified against a live call — the
  environment this was built in has no outbound network access to
  `nseindia.com`. First real test will likely need at least one field
  mapping fixed; `npx wrangler tail` while testing shows the raw NSE
  response to fix against.
- NSE's bot detection might treat Cloudflare's IP ranges differently
  than a residential browser IP — a different failure mode than CORS,
  and one that couldn't be tested from the build environment either.
  If this happens, the manual-entry fallback is the answer, not a code
  fix.

## AI draft assist — where it actually lives now

After uploading a Screener export (Add Stock screen, or re-uploading
from a stock's page), a single **"✨ Draft business, moat & market
position with AI"** button drafts all three qualitative fields in one
pass — not three separate per-field buttons. Requires a free Gemini
API key, pasted into Settings → "AI draft assist" once.

Drafts are generated with Google Search grounding enabled — the model
actually searches the web rather than relying purely on training data.
Nothing from AI is auto-saved as final; the draft lands in the
business/moat/position textareas, editable on the stock's Edit screen,
and only takes effect once you hit "Save changes" there — same as if
you'd typed it yourself.

## Current price — why it can look stale

The Screener `.xlsx` export's "Current Price" is the price *at the
moment you exported the file from Screener*, not a live price — this
is a property of the export itself, not a bug. Update it manually on
the stock's detail page (see the manual-entry section above) whenever
you want it current.

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

## Intrinsic value — auto-computed default, fully overridable

`calculateDefaultIV()` in `calculations.js` runs a simple DCF using
**operating cash flow** (not a stricter FCF figure — see the function's
own comment for why; an earlier OCF-minus-investing-CF approximation
was tried and produced a wildly wrong result, ~₹29 vs an actual ~₹2,400
market price, on a real test case before being replaced) as the base,
averaged over 3 years for stability, with default growth/discount/
terminal-growth assumptions that are all visible and editable on the
stock's Edit screen — adjusting any of them recalculates the estimate
live. Falls back to manual low/high entry if there isn't enough cash
flow history to compute a default. This is a single base case, not
bear/base/bull, by design — kept light across 10-12 holdings rather
than rigorous per stock.
