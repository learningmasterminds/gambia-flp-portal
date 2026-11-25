/* Retirement worker for the Gambia FLP Teacher Portal, GitHub Pages copy.
 *
 * This address was retired on 25 November 2026 and the portal now lives at
 * https://mobseedutechhub.online/
 *
 * Purpose: a teacher who already installed the portal holds a cache-first worker
 * that would otherwise serve the old build for ever. This version takes its place,
 * deletes every cache on this origin and then unregisters itself, leaving the
 * notice page as the only thing served here. It caches nothing, so nothing on this
 * origin can go stale again.
 *
 * The build that this replaces called self.skipWaiting() on install and
 * clients.claim() on activate, so this one takes effect on the first visit with a
 * connection rather than waiting for every tab to close.
 */

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    // 1. Drop every cache this origin holds, whatever it was named.
    try {
      var names = await caches.keys();
      await Promise.all(names.map(function (n) { return caches.delete(n); }));
    } catch (e) { /* nothing to clear */ }

    // 2. Take over the open pages, so the notice is served from now on.
    try { await self.clients.claim(); } catch (e) {}

    // 3. Remove this worker. After this the origin behaves like a plain site:
    //    every request goes to the network, and the notice is always current.
    try { await self.registration.unregister(); } catch (e) {}
  })());
});

// While this worker is still in control for a moment, do not interfere with the
// network: pass every request straight through.
self.addEventListener('fetch', function (event) {
  event.respondWith(fetch(event.request));
});
