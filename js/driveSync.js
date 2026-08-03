/**
 * driveSync.js
 *
 * Syncs to Google Drive's appDataFolder — a hidden folder scope that
 * doesn't show up in the user's regular Drive UI, appropriate since
 * this is app-internal data, not something to browse to directly.
 *
 * Sync model: auto-PULL on every app open (so opening the app on any
 * device always starts from the latest data), manual PUSH only (you
 * tap "Sync now" after making edits, so you always know your changes
 * are backed up — no silent overwrite risk from automatic background
 * pushes racing across devices).
 *
 * OAuth: uses Google Identity Services' token client
 * (`google.accounts.oauth2.initTokenClient`), the standard approach
 * for a backend-less, client-only app like this one. Worth knowing:
 * Google's own docs flag the underlying implicit-grant-style token
 * model as less hardened than Authorization Code + PKCE — but PKCE's
 * token exchange step needs a server to keep things fully off the
 * client, which this app deliberately doesn't have. The token-client
 * model is the realistic, supported option without standing up a
 * backend, and is what Google's own client-side guides demonstrate.
 *
 * Setup required before this works:
 * 1. Create an OAuth 2.0 Client ID (type: Web application) in Google
 *    Cloud Console, with your GitHub Pages URL added under
 *    "Authorized JavaScript origins" (e.g. https://josephvalexander.github.io).
 * 2. Paste that client ID into DRIVE_CLIENT_ID below.
 * 3. Enable the Google Drive API on that same Cloud project.
 */

const DRIVE_CLIENT_ID = "1049661262939-skq9h5qaucoqc0bf7ojqe6nuugut7so4.apps.googleusercontent.com";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
const BACKUP_FILENAME = "portfolio-tracker-backup.json";

let tokenClient = null;
let cachedAccessToken = null;
let cachedTokenExpiry = 0;

/**
 * Loads the Google Identity Services script if not already present.
 * Safe to call multiple times — resolves immediately if already loaded.
 */
function loadGisScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity Services script."));
    document.head.appendChild(script);
  });
}

/**
 * Returns a valid access token. Pass `{ silentOnly: true }` to never
 * trigger a consent popup — returns null instead if there's no valid
 * cached token, rather than calling requestAccessToken() and getting
 * blocked by the browser's popup blocker (which happens reliably when
 * this runs on page load, outside a user click).
 *
 * IMPORTANT, learned from Google's own GIS docs: there is no supported
 * silent/automatic token refresh in GIS once a token expires — Google
 * removed that specifically to keep token issuance tied to a visible
 * user action. This means auto-pull-on-open only works silently within
 * the lifetime of the last token you obtained via an explicit "Sync
 * now" / "Connect Drive" click (roughly an hour) — after that, the
 * person needs to interact (tap Sync) to get a fresh token. This is a
 * real platform constraint, not an implementation gap to "fix" later.
 */
async function getAccessToken(options = {}) {
  const { silentOnly = false } = options;

  if (cachedAccessToken && Date.now() < cachedTokenExpiry) {
    return cachedAccessToken;
  }

  if (silentOnly) {
    return null;
  }

  await loadGisScript();

  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: DRIVE_CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: () => {}, // overwritten per-call below
      });
    }
    tokenClient.callback = (response) => {
      if (response.error) {
        reject(new Error(`Drive sign-in failed: ${response.error}`));
        return;
      }
      cachedAccessToken = response.access_token;
      // expires_in is in seconds; back off by 60s as a safety margin.
      cachedTokenExpiry = Date.now() + (response.expires_in - 60) * 1000;
      resolve(cachedAccessToken);
    };
    tokenClient.requestAccessToken();
  });
}

/** Revokes the cached token and clears it, used by the "Disconnect Drive" action. */
function disconnectDrive() {
  if (cachedAccessToken && window.google?.accounts?.oauth2) {
    google.accounts.oauth2.revoke(cachedAccessToken, () => {});
  }
  cachedAccessToken = null;
  cachedTokenExpiry = 0;
}

/**
 * Finds the existing backup file in appDataFolder, if any.
 * Returns the Drive file ID, or null if no backup exists yet.
 */
async function findBackupFileId(accessToken) {
  const url = `${DRIVE_API_BASE}/files?spaces=appDataFolder&q=name='${BACKUP_FILENAME}'&fields=files(id,modifiedTime)`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Drive file search failed: ${response.status}`);
  const data = await response.json();
  return data.files?.[0] ?? null;
}

/**
 * Pushes local data to Drive. Creates the backup file on first push,
 * updates it on subsequent pushes (same file ID, new content) so we
 * don't accumulate duplicate backup files in appDataFolder over time.
 */
async function pushToDrive(accessToken, localData) {
  const existing = await findBackupFileId(accessToken);
  const body = JSON.stringify(localData);

  if (existing) {
    const response = await fetch(`${DRIVE_UPLOAD_BASE}/files/${existing.id}?uploadType=media`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body,
    });
    if (!response.ok) throw new Error(`Drive update failed: ${response.status}`);
    return { fileId: existing.id, action: "updated" };
  }

  const metadata = { name: BACKUP_FILENAME, parents: ["appDataFolder"] };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", new Blob([body], { type: "application/json" }));

  const response = await fetch(`${DRIVE_UPLOAD_BASE}/files?uploadType=multipart`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  if (!response.ok) throw new Error(`Drive create failed: ${response.status}`);
  const created = await response.json();
  return { fileId: created.id, action: "created" };
}

/**
 * Pulls the backup file from Drive. Returns null if no backup exists
 * yet (e.g. first run on a new device before any push has happened).
 */
async function pullFromDrive(accessToken) {
  const existing = await findBackupFileId(accessToken);
  if (!existing) return null;

  const response = await fetch(`${DRIVE_API_BASE}/files/${existing.id}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Drive download failed: ${response.status}`);
  return response.json();
}

/**
 * Builds a lightweight diff summary between local and remote data, for
 * the confirmation screen before an overwriting pull. Compares ticker
 * lists and lastUpdated timestamps — not a deep field-by-field diff,
 * since that level of detail isn't needed for a single-user confirm step.
 */
function summarizeDiff(local, remote) {
  const localTickers = new Set((local?.stocks ?? []).map((s) => s.value.ticker));
  const remoteTickers = new Set((remote?.stocks ?? []).map((s) => s.value.ticker));

  const onlyInRemote = [...remoteTickers].filter((t) => !localTickers.has(t));
  const onlyInLocal = [...localTickers].filter((t) => !remoteTickers.has(t));
  const remoteExportedAt = remote?.exportedAt ?? null;

  return { onlyInRemote, onlyInLocal, remoteExportedAt };
}

const driveSyncExports = { pushToDrive, pullFromDrive, summarizeDiff, findBackupFileId, getAccessToken, disconnectDrive };

if (typeof module !== "undefined" && module.exports) {
  module.exports = driveSyncExports;
} else if (typeof window !== "undefined") {
  Object.assign(window, driveSyncExports);
}