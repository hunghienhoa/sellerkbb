const APP_HTML = __APP_HTML__;
const BRAND_MASCOT_B64 = __BRAND_MASCOT_B64__;
const NEW_UI_PREVIEW_CSS = __NEW_UI_PREVIEW_CSS__;

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const TIKTOK_API_HOST = "https://open-api.tiktokglobalshop.com";
const TIKTOK_TOKEN_HOST = "https://auth.tiktok-shops.com";
const MAINTENANCE_SETTINGS_KEY = "maintenance:settings";
const MAINTENANCE_LAST_RUN_KEY = "maintenance:last_run";
const AUTO_SYNC_DATA_KEY = "autosync:rolling";
const AUTO_SYNC_STATUS_KEY = "autosync:status";
const MANUAL_SYNC_JOB_KEY = "autosync:manual_job";
// Cron resumes checkpoints hourly; a one-hour expiry races with normal cron jitter.
const MANUAL_SYNC_MAX_RUNNING_MS = 4 * 60 * 60 * 1000;
const MANUAL_SYNC_DAYS = 30;
const MANUAL_SYNC_WINDOW_DAYS = 30;
const MANUAL_AFFILIATE_BATCH_SIZE = 8;
const MANUAL_SYNC_LEASE_MS = 150000;
const GITHUB_REPO_CACHE_KEY = "maintenance:github_repo";
const LIVE_RECONCILE_CACHE_PREFIX = "reconcile:live:";
const LIVE_RECONCILE_CACHE_TTL_SECONDS = 600;
const RECONCILIATION_PROTECTION_DAYS = 60;
const KPI_RECONCILE_HOURLY_MAX_SESSIONS = 6;
const KPI_RECONCILE_DAILY_MAX_SESSIONS = 18;
const KPI_RECONCILE_HOURLY_LOOKBACK_SECONDS = 30 * 86400;
const KPI_RECONCILE_DAILY_LOOKBACK_SECONDS = 30 * 86400;
const MAX_ORDER_SEARCH_PAGES = 200;
const REQUIRED_TIKTOK_SCOPES = ["data.shop_analytics.public.read", "seller.order.info", "seller.return_refund.basic"];
const REQUIRED_CREATOR_SCOPES = ["creator.data.live.read.public", "creator.affiliate.info"];
const CREATOR_TOKEN_PREFIX = "creator_token:";
const CREATOR_OAUTH_STATE_PREFIX = "creator_oauth_state:";
const CREATOR_AUTH_URL = "https://shop.tiktok.com/alliance/creator/auth";
const DEFAULT_MAINTENANCE = {
  retentionDays: 180,
  autoCleanup: true,
  emergencyPercent: 85,
  firestoreSoftLimitMb: 600,
  firestoreMaxSessions: 12000,
  kvSoftKeyLimit: 5000
};

function normalizeMaintenance(input = {}) {
  const n = { ...DEFAULT_MAINTENANCE, ...(input || {}) };
  n.retentionDays = Math.min(180, Math.max(RECONCILIATION_PROTECTION_DAYS, Number(n.retentionDays) || 180));
  n.autoCleanup = n.autoCleanup !== false;
  n.emergencyPercent = Math.min(95, Math.max(70, Number(n.emergencyPercent) || 85));
  n.firestoreSoftLimitMb = Math.min(900, Math.max(100, Number(n.firestoreSoftLimitMb) || 600));
  n.firestoreMaxSessions = Math.min(50000, Math.max(500, Number(n.firestoreMaxSessions) || 12000));
  n.kvSoftKeyLimit = Math.min(50000, Math.max(100, Number(n.kvSoftKeyLimit) || 5000));
  return n;
}

async function getMaintenanceSettings(env) {
  if (!env.TIKTOK_KV) return { ...DEFAULT_MAINTENANCE };
  const raw = await env.TIKTOK_KV.get(MAINTENANCE_SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_MAINTENANCE };
  try { return normalizeMaintenance(JSON.parse(raw)); } catch { return { ...DEFAULT_MAINTENANCE }; }
}

async function listAllKvKeys(env) {
  if (!env.TIKTOK_KV) return [];
  const keys = [];
  let cursor;
  do {
    const page = await env.TIKTOK_KV.list(cursor ? { cursor, limit: 1000 } : { limit: 1000 });
    keys.push(...(page.keys || []));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor && keys.length < 50000);
  return keys;
}

function isProtectedKvKey(name) {
  return name === "seller_token"
    || name.startsWith(CREATOR_TOKEN_PREFIX)
    || name === MAINTENANCE_SETTINGS_KEY
    || name === AUTO_SYNC_DATA_KEY
    || name === AUTO_SYNC_STATUS_KEY
    || name === MANUAL_SYNC_JOB_KEY
    || name === GITHUB_REPO_CACHE_KEY;
}

function isExpendableKvKey(name) {
  return name.startsWith("oauth_state:")
    || name.startsWith(CREATOR_OAUTH_STATE_PREFIX)
    || name.startsWith("cache:")
    || name.startsWith("maintenance_log:")
    || name.startsWith(LIVE_RECONCILE_CACHE_PREFIX)
    || name === MAINTENANCE_LAST_RUN_KEY;
}

async function measureKvStorage(env, keys = []) {
  if (!env.TIKTOK_KV) return { usedBytes: 0, measuredKeys: 0, totalKeys: 0, complete: true };
  const maxMeasure = 50;
  const selected = keys.slice(0, maxMeasure);
  const encoder = new TextEncoder();
  let usedBytes = 0;
  for (const key of selected) {
    try {
      const value = await env.TIKTOK_KV.get(key.name);
      usedBytes += encoder.encode(String(key.name || "")).byteLength;
      if (value != null) usedBytes += encoder.encode(value).byteLength;
    } catch {}
  }
  return { usedBytes, measuredKeys: selected.length, totalKeys: keys.length, complete: keys.length <= maxMeasure };
}

async function getGithubRepoStorage(env) {
  const limitBytes = 10 * 1000 * 1000 * 1000;
  const fallback = { usedBytes: 0, limitBytes, recommended: true, available: false, source: "github_api" };
  let cached = null;
  if (env.TIKTOK_KV) {
    try {
      const raw = await env.TIKTOK_KV.get(GITHUB_REPO_CACHE_KEY);
      cached = raw ? JSON.parse(raw) : null;
      if (cached?.fetchedAt && Date.now() - new Date(cached.fetchedAt).getTime() < 21600000) {
        return { ...fallback, ...cached, limitBytes, available: true };
      }
    } catch {}
  }
  try {
    const res = await fetch("https://api.github.com/repos/hunghienhoa/sellerkbb", {
      headers: {
        "accept": "application/vnd.github+json",
        "user-agent": "SellerKBB-Storage-Monitor/1.0"
      }
    });
    if (!res.ok) throw new Error("github_http_" + res.status);
    const data = await res.json();
    const result = {
      usedBytes: Math.max(0, Number(data.size || 0)) * 1024,
      limitBytes,
      recommended: true,
      available: true,
      source: "github_api",
      fetchedAt: new Date().toISOString()
    };
    if (env.TIKTOK_KV) {
      await env.TIKTOK_KV.put(GITHUB_REPO_CACHE_KEY, JSON.stringify(result), { expirationTtl: 86400 });
    }
    return result;
  } catch {
    return cached ? { ...fallback, ...cached, limitBytes, available: true } : fallback;
  }
}

async function runKvMaintenance(env, reason = "scheduled") {
  const settings = await getMaintenanceSettings(env);
  if (!env.TIKTOK_KV) return { ok: true, skipped: "kv_not_bound", settings };
  const keys = await listAllKvKeys(env);
  const threshold = Math.floor(settings.kvSoftKeyLimit * settings.emergencyPercent / 100);
  const target = Math.floor(settings.kvSoftKeyLimit * 0.70);
  let deleted = 0;
  if (settings.autoCleanup && keys.length >= threshold) {
    const expendable = keys.filter(k => !isProtectedKvKey(k.name) && isExpendableKvKey(k.name));
    for (const k of expendable) {
      if (keys.length - deleted <= target) break;
      await env.TIKTOK_KV.delete(k.name);
      deleted++;
    }
  }
  const storage = await measureKvStorage(env, keys);
  const status = { ok: true, reason, ranAt: new Date().toISOString(), keyCount: keys.length, deleted, storage, settings };
  await env.TIKTOK_KV.put(MAINTENANCE_LAST_RUN_KEY, JSON.stringify(status), { expirationTtl: 2592000 });
  return status;
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      "permissions-policy": "camera=(), microphone=(), geolocation=()"
    }
  });
}

function publicConfig(env) {
  const firebase = {
    apiKey: env.FIREBASE_API_KEY || "",
    authDomain: env.FIREBASE_AUTH_DOMAIN || "",
    projectId: env.FIREBASE_PROJECT_ID || "",
    storageBucket: env.FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID || "",
    appId: env.FIREBASE_APP_ID || ""
  };
  return {
    version: env.APP_VERSION || "1.0.0",
    firebase,
    firebaseConfigured: Boolean(firebase.apiKey && firebase.authDomain && firebase.projectId && firebase.storageBucket && firebase.messagingSenderId && firebase.appId),
    tiktokConfigured: Boolean(env.TIKTOK_APP_KEY && env.TIKTOK_APP_SECRET && env.TIKTOK_SERVICE_ID && env.TIKTOK_SELLER_AUTH_URL && env.TIKTOK_KV),
    tiktokCreatorConfigured: Boolean(env.TIKTOK_APP_KEY && env.TIKTOK_APP_SECRET && env.TIKTOK_KV)
  };
}

function normalizeScopes(raw) {
  if (Array.isArray(raw)) return [...new Set(raw.map(x => String(x || "").trim()).filter(Boolean))];
  if (typeof raw === "string") return [...new Set(raw.split(/[\s,]+/).map(x => x.trim()).filter(Boolean))];
  return [];
}

function bearer(request) {
  const auth = request.headers.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

function base64UrlDecode(input) {
  input = input.replace(/-/g, "+").replace(/_/g, "/");
  while (input.length % 4) input += "=";
  return atob(input);
}

function decodeJwtPayload(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    return null;
  }
}

function firestoreValueToJs(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(firestoreValueToJs);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, val]) => [k, firestoreValueToJs(val)]));
  if ("nullValue" in v) return null;
  return null;
}

async function getCallerUser(request, env) {
  const token = bearer(request);
  if (!token) throw new Response(JSON.stringify({ error: "missing_auth" }), { status: 401, headers: JSON_HEADERS });
  const payload = decodeJwtPayload(token);
  const uid = payload?.sub || payload?.user_id;
  if (!uid || !env.FIREBASE_PROJECT_ID) throw new Response(JSON.stringify({ error: "invalid_auth" }), { status: 401, headers: JSON_HEADERS });

  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents/users/${encodeURIComponent(uid)}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Response(JSON.stringify({ error: "auth_check_failed", detail: await res.text() }), { status: 401, headers: JSON_HEADERS });
  const doc = await res.json();
  const user = Object.fromEntries(Object.entries(doc.fields || {}).map(([k, val]) => [k, firestoreValueToJs(val)]));
  return { uid, token, user };
}

async function requireAdmin(request, env) {
  const caller = await getCallerUser(request, env);
  if (caller.user?.role !== "admin" || caller.user?.status !== "approved") {
    throw new Response(JSON.stringify({ error: "admin_required" }), { status: 403, headers: JSON_HEADERS });
  }
  return caller;
}

async function requireReportAccess(request, env) {
  const caller = await getCallerUser(request, env);
  const permissions = Array.isArray(caller.user?.permissions) ? caller.user.permissions : [];
  const allowed = caller.user?.status === "approved" && (
    caller.user?.role === "admin" ||
    permissions.includes("live.read") ||
    permissions.includes("kpi.read")
  );
  if (!allowed) {
    throw new Response(JSON.stringify({ error: "report_access_required" }), { status: 403, headers: JSON_HEADERS });
  }
  return caller;
}

async function hmacHex(secret, text) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(text));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function signTikTok(path, params, body, appSecret, contentType = "application/json") {
  const entries = Object.entries(params)
    .filter(([k]) => k !== "sign" && k !== "access_token")
    .sort(([a], [b]) => a.localeCompare(b));
  let base = path + entries.map(([k, v]) => `${k}${v}`).join("");
  if (!contentType.toLowerCase().startsWith("multipart/form-data") && body) base += body;
  return hmacHex(appSecret, appSecret + base + appSecret);
}

async function tiktokCall(env, token, path, query = {}, method = "GET", bodyObj = null) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const params = { app_key: env.TIKTOK_APP_KEY, timestamp, ...query };
  const body = bodyObj ? JSON.stringify(bodyObj) : "";
  params.sign = await signTikTok(path, params, body, env.TIKTOK_APP_SECRET);
  const url = new URL(TIKTOK_API_HOST + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      "x-tts-access-token": token
    },
    body: body || undefined
  });
  let payload;
  try { payload = await res.json(); } catch { payload = { code: -1, message: await res.text() }; }
  return { httpStatus: res.status, payload };
}

async function exchangeTikTokAuthCode(env, authCode) {
  const url = new URL(TIKTOK_TOKEN_HOST + "/api/v2/token/get");
  url.searchParams.set("app_key", env.TIKTOK_APP_KEY);
  url.searchParams.set("app_secret", env.TIKTOK_APP_SECRET);
  url.searchParams.set("auth_code", authCode);
  url.searchParams.set("grant_type", "authorized_code");
  const res = await fetch(url);
  const payload = await res.json();
  if (payload.code !== 0 || !payload.data?.access_token) {
    throw new Error(payload.message || "TikTok token exchange failed");
  }
  return payload.data;
}

async function getCreatorProfile(env, accessToken) {
  const result = await tiktokCall(env, accessToken, "/affiliate_creator/202405/profiles");
  if (result.payload?.code !== 0 || !result.payload?.data?.creator_user_id) {
    throw new Error(result.payload?.message || "Không lấy được Creator Profile");
  }
  return result.payload.data;
}

async function getStoredCreatorToken(env, channel) {
  if (!env.TIKTOK_KV) return null;
  const key = creatorTokenKey(channel);
  if (!key) return null;
  const raw = await env.TIKTOK_KV.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function refreshCreatorToken(env, channel, current, reason = "expiry") {
  const key = creatorTokenKey(channel);
  if (!key) throw new Error("Kênh Creator không hợp lệ");
  if (!current?.refresh_token) throw new Error("Creator chưa có Refresh Token. Hãy ủy quyền lại tài khoản.");
  const url = new URL(TIKTOK_TOKEN_HOST + "/api/v2/token/refresh");
  url.searchParams.set("app_key", env.TIKTOK_APP_KEY);
  url.searchParams.set("app_secret", env.TIKTOK_APP_SECRET);
  url.searchParams.set("refresh_token", current.refresh_token);
  url.searchParams.set("grant_type", "refresh_token");
  const res = await fetch(url);
  const payload = await res.json();
  if (payload.code !== 0 || !payload.data?.access_token) throw new Error(payload.message || "Creator token refresh failed");
  if (Number(payload.data?.user_type) !== 1) throw new Error("Creator refresh token trả về user_type không hợp lệ");
  if (current?.open_id && payload.data?.open_id && String(current.open_id) !== String(payload.data.open_id)) {
    throw new Error("Creator refresh token trả về open_id khác tài khoản đã kết nối");
  }
  const nextScopes = normalizeScopes(payload.data?.granted_scopes || payload.data?.scope || payload.data?.scopes || current?.granted_scopes || []);
  const missing = REQUIRED_CREATOR_SCOPES.filter(scope => !nextScopes.includes(scope));
  if (missing.length) throw new Error("Creator token thiếu scope: " + missing.join(", "));
  const next = {
    ...current,
    ...payload.data,
    refresh_token: payload.data?.refresh_token || current.refresh_token,
    channel: normalizeCreatorChannel(channel),
    refreshed_at: Date.now(),
    refresh_reason: reason,
    refresh_error: ""
  };
  await env.TIKTOK_KV.put(key, JSON.stringify(next));
  return next;
}

async function refreshCreatorTokenIfNeeded(env, channel, thresholdSeconds = 3600, reason = "proactive") {
  const current = await getStoredCreatorToken(env, channel);
  if (!current?.access_token) return { token: current, connected: false, refreshed: false, error: "" };
  const expireAt = tokenExpirySeconds(current);
  const now = Math.floor(Date.now() / 1000);
  if (!expireAt || expireAt > now + Math.max(0, Number(thresholdSeconds) || 0)) {
    return { token: current, connected: true, refreshed: false, error: "" };
  }
  try {
    const next = await refreshCreatorToken(env, channel, current, reason);
    return { token: next, connected: true, refreshed: true, error: "" };
  } catch (error) {
    const message = String(error?.message || error);
    if (env.TIKTOK_KV) {
      const key = creatorTokenKey(channel);
      if (key) await env.TIKTOK_KV.put(key, JSON.stringify({ ...current, refresh_error: message, refresh_failed_at: Date.now() }));
    }
    return { token: current, connected: true, refreshed: false, error: message };
  }
}

async function getCreatorToken(env, channel) {
  const result = await refreshCreatorTokenIfNeeded(env, channel, 3600, "api_request");
  return result.token;
}

async function refreshAllCreatorTokens(env, thresholdSeconds = 3600, reason = "scheduled") {
  const results = [];
  for (const channel of SELLERKBB_ALLOWED_LIVE_CHANNELS) {
    const current = await getStoredCreatorToken(env, channel);
    if (!current?.access_token) {
      results.push({ channel, connected: false, refreshed: false, hasRefreshToken: false, error: "" });
      continue;
    }
    const result = await refreshCreatorTokenIfNeeded(env, channel, thresholdSeconds, reason);
    results.push({
      channel,
      connected: true,
      refreshed: result.refreshed === true,
      hasRefreshToken: Boolean(result.token?.refresh_token),
      accessTokenExpiresAt: tokenExpirySeconds(result.token) || null,
      refreshTokenExpiresAt: refreshTokenExpirySeconds(result.token) || null,
      error: result.error || ""
    });
  }
  return results;
}

async function refreshTikTokToken(env, current, reason = "expiry") {
  if (!current?.refresh_token) return current;
  const url = new URL(TIKTOK_TOKEN_HOST + "/api/v2/token/refresh");
  url.searchParams.set("app_key", env.TIKTOK_APP_KEY);
  url.searchParams.set("app_secret", env.TIKTOK_APP_SECRET);
  url.searchParams.set("refresh_token", current.refresh_token);
  url.searchParams.set("grant_type", "refresh_token");
  const res = await fetch(url);
  const payload = await res.json();
  if (payload.code !== 0 || !payload.data?.access_token) throw new Error(payload.message || "TikTok token refresh failed");
  const next = { ...current, ...payload.data, refreshed_at: Date.now(), refresh_reason: reason };
  await env.TIKTOK_KV.put("seller_token", JSON.stringify(next));
  return next;
}

function tokenExpirySeconds(token) {
  const raw = Number(token?.access_token_expire_in || token?.access_token_expire_at || 0);
  if (!raw) return 0;
  // TikTok Shop currently returns Unix epoch seconds. Keep a compatibility fallback
  // if a future response ever returns a relative duration instead.
  return raw > 1000000000 ? raw : Math.floor(Date.now() / 1000) + raw;
}

function refreshTokenExpirySeconds(token) {
  const raw = Number(token?.refresh_token_expire_in || token?.refresh_token_expire_at || 0);
  if (!raw) return 0;
  return raw > 1000000000 ? raw : Math.floor(Date.now() / 1000) + raw;
}

async function getStoredTikTokToken(env) {
  if (!env.TIKTOK_KV) return null;
  const raw = await env.TIKTOK_KV.get("seller_token");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function refreshTikTokTokenIfNeeded(env, thresholdSeconds = 3600, reason = "proactive") {
  const token = await getStoredTikTokToken(env);
  if (!token?.access_token) return { token, refreshed: false, connected: false };
  const expireAt = tokenExpirySeconds(token);
  const now = Math.floor(Date.now() / 1000);
  if (expireAt && expireAt <= now + thresholdSeconds) {
    const next = await refreshTikTokToken(env, token, reason);
    return { token: next, refreshed: true, connected: true };
  }
  return { token, refreshed: false, connected: true };
}

async function getTikTokToken(env) {
  try {
    const result = await refreshTikTokTokenIfNeeded(env, 3600, "api_request");
    return result.token;
  } catch {
    return await getStoredTikTokToken(env);
  }
}

async function getAuthorizedShops(env, accessToken) {
  const result = await tiktokCall(env, accessToken, "/authorization/202309/shops");
  if (result.payload?.code !== 0) throw new Error(result.payload?.message || "Không lấy được danh sách shop TikTok");
  return result.payload?.data?.shops || [];
}

const LIVE_TIMESTAMP_MIN_SECONDS = 1577836800; // 01/01/2020 UTC
const LIVE_TIMESTAMP_FUTURE_SKEW_SECONDS = 6 * 3600;

function validLiveStartSeconds(value, nowSeconds = Math.floor(Date.now() / 1000)) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n >= LIVE_TIMESTAMP_MIN_SECONDS && n <= nowSeconds + LIVE_TIMESTAMP_FUTURE_SKEW_SECONDS;
}

function validLiveEndSeconds(value, startSeconds, nowSeconds = Math.floor(Date.now() / 1000)) {
  const end = Number(value || 0);
  const start = Number(startSeconds || 0);
  return validLiveStartSeconds(start, nowSeconds)
    && Number.isFinite(end)
    && end >= start
    && end <= nowSeconds + LIVE_TIMESTAMP_FUTURE_SKEW_SECONDS;
}

function normalizeLiveSession(s, shop, requestedAccountType = "") {
  const rawStart = Number(s.start_time || 0);
  const rawEnd = Number(s.end_time || 0);
  const start = validLiveStartSeconds(rawStart) ? rawStart : 0;
  const end = validLiveEndSeconds(rawEnd, start) ? rawEnd : 0;
  const sales = s.sales_performance || {};
  const gmv = sales.gmv || {};
  return {
    liveId: String(s.id || ""),
    title: s.title || "Phiên LIVE",
    channelUsername: s.username || "",
    channelId: String(s.creator_id || s.account_id || s.user_id || ""),
    accountType: s.account_type || requestedAccountType || "",
    shopCipher: shop?.cipher || "",
    shopId: String(shop?.id || ""),
    shopName: shop?.name || "",
    startTimeSeconds: start,
    endTimeSeconds: end,
    durationSeconds: end ? Math.max(0, end - start) : 0,
    dataComplete: Boolean(start && end),
    syncState: !start ? "invalid_start_time" : (end ? "complete" : "pending_end_time"),
    gmvAmount: String(gmv.amount || "0"),
    sellerGmvAmount: String(gmv.amount || "0"),
    gmvSource: "seller_shop_lives_202509",
    creatorGmvAvailable: false,
    currency: gmv.currency || "VND",
    itemsSold: Number(sales.items_sold || 0),
    skuOrders: Number(sales.sku_orders || 0),
    customers: Number(sales.customers || 0),
    raw: {
      productsAdded: Number(sales.products_added || 0),
      differentProductsSold: Number(sales.different_products_sold || 0),
      createdSkuOrders: Number(sales.created_sku_orders || 0),
      live24hGmv: sales["24h_live_gmv"] || null,
      rawStartTimeSeconds: rawStart,
      rawEndTimeSeconds: rawEnd
    }
  };
}

function sanitizeStoredLiveSession(item) {
  if (!item || typeof item !== "object") return null;
  const rawStart = Number(item.startTimeSeconds || 0);
  const rawEnd = Number(item.endTimeSeconds || 0);
  const start = validLiveStartSeconds(rawStart) ? rawStart : 0;
  const end = validLiveEndSeconds(rawEnd, start) ? rawEnd : 0;
  const legacyAffiliate=item.affiliateDataAvailable===true &&
    String(item.affiliateSource||"").includes("minus_seller_products_202512");
  return {
    ...item,
    // Old cross-attribution subtraction is not a verified room-level Affiliate
    // result. Keep its stored amount for audit; require new product-ID review.
    affiliateNeedsRefresh:legacyAffiliate || item.affiliateNeedsRefresh===true,
    affiliateLegacyNeedsReview:legacyAffiliate,
    startTimeSeconds: start,
    endTimeSeconds: end,
    durationSeconds: end ? Math.max(0, end - start) : 0,
    dataComplete: Boolean(start && end),
    syncState: !start ? "invalid_start_time" : (end ? "complete" : "pending_end_time")
  };
}

function mergeLiveSessionSnapshots(previous = {}, incoming = {}) {
  const prev = sanitizeStoredLiveSession(previous) || {};
  const next = sanitizeStoredLiveSession(incoming) || {};
  const prevComplete = prev.dataComplete === true;
  const nextComplete = next.dataComplete === true;
  const nextStartValid = validLiveStartSeconds(next.startTimeSeconds);
  const prevStartValid = validLiveStartSeconds(prev.startTimeSeconds);
  const startTimeSeconds = nextStartValid ? Number(next.startTimeSeconds) : (prevStartValid ? Number(prev.startTimeSeconds) : 0);
  const preserveCompletedSnapshot = prevComplete && !nextComplete;
  const endTimeSeconds = preserveCompletedSnapshot
    ? Number(prev.endTimeSeconds || 0)
    : (validLiveEndSeconds(next.endTimeSeconds, startTimeSeconds) ? Number(next.endTimeSeconds) : 0);
  const dataComplete = Boolean(startTimeSeconds && endTimeSeconds);
  const merged = {
    ...prev,
    ...next,
    startTimeSeconds,
    endTimeSeconds,
    durationSeconds: dataComplete ? Math.max(0, endTimeSeconds - startTimeSeconds) : 0,
    dataComplete,
    syncState: !startTimeSeconds ? "invalid_start_time" : (dataComplete ? "complete" : "pending_end_time")
  };
  // Do not replace a previously verified creator LIVE GMV with a seller-only snapshot.
  if (prev.creatorGmvAvailable === true && next.creatorGmvAvailable !== true) {
    merged.gmvAmount = prev.gmvAmount;
    merged.creatorGmvAmount = prev.creatorGmvAmount;
    merged.creatorGmvAvailable = true;
    merged.gmvSource = prev.gmvSource;
    merged.creatorGmvUpdatedAt = prev.creatorGmvUpdatedAt;
    merged.sellerGmvAmount = next.sellerGmvAmount ?? prev.sellerGmvAmount;
    merged.affiliateDataAvailable = prev.affiliateDataAvailable === true;
    if (prev.affiliateDataAvailable === true) {
      merged.shopProductGmvAmount = prev.shopProductGmvAmount;
      merged.affiliateGmvAmount = prev.affiliateGmvAmount;
      merged.affiliateSource = prev.affiliateSource;
    }
  }
  // Verified Affiliate figures are durable. A failed/partial fresh API response
  // must not turn an already verified historical LIVE back into "unavailable".
  if (prev.affiliateDataAvailable === true && prev.creatorGmvAvailable === true &&
      next.affiliateDataAvailable !== true) {
    for (const field of [
      "affiliateDataAvailable", "affiliateDataConsistent", "shopProductGmvAmount",
      "affiliateGmvAmount", "shopProductItemsSold", "affiliateItemsSold",
      "affiliateSkuOrders", "shopProductSkuOrders", "shopProductMainOrders",
      "affiliateSource", "affiliateUpdatedAt", "affiliateProducts",
      "affiliateCommissionAvailable", "affiliateCommissionAmount"
    ]) {
      if (prev[field] !== undefined) merged[field] = prev[field];
    }
    merged.affiliateNeedsRefresh = prev.affiliateNeedsRefresh===true ||
      (next.creatorGmvAvailable === true &&
      moneyNumber(next.gmvAmount) !== moneyNumber(prev.gmvAmount));
  } else if (next.affiliateDataAvailable === true) {
    merged.affiliateNeedsRefresh = false;
  }
  if (preserveCompletedSnapshot) {
    merged.gmvAmount = prev.gmvAmount;
    merged.currency = prev.currency || next.currency || "VND";
    merged.itemsSold = prev.itemsSold;
    merged.skuOrders = prev.skuOrders;
    merged.customers = prev.customers;
  }
  merged.reconciliation = previous?.reconciliation || incoming?.reconciliation || null;
  // A changed LIVE GMV makes the previously finalized KPI basis stale.
  if (prevComplete && dataComplete && moneyNumber(prev.gmvAmount) !== moneyNumber(merged.gmvAmount)) {
    merged.reconciliation = null;
  }
  return merged;
}

function moneyNumber(value) {
  const n = Number(String(value ?? "0").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function moneyObjectNumber(value) {
  if (value && typeof value === "object" && "amount" in value) return moneyNumber(value.amount);
  return moneyNumber(value);
}

function liveProductSalesGmv(sales = {}) {
  // The v202512 shop product endpoint documents direct_gmv; do not mix attributed GMV.
  const totals = [
    sales.direct_gmv,
    sales.gmv,
    sales.total_gmv,
    sales.live_attributed_gmv,
    sales.gross_merchandise_value
  ];
  for (const value of totals) {
    const n = moneyObjectNumber(value);
    if (n > 0) return n;
  }
  const direct = moneyObjectNumber(sales.direct_gmv);
  const indirect = moneyObjectNumber(sales.indirect_gmv);
  if (direct > 0 || indirect > 0) return Math.max(0, direct + indirect);
  return 0;
}

async function fetchCreatorLiveCoreStats(env, session) {
  const channel = sellerKbbChannelKey(session);
  if (!SELLERKBB_ALLOWED_LIVE_CHANNELS.has(channel) || !session?.liveId) {
    return { creatorGmvAvailable: false, creatorGmvError: "invalid_creator_channel_or_room" };
  }
  const token = await getCreatorToken(env, channel);
  if (!token?.access_token) return { creatorGmvAvailable: false, creatorGmvError: "creator_token_missing" };
  const path = `/analytics/202502/live_rooms/${encodeURIComponent(String(session.liveId))}/core_stats`;
  const result = await tiktokCall(env, token.access_token, path);
  const stats = result.payload?.data?.stats;
  const localGmv = stats?.local_gmv;
  const rawAmount = localGmv?.amount;
  if (result.payload?.code !== 0 || rawAmount === undefined || rawAmount === null || rawAmount === "" ||
      !Number.isFinite(Number(rawAmount)) || Number(rawAmount) < 0) {
    return {
      creatorGmvAvailable: false,
      creatorGmvError: String(result.payload?.message || "Creator LIVE Core Stats không có GMV hợp lệ"),
      creatorGmvErrorCode: Number(result.payload?.code || 0)
    };
  }
  const currency = String(localGmv?.currency || session.currency || "VND");
  if (session.currency && currency !== session.currency) {
    return { creatorGmvAvailable: false, creatorGmvError: "creator_currency_mismatch" };
  }
  const amount = moneyNumber(rawAmount);
  return {
    creatorGmvAvailable: true,
    creatorGmvAmount: amount,
    creatorGmvError: "",
    creatorGmvUpdatedAt: new Date().toISOString(),
    gmvSource: "creator_live_core_stats_202502",
    gmvAmount: String(rawAmount),
    sellerGmvAmount: session.sellerGmvAmount ?? session.gmvAmount,
    creatorItemsSold: Number(stats?.sales || 0),
    creatorCreatedOrders: Number(stats?.created_order_count || 0),
    creatorPaidOrders: Number(stats?.paid_order_count || 0)
  };
}

async function fetchLiveShopProductBreakdown(env, accessToken, session) {
  const liveId = String(session?.liveId || "");
  // Never fetch Affiliate product data for channels outside SellerKBB allowlist.
  if (!isAllowedSellerKbbLiveChannel(session)) return { affiliateDataAvailable: false, affiliateError: "channel_not_allowed" };
  const shopCipher = String(session?.shopCipher || "");
  const totalGmv = moneyNumber(session?.gmvAmount);
  if (session?.creatorGmvAvailable !== true) {
    return { affiliateDataAvailable: false, affiliateError: "creator_live_gmv_not_verified" };
  }
  if (!liveId || !shopCipher) {
    return { affiliateDataAvailable: false, affiliateError: "missing_live_or_shop" };
  }
  const path = `/analytics/202512/shop/${encodeURIComponent(liveId)}/products_performance`;
  const query = {
    shop_cipher: shopCipher,
    sort_order: "DESC",
    sort_field: "gmv",
    currency: "LOCAL"
  };
  const result = await tiktokCall(env, accessToken, path, query);
  if (result.payload?.code === 105002) {
    const refreshed = await refreshTikTokToken(env, await getTikTokToken(env));
    if (refreshed?.access_token && refreshed.access_token !== accessToken) {
      return fetchLiveShopProductBreakdown(env, refreshed.access_token, session);
    }
  }
  if (result.payload?.code !== 0) {
    return {
      affiliateDataAvailable: false,
      affiliateError: String(result.payload?.message || "LIVE products performance unavailable")
    };
  }

  if(!Array.isArray(result.payload?.data?.products))
    return {shopProductSourceAvailable:false,affiliateError:"seller_shop_products_missing"};
  const products=result.payload.data.products;
  let shopProductGmvAmount = 0;
  let shopProductItemsSold = 0;
  let shopProductSkuOrders = 0;
  let shopProductMainOrders = 0;
  const normalizedProducts = products.map(product => {
    const sales = product?.sales || {};
    const gmvAmount = liveProductSalesGmv(sales);
    const itemsSold = Number(sales.items_sold || 0);
    const skuOrders = Number(sales.sku_orders || sales.created_sku_orders || 0);
    const mainOrders = Number(sales.main_orders || 0);
    shopProductGmvAmount += gmvAmount;
    shopProductItemsSold += itemsSold;
    shopProductSkuOrders += skuOrders;
    shopProductMainOrders += mainOrders;
    return {
      id: String(product?.id || ""),
      name: String(product?.name || ""),
      gmvAmount,
      itemsSold,
      skuOrders,
      mainOrders
    };
  });

  // Seller last-click amounts cannot be subtracted from Creator room GMV.
  // Return only seller-owned product IDs for same-room product classification.
  return {shopProductSourceAvailable:true,
    shopProductGmvAmount:Math.max(0,shopProductGmvAmount),
    shopProducts:normalizedProducts};
}

// Unlike seller last-click GMV, product_stats shares Creator LIVE room
// attribution with core_stats. Classify by stable IDs, not by subtraction
// across incompatible TikTok metrics.
async function fetchCreatorLiveProductStats(env,session){
  if(!isAllowedSellerKbbLiveChannel(session)||!session?.liveId)return {ok:false,error:"channel_not_allowed"};
  const token=await getCreatorToken(env,sellerKbbChannelKey(session));
  if(!token?.access_token)return {ok:false,error:"creator_token_missing"};
  const path=`/analytics/202502/live_rooms/${encodeURIComponent(String(session.liveId))}/product_stats`;
  const result=await tiktokCall(env,token.access_token,path);
  if(result.payload?.code!==0)return {ok:false,error:"creator_product_stats_"+String(result.payload?.code||"error")};
  const list=result.payload?.data?.product_stats;
  if(!Array.isArray(list))return {ok:false,error:"creator_product_stats_missing"};
  const currency=String(session.currency||"VND"),seen=new Set(),products=[];
  for(const row of list){
    const id=String(row?.product_id||"").trim(),raw=row?.local_gmv?.amount,n=Number(raw);
    if(!id||seen.has(id)||raw===undefined||raw===null||raw===""||
      !Number.isFinite(n)||n<0||String(row?.local_gmv?.currency||currency)!==currency)
      return {ok:false,error:"creator_product_stats_invalid_or_currency_mismatch"};
    seen.add(id);
    products.push({id,gmvAmount:n,itemsSold:Math.max(0,Number(row.inventory_consumption_count||0)),
      skuOrders:Math.max(0,Number(row.paid_order_count||0))});
  }
  return {ok:true,products};
}

function reconcileCreatorLiveProductOwnership(session,creatorData,sellerData){
  const fail=(affiliateError)=>({affiliateDataAvailable:false,affiliateError});
  if(!isAllowedSellerKbbLiveChannel(session))return fail("channel_not_allowed");
  if(session.creatorGmvAvailable!==true)return fail("creator_live_gmv_not_verified");
  if(!creatorData?.ok)return fail(creatorData?.error||"creator_product_stats_unavailable");
  if(sellerData?.shopProductSourceAvailable!==true)
    return fail(sellerData?.affiliateError||"seller_shop_products_unavailable");
  const creator=creatorData.products||[],seller=sellerData.shopProducts||[];
  if(seller.some(x=>!String(x.id||"")))return fail("seller_product_id_missing");
  const ownIds=new Set(seller.map(x=>String(x.id)));
  const core=moneyNumber(session.creatorGmvAmount),total=creator.reduce((n,x)=>n+x.gmvAmount,0);
  if(Math.abs(total-core)>Math.max(1,core*0.005))
    return {...fail("creator_room_product_gmv_mismatch"),creatorProductStatsTotal:total};
  // A shop with positive seller GMV and NO own product ID matching the room
  // cannot prove every unmatched Creator product belongs to another shop.
  const own=creator.filter(x=>ownIds.has(x.id));
  if(moneyNumber(session.sellerGmvAmount)>0&&!own.length)
    return fail("own_shop_products_not_identified");
  const affiliate=creator.filter(x=>!ownIds.has(x.id));
  const sum=(xs,k)=>xs.reduce((n,x)=>n+Number(x[k]||0),0);
  return {
    affiliateDataAvailable:true,affiliateDataConsistent:true,affiliateError:"",
    affiliateNeedsRefresh:false,affiliateLegacyNeedsReview:false,
    affiliateSource:"creator_room_product_stats_202502_by_seller_shop_product_ids_202512",
    affiliateUpdatedAt:new Date().toISOString(),creatorProductStatsVerified:true,
    creatorProductStatsCount:creator.length,creatorProductStatsTotal:total,
    ownShopProductIdsCount:ownIds.size,
    shopProductGmvAmount:sum(own,"gmvAmount"),affiliateGmvAmount:sum(affiliate,"gmvAmount"),
    shopProductItemsSold:sum(own,"itemsSold"),affiliateItemsSold:sum(affiliate,"itemsSold"),
    shopProductSkuOrders:sum(own,"skuOrders"),affiliateSkuOrders:sum(affiliate,"skuOrders"),
    affiliateCommissionAvailable:false,affiliateCommissionAmount:null,
    affiliateProducts:affiliate.slice(0,100).map(x=>({
      id:x.id,gmvAmount:x.gmvAmount,itemsSold:x.itemsSold,skuOrders:x.skuOrders}))
  };
}

async function fetchVerifiedLiveAffiliateBreakdown(env,sellerAccessToken,session){
  if(!isAllowedSellerKbbLiveChannel(session))
    return {affiliateDataAvailable:false,affiliateError:"channel_not_allowed"};
  const [creator,seller]=await Promise.all([
    fetchCreatorLiveProductStats(env,session),
    fetchLiveShopProductBreakdown(env,sellerAccessToken,session)
  ]);
  return reconcileCreatorLiveProductOwnership(session,creator,seller);
}

// Diagnostic only: creator-side commission attribution and seller-side last-click
// GMV use different TikTok metric definitions. Their difference must NEVER
// be promoted to verified Affiliate GMV or used as a reconciled KPI value.
function liveAffiliateComparison(session) {
  const creator = Number(session?.creatorGmvAmount);
  const seller = Number(session?.sellerGmvAmount);
  const allowed = isAllowedSellerKbbLiveChannel(session);
  if (!allowed || session?.creatorGmvAvailable !== true || !Number.isFinite(creator) ||
      !Number.isFinite(seller) || creator < 0 || seller <= 0 || creator < seller) {
    return { affiliateEstimateAvailable: false, affiliateEstimateAmount: null };
  }
  return {
    affiliateEstimateAvailable: true,
    affiliateEstimateAmount: Math.max(0, Math.round(creator - seller)),
    affiliateEstimateSource: "creator_minus_seller_different_attribution_unverified"
  };
}

async function enrichLiveAffiliateBreakdowns(env, accessToken, sessions, limit = 12, reason = "hourly") {
  const cutoffSeconds = Math.floor((Date.now() - MANUAL_SYNC_DAYS * 86400000) / 1000);
  const all = (sessions || [])
    .filter(session => session?.liveId && isAllowedSellerKbbLiveChannel(session))
    .filter(session => Number(session.startTimeSeconds || 0) >= cutoffSeconds);
  // Prioritize unresolved and changed-GMV sessions; rotate retries across the
  // whole 30-day cache instead of always retrying the newest failed 12/24.
  const missing = all.filter(s => s.affiliateDataAvailable !== true || s.affiliateNeedsRefresh === true)
    .sort((a, b) => {
      const attempts = Date.parse(a.affiliateCheckedAt || "") || 0;
      const other = Date.parse(b.affiliateCheckedAt || "") || 0;
      return attempts - other || Number(b.startTimeSeconds || 0) - Number(a.startTimeSeconds || 0);
    });
  const verified = all.filter(s => s.affiliateDataAvailable === true && s.affiliateNeedsRefresh !== true)
    .sort((a, b) => (Date.parse(a.affiliateCheckedAt || a.affiliateUpdatedAt || "") || 0) -
      (Date.parse(b.affiliateCheckedAt || b.affiliateUpdatedAt || "") || 0));
  const max = Math.max(1, Number(limit || 12));
  const candidates = [...missing, ...verified].slice(0, max);
  let enriched = 0;
  const errors = [];
  const concurrency = 3;
  for (let i = 0; i < candidates.length; i += concurrency) {
    const batch = candidates.slice(i, i + concurrency);
    const values = await Promise.all(batch.map(async session => {
      try {
        const core = await fetchCreatorLiveCoreStats(env, session);
        if (core.creatorGmvAvailable) {
          const changed = session.affiliateDataAvailable === true &&
            moneyNumber(core.gmvAmount) !== moneyNumber(session.gmvAmount);
          Object.assign(session, core);
          if (changed) session.affiliateNeedsRefresh = true;
        } else session.creatorGmvError = core.creatorGmvError || "creator_live_gmv_not_verified";
        const breakdown = await fetchVerifiedLiveAffiliateBreakdown(env, accessToken, session);
        return { session, breakdown };
      } catch (error) {
        return { session, breakdown: { affiliateDataAvailable: false, affiliateError: String(error?.message || error) } };
      }
    }));
    for (const { session, breakdown } of values) {
      session.affiliateCheckedAt = new Date().toISOString();
      if (breakdown?.affiliateDataAvailable === true) {
        Object.assign(session, breakdown);
        session.affiliateNeedsRefresh = false;
        session.affiliateError = "";
        enriched++;
      } else {
        // A transient API failure or attribution mismatch is not proof that
        // previously verified GMV was zero; retain the last verified snapshot.
        session.affiliateError = String(breakdown?.affiliateError || "affiliate_unverified");
        errors.push({ liveId: String(session.liveId || ""), message: session.affiliateError });
      }
    }
  }
  return {
    checked: candidates.length,
    enriched,
    verified: all.filter(s => s.affiliateDataAvailable === true).length,
    pending: all.filter(s => s.affiliateDataAvailable !== true || s.affiliateNeedsRefresh === true).length,
    total: all.length,
    errors: errors.slice(0, 5)
  };
}

function orderSubtotal(order) {
  const payment = order?.payment || {};
  const candidates = [
    payment.sub_total,
    payment.subtotal,
    payment.original_total_product_price,
    payment.total_product_price,
    payment.total_amount,
    payment.payment
  ];
  for (const value of candidates) {
    const n = moneyNumber(value);
    if (n > 0) return n;
  }
  return 0;
}

function orderCurrency(order, fallback = "VND") {
  return String(order?.payment?.currency || order?.currency || fallback || "VND");
}

function orderDeliveredTime(order) {
  const candidates = [
    order?.delivery_time,
    order?.delivered_time,
    order?.package_delivery_time,
    ...(Array.isArray(order?.packages) ? order.packages.flatMap(p => [p?.delivery_time, p?.delivered_time]) : [])
  ];
  for (const value of candidates) {
    const n = Number(value || 0);
    if (n > 1000000000) return n;
  }
  return 0;
}

function aftersaleRefundTotal(record) {
  const top = moneyNumber(record?.refund_amount?.refund_total);
  if (top > 0) return top;
  return (Array.isArray(record?.return_line_items) ? record.return_line_items : [])
    .reduce((sum, item) => sum + moneyNumber(item?.refund_amount?.refund_total), 0);
}

function aftersaleState(record) {
  const status = String(record?.return_status || "");
  if (!status) return "none";
  if (["RETURN_OR_REFUND_REQUEST_PENDING","AWAITING_BUYER_SHIP","BUYER_SHIPPED_ITEM","REPLACEMENT_REQUEST_PENDING"].includes(status)) return "active";
  if (["RETURN_OR_REFUND_REQUEST_SUCCESS","RETURN_OR_REFUND_REQUEST_COMPLETE","REPLACEMENT_REQUEST_REFUND_SUCCESS","REPLACEMENT_REQUEST_COMPLETE"].includes(status)) return "refunded";
  if (["REFUND_OR_RETURN_REQUEST_REJECT","REJECT_RECEIVE_PACKAGE","RETURN_OR_REFUND_REQUEST_CANCEL","REPLACEMENT_REQUEST_REJECT","REPLACEMENT_REQUEST_CANCEL"].includes(status)) return "closed";
  return "other";
}

async function searchOrdersForLiveWindow(env, accessToken, session) {
  const start = Number(session?.startTimeSeconds || 0);
  const end = Number(session?.endTimeSeconds || 0) || (start + Math.max(1, Number(session?.durationSeconds || 0)));
  if (!start || end <= start) throw new Error("Phiên LIVE chưa có đủ thời gian bắt đầu/kết thúc để đối soát.");
  if (!session?.shopCipher) throw new Error("Phiên LIVE chưa có shop_cipher để đối soát đơn.");

  const found = [];
  const seenOrderIds = new Set();
  const seenPageTokens = new Set();
  let pageToken = "";
  let pages = 0;
  do {
    if (pages >= MAX_ORDER_SEARCH_PAGES) {
      throw new Error("Đơn trong phiên vượt giới hạn quét an toàn " + MAX_ORDER_SEARCH_PAGES + " trang. SellerKBB đã dừng đối soát để không cắt thiếu đơn và không chốt KPI sai.");
    }
    const query = { shop_cipher: session.shopCipher, page_size: 100 };
    if (pageToken) query.page_token = pageToken;
    const result = await tiktokCall(env, accessToken, "/order/202309/orders/search", query, "POST", {
      create_time_ge: start,
      create_time_lt: end + 1
    });
    if (result.payload?.code !== 0) {
      const detail = result.payload?.message || "Không lấy được danh sách đơn";
      throw new Error("TikTok Orders API: " + detail + ". Hãy kiểm tra quyền seller.order.info.");
    }
    pages++;
    const data = result.payload?.data || {};
    for (const order of (Array.isArray(data.orders) ? data.orders : [])) {
      const id = String(order?.id || "");
      if (id && seenOrderIds.has(id)) continue;
      if (id) seenOrderIds.add(id);
      found.push(order);
    }
    const nextPageToken = String(data.next_page_token || "");
    if (nextPageToken && seenPageTokens.has(nextPageToken)) {
      throw new Error("TikTok Orders API trả lại page_token lặp. SellerKBB đã dừng an toàn để tránh vòng lặp và không chốt KPI thiếu dữ liệu.");
    }
    if (nextPageToken) seenPageTokens.add(nextPageToken);
    pageToken = nextPageToken;
  } while (pageToken);
  return found;
}
async function hydrateOrderDetails(env, accessToken, shopCipher, orders) {
  const byId = new Map((orders || []).filter(o => o?.id).map(o => [String(o.id), o]));
  const ids = [...byId.keys()];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const result = await tiktokCall(env, accessToken, "/order/202309/orders", {
      shop_cipher: shopCipher,
      ids: batch.join(",")
    });
    if (result.payload?.code !== 0) continue;
    const detailed = result.payload?.data?.orders || result.payload?.data?.order_list || [];
    for (const order of detailed) {
      if (order?.id) byId.set(String(order.id), { ...(byId.get(String(order.id)) || {}), ...order });
    }
  }
  return [...byId.values()];
}

async function searchReturnsForOrders(env, accessToken, shopCipher, orderIds) {
  const ids = [...new Set((orderIds || []).map(x => String(x || "")).filter(Boolean))];
  if (!ids.length) return { available: true, error: "", records: [] };
  const records = [];
  let pageToken = "";
  do {
    const query = { shop_cipher: shopCipher, page_size: 50 };
    if (pageToken) query.page_token = pageToken;
    const result = await tiktokCall(env, accessToken, "/return_refund/202309/returns/search", query, "POST", {
      order_ids: ids
    });
    if (result.payload?.code !== 0) {
      return { available: false, error: result.payload?.message || "Return & Refund API unavailable", records: [] };
    }
    const data = result.payload?.data || {};
    const pageRecords = data.return_orders || data.returns || [];
    if (Array.isArray(pageRecords)) records.push(...pageRecords);
    pageToken = data.next_page_token || "";
  } while (pageToken && records.length < 5000);
  return { available: true, error: "", records };
}

function normalizeReconcileOrder(order, aftersales, fallbackCurrency, allowTimeWindowKpi = false) {
  const amount = orderSubtotal(order);
  const status = String(order?.status || order?.order_status || "");
  const records = Array.isArray(aftersales?.records) ? aftersales.records : [];
  const active = records.filter(x => aftersaleState(x) === "active");
  const refunded = records.filter(x => aftersaleState(x) === "refunded");
  const refundAmount = refunded.reduce((sum, x) => sum + aftersaleRefundTotal(x), 0);
  const cancelled = status === "CANCELLED";
  const netAmount = cancelled ? 0 : Math.max(0, amount - refundAmount);
  const autoCombineOrderId = String(order?.auto_combine_order_id || "");
  const finalized = cancelled || ((status === "DELIVERED" || status === "COMPLETED") && active.length === 0);
  const deliveredAt = orderDeliveredTime(order);
  return {
    id: String(order?.id || ""),
    createTime: Number(order?.create_time || 0),
    updateTime: Number(order?.update_time || 0),
    deliveredAt,
    status,
    amount,
    currency: orderCurrency(order, fallbackCurrency),
    netAmount,
    finalized,
    autoCombineOrderId,
    attribution: autoCombineOrderId ? "live_signal" : (allowTimeWindowKpi ? "time_window_single_live" : "time_window"),
    aftersalesAvailable: aftersales?.available !== false,
    aftersalesError: aftersales?.error || "",
    aftersales: records.map(x => ({
      id: String(x?.return_id || x?.id || ""),
      type: String(x?.return_type || ""),
      status: String(x?.return_status || ""),
      refundTotal: aftersaleRefundTotal(x),
      updateTime: Number(x?.update_time || 0)
    }))
  };
}

function findOverlappingLiveSessions(session, allSessions = []) {
  const start = Number(session?.startTimeSeconds || 0);
  const end = Number(session?.endTimeSeconds || 0) || (start + Math.max(1, Number(session?.durationSeconds || 0)));
  const shopCipher = String(session?.shopCipher || "");
  const liveId = String(session?.liveId || "");
  if (!start || end <= start || !shopCipher) return [];
  return (Array.isArray(allSessions) ? allSessions : []).filter(other => {
    if (!other || String(other?.liveId || "") === liveId) return false;
    if (String(other?.shopCipher || "") !== shopCipher) return false;
    const otherStart = Number(other?.startTimeSeconds || 0);
    const otherEnd = Number(other?.endTimeSeconds || 0) || (otherStart + Math.max(1, Number(other?.durationSeconds || 0)));
    if (!otherStart || otherEnd <= otherStart) return false;
    return otherStart < end && otherEnd > start;
  });
}
async function buildLiveReconciliationForSession(env, accessToken, session, options = {}) {
  if (!session) throw new Error("Không tìm thấy phiên LIVE trong dữ liệu TikTok đang lưu.");
  const hydrateDetails = options.hydrateDetails !== false;
  const overlappingSessions = findOverlappingLiveSessions(session, options.allSessions || []);
  if (session?.creatorGmvAvailable !== true) {
    try {
      const core = await fetchCreatorLiveCoreStats(env, session);
      if (core.creatorGmvAvailable) Object.assign(session, core);
    } catch {}
  }
  if (session?.affiliateDataAvailable !== true) {
    try {
      const affiliateBreakdown = await fetchVerifiedLiveAffiliateBreakdown(env, accessToken, session);
      if (affiliateBreakdown?.affiliateDataAvailable) Object.assign(session, affiliateBreakdown);
    } catch {}
  }
  const listedOrders = await searchOrdersForLiveWindow(env, accessToken, session);
  const orders = hydrateDetails
    ? await hydrateOrderDetails(env, accessToken, session.shopCipher, listedOrders)
    : listedOrders;

  const aftersalesById = new Map();
  let aftersalesPermissionMissing = false;
  let aftersalesError = "";
  const eligibleOrderIds = orders
    .filter(order => String(order?.status || order?.order_status || "") !== "CANCELLED")
    .map(order => String(order?.id || ""))
    .filter(Boolean);

  for (let i = 0; i < eligibleOrderIds.length; i += 50) {
    const batchIds = eligibleOrderIds.slice(i, i + 50);
    const value = await searchReturnsForOrders(env, accessToken, session.shopCipher, batchIds);
    if (!value.available) {
      aftersalesPermissionMissing = true;
      if (!aftersalesError) aftersalesError = String(value.error || "Return & Refund API unavailable");
    }
    const grouped = new Map(batchIds.map(id => [id, []]));
    for (const record of value.records || []) {
      const orderId = String(record?.order_id || record?.order?.id || "");
      if (orderId && grouped.has(orderId)) grouped.get(orderId).push(record);
    }
    for (const id of batchIds) {
      aftersalesById.set(id, {
        available: value.available,
        error: value.error || "",
        records: grouped.get(id) || []
      });
    }
  }

  for (const order of orders) {
    const id = String(order?.id || "");
    if (!id) continue;
    if (String(order?.status || order?.order_status || "") === "CANCELLED") {
      aftersalesById.set(id, { available: true, error: "", records: [] });
    } else if (!aftersalesById.has(id)) {
      aftersalesById.set(id, { available: !aftersalesPermissionMissing, error: "", records: [] });
    }
  }

  const normalized = orders
    .map(order => normalizeReconcileOrder(order, aftersalesById.get(String(order?.id || "")), session.currency || "VND", overlappingSessions.length === 0))
    .sort((a, b) => b.createTime - a.createTime);

  const counts = {
    total: normalized.length,
    processing: 0,
    awaitingPacking: 0,
    awaitingCarrier: 0,
    transporting: 0,
    outForDelivery: 0,
    delivered: 0,
    completed: 0,
    cancelled: 0,
    returning: 0,
    refunded: 0
  };
  let orderWindowAmount = 0;
  let provisionalNetAmount = 0;
  let confirmedLiveSignalAmount = 0;
  let cancelledAmount = 0;
  for (const order of normalized) {
    orderWindowAmount += order.amount;
    provisionalNetAmount += order.netAmount;
    if (order.attribution === "live_signal") confirmedLiveSignalAmount += order.netAmount;
    if (order.status === "CANCELLED") {
      counts.cancelled++;
      cancelledAmount += order.amount;
    }
    else if (order.status === "AWAITING_SHIPMENT") counts.awaitingPacking++;
    else if (order.status === "AWAITING_COLLECTION") counts.awaitingCarrier++;
    else if (order.status === "PARTIALLY_SHIPPING") counts.transporting++;
    else if (order.status === "IN_TRANSIT") counts.outForDelivery++;
    else if (order.status === "DELIVERED") counts.delivered++;
    else if (order.status === "COMPLETED") counts.completed++;
    else counts.processing++;
    if (order.aftersales.some(x => aftersaleState(x) === "active")) counts.returning++;
    if (order.aftersales.some(x => aftersaleState(x) === "refunded")) counts.refunded++;
  }

  const result = {
    ok: true,
    generatedAt: new Date().toISOString(),
    live: {
      liveId: String(session.liveId || ""),
      title: session.title || "Phiên LIVE",
      startTimeSeconds: Number(session.startTimeSeconds || 0),
      endTimeSeconds: Number(session.endTimeSeconds || 0),
      analyticsGmvAmount: moneyNumber(session.gmvAmount),
      creatorGmvAvailable: session?.creatorGmvAvailable === true,
      creatorGmvAmount: session?.creatorGmvAvailable === true ? moneyNumber(session?.creatorGmvAmount) : null,
      sellerGmvAmount: moneyNumber(session?.sellerGmvAmount),
      gmvSource: String(session?.gmvSource || "seller_shop_lives_202509"),
      shopProductGmvAmount: session?.affiliateDataAvailable === true ? moneyNumber(session.shopProductGmvAmount) : null,
      affiliateGmvAmount: session?.affiliateDataAvailable === true ? moneyNumber(session.affiliateGmvAmount) : null,
      affiliateItemsSold: session?.affiliateDataAvailable === true ? Number(session.affiliateItemsSold || 0) : null,
      affiliateSkuOrders: session?.affiliateDataAvailable === true ? Number(session.affiliateSkuOrders || 0) : null,
      affiliateCommissionAmount: session?.affiliateCommissionAvailable === true ? moneyNumber(session.affiliateCommissionAmount) : null,
      affiliateCommissionAvailable: session?.affiliateCommissionAvailable === true,
      affiliateDataAvailable: session?.affiliateDataAvailable === true,
      affiliateDataConsistent: session?.affiliateDataConsistent !== false,
      affiliateSource: session?.affiliateSource || "",
      currency: session.currency || "VND"
    },
    policy: {
      generalReturnDays: 15,
      kpiFinalization: "Chốt khi Delivered/Completed và không có yêu cầu hoàn/trả đang xử lý; hoàn tiền phát sinh sau đó được đối soát lại.",
      reducedCategoryDays: 6,
      reconciliationProtectionDays: RECONCILIATION_PROTECTION_DAYS,
      note: "Mốc hậu mãi tính từ khi đơn chuyển sang Delivered; SellerKBB bảo vệ dữ liệu phiên LIVE tối thiểu 60 ngày để tránh tự dọn khi đơn vẫn còn trong vòng đời giao hàng/hậu mãi."
    },
    scope: {
      orderWindow: "Đơn tạo trong đúng khoảng thời gian phiên LIVE",
      attribution: "auto_combine_order_id là tín hiệu LIVE; nếu không có, SellerKBB chỉ đánh dấu khớp theo thời gian.",
      aftersalesAvailable: !aftersalesPermissionMissing,
      aftersalesError,
      overlapAmbiguous: overlappingSessions.length > 0,
      overlapCount: overlappingSessions.length,
      overlapLiveIds: overlappingSessions.slice(0, 20).map(x => String(x?.liveId || "")).filter(Boolean)
    },
    counts,
    totals: {
      orderWindowAmount,
      provisionalNetAmount,
      confirmedLiveSignalAmount,
      cancelledAmount
    },
    orders: normalized
  };
  result.kpiSummary = summarizeLiveReconciliation(result);
  return result;
}

function calculateLiveSettlementSplit(rows, roomGmv) {
  const source = Array.isArray(rows) ? rows : [];
  const gross = source.reduce((n,o) => n + Math.max(0,moneyNumber(o?.amount)), 0);
  const settled = source.filter(o => ["DELIVERED","COMPLETED"].includes(o?.status) && o?.finalized === true);
  const pending = source.filter(o => o?.finalized !== true && o?.status !== "CANCELLED");
  const refund = source.filter(o => o?.status !== "CANCELLED").reduce((n,o) =>
    n + Math.max(0,moneyNumber(o?.amount)-moneyNumber(o?.netAmount)),0);
  const ratio = value => gross > 0 ? Math.round(Math.max(0,roomGmv) * value / gross) : 0;
  return {
    settledOrderCount: settled.length,
    settledGmvAmount: ratio(settled.reduce((n,o)=>n+Math.max(0,moneyNumber(o?.netAmount)),0)),
    pendingGmvAmount: ratio(pending.reduce((n,o)=>n+Math.max(0,moneyNumber(o?.netAmount)),0)),
    refundedOrderAmount: refund,
    refundedGmvEstimate: ratio(refund),
    allocationMethod: "creator_room_gmv_weighted_by_order_value_estimate"
  };
}

function summarizeLiveReconciliation(result) {
  const orders = Array.isArray(result?.orders) ? result.orders : [];
  const analyticsGmvAmount = moneyNumber(result?.live?.analyticsGmvAmount);
  const orderWindowAmount = moneyNumber(result?.totals?.orderWindowAmount);
  const confirmedLiveSignalAmount = moneyNumber(result?.totals?.confirmedLiveSignalAmount);
  const cancelledAmount = moneyNumber(result?.totals?.cancelledAmount);
  const affiliateDataAvailable = result?.live?.affiliateDataAvailable === true;
  const shopProductGmvAmount = affiliateDataAvailable ? moneyNumber(result?.live?.shopProductGmvAmount) : 0;
  const affiliateGmvAmount = affiliateDataAvailable ? moneyNumber(result?.live?.affiliateGmvAmount) : 0;
  const affiliateItemsSold = affiliateDataAvailable ? Number(result?.live?.affiliateItemsSold || 0) : 0;
  const affiliateSkuOrders = affiliateDataAvailable ? Number(result?.live?.affiliateSkuOrders || 0) : 0;
  const affiliateCommissionAvailable = result?.live?.affiliateCommissionAvailable === true;
  const affiliateCommissionAmount = affiliateCommissionAvailable ? moneyNumber(result?.live?.affiliateCommissionAmount) : 0;
  const creatorVerified = result?.live?.creatorGmvAvailable === true;
  const aftersalesAvailable = result?.scope?.aftersalesAvailable !== false;
  const aftersalesError = String(result?.scope?.aftersalesError || "");
  const overlapAmbiguous = result?.scope?.overlapAmbiguous === true;
  const overlapCount = Number(result?.scope?.overlapCount || 0);

  const liveSignalOrderRows = orders.filter(order => order?.attribution === "live_signal");
  const provisionalTimeWindowRows = orders.filter(order => order?.attribution === "time_window_single_live");
  const excludedTimeWindowRows = orders.filter(order => order?.attribution === "time_window");
  const singleLiveKpiRows = [...liveSignalOrderRows, ...provisionalTimeWindowRows];

  const liveSignalOrders = liveSignalOrderRows.length;
  const provisionalTimeWindowOrders = provisionalTimeWindowRows.length;
  const timeWindowOrders = provisionalTimeWindowRows.length + excludedTimeWindowRows.length;
  const provisionalTimeWindowAmount = provisionalTimeWindowRows.reduce((sum, order) => sum + moneyNumber(order?.netAmount), 0);
  const excludedTimeWindowAmount = excludedTimeWindowRows.reduce((sum, order) => sum + moneyNumber(order?.netAmount), 0);
  const timeWindowNetAmount = provisionalTimeWindowAmount + excludedTimeWindowAmount;
  const singleLiveKpiGmvAmount = singleLiveKpiRows.reduce((sum, order) => sum + moneyNumber(order?.netAmount), 0);
  const singleLiveOrderGross = singleLiveKpiRows.reduce((sum, order) => sum + moneyNumber(order?.amount), 0);
  const singleLiveAdjustmentRatio = singleLiveOrderGross > 0
    ? Math.max(0, Math.min(1, singleLiveKpiGmvAmount / singleLiveOrderGross))
    : 1;
  const affiliateAdjustedGmvAmount = affiliateDataAvailable
    ? Math.round(affiliateGmvAmount * singleLiveAdjustmentRatio)
    : 0;
  // The LIVE analytics GMV is the KPI revenue base for SellerKBB and already includes
  // affiliate-product GMV in the user's operating model. We only apply the known
  // cancellation/refund ratio; affiliate commission is never added to this number.
  const singleLiveTotalKpiGmvAmount = Math.round(analyticsGmvAmount * singleLiveAdjustmentRatio);

  const overlapOrderGross = orders.reduce((sum, order) => sum + moneyNumber(order?.amount), 0);
  const overlapOrderNet = orders.reduce((sum, order) => sum + moneyNumber(order?.netAmount), 0);
  const overlapAdjustmentRatio = overlapOrderGross > 0
    ? Math.max(0, Math.min(1, overlapOrderNet / overlapOrderGross))
    : 1;
  const overlapAdjustedGmvAmount = Math.round(analyticsGmvAmount * overlapAdjustmentRatio);
  const overlapProrated = overlapAmbiguous && analyticsGmvAmount > 0;

  const hasSingleLiveData = singleLiveKpiRows.length > 0 || analyticsGmvAmount === 0;
  const hasOverlapData = overlapProrated && orders.length > 0;
  const usableForKpi = creatorVerified && aftersalesAvailable && (overlapAmbiguous ? hasOverlapData : hasSingleLiveData);
  const finalRows = overlapAmbiguous ? orders : singleLiveKpiRows;
  const allFinal = usableForKpi && finalRows.every(order => order?.finalized === true);
  const split = calculateLiveSettlementSplit(finalRows, analyticsGmvAmount);

  let status = "provisional";
  let reason = "";
  let gmvAmount = 0;

  if (!creatorVerified) {
    status = "waiting";
    reason = "Chưa xác minh GMV toàn phiên bằng Creator LIVE Core Stats cho đúng Room ID; GMV Seller không đủ để chốt KPI Affiliate. Hãy kiểm tra Creator Authorization rồi đồng bộ lại.";
  } else if (!aftersalesAvailable) {
    status = "blocked";
    reason = "TikTok Return/Refund chưa đọc được" + (aftersalesError ? ": " + aftersalesError : ".") + " SellerKBB chưa dùng số này để tính KPI.";
  } else if (overlapAmbiguous) {
    if (!hasOverlapData) {
      status = "waiting";
      reason = "Hai kênh nội bộ có LIVE chồng giờ nhưng chưa có đủ đơn trong khung thời gian để tính tỷ lệ hủy/hoàn.";
    } else {
      gmvAmount = overlapAdjustedGmvAmount;
      status = allFinal ? "final" : "provisional";
      reason = allFinal
        ? "Đã chốt khi các đơn giao thành công hoặc hủy và không có hậu mãi đang xử lý. Hoàn tiền phát sinh sau giao vẫn được cập nhật, điều chỉnh GMV/KPI theo lần đối soát kế tiếp."
        : "LIVE nội bộ chồng giờ đã được xử lý: SellerKBB dùng GMV TikTok Analytics riêng của phiên (đã gồm hàng nhà + Affiliate) và áp dụng tỷ lệ hủy/hoàn từ các đơn trong đúng khung giờ. Không gán cùng một đơn trực tiếp cho hai phiên; số này sẽ tự cập nhật khi đơn hủy/hoàn thay đổi.";
    }
  } else if (!hasSingleLiveData) {
    status = "waiting";
    reason = "Chưa tìm thấy đơn trong khung thời gian phiên LIVE để tính KPI.";
  } else {
    gmvAmount = singleLiveTotalKpiGmvAmount;
    const affiliateNote = affiliateDataAvailable && affiliateGmvAmount > 0
      ? " GMV Affiliate được cộng vào cơ sở KPI."
      : " GMV TikTok của phiên vẫn là cơ sở KPI.";
    if (allFinal) {
      status = "final";
      reason = (provisionalTimeWindowOrders > 0
        ? "Đã chốt khi đơn giao thành công, không cần chờ thêm 15 ngày; các yêu cầu hoàn/trả phát sinh sẽ được đối soát lại."
        : "Các đơn hàng nhà có tín hiệu LIVE đã giao hoặc hủy, không có hậu mãi đang xử lý; hoàn tiền phát sinh sẽ tiếp tục cập nhật.") + affiliateNote;
    } else if (provisionalTimeWindowOrders > 0) {
      reason = "Chỉ có một kênh nội bộ LIVE trong khung giờ, nên " + provisionalTimeWindowOrders + " đơn khớp thời gian được tính KPI tạm tính. Phần Affiliate được cộng theo GMV TikTok Analytics của phiên và điều chỉnh theo tỷ lệ hủy/hoàn hiện có của hàng nhà." + affiliateNote;
    } else {
      reason = "GMV chờ đối soát gồm đơn hàng nhà có tín hiệu LIVE và phần Affiliate của phiên; số hàng nhà tự cập nhật khi trạng thái giao, hủy hoặc hoàn tiền thay đổi." + affiliateNote;
    }
  }

  if (status === "provisional" && usableForKpi && split.settledOrderCount > 0) {
    status = "partial_final";
    reason = "Đã tạm chốt GMV tương ứng đơn giao thành công; phần còn lại tiếp tục đối soát. Nếu hoàn tiền sau giao, KPI sẽ được điều chỉnh khi đồng bộ lại.";
  }
  const closedGmv = status === "final" ? gmvAmount :
    status === "partial_final" ? Math.min(gmvAmount,split.settledGmvAmount) : 0;
  const waitingGmv = usableForKpi ? Math.max(0,gmvAmount-closedGmv) : 0;
  return {
    status,
    usableForKpi,
    gmvAmount: usableForKpi ? gmvAmount : 0,
    finalizedGmvAmount: closedGmv,
    pendingGmvAmount: waitingGmv,
    settledOrderCount: split.settledOrderCount,
    refundedOrderAmount: split.refundedOrderAmount,
    refundedGmvEstimate: split.refundedGmvEstimate,
    allocationMethod: split.allocationMethod,
    analyticsGmvAmount,
    creatorGmvAvailable: creatorVerified,
    sellerGmvAmount: moneyNumber(result?.live?.sellerGmvAmount),
    gmvSource: String(result?.live?.gmvSource || ""),
    orderWindowAmount,
    confirmedLiveSignalAmount,
    provisionalTimeWindowAmount,
    excludedTimeWindowAmount,
    timeWindowNetAmount,
    orderCount: orders.length,
    kpiOrderCount: overlapAmbiguous ? orders.length : singleLiveKpiRows.length,
    pendingOrderCount: finalRows.filter(order => order?.finalized !== true).length,
    cancelledCount: Number(result?.counts?.cancelled || 0),
    cancelledAmount,
    returningCount: Number(result?.counts?.returning || 0),
    refundedCount: Number(result?.counts?.refunded || 0),
    aftersalesAvailable,
    aftersalesError,
    overlapAmbiguous,
    overlapCount,
    overlapProrated,
    overlapOrderGross,
    overlapOrderNet,
    overlapAdjustmentRatio,
    overlapAdjustedGmvAmount,
    affiliateDataAvailable,
    shopProductGmvAmount,
    affiliateGmvAmount,
    affiliateItemsSold,
    affiliateSkuOrders,
    affiliateCommissionAvailable,
    affiliateCommissionAmount,
    singleLiveAdjustmentRatio,
    affiliateAdjustedGmvAmount,
    singleLiveTotalKpiGmvAmount,
    affiliateSource: String(result?.live?.affiliateSource || ""),
    liveSignalOrders,
    provisionalTimeWindowOrders,
    timeWindowOrders,
    attribution: overlapProrated
      ? "overlap_prorated"
      : (provisionalTimeWindowOrders > 0
          ? (liveSignalOrders > 0 ? "mixed_single_live" : "time_window_single_live")
          : (liveSignalOrders > 0 ? "live_signal" : "time_window")),
    generatedAt: result?.generatedAt || new Date().toISOString(),
    finalizedAt: (status === "final" || status === "partial_final") ? (result?.generatedAt || new Date().toISOString()) : "",
    reason
  };
}

async function buildLiveReconciliation(env, accessToken, liveId, options = {}) {
  const sessions = await getAutoSyncData(env);
  const session = sessions.find(x => String(x?.liveId || "") === String(liveId || ""));
  if (!session) throw new Error("Không tìm thấy phiên LIVE trong dữ liệu TikTok đang lưu.");
  return buildLiveReconciliationForSession(env, accessToken, session, { ...options, allSessions: sessions });
}

// Keep a limited, buyer-identity-free history of changes to settled KPI.
function recordReconciliationChange(session, summary) {
  const previous = session?.reconciliation;
  const history = Array.isArray(session?.reconciliationHistory) ? session.reconciliationHistory.slice(-39) : [];
  const oldGmv = moneyNumber(previous?.finalizedGmvAmount ?? (previous?.status === "final" ? previous.gmvAmount : 0));
  const nextGmv = moneyNumber(summary?.finalizedGmvAmount ?? (summary?.status === "final" ? summary.gmvAmount : 0));
  const oldRefund = moneyNumber(previous?.refundedOrderAmount);
  const nextRefund = moneyNumber(summary?.refundedOrderAmount);
  if (summary?.usableForKpi === true && (!previous || oldGmv !== nextGmv || oldRefund !== nextRefund)) {
    history.push({at:summary.generatedAt || new Date().toISOString(),
      type:previous ? "adjustment" : "initial",
      previousAmount:oldGmv,currentAmount:nextGmv,deltaAmount:nextGmv-oldGmv,
      refundedOrderAmount:nextRefund,refundDeltaAmount:nextRefund-oldRefund});
  }
  session.reconciliationHistory = history.slice(-40);
  session.reconciliation = summary;
  return session.reconciliationHistory;
}

async function persistReconciliationSummary(env, liveId, summary) {
  if (!env.TIKTOK_KV || !liveId || !summary) return false;
  const sessions = await getAutoSyncData(env);
  const target = sessions.find(x => String(x?.liveId || "") === String(liveId));
  if (!target) return false;
  const history = recordReconciliationChange(target, summary);
  if (summary?.creatorGmvAvailable === true && moneyNumber(summary.analyticsGmvAmount) >= 0) {
    target.sellerGmvAmount = moneyNumber(summary.sellerGmvAmount);
    target.creatorGmvAvailable = true;
    target.creatorGmvAmount = moneyNumber(summary.analyticsGmvAmount);
    target.gmvAmount = String(summary.analyticsGmvAmount);
    target.gmvSource = "creator_live_core_stats_202502";
  }
  if (summary?.affiliateDataAvailable === true) {
    target.affiliateDataAvailable = true;
    target.affiliateDataConsistent = true;
    target.shopProductGmvAmount = moneyNumber(summary.shopProductGmvAmount);
    target.affiliateGmvAmount = moneyNumber(summary.affiliateGmvAmount);
    target.affiliateItemsSold = Number(summary.affiliateItemsSold || 0);
    target.affiliateSkuOrders = Number(summary.affiliateSkuOrders || 0);
    target.affiliateCommissionAvailable = summary.affiliateCommissionAvailable === true;
    target.affiliateCommissionAmount = summary.affiliateCommissionAvailable === true
      ? moneyNumber(summary.affiliateCommissionAmount)
      : 0;
    target.affiliateSource = String(summary.affiliateSource || target.affiliateSource || "");
  }
  await env.TIKTOK_KV.put(AUTO_SYNC_DATA_KEY, JSON.stringify(sessions));
  return history;
}

function reconciliationGeneratedMs(summary) {
  const ms = Date.parse(String(summary?.generatedAt || ""));
  return Number.isFinite(ms) ? ms : 0;
}

async function refreshKpiReconciliations(env, accessToken, sessions, reason = "hourly") {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const daily = reason === "daily_reconcile";
  const lookback = daily ? KPI_RECONCILE_DAILY_LOOKBACK_SECONDS : KPI_RECONCILE_HOURLY_LOOKBACK_SECONDS;
  const maxSessions = daily ? KPI_RECONCILE_DAILY_MAX_SESSIONS : KPI_RECONCILE_HOURLY_MAX_SESSIONS;
  const minRefreshMs = daily ? 8 * 3600000 : 3 * 3600000;

  const candidates = (sessions || [])
    .filter(session => {
      const end = Number(session?.endTimeSeconds || 0);
      if (!session?.liveId || !session?.shopCipher || !end || end > nowSeconds) return false;
      if (nowSeconds - end > lookback) return false;
      const last = reconciliationGeneratedMs(session?.reconciliation);
      return !last || Date.now() - last >= minRefreshMs;
    })
    .sort((a, b) => {
      const aMissing = a?.reconciliation ? 1 : 0;
      const bMissing = b?.reconciliation ? 1 : 0;
      if (aMissing !== bMissing) return aMissing - bMissing;
      return reconciliationGeneratedMs(a?.reconciliation) - reconciliationGeneratedMs(b?.reconciliation);
    })
    .slice(0, maxSessions);

  let refreshed = 0;
  let finalized = 0;
  let blocked = 0;
  const errors = [];
  for (const session of candidates) {
    try {
      const result = await buildLiveReconciliationForSession(env, accessToken, session, { hydrateDetails: true, allSessions: sessions });
      recordReconciliationChange(session, result.kpiSummary);
      session.reconciliationRefreshError = "";
      refreshed++;
      if (result.kpiSummary?.status === "final") finalized++;
      if (result.kpiSummary?.status === "blocked") blocked++;
    } catch (error) {
      const blockedSummary = {
        status: "blocked",
        usableForKpi: false,
        gmvAmount: 0,
        analyticsGmvAmount: moneyNumber(session?.gmvAmount),
        affiliateDataAvailable: session?.affiliateDataAvailable === true,
        shopProductGmvAmount: session?.affiliateDataAvailable === true ? moneyNumber(session?.shopProductGmvAmount) : 0,
        affiliateGmvAmount: session?.affiliateDataAvailable === true ? moneyNumber(session?.affiliateGmvAmount) : 0,
        affiliateCommissionAvailable: false,
        affiliateCommissionAmount: 0,
        generatedAt: new Date().toISOString(),
        reason: String(error?.message || error)
      };
      if (!session.reconciliation?.usableForKpi) session.reconciliation = blockedSummary;
      session.reconciliationRefreshError = blockedSummary.reason;
      blocked++;
      errors.push({ liveId: String(session?.liveId || ""), message: String(error?.message || error) });
    }
  }
  return { checked: candidates.length, refreshed, finalized, blocked, errors: errors.slice(0, 5) };
}

const SELLERKBB_ALLOWED_LIVE_CHANNELS = new Set(["shopkhangbaby", "mekhangsua"]);

function normalizeCreatorChannel(value) {
  return String(value || "").trim().replace(/^@+/, "").toLowerCase();
}

function creatorTokenKey(channel) {
  const key = normalizeCreatorChannel(channel);
  return SELLERKBB_ALLOWED_LIVE_CHANNELS.has(key) ? CREATOR_TOKEN_PREFIX + key : "";
}

function sellerKbbChannelKey(session) {
  return String(session?.channelUsername || session?.username || "").trim().toLowerCase();
}

function isAllowedSellerKbbLiveChannel(session) {
  return SELLERKBB_ALLOWED_LIVE_CHANNELS.has(sellerKbbChannelKey(session));
}

async function syncLivePerformance(env, accessToken, startDate, endDate) {
  const shops = await getAuthorizedShops(env, accessToken);
  const byLiveId = new Map();

  for (const shop of shops) {
    let pageToken = "";
    do {
      const query = {
        start_date_ge: startDate,
        end_date_lt: endDate,
        page_size: 100,
        sort_field: "gmv",
        sort_order: "DESC",
        currency: "LOCAL",
        account_type: "ALL",
        shop_cipher: shop.cipher
      };
      if (pageToken) query.page_token = pageToken;

      const result = await tiktokCall(env, accessToken, "/analytics/202509/shop_lives/performance", query);
      if (result.payload?.code === 105002) {
        const refreshed = await refreshTikTokToken(env, await getTikTokToken(env));
        return syncLivePerformance(env, refreshed.access_token, startDate, endDate);
      }
      if (result.payload?.code !== 0) throw new Error(result.payload?.message || "Không lấy được dữ liệu LIVE");

      const data = result.payload?.data || {};
      for (const session of data.live_stream_sessions || []) {
        const normalized = normalizeLiveSession(session, shop, "ALL");
        if (!normalized.liveId || !normalized.startTimeSeconds || !isAllowedSellerKbbLiveChannel(normalized)) continue;
        const id = String(normalized.liveId);
        byLiveId.set(id, mergeLiveSessionSnapshots(byLiveId.get(id) || {}, normalized));
      }
      pageToken = data.next_page_token || data.page_token || "";
    } while (pageToken);
  }

  return {
    shops,
    allowedChannels: [...SELLERKBB_ALLOWED_LIVE_CHANNELS],
    sessions: [...byLiveId.values()]
  };
}

function vnDateKey(ms = Date.now()) {
  return new Date(ms + 7 * 3600000).toISOString().slice(0, 10);
}

function shiftDateKey(daysFromToday) {
  return vnDateKey(Date.now() + daysFromToday * 86400000);
}

async function getAutoSyncData(env) {
  if (!env.TIKTOK_KV) return [];
  const raw = await env.TIKTOK_KV.get(AUTO_SYNC_DATA_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map(sanitizeStoredLiveSession).filter(Boolean).filter(isAllowedSellerKbbLiveChannel)
      : [];
  } catch {
    return [];
  }
}

async function writeAutoSyncStatus(env, patch) {
  if (!env.TIKTOK_KV) return;
  let current = {};
  const raw = await env.TIKTOK_KV.get(AUTO_SYNC_STATUS_KEY);
  try { current = raw ? JSON.parse(raw) : {}; } catch {}
  await env.TIKTOK_KV.put(AUTO_SYNC_STATUS_KEY, JSON.stringify({ ...current, ...patch }));
}

async function getManualSyncJob(env) {
  if (!env.TIKTOK_KV) return null;
  const raw = await env.TIKTOK_KV.get(MANUAL_SYNC_JOB_KEY);
  if (!raw) return null;
  try {
    const job = JSON.parse(raw);
    if (job?.state === "running" && Date.now() - Date.parse(job.updatedAt || job.startedAt || "") > MANUAL_SYNC_MAX_RUNNING_MS) {
      return { ...job, state: "stale", error: "Tác vụ không cập nhật tiến độ quá 4 giờ. Các phiên đã lưu vẫn được giữ nguyên." };
    }
    return job;
  } catch { return null; }
}

async function saveManualSyncJob(env, job) {
  await env.TIKTOK_KV.put(MANUAL_SYNC_JOB_KEY, JSON.stringify(job), { expirationTtl: 7 * 86400 });
}


function manualAffiliateEligible(sessions) {
  const cutoff = Math.floor((Date.now()-MANUAL_SYNC_DAYS*86400000)/1000);
  return (sessions||[]).filter(x => x.liveId && isAllowedSellerKbbLiveChannel(x) &&
    Number(x.startTimeSeconds||0)>=cutoff)
    .sort((a,b)=>Number(b.startTimeSeconds||0)-Number(a.startTimeSeconds||0));
}
function manualAffiliateTotals(sessions) {
  const eligible=manualAffiliateEligible(sessions);
  return {
    affiliateVerified: eligible.filter(x=>x.affiliateDataAvailable===true && x.creatorGmvAvailable===true &&
      x.affiliateNeedsRefresh!==true).length,
    affiliatePending: eligible.filter(x=>x.affiliateDataAvailable!==true || x.affiliateNeedsRefresh===true).length,
    affiliateTotal: eligible.length
  };
}
function manualAffiliatePendingIds(sessions) {
  return manualAffiliateEligible(sessions)
    .filter(x=>x.affiliateDataAvailable!==true||x.affiliateNeedsRefresh===true)
    .map(x=>String(x.liveId));
}
function manualAffiliateFailureReasons(sessions) {
  const reasons={};
  for(const row of manualAffiliateEligible(sessions)){
    if(row.affiliateDataAvailable===true && row.affiliateNeedsRefresh!==true)continue;
    const cause=String(!row.shopCipher ? "missing_shop_cipher" : row.affiliateError||row.creatorGmvError||"affiliate_source_unavailable").slice(0,140);
    const category= cause.includes("scope") || cause.includes("permission") || cause.includes("105005")
      ? "missing_permission"
      : cause.includes("token") || cause.includes("105002") ? "authorization"
      : cause.includes("missing_shop_cipher") ? "missing_shop_binding"
      : cause.includes("seller_product_gmv_not_reconciled") ? "legacy_incompatible_attribution"
      : cause.includes("creator_room_product_gmv_mismatch") ? "creator_product_reconciliation"
      : cause.includes("own_shop_products_not_identified") ? "seller_product_ownership"
      : cause.includes("creator_product_stats") ? "creator_product_data"
      : cause.includes("product") ? "shop_product_data"
      : cause.includes("creator") ? "creator_data"
      : "other";
    reasons[category]=(reasons[category]||0)+1;
  }
  return reasons;
}

// Freeze the exact missing-room queue at checkpoint creation. Sorting the
// remaining rooms after every slice would shift offsets and SKIP sessions.
async function runManualAffiliateSlice(env,job) {
  const all=await getAutoSyncData(env);
  const byId=new Map(all.map(x=>[String(x.liveId),x]));
  const ids=Array.isArray(job.affiliateIds)?job.affiliateIds:[];
  const offset=Math.max(0,Number(job.affiliateOffset||0));
  const slice=ids.slice(offset,offset+MANUAL_AFFILIATE_BATCH_SIZE)
    .map(id=>byId.get(String(id))).filter(Boolean);
  if(slice.length){
    const refreshed=await refreshTikTokTokenIfNeeded(env,3600,"manual_affiliate_120");
    if(!refreshed.token?.access_token)throw new Error("tiktok_not_connected");
    await enrichLiveAffiliateBreakdowns(env,refreshed.token.access_token,slice,slice.length,"manual_affiliate_120");
    for(const row of slice)Object.assign(row,liveAffiliateComparison(row));
    const stamp=new Date().toISOString();
    for(const row of all)row.cacheUpdatedAt=stamp;
    await env.TIKTOK_KV.put(AUTO_SYNC_DATA_KEY,JSON.stringify(all));
    const totals=manualAffiliateTotals(all);
    await writeAutoSyncStatus(env,{ok:true,reason:"manual_affiliate_120",snapshotAt:stamp,...totals});
    return {processed:ids.slice(offset,offset+MANUAL_AFFILIATE_BATCH_SIZE).length,
      total:ids.length,snapshotAt:stamp,...totals,cached:all.length,
      affiliateFailureReasons:manualAffiliateFailureReasons(all)};
  }
  return {processed:ids.slice(offset,offset+MANUAL_AFFILIATE_BATCH_SIZE).length,
    total:ids.length,...manualAffiliateTotals(all),cached:all.length,
    affiliateFailureReasons:manualAffiliateFailureReasons(all)};
}

async function advanceManualSyncJob(env, expectedJobId="") {
  const current=await getManualSyncJob(env);
  if(!current || current.state!=="running" || (expectedJobId&&current.jobId!==expectedJobId))return current;
  if(Number(current.leaseUntil||0)>Date.now())return current;
  const leased={...current,updatedAt:new Date().toISOString(),leaseUntil:Date.now()+MANUAL_SYNC_LEASE_MS};
  await saveManualSyncJob(env,leased);
  try {
    if(leased.phase==="affiliate") {
      const result=await runManualAffiliateSlice(env,leased);
      const offset=Number(leased.affiliateOffset||0)+result.processed;
      const complete=offset>=result.total;
      const unresolved=Number(result.affiliatePending||0);
      const updated={...leased,...result,affiliateOffset:offset,
        affiliateProcessed:offset,phase:complete?"done":"affiliate",
        state:complete?(unresolved>0?"partial":"success"):"running",error:null,leaseUntil:0,
        finishedAt:complete?new Date().toISOString():null,updatedAt:new Date().toISOString()};
      await saveManualSyncJob(env,updated);
      return updated;
    }
    const offset=Math.max(0,Number(leased.completedDays||0));
    if(offset>=MANUAL_SYNC_DAYS) {
      const all=await getAutoSyncData(env);
      const ids=manualAffiliatePendingIds(all);
      const totals=manualAffiliateTotals(all);
      const complete=ids.length===0;
      const next={...leased,phase:complete?"done":"affiliate",
        state:complete?"success":"running",affiliateIds:ids,
        affiliateOffset:0,affiliateProcessed:0,total:ids.length,...totals,
        affiliateFailureReasons:manualAffiliateFailureReasons(all),
        finishedAt:complete?new Date().toISOString():null,
        leaseUntil:0,updatedAt:new Date().toISOString()};
      await saveManualSyncJob(env,next);
      return next;
    }
    const days=Math.min(MANUAL_SYNC_WINDOW_DAYS,MANUAL_SYNC_DAYS-offset);
    const result=await runAutoSync(env,days,"manual_scan",offset);
    if(result.ok!==true)throw new Error(result.error||"TikTok LIVE scan failed");
    const completedDays=offset+days;
    const next={...leased,phase:"scan",
      // A final scan must checkpoint the pending-room ID list before switching
      // to affiliate mode; otherwise the affiliate phase is an empty queue.
      completedDays,windowStart:shiftDateKey(1-MANUAL_SYNC_DAYS),
      windowEndExclusive:shiftDateKey(1),fetched:Number(leased.fetched||0)+Number(result.fetched||0),
      cached:Number(result.cached||0),snapshotAt:result.snapshotAt||null,
      affiliateVerified:Number(result.affiliateVerified||0),
      affiliatePending:Number(result.affiliatePending||0),leaseUntil:0,
      updatedAt:new Date().toISOString(),error:null};
    await saveManualSyncJob(env,next);
    return next;
  }catch(error){
    const failed={...leased,state:"error",leaseUntil:0,updatedAt:new Date().toISOString(),
      finishedAt:new Date().toISOString(),error:String(error?.message||error)};
    await saveManualSyncJob(env,failed);
    return failed;
  }
}

async function runAutoSync(env, lookbackDays = 2, reason = "hourly", offsetDays = 0) {
  const startedAt = new Date().toISOString();
  if (!env.TIKTOK_KV) return { ok: false, reason, error: "kv_not_bound", startedAt };

  try {
    const tokenResult = await refreshTikTokTokenIfNeeded(env, 3600, "autosync");
    const token = tokenResult.token;
    if (!token?.access_token) {
      const status = { ok: false, reason, startedAt, finishedAt: new Date().toISOString(), error: "tiktok_not_connected" };
      await writeAutoSyncStatus(env, status);
      return status;
    }

    const days = Math.max(1, Math.min(MANUAL_SYNC_WINDOW_DAYS, Number(lookbackDays) || 2));
    const offset = Math.max(0,Math.min(MANUAL_SYNC_DAYS-days,Number(offsetDays)||0));
    const startDate = shiftDateKey(1-offset-days);
    const endDate = shiftDateKey(1-offset);
    const data = await syncLivePerformance(env, token.access_token, startDate, endDate);
    const settings = await getMaintenanceSettings(env);
    // Keep historic LIVE records even when the manual scan covers only the latest 30 days.
    const retentionMs = Math.max(MANUAL_SYNC_DAYS,Math.min(180,Number(settings.retentionDays || 180))) * 86400000;
    const cutoffSeconds = Math.floor((Date.now() - retentionMs) / 1000);
    const existing = await getAutoSyncData(env);
    const byId = new Map();
    for (const item of existing) {
      const id = String(item?.liveId || "");
      const started = Number(item?.startTimeSeconds || 0);
      if (!id || started < cutoffSeconds) continue;
      // A partially available seller API list must never erase earlier
      // synced LIVE/Affiliate results. Retention cleanup is handled above.
      byId.set(id, item);
    }
    for (const item of data.sessions || []) {
      if (!item?.liveId) continue;
      const id = String(item.liveId);
      const previous = byId.get(id) || {};
      byId.set(id, mergeLiveSessionSnapshots(previous, item));
    }

    const merged = [...byId.values()]
      .filter(isAllowedSellerKbbLiveChannel)
      .filter(item => Number(item?.startTimeSeconds || 0) >= cutoffSeconds)
      .sort((a, b) => Number(b.startTimeSeconds || 0) - Number(a.startTimeSeconds || 0))
      .slice(0, Math.min(12000, Number(settings.firestoreMaxSessions || 12000)));

    // Keep an explicitly UNVERIFIED comparison even for sessions not reached by
    // today's API retry limit. Do not overwrite prior verified snapshots.
    for (const session of merged) Object.assign(session, liveAffiliateComparison(session));
    const affiliateEnrichment = reason==="manual_scan"
      ? {checked:0,enriched:0,verified:manualAffiliateTotals(merged).affiliateVerified,
          pending:manualAffiliateTotals(merged).affiliatePending,
          total:manualAffiliateTotals(merged).affiliateTotal,errors:[]}
      : await enrichLiveAffiliateBreakdowns(env,token.access_token,merged,reason==="hourly"?8:10,reason);
    const reconciliation=reason==="manual_scan"
      ? {checked:0,refreshed:0,finalized:0,blocked:0,errors:[]}
      : await refreshKpiReconciliations(env,token.access_token,merged,reason);
    // Every server result carries a monotonic snapshot timestamp so the UI
    // can tell if an edge KV read still serves the previous version.
    const snapshotAt = new Date().toISOString();
    for (const session of merged) session.cacheUpdatedAt = snapshotAt;
    const nextRaw = JSON.stringify(merged);
    const oldRaw = JSON.stringify(existing);
    if (nextRaw !== oldRaw) await env.TIKTOK_KV.put(AUTO_SYNC_DATA_KEY, nextRaw);

    const status = {
      ok: true,
      reason,
      startedAt,
      finishedAt: new Date().toISOString(),
      error: null,
      windowStart: startDate,
      windowEndExclusive: endDate,
      fetched: Number(data.sessions?.length || 0),
      cached: merged.length,
      pendingSessions: merged.filter(item => item?.syncState === "pending_end_time").length,
      invalidTimeSessions: merged.filter(item => item?.syncState === "invalid_start_time").length,
      allowedChannels: data.allowedChannels || [...SELLERKBB_ALLOWED_LIVE_CHANNELS],
      tokenRefreshed: Boolean(tokenResult.refreshed),
      affiliateEnrichment,
      affiliateVerified: affiliateEnrichment.verified,
      affiliatePending: affiliateEnrichment.pending,
      affiliateEstimates: merged.filter(x => x.affiliateDataAvailable !== true && x.affiliateEstimateAvailable === true).length,
      snapshotAt,
      reconciliation
    };
    await writeAutoSyncStatus(env, status);
    return status;
  } catch (e) {
    const status = { ok: false, reason, startedAt, finishedAt: new Date().toISOString(), error: String(e?.message || e) };
    await writeAutoSyncStatus(env, status).catch(() => null);
    return status;
  }
}

async function handleOAuthStart(request, env) {
  await requireAdmin(request, env);
  if (!env.TIKTOK_KV || !env.TIKTOK_SERVICE_ID || !env.TIKTOK_SELLER_AUTH_URL) return json({ error: "tiktok_not_configured" }, 503);
  const state = crypto.randomUUID().replaceAll("-", "");
  await env.TIKTOK_KV.put(`oauth_state:${state}`, JSON.stringify({ createdAt: Date.now(), type: "seller" }), { expirationTtl: 600 });
  const url = new URL(env.TIKTOK_SELLER_AUTH_URL);
  url.searchParams.set("service_id", env.TIKTOK_SERVICE_ID);
  url.searchParams.set("state", state);
  return json({ url: url.toString() });
}

async function handleCreatorOAuthStart(request, env) {
  await requireAdmin(request, env);
  if (!env.TIKTOK_KV || !env.TIKTOK_APP_KEY || !env.TIKTOK_APP_SECRET) return json({ error: "creator_oauth_not_configured" }, 503);
  const body = await request.json().catch(() => ({}));
  const channel = normalizeCreatorChannel(body?.channel);
  if (!SELLERKBB_ALLOWED_LIVE_CHANNELS.has(channel)) return json({ error: "invalid_creator_channel", message: "Chỉ hỗ trợ shopkhangbaby và mekhangsua." }, 400);
  const state = crypto.randomUUID().replaceAll("-", "");
  await env.TIKTOK_KV.put(
    CREATOR_OAUTH_STATE_PREFIX + state,
    JSON.stringify({ createdAt: Date.now(), type: "creator", channel }),
    { expirationTtl: 600 }
  );
  const url = new URL(CREATOR_AUTH_URL);
  url.searchParams.set("app_key", env.TIKTOK_APP_KEY);
  url.searchParams.set("state", state);
  return json({ url: url.toString(), channel });
}

function creatorOAuthErrorPage(title, detail, status = 400) {
  return html(`<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><body style="font-family:system-ui,-apple-system,sans-serif;background:#fff7fb;color:#553746;padding:32px"><main style="max-width:680px;margin:10vh auto;background:#fff;border:1px solid #efd4e2;border-radius:18px;padding:24px;box-shadow:0 20px 50px rgba(80,45,64,.12)"><h1 style="margin-top:0;font-size:24px">${escapeHtml(title)}</h1><p style="line-height:1.6">${escapeHtml(detail)}</p><p><a href="/?section=tiktok" style="color:#a84475;font-weight:700">Quay lại SellerKBB</a></p></main></body></html>`, status);
}

async function handleOAuthCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || url.searchParams.get("auth_code");
  const state = url.searchParams.get("state") || "";
  if (!code || !state || !env.TIKTOK_KV) return creatorOAuthErrorPage("Kết nối TikTok không hợp lệ", "Callback thiếu code/state hoặc KV chưa được cấu hình.");

  const creatorStateRaw = await env.TIKTOK_KV.get(CREATOR_OAUTH_STATE_PREFIX + state);
  if (creatorStateRaw) {
    await env.TIKTOK_KV.delete(CREATOR_OAUTH_STATE_PREFIX + state);
    let creatorState;
    try { creatorState = JSON.parse(creatorStateRaw); } catch { creatorState = null; }
    const channel = normalizeCreatorChannel(creatorState?.channel);
    if (!SELLERKBB_ALLOWED_LIVE_CHANNELS.has(channel)) return creatorOAuthErrorPage("Creator không hợp lệ", "SellerKBB không nhận diện được kênh Creator cần kết nối.");

    let token;
    try { token = await exchangeTikTokAuthCode(env, code); }
    catch (error) { return creatorOAuthErrorPage("Kết nối Creator thất bại", String(error?.message || error)); }

    if (Number(token?.user_type) !== 1) {
      return creatorOAuthErrorPage("Sai loại tài khoản TikTok", "Token trả về không phải Creator token (user_type phải bằng 1). Seller token hiện tại không bị thay đổi.");
    }
    const scopes = normalizeScopes(token?.granted_scopes || token?.scope || token?.scopes || []);
    const missingScopes = REQUIRED_CREATOR_SCOPES.filter(scope => !scopes.includes(scope));
    if (missingScopes.length) {
      return creatorOAuthErrorPage("Creator chưa cấp đủ quyền", "Thiếu scope: " + missingScopes.join(", ") + ". Hãy bật scope trong Partner Center rồi ủy quyền lại.");
    }

    let profile;
    try { profile = await getCreatorProfile(env, token.access_token); }
    catch (error) { return creatorOAuthErrorPage("Không xác minh được Creator", String(error?.message || error) + ". Hãy kiểm tra quyền creator.affiliate.info rồi ủy quyền lại."); }

    const authorizedUsername = normalizeCreatorChannel(profile?.username);
    if (authorizedUsername !== channel) {
      return creatorOAuthErrorPage(
        "Đăng nhập nhầm tài khoản Creator",
        "Bạn đang kết nối @" + authorizedUsername + " nhưng SellerKBB đang chờ @" + channel + ". Token chưa được lưu; hãy đăng xuất TikTok và thử lại đúng tài khoản."
      );
    }

    const key = creatorTokenKey(channel);
    if (!token?.refresh_token) {
      return creatorOAuthErrorPage("Creator chưa có Refresh Token", "TikTok không trả refresh_token. Hãy hủy quyền và ủy quyền lại Creator trước khi dùng dữ liệu tự động.");
    }

    const record = {
      ...token,
      channel,
      connected_at: Date.now(),
      refreshed_at: null,
      refresh_error: "",
      creator_profile: {
        creator_user_id: String(profile?.creator_user_id || ""),
        username: String(profile?.username || ""),
        register_region: String(profile?.register_region || ""),
        selection_region: String(profile?.selection_region || ""),
        permissions: Array.isArray(profile?.permissions) ? profile.permissions : []
      }
    };
    await env.TIKTOK_KV.put(key, JSON.stringify(record));
    return Response.redirect(new URL("/?tiktok_creator=connected&channel=" + encodeURIComponent(channel), request.url).toString(), 302);
  }

  const sellerStateData = await env.TIKTOK_KV.get(`oauth_state:${state}`);
  if (!sellerStateData) return creatorOAuthErrorPage("Phiên xác thực TikTok đã hết hạn hoặc không hợp lệ", "State không tồn tại hoặc đã quá 10 phút. Hãy bắt đầu lại từ nút Kết nối trong SellerKBB.");
  await env.TIKTOK_KV.delete(`oauth_state:${state}`);

  let token;
  try { token = await exchangeTikTokAuthCode(env, code); }
  catch (error) { return creatorOAuthErrorPage("Kết nối TikTok Seller thất bại", String(error?.message || error)); }
  if (token?.user_type != null && Number(token.user_type) !== 0) {
    return creatorOAuthErrorPage("Sai loại tài khoản TikTok", "Callback Seller nhận được token không phải Seller (user_type phải bằng 0). Token hiện tại không bị thay đổi.");
  }
  await env.TIKTOK_KV.put("seller_token", JSON.stringify({ ...token, connected_at: Date.now() }));
  return Response.redirect(new URL("/?tiktok=connected", request.url).toString(), 302);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
}

async function handleApi(request, env, ctx) {
  const url = new URL(request.url);
  if (url.pathname === "/api/config") return json(publicConfig(env));
  if (url.pathname === "/api/health") return json({ ok: true, version: env.APP_VERSION || "1.0.0" });

  if (url.pathname === "/api/tiktok/oauth/callback") return handleOAuthCallback(request, env);

  if (url.pathname === "/api/maintenance/settings") {
    await requireAdmin(request, env);
    if (request.method === "GET") {
      const settings = await getMaintenanceSettings(env);
      const keys = await listAllKvKeys(env);
      const lastRaw = env.TIKTOK_KV ? await env.TIKTOK_KV.get(MAINTENANCE_LAST_RUN_KEY) : null;
      let lastRun = null; try { lastRun = lastRaw ? JSON.parse(lastRaw) : null; } catch {}
      const [storage, github] = await Promise.all([
        measureKvStorage(env, keys),
        getGithubRepoStorage(env)
      ]);
      return json({
        ok: true,
        settings,
        github,
        cloudflare: {
          keyCount: keys.length,
          lastRun,
          usedBytes: storage.usedBytes,
          storageMeasuredKeys: storage.measuredKeys,
          storageComplete: storage.complete,
          storageLimitBytes: 1000000000
        },
        firebase: {
          freePlanMode: true,
          ttlEnabled: false,
          ttlRecommended: false,
          storageLimitBytes: 1073741824
        }
      });
    }
    if (request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const settings = normalizeMaintenance(body);
      if (env.TIKTOK_KV) await env.TIKTOK_KV.put(MAINTENANCE_SETTINGS_KEY, JSON.stringify(settings));
      return json({ ok: true, settings });
    }
  }

  if (url.pathname === "/api/maintenance/run" && request.method === "POST") {
    await requireAdmin(request, env);
    return json(await runKvMaintenance(env, "manual"));
  }

  if (url.pathname === "/api/tiktok/status") {
    await requireAdmin(request, env);
    const token = await getTikTokToken(env);
    const accessExpiresAt = tokenExpirySeconds(token);
    const refreshExpiresAt = refreshTokenExpirySeconds(token);
    let autoSync = null;
    if (env.TIKTOK_KV) {
      const raw = await env.TIKTOK_KV.get(AUTO_SYNC_STATUS_KEY);
      try { autoSync = raw ? JSON.parse(raw) : null; } catch {}
    }
    const config = publicConfig(env);
    const grantedScopes = normalizeScopes(token?.granted_scopes || token?.scope || token?.scopes || []);
    const missingScopes = grantedScopes.length ? REQUIRED_TIKTOK_SCOPES.filter(scope => !grantedScopes.includes(scope)) : [];
    const readinessChecks = {
      firebaseConfig: config.firebaseConfigured === true,
      tiktokConfig: config.tiktokConfigured === true,
      kvBinding: Boolean(env.TIKTOK_KV),
      sellerToken: Boolean(token?.access_token),
      refreshToken: Boolean(token?.refresh_token),
      autoSync: autoSync?.ok === true
    };
    const coreReady = Object.values(readinessChecks).every(Boolean);
    const scopeState = grantedScopes.length ? (missingScopes.length ? "missing" : "verified") : "unreported";
    return json({
      configured: config.tiktokConfigured,
      connected: Boolean(token?.access_token),
      autoRefresh: Boolean(token?.refresh_token),
      autoSyncEnabled: true,
      autoSync,
      manualJob: await getManualSyncJob(env),
      accessTokenExpiresAt: accessExpiresAt || null,
      refreshTokenExpiresAt: refreshExpiresAt || null,
      lastRefreshedAt: token?.refreshed_at || null,
      grantedScopes,
      readiness: {
        readyForLiveData: coreReady && missingScopes.length === 0,
        state: coreReady ? (scopeState === "missing" ? "missing_scopes" : scopeState === "unreported" ? "verify_scopes" : "ready") : "not_ready",
        checks: readinessChecks,
        requiredScopes: REQUIRED_TIKTOK_SCOPES,
        missingScopes,
        scopesReported: grantedScopes.length > 0
      }
    });
  }

  if (url.pathname === "/api/tiktok/oauth/start" && request.method === "POST") return handleOAuthStart(request, env);
  if (url.pathname === "/api/tiktok/creator/oauth/start" && request.method === "POST") return handleCreatorOAuthStart(request, env);

  if (url.pathname === "/api/tiktok/creator/status" && request.method === "GET") {
    await requireAdmin(request, env);
    const channels = [];
    for (const channel of SELLERKBB_ALLOWED_LIVE_CHANNELS) {
      const refreshResult = await refreshCreatorTokenIfNeeded(env, channel, 3600, "status_check");
      const token = refreshResult.token;
      const scopes = normalizeScopes(token?.granted_scopes || token?.scope || token?.scopes || []);
      const missingScopes = token?.access_token ? REQUIRED_CREATOR_SCOPES.filter(scope => !scopes.includes(scope)) : [...REQUIRED_CREATOR_SCOPES];
      const profile = token?.creator_profile || {};
      channels.push({
        channel,
        connected: Boolean(token?.access_token),
        username: String(profile?.username || token?.channel || ""),
        creatorUserId: String(profile?.creator_user_id || ""),
        userType: token?.user_type == null ? null : Number(token.user_type),
        grantedScopes: scopes,
        missingScopes,
        hasRefreshToken: Boolean(token?.refresh_token),
        autoRefresh: Boolean(token?.refresh_token),
        accessTokenExpiresAt: tokenExpirySeconds(token) || null,
        refreshTokenExpiresAt: refreshTokenExpirySeconds(token) || null,
        connectedAt: token?.connected_at || null,
        lastRefreshedAt: token?.refreshed_at || null,
        refreshedNow: refreshResult.refreshed === true,
        refreshError: refreshResult.error || token?.refresh_error || "",
        refreshFailedAt: token?.refresh_failed_at || null,
        error: refreshResult.error || ""
      });
    }
    return json({ ok: true, requiredScopes: REQUIRED_CREATOR_SCOPES, channels });
  }

  if (url.pathname === "/api/tiktok/creator/refresh" && request.method === "POST") {
    await requireAdmin(request, env);
    const body = await request.json().catch(() => ({}));
    const channel = normalizeCreatorChannel(body?.channel);
    if (!SELLERKBB_ALLOWED_LIVE_CHANNELS.has(channel)) return json({ error: "invalid_creator_channel", message: "Chỉ hỗ trợ shopkhangbaby và mekhangsua." }, 400);
    const current = await getStoredCreatorToken(env, channel);
    if (!current?.access_token) return json({ error: "creator_not_connected", message: "Creator chưa được kết nối." }, 409);
    if (!current?.refresh_token) return json({ error: "missing_creator_refresh_token", message: "Creator chưa có Refresh Token. Hãy ủy quyền lại." }, 409);
    try {
      const token = await refreshCreatorToken(env, channel, current, "manual");
      return json({
        ok: true,
        channel,
        refreshed: true,
        hasRefreshToken: Boolean(token?.refresh_token),
        accessTokenExpiresAt: tokenExpirySeconds(token) || null,
        refreshTokenExpiresAt: refreshTokenExpirySeconds(token) || null,
        lastRefreshedAt: token?.refreshed_at || null
      });
    } catch (error) {
      return json({ error: "creator_refresh_failed", message: String(error?.message || error), channel }, 502);
    }
  }

  if (url.pathname === "/api/tiktok/autosync/run" && request.method === "POST") {
    await requireReportAccess(request,env);
    if(!env.TIKTOK_KV||!ctx?.waitUntil) return json({error:"manual_sync_unavailable"},503);
    const existing=await getManualSyncJob(env);
    if(existing?.state==="running") return json({ok:true,accepted:true,alreadyRunning:true,
      jobId:existing.jobId,days:existing.days,completedDays:existing.completedDays,
      phase:existing.phase,startedAt:existing.startedAt},202);

    const body=await request.json().catch(()=>({}));
    const previousIncomplete=existing?.state==="partial" ||
      (existing?.state==="success" && Number(existing?.affiliatePending||0)>0);
    const resumeMissing=body?.retryPending===true && previousIncomplete &&
      existing?.completedDays>=MANUAL_SYNC_DAYS;
    const retryRows=resumeMissing?await getAutoSyncData(env):[];
    const retryIds=resumeMissing?manualAffiliatePendingIds(retryRows):[];
    const job={jobId:crypto.randomUUID(),state:"running",phase:resumeMissing?"affiliate":"scan",
      reason:"manual_30",days:MANUAL_SYNC_DAYS,completedDays:resumeMissing?MANUAL_SYNC_DAYS:0,
      affiliateIds:retryIds,total:retryIds.length,
      affiliateOffset:0,affiliateProcessed:0,updatedAt:new Date().toISOString(),
      leaseUntil:0,startedAt:new Date().toISOString(),finishedAt:null,error:null};
    await saveManualSyncJob(env,job);
    ctx.waitUntil(advanceManualSyncJob(env,job.jobId));
    return json({ok:true,accepted:true,jobId:job.jobId,startedAt:job.startedAt,
      days:MANUAL_SYNC_DAYS,retryPending:resumeMissing},202);
  }

  if(url.pathname==="/api/tiktok/autosync/continue" && request.method==="POST"){
    await requireReportAccess(request,env);
    if(!ctx?.waitUntil||!env.TIKTOK_KV)return json({error:"manual_sync_unavailable"},503);
    const job=await getManualSyncJob(env);
    if(job?.state!=="running")return json({ok:true,manualJob:job});
    if(Number(job.leaseUntil||0)<=Date.now())ctx.waitUntil(advanceManualSyncJob(env,job.jobId));
    return json({ok:true,accepted:true,manualJob:job},202);
  }

  if (url.pathname === "/api/tiktok/autosync/status" && request.method === "GET") {
    await requireReportAccess(request, env);
    let autoSync = null;
    if (env.TIKTOK_KV) {
      const raw = await env.TIKTOK_KV.get(AUTO_SYNC_STATUS_KEY);
      try { autoSync = raw ? JSON.parse(raw) : null; } catch {}
    }
    return json({ ok: true, autoSync, manualJob: await getManualSyncJob(env) });
  }

  if (url.pathname === "/api/tiktok/autosync/sessions" && request.method === "GET") {
    await requireReportAccess(request, env);
    return json({ ok: true, sessions: await getAutoSyncData(env) });
  }

  if (url.pathname === "/api/tiktok/reconcile/live" && request.method === "GET") {
    await requireReportAccess(request, env);
    const liveId = url.searchParams.get("live_id") || "";
    if (!liveId) return json({ error: "missing_live_id", message: "Thiếu live_id để đối soát." }, 400);
    const cacheKey = LIVE_RECONCILE_CACHE_PREFIX + liveId;
    const force = url.searchParams.get("refresh") === "1";
    if (!force && env.TIKTOK_KV) {
      const cachedRaw = await env.TIKTOK_KV.get(cacheKey);
      if (cachedRaw) {
        try {
          const cachedResult = JSON.parse(cachedRaw);
          cachedResult.kpiSummary = cachedResult.kpiSummary || summarizeLiveReconciliation(cachedResult);
          const adjustmentHistory = await persistReconciliationSummary(env, liveId, cachedResult.kpiSummary);
          return json({ ...cachedResult, adjustmentHistory, cached: true });
        } catch {}
      }
    }
    const token = await getTikTokToken(env);
    if (!token?.access_token) return json({ error: "tiktok_not_connected", message: "TikTok chưa được kết nối." }, 503);
    try {
      const result = await buildLiveReconciliation(env, token.access_token, liveId, { hydrateDetails: true });
      if (env.TIKTOK_KV) {
        await env.TIKTOK_KV.put(cacheKey, JSON.stringify(result), { expirationTtl: LIVE_RECONCILE_CACHE_TTL_SECONDS });
        result.adjustmentHistory = await persistReconciliationSummary(env, liveId, result.kpiSummary);
      }
      return json({ ...result, cached: false });
    } catch (e) {
      return json({ error: "reconcile_failed", message: String(e?.message || e) }, 502);
    }
  }

  return json({ error: "not_found" }, 404);
}

export default {
  async scheduled(controller, env, ctx) {
    // Backfill a bounded batch of historical Creator product attribution every
    // five minutes. Idle periods only read the small job status key from KV.
    if (controller.cron === "*/5 * * * *") {
      ctx.waitUntil((async()=>{
        const job=await getManualSyncJob(env);
        if(job?.state==="running")await advanceManualSyncJob(env,job.jobId);
      })());
      return;
    }
    if (controller.cron === "0 * * * *") {
      ctx.waitUntil((async()=>{
        const job=await getManualSyncJob(env);
        await Promise.all([
          job?.state==="running"?Promise.resolve(null):runAutoSync(env,2,"hourly"),
          refreshAllCreatorTokens(env,3600,"hourly")
        ]);
      })());
      return;
    }
    if (controller.cron === "15 3 * * *") {
      ctx.waitUntil((async () => {
        const job=await getManualSyncJob(env);
        await Promise.all([
          job?.state==="running"?Promise.resolve(null):runAutoSync(env,30,"daily_reconcile"),
          refreshAllCreatorTokens(env,86400,"daily_reconcile")
        ]);
        await runKvMaintenance(env, "daily_free_plan");
      })());
      return;
    }
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, ctx);
      if (url.pathname === "/manifest.webmanifest") return new Response(JSON.stringify({name:"SellerKBB · TikTok LIVE",short_name:"SellerKBB",start_url:"/",scope:"/",display:"standalone",background_color:"#fff8fb",theme_color:"#fff4f9",icons:[{src:"/apple-touch-icon.png?v=1.49.22",sizes:"180x180",type:"image/png",purpose:"any"},{src:"/pwa-icon.svg?v=1.49.22",sizes:"any",type:"image/svg+xml",purpose:"any maskable"}]}),{headers:{"content-type":"application/manifest+json; charset=utf-8","cache-control":"no-cache"}});
      if (url.pathname === "/khangbaby-mascot.png") return new Response(Uint8Array.from(atob(BRAND_MASCOT_B64), c => c.charCodeAt(0)), {headers: {"content-type":"image/png", "cache-control":"public,max-age=86400", "x-content-type-options":"nosniff"}});
      if (url.pathname === "/apple-touch-icon.png" || url.pathname === "/apple-touch-icon-precomposed.png") return new Response(Uint8Array.from(atob(BRAND_MASCOT_B64), ch => ch.charCodeAt(0)), {headers:{"content-type":"image/png","cache-control":"public,max-age=86400","x-content-type-options":"nosniff"}});
      if (url.pathname === "/pwa-icon.svg") return new Response('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180"><image x="0" y="0" width="180" height="180" href="data:image/png;base64,' + BRAND_MASCOT_B64 + '"/></svg>',{headers:{"content-type":"image/svg+xml; charset=utf-8","cache-control":"no-cache"}});
      if (url.pathname === "/sw.js") return new Response('self.addEventListener("install",()=>self.skipWaiting());self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));self.addEventListener("fetch",()=>{});',{headers:{"content-type":"application/javascript; charset=utf-8","cache-control":"no-cache","service-worker-allowed":"/"}});
      if (url.pathname === "/favicon.ico" || url.pathname === "/khangbaby-favicon-16.png") return new Response(Uint8Array.from(atob(BRAND_MASCOT_B64), c => c.charCodeAt(0)), {headers:{"content-type":"image/png","cache-control":"public,max-age=86400"}});
      // Only /preview receives the new visual adapter. The production HTML and
      // all TikTok, Creator Authorization, Firebase, reconciliation, and KPI
      // data flows stay exactly as they were before this release.
      if (url.pathname === "/preview") {
        const previewHtml = APP_HTML
          .replace("</head>", '<style id="new-ui-preview-style">' + NEW_UI_PREVIEW_CSS + "</style></head>")
          .replace("</body>", '<div id="newUiPreviewLabel" aria-label="Đang ở bản giao diện mới, dữ liệu thử nghiệm">GIAO DIỆN MỚI · PREVIEW</div></body>');
        return html(previewHtml);
      }
      return html(APP_HTML);
    } catch (e) {
      if (e instanceof Response) return e;
      return json({ error: "internal_error", message: String(e?.message || e) }, 500);
    }
  }
};
