/* EC Routine — Service Worker para notificações push locais */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch (error) {
    console.error('[SW] Erro ao parsear payload push:', error);
    return;
  }

  const title = payload.title || 'EC ROUTINE';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/logo.png',
    badge: payload.badge || '/badge.png',
    tag: payload.tag || `ec-routine-${Date.now()}`,
    requireInteraction: true,
    data: payload.data || {},
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const actionUrl = event.notification.data?.actionUrl || '/';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            if (actionUrl && 'navigate' in client) {
              return client.navigate(actionUrl).then(() => client.focus());
            }
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(actionUrl);
        }
      }),
  );
});

self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notificação fechada:', {
    tag: event.notification.tag,
    data: event.notification.data,
  });
});
