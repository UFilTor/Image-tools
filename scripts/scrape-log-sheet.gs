// Apps Script for the "Image Tools fetch misses" Google Sheet. Image Tools' /api/scrape posts
// { secret, row } here for every "Fetch from a website" miss (lib/scrape-log.ts); this appends the
// row to the Misses tab. Columns K-M (Status, Checked on, Fix) stay empty for the weekly routine.
//
// Setup, once:
// 1. In the sheet: Extensions > Apps Script. Replace the editor's contents with this file.
// 2. Replace PASTE_SECRET_HERE with the same value as SCRAPE_LOG_SECRET in Vercel.
// 3. Deploy > New deployment > type Web app. Execute as: Me. Who has access: Anyone.
// 4. Put the /exec URL in Vercel as SCRAPE_LOG_URL (Production only).
// After editing this script, Deploy > Manage deployments > edit > New version keeps the same URL.

const SECRET = "PASTE_SECRET_HERE";
const SHEET = "Misses";

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply({ ok: false, error: "Body is not JSON" });
  }
  if (!body || body.secret !== SECRET) return reply({ ok: false, error: "bad secret" });
  const r = body.row || {};
  // Two appendRow calls at once can land on the same row, so writes take turns.
  // TODO(simplification): one lock for the whole script; a miss that waits over 10 s throws and is
  // only logged in Vercel. Upgrade path: queue rows in CacheService and append them on a timer.
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    SpreadsheetApp.getActive().getSheetByName(SHEET).appendRow([
      new Date(r.timestamp),
      text(r.urlEntered),
      text(r.finalUrl),
      text(r.outcome),
      r.siteStatus,
      text(r.message),
      r.photos,
      r.logos,
      text(r.clues),
      text(r.appVersion),
      "",
      "",
      "",
      text(r.pasteForClaude),
    ]);
  } finally {
    lock.releaseLock();
  }
  return reply({ ok: true });
}

// Page titles come from any website: a leading = + - @ would make Sheets run them as a formula.
function text(value) {
  const s = value == null ? "" : String(value).slice(0, 5000);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
