const CACHE_NAME = "claritymdt-v1";
const ASSETS_TO_CACHE = [
  "/login",
  "/favicon.ico",
  "/icon.svg",
  "/icon-192x192.png",
  "/icon-512x512.png",
  "/apple-touch-icon.png",
  "/manifest.webmanifest",
];

// Install Event
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(
        ASSETS_TO_CACHE.map(async (url) => {
          try {
            const response = await fetch(url);
            if (response.ok && response.type === "basic") {
              await cache.put(url, response);
            }
          } catch (e) {
            // Silently swallow fetch errors for individual static assets during install
          }
        })
      );
    })
  );
  self.skipWaiting();
});

// Activate Event (Cleanup Old Caches)
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event (Network-First Fallback-to-Cache strategy)
self.addEventListener("fetch", (event) => {
  // Only intercept HTTP/HTTPS GET requests from the same origin
  if (!event.request.url.startsWith(self.location.origin) || event.request.method !== "GET") {
    return;
  }

  // Bypass service worker caching for API routes, Next data routes, and OHIF viewer paths
  const url = new URL(event.request.url);
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/data/") ||
    url.pathname.startsWith("/ohif-viewer/")
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful basic GET responses for future offline use
        if (response && response.status === 200 && response.type === "basic") {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache if network fails (offline mode)
        return caches.match(event.request);
      })
  );
});
