/**
 * screens/calendar.js
 *
 * Forward-looking calendar of upcoming corporate actions
 * for all watchlisted stocks: dividends, splits, bonus issues.
 *
 * Data source priority:
 *   1. Live NSE corporate actions API (via Worker /nse-corporate-actions)
 *      — covers past 30 days + upcoming, filtered to watchlisted tickers
 *   2. Fallback: locally stored corporateActions per stock (from last fundamentals fetch)
 *
 * Shows past 30 days and next 90 days.
 */

const WORKER_CA_URL = "https://portfolio-tracker-nse-proxy.josephv-mec.workers.dev/nse-corporate-actions";

/** Parse NSE date string "16-Oct-2026" or "16-10-2026" → Date */
function parseNseDate(str) {
  if (!str || str === "-" || str.trim() === "") return null;
  const parts = str.trim().split("-");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  // Month may be abbreviated name ("Oct") or numeric ("10")
  const months = { Jan:1, Feb:2, Mar:3, Apr:4, May:5, Jun:6,
                   Jul:7, Aug:8, Sep:9, Oct:10, Nov:11, Dec:12 };
  const month = isNaN(m) ? months[m] : parseInt(m, 10);
  if (!month) return null;
  const date = new Date(parseInt(y, 10), month - 1, parseInt(d, 10));
  return isNaN(date.getTime()) ? null : date;
}

/** Classify NSE subject string into a type */
function classifySubject(subject) {
  const s = (subject || "").toLowerCase();
  if (s.includes("dividend") || s.includes("interim div") || s.includes("final div")) return "Dividend";
  if (s.includes("split") || s.includes("sub-division")) return "Split";
  if (s.includes("bonus")) return "Bonus";
  if (s.includes("rights")) return "Rights";
  return "Other";
}

const calendarScreen = {
  async render() {
    return `
      <div class="screen-padding">
        <div class="detail-header">
          <button class="back-btn" onclick="history.back()">&larr;</button>
          <div class="detail-title"><div class="detail-name">Corporate calendar</div></div>
        </div>
        <div id="cal-source" class="muted" style="font-size:11px; margin-bottom:4px;"></div>
        <div id="calendar-content"><div class="empty-state muted">Loading…</div></div>
      </div>`;
  },

  async afterRender() {
    const stocks   = await StockStore.getActive();
    const today    = new Date(); today.setHours(0,0,0,0);
    const past30   = new Date(today); past30.setDate(past30.getDate() - 60);
    const future90 = new Date(today); future90.setDate(future90.getDate() + 45);
    const sourceEl = document.getElementById("cal-source");

    const tickerSet  = new Set(stocks.map(s => s.ticker.toUpperCase()));
    const nameMap    = {};
    stocks.forEach(s => { nameMap[s.ticker.toUpperCase()] = s.name || s.ticker; });

    let events = [];
    let usedLive = false;

    // ── 1. Try live NSE feed via Worker ──────────────────────────────
    try {
      const symbols = [...tickerSet].join(",");
      const res = await fetch(`${WORKER_CA_URL}?symbols=${encodeURIComponent(symbols)}`);
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length > 0) {
          for (const r of rows) {
            // Use exDate as the primary date (what matters for trading); fall back to recDate
            const date = parseNseDate(r.exDate) || parseNseDate(r.recDate);
            if (!date || date < past30 || date > future90) continue;
            const type = classifySubject(r.subject);
            // Skip truly misc notices — keep Dividend, Split, Bonus, Rights, and AGM/EGM
            if (type === "Other" && !/agm|egm|meeting/i.test(r.subject || "")) continue;
            events.push({
              date,
              ticker: r.symbol,
              name: nameMap[r.symbol.toUpperCase()] || r.comp || r.symbol,
              type,
              desc: r.subject,
              exDate: r.exDate && r.exDate !== "-" ? r.exDate : null,
              recDate: r.recDate && r.recDate !== "-" ? r.recDate : null,
            });
          }
          usedLive = true;
          sourceEl.textContent = `Live from NSE · ${new Date().toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" })}`;
        }
      }
    } catch { /* fall through to local */ }

    // ── 2. Fallback: locally stored corporateActions ──────────────────
    if (!usedLive) {
      sourceEl.textContent = "Showing stored data — Worker offline or NSE unreachable";
      for (const s of stocks) {
        const ca = s.corporateActions;
        if (!ca) continue;
        const add = (type, dateStr, desc) => {
          if (!dateStr) return;
          const date = new Date(dateStr);
          if (date < past30 || date > future90) return;
          events.push({ date, ticker: s.ticker, name: s.name || s.ticker, type, desc });
        };
        (ca.dividends || []).forEach(d => add("Dividend", d.recordDate || d.announced, `₹${d.amount}/share${d.type ? " · " + d.type : ""}`));
        (ca.splits    || []).forEach(d => add("Split",    d.recordDate, d.remarks || `${d.oldFaceValue}:${d.newFaceValue}`));
        (ca.bonus     || []).forEach(d => add("Bonus",    d.recordDate, d.remarks || "Bonus issue"));
      }
    }

    events.sort((a, b) => a.date - b.date);

    if (events.length === 0) {
      document.getElementById("calendar-content").innerHTML =
        `<div class="empty-state">No corporate actions in the past 60 or next 45 days.<br><span class="muted">${usedLive ? "NSE returned no events for your watchlisted stocks." : "Refresh fundamentals on each stock to get latest data."}</span></div>`;
      return;
    }

    const TYPE_COLOR = { Dividend: "var(--color-green)", Split: "var(--color-purple, #534AB7)", Bonus: "#BA7517", Rights: "#3B82F6", Other: "var(--color-text-secondary)" };

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
                  ${e.exDate || e.recDate ? `<div style="font-size:10px; color:var(--color-text-tertiary); margin-top:2px;">${e.exDate ? "Ex " + e.exDate : ""}${e.exDate && e.recDate ? " · " : ""}${e.recDate ? "Rec " + e.recDate : ""}</div>` : ""}
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
      renderGroup("Upcoming (next 45 days)", upcoming) +
      renderGroup("Recent (past 30 days)", recent);
  },
};

registerScreen("calendar", calendarScreen);
