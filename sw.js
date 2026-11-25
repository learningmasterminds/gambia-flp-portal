const CACHE_NAME = 'gambia-flp-v24';

// Only the app shell and the primary audio source per track. The duplicate
// fallback encodings are fetched on demand rather than bloating install.
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './data/wolof_ecd3_term1.json',
  './data/wolof_ecd2_term1.json',
  './data/wolof_grade1_term1.json',
  './facilitator.html',
  './facilitator.js?v=4.1',
  './data/facilitator_guide.json',
  './data/facilitator_guide_numeracy.json',
  './data/wolof_grade1_term1_numeracy.json',
  './audio/wolof/wol_ecd2_w01_letter_a.ogg',
  './audio/wolof/wol_ecd2_w01_song.m4a',
  './audio/wolof/wol_ecd2_w01_vocab.ogg',
  './audio/wolof/wol_ecd2_w01_story.ogg'
];

// Classified by folder, not by file extension: a recording in a new format, or a
// data file with a ?v= tag, must never be able to fail the shell install, and a
// shell file must never be demoted to optional.
const isContent = (url) => url.startsWith('./data/') || url.startsWith('./audio/');
const CORE_ASSETS = ASSETS_TO_CACHE.filter((url) => !isContent(url));
const OPTIONAL_ASSETS = ASSETS_TO_CACHE.filter(isContent);

// Audio is large and immutable, so it is served cache-first. Everything else
// is code or content that must be allowed to change: serving index.html
// cache-first made the ?v= cache-buster inert for returning teachers, because
// the very file carrying the new version tag came from the old cache.
function isImmutableAsset(url) {
  return /\.(ogg|m4a|mp4|mp3|wav|png|jpg|jpeg|svg|woff2?)$/i.test(url.pathname);
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // The shell must all be there, or there is no offline copy at all: if any
      // of it fails, the install fails and the old worker and cache survive.
      // Lesson data and recordings are allowed to fail one by one, so a single
      // missing file cannot deny a teacher the whole guide.
      return cache.addAll(CORE_ASSETS).then(() => Promise.all(
        OPTIONAL_ASSETS.map(async (url) => {
          try {
            await cache.add(url);
          } catch (err) {
            // Do not lose a recording the teacher already had: carry the copy
            // from the previous cache into this one before activate deletes it.
            const carried = await caches.match(url);
            if (carried) {
              await cache.put(url, carried);
              console.warn('Carried forward from the previous cache:', url);
            } else {
              console.warn('Skipped for offline cache:', url, err);
            }
          }
        })
      ));
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('Purging old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch (e) {
    return;
  }
  if (!url.protocol.startsWith('http')) return;

  // Cache-first for immutable media.
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-first for the app shell and lesson data, falling back to cache
  // when offline. This is what lets a new deploy actually reach a device that
  // already has the service worker installed.
  event.respondWith(
    fetch(request).then((response) => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    }).catch(() => {
      // Cache keys are query-sensitive, but the query is only ever a deep
      // link (?day=..&session=..) or a cache-buster (?v=..), so the same
      // file answers any of them.
      return caches.match(request, { ignoreSearch: true }).then((cached) => {
        if (cached) return cached;
        // Navigation requests fall back to the cached shell of that page.
        const accept = request.headers.get('accept') || '';
        if (request.mode === 'navigate' || accept.includes('text/html')) {
          const shell = url.pathname.endsWith('facilitator.html') ? './facilitator.html' : './index.html';
          return caches.match(shell);
        }
        return Response.error();
      });
    })
  );
});
