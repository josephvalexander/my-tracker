/**
 * screens/stockNotes.js
 *
 * Dated thesis/notes log per stock — the "why I'd own this for 10
 * years" answer plus a running history of check-ins, each stamped with
 * the price at the time so you can see whether your thesis held up.
 */

const stockNotesScreen = {
  async render(params) {
    const ticker = params[0];
    const stock = await StockStore.get(ticker);
    if (!stock) {
      return `<div class="screen-padding"><div class="empty-state">Stock not found.</div></div>`;
    }

    const notes = [...(stock.notes || [])].sort((a, b) => new Date(b.date) - new Date(a.date));

    return `
      <div class="screen-padding">
        <div class="detail-header">
          <button class="back-btn" onclick="window.location.hash='#stock/${ticker}'">&larr;</button>
          <div class="detail-title"><div class="detail-name">My thesis — ${stock.name || ticker}</div></div>
        </div>

        <div class="card thesis-card">
          <div class="section-label" style="margin-top:0;">Would I own this for 10 years if the market shut down tomorrow?</div>
          <div id="thesis-text-display">${stock.thesis?.text || '<span class="muted">Not written yet.</span>'}</div>
          <div class="muted" style="margin-top:8px; font-size:11px;">${stock.thesis?.lastUpdated ? `Last updated ${stock.thesis.lastUpdated}` : ""}</div>
        </div>

        <div class="screen-header" style="margin-top:16px;">
          <div class="section-label" style="margin:0;">Note history</div>
          <button id="new-note-btn" class="btn btn-small">+ New entry</button>
        </div>

        <div id="notes-list">
          ${
            notes.length === 0
              ? '<div class="empty-state">No notes yet.</div>'
              : notes
                  .map(
                    (n) => `
              <div class="card note-card">
                <div class="note-card-top">
                  <span class="muted">${n.date} · CMP ₹${n.cmpAtTime?.toLocaleString("en-IN") ?? "—"}</span>
                  <span class="note-tag">${n.tag || "note"}</span>
                </div>
                <div>${n.text}</div>
              </div>`
                  )
                  .join("")
          }
        </div>

        <div id="new-note-form" style="display:none; margin-top:12px;">
          <textarea id="new-note-textarea" placeholder="Add a new note..." class="note-textarea"></textarea>
          <button id="save-note-btn" class="btn btn-primary" style="margin-top:8px;">Save note</button>
        </div>
      </div>`;
  },

  async afterRender(params) {
    const ticker = params[0];

    document.getElementById("new-note-btn").addEventListener("click", () => {
      document.getElementById("new-note-form").style.display = "block";
      document.getElementById("new-note-textarea").focus();
    });

    document.getElementById("save-note-btn").addEventListener("click", async () => {
      const text = document.getElementById("new-note-textarea").value.trim();
      if (!text) return;
      const stock = await StockStore.get(ticker);
      stock.notes = stock.notes || [];
      stock.notes.push({
        date: new Date().toISOString().slice(0, 10),
        cmpAtTime: stock.fundamentals?.currentPrice ?? null,
        tag: "note",
        text,
      });
      await StockStore.set(ticker, stock);
      navigate(`#stockNotes/${ticker}`);
    });
  },
};

registerScreen("stockNotes", stockNotesScreen);
