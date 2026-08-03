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
  const peBand = pc.peHistory5y;
  const hasTodayRange = pc.todayLow && pc.todayHigh;
  return `
    <div class="price-context-grid">
      <div class="price-context-box">
        <div class="price-context-label">Market cap</div>
        <div class="price-context-value">${stock.fundamentals?.marketCap ? "₹" + stock.fundamentals.marketCap.toLocaleString("en-IN") + " Cr" : "—"}</div>
      </div>
      ${hasTodayRange
        ? `<div class="price-context-box">
            <div class="price-context-label">Today's range</div>
            <div class="price-context-value">${pc.todayLow.toLocaleString("en-IN")}–${pc.todayHigh.toLocaleString("en-IN")}</div>
          </div>`
        : ""}
      <div class="price-context-box">
        <div class="price-context-label">52w range</div>
        <div class="price-context-value">${pc.week52Low && pc.week52High ? `${pc.week52Low.toLocaleString("en-IN")}–${pc.week52High.toLocaleString("en-IN")}` : "Set manually below"}</div>
      </div>
      <div class="price-context-box">
        <div class="price-context-label">P/E (5y band)</div>
        <div class="price-context-value">${peBand ? `${peBand.current} <span class="muted">(${peBand.min}–${peBand.max})</span>` : "—"}</div>
      </div>
    </div>`;
}

function entryZoneSection(stock) {
  const status = entryZoneStatus(stock);
  const iv = stock.intrinsicValue;

  const ivBanner = iv
    ? `<div class="iv-banner">
        <span>Intrinsic value (${iv.method || "manual"})</span>
        <span class="iv-value">₹${Math.round(iv.low).toLocaleString("en-IN")} – ₹${Math.round(iv.high).toLocaleString("en-IN")}</span>
      </div>`
    : `<div class="iv-banner iv-banner-empty">
        <span>No intrinsic value set</span>
        <button class="btn btn-small" onclick="window.location.hash='#editStock/${stock.ticker}'">Add IV estimate</button>
      </div>`;

  if (!status) {
    return `${ivBanner}<div class="zone-banner zone-neutral"><span>No target price set — add an intrinsic value estimate above, or set a target manually</span></div>`;
  }

  const targetLabel = status.isDefaulted
    ? `suggested target ₹${Math.round(status.target).toLocaleString("en-IN")} (15% below IV)`
    : `your target ₹${Math.round(status.target).toLocaleString("en-IN")}`;
  const zoneCls = status.inZone ? "zone-good" : "zone-wait";
  const zoneText = status.inZone
    ? `In entry zone — ${targetLabel}, now ${Math.abs(status.pctFromTarget).toFixed(0)}% below`
    : `${status.pctFromTarget.toFixed(0)}% above ${targetLabel} — wait`;

  return `${ivBanner}
    <div class="zone-banner ${zoneCls}">
      <span>${zoneText}</span>
      <button class="btn btn-small zone-edit-btn" onclick="window.location.hash='#editStock/${stock.ticker}'">${status.isDefaulted ? "Set my own target" : "Edit target"}</button>
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

      <button id="manual-nse-toggle-btn" class="btn btn-small" style="margin-top:10px;">Enter price manually instead</button>

      <div id="manual-nse-form" style="display:none; margin-top:10px;">
        <div class="hint-box" style="margin-bottom:10px;">Fallback if the live fetch above fails or comes back wrong — find these on Screener's company page or NSE's site directly.</div>

        <div class="form-group">
          <label>Current price (₹)</label>
          <input type="number" id="manual-price-input" value="${stock.fundamentals?.currentPrice ?? ""}" placeholder="e.g. 1840" />
        </div>
        <div class="form-group">
          <label>Market cap (₹ Cr)</label>
          <input type="number" id="manual-marketcap-input" value="${stock.fundamentals?.marketCap ?? ""}" placeholder="e.g. 13200" />
        </div>
        <div style="display:flex; gap:8px;">
          <div class="form-group" style="flex:1;">
            <label>52w low (₹)</label>
            <input type="number" id="manual-52wlow-input" value="${stock.priceContext?.week52Low ?? ""}" />
          </div>
          <div class="form-group" style="flex:1;">
            <label>52w high (₹)</label>
            <input type="number" id="manual-52whigh-input" value="${stock.priceContext?.week52High ?? ""}" />
          </div>
        </div>
        <div style="display:flex; gap:8px;">
          <div class="form-group" style="flex:1;">
            <label>Promoter holding (%)</label>
            <input type="number" step="0.1" id="manual-promoter-input" value="${latestShareholding?.promoter ?? ""}" />
          </div>
          <div class="form-group" style="flex:1;">
            <label>Promoter pledging (%)</label>
            <input type="number" step="0.1" id="manual-pledging-input" value="${latestShareholding?.pledged ?? "0"}" />
          </div>
        </div>
        <button id="ai-draft-shareholding-btn" class="btn btn-small" style="margin-bottom:8px;">✨ Draft with AI (fills the boxes above — you still review and save)</button>
        <div id="shareholding-ai-status" class="muted" style="font-size:11px; margin-bottom:8px;"></div>
        <div id="shareholding-ai-sources"></div>
        <button id="save-manual-nse-btn" class="btn btn-primary">Save</button>
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
        ${entryZoneSection(stock)}
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

    const manualToggleBtn = document.getElementById("manual-nse-toggle-btn");
    if (manualToggleBtn) {
      manualToggleBtn.addEventListener("click", () => {
        const form = document.getElementById("manual-nse-form");
        form.style.display = form.style.display === "none" ? "block" : "none";
      });
    }

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

    const aiShareholdingBtn = document.getElementById("ai-draft-shareholding-btn");
    if (aiShareholdingBtn) {      aiShareholdingBtn.addEventListener("click", async () => {
        const statusEl = document.getElementById("shareholding-ai-status");
        const sourcesEl = document.getElementById("shareholding-ai-sources");
        const settings = await MetaStore.getSettings();
        if (!settings?.geminiApiKey) {
          statusEl.textContent = "Add a Gemini API key in Settings first.";
          return;
        }

        statusEl.textContent = "Searching...";
        aiShareholdingBtn.disabled = true;
        try {
          const stock = await StockStore.get(ticker);
          const result = await draftShareholding(settings.geminiApiKey, stock);

          if (result.promoterHolding !== null) {
            document.getElementById("manual-promoter-input").value = result.promoterHolding;
          }
          if (result.promoterPledging !== null) {
            document.getElementById("manual-pledging-input").value = result.promoterPledging;
          }

          const confidenceNote = result.confident
            ? `Found for ${result.asOfQuarter || "an unspecified period"} — review before saving.`
            : `⚠ Model was not confident in this figure${result.asOfQuarter ? ` (as of ${result.asOfQuarter})` : ""} — double-check carefully before saving, or leave blank.`;
          statusEl.innerHTML = confidenceNote;

          if (result.sources?.length > 0) {
            sourcesEl.innerHTML = `
              <div class="ai-sources-box">
                <div class="muted" style="font-size:10px;">Sources used:</div>
                ${result.sources.map((s) => `<a href="${s.uri}" target="_blank" class="ai-source-link">${s.title || s.uri}</a>`).join("")}
              </div>`;
          }

          if (result.promoterHolding === null && result.promoterPledging === null) {
            statusEl.textContent = "Could not find a reliable figure — try manual entry instead.";
          }
        } catch (err) {
          statusEl.textContent = `Draft failed: ${err.message}`;
        } finally {
          aiShareholdingBtn.disabled = false;
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
          stock.priceContext.source = result.quoteInfo.source === "bse" ? "bse_live" : "nse_live";
          stock.priceContext.lastUpdated = today;
          if (result.quoteInfo.week52High) stock.priceContext.week52High = result.quoteInfo.week52High;
          if (result.quoteInfo.week52Low) stock.priceContext.week52Low = result.quoteInfo.week52Low;
          if (result.quoteInfo.todayLow) stock.priceContext.todayLow = result.quoteInfo.todayLow;
          if (result.quoteInfo.todayHigh) stock.priceContext.todayHigh = result.quoteInfo.todayHigh;
          if (result.quoteInfo.previousClose) stock.priceContext.previousClose = result.quoteInfo.previousClose;

          // No BSE source confirmed working actually returns market
          // cap (it's only on the Angular page we can't read) — derive
          // it instead from the price we just fetched and shares
          // outstanding from the Screener upload.
          const derivedMarketCap = calculateMarketCap(stock);
          if (derivedMarketCap) stock.fundamentals.marketCap = derivedMarketCap;
        }

        if (result.shareholding && result.shareholding.length > 0) {
          stock.shareholding = stock.shareholding || { history: [] };
          stock.shareholding.source = "nse_live";
          stock.shareholding.lastUpdated = today;
          stock.shareholding.history = result.shareholding;
        }

        await StockStore.set(ticker, stock);

        if (result.success) {
          statusEl.innerHTML = `<div class="nse-fetch-success">✓ Updated</div>`;
        } else if (result.partial) {
          statusEl.innerHTML = `<div class="nse-fetch-partial">⚠ Partial: ${Object.entries(result.errors).map(([k, v]) => `${k} — ${v}`).join("; ")}</div>`;
        } else {
          statusEl.innerHTML = `<div class="nse-fetch-error">⚠ ${Object.values(result.errors).join(" / ")} — try "Enter manually instead" below.</div>`;
        }

        fetchBtn.disabled = false;
        navigate(`#stock/${ticker}`);
      });
    }

    const saveManualBtn = document.getElementById("save-manual-nse-btn");
    if (saveManualBtn) {
      saveManualBtn.addEventListener("click", async () => {
        const stock = await StockStore.get(ticker);
        const today = new Date().toISOString().slice(0, 10);

        const price = parseFloat(document.getElementById("manual-price-input").value);
        const marketCap = parseFloat(document.getElementById("manual-marketcap-input").value);
        const week52Low = parseFloat(document.getElementById("manual-52wlow-input").value);
        const week52High = parseFloat(document.getElementById("manual-52whigh-input").value);
        const promoter = parseFloat(document.getElementById("manual-promoter-input").value);
        const pledged = parseFloat(document.getElementById("manual-pledging-input").value);

        stock.fundamentals = stock.fundamentals || {};
        if (!Number.isNaN(price)) stock.fundamentals.currentPrice = price;
        if (!Number.isNaN(marketCap)) stock.fundamentals.marketCap = marketCap;

        stock.priceContext = stock.priceContext || {};
        stock.priceContext.source = "manual";
        stock.priceContext.lastUpdated = today;
        if (!Number.isNaN(week52Low)) stock.priceContext.week52Low = week52Low;
        if (!Number.isNaN(week52High)) stock.priceContext.week52High = week52High;

        if (!Number.isNaN(promoter)) {
          stock.shareholding = stock.shareholding || { history: [] };
          stock.shareholding.source = "manual";
          stock.shareholding.lastUpdated = today;
          stock.shareholding.history = stock.shareholding.history || [];
          stock.shareholding.history.push({
            quarter: today,
            promoter,
            fii: null,
            dii: null,
            public: null,
            pledged: Number.isNaN(pledged) ? 0 : pledged,
          });
        }

        await StockStore.set(ticker, stock);
        navigate(`#stock/${ticker}`);
      });
    }
  },
};

registerScreen("stock", stockDetailScreen);
