/**
 * Service worker — offline support for the Choice studio PWA.
 *
 * Strategy: "network first, fall back to cache". The app is always served fresh
 * when online and keeps working offline from the cache. The cache is versioned;
 * bump CACHE on each deploy that changes cached files. Requests to Google
 * (authentication + Drive API) and any non-GET request bypass the cache and go
 * straight to the network.
 */

const CACHE = "choice-studio-v1";

self.addEventListener("install", (event) => {
  // Activate the new worker immediately.
  self.skipWaiting();
  // Warm the cache with the app shell (best effort).
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(["./", "./index.html", "./manifest.webmanifest"]).catch(() => {})),
  );
});

self.addEventListener("activate", (event) => {
  // Drop old caches and take control of open pages.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Never intercept Google auth / API or cross-origin API calls, and only
  // handle GET (uploads, token calls, etc. must reach the network directly).
  if (
    req.method !== "GET" ||
    url.hostname.endsWith("google.com") ||
    url.hostname.endsWith("googleapis.com") ||
    url.hostname.endsWith("gstatic.com")
  ) {
    return; // default browser handling
  }

  event.respondWith(
    fetch(req)
      .then((resp) => {
        // Cache a copy of same-origin successful responses for offline use.
        if (resp && resp.status === 200 && url.origin === self.location.origin) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return resp;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit || caches.match("./index.html")),
      ),
  );
});
