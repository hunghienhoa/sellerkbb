const APP_HTML = __APP_HTML__;

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const TIKTOK_API_HOST = "https://open-api.tiktokglobalshop.com";
const TIKTOK_TOKEN_HOST = "https://auth.tiktok-shops.com";
const MAINTENANCE_SETTINGS_KEY = "maintenance:settings";
const MAINTENANCE_LAST_RUN_KEY = "maintenance:last_run";
const AUTO_SYNC_DATA_KEY = "autosync:rolling";
const AUTO_SYNC_STATUS_KEY = "autosync:status";
const GITHUB_REPO_CACHE_KEY = "maintenance:github_repo";
const LIVE_RECONCILE_CACHE_PREFIX = "reconcile:live:";
const LIVE_RECONCILE_CACHE_TTL_SECONDS = 600;
const RECONCILIATION_PROTECTION_DAYS = 60;
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
  return name === "seller_token" || name === MAINTENANCE_SETTINGS_KEY || name === AUTO_SYNC_DATA_KEY || name === AUTO_SYNC_STATUS_KEY || name === GITHUB_REPO_CACHE_KEY;
}

function isExpendableKvKey(name) {
  return name.startsWith("oauth_state:") || name.startsWith("cache:") || name.startsWith("maintenance_log:") || name.startsWith(LIVE_RECONCILE_CACHE_PREFIX) || name === MAINTENANCE_LAST_RUN_KEY;
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

function moneyNumber(value) {
  const n = Number(String(value ?? "0").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
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
  let pageToken = "";
  do {
    const query = { shop_cipher: session.shopCipher, page_size: 100 };
    if (pageToken) query.page_token = pageToken;
    const result = await tiktokCall(env, accessToken, "/order/202309/orders/search", query, "POST", {
      create_time_ge: start,
      create_time_lt: end + 1
    });
    if (result.payload?.code !== 0) {
      const detail = result.payload?.message || "Không lấy được danh sách đơn";
      throw new Error(`TikTok Orders API: ${detail}. Hãy kiểm tra quyền seller.order.info.`);
    }
    const data = result.payload?.data || {};
    found.push(...(Array.isArray(data.orders) ? data.orders : []));
    pageToken = data.next_page_token || "";
  } while (pageToken && found.length < 1000);
  return found.slice(0, 1000);
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

async function searchReturnsForOrder(env, accessToken, shopCipher, orderId) {
  const result = await tiktokCall(env, accessToken, "/return_refund/202309/returns/search", {
    shop_cipher: shopCipher,
    page_size: 100
  }, "POST", { order_ids: String(orderId) });
  if (result.payload?.code !== 0) {
    return { available: false, error: result.payload?.message || "Return & Refund API unavailable", records: [] };
  }
  return {
    available: true,
    error: "",
    records: Array.isArray(result.payload?.data?.return_orders) ? result.payload.data.return_orders : []
  };
}

function normalizeReconcileOrder(order, aftersales, fallbackCurrency) {
  const amount = orderSubtotal(order);
  const status = String(order?.status || order?.order_status || "");
  const records = Array.isArray(aftersales?.records) ? aftersales.records : [];
  const active = records.filter(x => aftersaleState(x) === "active");
  const refunded = records.filter(x => aftersaleState(x) === "refunded");
  const refundAmount = refunded.reduce((sum, x) => sum + aftersaleRefundTotal(x), 0);
  const cancelled = status === "CANCELLED";
  const netAmount = cancelled ? 0 : Math.max(0, amount - refundAmount);
  const autoCombineOrderId = String(order?.auto_combine_order_id || "");
  const finalized = status === "COMPLETED" && active.length === 0;
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
    attribution: autoCombineOrderId ? "live_signal" : "time_window",
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

async function buildLiveReconciliation(env, accessToken, liveId) {
  const sessions = await getAutoSyncData(env);
  const session = sessions.find(x => String(x?.liveId || "") === String(liveId || ""));
  if (!session) throw new Error("Không tìm thấy phiên LIVE trong dữ liệu TikTok đang lưu.");
  const orders = await hydrateOrderDetails(
    env,
    accessToken,
    session.shopCipher,
    await searchOrdersForLiveWindow(env, accessToken, session)
  );

  const aftersalesById = new Map();
  let aftersalesPermissionMissing = false;
  for (let i = 0; i < orders.length; i += 6) {
    const batch = orders.slice(i, i + 6);
    const results = await Promise.all(batch.map(async order => {
      if (String(order?.status || order?.order_status || "") === "CANCELLED") {
        return [String(order?.id || ""), { available: true, error: "", records: [] }];
      }
      const value = await searchReturnsForOrder(env, accessToken, session.shopCipher, order?.id);
      if (!value.available) aftersalesPermissionMissing = true;
      return [String(order?.id || ""), value];
    }));
    for (const [id, value] of results) aftersalesById.set(id, value);
  }

  const normalized = orders
    .map(order => normalizeReconcileOrder(order, aftersalesById.get(String(order?.id || "")), session.currency || "VND"))
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
  for (const order of normalized) {
    orderWindowAmount += order.amount;
    provisionalNetAmount += order.netAmount;
    if (order.attribution === "live_signal") confirmedLiveSignalAmount += order.netAmount;
    if (order.status === "CANCELLED") counts.cancelled++;
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

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    live: {
      liveId: String(session.liveId || ""),
      title: session.title || "Phiên LIVE",
      startTimeSeconds: Number(session.startTimeSeconds || 0),
      endTimeSeconds: Number(session.endTimeSeconds || 0),
      analyticsGmvAmount: moneyNumber(session.gmvAmount),
      currency: session.currency || "VND"
    },
    policy: {
      generalReturnDays: 15,
      reducedCategoryDays: 6,
      reconciliationProtectionDays: RECONCILIATION_PROTECTION_DAYS,
      note: "Mốc hậu mãi tính từ khi đơn chuyển sang Delivered; SellerKBB bảo vệ dữ liệu phiên LIVE tối thiểu 60 ngày để tránh tự dọn khi đơn vẫn còn trong vòng đời giao hàng/hậu mãi."
    },
    scope: {
      orderWindow: "Đơn tạo trong đúng khoảng thời gian phiên LIVE",
      attribution: "auto_combine_order_id là tín hiệu LIVE; nếu không có, SellerKBB chỉ đánh dấu khớp theo thời gian.",
      aftersalesAvailable: !aftersalesPermissionMissing
    },
    counts,
    totals: {
      orderWindowAmount,
      provisionalNetAmount,
      confirmedLiveSignalAmount
    },
    orders: normalized
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
    return Array.isArray(parsed) ? parsed : [];
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

async function runAutoSync(env, lookbackDays = 2, reason = "hourly") {
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

    const days = Math.max(1, Math.min(30, Number(lookbackDays) || 2));
    const startDate = shiftDateKey(-(days - 1));
    const endDate = shiftDateKey(1);
    const data = await syncLivePerformance(env, token.access_token, startDate, endDate);
    const settings = await getMaintenanceSettings(env);
    const retentionMs = Math.min(180, Number(settings.retentionDays || 180)) * 86400000;
    const cutoffSeconds = Math.floor((Date.now() - retentionMs) / 1000);
    const existing = await getAutoSyncData(env);
    const byId = new Map();

    for (const item of existing) {
      if (Number(item?.startTimeSeconds || 0) >= cutoffSeconds && item?.liveId) byId.set(String(item.liveId), item);
    }
    for (const item of data.sessions || []) {
      if (item?.liveId) byId.set(String(item.liveId), item);
    }

    const merged = [...byId.values()]
      .filter(item => Number(item?.startTimeSeconds || 0) >= cutoffSeconds)
      .sort((a, b) => Number(b.startTimeSeconds || 0) - Number(a.startTimeSeconds || 0))
      .slice(0, Math.min(12000, Number(settings.firestoreMaxSessions || 12000)));

    const nextRaw = JSON.stringify(merged);
    const oldRaw = JSON.stringify(existing);
    if (nextRaw !== oldRaw) await env.TIKTOK_KV.put(AUTO_SYNC_DATA_KEY, nextRaw);

    const status = {
      ok: true,
      reason,
      startedAt,
      finishedAt: new Date().toISOString(),
      windowStart: startDate,
      windowEndExclusive: endDate,
      fetched: Number(data.sessions?.length || 0),
      cached: merged.length,
      tokenRefreshed: Boolean(tokenResult.refreshed)
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
    return json({
      configured: publicConfig(env).tiktokConfigured,
      connected: Boolean(token?.access_token),
      autoRefresh: Boolean(token?.refresh_token),
      autoSyncEnabled: true,
      autoSync,
      accessTokenExpiresAt: accessExpiresAt || null,
      refreshTokenExpiresAt: refreshExpiresAt || null,
      lastRefreshedAt: token?.refreshed_at || null,
      grantedScopes: token?.granted_scopes || []
    });
  }

  if (url.pathname === "/api/tiktok/oauth/start" && request.method === "POST") return handleOAuthStart(request, env);

  if (url.pathname === "/api/tiktok/autosync/status" && request.method === "GET") {
    await requireReportAccess(request, env);
    let autoSync = null;
    if (env.TIKTOK_KV) {
      const raw = await env.TIKTOK_KV.get(AUTO_SYNC_STATUS_KEY);
      try { autoSync = raw ? JSON.parse(raw) : null; } catch {}
    }
    return json({ ok: true, autoSync });
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
        try { return json({ ...JSON.parse(cachedRaw), cached: true }); } catch {}
      }
    }
    const token = await getTikTokToken(env);
    if (!token?.access_token) return json({ error: "tiktok_not_connected", message: "TikTok chưa được kết nối." }, 503);
    try {
      const result = await buildLiveReconciliation(env, token.access_token, liveId);
      if (env.TIKTOK_KV) await env.TIKTOK_KV.put(cacheKey, JSON.stringify(result), { expirationTtl: LIVE_RECONCILE_CACHE_TTL_SECONDS });
      return json({ ...result, cached: false });
    } catch (e) {
      return json({ error: "reconcile_failed", message: String(e?.message || e) }, 502);
    }
  }

  return json({ error: "not_found" }, 404);
}

export default {
  async scheduled(controller, env, ctx) {
    if (controller.cron === "0 * * * *") {
      ctx.waitUntil(runAutoSync(env, 2, "hourly"));
      return;
    }
    if (controller.cron === "15 3 * * *") {
      ctx.waitUntil((async () => {
        await runAutoSync(env, 30, "daily_reconcile");
        await runKvMaintenance(env, "daily_free_plan");
      })());
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
