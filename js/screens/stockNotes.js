/**
 * screens/stockNotes.js
 *
 * Dated thesis/notes log per stock. Includes:
 * - 10-year thesis question
 * - Quarterly review template for structured check-ins
 * - Free-form notes with delete option
 * Each note is stamped with date and CMP at time of writing.
 */

const NOTE_TEMPLATES = {
  "quarterly": [
    "Revenue growth YoY: ",
    "PAT margin trend: ",
    "Management commentary: ",
    "Shareholding changes: ",
    "My assessment: ",
    "Action (hold/add/reduce/watch): ",
  ].join("\n"),
  "thesis": [
    "Business in one line: ",
    "Moat: ",
    "Risk I'm watching: ",
    "Why I'd hold for 10 years: ",
  ].join("\n"),
  "note": "",
};

const NOTE_TAGS = ["quarterly", "thesis", "note", "risk", "add", "reduce"];

const stockNotesScreen = {
  async render(params) {
    const ticker = params[0];
    const stock  = await StockStore.get(ticker);
    if (!stock) return `<div class="screen-padding"><div class="empty-state">Stock not found.</div></div>`;

    const notes = [...(stock.notes || [])].sort((a, b) => new Date(b.date) - new Date(a.date));

    return `
      <div class="screen-padding">
        <div class="detail-header">
          <button class="back-btn" onclick="window.location.hash='#stock/${ticker}'">&larr;</button>
          <div class="detail-title"><div class="detail-name">Notes — ${stock.name || ticker}</div></div>
        </div>

        <div class="card thesis-card">
          <div class="section-label" style="margin-top:0;">Would I own this for 10 years if the market shut down tomorrow?</div>
          <div id="thesis-text-display">${stock.thesis?.text || '<span class="muted">Not written yet. Use the Thesis template below.</span>'}</div>
          <div class="muted" style="margin-top:8px; font-size:11px;">${stock.thesis?.lastUpdated ? `Last updated ${stock.thesis.lastUpdated}` : ""}</div>
        </div>

        <div class="screen-header" style="margin-top:16px;">
          <div class="section-label" style="margin:0;">Note history</div>
          <button id="new-note-btn" class="btn btn-small">+ New entry</button>
        </div>

        <div id="new-note-form" style="display:none; margin-bottom:12px;">
          <div class="card">
            <div style="display:flex; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
              <label style="font-size:11px; color:var(--color-text-secondary);">Template:</label>
              ${Object.keys(NOTE_TEMPLATES).map(t =>
                `<button class="template-btn btn btn-small" data-template="${t}">${t}</button>`
              ).join("")}
            </div>
            <div style="display:flex; gap:8px; margin-bottom:8px; flex-wrap:wrap; align-items:center;">
              <label style="font-size:11px; color:var(--color-text-secondary);">Tag:</label>
              <select id="note-tag-select" style="font-size:12px; padding:3px 6px; border:0.5px solid var(--color-border); border-radius:6px; background:var(--color-bg); color:var(--color-text);">
                ${NOTE_TAGS.map(t => `<option value="${t}">${t}</option>`).join("")}
              </select>
            </div>
            <textarea id="new-note-textarea" placeholder="Add a note... or pick a template above" class="note-textarea"></textarea>
            <div style="display:flex; gap:8px; margin-top:8px;">
              <button id="save-note-btn" class="btn btn-primary">Save</button>
              <button id="cancel-note-btn" class="btn">Cancel</button>
            </div>
          </div>
        </div>

        <div id="notes-list">
          ${notes.length === 0
            ? '<div class="empty-state">No notes yet. Add a quarterly review entry after each results season.</div>'
            : notes.map((n, i) => `
              <div class="card note-card" data-note-idx="${i}">
                <div class="note-card-top">
                  <span class="muted">${n.date} · ₹${n.cmpAtTime?.toLocaleString("en-IN") ?? "—"}</span>
                  <span class="note-tag">${n.tag || "note"}</span>
                  <button class="delete-note-btn icon-btn icon-btn-danger" data-note-idx="${i}" title="Delete note">✕</button>
                </div>
                <div style="white-space:pre-wrap; font-size:13px;">${n.text}</div>
              </div>`).join("")}
        </div>
      </div>`;
  },

  async afterRender(params) {
    const ticker = params[0];

    document.getElementById("new-note-btn").addEventListener("click", () => {
      document.getElementById("new-note-form").style.display = "block";
      document.getElementById("new-note-textarea").focus();
    });

    document.getElementById("cancel-note-btn").addEventListener("click", () => {
      document.getElementById("new-note-form").style.display = "none";
      document.getElementById("new-note-textarea").value = "";
    });

    // Template buttons
    document.querySelectorAll(".template-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const tmpl = NOTE_TEMPLATES[btn.dataset.template] || "";
        document.getElementById("new-note-textarea").value = tmpl;
        document.getElementById("note-tag-select").value = btn.dataset.template;
        document.getElementById("new-note-textarea").focus();
      });
    });

    document.getElementById("save-note-btn").addEventListener("click", async () => {
      const text = document.getElementById("new-note-textarea").value.trim();
      if (!text) return;
      const tag  = document.getElementById("note-tag-select").value;
      const stock = await StockStore.get(ticker);
      stock.notes = stock.notes || [];

      // If tag is "thesis", also update the thesis card
      if (tag === "thesis") {
        stock.thesis = { text, lastUpdated: new Date().toISOString().slice(0, 10) };
      }

      stock.notes.push({
        date: new Date().toISOString().slice(0, 10),
        cmpAtTime: stock.fundamentals?.currentPrice ?? null,
        tag,
        text,
      });
      await StockStore.set(ticker, stock);
      navigate(`#stockNotes/${ticker}`);
    });

    // Delete note
    document.querySelectorAll(".delete-note-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("Delete this note?")) return;
        const stock = await StockStore.get(ticker);
        // Notes are displayed sorted newest-first; idx in display != array index
        const sorted = [...(stock.notes || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
        const noteToDelete = sorted[parseInt(btn.dataset.noteIdx)];
        stock.notes = stock.notes.filter(n => n !== noteToDelete);
        await StockStore.set(ticker, stock);
        navigate(`#stockNotes/${ticker}`);
      });
    });
  },
};

registerScreen("stockNotes", stockNotesScreen);
