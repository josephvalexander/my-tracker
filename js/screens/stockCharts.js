/**
 * screens/stockCharts.js
 *
 * Revenue/PAT, EPS, ROE-vs-D/E, and shareholding charts.
 * Toggle controls Revenue/PAT (annual vs quarterly).
 * EPS and ROE/DE are annual-only (hidden in quarterly mode).
 * Shareholding uses grouped bars — each quarter has 4 side-by-side bars.
 *
 * Color palette matches the app's warm neutral design:
 * - Revenue:  #85B7EB  (light blue — secondary/neutral)
 * - Profit:   #1D9E75  (green — positive)
 * - EPS:      #534AB7  (purple — primary)
 * - ROE:      #534AB7  (purple)
 * - D/E:      #BA7517  (amber — caution/debt)
 * - Promoter: #534AB7  (purple)
 * - FII:      #378ADD  (blue)
 * - DII/MF:   #5DCAA5  (teal)
 * - Public:   #C8C5BB  (warm grey)
 */

const stockChartsScreen = {
  async render(params) {
    const ticker = params[0];
    const stock  = await StockStore.get(ticker);
    if (!stock) {
      return `<div class="screen-padding"><div class="empty-state">Stock not found.</div></div>`;
    }
    const hasAnnual = (stock.fundamentals?.annual?.years?.length ?? 0) > 0;

    return `
      <div class="screen-padding">
        <div class="detail-header">
          <button class="back-btn" onclick="window.location.hash='#stock/${decodeURIComponent(ticker)}'">&larr;</button>
          <div class="detail-title"><div class="detail-name">Trends — ${stock.name || ticker}</div></div>
        </div>

        ${!hasAnnual ? '<div class="empty-state">No fundamentals yet.</div>' : `
        <div class="toggle-row">
          <button id="toggle-annual" class="toggle-btn toggle-btn-active">Annual</button>
          <button id="toggle-quarterly" class="toggle-btn">Quarterly</button>
        </div>

        <div class="chart-section-label">Revenue & net profit <span class="muted">₹ Cr</span></div>
        <div class="card chart-card"><canvas id="chart-revenue-pat"></canvas></div>

        <div id="eps-section">
          <div class="chart-section-label">EPS <span class="muted">₹ per share</span></div>
          <div class="card chart-card"><canvas id="chart-eps"></canvas></div>
        </div>

        <div id="roede-section">
          <div class="chart-section-label">ROE vs debt/equity</div>
          <div class="card chart-card"><canvas id="chart-roe-de"></canvas></div>
        </div>

        <div class="chart-section-label">Shareholding pattern <span class="muted">quarterly, grouped by category</span></div>
        <div class="card chart-card">
          <div id="sh-latest-summary"></div>
          <canvas id="chart-shareholding"></canvas>
        </div>
        `}
      </div>`;
  },

  async afterRender(params) {
    const ticker = params[0];
    const stock  = await StockStore.get(ticker);
    if (!stock || !(stock.fundamentals?.annual?.years?.length > 0)) return;

    // ── Shared chart style ──────────────────────────────────────────
    const baseFont  = { family: "-apple-system,'Segoe UI',Roboto,sans-serif", size: 11 };
    const gridStyle = { color: "rgba(0,0,0,0.06)" };
    const tickStyle = { font: baseFont, color: "#888780" };

    // App palette — harmonised with CSS variables
    const C = {
      revenue:  "#85B7EB",
      profit:   "#1D9E75",
      eps:      "#534AB7",
      roe:      "#534AB7",
      de:       "#BA7517",
      promoter: "#534AB7",
      fii:      "#378ADD",
      dii:      "#5DCAA5",
      public:   "#C8C5BB",
    };

    const tooltipDefaults = {
      backgroundColor: "#2c2c2a",
      titleFont: baseFont,
      bodyFont: baseFont,
      padding: 10,
      cornerRadius: 6,
    };

    let mode   = "annual";
    const charts = {};

    function destroyAll() {
      Object.values(charts).forEach((c) => { try { c?.destroy(); } catch {} });
      Object.keys(charts).forEach((k) => delete charts[k]);
    }

    function buildCharts() {
      destroyAll();

      // Reset visibility
      const epsSection   = document.getElementById("eps-section");
      const roedeSection = document.getElementById("roede-section");
      if (epsSection)   epsSection.style.display   = "";
      if (roedeSection) roedeSection.style.display = "";

      const annual    = stock.fundamentals.annual;
      const quarterly = stock.fundamentals.quarterly || {};
      const usingQ    = mode === "quarterly" && (quarterly.periods?.length ?? 0) > 0;

      // ── Revenue / PAT ─────────────────────────────────────────────
      const revLabels  = usingQ ? quarterly.periods  : annual.years;
      const revData    = usingQ ? quarterly.revenue   : annual.revenue;
      const profitData = usingQ ? quarterly.netProfit : annual.netProfit;

      charts.revenuePat = new Chart(document.getElementById("chart-revenue-pat"), {
        type: "bar",
        data: {
          labels: revLabels,
          datasets: [
            { label: "Revenue",    data: revData,    backgroundColor: C.revenue, borderRadius: 3, borderSkipped: false },
            { label: "Net profit", data: profitData, backgroundColor: C.profit,  borderRadius: 3, borderSkipped: false },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { position: "bottom", labels: { font: baseFont, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: "circle" } },
            tooltip: { ...tooltipDefaults, callbacks: { label: (ctx) => `${ctx.dataset.label}: ₹${ctx.parsed.y?.toLocaleString("en-IN")} Cr` } },
          },
          scales: {
            x: { grid: { display: false }, ticks: tickStyle },
            y: { grid: gridStyle, ticks: { ...tickStyle, callback: (v) => "₹" + v.toLocaleString("en-IN") } },
          },
        },
      });

      // ── Annual-only charts ────────────────────────────────────────
      if (usingQ) {
        if (epsSection)   epsSection.style.display   = "none";
        if (roedeSection) roedeSection.style.display = "none";
      } else {
        // EPS
        const eps = epsHistory(annual);
        charts.eps = new Chart(document.getElementById("chart-eps"), {
          type: "line",
          data: {
            labels: annual.years,
            datasets: [{
              label: "EPS", data: eps,
              borderColor: C.eps, backgroundColor: C.eps + "18",
              tension: 0.35, fill: true, pointRadius: 3,
              pointBackgroundColor: C.eps, pointBorderColor: "#fff", pointBorderWidth: 1.5, borderWidth: 2,
            }],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: { ...tooltipDefaults, callbacks: { label: (ctx) => `EPS: ₹${ctx.parsed.y?.toFixed(2)}` } },
            },
            scales: {
              x: { grid: { display: false }, ticks: tickStyle },
              y: { grid: gridStyle, ticks: { ...tickStyle, callback: (v) => "₹" + v } },
            },
          },
        });

        // ROE vs D/E
        const roe    = roeHistory(annual);
        const equity = equityHistory(annual);
        const de     = (annual.borrowings || []).map((b, i) => equity[i] ? b / equity[i] : null);

        charts.roeDe = new Chart(document.getElementById("chart-roe-de"), {
          type: "line",
          data: {
            labels: annual.years,
            datasets: [
              {
                label: "ROE %", data: roe,
                borderColor: C.roe, backgroundColor: C.roe + "18",
                yAxisID: "y", tension: 0.35, fill: true, pointRadius: 3,
                pointBackgroundColor: C.roe, pointBorderColor: "#fff", pointBorderWidth: 1.5, borderWidth: 2,
              },
              {
                label: "D/E", data: de,
                borderColor: C.de, backgroundColor: "transparent",
                yAxisID: "y1", borderDash: [5, 4], tension: 0.35, pointRadius: 3,
                pointBackgroundColor: C.de, pointBorderColor: "#fff", pointBorderWidth: 1.5, borderWidth: 2,
              },
            ],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { position: "bottom", labels: { font: baseFont, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: "circle" } },
              tooltip: { ...tooltipDefaults },
            },
            scales: {
              x: { grid: { display: false }, ticks: tickStyle },
              y:  { type: "linear", position: "left",  grid: gridStyle, ticks: { ...tickStyle, callback: (v) => v + "%" } },
              y1: { type: "linear", position: "right", grid: { drawOnChartArea: false }, ticks: tickStyle },
            },
          },
        });
      }

      // ── Shareholding — grouped bar chart ─────────────────────────
      // Each quarter is a group of 4 bars (Promoter, FII, DII/MF, Public).
      // This makes it easy to see how each category changed over time,
      // and compare relative sizes within a quarter at a glance.
      const shHistory = stock.shareholding?.history || [];
      const shCanvas  = document.getElementById("chart-shareholding");
      const shSummary = document.getElementById("sh-latest-summary");

      if (shHistory.length > 0) {
        const latest = shHistory[shHistory.length - 1];
        if (shSummary) {
          shSummary.innerHTML = `
            <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:10px;">
              ${[
                { label: "Promoter", value: latest.promoter, color: C.promoter },
                { label: "FII",      value: latest.fii,      color: C.fii },
                { label: "DII/MF",  value: latest.dii,      color: C.dii },
                { label: "Public",  value: latest.public,   color: C.public },
              ].filter(d => d.value != null).map(d => `
                <div style="display:flex; align-items:center; gap:5px; font-size:12px;">
                  <span style="width:9px;height:9px;border-radius:50%;background:${d.color};flex-shrink:0;display:inline-block;"></span>
                  <span class="muted">${d.label}</span>
                  <strong>${d.value.toFixed(1)}%</strong>
                </div>`).join("")}
              <span class="muted" style="font-size:10px; align-self:center;">as of ${latest.quarter}</span>
            </div>`;
        }

        // Compute Y axis max dynamically so tall promoter bars never overflow
        const shAllValues = shHistory.flatMap(h => [h.promoter ?? 0, h.fii ?? 0, h.dii ?? 0, h.public ?? 0]);
        const shMax = Math.ceil((Math.max(...shAllValues, 10) * 1.15) / 10) * 10;

        charts.shareholding = new Chart(shCanvas, {
          type: "bar",
          data: {
            labels: shHistory.map((h) => h.quarter),
            datasets: [
              { label: "Promoter", data: shHistory.map((h) => h.promoter ?? 0), backgroundColor: C.promoter + "CC", borderColor: C.promoter, borderWidth: 1, borderRadius: 2 },
              { label: "FII",      data: shHistory.map((h) => h.fii      ?? 0), backgroundColor: C.fii      + "CC", borderColor: C.fii,      borderWidth: 1, borderRadius: 2 },
              { label: "DII/MF",  data: shHistory.map((h) => h.dii      ?? 0), backgroundColor: C.dii      + "CC", borderColor: C.dii,      borderWidth: 1, borderRadius: 2 },
              { label: "Public",  data: shHistory.map((h) => h.public   ?? 0), backgroundColor: C.public   + "CC", borderColor: C.public,   borderWidth: 1, borderRadius: 2 },
            ],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { position: "bottom", labels: { font: baseFont, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: "circle" } },
              tooltip: {
                ...tooltipDefaults,
                callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(1)}%` },
              },
            },
            scales: {
              x: { grid: { display: false }, ticks: { ...tickStyle, maxRotation: 45, minRotation: 45 } },
              y: { grid: gridStyle, ticks: { ...tickStyle, callback: (v) => v + "%" }, min: 0, max: shMax },
            },
          },
        });
      } else {
        if (shSummary) shSummary.innerHTML = "";
        shCanvas.closest(".card").innerHTML = `<span class="muted">No shareholding data yet.</span>`;
      }
    }

    buildCharts();

    document.getElementById("toggle-annual").addEventListener("click", () => {
      mode = "annual";
      document.getElementById("toggle-annual").classList.add("toggle-btn-active");
      document.getElementById("toggle-quarterly").classList.remove("toggle-btn-active");
      buildCharts();
    });
    document.getElementById("toggle-quarterly").addEventListener("click", () => {
      mode = "quarterly";
      document.getElementById("toggle-quarterly").classList.add("toggle-btn-active");
      document.getElementById("toggle-annual").classList.remove("toggle-btn-active");
      buildCharts();
    });
  },
};

registerScreen("stockCharts", stockChartsScreen);