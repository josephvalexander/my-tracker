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

      charts.revenuePat = new Chart(document.getElementById("chart-revenue-pat"), {
        type: "bar",
        data: {
          labels,
          datasets: [
            { label: "Revenue", data: sales, backgroundColor: "#85B7EB" },
            { label: "Net profit", data: netProfit, backgroundColor: "#1D9E75" },
          ],
        },
        options: { responsive: true, plugins: { legend: { position: "bottom" } } },
      });

      if (!usingQuarterly) {
        const eps = epsHistory(annual);
        charts.eps = new Chart(document.getElementById("chart-eps"), {
          type: "line",
          data: { labels, datasets: [{ label: "EPS", data: eps, borderColor: "#D85A30", tension: 0.2 }] },
          options: { responsive: true, plugins: { legend: { display: false } } },
        });

        const roe = roeHistory(annual);
        const equity = equityHistory(annual);
        const de = annual.borrowings.map((b, i) => (equity[i] ? b / equity[i] : null));
        charts.roeDe = new Chart(document.getElementById("chart-roe-de"), {
          type: "line",
          data: {
            labels,
            datasets: [
              { label: "ROE %", data: roe, borderColor: "#534AB7", yAxisID: "y", tension: 0.2 },
              { label: "D/E", data: de, borderColor: "#888780", borderDash: [4, 4], yAxisID: "y1", tension: 0.2 },
            ],
          },
          options: {
            responsive: true,
            plugins: { legend: { position: "bottom" } },
            scales: {
              y: { type: "linear", position: "left" },
              y1: { type: "linear", position: "right", grid: { drawOnChartArea: false } },
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
            plugins: { legend: { position: "bottom" } },
            scales: { x: { stacked: true }, y: { stacked: true, max: 100 } },
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
