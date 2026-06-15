//  Security 
var ALLOWED_ORIGINS = [
  "https://yb-app.github.io",
  "https://t.me",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
];

var WEBHOOK_PATHS = [
  "/webhook/facebook",
  "/webhook/telegram",
];

var BLOCKED_PATTERNS = [
  /\/\.env/i, /\/wp-/i, /\/phpmy/i, /\.php$/i,
  /union.*select/i, /<script/i, /\.\.\//,
];


// Input sanitize — strip HTML tags, trim, limit length
function sanitize(v, maxLen) {
  if (v === null || v === undefined) return "";
  return String(v).replace(/<[^>]*>/g, "").trim().slice(0, maxLen || 500);
}
var rateLimitStore = new Map();
var RATE_LIMIT     = 60;
var RATE_WINDOW    = 60000;

function buildCors(origin) {
  var allowed = ALLOWED_ORIGINS.includes(origin)
    ? origin : "https://yb-app.github.io";
  return {
    "Access-Control-Allow-Origin":  allowed,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age":       "86400",
  };
}

function jsonResp(data, status, cors) {
  status = status || 200;
  cors   = cors   || {};
  return new Response(JSON.stringify(data), {
    status: status,
    headers: Object.assign({ "Content-Type": "application/json" }, cors),
  });
}

function checkRateLimit(ip) {
  var now = Date.now();
  var rec = rateLimitStore.get(ip);
  if (!rec || now - rec.start > RATE_WINDOW) {
    rateLimitStore.set(ip, { count: 1, start: now });
    return true;
  }
  rec.count++;
  return rec.count <= RATE_LIMIT;
}

function isBlocked(str) {
  return BLOCKED_PATTERNS.some(function(p) { return p.test(str); });
}

// 
// PHASE 2-1: normalizePhone
// 
function normalizePhone(phone) {
  if (!phone) throw new Error("phone required");

  // strip spaces, dashes, parentheses
  phone = String(phone).replace(/[\s\-\(\)\.]/g, "");

  // strip +855 or 855 prefix
  if (phone.startsWith("+855")) phone = "0" + phone.slice(4);
  if (phone.startsWith("855"))  phone = "0" + phone.slice(3);

  // must start with 0, total 9-10 digits
  if (!/^0[0-9]{8,9}$/.test(phone)) {
    throw new Error("Invalid Cambodia phone: must be 9-10 digits starting with 0");
  }
  return phone;
}

// 
// PHASE 2-2: validate()
// 
function validate(data, rules) {
  for (var field in rules) {
    var rule = rules[field];
    var val  = data[field];

    if (rule.required && (val === undefined || val === null || val === "")) {
      throw new Error(field + " is required");
    }
    if (val === undefined || val === null || val === "") continue;

    if (rule.min !== undefined && val < rule.min) {
      throw new Error(field + " must be >= " + rule.min);
    }
    if (rule.max !== undefined && val > rule.max) {
      throw new Error(field + " must be <= " + rule.max);
    }
    if (rule.maxlen && String(val).length > rule.maxlen) {
      throw new Error(field + " max length " + rule.maxlen);
    }
    if (rule.regex && !rule.regex.test(String(val))) {
      throw new Error(field + " format invalid");
    }
  }
}

// Order validation rules
var ORDER_RULES = {
  customer_name:  { required: true, maxlen: 200 },
  customer_phone: { required: true, regex: /^0[0-9]{8,9}$/ },
  total:          { required: true, min: 0 },
};

// Profile validation rules
var PROFILE_RULES = {
  phone:    { required: true, regex: /^0[0-9]{8,9}$/ },
  username: { regex: /^[a-zA-Z0-9_]{3,30}$/ },
};

// 
// SUPABASE HELPERS
// 
function sbHeaders(key) {
  return {
    "apikey":          key,
    "Authorization":   "Bearer " + key,
    "Content-Type":    "application/json",
    "Accept-Profile":  "public",
    "Content-Profile": "public",
  };
}

async function sbSelect(env, table, params) {
  params = params || "";
  var res = await fetch(
    env.SUPABASE_URL + "/rest/v1/" + table + "?" + params,
    { headers: sbHeaders(env.SUPABASE_KEY) }
  );
  if (!res.ok) throw new Error("sb select " + table + ": " + await res.text());
  return res.json();
}

async function sbInsert(env, table, row, returning) {
  returning = returning || "minimal";
  var res = await fetch(env.SUPABASE_URL + "/rest/v1/" + table, {
    method:  "POST",
    headers: Object.assign(sbHeaders(env.SUPABASE_KEY), { "Prefer": "return=" + returning }),
    body:    JSON.stringify(row),
  });
  if (!res.ok) throw new Error("sb insert " + table + ": " + await res.text());
  return returning === "representation" ? res.json() : null;
}

async function sbUpsert(env, table, row, onConflict) {
  var res = await fetch(
    env.SUPABASE_URL + "/rest/v1/" + table + "?on_conflict=" + onConflict,
    {
      method:  "POST",
      headers: Object.assign(sbHeaders(env.SUPABASE_KEY), {
        "Prefer": "resolution=merge-duplicates,return=minimal",
      }),
      body: JSON.stringify(row),
    }
  );
  if (!res.ok) throw new Error("sb upsert " + table + ": " + await res.text());
}

async function sbUpdate(env, table, params, patch) {
  var res = await fetch(
    env.SUPABASE_URL + "/rest/v1/" + table + "?" + params,
    {
      method:  "PATCH",
      headers: Object.assign(sbHeaders(env.SUPABASE_KEY), { "Prefer": "return=minimal" }),
      body:    JSON.stringify(patch),
    }
  );
  if (!res.ok) throw new Error("sb update " + table + ": " + await res.text());
}

async function writeLog(env, opts) {
  try {
    await sbInsert(env, "logs", {
      tenant_id: env.TENANT_ID,
      shop_id:   env.SHOP_ID,
      page_id:   opts.page_id || null,
      source:    opts.source  || "worker",
      type:      opts.type    || "event",
      level:     opts.level   || "info",
      message:   String(opts.message || "").slice(0, 500),
      data:      opts.data    || {},
    });
  } catch (e) {
    console.error("writeLog:", e.message);
  }
}

// 
// PHASE 2-3: AUTH ROUTES
// 

// Step 1: check if user exists (has orders + prior login)
async function handleAuthCheck(request, env, cors) {
  var body  = await request.json();
  var phone = normalizePhone(body.phone);

  // check order history
  var orders = await sbSelect(env, "orders",
    "tenant_id=eq." + env.TENANT_ID +
    "&shop_id=eq."  + env.SHOP_ID +
    "&customer_phone=eq." + phone +
    "&limit=1&select=id"
  );

  // check if profile exists
  var profiles = await sbSelect(env, "profiles",
    "phone=eq." + phone + "&select=id,phone,username&limit=1"
  );

  var hasOrder   = orders.length > 0;
  var hasProfile = profiles.length > 0;

  return jsonResp({
    ok:          true,
    has_order:   hasOrder,
    has_profile: hasProfile,
    // new customer = no profile yet, needs OTP first
    flow: !hasProfile ? "otp_first" : "password_login",
  }, 200, cors);
}

// Step 2a: new customer  send OTP via SMS
async function handleSendOtp(request, env, cors) {
  var body  = await request.json();
  var phone = normalizePhone(body.phone);

  var res = await fetch(env.SUPABASE_URL + "/auth/v1/otp", {
    method:  "POST",
    headers: { "apikey": env.SUPABASE_ANON, "Content-Type": "application/json" },
    body:    JSON.stringify({ phone: phone, channel: "sms" }),
  });

  if (!res.ok) {
    var err = await res.json();
    return jsonResp({ error: err.msg || "OTP send failed" }, 400, cors);
  }

  await writeLog(env, {
    source: "auth", type: "otp_sent",
    message: "OTP sent to " + phone,
  });

  return jsonResp({ ok: true, phone: phone }, 200, cors);
}

// Step 2b: verify OTP  check order history  create profile if qualified
async function handleVerifyOtp(request, env, cors) {
  var body  = await request.json();
  var phone = normalizePhone(body.phone);

  if (!body.token) return jsonResp({ error: "token required" }, 400, cors);

  // verify OTP with Supabase
  var res = await fetch(env.SUPABASE_URL + "/auth/v1/verify", {
    method:  "POST",
    headers: { "apikey": env.SUPABASE_ANON, "Content-Type": "application/json" },
    body:    JSON.stringify({ phone: phone, token: body.token, type: "sms" }),
  });

  var data = await res.json();
  if (!res.ok) return jsonResp({ error: data.msg || "OTP verify failed" }, 400, cors);

  // OTP verified  check order history
  var orders = await sbSelect(env, "orders",
    "tenant_id=eq." + env.TENANT_ID +
    "&shop_id=eq."  + env.SHOP_ID +
    "&customer_phone=eq." + phone +
    "&select=id&limit=1"
  );

  var hasOrder = orders.length > 0;

  // if has order  auto create customer_profiles
  if (hasOrder) {
    await sbUpsert(env, "customer_profiles", {
      tenant_id: env.TENANT_ID,
      shop_id:   env.SHOP_ID,
      phone:     phone,
      meta:      { profile_id: data.user && data.user.id },
    }, "tenant_id,shop_id,phone");
  }

  await writeLog(env, {
    source: "auth", type: "otp_verified",
    message: "OTP verified: " + phone,
    data: { has_order: hasOrder },
  });

  return jsonResp({
    ok:           true,
    access_token: data.access_token,
    user:         data.user,
    has_order:    hasOrder,
    // must set password after first OTP verify
    must_set_password: true,
  }, 200, cors);
}

// Step 3: set password after first login
async function handleSetPassword(request, env, cors) {
  var body  = await request.json();
  var token = (request.headers.get("Authorization") || "").replace("Bearer ", "");

  if (!token)       return jsonResp({ error: "token required" }, 401, cors);
  if (!body.password) return jsonResp({ error: "password required" }, 400, cors);
  if (body.password.length < 8) {
    return jsonResp({ error: "password min 8 characters" }, 400, cors);
  }

  var res = await fetch(env.SUPABASE_URL + "/auth/v1/user", {
    method:  "PUT",
    headers: {
      "apikey":        env.SUPABASE_ANON,
      "Authorization": "Bearer " + token,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({ password: body.password }),
  });

  if (!res.ok) {
    var err = await res.json();
    return jsonResp({ error: err.msg || "Set password failed" }, 400, cors);
  }

  return jsonResp({ ok: true, message: "Password set successfully" }, 200, cors);
}

// Standard login (returning user)
async function handleLogin(request, env, cors) {
  var body  = await request.json();
  var phone = normalizePhone(body.phone);

  if (!body.password) return jsonResp({ error: "password required" }, 400, cors);

  var res = await fetch(env.SUPABASE_URL + "/auth/v1/token?grant_type=password", {
    method:  "POST",
    headers: { "apikey": env.SUPABASE_ANON, "Content-Type": "application/json" },
    body:    JSON.stringify({ phone: phone, password: body.password }),
  });

  var data = await res.json();
  if (!res.ok) return jsonResp({ error: data.msg || "Login failed" }, 401, cors);

  await writeLog(env, {
    source: "auth", type: "login",
    message: "Login: " + phone,
  });

  return jsonResp({
    ok:           true,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    user:         data.user,
  }, 200, cors);
}

// Verify JWT
async function verifyJwt(request, env) {
  var auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  var token = auth.slice(7);

  var res = await fetch(env.SUPABASE_URL + "/auth/v1/user", {
    headers: { "apikey": env.SUPABASE_ANON, "Authorization": "Bearer " + token },
  });
  if (!res.ok) return null;
  return res.json();
}

// 
// PHASE 2-4: PLATFORM ROUTING
// 

// Get all connected platforms for a shop
async function getShopPlatforms(env, shop_id) {
  return sbSelect(env, "platforms",
    "tenant_id=eq." + env.TENANT_ID +
    "&shop_id=eq."  + shop_id +
    "&is_active=eq.true" +
    "&select=id,type,external_id,name,config,notify_orders"
  );
}

// Notify all connected platforms for new order
async function notifyAllPlatforms(env, shop_id, order, source_platform) {
  var platforms = await getShopPlatforms(env, shop_id);

  // debug
  await writeLog(env, {
    source: "worker", type: "notify_debug",
    message: "platforms=" + platforms.length + " source=" + source_platform,
    data: { platforms: platforms.map(function(p) { return { type: p.type, config: p.config, notify: p.notify_orders }; }) }
  });

  // get shop name
  var shopName = "";
  try {
    var shops = await sbSelect(env, "shops",
      "id=eq." + shop_id + "&select=name&limit=1"
    );
    shopName = shops.length ? shops[0].name : "";
  } catch(e) {}

  var msg = formatOrderMessage(order, shopName);

  for (var i = 0; i < platforms.length; i++) {
    var p = platforms[i];

    // skip source platform (already handled)
    if (p.type === source_platform) continue;
    if (!p.notify_orders) continue;

    if (p.type === "telegram" && p.config && p.config.tg_group_id) {
      await tgSend(env, p.config.tg_group_id, msg);
    }

    if (p.type === "facebook" && p.config && p.config.access_token) {
      // FB notify admin page
    }
  }

  await writeLog(env, {
    source:  source_platform || "web",
    type:    "order_notified",
    message: "Order notified to " + platforms.length + " platforms",
    data:    { order_id: order.id, shop_id: shop_id },
  });
}

function formatOrderMessage(order, shopName) {
  shopName = shopName || "";
  var items = "";
  if (order.order_items && order.order_items.length) {
    items = order.order_items.map(function(i) {
      return (i.code || i.name) + " x" + (i.qty || 1);
    }).join(", ");
  }
  var lines = [
    "New Order" + (shopName ? " | " + shopName : ""),
    "ID: "       + (order.id || "").slice(0, 8),
    "Name: "     + (order.customer_name     || ""),
    "Phone: "    + (order.customer_phone    || ""),
    "Location: " + (order.customer_location || ""),
    items ? "Items: " + items : "",
    "Total: $"   + (order.total || 0),
    "Payment: "  + ((order.payment && order.payment.method) || "cod"),
    "Source: "   + (order.source || ""),
  ];
  return lines.filter(Boolean).join("\n");
}

// 
// PHASE 2-5: FEATURE FLAGS
// 

var featureCache = new Map();
var FEATURE_CACHE_TTL = 60000; // 1 min

async function hasFeature(env, featureName) {
  var cacheKey = env.TENANT_ID + ":" + featureName;
  var cached   = featureCache.get(cacheKey);

  if (cached && Date.now() - cached.time < FEATURE_CACHE_TTL) {
    return cached.value;
  }

  try {
    var rows = await sbSelect(env, "tenant_features",
      "tenant_id=eq." + env.TENANT_ID +
      "&is_enabled=eq.true" +
      "&select=feature_id,features(name,is_enabled)" +
      "&features.name=eq." + featureName +
      "&limit=1"
    );
    var result = rows.length > 0;
    featureCache.set(cacheKey, { value: result, time: Date.now() });
    return result;
  } catch (e) {
    return true; // fail open  allow if feature check fails
  }
}

// 
// PRODUCTS API
// 
// 
// PRODUCTS API
// Routes:
//   GET  /api/products          list (KV cache first)
//   POST /api/products          create
//   PATCH /api/products/:id     update
//   DELETE /api/products/:id    delete (soft)
// 

var CATALOG_TTL = 3600; // 1hr
var PRODUCT_RULES = {
  code:        { required: true,  maxlen: 50  },
  item_name:   { required: true,  maxlen: 200 },
  retail_price:{ required: true,  min: 0      },
  stock_qty:   { required: false, min: 0      },
  min_stock:   { required: false, min: 0      },
  category:    { required: false, maxlen: 100 },
  description: { required: false, maxlen: 2000},
};

//  KV cache helpers 
function kvCatalogKey(env) {
  return "catalog:" + env.TENANT_ID + ":" + env.SHOP_ID;
}

async function kvGetCatalog(env) {
  if (!env.KV) return null;
  try {
    var raw = await env.KV.get(kvCatalogKey(env));
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

async function kvSetCatalog(env, data) {
  if (!env.KV) return;
  try {
    await env.KV.put(
      kvCatalogKey(env),
      JSON.stringify(data),
      { expirationTtl: CATALOG_TTL }
    );
  } catch (e) {
    console.error("kvSetCatalog:", e.message);
  }
}

async function kvInvalidateCatalog(env) {
  if (!env.KV) return;
  try {
    await env.KV.delete(kvCatalogKey(env));
  } catch (e) {}
}

//  Image hash dedup (R2) 
async function hashImage(data) {
  var buf  = typeof data === "string"
    ? new TextEncoder().encode(data)
    : data;
  var hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map(function(b) { return b.toString(16).padStart(2, "0"); })
    .join("");
}

async function storeImageR2(env, imageData, filename) {
  if (!env.R2 || !imageData) return null;
  try {
    // base64  binary
    var base64 = imageData.replace(/^data:[^;]+;base64,/, "");
    var binary  = atob(base64);
    var bytes   = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    // hash for dedup key
    var hash   = await hashImage(bytes);
    var ext    = filename ? filename.split(".").pop() : "jpg";
    var r2key  = "products/" + env.SHOP_ID + "/" + hash + "." + ext;

    // check if exists already (dedup)
    var existing = await env.R2.head(r2key);
    if (existing) {
      return env.R2_PUBLIC_URL + "/" + r2key;
    }

    // upload
    await env.R2.put(r2key, bytes.buffer, {
      httpMetadata: { contentType: "image/" + ext },
    });
    return env.R2_PUBLIC_URL + "/" + r2key;
  } catch (e) {
    console.error("storeImageR2:", e.message);
    return null;
  }
}

//  GET /api/products 

//  POST /api/products 
async function handleCreateProduct(request, env, cors) {
  var body;
  try { body = await request.json(); }
  catch (e) { return jsonResp({ ok: false, data: null, msg: { text: "Invalid JSON", type: "error" } }, 400, cors); }

  // validate
  try { validate(body, PRODUCT_RULES); }
  catch (e) {
    return jsonResp({
      ok: false, data: null,
      msg: { text: e.message, type: "error" },
    }, 400, cors);
  }

  // check duplicate code
  var dupSince = await getShopSince(env);
  var existing = await sbSelect(env, "products",
    baseParams(env, dupSince).concat([
      "code=eq." + encodeURIComponent(body.code),
      "select=id",
      "limit=1",
    ]).join("&")
  );
  if (existing.length > 0) {
    return jsonResp({
      ok: false, data: null,
      msg: { text: "code '" + body.code + "' ", type: "error" },
    }, 409, cors);
  }

  // process images (max 10, hash dedup via R2)
  var imageUrls = [];
  var images    = Array.isArray(body.images) ? body.images.slice(0, 10) : [];
  for (var i = 0; i < images.length; i++) {
    var img = images[i];
    if (img && img.data) {
      var url = await storeImageR2(env, img.data, img.name || "product.jpg");
      if (url) imageUrls.push(url);
    } else if (typeof img === "string" && img.startsWith("http")) {
      imageUrls.push(img); // already URL
    }
  }

  var product = {
    tenant_id:    env.TENANT_ID,
    shop_id:      env.SHOP_ID,
    code:         sanitize(body.code, 50).toUpperCase(),
    item_name:    sanitize(body.item_name, 200),
    category:     sanitize(body.category, 100),
    description:  sanitize(body.description, 2000),
    retail_price: parseFloat(body.retail_price) || 0,
    stock_qty:    parseInt(body.stock_qty)       || 0,
    min_stock:    parseInt(body.min_stock)       || 0,
    image_url:    imageUrls[0]    || "",
    images:       imageUrls,
    attributes:   body.attributes || {},
    is_published: body.is_published !== false,
    is_featured:  body.is_featured  === true,
  };

  try {
    var rows    = await sbInsert(env, "products", product, "representation");
    var created = Array.isArray(rows) ? rows[0] : rows;

    // invalidate + rebuild KV catalog
    await kvInvalidateCatalog(env);

    // log
    await writeLog(env, {
      source: "api", type: "product_created",
      message: "Product " + product.code + " created",
      data: { id: created && created.id },
    });

    return jsonResp({
      ok: true, data: created,
      msg: { text: "Product '" + product.code + "' created", type: "success" },
    }, 201, cors);
  } catch (e) {
    return jsonResp({
      ok: false, data: null,
      msg: { text: e.message, type: "error" },
    }, 500, cors);
  }
}

//  PATCH /api/products/:id 
async function handleUpdateProduct(request, env, cors, productId) {
  if (!productId) return jsonResp({ ok: false, data: null, msg: { text: "product id required", type: "error" } }, 400, cors);

  var body;
  try { body = await request.json(); }
  catch (e) { return jsonResp({ ok: false, data: null, msg: { text: "Invalid JSON", type: "error" } }, 400, cors); }

  var allowed = [
    "item_name","category","description",
    "retail_price","stock_qty","min_stock",
    "image_url","images","attributes",
    "is_published","is_featured",
  ];
  var patch = { updated_at: new Date().toISOString() };
  for (var i = 0; i < allowed.length; i++) {
    var k = allowed[i];
    if (body[k] !== undefined) patch[k] = body[k];
  }

  // process new images if any
  if (body.images && Array.isArray(body.images)) {
    var imageUrls = [];
    var imgs      = body.images.slice(0, 10);
    for (var j = 0; j < imgs.length; j++) {
      var img = imgs[j];
      if (img && img.data) {
        var url = await storeImageR2(env, img.data, img.name || "product.jpg");
        if (url) imageUrls.push(url);
      } else if (typeof img === "string" && img.startsWith("http")) {
        imageUrls.push(img);
      }
    }
    if (imageUrls.length > 0) {
      patch.images    = imageUrls;
      patch.image_url = imageUrls[0];
    }
  }

  try {
    await sbUpdate(env, "products",
      "id=eq."         + productId +
      "&tenant_id=eq." + env.TENANT_ID +
      "&shop_id=eq."   + env.SHOP_ID,
      patch
    );

    // invalidate KV
    await kvInvalidateCatalog(env);

    return jsonResp({
      ok: true, data: { id: productId, ...patch },
      msg: { text: "Product updated", type: "success" },
    }, 200, cors);
  } catch (e) {
    return jsonResp({
      ok: false, data: null,
      msg: { text: e.message, type: "error" },
    }, 500, cors);
  }
}

//  DELETE /api/products/:id (soft delete) 
async function handleDeleteProduct(request, env, cors, productId) {
  if (!productId) return jsonResp({ ok: false, data: null, msg: { text: "product id required", type: "error" } }, 400, cors);

  try {
    await sbUpdate(env, "products",
      "id=eq."         + productId +
      "&tenant_id=eq." + env.TENANT_ID +
      "&shop_id=eq."   + env.SHOP_ID,
      { is_published: false, updated_at: new Date().toISOString() }
    );

    await kvInvalidateCatalog(env);

    return jsonResp({
      ok: true, data: { id: productId },
      msg: { text: "Product removed", type: "success" },
    }, 200, cors);
  } catch (e) {
    return jsonResp({
      ok: false, data: null,
      msg: { text: e.message, type: "error" },
    }, 500, cors);
  }
}

//  TG command: #new product 
// dispatchCommand extension
async function handleCmdNewProduct(env, sender, text) {
  // format: #new product [code] [name] [price$]
  // ex: #new product S53-V1 Speaker V1 25$
  var priceM = text.match(/(\d+(?:\.\d+)?)\s*\$/);
  var price  = priceM ? parseFloat(priceM[1]) : 0;
  if (priceM) text = text.replace(priceM[0], "").trim();

  var words = text.trim().split(/\s+/);
  var code  = words[0] ? words[0].toUpperCase() : "";
  var name  = words.slice(1).join(" ") || code;

  if (!code) return "Error: code required\nExample: #new product S53-V1 Speaker V1 25$";

  try {
    var existing = await sbSelect(env, "products",
      "tenant_id=eq." + env.TENANT_ID +
      "&shop_id=eq."  + env.SHOP_ID +
      "&code=eq."     + encodeURIComponent(code) +
      "&select=id&limit=1"
    );
    if (existing.length > 0) return "Error: code '" + code + "' ";

    var rows = await sbInsert(env, "products", {
      tenant_id:    env.TENANT_ID,
      shop_id:      env.SHOP_ID,
      code:         code,
      item_name:    name,
      retail_price: price,
      stock_qty:    0,
      min_stock:    0,
      is_published: true,
    }, "representation");

    await kvInvalidateCatalog(env);

    var p = Array.isArray(rows) ? rows[0] : rows;
    return "Product created\nCode: " + code + "\nName: " + name + "\nPrice: $" + price;
  } catch (e) {
    return "Error: " + e.message.slice(0, 100);
  }
}

//  TG command: #stock 
// format: #stock [code] in [qty] / out [qty]
async function handleCmdStock(env, sender, text) {
  var parts   = text.trim().split(/\s+/);
  var code    = parts[0] ? parts[0].toUpperCase() : "";
  var dir     = parts[1] ? parts[1].toLowerCase() : "in"; // in / out
  var qty     = parseInt(parts[2]) || 0;

  if (!code) return "Error: code required\nExample: #stock S53-V1 in 5";
  if (!qty)  return "Error: qty required";

  var rows = await sbSelect(env, "products",
    "tenant_id=eq." + env.TENANT_ID +
    "&shop_id=eq."  + env.SHOP_ID +
    "&code=eq."     + encodeURIComponent(code) +
    "&select=id,item_name,stock_qty&limit=1"
  );
  if (!rows.length) return "Error: product '" + code + "' not found";

  var p       = rows[0];
  var newQty  = dir === "out"
    ? Math.max(0, (p.stock_qty || 0) - qty)
    : (p.stock_qty || 0) + qty;

  await sbUpdate(env, "products",
    "id=eq." + p.id + "&tenant_id=eq." + env.TENANT_ID,
    { stock_qty: newQty, updated_at: new Date().toISOString() }
  );

  await kvInvalidateCatalog(env);

  return code + " stock " + (dir === "out" ? "-" : "+") + qty +
    "\nQty: " + p.stock_qty + " -> " + newQty;
}

//  TG command: #price 
// format: #price [code] [price$]
async function handleCmdPrice(env, sender, text) {
  var parts  = text.trim().split(/\s+/);
  var code   = parts[0] ? parts[0].toUpperCase() : "";
  var priceM = text.match(/(\d+(?:\.\d+)?)\s*\$/);
  var price  = priceM ? parseFloat(priceM[1]) : 0;

  if (!code)  return "Error: code required\nExample: #price S53-V1 30$";
  if (!price) return "Error: price required";

  var rows = await sbSelect(env, "products",
    "tenant_id=eq." + env.TENANT_ID +
    "&shop_id=eq."  + env.SHOP_ID +
    "&code=eq."     + encodeURIComponent(code) +
    "&select=id,retail_price&limit=1"
  );
  if (!rows.length) return "Error: product '" + code + "' not found";

  var p = rows[0];
  await sbUpdate(env, "products",
    "id=eq." + p.id + "&tenant_id=eq." + env.TENANT_ID,
    { retail_price: price, updated_at: new Date().toISOString() }
  );

  await kvInvalidateCatalog(env);

  return code + " price: $" + p.retail_price + " -> $" + price;
}


// 
// ORDERS API
// 
async function handleGetOrders(request, env, cors) {
  var url    = new URL(request.url);
  var status = url.searchParams.get("status") || "";
  var limit  = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
  var from   = url.searchParams.get("from") || "";
  var to     = url.searchParams.get("to")   || "";

  var params = [
    "tenant_id=eq." + env.TENANT_ID,
    "shop_id=eq."   + env.SHOP_ID,
    "order=created_at.desc",
    "limit=" + limit,
    "select=id,customer_name,customer_phone,customer_location,order_items,subtotal,delivery_fee,total,status,source,created_at,payment,delivery_meta",
  ];
  if (status) params.push("status=eq." + encodeURIComponent(status));
  if (from)   params.push("created_at=gte." + from);
  if (to)     params.push("created_at=lte." + to);

  try {
    var orders = await sbSelect(env, "orders", params.join("&"));
    return jsonResp({ ok: true, data: orders }, 200, cors);
  } catch (e) {
    return jsonResp({ ok: false, error: e.message }, 500, cors);
  }
}

async function handleCreateOrder(request, env, cors) {
  var body = await request.json();

  // normalize phone
  if (body.customer_phone) {
    try {
      body.customer_phone = normalizePhone(body.customer_phone);
    } catch (e) {
      return jsonResp({ error: e.message }, 400, cors);
    }
  }

  // validate
  try {
    validate(body, ORDER_RULES);
  } catch (e) {
    return jsonResp({ error: e.message }, 400, cors);
  }

  var total = (body.subtotal || 0) + (body.delivery_fee || 0) - (body.discount || 0);

  var order = {
    tenant_id:         env.TENANT_ID,
    shop_id:           env.SHOP_ID,
    customer_name:     body.customer_name,
    customer_phone:    body.customer_phone,
    customer_location: body.customer_location || "",
    order_items:       body.order_items || [],
    subtotal:          body.subtotal    || 0,
    delivery_fee:      body.delivery_fee || 0,
    discount:          body.discount    || 0,
    total:             total,
    status:            "Pending",
    source:            body.source || "web",
    raw_text:          body.raw_text || "",
    payment:           { method: body.payment_method || "cod", status: "unpaid" },
    delivery_meta:     {},
  };

  try {
    var rows    = await sbInsert(env, "orders", order, "representation");
    var created = Array.isArray(rows) ? rows[0] : rows;

    // notify all platforms
    if (created) {
      await notifyAllPlatforms(env, env.SHOP_ID, created, body.source || "web");
    }

    await writeLog(env, {
      source:  body.source || "web",
      type:    "order_created",
      message: "Order " + (created && created.id) + " - " + body.customer_name,
      data:    { order_id: created && created.id },
    });

    // invalidate customer KV cache
    if (body.customer_phone) await kvDeleteCustomer(env, body.customer_phone);

    return jsonResp({
      ok: true, data: created,
      msg: { text: "", type: "" },
    }, 201, cors);
  } catch (e) {
    return jsonResp({ ok: false, error: e.message }, 500, cors);
  }
}

async function handleUpdateOrder(request, env, cors, orderId) {
  if (!orderId) return jsonResp({ error: "order id required" }, 400, cors);

  var body    = await request.json();
  var allowed = ["status","payment","delivery_meta"];
  var patch   = {};

  for (var i = 0; i < allowed.length; i++) {
    var k = allowed[i];
    if (body[k] !== undefined) patch[k] = body[k];
  }
  patch.updated_at = new Date().toISOString();

  try {
    await sbUpdate(env, "orders",
      "id=eq." + orderId +
      "&tenant_id=eq." + env.TENANT_ID +
      "&shop_id=eq."   + env.SHOP_ID,
      patch
    );
    return jsonResp({ ok: true }, 200, cors);
  } catch (e) {
    return jsonResp({ ok: false, error: e.message }, 500, cors);
  }
}

async function handleShipperOrders(request, env, cors, user) {
  if (!user) return jsonResp({ error: "unauthorized" }, 401, cors);

  var url    = new URL(request.url);
  var status = url.searchParams.get("status") || "Delivering";

  var params = [
    "shipper_id=eq." + user.id,
    "tenant_id=eq."  + env.TENANT_ID,
    "shop_id=eq."    + env.SHOP_ID,
    "status=eq."     + encodeURIComponent(status),
    "order=created_at.desc",
    "limit=100",
    "select=id,customer_name,customer_phone,customer_location,order_items,total,status,payment,delivery_meta,created_at",
  ].join("&");

  try {
    var orders = await sbSelect(env, "orders", params);
    return jsonResp({ ok: true, data: orders }, 200, cors);
  } catch (e) {
    return jsonResp({ ok: false, error: e.message }, 500, cors);
  }
}

// 
// KHQR
// 
async function handleKhqr(request, env, cors) {
  var body     = await request.json();
  var amount   = body.amount;
  var currency = body.currency  || "KHR";
  var order_id = body.order_id  || "";

  if (!amount) return jsonResp({ error: "amount required" }, 400, cors);

  var merchantName = (env.KHQR_MERCHANT_NAME || "YB 9999").slice(0, 25);
  var account      = env.KHQR_BANK_ACCOUNT   || "";
  var amountStr    = parseFloat(amount).toFixed(2);
  var currencyCode = currency === "USD" ? "840" : "116";

  var qrData = buildKhqrString({
    merchantName: merchantName,
    accountId:    account,
    amount:       amountStr,
    currency:     currencyCode,
    merchantId:   env.KHQR_MERCHANT_ID || "",
    ref:          order_id.slice(0, 25),
  });

  return jsonResp({ ok: true, qr: qrData, amount: amount, currency: currency }, 200, cors);
}

function buildKhqrString(opts) {
  function tlv(tag, value) {
    return tag + String(value).length.toString().padStart(2, "0") + value;
  }
  var ma = tlv("00", "A000000440") +
    (opts.accountId  ? tlv("01", opts.accountId)  : "") +
    (opts.merchantId ? tlv("02", opts.merchantId) : "");

  var payload = [
    tlv("00", "01"), tlv("26", ma), tlv("52", "5999"),
    tlv("53", opts.currency), tlv("54", opts.amount),
    tlv("58", "KH"), tlv("59", opts.merchantName),
    tlv("60", "Phnom Penh"),
    opts.ref ? tlv("62", tlv("05", opts.ref)) : "",
  ].join("");

  var withCrc = payload + "6304";
  var crc     = crc16(withCrc).toString(16).toUpperCase().padStart(4, "0");
  return withCrc + crc;
}

function crc16(str) {
  var crc = 0xFFFF;
  for (var i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (var j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xFFFF;
    }
  }
  return crc;
}

// 
// CLOUDINARY
// 
async function handleCloudinarySign(request, env, cors) {
  var body      = await request.json();
  var folder    = body.folder    || "yb9999";
  var public_id = body.public_id || "";

  var timestamp = Math.floor(Date.now() / 1000).toString();
  var parts     = ["folder=" + folder, "timestamp=" + timestamp];
  if (public_id) parts.push("public_id=" + public_id);
  parts.sort();

  var toSign    = parts.join("&") + env.CLOUDINARY_SECRET;
  var encoder   = new TextEncoder();
  var keyData   = await crypto.subtle.digest("SHA-256", encoder.encode(toSign));
  var signature = Array.from(new Uint8Array(keyData))
    .map(function(b) { return b.toString(16).padStart(2, "0"); }).join("");

  return jsonResp({
    ok: true, signature: signature, timestamp: timestamp,
    api_key: env.CLOUDINARY_KEY, cloud_name: env.CLOUDINARY_CLOUD, folder: folder,
  }, 200, cors);
}

// 
// YB Platform - Command Handlers
// #ok / #new record[n] / #update[n] / #paid[n]
// Add this to worker_v2.js

// 
// COMMAND PARSER
// 

function parseCommand(text) {
  text = text.trim();
  var lower = text.toLowerCase();

  // #paid2, #paid 2, #paid
  var paidMatch = lower.match(/^#paid(\d*)(.*)$/s);
  if (paidMatch) return {
    cmd:    "paid",
    num:    paidMatch[1] ? parseInt(paidMatch[1]) : null,
    body:   text.slice(paidMatch[0].length - paidMatch[2].length).trim(),
  };

  // #update2, #update 2, #update
  var updateMatch = lower.match(/^#update(\d*)(.*)$/s);
  if (updateMatch) return {
    cmd:    "update",
    num:    updateMatch[1] ? parseInt(updateMatch[1]) : null,
    body:   text.slice(updateMatch[0].length - updateMatch[2].length).trim(),
  };

  // #new record2, #new record 2, #new record
  var newMatch = lower.match(/^#new\s*record(\d*)(.*)$/s);
  if (newMatch) return {
    cmd:    "new",
    num:    newMatch[1] ? parseInt(newMatch[1]) : 1,
    body:   text.slice(newMatch[0].length - newMatch[2].length).trim(),
  };

  // #ok
  if (lower.startsWith("#ok")) return {
    cmd:    "ok",
    num:    null,
    body:   text.slice(lower.indexOf("#ok") + 3).trim(),
  };

  // #bulk
  if (lower.startsWith("#bulk")) return {
    cmd:    "bulk",
    num:    null,
    body:   text.slice(5).trim(),
  };

  // #new product [code] [name] [price$]
  if (lower.startsWith("#new product")) return {
    cmd:    "product",
    num:    null,
    body:   text.slice(12).trim(),
  };

  // #stock [code] in/out [qty]
  if (lower.startsWith("#stock")) return {
    cmd:    "stock",
    num:    null,
    body:   text.slice(6).trim(),
  };

  // #price [code] [price$]
  if (lower.startsWith("#price")) return {
    cmd:    "price",
    num:    null,
    body:   text.slice(6).trim(),
  };

  return null;
}

// 
// EXTRACT ORDER DATA FROM TEXT
// Format: phone location products price
// Example: 010433003  S53-V1 75$
// 

function extractOrderData(text) {
  var data = {
    customer_phone:    null,
    customer_location: null,
    order_items:       [],
    total:             0,
    raw_text:          text,
  };

  if (!text) return data;

  // strip line numbers "1. " "2. "
  text = text.replace(/^\d+\.\s*/, "").trim();

  // extract phone (Cambodia 9-10 digits)
  var phoneMatch = text.match(/(0[0-9]{8,9})/);
  if (phoneMatch) {
    data.customer_phone = phoneMatch[1];
    text = text.replace(phoneMatch[0], "").trim();
  }

  // extract price (number + $ or USD or KHR or R)
  var priceMatch = text.match(/(\d+(?:\.\d+)?)\s*[\$]|USD|KHR/i);
  if (priceMatch) {
    data.total = parseFloat(priceMatch[1] || priceMatch[0]);
    text = text.replace(priceMatch[0], "").trim();
  }

  // extract product codes (uppercase + digits pattern e.g. S53-V1, CL18)
  var products = [];
  // extract all product codes (uppercase pattern) from text
  var productRegex = /\b([A-Z0-9]{2,}(?:-[A-Z0-9]+)*)\b/gi;
  var productMatch;
  var usedRanges = [];
  while ((productMatch = productRegex.exec(text)) !== null) {
    var code = productMatch[1];
    var idx  = productMatch.index;

    // check qty after code: "S53-V1 x2" or "S53-V1 2"
    var afterCode = text.slice(idx + code.length);
    var qtyMatch  = afterCode.match(/^\s*[x*]?\s*(\d+)/i);
    var qty = (qtyMatch && qtyMatch[1]) ? parseInt(qtyMatch[1]) : 1;

    code = code.toUpperCase();
    products.push(code);
    data.order_items.push({
      code:       code,
      name:       code,
      qty:        qty,
      unit_price: 0,
      total:      0,
    });
    usedRanges.push({ start: idx, end: idx + code.length });
  }

  // remove product codes from text to get location
  var cleanText = text;
  products.forEach(function(p) {
    cleanText = cleanText.replace(p, " ");
  });
  // remove price pattern, + separators, x qty patterns
  cleanText = cleanText
    .replace(/(\d+(?:\.\d+)?)\s*[\$]/g, " ")
    .replace(/[x*]\s*\d+/gi, " ")
    .replace(/\+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  text = cleanText;

  // remaining text = location
  // text at this point still has price if not removed  clean again
  data.customer_location = text
    .replace(/(\d+(?:\.\d+)?)\s*[\$]/g, " ")
    .replace(/[+,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return data;
}

// 
// GET CUSTOMER ORDERS (sorted by created_at ASC)
// 

async function getCustomerOrders(env, phone) {
  return sbSelect(env, "orders",
    "tenant_id=eq."       + env.TENANT_ID +
    "&shop_id=eq."        + env.SHOP_ID +
    "&customer_phone=eq." + encodeURIComponent(phone) +
    "&order=created_at.asc" +
    "&select=id,customer_name,customer_phone,customer_location,order_items,total,status,payment,created_at"
  );
}

// Get or create customer_profile by platform ID
async function getOrCreateCustomer(env, platformData) {
  // platformData = { phone, name, fb_psid, tg_id }
  var phone = platformData.phone;

  // lookup by phone
  var rows = await sbSelect(env, "customer_profiles",
    "tenant_id=eq." + env.TENANT_ID +
    "&shop_id=eq."  + env.SHOP_ID +
    "&phone=eq."    + encodeURIComponent(phone) +
    "&limit=1"
  );

  if (rows.length > 0) return rows[0];

  // create new
  var meta = {};
  if (platformData.fb_psid) meta.fb_psid = platformData.fb_psid;
  if (platformData.tg_id)   meta.tg_id   = platformData.tg_id;

  var newRows = await sbInsert(env, "customer_profiles", {
    tenant_id: env.TENANT_ID,
    shop_id:   env.SHOP_ID,
    phone:     phone,
    name:      platformData.name || "",
    meta:      meta,
  }, "representation");

  return Array.isArray(newRows) ? newRows[0] : newRows;
}

// 
// COMMAND: #ok
// Create order  block if has unpaid order
// 

async function handleCmdOk(env, sender, text, source) {
  var orderData = extractOrderData(text);

  if (!orderData.customer_phone) {
    return "Error: phone number required\nExample: #ok 012345678 location product 25$";
  }

  try {
    orderData.customer_phone = normalizePhone(orderData.customer_phone);
  } catch (e) {
    return "Error: " + e.message;
  }

  // get or create customer
  var customer = await getOrCreateCustomer(env, {
    phone:     orderData.customer_phone,
    name:      sender.name || "",
    fb_psid:   sender.fb_psid || null,
    tg_id:     sender.tg_id   || null,
  });

  if (!customer) return "Error: could not create customer profile";

  // check unpaid orders
  var existing = await getCustomerOrders(env, customer.phone);
  var unpaid   = existing.filter(function(o) {
    return o.payment && o.payment.status !== "paid";
  });

  if (unpaid.length > 0) {
    var unpaidList = unpaid.map(function(o, i) {
      return "Record #" + (i+1) + ": $" + o.total + " (" + (o.payment && o.payment.status || "unpaid") + ")";
    }).join("\n");
    return "Has " + unpaid.length + " unpaid order(s):\n" + unpaidList +
      "\n\nUse #paid [phone] to pay" +
      "\nOr #new record [phone] to add new order";
  }

  // create order
  var order = await createOrder(env, customer, orderData, source);
  return formatOrderReply(order, existing.length + 1);
}

// 
// COMMAND: #new record[n]
// Create order  bypass unpaid check
// 

async function handleCmdNew(env, sender, text, source) {
  var orderData = extractOrderData(text);

  if (!orderData.customer_phone) {
    return "Error: phone number required\nExample: #new record 012345678 location product 25$";
  }

  try {
    orderData.customer_phone = normalizePhone(orderData.customer_phone);
  } catch (e) {
    return "Error: " + e.message;
  }

  var customer = await getOrCreateCustomer(env, {
    phone:   orderData.customer_phone,
    name:    sender.name || "",
    fb_psid: sender.fb_psid || null,
    tg_id:   sender.tg_id   || null,
  });

  if (!customer) return "Error: could not create customer profile";

  var existing = await getCustomerOrders(env, customer.phone);
  var order    = await createOrder(env, customer, orderData, source);
  return formatOrderReply(order, existing.length + 1);
}

// 
// COMMAND: #update[n]
// Update fields of record n (or latest)
// 

async function handleCmdUpdate(env, sender, text, num, source) {
  var orderData = extractOrderData(text);

  if (!orderData.customer_phone) {
    return "Error: phone number required\nExample: #update 012345678 new location";
  }

  try {
    orderData.customer_phone = normalizePhone(orderData.customer_phone);
  } catch (e) {
    return "Error: " + e.message;
  }

  var customer = await getOrCreateCustomer(env, {
    phone:   orderData.customer_phone,
    name:    sender.name || "",
    fb_psid: sender.fb_psid || null,
    tg_id:   sender.tg_id   || null,
  });

  if (!customer) return "Error: customer not found";

  var orders = await getCustomerOrders(env, customer.phone);
  if (orders.length === 0) return "Error: no orders found for this customer";

  // get target record
  var targetIndex = num ? num - 1 : orders.length - 1;
  var target      = orders[targetIndex];
  if (!target) return "Error: record #" + num + " not found";

  // build patch
  var patch = { updated_at: new Date().toISOString() };
  if (orderData.customer_location) patch.customer_location = orderData.customer_location;
  if (orderData.order_items.length) patch.order_items = orderData.order_items;
  if (orderData.total > 0)          patch.total = orderData.total;

  await sbUpdate(env, "orders",
    "id=eq." + target.id +
    "&tenant_id=eq." + env.TENANT_ID +
    "&shop_id=eq."   + env.SHOP_ID,
    patch
  );

  return "Updated record #" + (targetIndex + 1) + " (" + target.id.slice(0, 8) + ")\n" +
    (patch.customer_location ? "Location: " + patch.customer_location + "\n" : "") +
    (patch.total > 0 ? "Total: $" + patch.total : "");
}

// 
// COMMAND: #paid[n]
// Pay record n (or latest) OR create new paid order
// 

async function handleCmdPaid(env, sender, text, num, source) {
  var orderData = extractOrderData(text);

  if (!orderData.customer_phone) {
    return "Error: phone number required\nExample: #paid 012345678";
  }

  try {
    orderData.customer_phone = normalizePhone(orderData.customer_phone);
  } catch (e) {
    return "Error: " + e.message;
  }

  var customer = await getOrCreateCustomer(env, {
    phone:   orderData.customer_phone,
    name:    sender.name || "",
    fb_psid: sender.fb_psid || null,
    tg_id:   sender.tg_id   || null,
  });

  if (!customer) return "Error: could not create customer";

  var orders = await getCustomerOrders(env, customer.phone);

  // find target order to update
  var target = null;
  if (orders.length > 0) {
    if (num) {
      target = orders[num - 1] || null;
    } else {
      // find latest unpaid
      for (var i = orders.length - 1; i >= 0; i--) {
        if (orders[i].payment && orders[i].payment.status !== "paid") {
          target = orders[i];
          break;
        }
      }
    }
  }

  if (target) {
    // update existing order payment = paid
    await sbUpdate(env, "orders",
      "id=eq." + target.id +
      "&tenant_id=eq." + env.TENANT_ID +
      "&shop_id=eq."   + env.SHOP_ID,
      {
        payment:    Object.assign({}, target.payment, { status: "paid", paid_at: new Date().toISOString() }),
        updated_at: new Date().toISOString(),
      }
    );
    return "Paid record #" + (orders.indexOf(target) + 1) +
      " (" + target.id.slice(0, 8) + ")\n" +
      "Total: $" + target.total + "\nPayment: Paid";
  }

  // no existing order  create new with paid status
  orderData.payment_method = "paid";
  var newOrder = await createOrder(env, customer, orderData, source, "paid");
  return formatOrderReply(newOrder, orders.length + 1, "Paid");
}

// 
// HELPERS
// 

async function createOrder(env, customer, orderData, source, paymentStatus) {
  paymentStatus = paymentStatus || "unpaid";

  var rows = await sbInsert(env, "orders", {
    tenant_id:         env.TENANT_ID,
    shop_id:           env.SHOP_ID,
    customer_name:     customer.name || orderData.customer_name || "",
    customer_phone:    customer.phone,
    customer_location: orderData.customer_location || "",
    order_items:       orderData.order_items || [],
    subtotal:          orderData.total || 0,
    delivery_fee:      0,
    discount:          0,
    total:             orderData.total || 0,
    status:            "Pending",
    source:            source || "telegram",
    raw_text:          orderData.raw_text || "",
    payment:           { method: "cod", status: paymentStatus },
    delivery_meta:     {},
  }, "representation");

  var order = Array.isArray(rows) ? rows[0] : rows;

  // notify all platforms
  if (order) {
    await notifyAllPlatforms(env, env.SHOP_ID, order, source);
  }

  return order;
}

function formatOrderReply(order, recordNum, paymentStatus) {
  if (!order) return "Error: could not create order";
  paymentStatus = paymentStatus || "Pending payment";

  return [
    "Order #" + recordNum + " created",
    "ID: "     + order.id.slice(0, 8),
    "Name: "   + (order.customer_name  || ""),
    "Phone: "  + (order.customer_phone || ""),
    "Loc: "    + (order.customer_location || ""),
    "Total: $" + (order.total || 0),
    "Status: " + paymentStatus,
  ].join("\n");
}

// 
// MAIN COMMAND DISPATCHER
// Called from FB/TG message handlers
// 


// COMMAND: #bulk - create multiple orders (one per line)
async function handleCmdBulk(env, sender, text, source) {
  if (!text) return "Error: no orders provided\nFormat:\n#bulk\n095222633 location product price$\n012345678 location product price$";

  var lines = text.split("\n").map(function(l) { return l.trim(); }).filter(Boolean);
  if (lines.length === 0) return "Error: no orders found";

  var results = [];
  var errors  = [];

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    // skip lines starting with # (commands within bulk)
    if (line.startsWith("#")) continue;

    // strip line numbers "1. " "2. " etc
    line = line.replace(/^\d+\.\s*/, "");
    var orderData = extractOrderData(line);
    if (!orderData.customer_phone) {
      errors.push("Line " + (i+1) + ": no phone - [" + line.slice(0, 30) + "]");
      continue;
    }

    try {
      orderData.customer_phone = normalizePhone(orderData.customer_phone);
    } catch(e) {
      errors.push("Line " + (i+1) + ": invalid phone");
      continue;
    }

    try {
      var customer = await getOrCreateCustomer(env, {
        phone:   orderData.customer_phone,
        name:    sender.name || "",
        fb_psid: sender.fb_psid || null,
        tg_id:   sender.tg_id   || null,
      });
      var order = await createOrder(env, customer, orderData, source);
      results.push("Order " + (i+1) + ": " + orderData.customer_phone + " $" + orderData.total + " OK");
    } catch(e) {
      errors.push("Line " + (i+1) + ": " + e.message.slice(0, 50));
    }
  }

  var reply = "Bulk: " + results.length + " orders created";
  if (results.length > 0) reply += "\n" + results.join("\n");
  if (errors.length > 0)  reply += "\nErrors:\n" + errors.join("\n");
  return reply;
}

async function dispatchCommand(env, sender, text, source) {
  if (!text) return null;
  // clean text
  text = text.trim().replace(/\.+$/, ""); // remove trailing dots
  var parsed = parseCommand(text);
  if (!parsed) return null;
  var body = parsed.body.trim();
  if (parsed.cmd === "ok")      return handleCmdOk(env, sender, body, source);
  if (parsed.cmd === "new")     return handleCmdNew(env, sender, body, source);
  if (parsed.cmd === "update")  return handleCmdUpdate(env, sender, body, parsed.num, source);
  if (parsed.cmd === "paid")    return handleCmdPaid(env, sender, body, parsed.num, source);
  if (parsed.cmd === "bulk")    return handleCmdBulk(env, sender, body, source);
  if (parsed.cmd === "product") return handleCmdNewProduct(env, sender, body);
  if (parsed.cmd === "stock")   return handleCmdStock(env, sender, body);
  if (parsed.cmd === "price")   return handleCmdPrice(env, sender, body);
  return null;
}

// FACEBOOK WEBHOOK
// 
async function verifyFbSignature(appSecret, bodyText, sigHeader) {
  if (!sigHeader || !sigHeader.startsWith("sha256=")) return false;
  var sig = sigHeader.slice(7);
  var enc = new TextEncoder();
  var key = await crypto.subtle.importKey(
    "raw", enc.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  var signed   = await crypto.subtle.sign("HMAC", key, enc.encode(bodyText));
  var expected = Array.from(new Uint8Array(signed))
    .map(function(b) { return b.toString(16).padStart(2, "0"); }).join("");

  if (sig.length !== expected.length) return false;
  var diff = 0;
  for (var i = 0; i < sig.length; i++) {
    diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

async function fbSend(env, recipientId, text) {
  await fetch(
    "https://graph.facebook.com/v19.0/me/messages?access_token=" + env.FB_ACCESS_TOKEN,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ recipient: { id: recipientId }, message: { text: text } }),
    }
  );
}

async function handleFacebookMessage(env, event) {
  var senderId = event.sender && event.sender.id;
  var text     = (event.message && event.message.text || "").trim();
  if (!senderId || (event.message && event.message.is_echo)) return;

  // upsert customer
  await sbUpsert(env, "customer_profiles", {
    tenant_id: env.TENANT_ID, shop_id: env.SHOP_ID,
    phone: senderId, meta: { fb_psid: senderId },
  }, "tenant_id,shop_id,phone");

  await writeLog(env, {
    source: "facebook", type: "message_received",
    page_id: env.FB_PAGE_ID,
    message: text.slice(0, 200), data: { sender_id: senderId },
  });

  if (text.toLowerCase() === "#help") {
    await fbSend(env, senderId, "Commands:\n#orders - pending orders\n#help - help");
    return;
  }
  if (text.toLowerCase() === "#orders") {
    var orders = await sbSelect(env, "orders",
      "tenant_id=eq." + env.TENANT_ID + "&shop_id=eq." + env.SHOP_ID +
      "&status=eq.Pending&limit=5&order=created_at.desc&select=id,customer_name,total"
    );
    var msg = orders.length
      ? orders.map(function(o) { return o.id.slice(0,8) + " - " + o.customer_name + " $" + o.total; }).join("\n")
      : "No pending orders";
    await fbSend(env, senderId, msg);
    return;
  }

  await fbSend(env, senderId, "Hello! View products: yinboran.github.io/shop");
}

async function handleFacebook(request, env) {
  if (request.method === "GET") {
    var url  = new URL(request.url);
    var mode = url.searchParams.get("hub.mode");
    var tok  = url.searchParams.get("hub.verify_token");
    var ch   = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && tok === env.FB_VERIFY_TOKEN) {
      return new Response(ch, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  var bodyText  = await request.text();
  var sigHeader = request.headers.get("X-Hub-Signature-256") || "";
  var valid     = await verifyFbSignature(env.FB_APP_SECRET, bodyText, sigHeader);

  if (!valid) {
    await writeLog(env, { source: "facebook", type: "sig_invalid", level: "warn", message: "Bad signature" });
    return new Response("Unauthorized", { status: 401 });
  }

  var body = JSON.parse(bodyText);
  for (var i = 0; i < (body.entry || []).length; i++) {
    var entry = body.entry[i];
    for (var j = 0; j < (entry.messaging || []).length; j++) {
      await handleFacebookMessage(env, entry.messaging[j]);
    }
  }
  return new Response("EVENT_RECEIVED", { status: 200 });
}

// 
// TELEGRAM WEBHOOK
// 
async function tgSend(env, chatId, text) {
  await fetch("https://api.telegram.org/bot" + env.TG_TOKEN + "/sendMessage", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ chat_id: chatId, text: text, parse_mode: "HTML" }),
  });
}

async function handleTelegramMessage(env, body) {
  var msg  = body.message || (body.callback_query && body.callback_query.message);
  if (!msg) return;

  var chatId   = msg.chat && msg.chat.id;
  var text     = (msg.text || "").trim();
  var fromId   = msg.from && String(msg.from.id);
  var fromName = [msg.from && msg.from.first_name, msg.from && msg.from.last_name]
    .filter(Boolean).join(" ");

  // ignore all non-private messages
  if (!msg.chat || msg.chat.type !== "private") return;
  if (msg.from && msg.from.is_bot) return;

  // dispatch #ok #new record #update #paid FIRST
  var cmdReply = await dispatchCommand(env,
    { name: fromName, tg_id: fromId },
    text, "telegram"
  );
  if (cmdReply) {
    await tgSend(env, chatId, cmdReply);
    // save customer + log after reply
    try {
      await sbUpsert(env, "customer_profiles", {
        tenant_id: env.TENANT_ID, shop_id: env.SHOP_ID,
        phone: fromId, name: fromName,
        meta: { tg_id: fromId, tg_username: msg.from && msg.from.username },
      }, "tenant_id,shop_id,phone");
    } catch(e) {}
    return;
  }

  try {
    await sbUpsert(env, "customer_profiles", {
      tenant_id: env.TENANT_ID, shop_id: env.SHOP_ID,
      phone: fromId, name: fromName,
      meta: { tg_id: fromId, tg_username: msg.from && msg.from.username },
    }, "tenant_id,shop_id,phone");
  } catch(e) {}

  await writeLog(env, {
    source: "telegram", type: "message_received", page_id: env.TG_PAGE_ID,
    message: text.slice(0, 200), data: { chat_id: chatId, from_id: fromId },
  });

  var cmd = text.toLowerCase().split(" ")[0];

  if (cmd === "/start" || cmd === "/help" || cmd === "#help") {
    await tgSend(env, chatId,
      "YB Store Bot\n\n" +
      "#ok [phone] [location] [product] [price]\n" +
      "  New order (block if unpaid)\n\n" +
      "#new record [phone] [location] [product] [price]\n" +
      "  Add order (allow multiple)\n\n" +
      "#update [phone] [new info]\n" +
      "  Update latest order\n\n" +
      "#paid [phone]\n" +
      "  Mark payment paid\n\n" +
      "/orders  List pending orders"
    );
    return;
  }
  if (cmd === "/orders" || cmd === "#orders") {
    var orders = await sbSelect(env, "orders",
      "tenant_id=eq." + env.TENANT_ID + "&shop_id=eq." + env.SHOP_ID +
      "&status=eq.Pending&limit=5&order=created_at.desc&select=id,customer_name,total,status"
    );
    var msg2 = orders.length
      ? orders.map(function(o) { return "<b>" + o.id.slice(0,8) + "</b> - " + o.customer_name + " $" + o.total; }).join("\n")
      : "No pending orders";
    await tgSend(env, chatId, msg2);
    return;
  }

  await tgSend(env, chatId, "Type /help for commands");
}

async function handleTelegram(request, env) {
  var secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
  if (secret !== env.TG_SECRET) {
    await writeLog(env, { source: "telegram", type: "sig_invalid", level: "warn", message: "Bad secret" });
    return new Response("Unauthorized", { status: 401 });
  }
  var body = await request.json();
  try {
    var msg2 = body.message;
    // group  platform router
    if (msg2 && msg2.chat &&
        (msg2.chat.type === "group" || msg2.chat.type === "supergroup")) {
      await routeTelegramGroup(env_raw, msg2);
    } else {
      await handleTelegramMessage(env, body);
    }
  } catch(e) {
    console.error("TG handler error:", e.message);
    await writeLog(env, { source: "telegram", type: "handler_error", level: "error", message: e.message });
    var chatId = body.message && body.message.chat && body.message.chat.id;
    if (chatId) {
      await tgSend(env, chatId, "Error: " + e.message.slice(0, 100));
    }
  }
  return new Response("ok", { status: 200 });
}

// 
// 
//  POST /api/stock/movement
// Body: { product_id, code, type, qty, note }
// type: in | out | adjust
// 
var STOCK_RULES = {
  type: { required: true  },
  qty:  { required: true, min: 1 },
};

async function handleStockMovement(request, env, cors) {
  var body;
  try { body = await request.json(); }
  catch (e) {
    return jsonResp({
      ok: false, data: null,
      msg: { text: "Invalid JSON", type: "error" },
    }, 400, cors);
  }

  // validate
  try { validate(body, STOCK_RULES); }
  catch (e) {
    return jsonResp({
      ok: false, data: null,
      msg: { text: e.message, type: "error" },
    }, 400, cors);
  }

  var type = body.type; // in | out | adjust
  var qty  = parseInt(body.qty) || 0;
  var note = body.note || "";

  if (!["in","out","adjust"].includes(type)) {
    return jsonResp({
      ok: false, data: null,
      msg: { text: "type must be: in / out / adjust", type: "error" },
    }, 400, cors);
  }

  // find product by id or code
  var shopSince = await getShopSince(env);
  var params = baseParams(env, shopSince).concat([
    "select=id,code,item_name,stock_qty,min_stock",
    "limit=1",
  ]);
  if (body.product_id) params.push("id=eq." + body.product_id);
  else if (body.code)  params.push("code=eq." + encodeURIComponent(body.code.toUpperCase()));
  else return jsonResp({
    ok: false, data: null,
    msg: { text: "product_id or code required", type: "error" },
  }, 400, cors);

  try {
    var rows = await sbSelect(env, "products", params.join("&"));
    if (!rows.length) {
      return jsonResp({
        ok: false, data: null,
        msg: { text: "Product not found", type: "error" },
      }, 404, cors);
    }

    var p       = rows[0];
    var oldQty  = p.stock_qty || 0;
    var newQty  =
      type === "in"     ? oldQty + qty :
      type === "out"    ? Math.max(0, oldQty - qty) :
      /* adjust */        qty;

    // update stock
    await sbUpdate(env, "products",
      "id=eq."         + p.id +
      "&tenant_id=eq." + env.TENANT_ID +
      "&shop_id=eq."   + env.SHOP_ID,
      { stock_qty: newQty, updated_at: new Date().toISOString() }
    );

    // log movement
    await writeLog(env, {
      source:  "api",
      type:    "stock_movement",
      message: p.code + " " + type + " " + qty + " -> " + newQty,
      data: {
        product_id: p.id,
        code:       p.code,
        type:       type,
        qty:        qty,
        old_qty:    oldQty,
        new_qty:    newQty,
        note:       note,
      },
    });

    // invalidate KV catalog
    await kvInvalidateCatalog(env);

    return jsonResp({
      ok: true,
      data: {
        product_id: p.id,
        code:       p.code,
        item_name:  p.item_name,
        old_qty:    oldQty,
        new_qty:    newQty,
        type:       type,
        qty:        qty,
      },
      msg: {
        text: p.code + ": " + oldQty + " -> " + newQty,
        type: "success",
      },
    }, 200, cors);

  } catch (e) {
    return jsonResp({
      ok: false, data: null,
      msg: { text: e.message, type: "error" },
    }, 500, cors);
  }
}


// 
//  GET /api/customer/:phone
// owner + staff only
// KV cache: no TTL, invalidate on write
// 

function kvCustomerKey(env, phone) {
  return "customer:" + env.TENANT_ID + ":" + env.SHOP_ID + ":" + phone;
}

async function kvGetCustomer(env, phone) {
  if (!env.KV) return null;
  try {
    var raw = await env.KV.get(kvCustomerKey(env, phone));
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

async function kvSetCustomer(env, phone, data) {
  if (!env.KV) return;
  try {
    await env.KV.put(kvCustomerKey(env, phone), JSON.stringify(data));
  } catch (e) {}
}

async function kvDeleteCustomer(env, phone) {
  if (!env.KV) return;
  try {
    await env.KV.delete(kvCustomerKey(env, phone));
  } catch (e) {}
}

async function handleGetCustomer(request, env, cors) {
  // TODO: re-enable auth when JWT login flow complete
  // var role = await getRole(request, env);
  // if (role === "public" || role === "customer") return jsonResp({ok:false,data:null,msg:{text:"Unauthorized",type:"error"}},403,cors);

  var url   = new URL(request.url);
  var phone = url.pathname.split("/").pop();

  // normalize phone
  try { phone = normalizePhone(phone); }
  catch (e) {
    return jsonResp({
      ok: false, data: null,
      msg: { text: e.message, type: "error" },
    }, 400, cors);
  }

  // KV check
  var cached = await kvGetCustomer(env, phone);
  if (cached) {
    return jsonResp({
      ok: true, data: cached, source: "kv",
      msg: { text: "", type: "" },
    }, 200, cors);
  }

  // DB fetch
  try {
    // profile
    var profiles = await sbSelect(env, "customer_profiles",
      baseParams(env).concat([
        "phone=eq." + encodeURIComponent(phone),
        "select=id,phone,name,meta,created_at",
        "limit=1",
      ]).join("&")
    );

    // orders  sorted ASC for record numbering
    var orders = await sbSelect(env, "orders",
      baseParams(env).concat([
        "customer_phone=eq." + encodeURIComponent(phone),
        "select=id,order_items,total,status,payment,source,created_at",
        "order=created_at.asc",
        "limit=200",
      ]).join("&")
    );

    // summary
    var totalSpent = orders
      .filter(function(o) { return o.payment && o.payment.status === "paid"; })
      .reduce(function(s, o) { return s + parseFloat(o.total || 0); }, 0);

    var unpaidCount = orders
      .filter(function(o) { return !o.payment || o.payment.status !== "paid"; })
      .length;

    var result = {
      profile:      profiles[0] || null,
      orders:       orders,
      summary: {
        order_count:  orders.length,
        total_spent:  parseFloat(totalSpent.toFixed(2)),
        unpaid_count: unpaidCount,
        first_order:  orders[0]          ? orders[0].created_at          : null,
        last_order:   orders[orders.length - 1] ? orders[orders.length - 1].created_at : null,
      },
    };

    // save KV (no TTL)
    await kvSetCustomer(env, phone, result);

    return jsonResp({
      ok: true, data: result, source: "db",
      msg: { text: "", type: "" },
    }, 200, cors);

  } catch (e) {
    return jsonResp({
      ok: false, data: null,
      msg: { text: e.message, type: "error" },
    }, 500, cors);
  }
}


// MAIN ROUTER
// 
// 
// FIELD SELECT  per role, per view
// Never expose secret fields to wrong role
// 
var FIELD_SELECT = {
  public:   "id,code,item_name,category,image_url,retail_price,stock_qty,is_featured,translations",
  feed:     "id,code,item_name,image_url,images,description,retail_price",
  customer: "id,code,item_name,category,image_url,video_url,retail_price,stock_qty,is_featured,translations,description",
  staff:    "id,code,item_name,category,image_url,retail_price,stock_qty,min_stock,is_featured,translations",
  owner:    "id,code,item_name,category,description,image_url,video_url,wholesale_price,retail_price,stock_qty,min_stock,is_published,is_featured,attributes,translations,created_at,updated_at",
};

// 
// BASE PARAMS  mandatory every query, no exception
// tenant_id + shop_id injected from env (CF Secrets)
// user body NEVER contains these
// 
function baseParams(env, since) {
  var p = [
    "tenant_id=eq." + env.TENANT_ID,
    "shop_id=eq."   + env.SHOP_ID,
  ];
  if (since) p.push("created_at=gte." + since);
  return p;
}

async function getShopSince(env) {
  try {
    var rows = await sbSelect(env, "shops",
      "id=eq." + env.SHOP_ID + "&select=created_at&limit=1"
    );
    return rows.length ? rows[0].created_at : "2000-01-01T00:00:00Z";
  } catch (e) {
    return "2000-01-01T00:00:00Z";
  }
}

// 
// ROLE from JWT
// 
async function getRole(request, env) {
  var user = await verifyJwt(request, env);
  if (!user) return "public";
  // owner = same tenant
  if (user.tenant_id === env.TENANT_ID) return "owner";
  if (user.role === "staff" || user.role === "shipper") return "staff";
  return "customer";
}

// 
//  GET /api/stats?type=orders|revenue|products|customers|all
// 
async function handleGetStats(request, env, cors) {
  var url  = new URL(request.url);
  var type = url.searchParams.get("type") || "all";
  // TODO: re-enable auth when JWT login flow complete
  // var role = await getRole(request, env);
  // if (role !== "owner") return jsonResp({ok:false,data:null,msg:{text:"Unauthorized",type:"error"}},403,cors);

  try {
    var since = await getShopSince(env);
    var data = {};

    // orders stats
    if (type === "orders" || type === "all") {
      var orders = await sbSelect(env, "orders",
        baseParams(env, since).concat([
          "select=id,status,payment,total,created_at",
          "limit=10000",
        ]).join("&")
      );
      var today = new Date().toISOString().slice(0, 10);
      data.orders = {
        total:      orders.length,
        pending:    orders.filter(function(o){ return o.status === "Pending"; }).length,
        delivering: orders.filter(function(o){ return o.status === "Delivering"; }).length,
        completed:  orders.filter(function(o){ return o.status === "Completed"; }).length,
        cancelled:  orders.filter(function(o){ return o.status === "Cancelled"; }).length,
        today:      orders.filter(function(o){ return (o.created_at||"").slice(0,10) === today; }).length,
      };
      data.revenue = {
        total:  orders.reduce(function(s,o){ return s + parseFloat(o.total||0); }, 0).toFixed(2),
        paid:   orders.filter(function(o){ return o.payment && o.payment.status === "paid"; })
                      .reduce(function(s,o){ return s + parseFloat(o.total||0); }, 0).toFixed(2),
        unpaid: orders.filter(function(o){ return !o.payment || o.payment.status !== "paid"; })
                      .reduce(function(s,o){ return s + parseFloat(o.total||0); }, 0).toFixed(2),
        today:  orders.filter(function(o){ return (o.created_at||"").slice(0,10) === today; })
                      .reduce(function(s,o){ return s + parseFloat(o.total||0); }, 0).toFixed(2),
      };
    }

    // products stats
    if (type === "products" || type === "all") {
      var products = await sbSelect(env, "products",
        baseParams(env, since).concat([
          "select=id,stock_qty,min_stock,is_published",
          "limit=10000",
        ]).join("&")
      );
      data.products = {
        total:     products.length,
        published: products.filter(function(p){ return p.is_published; }).length,
        low_stock: products.filter(function(p){ return p.stock_qty > 0 && p.stock_qty <= p.min_stock; }).length,
        out_stock: products.filter(function(p){ return p.stock_qty <= 0; }).length,
      };
    }

    // customers stats
    if (type === "customers" || type === "all") {
      var customers = await sbSelect(env, "customer_profiles",
        baseParams(env, since).concat([
          "select=id,created_at",
          "limit=10000",
        ]).join("&")
      );
      var today2 = new Date().toISOString().slice(0, 10);
      data.customers = {
        total:     customers.length,
        new_today: customers.filter(function(c){ return (c.created_at||"").slice(0,10) === today2; }).length,
      };
    }

    return jsonResp({
      ok: true,
      data: data,
      meta: { type: type },
      msg: { text: "", type: "" },
    }, 200, cors);

  } catch (e) {
    return jsonResp({
      ok: false, data: null,
      msg: { text: e.message, type: "error" },
    }, 500, cors);
  }
}

// 
// UPDATE handleGetProducts  enforce baseParams + role fields
// 
async function handleGetProducts(request, env, cors) {
  var url      = new URL(request.url);
  var view     = url.searchParams.get("view")     || "public";
  var search   = url.searchParams.get("q")        || "";
  var category = url.searchParams.get("cat")      || "";
  var page     = parseInt(url.searchParams.get("page") || "1");
  var pageSize = 20;
  var offset   = (page - 1) * pageSize;
  var bypassKv = url.searchParams.get("fresh") === "1";

  // role  fields
  var role   = await getRole(request, env);
  var fields = view === "feed"
    ? FIELD_SELECT.feed
    : role === "owner"
    ? FIELD_SELECT.owner
    : role === "staff"
    ? FIELD_SELECT.staff
    : FIELD_SELECT.public;

  // KV cache (public + no filters only)
  var useCache = view !== "feed" && !search && !category && !bypassKv && role === "public";
  if (useCache) {
    var cached = await kvGetCatalog(env);
    if (cached) {
      var start  = offset;
      var end    = start + pageSize;
      return jsonResp({
        ok: true,
        data: cached.slice(start, end),
        meta: { total: cached.length, page: page, pageSize: pageSize, source: "kv" },
        msg:  { text: "", type: "" },
      }, 200, cors);
    }
  }

  // build params  baseParams ALWAYS first
  var params = baseParams(env).concat([
    "is_published=eq.true",
    "order=created_at.desc",
    "limit=" + pageSize,
    "offset=" + offset,
    "select=" + fields,
  ]);
  if (category) params.push("category=eq." + encodeURIComponent(category));
  if (search)   params.push("item_name=ilike.*" + encodeURIComponent(search) + "*");
  // owner can see unpublished
  if (role === "owner") {
    params = params.filter(function(p){ return p !== "is_published=eq.true"; });
  }

  try {
    var products = await sbSelect(env, "products", params.join("&"));

    // save full list to KV (page 1, public, no filters)
    if (useCache && page === 1) await kvSetCatalog(env, products);

    return jsonResp({
      ok: true,
      data: products,
      meta: { page: page, pageSize: pageSize, source: "db" },
      msg:  { text: "", type: "" },
    }, 200, cors);
  } catch (e) {
    return jsonResp({
      ok: false, data: [],
      msg: { text: e.message, type: "error" },
    }, 500, cors);
  }
}


// 
//  GET /api/customer/:phone
// owner + staff only
// KV cache: no TTL, invalidate on write
// 

// 
// UPLOAD HANDLER
// POST /api/upload
// body: { file: base64, name, type }  (image or video)
// returns: { url, url_thumb, hash, type, size }
// 

var THUMB_SIZE   = 200;    // px
var MAX_IMAGES   = 10;
var MAX_IMG_SIZE = 5 * 1024 * 1024;   // 5MB
var MAX_VID_SIZE = 50 * 1024 * 1024;  // 50MB

//  Hash file 
async function hashFile(bytes) {
  var buf  = bytes instanceof Uint8Array ? bytes.buffer : bytes;
  var hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map(function(b) { return b.toString(16).padStart(2, "0"); })
    .join("");
}

//  base64  Uint8Array 
function base64ToBytes(b64) {
  var clean  = b64.replace(/^data:[^;]+;base64,/, "");
  var binary = atob(clean);
  var bytes  = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

//  Detect media type 
function detectType(name, mimeType) {
  var mime = (mimeType || "").toLowerCase();
  var ext  = (name    || "").split(".").pop().toLowerCase();
  if (mime.startsWith("video/") || ["mp4","mov","webm","avi"].includes(ext)) return "video";
  return "image";
}

function getExt(name, mimeType) {
  var mime = (mimeType || "").toLowerCase();
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/png")  return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif")  return "gif";
  if (mime === "video/mp4")  return "mp4";
  if (mime === "video/webm") return "webm";
  if (mime === "video/quicktime") return "mov";
  return (name || "file").split(".").pop() || "jpg";
}

//  R2 public URL 
function r2Url(env, key) {
  var base = (env.R2_PUBLIC_URL || "").replace(/\/$/, "");
  return base + "/" + key;
}

//  Store to R2 (with dedup) 
async function storeR2(env, bytes, key, contentType) {
  if (!env.R2) throw new Error("R2 not configured");

  // dedup check
  var existing = await env.R2.head(key);
  if (existing) return r2Url(env, key); // already exists

  await env.R2.put(key, bytes.buffer, {
    httpMetadata: { contentType: contentType },
    customMetadata: { uploaded: new Date().toISOString() },
  });
  return r2Url(env, key);
}

//  CF Image resize URL (thumb) 
function thumbUrl(env, originalUrl) {
  // CF Image Resizing: /cdn-cgi/image/width=200,quality=80,format=webp/<url>
  var workerUrl = (env.WORKER_URL || "https://mr.yinboran.workers.dev");
  return workerUrl + "/cdn-cgi/image/width=" + THUMB_SIZE + ",quality=75,format=webp/" + originalUrl;
}

//  POST /api/upload 
async function handleUpload(request, env, cors) {
  var body;
  try { body = await request.json(); }
  catch (e) {
    return jsonResp({ ok: false, data: null, msg: { text: "Invalid JSON", type: "error" } }, 400, cors);
  }

  if (!body.file) {
    return jsonResp({ ok: false, data: null, msg: { text: "file required", type: "error" } }, 400, cors);
  }

  var mediaType = detectType(body.name, body.mime_type);
  var ext       = getExt(body.name, body.mime_type);
  var bytes     = base64ToBytes(body.file);
  var size      = bytes.length;

  // size check
  var maxSize = mediaType === "video" ? MAX_VID_SIZE : MAX_IMG_SIZE;
  if (size > maxSize) {
    return jsonResp({
      ok: false, data: null,
      msg: { text: "File too large (max " + (maxSize / 1024 / 1024) + "MB)", type: "error" },
    }, 400, cors);
  }

  try {
    var hash       = await hashFile(bytes);
    var r2Key      = "media/" + env.SHOP_ID + "/" + hash + "." + ext;
    var contentType= mediaType === "video" ? "video/" + ext : "image/" + ext;

    // store original
    var url = await storeR2(env, bytes, r2Key, contentType);

    // thumb URL (CF image resizing  works for images only)
    var urlThumb = mediaType === "image" ? thumbUrl(env, url) : url;

    return jsonResp({
      ok: true,
      data: {
        url:       url,
        url_thumb: urlThumb,
        hash:      hash,
        type:      mediaType,
        ext:       ext,
        size:      size,
        views:     0,
      },
      msg: { text: "", type: "" },
    }, 200, cors);

  } catch (e) {
    return jsonResp({
      ok: false, data: null,
      msg: { text: e.message, type: "error" },
    }, 500, cors);
  }
}

//  POST /api/products/:id/view/:idx 
async function handleProductView(request, env, cors, productId, imgIdx) {
  var since = await getShopSince(env);

  try {
    var rows = await sbSelect(env, "products",
      baseParams(env, since).concat([
        "id=eq." + productId,
        "select=id,images,image_url",
        "limit=1",
      ]).join("&")
    );

    if (!rows.length) return jsonResp({ ok: false, data: null, msg: { text: "not found", type: "error" } }, 404, cors);

    var p      = rows[0];
    var images = Array.isArray(p.images) ? p.images : [];
    var idx    = parseInt(imgIdx) || 0;

    if (idx < 0 || idx >= images.length) {
      return jsonResp({ ok: false, data: null, msg: { text: "invalid index", type: "error" } }, 400, cors);
    }

    // increment views
    images[idx] = Object.assign({}, images[idx], { views: ((images[idx].views || 0) + 1) });

    // sort by views DESC
    images.sort(function(a, b) { return (b.views || 0) - (a.views || 0); });

    // update image_url = most viewed
    var newImageUrl = images[0] && images[0].url ? images[0].url : p.image_url;

    await sbUpdate(env, "products",
      "id=eq."         + productId +
      "&tenant_id=eq." + env.TENANT_ID +
      "&shop_id=eq."   + env.SHOP_ID,
      { images: images, image_url: newImageUrl, updated_at: new Date().toISOString() }
    );

    // invalidate catalog cache
    await kvInvalidateCatalog(env);

    return jsonResp({
      ok: true,
      data: { images: images, image_url: newImageUrl },
      msg: { text: "", type: "" },
    }, 200, cors);

  } catch (e) {
    return jsonResp({ ok: false, data: null, msg: { text: e.message, type: "error" } }, 500, cors);
  }
}


// 
// FEEDS REBUILD
// POST /api/feeds/rebuild
// fetch platforms  loop each  build feed  store R2/KV
// 

var CATALOG_URL = "https://yb-app.github.io/home/s/";

//  Build FB catalog format 
function buildFBCatalog(products, shopId) {
  return {
    data: products.map(function(p) {
      var imgs = Array.isArray(p.images) ? p.images : [];
      var additionalImgs = imgs
        .slice(1, 10)
        .map(function(i) { return typeof i === "object" ? i.url : i; })
        .filter(Boolean)
        .join(",");

      return {
        id:                    p.code,
        title:                 p.item_name,
        description:           p.description || p.item_name,
        price:                 parseFloat(p.retail_price || 0).toFixed(2) + " USD",
        image_link:            p.image_url || "",
        additional_image_link: additionalImgs || undefined,
        availability:          (p.stock_qty || 0) > 0 ? "in stock" : "out of stock",
        condition:             "new",
        link:                  CATALOG_URL + shopId + "/" + p.code,
        brand:                 "YB 9999",
      };
    }),
  };
}

//  Build TG feed format (compact) 
function buildTGFeed(products) {
  return products.map(function(p) {
    return {
      code:      p.code,
      name:      p.item_name,
      price:     parseFloat(p.retail_price || 0),
      stock:     p.stock_qty || 0,
      thumb:     p.image_url || "",
      category:  p.category || "",
    };
  });
}

//  Build TK catalog format (same as FB) 
function buildTKCatalog(products, shopId) {
  return buildFBCatalog(products, shopId);
}

//  Store feed to R2 
async function storeFeedR2(env, key, data) {
  if (!env.R2) return null;
  var json  = JSON.stringify(data);
  var bytes = new TextEncoder().encode(json);
  await env.R2.put(key, bytes.buffer, {
    httpMetadata: { contentType: "application/json" },
    customMetadata: { rebuilt: new Date().toISOString() },
  });
  return r2Url(env, key);
}

//  Store feed to KV 
async function storeFeedKV(env, key, data) {
  if (!env.KV) return null;
  await env.KV.put(key, JSON.stringify(data), { expirationTtl: CATALOG_TTL });
  return key;
}

//  POST /api/feeds/rebuild 
async function handleFeedsRebuild(request, env, cors) {
  var since = await getShopSince(env);

  try {
    // fetch all published products (owner fields)
    var products = await sbSelect(env, "products",
      baseParams(env, since).concat([
        "is_published=eq.true",
        "order=created_at.desc",
        "limit=1000",
        "select=id,code,item_name,category,description,image_url,images,retail_price,stock_qty,translations",
      ]).join("&")
    );

    // fetch active platforms
    var platforms = await sbSelect(env, "platforms",
      baseParams(env).concat([
        "is_active=eq.true",
        "select=id,type,external_id,config,notify_orders",
      ]).join("&")
    );

    var rebuilt = [];

    for (var i = 0; i < platforms.length; i++) {
      var p = platforms[i];

      if (p.type === "facebook") {
        // FB catalog  R2
        var fbData = buildFBCatalog(products, env.SHOP_ID);
        var fbKey  = "feeds/fb_" + p.external_id + ".json";
        var fbUrl  = await storeFeedR2(env, fbKey, fbData);
        // also KV
        await storeFeedKV(env, "fb_feed:" + env.TENANT_ID + ":" + p.id, fbData);
        rebuilt.push({ platform: p.id, type: "facebook", r2: fbKey, count: fbData.data.length });
      }

      if (p.type === "telegram") {
        // TG list  KV only (fast read)
        var tgData = buildTGFeed(products);
        var tgKey  = "tg_feed:" + env.TENANT_ID + ":" + env.SHOP_ID + ":" + p.id;
        await storeFeedKV(env, tgKey, tgData);
        rebuilt.push({ platform: p.id, type: "telegram", kv: tgKey, count: tgData.length });
      }

      if (p.type === "tiktok") {
        // TK catalog  R2
        var tkData = buildTKCatalog(products, env.SHOP_ID);
        var tkKey  = "feeds/tk_" + p.external_id + ".json";
        var tkUrl  = await storeFeedR2(env, tkKey, tkData);
        await storeFeedKV(env, "tk_feed:" + env.TENANT_ID + ":" + p.id, tkData);
        rebuilt.push({ platform: p.id, type: "tiktok", r2: tkKey, count: tkData.data.length });
      }
    }

    // also rebuild shop catalog KV
    await kvSetCatalog(env, products);
    rebuilt.push({ platform: "web", type: "catalog", kv: kvCatalogKey(env), count: products.length });

    await writeLog(env, {
      source: "api", type: "feeds_rebuilt",
      message: "Rebuilt " + rebuilt.length + " feeds, " + products.length + " products",
      data: { rebuilt: rebuilt },
    });

    return jsonResp({
      ok: true,
      data: {
        products_count: products.length,
        platforms:      rebuilt,
      },
      msg: { text: "Feeds rebuilt: " + rebuilt.length + " platforms", type: "success" },
    }, 200, cors);

  } catch (e) {
    return jsonResp({
      ok: false, data: null,
      msg: { text: e.message, type: "error" },
    }, 500, cors);
  }
}


// 
// TG GROUP COMMANDS
// #deliver [order_id] [shipper_phone]
// #done    [order_id]
// #cancel  [order_id]
// Only from group/supergroup chat
// Sender must be in user_permissions
// 

//  Check if sender has permission in group 
async function checkGroupPermission(env, tgId) {
  try {
    // lookup customer_profiles by tg_id
    var profiles = await sbSelect(env, "customer_profiles",
      baseParams(env).concat([
        "meta->>tg_id=eq." + tgId,
        "select=id",
        "limit=1",
      ]).join("&")
    );
    if (!profiles.length) return null;
    var profileId = profiles[0].id;

    // check user_permissions
    var rows = await sbSelect(env, "user_permissions",
      baseParams(env).concat([
        "profile_id=eq." + profileId,
        "status=eq.active",
        "select=id,permissions,is_admin,label",
        "limit=1",
      ]).join("&")
    );
    // if is_admin or has permissions  allow
    if (rows.length) return rows[0];
    // owner (is_admin=true) fallback
    return null;
  } catch (e) {
    return null;
  }
}

//  Find order by short ID or full ID 
async function findOrderById(env, orderId) {
  var since = await getShopSince(env);
  try {
    // try full UUID first
    if (orderId.length === 36) {
      var rows = await sbSelect(env, "orders",
        baseParams(env, since).concat([
          "id=eq." + orderId,
          "select=id,customer_name,customer_phone,total,status,payment,delivery_meta",
          "limit=1",
        ]).join("&")
      );
      if (rows.length) return rows[0];
    }
    // try short ID (first 8 chars)
    var rows2 = await sbSelect(env, "orders",
      baseParams(env, since).concat([
        "id=like." + orderId + "*",
        "select=id,customer_name,customer_phone,total,status,payment,delivery_meta",
        "limit=1",
      ]).join("&")
    );
    return rows2.length ? rows2[0] : null;
  } catch (e) {
    return null;
  }
}

//  #deliver [order_id] [shipper_phone] 
async function handleCmdDeliver(env, sender, text) {
  var parts        = text.trim().split(/\s+/);
  var orderId      = parts[0] || "";
  var shipperPhone = parts[1] || sender.phone || "";

  if (!orderId) return "Error: order_id required\nExample: #deliver abc12345 095222633";

  // normalize shipper phone
  if (shipperPhone) {
    try { shipperPhone = normalizePhone(shipperPhone); } catch (_) {}
  }

  var order = await findOrderById(env, orderId);
  if (!order) return "Error: order " + orderId + " not found";
  if (order.status === "Delivering") return "Already delivering: " + order.id.slice(0, 8);
  if (order.status === "Completed")  return "Already completed: " + order.id.slice(0, 8);
  if (order.status === "Cancelled")  return "Order cancelled: " + order.id.slice(0, 8);

  var deliveryMeta = Object.assign({}, order.delivery_meta || {}, {
    shipper_phone:  shipperPhone,
    shipper_tg_id:  sender.tg_id || "",
    receive_date:   new Date().toISOString(),
  });

  try {
    await sbUpdate(env, "orders",
      "id=eq."         + order.id +
      "&tenant_id=eq." + env.TENANT_ID +
      "&shop_id=eq."   + env.SHOP_ID,
      {
        status:       "Delivering",
        delivery_meta: deliveryMeta,
        updated_at:   new Date().toISOString(),
      }
    );

    // invalidate customer KV
    if (order.customer_phone) await kvDeleteCustomer(env, order.customer_phone);

    await writeLog(env, {
      source: "telegram", type: "order_delivering",
      message: "Delivering: " + order.id.slice(0, 8) + " shipper: " + shipperPhone,
    });

    return "Delivering order: " + order.id.slice(0, 8) +
      "\nCustomer: " + (order.customer_name || "") +
      "\nPhone: "    + (order.customer_phone || "") +
      "\nTotal: $"   + (order.total || 0) +
      "\nShipper: "  + (shipperPhone || "unassigned");
  } catch (e) {
    return "Error: " + e.message.slice(0, 100);
  }
}

//  #done [order_id] 
async function handleCmdDone(env, sender, text) {
  var orderId = text.trim().split(/\s+/)[0] || "";
  if (!orderId) return "Error: order_id required\nExample: #done abc12345";

  var order = await findOrderById(env, orderId);
  if (!order) return "Error: order " + orderId + " not found";
  if (order.status === "Completed") return "Already completed: " + order.id.slice(0, 8);
  if (order.status === "Cancelled") return "Order cancelled: "   + order.id.slice(0, 8);

  var deliveryMeta = Object.assign({}, order.delivery_meta || {}, {
    delivery_date: new Date().toISOString(),
  });

  try {
    await sbUpdate(env, "orders",
      "id=eq."         + order.id +
      "&tenant_id=eq." + env.TENANT_ID +
      "&shop_id=eq."   + env.SHOP_ID,
      {
        status:        "Completed",
        delivery_meta: deliveryMeta,
        updated_at:    new Date().toISOString(),
      }
    );

    if (order.customer_phone) await kvDeleteCustomer(env, order.customer_phone);

    await writeLog(env, {
      source: "telegram", type: "order_completed",
      message: "Completed: " + order.id.slice(0, 8),
    });

    return "Completed order: " + order.id.slice(0, 8) +
      "\nCustomer: " + (order.customer_name || "") +
      "\nTotal: $"   + (order.total || 0) +
      "\nPayment: "  + (order.payment && order.payment.status || "unpaid");
  } catch (e) {
    return "Error: " + e.message.slice(0, 100);
  }
}

//  #cancel [order_id] 
async function handleCmdCancel(env, sender, text) {
  var orderId = text.trim().split(/\s+/)[0] || "";
  if (!orderId) return "Error: order_id required\nExample: #cancel abc12345";

  var order = await findOrderById(env, orderId);
  if (!order) return "Error: order " + orderId + " not found";
  if (order.status === "Cancelled")  return "Already cancelled: " + order.id.slice(0, 8);
  if (order.status === "Completed")  return "Already completed  cannot cancel: " + order.id.slice(0, 8);

  var deliveryMeta = Object.assign({}, order.delivery_meta || {}, {
    cancel_date: new Date().toISOString(),
    cancelled_by: sender.tg_id || "",
  });

  try {
    await sbUpdate(env, "orders",
      "id=eq."         + order.id +
      "&tenant_id=eq." + env.TENANT_ID +
      "&shop_id=eq."   + env.SHOP_ID,
      {
        status:        "Cancelled",
        delivery_meta: deliveryMeta,
        updated_at:    new Date().toISOString(),
      }
    );

    // stock auto-restored by DB trigger fn_update_stock
    if (order.customer_phone) await kvDeleteCustomer(env, order.customer_phone);

    await writeLog(env, {
      source: "telegram", type: "order_cancelled",
      message: "Cancelled: " + order.id.slice(0, 8),
    });

    return "Cancelled order: " + order.id.slice(0, 8) +
      "\nCustomer: " + (order.customer_name || "") +
      "\nTotal: $"   + (order.total || 0) +
      "\nStock: auto-restored";
  } catch (e) {
    return "Error: " + e.message.slice(0, 100);
  }
}

//  GROUP MESSAGE DISPATCHER 
async function handleTelegramGroupMessage(env, msg) {
  var text   = (msg.text || "").trim();
  var fromId = msg.from && String(msg.from.id);
  var chatId = msg.chat && msg.chat.id;

  if (!text.startsWith("#")) return;

  // check permission
  var perm = await checkGroupPermission(env, fromId);
  if (!perm) {
    await tgSend(env, chatId, "Unauthorized  contact admin");
    return;
  }

  var lower = text.toLowerCase();
  var reply = null;
  var sender = { tg_id: fromId, phone: "" };

  if (lower.startsWith("#deliver")) {
    reply = await handleCmdDeliver(env, sender, text.slice(8).trim());
  } else if (lower.startsWith("#done")) {
    reply = await handleCmdDone(env, sender, text.slice(5).trim());
  } else if (lower.startsWith("#cancel")) {
    reply = await handleCmdCancel(env, sender, text.slice(7).trim());
  } else if (lower.startsWith("#orders")) {
    var since  = await getShopSince(env);
    var orders = await sbSelect(env, "orders",
      baseParams(env, since).concat([
        "status=eq.Pending",
        "order=created_at.desc",
        "limit=10",
        "select=id,customer_name,total,status,payment",
      ]).join("&")
    );
    reply = orders.length
      ? orders.map(function(o, i) {
          return (i+1) + ". " + o.id.slice(0,8) + " - " + (o.customer_name||"") + " $" + o.total;
        }).join("\n")
      : "No pending orders";
  }

  if (reply) await tgSend(env, chatId, reply);
}


// 
// PLATFORM ROUTER
// 1 bot, all tenants
// route by external_id  lookup platforms  get tenant+shop
// 

//  Lookup tenant+shop by platform external_id 
async function getPlatformByExternalId(env, externalId, type) {
  try {
    var rows = await sbSelect(env, "platforms",
      "external_id=eq." + encodeURIComponent(externalId) +
      "&type=eq."       + type +
      "&is_active=eq.true" +
      "&select=id,tenant_id,shop_id,config,notify_orders" +
      "&limit=1"
    );
    return rows.length ? rows[0] : null;
  } catch (e) {
    return null;
  }
}

//  Detect message role by content 
function detectMessageRole(text) {
  if (!text) return null;

  // PayWay payment notification
  if (/paid by .+ via ABA/i.test(text))         return "payway";
  if (/Trx\.\s*ID:/i.test(text))                return "payway";
  if (/APV:\s*\d+/i.test(text))                 return "payway";

  // Express delivery notification
  if (/VET EXPRESS/i.test(text))                return "express";
  if (/J&T|Kerry|DHL|CamEx|Ninja/i.test(text)) return "express";

  // Stock commands
  if (/^#stock|^#price|^#new product/i.test(text.trim())) return "stock";

  // Order commands
  if (/^#ok|^#new\s+record|^#paid|^#bulk|^#update/i.test(text.trim())) return "orders";

  // Register command
  if (/^\/register/i.test(text.trim())) return "register";

  return null;
}

//  Parse PayWay message 
function parsePayWayMessage(text) {
  var result = {
    amount:   0,
    currency: "USD",
    name:     "",
    card:     "",
    trxId:    "",
    apv:      "",
    method:   "",
  };

  // amount: $100.00 or 23,600,000
  var usdMatch = text.match(/\$([0-9,]+(?:\.[0-9]{2})?)/);
  var khrMatch = text.match(/([0-9,]+)/);
  if (usdMatch) {
    result.amount   = parseFloat(usdMatch[1].replace(/,/g, ""));
    result.currency = "USD";
  } else if (khrMatch) {
    result.amount   = parseFloat(khrMatch[1].replace(/,/g, ""));
    result.currency = "KHR";
  }

  // name: "paid by YIM THIDA"
  var nameMatch = text.match(/paid by ([A-Z\s]+)\s*\(/i);
  if (nameMatch) result.name = nameMatch[1].trim();

  // card: (*360)
  var cardMatch = text.match(/\(\*(\d+)\)/);
  if (cardMatch) result.card = cardMatch[1];

  // method: "via ABA PAY"
  var methodMatch = text.match(/via ([A-Z\s]+?) at/i);
  if (methodMatch) result.method = methodMatch[1].trim();

  // Trx. ID
  var trxMatch = text.match(/Trx\.\s*ID:\s*([0-9]+)/i);
  if (trxMatch) result.trxId = trxMatch[1];

  // APV
  var apvMatch = text.match(/APV:\s*([0-9]+)/i);
  if (apvMatch) result.apv = apvMatch[1];

  return result;
}

//  Handle PayWay message 
async function handlePayWayMessage(env, chatId, text) {
  var pw = parsePayWayMessage(text);
  if (!pw.trxId && !pw.apv) return;

  var since = await getShopSince(env);

  // match order by APV
  var orders = [];
  if (pw.apv) {
    orders = await sbSelect(env, "orders",
      baseParams(env, since).concat([
        "payment->>apv=eq." + pw.apv,
        "select=id,customer_name,customer_phone,total,payment",
        "limit=1",
      ]).join("&")
    );
  }

  // fallback: match by amount + unpaid
  if (!orders.length && pw.amount > 0) {
    orders = await sbSelect(env, "orders",
      baseParams(env, since).concat([
        "total=eq."            + pw.amount,
        "payment->>status=eq.unpaid",
        "order=created_at.desc",
        "select=id,customer_name,customer_phone,total,payment",
        "limit=1",
      ]).join("&")
    );
  }

  if (!orders.length) {
    await tgSend(env, chatId,
      "PayWay: $" + pw.amount + " received\nNo matching order found\nTrx: " + pw.trxId
    );
    return;
  }

  var order = orders[0];

  // update payment
  var newPayment = Object.assign({}, order.payment || {}, {
    status:  "paid",
    method:  "khqr",
    trx_id:  pw.trxId,
    apv:     pw.apv,
    amount:  pw.amount,
    currency:pw.currency,
    paid_by: pw.name,
    paid_at: new Date().toISOString(),
  });

  await sbUpdate(env, "orders",
    "id=eq."         + order.id +
    "&tenant_id=eq." + env.TENANT_ID +
    "&shop_id=eq."   + env.SHOP_ID,
    { payment: newPayment, updated_at: new Date().toISOString() }
  );

  if (order.customer_phone) await kvDeleteCustomer(env, order.customer_phone);

  await tgSend(env, chatId,
    "Paid: " + order.id.slice(0, 8) +
    "\nCustomer: " + (order.customer_name || "") +
    "\nAmount: $"  + pw.amount +
    "\nAPV: "      + pw.apv +
    "\nTrx: "      + pw.trxId
  );
}

//  Handle /register [tenant_key] 
async function handleRegisterGroup(env, chatId, text, fromId) {
  var parts     = text.trim().split(/\s+/);
  var tenantKey = parts[1] || "";

  if (!tenantKey) {
    await tgSend(env, chatId, "Usage: /register [tenant_key]\nExample: /register yb9999");
    return;
  }

  // lookup tenant by key
  try {
    var tenants = await sbSelect(env, "tenants",
      "tenant_key=eq." + encodeURIComponent(tenantKey) +
      "&select=id,name,id&limit=1"
    );

    if (!tenants.length) {
      await tgSend(env, chatId, "Error: tenant key '" + tenantKey + "' not found");
      return;
    }

    var tenant = tenants[0];

    // get default shop
    var shops = await sbSelect(env, "shops",
      "tenant_id=eq." + tenant.id +
      "&status=eq.active" +
      "&select=id,name&limit=1"
    );

    if (!shops.length) {
      await tgSend(env, chatId, "Error: no active shop for " + tenantKey);
      return;
    }

    var shop = shops[0];

    // upsert platform
    await sbUpsert(env, "platforms", {
      tenant_id:    tenant.id,
      shop_id:      shop.id,
      type:         "telegram",
      external_id:  String(chatId),
      name:         tenantKey + " TG Group",
      is_active:    true,
      notify_orders:true,
      config:       { role: "auto", tg_group_id: String(chatId) },
    }, "tenant_id,shop_id,external_id");

    await tgSend(env, chatId,
      "Registered: " + tenant.name + " / " + shop.name +
      "\nGroup: " + chatId +
      "\nYB Bot is now active in this group."
    );
  } catch (e) {
    await tgSend(env, chatId, "Error: " + e.message.slice(0, 100));
  }
}

//  MAIN TG GROUP ROUTER 
async function routeTelegramGroup(env_raw, msg) {
  var chatId   = msg.chat && msg.chat.id;
  var text     = (msg.text || "").trim();
  var fromId   = msg.from && String(msg.from.id);
  var fromBot  = msg.from && msg.from.is_bot;

  if (!chatId) return;

  // ignore bot messages (except PayWay)
  if (fromBot && !detectMessageRole(text)) return;

  // /register  use raw env (no tenant yet)
  if (/^\/register/i.test(text)) {
    var env0 = getEnv(env_raw);
    await handleRegisterGroup(env0, chatId, text, fromId);
    return;
  }

  // lookup platform by group chat_id
  var env0    = getEnv(env_raw);
  var platform = await getPlatformByExternalId(env0, String(chatId), "telegram");

  if (!platform) {
    // unregistered group  prompt
    if (/^\//.test(text)) {
      await tgSend(env0, chatId, "Group not registered.\nType: /register [tenant_key]");
    }
    return;
  }

  // build tenant-specific env
  var env = Object.assign({}, env0, {
    TENANT_ID: platform.tenant_id,
    SHOP_ID:   platform.shop_id,
  });

  var role = detectMessageRole(text);
  if (!role) return;

  if (role === "payway") {
    await handlePayWayMessage(env, chatId, text);
    return;
  }

  if (role === "orders") {
    var reply = await dispatchCommand(env,
      { name: fromId, tg_id: fromId },
      text, "telegram"
    );
    if (reply) await tgSend(env, chatId, reply);
    return;
  }

  if (role === "stock") {
    var reply2 = await dispatchCommand(env,
      { name: fromId, tg_id: fromId },
      text, "telegram"
    );
    if (reply2) await tgSend(env, chatId, reply2);
    return;
  }
}


export default {
  // Cron: rebuild feeds every 1hr
  async scheduled(event, env_raw, ctx) {
    var env = getEnv(env_raw);
    ctx.waitUntil((async function() {
      try {
        var since    = await getShopSince(env);
        var products = await sbSelect(env, "products",
          baseParams(env, since).concat([
            "is_published=eq.true",
            "order=created_at.desc",
            "limit=1000",
            "select=id,code,item_name,category,description,image_url,images,retail_price,stock_qty,translations",
          ]).join("&")
        );
        var platforms = await sbSelect(env, "platforms",
          baseParams(env).concat([
            "is_active=eq.true",
            "select=id,type,external_id,config",
          ]).join("&")
        );
        // rebuild KV catalog
        await kvSetCatalog(env, products);
        // rebuild per platform
        for (var i = 0; i < platforms.length; i++) {
          var p = platforms[i];
          if (p.type === "facebook") {
            var fbData = buildFBCatalog(products, env.SHOP_ID);
            await storeFeedR2(env, "feeds/fb_" + p.external_id + ".json", fbData);
            await storeFeedKV(env, "fb_feed:" + env.TENANT_ID + ":" + p.id, fbData);
          }
          if (p.type === "telegram") {
            var tgData = buildTGFeed(products);
            await storeFeedKV(env, "tg_feed:" + env.TENANT_ID + ":" + env.SHOP_ID + ":" + p.id, tgData);
          }
          if (p.type === "tiktok") {
            var tkData = buildTKCatalog(products, env.SHOP_ID);
            await storeFeedR2(env, "feeds/tk_" + p.external_id + ".json", tkData);
          }
        }
        await writeLog(env, {
          source: "cron", type: "feeds_rebuilt",
          message: "Cron: rebuilt " + platforms.length + " feeds, " + products.length + " products",
        });
      } catch (e) {
        console.error("Cron error:", e.message);
      }
    })());
  },

  async fetch(request, env_raw) {
    var env    = getEnv(env_raw);
    var origin = request.headers.get("origin") || "";
    var cors   = buildCors(origin);
    var url    = new URL(request.url);
    var path   = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (isBlocked(path + url.search)) {
      return jsonResp({ error: "forbidden" }, 403, cors);
    }

    var isWebhook = WEBHOOK_PATHS.indexOf(path) !== -1;
    var isApi     = path.startsWith("/api/");

    if (!isWebhook && !isApi && origin && ALLOWED_ORIGINS.indexOf(origin) === -1) {
      return jsonResp({ error: "forbidden" }, 403, cors);
    }

    var ip = request.headers.get("cf-connecting-ip") || "unknown";
    if (!checkRateLimit(ip)) {
      return jsonResp({ error: "too_many_requests" }, 429, cors);
    }

    // Health
    if (path === "/ping") {
      return jsonResp({ ok: true, worker: "yb-v3.6", ts: Date.now() }, 200, cors);
    }

    // debug/env removed (production)

    // Webhooks
    if (path === "/webhook/facebook") return handleFacebook(request, env);
    if (path === "/webhook/telegram") return handleTelegram(request, env);

    try {
      // Auth
      if (path === "/api/auth/check"        && request.method === "POST") return handleAuthCheck(request, env, cors);
      if (path === "/api/auth/send-otp"     && request.method === "POST") return handleSendOtp(request, env, cors);
      if (path === "/api/auth/verify-otp"   && request.method === "POST") return handleVerifyOtp(request, env, cors);
      if (path === "/api/auth/set-password" && request.method === "POST") return handleSetPassword(request, env, cors);
      if (path === "/api/auth/login"        && request.method === "POST") return handleLogin(request, env, cors);

      // Products
      if (path === "/api/products") {
        if (request.method === "GET")    return handleGetProducts(request, env, cors);
        if (request.method === "POST")   return handleCreateProduct(request, env, cors);
      }
      var productMatch = path.match(/^\/api\/products\/([a-f0-9-]{36})$/);
      if (productMatch) {
        if (request.method === "PATCH")  return handleUpdateProduct(request, env, cors, productMatch[1]);
        if (request.method === "DELETE") return handleDeleteProduct(request, env, cors, productMatch[1]);
      }

      // Orders
      if (path === "/api/orders") {
        if (request.method === "GET")  return handleGetOrders(request, env, cors);
        if (request.method === "POST") return handleCreateOrder(request, env, cors);
      }

      var orderMatch = path.match(/^\/api\/orders\/([a-f0-9-]{36})$/);
      if (orderMatch && request.method === "PATCH") {
        return handleUpdateOrder(request, env, cors, orderMatch[1]);
      }

      // Shipper orders (YB App)
      if (path === "/api/shipper/orders" && request.method === "GET") {
        var user = await verifyJwt(request, env);
        return handleShipperOrders(request, env, cors, user);
      }

      // Platforms
      if (path === "/api/platforms" && request.method === "GET") {
        var platforms = await getShopPlatforms(env, env.SHOP_ID);
        return jsonResp({ ok: true, data: platforms }, 200, cors);
      }

      // Stats
      if (path === "/api/stats" && request.method === "GET") return handleGetStats(request, env, cors);

      // Customer profile + history
      var custMatch = path.match(/^\/api\/customer\/([0-9+]+)$/);
      if (custMatch && request.method === "GET") return handleGetCustomer(request, env, cors);

      // Upload media
      if (path === "/api/upload" && request.method === "POST") return handleUpload(request, env, cors);

      // Feeds rebuild
      if (path === "/api/feeds/rebuild" && request.method === "POST") return handleFeedsRebuild(request, env, cors);

      // Product view tracking
      var viewMatch = path.match(/^\/api\/products\/([a-f0-9-]{36})\/view\/(\d+)$/);
      if (viewMatch && request.method === "POST") return handleProductView(request, env, cors, viewMatch[1], viewMatch[2]);

      // Stock movement
      if (path === "/api/stock/movement" && request.method === "POST") return handleStockMovement(request, env, cors);

      // KHQR
      if (path === "/khqr/generate"   && request.method === "POST") return handleKhqr(request, env, cors);
      if (path === "/cloudinary/sign" && request.method === "POST") return handleCloudinarySign(request, env, cors);

      return jsonResp({ error: "not_found" }, 404, cors);

    } catch (e) {
      return jsonResp({ error: e.message }, 500, cors);
    }
  },
};
