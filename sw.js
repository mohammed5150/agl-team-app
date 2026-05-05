// ADB Safegate Portal — Service Worker
// Strategy:
//   * HTML, JS, JSON  → network-first  (always try to get fresh; fall back to cache offline)
//   * Icons / images  → cache-first    (rarely change; eviction below cleans up old caches)
//
// Bump SW_VERSION whenever you change THIS FILE. App code (app.js / index.html)
// updates automatically thanks to network-first — no bump needed for those.

const SW_VERSION  = "v4";
const STATIC_CACHE  = `adb-portal-static-${SW_VERSION}`;
const RUNTIME_CACHE = `adb-portal-runtime-${SW_VERSION}`;

// Pre-cache so the app installs as a PWA and works offline on first launch.
const PRECACHE_ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./favicon.png",
];

self.addEventListener("install", (ev) => {
  ev.waitUntil(
    caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (ev) => {
  const req = ev.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // CDN / Supabase: let the browser handle

  const isAsset = /\.(png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(url.pathname);

  if (isAsset) {
    // Cache-first
    ev.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const fresh = await fetch(req);
      if (fresh.ok) {
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(req, fresh.clone());
      }
      return fresh;
    })());
    return;
  }

  // Network-first for everything else (HTML, JS, JSON)
  ev.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh.ok) {
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch {
      const cached = await caches.match(req);
      if (cached) return cached;
      // Last resort for a navigation request: serve cached index.html
      if (req.mode === "navigate") {
        const fallback = await caches.match("./index.html");
        if (fallback) return fallback;
      }
      throw new Error("Network failed and no cache available");
    }
  })());
});

self.addEventListener("message", (ev) => {
  if (ev.data === "SKIP_WAITING") self.skipWaiting();
});

// ---------------------------------------------------------------
// Web Push
// ---------------------------------------------------------------
self.addEventListener("push", (ev) => {
  let data = {};
  if (ev.data) {
    try { data = ev.data.json(); }
    catch { data = { title: "ADB Portal", body: ev.data.text() }; }
  }
  const title = data.title || "ADB Portal";
  const opts = {
    body:  data.body  || "",
    icon:  data.icon  || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    tag:   data.tag   || "adb-portal",
    data:  { url: data.url || "/" },
    requireInteraction: false,
    renotify: true,
  };
  ev.waitUntil(self.registration.showNotification(title, opts));
});

// When the user taps the notification, focus an existing tab or open one.
self.addEventListener("notificationclick", (ev) => {
  ev.notification.close();
  const target = ev.notification.data?.url || "/";
  ev.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      // Same-origin tab? focus it and navigate.
      if (new URL(c.url).origin === self.location.origin && "focus" in c) {
        await c.focus();
        try { c.navigate(target); } catch {}
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});

