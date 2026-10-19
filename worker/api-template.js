const APP_HTML = __APP_HTML__;

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const TIKTOK_API_HOST = "https://open-api.tiktokglobalshop.com";
const TIKTOK_TOKEN_HOST = "https://auth.tiktok-shops.com";
const MAINTENANCE_SETTINGS_KEY = "maintenance:settings";
const MAINTENANCE_LAST_RUN_KEY = "maintenance:last_run";
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
  n.retentionDays = Math.min(180, Math.max(30, Number(n.retentionDays) || 180));
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
  return name === "seller_token" || name === MAINTENANCE_SETTINGS_KEY;
}

function isExpendableKvKey(name) {
  return name.startsWith("oauth_state:") || name.startsWith("cache:") || name.startsWith("maintenance_log:") || name === MAINTENANCE_LAST_RUN_KEY;
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
  const status = { ok: true, reason, ranAt: new Date().toISOString(), keyCount: keys.length, deleted, settings };
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
  return {
    version: env.APP_VERSION || "1.0.0",
    firebase: {
      apiKey: env.FIREBASE_API_KEY || "",
      authDomain: env.FIREBASE_AUTH_DOMAIN || "",
      projectId: env.FIREBASE_PROJECT_ID || "",
      storageBucket: env.FIREBASE_STORAGE_BUCKET || "",
      messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID || "",
      appId: env.FIREBASE_APP_ID || ""
    },
    tiktokConfigured: Boolean(env.TIKTOK_APP_KEY && env.TIKTOK_APP_SECRET && env.TIKTOK_SERVICE_ID && env.TIKTOK_SELLER_AUTH_URL && env.TIKTOK_KV)
  };
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

async function refreshTikTokTokenIfNeeded(env, thresholdSeconds = 7200, reason = "proactive") {
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
    const result = await refreshTikTokTokenIfNeeded(env, 7200, "api_request");
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

function normalizeLiveSession(s, shop) {
  const start = Number(s.start_time || 0);
  const end = Number(s.end_time || 0);
  const sales = s.sales_performance || {};
  const gmv = sales.gmv || {};
  return {
    liveId: String(s.id || ""),
    title: s.title || "Phiên LIVE",
    channelUsername: s.username || "",
    channelId: String(s.creator_id || s.account_id || s.user_id || ""),
    accountType: s.account_type || "",
    shopCipher: shop?.cipher || "",
    shopId: String(shop?.id || ""),
    shopName: shop?.name || "",
    startTimeSeconds: start,
    endTimeSeconds: end,
    durationSeconds: Math.max(0, end - start),
    gmvAmount: String(gmv.amount || "0"),
    currency: gmv.currency || "VND",
    itemsSold: Number(sales.items_sold || 0),
    skuOrders: Number(sales.sku_orders || 0),
    customers: Number(sales.customers || 0),
    raw: {
      productsAdded: Number(sales.products_added || 0),
      differentProductsSold: Number(sales.different_products_sold || 0),
      createdSkuOrders: Number(sales.created_sku_orders || 0),
      live24hGmv: sales["24h_live_gmv"] || null
    }
  };
}

async function syncLivePerformance(env, accessToken, startDate, endDate) {
  const shops = await getAuthorizedShops(env, accessToken);
  const all = [];
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
      for (const session of data.live_stream_sessions || []) all.push(normalizeLiveSession(session, shop));
      pageToken = data.next_page_token || data.page_token || "";
    } while (pageToken);
  }
  return { shops, sessions: all };
}

async function handleOAuthStart(request, env) {
  await requireAdmin(request, env);
  if (!env.TIKTOK_KV || !env.TIKTOK_SERVICE_ID || !env.TIKTOK_SELLER_AUTH_URL) return json({ error: "tiktok_not_configured" }, 503);
  const state = crypto.randomUUID().replaceAll("-", "");
  await env.TIKTOK_KV.put(`oauth_state:${state}`, JSON.stringify({ createdAt: Date.now() }), { expirationTtl: 600 });
  const url = new URL(env.TIKTOK_SELLER_AUTH_URL);
  url.searchParams.set("service_id", env.TIKTOK_SERVICE_ID);
  url.searchParams.set("state", state);
  return json({ url: url.toString() });
}

async function handleOAuthCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || url.searchParams.get("auth_code");
  const state = url.searchParams.get("state") || "";
  if (!code || !state || !env.TIKTOK_KV) return html("<h1>Kết nối TikTok không hợp lệ</h1>", 400);
  const stateData = await env.TIKTOK_KV.get(`oauth_state:${state}`);
  if (!stateData) return html("<h1>Phiên xác thực TikTok đã hết hạn hoặc không hợp lệ</h1>", 400);
  await env.TIKTOK_KV.delete(`oauth_state:${state}`);

  const tokenUrl = new URL(TIKTOK_TOKEN_HOST + "/api/v2/token/get");
  tokenUrl.searchParams.set("app_key", env.TIKTOK_APP_KEY);
  tokenUrl.searchParams.set("app_secret", env.TIKTOK_APP_SECRET);
  tokenUrl.searchParams.set("auth_code", code);
  tokenUrl.searchParams.set("grant_type", "authorized_code");
  const res = await fetch(tokenUrl);
  const payload = await res.json();
  if (payload.code !== 0 || !payload.data?.access_token) {
    return html(`<h1>Kết nối TikTok thất bại</h1><pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre>`, 400);
  }
  await env.TIKTOK_KV.put("seller_token", JSON.stringify({ ...payload.data, connected_at: Date.now() }));
  return Response.redirect(new URL("/?tiktok=connected", request.url).toString(), 302);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
}

async function handleApi(request, env) {
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
      return json({ ok: true, settings, cloudflare: { keyCount: keys.length, lastRun }, firebase: { freePlanMode: true, ttlEnabled: false, ttlRecommended: false } });
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
    return json({
      configured: publicConfig(env).tiktokConfigured,
      connected: Boolean(token?.access_token),
      autoRefresh: Boolean(token?.refresh_token),
      accessTokenExpiresAt: accessExpiresAt || null,
      refreshTokenExpiresAt: refreshExpiresAt || null,
      lastRefreshedAt: token?.refreshed_at || null,
      grantedScopes: token?.granted_scopes || []
    });
  }

  if (url.pathname === "/api/tiktok/oauth/start" && request.method === "POST") return handleOAuthStart(request, env);

  if (url.pathname === "/api/tiktok/sync" && request.method === "POST") {
    await requireAdmin(request, env);
    const token = await getTikTokToken(env);
    if (!token?.access_token) return json({ error: "tiktok_not_connected" }, 409);
    const body = await request.json().catch(() => ({}));
    const startDate = String(body.startDate || "");
    const endDate = String(body.endDate || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return json({ error: "invalid_date" }, 400);
    try {
      const data = await syncLivePerformance(env, token.access_token, startDate, endDate);
      return json({ ok: true, ...data });
    } catch (e) {
      return json({ error: "tiktok_api_error", message: String(e?.message || e) }, 502);
    }
  }

  return json({ error: "not_found" }, 404);
}

export default {
  async scheduled(controller, env, ctx) {
    if (controller.cron === "0 */2 * * *") {
      ctx.waitUntil(refreshTikTokTokenIfNeeded(env, 7200, "cron").catch(() => null));
      return;
    }
    if (controller.cron === "15 3 * * *") {
      ctx.waitUntil(runKvMaintenance(env, "daily_free_plan"));
      return;
    }
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env);
      if (url.pathname === "/favicon.ico") return new Response(null, { status: 204 });
      return html(APP_HTML);
    } catch (e) {
      if (e instanceof Response) return e;
      return json({ error: "internal_error", message: String(e?.message || e) }, 500);
    }
  }
};
