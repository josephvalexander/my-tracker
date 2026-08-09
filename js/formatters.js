/**
 * formatters.js
 *
 * Shared display-formatting helpers used across every screen. Pulled
 * out into their own file so screens don't implicitly depend on
 * whichever other screen file happened to load first and define them
 * as a side effect — that worked by accident (function declarations do
 * attach to the global scope reliably across <script> tags, unlike
 * const/let), but it was never something to rely on intentionally.
 *
 * Must load before any screens/*.js file in index.html.
 */

function formatPct(v, decimals = 0) {
  return v === null || v === undefined || Number.isNaN(v) ? "—" : `${v.toFixed(decimals)}%`;
}

function formatRatio(v, decimals = 2) {
  return v === null || v === undefined || Number.isNaN(v) ? "—" : v.toFixed(decimals);
}

function formatCurrency(v) {
  return v === null || v === undefined || Number.isNaN(v) ? "—" : `₹${Math.round(v).toLocaleString("en-IN")}`;
}

function formatCurrencyShort(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (v >= 100000)   return `₹${(v / 100000).toFixed(2)}L`;
  if (v >= 1000)     return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { formatPct, formatRatio, formatCurrency, formatCurrencyShort };
} else if (typeof window !== "undefined") {
  Object.assign(window, { formatPct, formatRatio, formatCurrency, formatCurrencyShort });
}
