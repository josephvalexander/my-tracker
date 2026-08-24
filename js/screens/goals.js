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
    let timelineChart = null;

    function renderTimeline() {
      const el = document.getElementById("goals-timeline-view");
      if (futureGoals.length === 0) {
        el.innerHTML = `<div class="empty-state">No upcoming goals yet. Tap + Add goal to get started.</div>`;
        return;
      }

      if (timelineChart) { try { timelineChart.destroy(); } catch {} timelineChart = null; }

      // Build year range: now to last goal + 2
      const lastYear = Math.max(...futureGoals.map(g => g.targetYear));
      const years    = [];
      for (let y = currentYear; y <= lastYear + 1; y++) years.push(y);

      // Baseline at 0 — just a flat line with goal markers on top
      const baseData = years.map(() => 0);

      // Category colours — one per category key
      const CAT_COLORS = {
        education:"#534AB7", house:"#378ADD", travel:"#1D9E75",
        vehicle:"#BA7517",   wedding:"#D4537E", retirement:"#D85A30",
        emergency:"#5DCAA5", business:"#8B7EC8", other:"#B4B2A9",
      };

      // Each goal becomes a scatter point on the baseline
      // Multiple goals in the same year are staggered vertically
      const yearCount = {};
      futureGoals.forEach(g => { yearCount[g.targetYear] = (yearCount[g.targetYear]||0) + 1; });
      const yearIndex = {};

      const goalDatasets = futureGoals.map((g, idx) => {
        yearIndex[g.targetYear] = (yearIndex[g.targetYear]||0);
        const yOffset = yearIndex[g.targetYear]++ * 18; // stagger multiple goals same year
        const cat = getCat(g.category);
        const color = CAT_COLORS[g.category] || "#B4B2A9";
        return {
          type: "bubble",
          label: `${cat.icon} ${g.name}`,
          data: [{ x: g.targetYear, y: yOffset, r: 8 }],
          backgroundColor: color,
          borderColor: "#fff",
          borderWidth: 2,
          _goal: g,
          _color: color,
        };
      });

      // Summary stats for header
      const totalGoals   = futureGoals.reduce((s,g)=>s+g.targetAmount,0);
      const yearTotals   = {};
      futureGoals.forEach(g=>{yearTotals[g.targetYear]=(yearTotals[g.targetYear]||0)+g.targetAmount;});
      const peakYear     = Object.entries(yearTotals).sort((a,b)=>b[1]-a[1])[0];

      el.innerHTML = `
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px;">
          <div style="flex:1; min-width:100px; padding:10px 12px; background:var(--color-surface); border-radius:var(--radius-md);">
            <div class="muted" style="font-size:11px;">Total goals</div>
            <div style="font-size:15px; font-weight:600;">${formatCurrencyShort(totalGoals)}</div>
          </div>
          <div style="flex:1; min-width:100px; padding:10px 12px; background:var(--color-surface); border-radius:var(--radius-md);">
            <div class="muted" style="font-size:11px;">Goals count</div>
            <div style="font-size:15px; font-weight:600;">${futureGoals.length}</div>
          </div>
          <div style="flex:1; min-width:100px; padding:10px 12px; background:var(--color-surface); border-radius:var(--radius-md);">
            <div class="muted" style="font-size:11px;">Biggest year</div>
            <div style="font-size:15px; font-weight:600;">${peakYear ? peakYear[0] : "—"}</div>
            <div class="muted" style="font-size:10px;">${peakYear ? formatCurrencyShort(peakYear[1]) : ""}</div>
          </div>
        </div>

        <div class="card" style="padding:14px 12px; margin-bottom:16px;">
          <div style="position:relative; height:180px;">
            <canvas id="goals-chart"></canvas>
          </div>
        </div>

        <div id="goals-year-groups"></div>`;

      // Draw chart
      const baseFont = { family:"-apple-system,'Segoe UI',Roboto,sans-serif", size:10 };

      // Vertical dashed lines at each goal year
      const goalYears = [...new Set(futureGoals.map(g=>g.targetYear))];
      const maxStagger = Math.max(0, ...Object.values(yearIndex)) * 18;

      timelineChart = new Chart(document.getElementById("goals-chart"), {
        data: {
          datasets: [
            // Baseline connecting line
            {
              type: "line",
              label: "_baseline",
              data: years.map(y => ({ x: y, y: 0 })),
              borderColor: "var(--color-border)",
              borderWidth: 1.5,
              pointRadius: 0,
              fill: false,
              tension: 0,
              order: 10,
            },
            // "Now" marker
            {
              type: "bubble",
              label: "Now",
              data: [{ x: currentYear, y: 0, r: 5 }],
              backgroundColor: "var(--color-text)",
              borderColor: "#fff",
              borderWidth: 2,
              order: 5,
            },
            ...goalDatasets,
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              filter: item => item.dataset.label !== "_baseline" && item.dataset.label !== "Now",
              callbacks: {
                title: items => {
                  const ds = items[0]?.dataset;
                  return ds?._goal ? `${ds.label}` : "";
                },
                label: items => {
                  const g = items.dataset?._goal;
                  return g ? [`${g.targetYear}  ·  ${formatCurrencyShort(g.targetAmount)}`, g.notes||""].filter(Boolean) : [];
                },
              },
              backgroundColor: "#2c2c2a",
              titleFont: { ...baseFont, size:12, weight:"600" },
              bodyFont: baseFont,
              padding: 10, cornerRadius: 6,
            },
          },
          scales: {
            x: {
              type: "linear",
              min: currentYear - 0.5,
              max: lastYear + 1.5,
              ticks: {
                font: baseFont, color: "#888780",
                stepSize: 1,
                callback: v => Number.isInteger(v) ? v : "",
              },
              grid: { color: "rgba(0,0,0,0.04)" },
            },
            y: {
              display: false,
              min: -10,
              max: maxStagger + 30,
            },
          },
          onClick: (evt, elements) => {
            const el = elements.find(e => goalDatasets[e.datasetIndex - 2]);
            if (el) {
              const g = goalDatasets[el.datasetIndex - 2]?._goal;
              if (g) openForm(g);
            }
          },
        },
        plugins: [{
          // Draw goal year labels and connecting vertical lines
          id: "goalLabels",
          afterDraw(chart) {
            const ctx = chart.ctx;
            const xScale = chart.scales.x;
            const yScale = chart.scales.y;

            futureGoals.forEach((g, i) => {
              const cat   = getCat(g.category);
              const color = CAT_COLORS[g.category] || "#B4B2A9";
              const ds    = goalDatasets[i];
              const yOff  = ds.data[0].y;

              const px = xScale.getPixelForValue(g.targetYear);
              const py = yScale.getPixelForValue(yOff);
              const basePy = yScale.getPixelForValue(0);

              // Vertical stem from baseline to dot
              if (yOff > 0) {
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(px, basePy);
                ctx.lineTo(px, py);
                ctx.strokeStyle = color + "88";
                ctx.lineWidth = 1;
                ctx.setLineDash([3,3]);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
              }

              // Label above dot: icon + name
              ctx.save();
              ctx.font = `10px -apple-system,sans-serif`;
              ctx.fillStyle = "#666";
              ctx.textAlign = "center";
              // Truncate long names
              const label = `${cat.icon} ${g.name.length > 12 ? g.name.slice(0,11)+"…" : g.name}`;
              ctx.fillText(label, px, py - 14);
              // Amount below name
              ctx.fillStyle = color;
              ctx.font = `bold 10px -apple-system,sans-serif`;
              ctx.fillText(formatCurrencyShort(g.targetAmount), px, py - 4);
              ctx.restore();
            });
          },
        }],
      });

      // Year-grouped detail below the chart
      const byYear = {};
      futureGoals.forEach(g => { (byYear[g.targetYear] = byYear[g.targetYear]||[]).push(g); });
      const sortedYears = Object.keys(byYear).map(Number).sort((a,b)=>a-b);

      document.getElementById("goals-year-groups").innerHTML = sortedYears.map(yr => `
        <div style="margin-bottom:14px;">
          <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px;">
            <span class="section-label" style="margin:0;">${yr}</span>
            <span class="muted" style="font-size:11px;">${yr-currentYear===0?"this year":`${yr-currentYear} yr${yr-currentYear===1?"":"s"} away`} · ${formatCurrencyShort(yearTotals[yr])} total</span>
          </div>
          ${byYear[yr].map(g => {
            const cat = getCat(g.category);
            const color = CAT_COLORS[g.category]||"#B4B2A9";
            return `
              <div class="card" style="display:flex; align-items:center; gap:10px; padding:10px 12px; margin-bottom:6px; cursor:pointer;" onclick="">
                <span style="font-size:20px; flex-shrink:0;">${cat.icon}</span>
                <div style="flex:1; min-width:0;">
                  <div style="font-size:13px; font-weight:600;">${g.name}</div>
                  <div class="muted" style="font-size:11px;">${cat.label}${g.notes?` · ${g.notes}`:""}</div>
                </div>
                <div style="text-align:right; flex-shrink:0;">
                  <div style="font-size:14px; font-weight:600; color:${color};">${formatCurrencyShort(g.targetAmount)}</div>
                </div>
                <div style="display:flex; gap:4px; flex-shrink:0;">
                  <button class="btn btn-small edit-goal-btn" data-goal-id="${g.id}" style="font-size:11px;">Edit</button>
                  <button class="btn btn-small edit-goal-delete" data-goal-id="${g.id}" style="font-size:11px; color:var(--color-red); border-color:var(--color-red);">✕</button>
                </div>
              </div>`;
          }).join("")}
        </div>`).join("");

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

    // Clean up chart on navigate away
    window.addEventListener("hashchange", () => {
      if (timelineChart) { try { timelineChart.destroy(); } catch {} timelineChart = null; }
    }, { once: true });

    // Initial render
    switchView("timeline");
  },
};

registerScreen("goals", goalsScreen);