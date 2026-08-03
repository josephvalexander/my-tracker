/**
 * screens/stockCharts.js
 *
 * Revenue/PAT, EPS, ROE-vs-D/E, and shareholding pattern charts.
 * Annual/quarterly toggle controls ALL charts including shareholding —
 * shareholding data is always quarterly from indianapi regardless, so
 * on "Annual" view it shows the full quarterly shareholding history,
 * and on "Quarterly" view it also shows quarterly shareholding history.
 * EPS and ROE/DE charts are hidden on quarterly mode (no per-quarter data).
 */

const stockChartsScreen = {
  async render(params) {
    const ticker = params[0];
    const stock = await StockStore.get(ticker);
    if (!stock) {
      return `<div class="screen-padding"><div class="empty-state">Stock not found.</div></div>`;
    }
    const hasAnnual = (stock.fundamentals?.annual?.years?.length ?? 0) > 0;

    return `
      <div class="screen-padding">
        <div class="detail-header">
          <button class="back-btn" onclick="window.location.hash='#stock/${ticker}'">&larr;</button>
          <div class="detail-title"><div class="detail-name">Trends — ${stock.name || ticker}</div></div>
        </div>

        ${!hasAnnual ? '<div class="empty-state">No fundamentals yet. Add the stock first to see charts.</div>' : `
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
          <div class="chart-section-label">ROE vs debt to equity</div>
          <div class="card chart-card"><canvas id="chart-roe-de"></canvas></div>
        </div>

        <div class="chart-section-label">Shareholding pattern <span class="muted">% of total shares</span></div>
        <div class="card chart-card"><canvas id="chart-shareholding"></canvas></div>
        `}
      </div>`;
  },

  async afterRender(params) {
    const ticker = params[0];
    const stock = await StockStore.get(ticker);
    if (!stock || !(stock.fundamentals?.annual?.years?.length > 0)) return;

    let mode = "annual";
    const charts = {};

    function destroyAll() {
      Object.values(charts).forEach((c) => { try { c?.destroy(); } catch {} });
      Object.keys(charts).forEach((k) => delete charts[k]);
    }

    function buildCharts() {
      destroyAll();
      const annual = stock.fundamentals.annual;
      const quarterly = stock.fundamentals.quarterly || {};

      // Revenue/PAT: use quarterly periods if in quarterly mode and available
      const usingQuarterly = mode === "quarterly" && (quarterly.periods?.length ?? 0) > 0;
      const revLabels  = usingQuarterly ? quarterly.periods : annual.years;
      const revData    = usingQuarterly ? quarterly.revenue  : annual.revenue;
      const profitData = usingQuarterly ? quarterly.netProfit : annual.netProfit;

      const baseFont  = { family: "-apple-system, 'Segoe UI', Roboto, sans-serif", size: 11 };
      const gridStyle = { color: "rgba(0,0,0,0.06)" };
      const tickStyle = { font: baseFont, color: "#888780" };

      charts.revenuePat = new Chart(document.getElementById("chart-revenue-pat"), {
        type: "bar",
        data: {
          labels: revLabels,
          datasets: [
            { label: "Revenue",    data: revData,    backgroundColor: "#85B7EB", borderRadius: 4, borderSkipped: false },
            { label: "Net profit", data: profitData, backgroundColor: "#1D9E75", borderRadius: 4, borderSkipped: false },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "bottom", labels: { font: baseFont, boxWidth: 12, boxHeight: 12, usePointStyle: true, pointStyle: "circle" } },
            tooltip: {
              backgroundColor: "#2c2c2a", titleFont: baseFont, bodyFont: baseFont, padding: 10, cornerRadius: 6,
              callbacks: { label: (ctx) => `${ctx.dataset.label}: ₹${ctx.parsed.y?.toLocaleString("en-IN")} Cr` },
            },
          },
          scales: {
            x: { grid: { display: false }, ticks: tickStyle },
            y: { grid: gridStyle, ticks: { ...tickStyle, callback: (v) => "₹" + v.toLocaleString("en-IN") } },
          },
        },
      });

      // EPS and ROE/DE only meaningful on annual data
      const epsSection   = document.getElementById("eps-section");
      const roedeSection = document.getElementById("roede-section");

      if (usingQuarterly) {
        if (epsSection)   epsSection.style.display   = "none";
        if (roedeSection) roedeSection.style.display = "none";
      } else {
        if (epsSection)   epsSection.style.display   = "";
        if (roedeSection) roedeSection.style.display = "";

        const eps = epsHistory(annual);
        charts.eps = new Chart(document.getElementById("chart-eps"), {
          type: "line",
          data: {
            labels: annual.years,
            datasets: [{
              label: "EPS", data: eps,
              borderColor: "#D85A30", backgroundColor: "rgba(216,90,48,0.08)",
              tension: 0.3, fill: true, pointRadius: 3,
              pointBackgroundColor: "#D85A30", pointBorderColor: "#fff", pointBorderWidth: 1.5, borderWidth: 2,
            }],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: { backgroundColor: "#2c2c2a", titleFont: baseFont, bodyFont: baseFont, padding: 10, cornerRadius: 6, callbacks: { label: (ctx) => `EPS: ₹${ctx.parsed.y?.toFixed(2)}` } },
            },
            scales: {
              x: { grid: { display: false }, ticks: tickStyle },
              y: { grid: gridStyle, ticks: { ...tickStyle, callback: (v) => "₹" + v } },
            },
          },
        });

        const roe    = roeHistory(annual);
        const equity = equityHistory(annual);
        const de     = (annual.borrowings || []).map((b, i) => (equity[i] ? b / equity[i] : null));
        charts.roeDe = new Chart(document.getElementById("chart-roe-de"), {
          type: "line",
          data: {
            labels: annual.years,
            datasets: [
              {
                label: "ROE %", data: roe, borderColor: "#534AB7", backgroundColor: "rgba(83,74,183,0.08)",
                yAxisID: "y", tension: 0.3, fill: true, pointRadius: 3,
                pointBackgroundColor: "#534AB7", pointBorderColor: "#fff", pointBorderWidth: 1.5, borderWidth: 2,
              },
              {
                label: "D/E", data: de, borderColor: "#BA7517", yAxisID: "y1",
                borderDash: [5, 4], tension: 0.3, pointRadius: 3,
                pointBackgroundColor: "#BA7517", pointBorderColor: "#fff", pointBorderWidth: 1.5, borderWidth: 2,
              },
            ],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { position: "bottom", labels: { font: baseFont, boxWidth: 12, boxHeight: 12, usePointStyle: true, pointStyle: "circle" } },
              tooltip: { backgroundColor: "#2c2c2a", titleFont: baseFont, bodyFont: baseFont, padding: 10, cornerRadius: 6 },
            },
            scales: {
              x: { grid: { display: false }, ticks: tickStyle },
              y:  { type: "linear", position: "left",  grid: gridStyle,              ticks: { ...tickStyle, callback: (v) => v + "%" } },
              y1: { type: "linear", position: "right", grid: { drawOnChartArea: false }, ticks: tickStyle },
            },
          },
        });
      }

      // Shareholding — always quarterly regardless of toggle
      // (indianapi returns quarterly data; there's no annual aggregate)
      const shHistory = stock.shareholding?.history || [];
      const shCanvas  = document.getElementById("chart-shareholding");
      if (shHistory.length > 0) {
        charts.shareholding = new Chart(shCanvas, {
          type: "bar",
          data: {
            labels: shHistory.map((h) => h.quarter),
            datasets: [
              { label: "Promoter", data: shHistory.map((h) => h.promoter), backgroundColor: "#534AB7", stack: "s" },
              { label: "FII",      data: shHistory.map((h) => h.fii),      backgroundColor: "#378ADD", stack: "s" },
              { label: "DII/MF",  data: shHistory.map((h) => h.dii),      backgroundColor: "#1D9E75", stack: "s" },
              { label: "Public",  data: shHistory.map((h) => h.public),   backgroundColor: "#B4B2A9", stack: "s" },
            ],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { position: "bottom", labels: { font: baseFont, boxWidth: 12, boxHeight: 12, usePointStyle: true, pointStyle: "circle" } },
              tooltip: { backgroundColor: "#2c2c2a", titleFont: baseFont, bodyFont: baseFont, padding: 10, cornerRadius: 6, callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(1)}%` } },
            },
            scales: {
              x: { stacked: true, grid: { display: false }, ticks: tickStyle },
              y: { stacked: true, max: 100, grid: gridStyle, ticks: { ...tickStyle, callback: (v) => v + "%" } },
            },
          },
        });
      } else {
        shCanvas.closest(".card").innerHTML = '<span class="muted">No shareholding data yet — will appear after indianapi fetch.</span>';
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
