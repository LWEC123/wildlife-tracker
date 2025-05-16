// Service Worker for Wildlife Sighting PWA
const CACHE_NAME = 'wildlife-sighting-pwa-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache opened');
        return cache.addAll(ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.filter((name) => {
            return name !== CACHE_NAME;
          }).map((name) => {
            return caches.delete(name);
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache if available, otherwise fetch from network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        
        // Clone the request
        const fetchRequest = event.request.clone();
        
        return fetch(fetchRequest)
          .then((response) => {
            // Check if we received a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Clone the response
            const responseToCache = response.clone();
            
            // Open cache and store response
            caches.open(CACHE_NAME)
              .then((cache) => {
                // Don't cache POST requests or API calls
                if (event.request.method !== 'POST' && !event.request.url.includes('/api/')) {
                  cache.put(event.request, responseToCache);
                }
              });
            
            return response;
          })
          .catch(() => {
            // If fetch fails (e.g., offline), try to serve cached index.html for navigation requests
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
            
            // Return error for other requests
            return new Response('Network error occurred', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({
                'Content-Type': 'text/plain'
              })
            });
          });
      })
  );
});

// Background sync for pending sightings
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-sightings') {
    event.waitUntil(syncPendingSightings());
  }
});

// Function to sync pending sightings in the background
function syncPendingSightings() {
  return self.clients.matchAll()
    .then((clients) => {
      // Send message to client to initiate sync
      if (clients && clients.length) {
        clients[0].postMessage({
          type: 'SYNC_SIGHTINGS'
        });
      }
      
      return Promise.resolve();
    });
}

// Handle push notifications
self.addEventListener('push', (event) => {
  const data = event.data.json();
  
  const options = {
    body: data.body || 'New wildlife sighting information available',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-96x96.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      url: data.url || '/'
    },
    actions: [
      {
        action: 'view',
        title: 'View'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Wildlife Sighting Update', options)
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'view') {
    // Open the URL from the notification data
    event.waitUntil(
      clients.openWindow(event.notification.data.url)
    );
  } else {
    // Default action - open the app
    event.waitUntil(
      clients.matchAll({ type: 'window' })
        .then((windowClients) => {
          // Check if there is already a window/tab open with the target URL
          for (const client of windowClients) {
            if (client.url === '/' && 'focus' in client) {
              return client.focus();
            }
          }
          
          // If no window/tab is open, open one
          if (clients.openWindow) {
            return clients.openWindow('/');
          }
        })
    );
  }
});