const V            = "yb-v1";
const CACHE_MEDIA  = V + "-media";
const CACHE_API    = V + "-api";
const CACHE_APP    = V + "-app";

const APP_SHELL = ["/home/", "/home/app/", "/placeholder.jpg"];

self.addEventListener("install", function(e) {
  e.waitUntil(
    caches.open(CACHE_APP)
      .then(function(c) { return c.addAll(APP_SHELL).catch(function(){}); })
      .then(function()  { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) {
          return ![CACHE_MEDIA, CACHE_API, CACHE_APP].includes(k);
        }).map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return clients.claim(); })
  );
});

self.addEventListener("fetch", function(e) {
  var url = e.request.url;
  if (url.includes("/media/") || url.includes("/cdn-cgi/image/")) {
    e.respondWith(cacheFirst(e.request, CACHE_MEDIA)); return;
  }
  if (url.includes("/api/")) {
    e.respondWith(networkFirst(e.request, CACHE_API)); return;
  }
  if (url.match(/\.(js|css|html|json|webp|png|jpg|svg)$/)) {
    e.respondWith(cacheFirst(e.request, CACHE_APP)); return;
  }
});

async function cacheFirst(req, name) {
  var c = await caches.open(name);
  var hit = await c.match(req);
  if (hit) return hit;
  try {
    var res = await fetch(req);
    if (res.ok) c.put(req, res.clone());
    return res;
  } catch (_) {
    return (await caches.match("/placeholder.jpg")) || new Response("Offline", { status: 503 });
  }
}

async function networkFirst(req, name) {
  try {
    var res = await fetch(req);
    var c = await caches.open(name);
    if (res.ok) c.put(req, res.clone());
    return res;
  } catch (_) {
    var hit = await caches.match(req);
    return hit || new Response(
      JSON.stringify({ ok: false, data: [], source: "offline", msg: { text: "Offline", type: "error" } }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
}

self.addEventListener("message", async function(e) {
  var d = e.data;
  if (!d || !d.type) return;
  if (d.type === "PRECACHE_VIDEO") {
    var c = await caches.open(CACHE_MEDIA);
    if (!(await c.match(d.url))) {
      try { var r = await fetch(d.url); if (r.ok) await c.put(d.url, r); } catch (_) {}
    }
  }
  if (d.type === "PRECACHE_THUMBS") {
    var c2 = await caches.open(CACHE_MEDIA);
    for (var i = 0; i < (d.urls || []).length; i++) {
      try {
        if (!(await c2.match(d.urls[i]))) {
          var r2 = await fetch(d.urls[i]); if (r2.ok) await c2.put(d.urls[i], r2);
        }
      } catch (_) {}
    }
  }
  if (d.type === "RECONNECT_EVICT") {
    var c3 = await caches.open(CACHE_MEDIA);
    var keys = await c3.keys();
    var vm = d.viewMap || {};
    var sorted = keys.map(function(r) { return { r: r, v: vm[r.url] || 0 }; })
      .sort(function(a, b) { return b.v - a.v; });
    for (var j = Math.floor(sorted.length / 2); j < sorted.length; j++) {
      await c3.delete(sorted[j].r);
    }
  }
  if (d.type === "CLEAR_CACHE") {
    var all = await caches.keys();
    await Promise.all(all.map(function(k) { return caches.delete(k); }));
  }
});
