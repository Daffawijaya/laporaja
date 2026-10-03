// Service worker minimal LaporAja: membuat aplikasi memenuhi syarat pasang
// (butuh fetch handler) + cache ringan berkas statis agar navigasi tetap
// jalan saat koneksi putus. Hanya metode GET seasal; API/postingan login
// tidak pernah di-cache.
const CACHE = "laporaja-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Berkas build statis: cache-first (namanya sudah berversi per build).
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) void cache.put(request, res.clone());
        return res;
      })()
    );
    return;
  }

  // Navigasi antar halaman: network-first, jatuh ke cache bila luring.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const res = await fetch(request);
          if (res.ok) void cache.put(request, res.clone());
          return res;
        } catch {
          const hit = await cache.match(request);
          if (hit) return hit;
          throw new Error("offline");
        }
      })()
    );
  }
});
