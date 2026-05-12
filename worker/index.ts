// worker/index.ts
// =====================================================================
// 百錬自得 - Push通知カスタムワーカー ★ Phase12 (iOS Safe Mode)
// =====================================================================

/// <reference lib="webworker" />
/// <reference lib="dom" />

declare const self: ServiceWorkerGlobalScope;

interface PushPayload {
  title:    string;
  body:     string;
  url?:     string;
  category?: string;
  tag?:     string;
  icon?:    string;
  badge?:   string;
}

self.addEventListener('push', (event: PushEvent) => {
  let payload: PushPayload = {
    title: '百錬自得',
    body:  '新しいお報せがあります',
  };

  if (event.data) {
    try {
      const text = event.data.text();
      try {
        const parsed = JSON.parse(text) as Partial<PushPayload>;
        payload = {
          title: typeof parsed.title === 'string' && parsed.title.length > 0 ? parsed.title : '百錬自得',
          body:  typeof parsed.body  === 'string' && parsed.body.length  > 0 ? parsed.body  : '新しいお報せがあります',
          url:      typeof parsed.url      === 'string' ? parsed.url      : '/',
          category: typeof parsed.category === 'string' ? parsed.category : undefined,
          tag:      typeof parsed.tag      === 'string' ? parsed.tag      : 'forge-default',
          icon:     typeof parsed.icon     === 'string' ? parsed.icon     : '/icon-192x192.png',
          badge:    typeof parsed.badge    === 'string' ? parsed.badge    : '/icon-192x192.png',
        };
      } catch {
        payload = { ...payload, body: text };
      }
    } catch {
      // ignore
    }
  }

  const url = payload.url ?? '/';
  const tag = payload.tag ?? `forge-${payload.category ?? 'default'}`;

  // ★ 修正: iOS Safari (WebKit) が確実に処理できるプロパティのみに厳選
  // renotify, vibrate, requireInteraction などの非対応・不安定なプロパティを排除
  const options: NotificationOptions = {
    body:  payload.body,
    icon:  payload.icon  ?? '/icon-192x192.png',
    badge: payload.badge ?? '/icon-192x192.png',
    tag:   tag,
    data: {
      url,
      category: payload.category ?? 'default',
      ts: Date.now(),
    },
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const data = (event.notification.data ?? {}) as { url?: string };
  const targetPath = typeof data.url === 'string' && data.url.length > 0 ? data.url : '/';

  const focusOrOpen = async (): Promise<void> => {
    const allClients = await self.clients.matchAll({
      type:                'window',
      includeUncontrolled: true,
    });

    const exact = allClients.find(c => {
      try {
        const u = new URL(c.url);
        return u.pathname === targetPath || c.url.endsWith(targetPath);
      } catch {
        return false;
      }
    });

    if (exact) {
      await exact.focus();
      try {
        if ('navigate' in exact && typeof (exact as WindowClient).navigate === 'function') {
          await (exact as WindowClient).navigate(targetPath);
        }
      } catch {}
      return;
    }

    const anySameOrigin = allClients[0];
    if (anySameOrigin) {
      try {
        await anySameOrigin.focus();
        if ('navigate' in anySameOrigin && typeof (anySameOrigin as WindowClient).navigate === 'function') {
          await (anySameOrigin as WindowClient).navigate(targetPath);
          return;
        }
      } catch {}
    }

    if (self.clients.openWindow) {
      await self.clients.openWindow(targetPath);
    }
  };

  event.waitUntil(focusOrOpen());
});

self.addEventListener('pushsubscriptionchange', (event: Event) => {
  const e = event as ExtendableEvent;
  e.waitUntil(
    (async () => {
      try {
        const reg = self.registration;
        const oldSub = await reg.pushManager.getSubscription();
        if (oldSub) {
          await oldSub.unsubscribe().catch(() => undefined);
        }
      } catch {}
    })(),
  );
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(self.clients.claim());
});

export {};