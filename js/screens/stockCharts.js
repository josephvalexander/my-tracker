/**
 * screens/stockCharts.js
 *
 * Revenue/PAT, EPS, ROE-vs-D/E, and shareholding pattern charts for one
 * stock, with an annual/quarterly toggle. Uses Chart.js (loaded via CDN
 * in index.html). Charts render after the HTML is in the DOM, since a
 * <canvas> needs to exist before Chart.js can attach to it.
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

        ${!hasAnnual ? '<div class="empty-state">No fundamentals uploaded yet. Upload a Screener export from the watchlist to see charts.</div>' : `
        <div class="toggle-row">
          <button id="toggle-annual" class="toggle-btn toggle-btn-active">Annual</button>
          <button id="toggle-quarterly" class="toggle-btn">Quarterly</button>
        </div>

        <div class="chart-section-label">Revenue & net profit <span class="muted">₹ Cr</span></div>
        <div class="card chart-card"><canvas id="chart-revenue-pat"></canvas></div>

        <div class="chart-section-label">EPS <span class="muted">₹ per share</span></div>
        <div class="card chart-card"><canvas id="chart-eps"></canvas></div>

        <div class="chart-section-label">ROE vs debt to equity</div>
        <div class="card chart-card"><canvas id="chart-roe-de"></canvas></div>

        <div class="chart-section-label">Shareholding pattern <span class="muted">% of total shares, from NSE</span></div>
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
      Object.values(charts).forEach((c) => c?.destroy());
    }

    function buildCharts() {
      destroyAll();
      const annual = stock.fundamentals.annual;
      const quarterly = stock.fundamentals.quarterly || {};
      const usingQuarterly = mode === "quarterly" && quarterly.quarters?.length;
      const labels = usingQuarterly ? quarterly.quarters : annual.years;
      const sales = usingQuarterly ? quarterly.sales : annual.sales;
      const netProfit = usingQuarterly ? quarterly.netProfit : annual.netProfit;

      const baseFont = { family: "-apple-system, 'Segoe UI', Roboto, sans-serif", size: 11 };
      const gridStyle = { color: "rgba(0,0,0,0.06)" };
      const tickStyle = { font: baseFont, color: "#888780" };

      charts.revenuePat = new Chart(document.getElementById("chart-revenue-pat"), {
        type: "bar",
        data: {
          labels,
          datasets: [
            { label: "Revenue", data: sales, backgroundColor: "#85B7EB", borderRadius: 4, borderSkipped: false },
            { label: "Net profit", data: netProfit, backgroundColor: "#1D9E75", borderRadius: 4, borderSkipped: false },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "bottom", labels: { font: baseFont, boxWidth: 12, boxHeight: 12, usePointStyle: true, pointStyle: "circle" } },
            tooltip: {
              backgroundColor: "#2c2c2a",
              titleFont: baseFont,
              bodyFont: baseFont,
              padding: 10,
              cornerRadius: 6,
              callbacks: { label: (ctx) => `${ctx.dataset.label}: ₹${ctx.parsed.y?.toLocaleString("en-IN")} Cr` },
            },
          },
          scales: {
            x: { grid: { display: false }, ticks: tickStyle },
            y: { grid: gridStyle, ticks: { ...tickStyle, callback: (v) => "₹" + v.toLocaleString("en-IN") } },
          },
        },
      });

      if (!usingQuarterly) {
        const eps = epsHistory(annual);
        charts.eps = new Chart(document.getElementById("chart-eps"), {
          type: "line",
          data: {
            labels,
            datasets: [
              {
                label: "EPS",
                data: eps,
                borderColor: "#D85A30",
                backgroundColor: "rgba(216,90,48,0.08)",
                tension: 0.3,
                fill: true,
                pointRadius: 3,
                pointBackgroundColor: "#D85A30",
                pointBorderColor: "#fff",
                pointBorderWidth: 1.5,
                borderWidth: 2,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
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

        const roe = roeHistory(annual);
        const equity = equityHistory(annual);
        const de = annual.borrowings.map((b, i) => (equity[i] ? b / equity[i] : null));
        charts.roeDe = new Chart(document.getElementById("chart-roe-de"), {
          type: "line",
          data: {
            labels,
            datasets: [
              {
                label: "ROE %",
                data: roe,
                borderColor: "#534AB7",
                backgroundColor: "rgba(83,74,183,0.08)",
                yAxisID: "y",
                tension: 0.3,
                fill: true,
                pointRadius: 3,
                pointBackgroundColor: "#534AB7",
                pointBorderColor: "#fff",
                pointBorderWidth: 1.5,
                borderWidth: 2,
              },
              {
                label: "D/E",
                data: de,
                borderColor: "#BA7517",
                yAxisID: "y1",
                borderDash: [5, 4],
                tension: 0.3,
                pointRadius: 3,
                pointBackgroundColor: "#BA7517",
                pointBorderColor: "#fff",
                pointBorderWidth: 1.5,
                borderWidth: 2,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: "bottom", labels: { font: baseFont, boxWidth: 12, boxHeight: 12, usePointStyle: true, pointStyle: "circle" } },
              tooltip: { backgroundColor: "#2c2c2a", titleFont: baseFont, bodyFont: baseFont, padding: 10, cornerRadius: 6 },
            },
            scales: {
              x: { grid: { display: false }, ticks: tickStyle },
              y: { type: "linear", position: "left", grid: gridStyle, ticks: { ...tickStyle, callback: (v) => v + "%" } },
              y1: { type: "linear", position: "right", grid: { drawOnChartArea: false }, ticks: tickStyle },
            },
          },
        });
      } else {
        document.getElementById("chart-eps").closest(".card").style.display = "none";
        document.getElementById("chart-roe-de").closest(".card").style.display = "none";
      }

      const shHistory = stock.shareholding?.history || [];
      if (shHistory.length > 0) {
        charts.shareholding = new Chart(document.getElementById("chart-shareholding"), {
          type: "bar",
          data: {
            labels: shHistory.map((h) => h.quarter),
            datasets: [
              { label: "Promoter", data: shHistory.map((h) => h.promoter), backgroundColor: "#534AB7", stack: "s" },
              { label: "FII", data: shHistory.map((h) => h.fii), backgroundColor: "#378ADD", stack: "s" },
              { label: "DII", data: shHistory.map((h) => h.dii), backgroundColor: "#1D9E75", stack: "s" },
              { label: "Public", data: shHistory.map((h) => h.public), backgroundColor: "#B4B2A9", stack: "s" },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
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
        document.getElementById("chart-shareholding").closest(".card").innerHTML =
          '<span class="muted">No shareholding data yet. Fetch from NSE on the watchlist.</span>';
      }
    }

    buildCharts();

    document.getElementById("toggle-annual").addEventListener("click", (e) => {
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
