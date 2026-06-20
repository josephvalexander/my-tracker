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

async function navigate(hash) {
  const clean = (hash || "#watchlist").replace(/^#/, "");
  const [screenName, ...params] = clean.split("/");
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

  window.scrollTo(0, 0);
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
