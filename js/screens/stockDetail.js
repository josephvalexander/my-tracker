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
    const interestCoverage = null; // requires PBT/interest split not always present — see calculations.js roceHistory note
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
          <button class="back-btn" onclick="history.back()">&larr;</button>
          <div class="detail-title">
            <div class="detail-name">${stock.name || stock.ticker}</div>
            <div class="detail-meta">${stock.ticker} · ${stock.sector || "Sector not set"} · NSE</div>
          </div>
          <div class="detail-price">
            <div class="price-main">${formatCurrency(stock.fundamentals?.currentPrice)}</div>
          </div>
        </div>

        ${verdictBanner(verdict)}

        <div class="section-label">Business</div>
        <div class="card">${stock.qualitative?.business || '<span class="muted">Not set yet — add this from the edit screen.</span>'}</div>

        <div class="section-label">Competitive advantage</div>
        <div class="card">
          ${stock.qualitative?.moatDescription || '<span class="muted">Not set yet.</span>'}
          <div class="tag-row">${(stock.qualitative?.moatTags || []).map((t) => `<span class="tag">${t.replace(/_/g, " ")}</span>`).join("")}</div>
        </div>

        <div class="section-label">Market position</div>
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
          ${metricRow("Earnings consistency (10y)", consistency, consistency !== null ? `${consistency}/10` : "N/A — needs 10y data", colorForMetric(consistency, DEFAULT_RULES.earningsConsistency))}
        </div>

        <div class="section-label">Ownership & retained earnings</div>
        <div class="card metric-card">
          ${metricRow("Promoter holding", latestShareholding?.promoter, latestShareholding ? formatPct(latestShareholding.promoter, 1) : "N/A — fetch from NSE", colorForMetric(latestShareholding?.promoter, DEFAULT_RULES.promoterHolding))}
          ${metricRow("Promoter pledging", latestShareholding?.pledged, latestShareholding ? formatPct(latestShareholding.pledged, 1) : "N/A", colorForMetric(latestShareholding?.pledged, DEFAULT_RULES.promoterPledging))}
          ${metricRow("Buffett retained earnings ratio", rer, rer !== null ? `${rer.toFixed(2)}x` : "N/A", colorForMetric(rer, DEFAULT_RULES.retainedEarningsRatio))}
        </div>

        <div class="section-label">Corporate actions</div>
        <div class="card">
          ${(stock.corporateActions?.actions || []).length === 0
            ? '<span class="muted">None on record. Fetch from NSE or add manually.</span>'
            : stock.corporateActions.actions.map((a) => `<div class="action-row">${a.type} ${a.ratio || ""} — ${a.date}</div>`).join("")}
        </div>

        <div class="tab-row">
          <button class="tab-btn" onclick="window.location.hash='#stockCharts/${ticker}'">Charts</button>
          <button class="tab-btn" onclick="window.location.hash='#stockSector/${ticker}'">vs sector</button>
          <button class="tab-btn" onclick="window.location.hash='#stockNotes/${ticker}'">My thesis</button>
        </div>
      </div>`;
  },
};

registerScreen("stock", stockDetailScreen);
