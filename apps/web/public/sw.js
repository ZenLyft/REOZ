/* REOZ iOS & Desktop PWA Service Worker — Web Push Notifications */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {
    title: 'REOZ Autopilot Update',
    body: 'New activity in your ZenLyft revenue pipeline.',
    url: '/dashboard/approvals',
    tag: `reoz-event-${Date.now()}`,
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = {
        title: parsed.title || payload.title,
        body: parsed.body || payload.body,
        url: parsed.url || payload.url,
        tag: parsed.tag || payload.tag,
      };
    } catch {
      payload.body = event.data.text() || payload.body;
    }
  }

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: payload.tag,
        renotify: true,
        data: { url: payload.url },
      }),
      typeof self.navigator !== 'undefined' &&
      'setAppBadge' in self.navigator &&
      typeof self.navigator.setAppBadge === 'function'
        ? self.navigator.setAppBadge(1).catch(() => {})
        : Promise.resolve(),
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification && event.notification.data && event.notification.data.url) ||
    '/dashboard/approvals';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
