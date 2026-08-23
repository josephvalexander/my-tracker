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
    function renderTimeline() {
      const el = document.getElementById("goals-timeline-view");
      if (futureGoals.length === 0) {
        el.innerHTML = `<div class="empty-state">No upcoming goals yet. Tap + Add goal to get started.</div>`;
        return;
      }

      // Group goals by year
      const byYear = {};
      futureGoals.forEach(g => { (byYear[g.targetYear] = byYear[g.targetYear] || []).push(g); });
      const years = Object.keys(byYear).map(Number).sort((a,b)=>a-b);
      const minY  = currentYear;
      const maxY  = Math.max(...years) + 1;
      const total = maxY - minY + 1;

      // SVG timeline
      const W = 320;
      const trackY = 40;
      const colW = Math.max(60, Math.floor(W / total));
      const svgW = colW * total;

      let rects = "";
      let labels = "";
      years.forEach(yr => {
        const x = (yr - minY) * colW + colW / 2;
        // Year dot
        rects += `<circle cx="${x}" cy="${trackY}" r="6" fill="var(--color-green)" />`;
        // Year label
        labels += `<text x="${x}" y="${trackY - 12}" text-anchor="middle" font-size="10" fill="var(--color-text-secondary)">${yr}</text>`;
      });

      // Today marker
      const todayX = colW / 2;
      rects += `<circle cx="${todayX}" cy="${trackY}" r="4" fill="var(--color-text)" />`;
      labels += `<text x="${todayX}" y="${trackY - 12}" text-anchor="middle" font-size="10" fill="var(--color-text)">Now</text>`;

      el.innerHTML = `
        <div style="overflow-x:auto; padding-bottom:4px;">
          <svg viewBox="0 0 ${svgW} 60" width="${svgW}" height="60" style="min-width:100%;">
            <line x1="${todayX}" y1="${trackY}" x2="${(maxY-minY)*colW+colW/2}" y2="${trackY}" stroke="var(--color-border)" stroke-width="2"/>
            ${rects}${labels}
          </svg>
        </div>
        <div style="margin-top:2px;">
          ${years.map(yr => `
            <div style="margin-bottom:16px;">
              <div class="section-label" style="margin-bottom:6px;">
                ${yr} <span class="muted" style="font-size:10px;">${yr - currentYear === 0 ? "this year" : `in ${yr - currentYear} year${yr-currentYear===1?"":"s"}`}</span>
              </div>
              ${byYear[yr].map(g => goalCard(g)).join("")}
            </div>`).join("")}
        </div>`;

      wireGoalActions();
    }

    // ── List view ─────────────────────────────────────────────────────
    function renderList() {
      const el = document.getElementById("goals-list-view");
      if (futureGoals.length === 0) {
        el.innerHTML = `<div class="empty-state">No upcoming goals yet.</div>`;
        return;
      }
      el.innerHTML = futureGoals.map(g => goalCard(g)).join("");
      wireGoalActions();
    }

    // ── Goal card ─────────────────────────────────────────────────────
    function goalCard(g) {
      const cat = getCat(g.category);
      const yearsLeft = g.targetYear - currentYear;
      return `
        <div class="card" style="display:flex; align-items:flex-start; gap:10px; margin-bottom:8px;" data-goal-id="${g.id}">
          <div style="font-size:24px; flex-shrink:0; line-height:1; padding-top:2px;">${cat.icon}</div>
          <div style="flex:1; min-width:0;">
            <div style="font-size:14px; font-weight:600;">${g.name}</div>
            <div class="muted" style="font-size:11px;">${cat.label} · ${g.targetYear} · ${yearsLeft===0?"this year":`${yearsLeft} year${yearsLeft===1?"":"s"} away`}</div>
            <div style="font-size:15px; font-weight:600; margin-top:4px; color:var(--color-green);">${formatCurrencyShort(g.targetAmount)}</div>
            ${g.notes ? `<div class="muted" style="font-size:11px; margin-top:4px;">${g.notes}</div>` : ""}
          </div>
          <div style="display:flex; flex-direction:column; gap:4px; flex-shrink:0;">
            <button class="btn btn-small edit-goal-btn" data-goal-id="${g.id}" style="font-size:11px;">Edit</button>
            <button class="btn btn-small icon-btn-danger edit-goal-delete" data-goal-id="${g.id}" style="font-size:11px; color:var(--color-red); border-color:var(--color-red);">Delete</button>
          </div>
        </div>`;
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

    // Initial render
    switchView("timeline");
  },
};

registerScreen("goals", goalsScreen);
