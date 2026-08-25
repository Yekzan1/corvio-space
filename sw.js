// Corvio Space Pro - Service Worker
// Version 5.1 - Network-first + auto-update + badges/confetti/FAB

// IMPORTANT: bump this constant on every deploy. The new SW will install,
// trigger the "new version available" toast, and reload on user click.
const CACHE_VERSION = 'v6.2';
const CACHE_NAME = `corviospace-${CACHE_VERSION}`;

// Only used as offline fallback. NEVER served if network is reachable.
const OFFLINE_FALLBACKS = [
    '/',
    '/index.html',
    '/manifest.json'
];

// ---------- Install: precache offline fallbacks only ----------
self.addEventListener('install', event => {
    console.log('[SW] Installing', CACHE_VERSION);
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(OFFLINE_FALLBACKS).catch(() => {}))
            .then(() => self.skipWaiting())
    );
});

// ---------- Activate: nuke old caches + take control immediately ----------
self.addEventListener('activate', event => {
    console.log('[SW] Activating', CACHE_VERSION);
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => {
                    console.log('[SW] Removing old cache:', k);
                    return caches.delete(k);
                })
            ))
            .then(() => self.clients.claim())
            .then(() => {
                // Notify all open tabs that a new SW just took over
                return self.clients.matchAll({ type: 'window' }).then(clients => {
                    clients.forEach(c => c.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION }));
                });
            })
    );
});

// ---------- Fetch: NETWORK-FIRST for app shell ----------
// This is the key fix: we always try the network first for HTML/JS/CSS so
// users automatically get the latest deploy. Cache is only a fallback for offline.
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== 'GET') return;

    // Skip Firebase / Firestore / Google APIs entirely
    if (url.hostname.includes('firebase') ||
        url.hostname.includes('firestore') ||
        url.hostname.includes('googleapis') && !url.hostname.includes('fonts')) {
        return;
    }

    // App shell + same-origin assets: NETWORK-FIRST
    if (url.origin === self.location.origin) {
        event.respondWith(
            fetch(request, { cache: 'no-store' })
                .then(response => {
                    // Successful fresh response → update cache silently
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(c => c.put(request, clone)).catch(() => {});
                    }
                    return response;
                })
                .catch(async () => {
                    // Offline: serve from cache, fall back to /index.html for navigations
                    const cached = await caches.match(request);
                    if (cached) return cached;
                    if (request.mode === 'navigate') {
                        return caches.match('/index.html');
                    }
                    return new Response('Offline', { status: 503, statusText: 'Offline' });
                })
        );
        return;
    }

    // Google fonts: cache-first (rarely changes)
    if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
        event.respondWith(
            caches.match(request).then(cachedResponse => {
                return cachedResponse || fetch(request).then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(c => c.put(request, clone));
                    }
                    return response;
                });
            })
        );
        return;
    }
});

// ---------- Allow page to ask the SW to skipWaiting ----------
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// ---------- Background sync placeholder ----------
self.addEventListener('sync', event => {
    if (event.tag === 'sync-tasks') {
        event.waitUntil(Promise.resolve());
    }
});

// ---------- Push notifications ----------
const NOTIF_ICON = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%236366f1' stroke='white' stroke-width='2'><path d='M13 2L3 14h9l-1 8 10-12h-9l1-8z'/></svg>";

self.addEventListener('push', event => {
    if (!event.data) return;
    let data = {};
    try { data = event.data.json(); } catch (e) { data = { body: event.data.text() }; }

    const options = {
        body: data.body || 'Nouvelle notification',
        icon: NOTIF_ICON,
        badge: NOTIF_ICON,
        vibrate: [100, 50, 100],
        data: { url: data.url || '/' },
        actions: [
            { action: 'open', title: 'Ouvrir' },
            { action: 'close', title: 'Fermer' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'Corvio Space', options)
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    if (event.action === 'close') return;
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.navigate(event.notification.data.url);
                    return client.focus();
                }
            }
            if (clients.openWindow) return clients.openWindow(event.notification.data.url);
        })
    );
});

console.log('[SW] Service Worker loaded - Corvio Space', CACHE_VERSION);
