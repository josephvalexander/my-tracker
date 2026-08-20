/**
 * screens/calendar.js
 *
 * Forward-looking calendar of upcoming corporate actions
 * for all watchlisted stocks: dividends, splits, bonus issues.
 * Shows past 30 days and next 90 days.
 */

const calendarScreen = {
  async render() {
    return `
      <div class="screen-padding">
        <div class="detail-header">
          <button class="back-btn" onclick="history.back()">&larr;</button>
          <div class="detail-title"><div class="detail-name">Corporate calendar</div></div>
        </div>
        <div id="calendar-content"><div class="empty-state muted">Loading…</div></div>
      </div>`;
  },

  async afterRender() {
    const stocks = await StockStore.getActive();
    const today  = new Date(); today.setHours(0,0,0,0);
    const past30 = new Date(today); past30.setDate(past30.getDate() - 30);
    const future90 = new Date(today); future90.setDate(future90.getDate() + 90);

    const events = [];
    for (const s of stocks) {
      const ca = s.corporateActions;
      if (!ca) continue;

      const add = (type, date, desc) => {
        if (!date) return;
        const d = new Date(date);
        if (d < past30 || d > future90) return;
        events.push({ date: d, dateStr: date, ticker: s.ticker, name: s.name || s.ticker, type, desc });
      };

      (ca.dividends || []).forEach(d => add("Dividend", d.recordDate || d.announced, `₹${d.amount}/share${d.type ? " · " + d.type : ""}`));
      (ca.splits   || []).forEach(d => add("Split",    d.recordDate, d.remarks || `${d.oldFaceValue}:${d.newFaceValue}`));
      (ca.bonus    || []).forEach(d => add("Bonus",    d.recordDate, d.remarks || "Bonus issue"));
    }

    events.sort((a, b) => a.date - b.date);

    if (events.length === 0) {
      document.getElementById("calendar-content").innerHTML =
        `<div class="empty-state">No upcoming corporate actions in the next 90 days.<br><span class="muted">Refresh fundamentals on each stock to get latest data.</span></div>`;
      return;
    }

    const TYPE_COLOR = { Dividend: "var(--color-green)", Split: "var(--color-purple, #534AB7)", Bonus: "#BA7517" };

    const upcoming = events.filter(e => e.date >= today);
    const recent   = events.filter(e => e.date < today).reverse();

    function renderGroup(title, evts) {
      if (!evts.length) return "";
      return `
        <div class="section-label">${title}</div>
        <div class="card" style="padding:0;">
          ${evts.map(e => {
            const isPast  = e.date < today;
            const isToday = e.date.toDateString() === today.toDateString();
            const daysAway = Math.round((e.date - today) / 86400000);
            const dayLabel = isToday ? "Today" : isPast ? `${Math.abs(daysAway)}d ago` : `in ${daysAway}d`;
            return `
              <div style="display:flex; align-items:center; gap:10px; padding:10px 12px; border-bottom:0.5px solid var(--color-border); cursor:pointer;"
                   onclick="window.location.hash='#stock/${encodeURIComponent(e.ticker)}'">
                <div style="text-align:center; min-width:36px;">
                  <div style="font-size:11px; font-weight:600;">${e.date.getDate()}</div>
                  <div style="font-size:9px; color:var(--color-text-tertiary);">${e.date.toLocaleString("en-IN",{month:"short"})}</div>
                </div>
                <div style="flex:1; min-width:0;">
                  <div style="font-size:13px; font-weight:500;">${e.name}</div>
                  <div style="font-size:11px; color:var(--color-text-secondary);">${e.desc}</div>
                </div>
                <div style="text-align:right; flex-shrink:0;">
                  <span style="font-size:10px; padding:2px 7px; border-radius:10px; background:${TYPE_COLOR[e.type]}22; color:${TYPE_COLOR[e.type]}; border:0.5px solid ${TYPE_COLOR[e.type]}44;">${e.type}</span>
                  <div style="font-size:10px; color:var(--color-text-tertiary); margin-top:3px;">${dayLabel}</div>
                </div>
              </div>`;
          }).join("")}
        </div>`;
    }

    document.getElementById("calendar-content").innerHTML =
      renderGroup("Upcoming (next 90 days)", upcoming) +
      renderGroup("Recent (past 30 days)", recent);
  },
};

registerScreen("calendar", calendarScreen);
