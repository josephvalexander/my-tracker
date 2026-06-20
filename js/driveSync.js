/**
 * driveSync.js
 *
 * Manual push/pull sync to Google Drive's appDataFolder — a hidden
 * folder scope that doesn't show up in the user's regular Drive UI,
 * which is the right choice here since this is app-internal data, not
 * something the user browses to directly.
 *
 * No auto-sync. Sync only happens when the user taps the sync button,
 * per the single-user/no-sharing requirement — there's no multi-device
 * conflict resolution beyond last-write-wins-with-confirmation, since
 * conflict resolution complexity isn't worth it for a single user who
 * is the only writer.
 *
 * This assumes you already have a Google OAuth client set up (you've
 * done this exact pattern in Veettu Chilavu / V-Plantations) with the
 * `https://www.googleapis.com/auth/drive.appdata` scope. The token
 * handling below is intentionally minimal — swap in whatever OAuth
 * flow you're already using in those projects rather than rebuilding one.
 */

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
const BACKUP_FILENAME = "portfolio-tracker-backup.json";

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

const driveSyncExports = { pushToDrive, pullFromDrive, summarizeDiff, findBackupFileId };

if (typeof module !== "undefined" && module.exports) {
  module.exports = driveSyncExports;
} else if (typeof window !== "undefined") {
  Object.assign(window, driveSyncExports);
}
