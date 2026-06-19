/**
 * screens/archived.js
 *
 * Stocks you researched and passed on, or stopped tracking. Archive
 * (not delete) keeps notes/thesis history intact — this is the "why I
 * passed" log discussed in planning, so a 2028 you can see why 2026 you
 * said no to something without re-doing the whole analysis.
 */

const archivedScreen = {
  async render() {
    return `
      <div class="screen-padding">
        <div class="screen-title">Archived</div>
        <div id="archived-list" class="stock-list"></div>
      </div>`;
  },

  async afterRender() {
    const stocks = await StockStore.getArchived();
    const listEl = document.getElementById("archived-list");

    if (stocks.length === 0) {
      listEl.innerHTML = `<div class="empty-state">Nothing archived yet.</div>`;
      return;
    }

    listEl.innerHTML = stocks
      .map(
        (s) => `
      <div class="archived-row" data-ticker="${s.ticker}">
        <div class="stock-name">${s.name || s.ticker}</div>
        <div class="stock-meta">Archived ${s.archivedDate || "—"}${s.archiveReason ? " · " + s.archiveReason : ""}</div>
        <div class="archived-actions">
          <button class="btn btn-small" data-action="restore" data-ticker="${s.ticker}">Restore</button>
          <button class="btn btn-small btn-danger" data-action="delete" data-ticker="${s.ticker}">Delete permanently</button>
        </div>
      </div>`
      )
      .join("");

    listEl.querySelectorAll('[data-action="restore"]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        const stock = await StockStore.get(btn.dataset.ticker);
        stock.status = "active";
        stock.archivedDate = null;
        stock.archiveReason = null;
        await StockStore.set(stock.ticker, stock);
        navigate("#archived");
      });
    });

    listEl.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        const confirmed = confirm(`Permanently delete ${btn.dataset.ticker}? This removes all notes and history. This cannot be undone.`);
        if (confirmed) {
          await deleteStockPermanently(btn.dataset.ticker);
          navigate("#archived");
        }
      });
    });
  },
};

registerScreen("archived", archivedScreen);
