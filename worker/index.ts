// worker/index.ts
// =====================================================================
// 百錬自得 - Push通知カスタムワーカー ★ Phase12
//
// このファイルは @ducanh2912/next-pwa の customWorkerSrc 機能により、
// ビルド時に自動生成される public/sw.js の末尾へインポート結合される。
//
// 役割:
//   1. push イベント受信 → showNotification で OS 通知を表示
//   2. notificationclick イベント → 該当 URL を開く（既存タブがあれば
//      フォーカス、なければ新規オープン）
//
// 受信ペイロード仕様（/api/push/send が送信する JSON）:
//   {
//     title:    string,
//     body:     string,
//     url:      string,
//     category: 'decay_warning' | 'achievement' | 'peer_eval',
//     tag:      string,
//     icon:     string,
//     badge:    string,
//   }
//
// 注意:
//   このファイルは Service Worker スコープで実行されるため、
//   self は ServiceWorkerGlobalScope として扱う。
//   renotify / vibrate は ServiceWorkerRegistration.showNotification() の
//   仕様には存在するが TypeScript の lib.dom には未定義のため、
//   ExtendedNotificationOptions 型でキャストして使用する。
// =====================================================================

/// <reference lib="webworker" />
/// <reference lib="dom" />

declare const self: ServiceWorkerGlobalScope;

// ---------------------------------------------------------------------
// 受信ペイロードの型
// ---------------------------------------------------------------------
interface PushPayload {
  title:    string;
  body:     string;
  url?:     string;
  category?: string;
  tag?:     string;
  icon?:    string;
  badge?:   string;
}

// ---------------------------------------------------------------------
// 拡張 NotificationOptions
//   lib.dom の NotificationOptions に未定義の Service Worker 限定
//   プロパティ（renotify, vibrate, actions 等）を許容するための拡張型。
//   showNotification() の仕様には存在するため実行時は問題なく動作する。
//   仕様: https://www.w3.org/TR/notifications/#dictdef-notificationoptions
// ---------------------------------------------------------------------
interface ExtendedNotificationOptions extends NotificationOptions {
  renotify?: boolean;
  vibrate?:  number | number[];
  actions?:  Array<{
    action: string;
    title:  string;
    icon?:  string;
  }>;
  timestamp?: number;
}

// ---------------------------------------------------------------------
// push イベント
// ---------------------------------------------------------------------
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
      // event.data の取得に失敗した場合はデフォルトのまま表示
    }
  }

  const url = payload.url ?? '/';
  const tag = payload.tag ?? `forge-${payload.category ?? 'default'}`;

  // ★ 修正: ExtendedNotificationOptions として型を確定
  const options: ExtendedNotificationOptions = {
    body:    payload.body,
    icon:    payload.icon  ?? '/icon-192x192.png',
    badge:   payload.badge ?? '/icon-192x192.png',
    tag,
    renotify: true,             // 同一 tag でも再通知
    vibrate:  [120, 60, 120],   // 短2回バイブレーション
    data: {
      url,
      category: payload.category ?? 'default',
      ts: Date.now(),
    },
    requireInteraction: false,
  };

  const showPromise = self.registration.showNotification(payload.title, options);

  event.waitUntil(showPromise);
});

// ---------------------------------------------------------------------
// notificationclick イベント
// ---------------------------------------------------------------------
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const data = (event.notification.data ?? {}) as { url?: string };
  const targetPath = typeof data.url === 'string' && data.url.length > 0 ? data.url : '/';

  const focusOrOpen = async (): Promise<void> => {
    const allClients = await self.clients.matchAll({
      type:                'window',
      includeUncontrolled: true,
    });

    // 完全一致のタブがあればフォーカス
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
      } catch {
        // navigate 失敗は無視
      }
      return;
    }

    // 同オリジンの任意のタブをフォーカス → そのタブを navigate
    const anySameOrigin = allClients[0];
    if (anySameOrigin) {
      try {
        await anySameOrigin.focus();
        if ('navigate' in anySameOrigin && typeof (anySameOrigin as WindowClient).navigate === 'function') {
          await (anySameOrigin as WindowClient).navigate(targetPath);
          return;
        }
      } catch {
        // フォールスルー
      }
    }

    // どのタブもなければ新規ウィンドウ
    if (self.clients.openWindow) {
      await self.clients.openWindow(targetPath);
    }
  };

  event.waitUntil(focusOrOpen());
});

// ---------------------------------------------------------------------
// pushsubscriptionchange イベント
//   ブラウザ側で購読が自動的に rotate された場合に発火する。
// ---------------------------------------------------------------------
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
        // 再購読には applicationServerKey が必要だが、SW からは
        // 環境変数を参照できないため、ここではフロント側の再購読に委ねる。
      } catch {
        // 失敗時は何もしない
      }
    })(),
  );
});

// ---------------------------------------------------------------------
// 即時アクティベート
// ---------------------------------------------------------------------
self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(self.clients.claim());
});

export {};
