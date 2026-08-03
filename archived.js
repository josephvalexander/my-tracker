/**
 * screens/stockDetail.js
 *
 * Full Buffett-checklist breakdown for one stock. Verdict banner is
 * auto-derived (deriveVerdict) — never manually set, per the design
 * decision to avoid talking yourself into a "Yes" on a stock you like.
 */

function metricRow(label, value, formatted, colorClass) {
  const dot = colorClass ? `<span class="dot dot-${colorClass}"></span>` : "";
  return `
    <div class="metric-row">
      <div class="metric-row-label">${label}</div>
      <div class="metric-row-value">${formatted}${dot}</div>
    </div>`;
}

function verdictBanner(verdict) {
  const isYes = verdict.verdict === "Yes";
  const cls = isYes ? "verdict-yes" : "verdict-no";
  const chips = verdict.checks
    .map((c) => {
      if (c.pass === null) {
        return `<span class="chip-small chip-small-unknown">? ${c.label}</span>`;
      }
      return `<span class="chip-small ${c.pass ? "chip-small-pass" : "chip-small-fail"}">${c.pass ? "✓" : "✗"} ${c.label}</span>`;
    })
    .join("");
  const flagSummary = isYes
    ? `${verdict.hardFlags.length} hard flags, ${verdict.softFlags.length} soft flags`
    : `${verdict.hardFlags.length} hard flag${verdict.hardFlags.length === 1 ? "" : "s"} found`;

  return `
    <div class="verdict-banner ${cls}">
      <div class="verdict-question">Own for 10 years if the market shut down tomorrow?</div>
      <div class="verdict-answer">
        <span class="verdict-word">${verdict.verdict}</span>
        <span class="verdict-detail">auto-derived from checklist · ${flagSummary}</span>
      </div>
      <div class="verdict-chips">${chips}</div>
    </div>`;
}

function priceContextStrip(stock) {
  const pc = stock.priceContext || {};
  const hasTodayRange = pc.todayLow && pc.todayHigh;
  return `
    <div class="price-context-grid">
      <div class="price-context-box">
        <div class="price-context-label">Market cap</div>
        <div class="price-context-value">${stock.fundamentals?.marketCap ? "₹" + Math.round(stock.fundamentals.marketCap).toLocaleString("en-IN") + " Cr" : "—"}</div>
      </div>
      ${hasTodayRange
        ? `<div class="price-context-box">
            <div class="price-context-label">Today's range</div>
            <div class="price-context-value">${Math.round(pc.todayLow).toLocaleString("en-IN")}–${Math.round(pc.todayHigh).toLocaleString("en-IN")}</div>
          </div>`
        : ""}
      <div class="price-context-box">
        <div class="price-context-label">52w range</div>
        <div class="price-context-value">${pc.week52Low && pc.week52High ? `${Math.round(pc.week52Low).toLocaleString("en-IN")}–${Math.round(pc.week52High).toLocaleString("en-IN")}` : "—"}</div>
      </div>
      <div class="price-context-box">
        <div class="price-context-label">P/E (TTM)</div>
        <div class="price-context-value">${pc.peTTM ? pc.peTTM.toFixed(1) : "—"}</div>
      </div>
    </div>`;
}

function nseRefreshSection(stock) {
  const latestShareholding = stock.shareholding?.history?.slice(-1)?.[0] ?? null;
  const lastFetched = stock.priceContext?.lastUpdated;
  const fundamentalsDate = stock.fundamentals?.lastUpdated;
  const daysSinceFundamentals = fundamentalsDate
    ? Math.floor((Date.now() - new Date(fundamentalsDate)) / 86400000)
    : null;
  const fundamentalsStale = daysSinceFundamentals === null || daysSinceFundamentals > 30;

  return `
    <div class="card nse-refresh-card">
      <div class="nse-refresh-top">
        <div>
          <div class="nse-refresh-title">Live price</div>
          <div class="muted" style="font-size:11px;">Yahoo Finance (primary) · BSE (fallback) · ${lastFetched ? `price last updated ${lastFetched}` : "not fetched yet"}</div>
        </div>
      </div>
      <button id="nse-fetch-btn" class="btn btn-small btn-primary-outline" style="margin-top:8px;">Fetch live price</button>
      <div id="nse-fetch-status"></div>

      <div style="margin-top:12px; padding-top:12px; border-top:0.5px solid var(--color-border);">
        <div class="nse-refresh-title">Fundamentals &amp; shareholding</div>
        <div class="muted" style="font-size:11px;">indianapi.in · ${fundamentalsDate ? `last updated ${fundamentalsDate}` : "not fetched yet"} ${fundamentalsStale ? "· <span style='color:var(--color-warning)'>⚠ stale — refresh recommended</span>" : ""}</div>
        <button id="indianapi-refresh-btn" class="btn btn-small ${fundamentalsStale ? "btn-primary-outline" : ""}" style="margin-top:8px;">
          ${fundamentalsStale ? "Refresh fundamentals" : "Refresh fundamentals (up to date)"}
        </button>
        <div id="indianapi-refresh-status" class="muted" style="font-size:11px;"></div>
      </div>
    </div>`;
}

const stockDetailScreen = {
  async render(params) {
    const ticker = params[0];
    const stock = await StockStore.get(ticker);
    if (!stock) {
      return `<div class="screen-padding"><div class="empty-state">Stock not found.</div></div>`;
    }

    const verdict = deriveVerdict(stock);
    const roe = roe5yAvg(stock);
    const roce = roce5yAvg(stock);
    const cagr = epsCagr(stock);
    const de = debtToEquity(stock);
    const cashGap = cashEpsGap(stock);
    const fcfY = fcfYield(stock);
    const divTrend = dividendPayoutTrend(stock);
    const shareTrend = shareCountTrend(stock);
    const consistency = earningsConsistencyScore(stock);
    const rer = retainedEarningsRatio(stock);

    const latestShareholding = stock.shareholding?.history?.slice(-1)?.[0] ?? null;

    return `
      <div class="screen-padding">
        <div class="detail-header">
          <button class="back-btn" onclick="window.location.hash='#watchlist'">&larr;</button>
          <div class="detail-title">
            <div class="detail-name">${stock.name || stock.ticker}</div>
            <div class="detail-meta">${stock.ticker} · ${stock.sector || "Sector not set"} · NSE</div>
          </div>
          <div class="detail-price">
            <div class="price-main">${formatCurrency(stock.fundamentals?.currentPrice)}</div>
          </div>
        </div>

        ${priceContextStrip(stock)}
        ${nseRefreshSection(stock)}
        ${verdictBanner(verdict)}

        <div class="section-label">Business <span class="section-label-note">(manual — no free source gives this)</span></div>
        <div class="card">${stock.qualitative?.business || '<span class="muted">Not set yet — add this from the edit screen.</span>'}</div>

        <div class="section-label">Competitive advantage <span class="section-label-note">(manual)</span></div>
        <div class="card">
          ${stock.qualitative?.moatDescription || '<span class="muted">Not set yet.</span>'}
          <div class="tag-row">${(stock.qualitative?.moatTags || []).map((t) => `<span class="tag">${t.replace(/_/g, " ")}</span>`).join("")}</div>
        </div>

        <div class="section-label">Market position <span class="section-label-note">(manual)</span></div>
        <div class="card">${stock.qualitative?.marketPosition || '<span class="muted">Not set yet.</span>'}</div>

        <div class="section-label">Profitability & capital efficiency</div>
        <div class="card metric-card">
          ${metricRow("ROE (5y avg)", roe, formatPct(roe), colorForMetric(roe, DEFAULT_RULES.roe))}
          ${metricRow("ROCE (5y avg)", roce, formatPct(roce), colorForMetric(roce, DEFAULT_RULES.roce))}
          ${metricRow("EPS CAGR (5y)", cagr, formatPct(cagr), colorForMetric(cagr, DEFAULT_RULES.epsCagr))}
        </div>

        <div class="section-label">Balance sheet & cash quality</div>
        <div class="card metric-card">
          ${metricRow("Debt to equity", de, formatRatio(de), colorForMetric(de, DEFAULT_RULES.de))}
          ${metricRow("Cash EPS gap (OCF/sh − EPS)", cashGap, cashGap !== null ? cashGap.toFixed(2) : "N/A", cashGap !== null ? (cashGap >= 0 ? "green" : "red") : null)}
          ${metricRow("Free cash flow yield (approx.)", fcfY, fcfY !== null ? formatPct(fcfY.value, 1) + " ⚠" : "N/A", null)}
          ${metricRow("Dividend payout trend", divTrend, divTrend ? `${divTrend.start.toFixed(0)}% → ${divTrend.end.toFixed(0)}%` : "N/A", null)}
          ${metricRow("Share count trend (5y)", shareTrend, shareTrend || "N/A", null)}
          ${metricRow("Earnings consistency (6y)", consistency, consistency !== null ? `${consistency}/6` : "N/A — needs 6y data", colorForMetric(consistency, DEFAULT_RULES.earningsConsistency))}
        </div>

        <div class="section-label">Ownership & retained earnings</div>
        <div class="card metric-card">
          ${metricRow("Promoter holding", latestShareholding?.promoter, latestShareholding ? formatPct(latestShareholding.promoter, 1) : "N/A — fetch from NSE", colorForMetric(latestShareholding?.promoter, DEFAULT_RULES.promoterHolding))}
          ${metricRow("Promoter pledging", latestShareholding?.pledged, latestShareholding?.pledged != null ? formatPct(latestShareholding.pledged, 1) : "—  not in indianapi data", latestShareholding?.pledged != null ? colorForMetric(latestShareholding.pledged, DEFAULT_RULES.promoterPledging) : "neutral")}
          ${metricRow("Buffett retained earnings ratio", rer, rer !== null ? `${rer.toFixed(2)}x` : "N/A", colorForMetric(rer, DEFAULT_RULES.retainedEarningsRatio))}
        </div>

        <div class="section-label">Corporate actions</div>
        <div class="card">
          ${(() => {
            const ca = stock.corporateActions;
            const divs = ca?.dividends || [];
            const splits = ca?.splits || [];
            const bonus = ca?.bonus || [];
            const total = divs.length + splits.length + bonus.length;
            if (total === 0) return '<span class="muted">None on record — will appear after indianapi fetch.</span>';
            const rows = [];
            divs.forEach((d) => rows.push(
              `<div class="action-row">
                <span class="action-type">Dividend</span>
                <span>₹${d.amount} ${d.type || ""}</span>
                <span class="muted">${d.recordDate || d.announced || ""}</span>
              </div>`
            ));
            splits.forEach((s) => rows.push(
              `<div class="action-row">
                <span class="action-type">Split</span>
                <span>${s.ratio || ""}</span>
                <span class="muted">${s.recordDate || s.announced || ""}</span>
              </div>`
            ));
            bonus.forEach((b) => rows.push(
              `<div class="action-row">
                <span class="action-type">Bonus</span>
                <span>${b.ratio || ""}</span>
                <span class="muted">${b.recordDate || b.announced || ""}</span>
              </div>`
            ));
            return `<div class="corporate-actions-scroll">${rows.join("")}</div>`;
          })()}
        </div>

        <div class="detail-tab-row">
          <button class="detail-tab-btn" data-go="#stockCharts/${ticker}">Charts</button>
          <button class="detail-tab-btn" data-go="#stockNotes/${ticker}">My thesis</button>
        </div>
      </div>`;
  },

  async afterRender(params) {
    const ticker = params[0];

    document.querySelectorAll(".detail-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.location.hash = btn.dataset.go;
      });
    });

    const indianapiRefreshBtn = document.getElementById("indianapi-refresh-btn");
    if (indianapiRefreshBtn) {
      indianapiRefreshBtn.addEventListener("click", async () => {
        const statusEl = document.getElementById("indianapi-refresh-status");
        const settings = await MetaStore.getSettings();
        if (!settings?.indianApiKey) {
          statusEl.textContent = "Add your indianapi.in key in Settings first.";
          return;
        }
        statusEl.textContent = "Fetching from indianapi.in...";
        indianapiRefreshBtn.disabled = true;
        try {
          const stock = await StockStore.get(ticker);
          const searchName = stock.name && stock.name !== ticker ? stock.name : ticker;
          const parsed = await fetchIndianApiData(searchName, settings.indianApiKey);
          await applyIndianApiResult(ticker, parsed);
          statusEl.textContent = "✓ Updated — refreshing page...";
          setTimeout(() => navigate(`#stock/${ticker}`), 800);
        } catch (err) {
          statusEl.textContent = `⚠ Refresh failed: ${err.message}`;
          indianapiRefreshBtn.disabled = false;
        }
      });
    }

    const fetchBtn = document.getElementById("nse-fetch-btn");
    if (fetchBtn) {
      fetchBtn.addEventListener("click", async () => {
        const statusEl = document.getElementById("nse-fetch-status");
        statusEl.innerHTML = `<div class="muted" style="font-size:11px; margin-top:6px;">Fetching...</div>`;
        fetchBtn.disabled = true;

        const result = await refreshStockFromNse(ticker);
        const stock = await StockStore.get(ticker);
        const today = new Date().toISOString().slice(0, 10);

        if (result.quoteInfo) {
          stock.fundamentals = stock.fundamentals || {};
          if (result.quoteInfo.currentPrice) stock.fundamentals.currentPrice = result.quoteInfo.currentPrice;
          if (result.quoteInfo.marketCap) stock.fundamentals.marketCap = result.quoteInfo.marketCap;
          if (result.quoteInfo.name && (!stock.name || stock.name === stock.ticker)) stock.name = result.quoteInfo.name;
          stock.priceContext = stock.priceContext || {};
          stock.priceContext.source = result.quoteInfo.source === "bse" ? "bse_live" : "yahoo_finance";
          stock.priceContext.lastUpdated = today;
          if (result.quoteInfo.week52High) stock.priceContext.week52High = result.quoteInfo.week52High;
          if (result.quoteInfo.week52Low) stock.priceContext.week52Low = result.quoteInfo.week52Low;
          if (result.quoteInfo.todayLow) stock.priceContext.todayLow = result.quoteInfo.todayLow;
          if (result.quoteInfo.todayHigh) stock.priceContext.todayHigh = result.quoteInfo.todayHigh;
          if (result.quoteInfo.previousClose) stock.priceContext.previousClose = result.quoteInfo.previousClose;
          const derivedMarketCap = calculateMarketCap(stock);
          if (derivedMarketCap) stock.fundamentals.marketCap = derivedMarketCap;
        }

        await StockStore.set(ticker, stock);

        if (result.success) {
          statusEl.innerHTML = `<div class="nse-fetch-success">✓ Price updated</div>`;
        } else {
          statusEl.innerHTML = `<div class="nse-fetch-error">⚠ ${Object.values(result.errors).join(" / ")}</div>`;
        }

        fetchBtn.disabled = false;
        navigate(`#stock/${ticker}`);
      });
    }
  },
};

registerScreen("stock", stockDetailScreen);
