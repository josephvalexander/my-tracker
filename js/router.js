/**
 * router.js
 *
 * Minimal hash-based router. Each screen module exports a `render(params)`
 * function that returns an HTML string, and an optional `afterRender(params)`
 * for wiring up event listeners and async data loads after the HTML is
 * in the DOM (since charts/data fetches need real elements to attach to).
 *
 * Routes are simple: #screen/param1/param2 — e.g. #stock/CAPLIPOINT
 * opens the stock detail screen for that ticker.
 */

const screens = {}; // populated by each screen module calling registerScreen()
if (typeof window !== "undefined") window.screens = screens;

function registerScreen(name, module) {
  screens[name] = module;
}

// Screens whose scroll position should be saved and restored.
// Add more screen names here if needed in future.
const SCROLL_SAVE_SCREENS = new Set(["watchlist", "holdings", "portfolio"]);

async function navigate(hash) {
  const clean = (hash || "#watchlist").replace(/^#/, "");
  const [screenName, ...rawParams] = clean.split("/");

  // Save current scroll position for the screen we're leaving
  const prevScreen = window._currentScreen;
  if (prevScreen && SCROLL_SAVE_SCREENS.has(prevScreen)) {
    window.uiState.scrollPositions[prevScreen] = window.scrollY;
  }
  window._currentScreen = screenName;
  // Decode each param segment so URL-encoded tickers (e.g. CLEAN%20SCIENCE)
  // resolve to the actual stored key (CLEAN SCIENCE)
  const params = rawParams.map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
  const screen = screens[screenName] || screens.watchlist;

  const container = document.getElementById("screen-container");

  try {
    container.innerHTML = await screen.render(params);
  } catch (err) {
    console.error(`Render failed for screen "${screenName}":`, err);
    container.innerHTML = `
      <div class="screen-padding">
        <div class="empty-state">
          Something went wrong loading this screen.<br/>
          <span style="font-size:11px; color:var(--color-text-tertiary);">${err.message}</span>
        </div>
      </div>`;
    return;
  }

  try {
    if (screen.afterRender) {
      await screen.afterRender(params);
    }
  } catch (err) {
    console.error(`afterRender failed for screen "${screenName}":`, err);
  }

  // highlight the active bottom-nav tab if this screen has one
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.screen === screenName);
  });

  // Restore saved scroll position when returning to a scrollable screen,
  // otherwise reset to top. Use requestAnimationFrame to let the DOM
  // fully paint before scrolling — without this the scroll fires before
  // the content height is known and lands at 0 anyway.
  const savedY = SCROLL_SAVE_SCREENS.has(screenName)
    ? (window.uiState.scrollPositions[screenName] ?? 0)
    : 0;
  requestAnimationFrame(() => window.scrollTo({ top: savedY, behavior: "instant" }));
}

function initRouter() {
  window.addEventListener("hashchange", () => navigate(window.location.hash));
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.hash = `#${btn.dataset.screen}`;
    });
  });
  navigate(window.location.hash);
}