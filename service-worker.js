const CACHE_NAME = 'lern-oase-v2'; // Wichtig: Bei Änderungen am Service Worker diese Version erhöhen!
const urlsToCache = [
  '/',
  '/index.html',
  '/?source=pwa', // Um den Start-URL aus dem Manifest zu cachen
  '/manifest.json',
  // Fügen Sie hier die Pfade zu Ihren wichtigsten CSS-, JS- und Bilddateien hinzu
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  // Es ist eine gute Praxis, eine dedizierte Offline-Seite zu haben
  '/offline.html'
];

// Schritt 1: Service Worker installieren und die "App-Shell" cachen
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Cache geöffnet und App-Shell wird gecached.');
        return cache.addAll(urlsToCache);
      })
  );
});

// Schritt 2: Anfragen abfangen und mit einer "Stale-While-Revalidate"-Strategie antworten
self.addEventListener('fetch', event => {
  // Wir wenden die Strategie nicht auf alle Anfragen an, z.B. nicht auf externe Ressourcen wie YouTube
  if (event.request.url.startsWith(self.location.origin)) {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        const fetchPromise = fetch(event.request).then(networkResponse => {
          // Nur gültige Antworten cachen
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        });

        // Sofort aus dem Cache antworten, wenn verfügbar, und im Hintergrund aktualisieren
        return cachedResponse || fetchPromise;
      }).catch(() => {
        // Wenn alles fehlschlägt (kein Cache, kein Netzwerk), die Offline-Seite anzeigen
        return caches.match('/offline.html');
      })
    );
  }
});

// Schritt 3: Alte Caches aufräumen, wenn ein neuer Service Worker aktiviert wird
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Service Worker: Alter Cache wird gelöscht:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});