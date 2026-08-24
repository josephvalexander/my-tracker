/**
 * screens/goals.js
 *
 * Financial goals — timeline view and list view.
 * Goals are stored in MetaStore under "goals" key.
 * No link to holdings in this version.
 */

const GOAL_CATEGORIES = [
  { key: "education",   label: "Education",     icon: "🎓" },
  { key: "house",       label: "House",          icon: "🏠" },
  { key: "travel",      label: "Travel",         icon: "✈️" },
  { key: "vehicle",     label: "Vehicle",        icon: "🚗" },
  { key: "wedding",     label: "Wedding",        icon: "💍" },
  { key: "retirement",  label: "Retirement",     icon: "🌅" },
  { key: "emergency",   label: "Emergency fund", icon: "🛡️" },
  { key: "business",    label: "Business",       icon: "💼" },
  { key: "other",       label: "Other",          icon: "🎯" },
];

function getCat(key) {
  return GOAL_CATEGORIES.find(c => c.key === key) || GOAL_CATEGORIES[GOAL_CATEGORIES.length - 1];
}

const currentYear = new Date().getFullYear();

const goalsScreen = {
  async render() {
    return `
      <div class="screen-padding">
        <div class="screen-header">
          <div class="screen-title">Goals</div>
          <button id="add-goal-btn" class="btn btn-small">+ Add goal</button>
        </div>

        <!-- Toggle: Timeline / List -->
        <div class="toggle-row" style="margin-bottom:14px;">
          <button id="view-timeline" class="toggle-btn toggle-btn-active">Timeline</button>
          <button id="view-list"     class="toggle-btn">List</button>
        </div>

        <!-- Add / Edit form (hidden by default) -->
        <div id="goal-form-wrap" style="display:none; margin-bottom:14px;">
          <div class="card">
            <div class="section-label" style="margin-top:0;" id="goal-form-title">Add goal</div>
            <input type="hidden" id="goal-edit-id" />
            <div class="form-group">
              <label>Category</label>
              <div style="display:flex; flex-wrap:wrap; gap:6px;" id="category-picker">
                ${GOAL_CATEGORIES.map(c => `
                  <button class="cat-btn" data-cat="${c.key}" style="
                    padding:5px 10px; border-radius:20px; font-size:12px;
                    border:0.5px solid var(--color-border); background:var(--color-bg);
                    cursor:pointer; display:flex; align-items:center; gap:4px;">
                    ${c.icon} ${c.label}
                  </button>`).join("")}
              </div>
              <input type="hidden" id="goal-category" value="other" />
            </div>
            <div class="form-group">
              <label>Goal name</label>
              <input type="text" id="goal-name" placeholder="e.g. Daughter's college fund" />
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label>Target amount (₹)</label>
              <input type="number" id="goal-amount" step="1000" placeholder="e.g. 5000000" />
              <div class="field-hint" id="goal-amount-hint"></div>
            </div>
            <div class="form-group" style="margin-top:10px;">
              <label>Target year</label>
              <select id="goal-year">
                ${Array.from({length:26}, (_,i)=>currentYear+i)
                  .map(y=>`<option value="${y}">${y}</option>`).join("")}
              </select>
            </div>
            <div class="form-group">
              <label>Notes <span class="muted">(optional)</span></label>
              <textarea id="goal-notes" class="note-textarea" style="height:60px;" placeholder="Context, assumptions..."></textarea>
            </div>
            <div style="display:flex; gap:8px; margin-top:4px;">
              <button id="save-goal-btn" class="btn btn-primary">Save goal</button>
              <button id="cancel-goal-btn" class="btn">Cancel</button>
            </div>
          </div>
        </div>

        <div id="goals-timeline-view"></div>
        <div id="goals-list-view" style="display:none;"></div>
      </div>`;
  },

  async afterRender() {
    let goals = (await MetaStore.getGoals()) || [];
    // Show only future goals (target year >= current year)
    const futureGoals = goals
      .filter(g => g.targetYear >= currentYear)
      .sort((a, b) => a.targetYear - b.targetYear);

    let activeView = "timeline";
    let selectedCat = "other";

    // ── View toggle ───────────────────────────────────────────────────
    function switchView(view) {
      activeView = view;
      document.getElementById("goals-timeline-view").style.display = view === "timeline" ? "" : "none";
      document.getElementById("goals-list-view").style.display      = view === "list"     ? "" : "none";
      document.getElementById("view-timeline").classList.toggle("toggle-btn-active", view === "timeline");
      document.getElementById("view-list").classList.toggle("toggle-btn-active", view === "list");
      if (view === "timeline") renderTimeline();
      else renderList();
    }

    document.getElementById("view-timeline").addEventListener("click", () => switchView("timeline"));
    document.getElementById("view-list").addEventListener("click", () => switchView("list"));

    // ── Category picker ───────────────────────────────────────────────
    function selectCat(key) {
      selectedCat = key;
      document.getElementById("goal-category").value = key;
      document.querySelectorAll(".cat-btn").forEach(b => {
        const active = b.dataset.cat === key;
        b.style.background    = active ? "var(--color-text)" : "var(--color-bg)";
        b.style.color         = active ? "var(--color-surface)" : "";
        b.style.borderColor   = active ? "var(--color-text)" : "var(--color-border)";
      });
    }
    document.querySelectorAll(".cat-btn").forEach(b => {
      b.addEventListener("click", () => selectCat(b.dataset.cat));
    });
    selectCat("other");

    // Format amount hint
    document.getElementById("goal-amount").addEventListener("input", e => {
      const v = parseFloat(e.target.value);
      const hint = document.getElementById("goal-amount-hint");
      if (!v) { hint.textContent = ""; return; }
      hint.textContent = `= ${formatCurrencyShort(v)}`;
    });

    // ── Add / edit form ───────────────────────────────────────────────
    document.getElementById("add-goal-btn").addEventListener("click", () => {
      openForm(null);
    });

    document.getElementById("cancel-goal-btn").addEventListener("click", () => {
      document.getElementById("goal-form-wrap").style.display = "none";
    });

    function openForm(goal) {
      const form = document.getElementById("goal-form-wrap");
      document.getElementById("goal-form-title").textContent = goal ? "Edit goal" : "Add goal";
      document.getElementById("goal-edit-id").value    = goal?.id || "";
      document.getElementById("goal-name").value       = goal?.name || "";
      document.getElementById("goal-amount").value     = goal?.targetAmount || "";
      document.getElementById("goal-year").value       = goal?.targetYear || (currentYear + 5);
      document.getElementById("goal-notes").value      = goal?.notes || "";
      selectCat(goal?.category || "other");
      // Update amount hint if editing
      if (goal?.targetAmount) {
        document.getElementById("goal-amount-hint").textContent = `= ${formatCurrencyShort(goal.targetAmount)}`;
      }
      form.style.display = "block";
      document.getElementById("goal-name").focus();
    }

    document.getElementById("save-goal-btn").addEventListener("click", async () => {
      const name   = document.getElementById("goal-name").value.trim();
      const amount = parseFloat(document.getElementById("goal-amount").value);
      const year   = parseInt(document.getElementById("goal-year").value);
      const cat    = document.getElementById("goal-category").value;
      const notes  = document.getElementById("goal-notes").value.trim();
      const editId = document.getElementById("goal-edit-id").value;

      if (!name)      { alert("Enter a goal name.");   return; }
      if (!amount || amount <= 0) { alert("Enter a target amount."); return; }

      goals = (await MetaStore.getGoals()) || [];
      if (editId) {
        const idx = goals.findIndex(g => g.id === editId);
        if (idx >= 0) goals[idx] = { ...goals[idx], name, targetAmount: amount, targetYear: year, category: cat, notes };
      } else {
        goals.push({ id: `goal_${Date.now()}`, name, targetAmount: amount, targetYear: year, category: cat, notes, createdAt: new Date().toISOString().slice(0,10) });
      }
      await MetaStore.setGoals(goals);

      document.getElementById("goal-form-wrap").style.display = "none";
      // Reload
      const updated = (await MetaStore.getGoals()) || [];
      const future  = updated.filter(g => g.targetYear >= currentYear).sort((a,b) => a.targetYear - b.targetYear);
      Object.assign(futureGoals, future); futureGoals.length = future.length;
      if (activeView === "timeline") renderTimeline();
      else renderList();
    });

    // ── Timeline view ─────────────────────────────────────────────────
    const CAT_COLORS = {
      education:"#534AB7", house:"#378ADD", travel:"#1D9E75",
      vehicle:"#BA7517", wedding:"#D4537E", retirement:"#D85A30",
      emergency:"#5DCAA5", business:"#8B7EC8", other:"#B4B2A9",
    };

    function renderTimeline() {
      const el = document.getElementById("goals-timeline-view");
      if (futureGoals.length === 0) {
        el.innerHTML = `<div class="empty-state">No upcoming goals yet. Tap + Add goal to get started.</div>`;
        return;
      }
      const byYear = {};
      futureGoals.forEach(g => { (byYear[g.targetYear] = byYear[g.targetYear]||[]).push(g); });
      const sortedYears = Object.keys(byYear).map(Number).sort((a,b)=>a-b);
      const lastYear = sortedYears[sortedYears.length-1];
      const totalGoals = futureGoals.reduce((s,g)=>s+g.targetAmount,0);
      const yearTotals = {};
      futureGoals.forEach(g=>{yearTotals[g.targetYear]=(yearTotals[g.targetYear]||0)+g.targetAmount;});
      const peakEntry = Object.entries(yearTotals).sort((a,b)=>b[1]-a[1])[0];
      const SPINE = "var(--color-border)";
      const W = 40;

      const rows = sortedYears.map((yr, idx) => {
        const isLast  = idx === sortedYears.length - 1;
        const yrsAway = yr - currentYear;
        const yrLabel = yrsAway === 0 ? "this year" : `${yrsAway} yr${yrsAway===1?"":"s"}`;
        const goalCards = byYear[yr].map(g => {
          const cat   = getCat(g.category);
          const color = CAT_COLORS[g.category]||"#B4B2A9";
          return `
            <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--color-surface);border:0.5px solid var(--color-border);border-radius:var(--radius-md);margin-bottom:6px;">
              <span style="font-size:18px;flex-shrink:0;">${cat.icon}</span>
              <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${g.name}</div>
                <div class="muted" style="font-size:11px;">${cat.label}</div>
              </div>
              <div style="font-size:13px;font-weight:600;color:${color};flex-shrink:0;margin-right:4px;">${formatCurrencyShort(g.targetAmount)}</div>
              <button class="btn btn-small edit-goal-btn" data-goal-id="${g.id}" style="font-size:11px;flex-shrink:0;">Edit</button>
              <button class="edit-goal-delete btn btn-small" data-goal-id="${g.id}" style="font-size:11px;flex-shrink:0;color:var(--color-red);border-color:var(--color-red);padding:2px 6px;">✕</button>
            </div>`;
        }).join("");
        return `
          <div style="display:flex;gap:0;min-height:${byYear[yr].length*64+16}px;">
            <div style="width:${W}px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;">
              <div style="width:2px;background:${SPINE};flex:0 0 16px;"></div>
              <div style="width:14px;height:14px;border-radius:50%;background:var(--color-green);border:2px solid #fff;box-shadow:0 0 0 2px var(--color-green);flex-shrink:0;z-index:1;"></div>
              ${!isLast ? `<div style="width:2px;background:${SPINE};flex:1;"></div>` : ""}
            </div>
            <div style="flex:1;min-width:0;padding-left:12px;padding-bottom:8px;">
              <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;padding-top:8px;">
                <span style="font-size:15px;font-weight:700;">${yr}</span>
                <span class="muted" style="font-size:11px;">${yrLabel} · ${formatCurrencyShort(yearTotals[yr])}</span>
              </div>
              ${goalCards}
            </div>
          </div>`;
      }).join("");

      const nowRow = `
        <div style="display:flex;gap:0;">
          <div style="width:${W}px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;">
            <div style="width:10px;height:10px;border-radius:50%;background:var(--color-text);flex-shrink:0;z-index:1;margin-top:4px;"></div>
            <div style="width:2px;background:${SPINE};flex:1;"></div>
          </div>
          <div style="padding-left:12px;padding-bottom:16px;padding-top:2px;">
            <span class="muted" style="font-size:12px;">Now · ${currentYear}</span>
          </div>
        </div>`;

      el.innerHTML = `
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
          <div style="flex:1;min-width:90px;padding:10px 12px;background:var(--color-surface);border-radius:var(--radius-md);border:0.5px solid var(--color-border);">
            <div class="muted" style="font-size:10px;">Total</div>
            <div style="font-size:14px;font-weight:600;">${formatCurrencyShort(totalGoals)}</div>
          </div>
          <div style="flex:1;min-width:90px;padding:10px 12px;background:var(--color-surface);border-radius:var(--radius-md);border:0.5px solid var(--color-border);">
            <div class="muted" style="font-size:10px;">${futureGoals.length} goal${futureGoals.length===1?"":"s"}</div>
            <div style="font-size:14px;font-weight:600;">${currentYear} – ${lastYear}</div>
          </div>
          <div style="flex:1;min-width:90px;padding:10px 12px;background:var(--color-surface);border-radius:var(--radius-md);border:0.5px solid var(--color-border);">
            <div class="muted" style="font-size:10px;">Biggest year</div>
            <div style="font-size:14px;font-weight:600;">${peakEntry[0]}</div>
            <div class="muted" style="font-size:11px;">${formatCurrencyShort(peakEntry[1])}</div>
          </div>
        </div>
        <div style="padding:4px 0;">${nowRow}${rows}</div>`;

      wireGoalActions();
    }

    // ── List view ─────────────────────────────────────────────────────
    function renderList() {
      const el = document.getElementById("goals-list-view");
      if (futureGoals.length === 0) {
        el.innerHTML = `<div class="empty-state">No upcoming goals yet.</div>`;
        return;
      }
      el.innerHTML = `
        <div class="card" style="padding:0;">
          ${futureGoals.map((g, idx) => {
            const cat   = getCat(g.category);
            const color = CAT_COLORS[g.category]||"#B4B2A9";
            const yrsAway = g.targetYear - currentYear;
            return `
              <div style="display:flex; align-items:center; gap:10px; padding:10px 14px; ${idx < futureGoals.length-1 ? "border-bottom:0.5px solid var(--color-border);" : ""}">
                <span style="font-size:20px; flex-shrink:0;">${cat.icon}</span>
                <div style="flex:1; min-width:0;">
                  <div style="font-size:13px; font-weight:600;">${g.name}</div>
                  <div class="muted" style="font-size:11px;">${g.targetYear} · ${yrsAway===0?"this year":`${yrsAway} yr${yrsAway===1?"":"s"}`}</div>
                </div>
                <div style="font-size:13px; font-weight:600; color:${color}; flex-shrink:0;">${formatCurrencyShort(g.targetAmount)}</div>
                <button class="btn btn-small edit-goal-btn" data-goal-id="${g.id}" style="font-size:11px; flex-shrink:0;">Edit</button>
                <button class="edit-goal-delete btn btn-small" data-goal-id="${g.id}" style="font-size:11px; flex-shrink:0; color:var(--color-red); border-color:var(--color-red); padding:2px 6px;">✕</button>
              </div>`;
          }).join("")}
        </div>`;
      wireGoalActions();
    }

    function wireGoalActions() {
      document.querySelectorAll(".edit-goal-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          const id = btn.dataset.goalId;
          const all = (await MetaStore.getGoals()) || [];
          const goal = all.find(g => g.id === id);
          if (goal) openForm(goal);
        });
      });
      document.querySelectorAll(".edit-goal-delete").forEach(btn => {
        btn.addEventListener("click", async () => {
          if (!confirm("Delete this goal?")) return;
          const id  = btn.dataset.goalId;
          const all = (await MetaStore.getGoals()) || [];
          await MetaStore.setGoals(all.filter(g => g.id !== id));
          navigate("#goals");
        });
      });
    }

    // Clean up chart on navigate away
    window.addEventListener("hashchange", () => {
      if (timelineChart) { try { timelineChart.destroy(); } catch {} timelineChart = null; }
    }, { once: true });

    // Initial render
    switchView("timeline");
  },
};

registerScreen("goals", goalsScreen);
