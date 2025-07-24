// Service Worker for Lern-Oase PWA
const CACHE_NAME = 'lern-oase-v1';
const DYNAMIC_CACHE = 'lern-oase-dynamic-v1';

// Assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html'
];

// Install Event - Cache static assets
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[ServiceWorker] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[ServiceWorker] Skip waiting');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[ServiceWorker] Cache failed:', error);
      })
  );
});

// Activate Event - Clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activating...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              return cacheName !== CACHE_NAME && cacheName !== DYNAMIC_CACHE;
            })
            .map((cacheName) => {
              console.log('[ServiceWorker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('[ServiceWorker] Claiming clients');
        return self.clients.claim();
      })
  );
});

// Fetch Event - Network first, fallback to cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Handle API calls differently
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .catch(() => {
          return new Response(
            JSON.stringify({ error: 'Offline' }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        })
    );
    return;
  }

  // For HTML requests, try network first with timeout
  if (request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      Promise.race([
        fetch(request),
        new Promise((resolve, reject) => {
          setTimeout(() => reject(new Error('Network timeout')), 3000);
        })
      ])
        .then((response) => {
          // Clone the response
          const responseClone = response.clone();

          // Update cache
          caches.open(DYNAMIC_CACHE)
            .then((cache) => {
              cache.put(request, responseClone);
            });

          return response;
        })
        .catch(() => {
          return caches.match(request)
            .then((response) => {
              if (response) {
                return response;
              }
              // Return index.html for navigation requests
              if (request.mode === 'navigate') {
                return caches.match('/index.html');
              }
              return caches.match('/offline.html');
            });
        })
    );
    return;
  }

  // For all other requests, try cache first
  event.respondWith(
    caches.match(request)
      .then((response) => {
        if (response) {
          // Return from cache but also update it
          fetch(request)
            .then((fetchResponse) => {
              caches.open(DYNAMIC_CACHE)
                .then((cache) => {
                  cache.put(request, fetchResponse.clone());
                });
            });
          return response;
        }

        // Not in cache, fetch from network
        return fetch(request)
          .then((fetchResponse) => {
            // Don't cache responses from other origins
            if (!fetchResponse || fetchResponse.status !== 200 || fetchResponse.type !== 'basic') {
              return fetchResponse;
            }

            // Clone the response
            const responseToCache = fetchResponse.clone();

            caches.open(DYNAMIC_CACHE)
              .then((cache) => {
                cache.put(request, responseToCache);
              });

            return fetchResponse;
          });
      })
      .catch(() => {
        // Offline fallback for images
        if (request.destination === 'image') {
          return new Response(
            '<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg"><rect width="400" height="300" fill="#ddd"/><text x="50%" y="50%" text-anchor="middle" fill="#999" font-family="sans-serif" font-size="20">Offline</text></svg>',
            { headers: { 'Content-Type': 'image/svg+xml' } }
          );
        }
      })
  );
});

// Background Sync
self.addEventListener('sync', (event) => {
  console.log('[ServiceWorker] Background sync:', event.tag);

  if (event.tag === 'sync-series') {
    event.waitUntil(syncSeriesData());
  }
});

// Push Notifications
self.addEventListener('push', (event) => {
  console.log('[ServiceWorker] Push received:', event);

  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-96x96.png',
      vibrate: [200, 100, 200],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: 1
      },
      actions: [
        {
          action: 'explore',
          title: 'Ansehen',
          icon: '/icons/checkmark.png'
        },
        {
          action: 'close',
          title: 'Schließen',
          icon: '/icons/xmark.png'
        }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

// Notification Click
self.addEventListener('notificationclick', (event) => {
  console.log('[ServiceWorker] Notification click:', event.action);

  event.notification.close();

  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Message handling
self.addEventListener('message', (event) => {
  console.log('[ServiceWorker] Message received:', event.data);

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'CLIENTS_CLAIM') {
    self.clients.claim();
  }
});

// Helper function to sync series data
async function syncSeriesData() {
  try {
    const cache = await caches.open(DYNAMIC_CACHE);
    const cachedRequests = await cache.keys();

    // Get series data from IndexedDB or localStorage
    // This would be implemented based on your data storage strategy

    console.log('[ServiceWorker] Series data synced');
  } catch (error) {
    console.error('[ServiceWorker] Sync failed:', error);
  }
}

// Periodic Background Sync (if supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-series') {
    event.waitUntil(updateSeriesInBackground());
  }
});

async function updateSeriesInBackground() {
  try {
    // Fetch latest series data
    const response = await fetch('/api/series/latest');
    const data = await response.json();

    // Update cache
    const cache = await caches.open(DYNAMIC_CACHE);
    await cache.put('/api/series/latest', new Response(JSON.stringify(data)));

    // Notify clients
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SERIES_UPDATED',
        data: data
      });
    });
  } catch (error) {
    console.error('[ServiceWorker] Background update failed:', error);
  }
}