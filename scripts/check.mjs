import fs from "node:fs";

const root = new URL("../", import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), "utf8");
const required = ["public/index.html","worker/api-template.js","firebase/firestore.rules","firebase/firestore.indexes.json","wrangler.toml"];
for (const file of required) {
  if (!fs.existsSync(new URL(file, root))) throw new Error("Missing " + file);
}

const html = read("public/index.html");
const worker = read("worker/api-template.js");
const moduleScript = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1] || "";
new Function("return (async()=>{" + moduleScript + "})");
const safeWorker = worker
  .replace("const APP_HTML = __APP_HTML__;", "const APP_HTML = String();")
  .replace("export default {", "const __worker = {");
new Function(safeWorker);

const assert = (ok, message) => { if (!ok) throw new Error(message); };
assert((html.match(/<style>/g) || []).length === 1, "Expected exactly one stylesheet");
assert(html.includes("data-date-calendar"), "Calendar picker missing");
assert(html.includes("data-calendar-day"), "Calendar day grid missing");
assert(html.includes("customPickerScope:null"), "Custom picker visibility state missing");
assert(html.includes("state.customPickerScope=null;"), "Custom picker does not collapse after apply");
assert(!html.includes('placeholder="DD/MM/YYYY"'), "Manual date input still present");
assert(html.includes("saveAssignment(b.dataset.saveSession,b)"), "LIVE save is not scoped to clicked control");
assert(html.includes("async function saveAssignment(id,sourceEl)"), "Scoped saveAssignment signature missing");
assert(html.includes("sourceEl?.closest('tr,.mobile-live-card')"), "LIVE save does not resolve desktop/mobile container");
const saveStart = html.indexOf("async function saveAssignment(id,sourceEl)");
const saveBlock = html.slice(saveStart, html.indexOf("function exportCsv", saveStart));
assert(!saveBlock.includes("document.querySelector"), "LIVE save still reads global hidden selectors");
assert(html.includes("scopeEl?.querySelectorAll('[data-person]')"), "Campaign/Mega toggle is not scoped to its row/card");
assert(html.includes("PREVIEW_STATE_KEY='sellerkbb:preview-state:v1'"), "Preview persistence missing");
assert(html.includes("persistPreviewState();"), "Preview save persistence call missing");
assert(html.includes("restorePreviewState();"), "Preview restore missing");
assert(html.includes("hostUid:manual?'':"), "Campaign/Mega must persist Host blank");
assert(html.includes("operatorUid:manual?'':"), "Campaign/Mega must persist Operator blank");
assert(html.includes("hostUid:old.kpiMode==='manual'?'':"), "Auto-sync merge must not restore staff for manual KPI sessions");
assert(html.includes("Dữ liệu Tiktok được đồng bộ lúc:"), "Sync status text missing");
assert(html.includes("rangeMode:'today'"), "Default filter must be Today");
assert(html.includes("['30d','30 Ngày']"), "30-day filter label missing");
assert(html.includes("function dashboardSessionsForRange()"), "Dashboard 7-day monthly preview helper missing");
assert(html.includes('id="dashboardViewMore"'), "Dashboard View More button missing");
const timeRangeStart = html.indexOf("function fmtLiveTimeRange(s)");
const timeRangeEnd = html.indexOf("function isManualKpi", timeRangeStart);
const timeRangeBlock = html.slice(timeRangeStart, timeRangeEnd);
assert(!timeRangeBlock.includes(" lúc "), "LIVE time range must not contain the word lúc");
assert(timeRangeBlock.includes("${startDate}  ${startTime}-${endTime}"), "LIVE time range must use two spaces between date and time");
assert(html.includes("function liveEndTime(s)"), "LIVE end-time helper missing");
assert(html.includes("Thời gian phiên LIVE"), "Desktop LIVE time header missing");
assert(html.includes("fmtLiveTimeRange(s)"), "Compact LIVE time range formatter missing");
assert(html.includes('live-time-cell"><b>${fmtLiveTimeRange(s)}</b>'), "Desktop compact LIVE time missing");
assert(worker.includes('"/api/tiktok/autosync/status"'), "Auto-sync status endpoint missing");
assert(worker.includes('"/api/tiktok/autosync/sessions"'), "Auto-sync sessions endpoint missing");
assert(html.includes("function storageQuotaCard"), "Storage quota card renderer missing");
assert(html.includes("provider:'GitHub'"), "GitHub storage card missing");
assert(html.includes("provider:'Firebase'"), "Firebase storage card missing");
assert(html.includes("provider:'Cloudflare'"), "Cloudflare storage card missing");
assert(html.includes("storage-progress"), "Storage progress bar missing");
assert(worker.includes("async function measureKvStorage"), "Cloudflare KV byte measurement missing");
assert(worker.includes("async function getGithubRepoStorage"), "GitHub repository storage lookup missing");
assert(worker.includes("storageLimitBytes: 1073741824"), "Firebase 1 GiB storage limit missing");
assert(worker.includes("storageLimitBytes: 1000000000"), "Cloudflare 1 GB storage limit missing");
console.log("Project structure, syntax, persistence selectors, calendar, and auto-sync checks OK");
