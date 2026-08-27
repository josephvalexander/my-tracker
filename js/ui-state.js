/**
 * ui-state.js
 *
 * Initialises window.uiState from localStorage before any screen script runs.
 * Must be loaded first in index.html — screens reference window.uiState at
 * parse time so it must exist before watchlist.js, holdings.js etc. are evaluated.
 *
 * uiStateSave() is called by any screen that mutates uiState so the selection
 * survives page reloads and PWA relaunches.
 */

const _UI_STATE_KEY = "buffett_compos_ui_state";

function uiStateSave() {
  try {
    const s = window.uiState;
    localStorage.setItem(_UI_STATE_KEY, JSON.stringify({
      watchlistFilters:   [...s.watchlistFilters],
      watchlistSort:      s.watchlistSort,
      holdingsFilters:    [...s.holdingsFilters],
      holdingsXirr:       s.holdingsXirr,
      analyticsFilters:   [...s.analyticsFilters],
      analyticsPeriod:    s.analyticsPeriod,
      analyticsBenchmark: s.analyticsBenchmark,
    }));
  } catch { /* storage full or private mode — silently ignore */ }
}

(function () {
  const DEFAULTS = {
    watchlistFilters:   new Set(["mainboard", "sme", "reit"]),
    watchlistSort:      "default",
    holdingsFilters:    new Set(["mainboard"]),
    holdingsXirr:       false,
    analyticsFilters:   new Set(["mainboard"]),
    analyticsPeriod:    null,
    analyticsBenchmark: "none",
  };

  try {
    const raw = localStorage.getItem(_UI_STATE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      window.uiState = {
        watchlistFilters:   new Set(saved.watchlistFilters   ?? [...DEFAULTS.watchlistFilters]),
        watchlistSort:      saved.watchlistSort      ?? DEFAULTS.watchlistSort,
        holdingsFilters:    new Set(saved.holdingsFilters    ?? [...DEFAULTS.holdingsFilters]),
        holdingsXirr:       saved.holdingsXirr       ?? DEFAULTS.holdingsXirr,
        analyticsFilters:   new Set(saved.analyticsFilters   ?? [...DEFAULTS.analyticsFilters]),
        analyticsPeriod:    saved.analyticsPeriod    ?? DEFAULTS.analyticsPeriod,
        analyticsBenchmark: saved.analyticsBenchmark ?? DEFAULTS.analyticsBenchmark,
      };
      return;
    }
  } catch { /* corrupt localStorage — fall through to defaults */ }

  window.uiState = { ...DEFAULTS };
})();