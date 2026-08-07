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

  // Human-readable soft flag labels
  const SOFT_FLAG_LABELS = {
    epsCagrBelow12:   "EPS CAGR < 12%",
    consistencyBelow5: "Earnings consistency < 5/6",
    rerBelow1:        "Retained earnings ratio < 1x",
  };

  // Show WHY it's No — hard flags first, then soft flags if they're the reason
  let flagSummary;
  if (isYes) {
    const parts = [];
    if (verdict.hardFlags.length === 0) parts.push("0 hard flags");
    if (verdict.softFlags.length > 0) parts.push(`${verdict.softFlags.length} soft flag${verdict.softFlags.length === 1 ? "" : "s"}`);
    flagSummary = parts.join(", ") || "0 flags";
  } else if (verdict.hardFlags.length > 0) {
    flagSummary = `${verdict.hardFlags.length} hard flag${verdict.hardFlags.length === 1 ? "" : "s"} found`;
  } else {
    // No from soft flags — show exactly which ones
    const softLabels = verdict.softFlags.map((f) => SOFT_FLAG_LABELS[f] || f).join(", ");
    flagSummary = `soft flags: ${softLabels}`;
  }

  // Soft flag chips — shown below the hard-flag chips when they're the reason for No
  const softChips = (!isYes && verdict.hardFlags.length === 0 && verdict.softFlags.length > 0)
    ? `<div class="verdict-soft-note">These aren't hard disqualifiers — use your judgement:</div>`
    : "";

  return `
    <div class="verdict-banner ${cls}">
      <div class="verdict-question">Own for 10 years if the market shut down tomorrow?</div>
      <div class="verdict-answer">
        <span class="verdict-word">${verdict.verdict}</span>
        <span class="verdict-detail">auto-derived from checklist · ${flagSummary}</span>
      </div>
      <div class="verdict-chips">${chips}</div>
      ${softChips}
    </div>`;
}

function priceContextStrip(stock) {
  const pc = stock.priceContext || {};
  const mcap = stock.fundamentals?.marketCap;
  const has52w = pc.week52Low && pc.week52High;

  return `
    <div class="price-context-grid">
      <div class="price-context-box">
        <div class="price-context-label">Market cap</div>
        <div class="price-context-value">${mcap ? "₹" + Math.round(mcap).toLocaleString("en-IN") + " Cr" : "—"}</div>
      </div>
      <div class="price-context-box">
        <div class="price-context-label">52w range</div>
        <div class="price-context-value">${has52w ? `${Math.round(pc.week52Low).toLocaleString("en-IN")}–${Math.round(pc.week52High).toLocaleString("en-IN")}` : "—"}</div>
      </div>
      <div class="price-context-box">
        <div class="price-context-label">P/E (TTM)</div>
        <div class="price-context-value">${pc.peTTM ? pc.peTTM.toFixed(1) : "—"}</div>
      </div>
      <div class="price-context-box">
        <div class="price-context-label">Sector P/E</div>
        <div class="price-context-value">${pc.sectorPE ? pc.sectorPE.toFixed(1) : "—"}</div>
      </div>
    </div>`;
}

function nseRefreshSection(stock) {
  const lastFetched = stock.priceContext?.lastUpdated;
  const fundamentalsDate = stock.fundamentals?.lastUpdated;
  const daysSinceFundamentals = fundamentalsDate
    ? Math.floor((Date.now() - new Date(fundamentalsDate)) / 86400000)
    : null;
  const fundamentalsStale = daysSinceFundamentals === null || daysSinceFundamentals > 30;
  const hasQualitative = stock.qualitative?.business;

  return `
    <div class="card nse-refresh-card">
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-start;">

        <div style="flex:1; min-width:0;">
          <div class="nse-refresh-title">Live price</div>
          <div class="muted" style="font-size:11px; margin-bottom:6px;">Yahoo Finance · ${lastFetched ? `updated ${lastFetched}` : "not fetched yet"}</div>
          <div style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">
            <input type="text" id="yahoo-symbol-input" value="${stock.yahooSymbol || stock.ticker.replace(/\s+/g,'')}" style="font-size:11px; padding:4px 6px; width:110px; border:0.5px solid var(--color-border); border-radius:6px; background:var(--color-surface); color:var(--color-text);" placeholder="e.g. CLEAN" title="Yahoo Finance symbol (without .NS). Edit if fetch fails." />
            <span class="muted" style="font-size:10px;">.NS</span>
          </div>
          <button id="nse-fetch-btn" class="btn btn-small btn-primary-outline">↻ Fetch live price</button>
          <div id="nse-fetch-status" class="muted" style="font-size:11px; margin-top:4px;"></div>
        </div>

        <div style="flex:1; min-width:0; padding-left:12px; border-left:0.5px solid var(--color-border);">
          <div class="nse-refresh-title">Fundamentals</div>
          <div class="muted" style="font-size:11px; margin-bottom:6px;">indianapi.in · ${fundamentalsDate ? `updated ${fundamentalsDate}` : "not fetched yet"}${fundamentalsStale ? " · <span style='color:var(--color-warning)'>stale</span>" : ""}</div>
          <button id="indianapi-refresh-btn" class="btn btn-small ${fundamentalsStale ? "btn-primary-outline" : ""}">↻ Refresh fundamentals</button>
          <div id="indianapi-refresh-status" class="muted" style="font-size:11px; margin-top:4px;"></div>
        </div>

      </div>

      <div style="margin-top:12px; padding-top:12px; border-top:0.5px solid var(--color-border);">
        <div class="nse-refresh-title">Business · Moat · Market position</div>
        <div class="muted" style="font-size:11px; margin-bottom:6px;">Gemini AI with web search · ${hasQualitative ? "drafted — edit on the edit screen" : "not yet drafted"}</div>
        <button id="ai-qualitative-btn" class="btn btn-small">✨ Fetch business / competitive data</button>
        <div id="ai-qualitative-status" class="muted" style="font-size:11px; margin-top:4px;"></div>
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
    const qRevGrowth = quarterlyRevenueGrowthYoY(stock);
    const qPATMargin = quarterlyPATMargin(stock);

    const latestQ = stock.fundamentals?.quarterly;
    const latestQPeriod = latestQ?.periods?.slice(-1)?.[0] ?? null;
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

        <div class="section-label">Business <span class="section-label-note">(AI-drafted or manual — edit on the edit screen)</span></div>
        <div class="card">${stock.qualitative?.business || '<span class="muted">Not set yet — add this from the edit screen.</span>'}</div>

        <div class="section-label">Competitive advantage <span class="section-label-note">(AI-drafted or manual)</span></div>
        <div class="card">
          ${stock.qualitative?.moatDescription || '<span class="muted">Not set yet.</span>'}
          <div class="tag-row">${(stock.qualitative?.moatTags || []).map((t) => `<span class="tag">${t.replace(/_/g, " ")}</span>`).join("")}</div>
        </div>

        <div class="section-label">Market position <span class="section-label-note">(AI-drafted or manual)</span></div>
        <div class="card">${stock.qualitative?.marketPosition || '<span class="muted">Not set yet.</span>'}</div>

        <div class="section-label">Profitability & capital efficiency</div>
        <div class="card metric-card">
          ${metricRow("ROE (5y avg)", roe, formatPct(roe), colorForMetric(roe, DEFAULT_RULES.roe))}
          ${metricRow("ROCE (5y avg)", roce, formatPct(roce), colorForMetric(roce, DEFAULT_RULES.roce))}
          ${metricRow("EPS CAGR (5y)", cagr, formatPct(cagr), colorForMetric(cagr, DEFAULT_RULES.epsCagr))}
          ${latestQPeriod ? metricRow(
            `Revenue growth YoY (${latestQPeriod})`,
            qRevGrowth,
            qRevGrowth !== null ? `${qRevGrowth >= 0 ? "+" : ""}${qRevGrowth.toFixed(1)}%` : "N/A — needs 5 quarters",
            qRevGrowth === null ? "neutral" : qRevGrowth >= 10 ? "green" : qRevGrowth >= 0 ? "yellow" : "red"
          ) : ""}
          ${latestQPeriod ? metricRow(
            `PAT margin (${latestQPeriod})`,
            qPATMargin,
            qPATMargin !== null ? formatPct(qPATMargin) : "N/A",
            qPATMargin === null ? "neutral" : qPATMargin >= 15 ? "green" : qPATMargin >= 8 ? "yellow" : "red"
          ) : ""}
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

        ${(() => {
          const news = stock.recentNews;
          if (!news?.length) return "";
          return `
            <div class="section-label">Recent news</div>
            <div class="card" style="padding:0;">
              ${news.map((n, i) => {
                const date = n.date ? new Date(n.date).toLocaleDateString("en-IN", { day:"numeric", month:"short" }) : "";
                const summary = n.summary ? n.summary.slice(0, 120) + (n.summary.length > 120 ? "…" : "") : "";
                return `<a href="${n.url || "#"}" target="_blank" rel="noopener" class="news-item ${i < news.length - 1 ? "news-item-border" : ""}">
                  <div class="news-headline">${n.headline}</div>
                  ${summary ? `<div class="news-summary muted">${summary}</div>` : ""}
                  <div class="news-meta muted">${date}${n.timeToRead ? ` · ${n.timeToRead} min read` : ""}</div>
                </a>`;
              }).join("")}
            </div>`;
        })()}

        ${(() => {
          const ac = stock.analystConsensus;
          if (!ac || ac.total === 0) return "";
          return `
            <div class="section-label">Analyst consensus <span class="section-label-note">${ac.total} analyst${ac.total === 1 ? "" : "s"}</span></div>
            <div class="card">
              <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
                <div style="font-size:18px; font-weight:700; color:var(--color-text);">${ac.consensusLabel || "—"}</div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  ${(ac.ratings || []).map(r =>
                    `<span style="font-size:12px; background:${r.color}22; color:${r.color}; border:1px solid ${r.color}44; border-radius:12px; padding:2px 10px;">${r.count} ${r.name}</span>`
                  ).join("")}
                </div>
              </div>
            </div>`;
        })()}

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
          const parsed = await fetchIndianApiData(ticker, settings.indianApiKey);
          await applyIndianApiResult(ticker, parsed);
          statusEl.textContent = "✓ Updated — refreshing page...";
          setTimeout(() => navigate(`#stock/${ticker}`), 800);
        } catch (err) {
          statusEl.textContent = `⚠ Refresh failed: ${err.message}`;
          indianapiRefreshBtn.disabled = false;
        }
      });
    }

    const aiQualitativeBtn = document.getElementById("ai-qualitative-btn");
    if (aiQualitativeBtn) {
      aiQualitativeBtn.addEventListener("click", async () => {
        const statusEl = document.getElementById("ai-qualitative-status");
        const settings = await MetaStore.getSettings();
        if (!settings?.geminiApiKey) {
          statusEl.textContent = "Add a Gemini API key in Settings first.";
          return;
        }
        statusEl.textContent = "Fetching from Gemini...";
        aiQualitativeBtn.disabled = true;
        try {
          const stock = await StockStore.get(ticker);
          const result = await draftAllQualitative(settings.geminiApiKey, stock);
          stock.qualitative = stock.qualitative || {};
          stock.qualitative.business = result.business;
          stock.qualitative.moatDescription = result.moat;
          stock.qualitative.marketPosition = result.marketPosition;
          await StockStore.set(ticker, stock);
          statusEl.textContent = "✓ Drafted — review below or edit on the edit screen.";
          setTimeout(() => navigate(`#stock/${ticker}`), 800);
        } catch (err) {
          statusEl.textContent = `⚠ ${err.message}`;
        }
        aiQualitativeBtn.disabled = false;
      });
    }

    const fetchBtn = document.getElementById("nse-fetch-btn");
    if (fetchBtn) {
      fetchBtn.addEventListener("click", async () => {
        const statusEl = document.getElementById("nse-fetch-status");
        statusEl.innerHTML = `<span>Fetching...</span>`;
        fetchBtn.disabled = true;

        // Read and save the Yahoo symbol override
        const yahooInput = document.getElementById("yahoo-symbol-input");
        const yahooSymbolValue = yahooInput?.value?.trim().toUpperCase() || null;

        const result = await refreshStockFromNse(ticker, yahooSymbolValue);
        const stock = await StockStore.get(ticker);
        const today = new Date().toISOString().slice(0, 10);

        // Save yahooSymbol if it differs from the default
        if (yahooSymbolValue && yahooSymbolValue !== stock.ticker.replace(/\s+/g, "")) {
          stock.yahooSymbol = yahooSymbolValue;
        }

        if (result.quoteInfo) {
          stock.fundamentals = stock.fundamentals || {};
          if (result.quoteInfo.currentPrice) stock.fundamentals.currentPrice = result.quoteInfo.currentPrice;
          if (result.quoteInfo.marketCap) stock.fundamentals.marketCap = result.quoteInfo.marketCap;
          if (result.quoteInfo.name && (!stock.name || stock.name === stock.ticker)) stock.name = result.quoteInfo.name;
          if (result.quoteInfo.sector && !stock.sector) stock.sector = result.quoteInfo.sector;

          // Spread existing priceContext FIRST so fields set by indianapi
          // (peTTM, week52High/Low from the fundamentals fetch) are preserved.
          // Previously this block rebuilt priceContext from scratch and silently
          // dropped peTTM every time "Fetch live price" was clicked.
          stock.priceContext = {
            ...stock.priceContext,
            source: result.quoteInfo.source === "bse" ? "bse_live" : "yahoo_finance",
            lastUpdated: today,
            ...(result.quoteInfo.week52High && { week52High: result.quoteInfo.week52High }),
            ...(result.quoteInfo.week52Low  && { week52Low:  result.quoteInfo.week52Low  }),
            ...(result.quoteInfo.todayLow   && { todayLow:   result.quoteInfo.todayLow   }),
            ...(result.quoteInfo.todayHigh  && { todayHigh:  result.quoteInfo.todayHigh  }),
            ...(result.quoteInfo.previousClose && { previousClose: result.quoteInfo.previousClose }),
            ...(result.quoteInfo.dayChangePct != null && { dayChangePct: result.quoteInfo.dayChangePct }),
          };
          // Set watchlistPrice on first ever fetch if not already stored
          if (!stock.watchlistPrice && result.quoteInfo.currentPrice) {
            stock.watchlistPrice = result.quoteInfo.currentPrice;
          }
          // Only derive market cap if we don't already have one from indianapi.
          // calculateMarketCap uses sharesOutstanding which has inconsistent units
          // in indianapi across stocks — the reusable.marketCap from indianapi is
          // always correct, so preserve it when it exists.
          if (!stock.fundamentals.marketCap) {
            const derivedMarketCap = calculateMarketCap(stock);
            if (derivedMarketCap) stock.fundamentals.marketCap = derivedMarketCap;
          }
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
