// Service worker: lets phones install FlatDesk as an app, and still open it when the internet drops.
// It always tries the internet first, so you never see an old version after an update.

const CACHE = "flatdesk-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const request = event.request;
  // Only FlatDesk's own files. Firebase and other sites are left alone.
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((saved) => saved || Response.error()))
  );
});
