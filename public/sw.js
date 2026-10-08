/*
 * Keeps the camera's model and runtime on the phone.
 *
 * The ball model and ONNX Runtime are about 18 MB. Without this they are
 * fetched again whenever the browser's cache lets them go, which at a
 * driveway hoop on weak signal means a long wait or no camera at all. Only
 * /models/ and /ort/ are handled: every page, and everything else, goes to
 * the network exactly as before.
 *
 * The cache is named after the version in the registration URL
 * (/sw.js?v=<runtime>-<model>), so a new runtime or model gets a new cache
 * and the old one is deleted, rather than serving stale files.
 */
const VERSION = new URL(self.location.href).searchParams.get("v") || "0";
const CACHE = `hl-camera-${VERSION}`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("hl-camera-") && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith("/models/") && !url.pathname.startsWith("/ort/")) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      // Whole, successful responses only (a 206 range reply can't be cached).
      if (res.ok && res.status === 200) await cache.put(req, res.clone());
      return res;
    })()
  );
});
