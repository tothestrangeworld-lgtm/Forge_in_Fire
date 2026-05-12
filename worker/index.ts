// worker/index.ts
// =====================================================================
// 百錬自得 - Push通知カスタムワーカー ★ Phase12 (iOS Hardened)
//
// ★ iOS PWA 配信信頼性のための重要ポイント:
//   1. showNotification は必ず title (非空文字列) を渡す
//      → iOS は空タイトル時に黙って通知を破棄する
//   2. body も最低1文字以上（空はNG）
//   3. event.waitUntil() で showNotification の Promise を必ず返す
//      → 返さないと iOS は Service Worker をすぐ kill する
//   4. push イベントハンドラ内で例外が起きると iOS は通知を出さない
//      → try-catch で必ず最後に showNotification を呼ぶ保険を入れる
//   5. icon/badge の URL は絶対URLで origin 一致が確実だが、
//      相対パスでも動作する。ただし iOS では icon があると表示安定性UP
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

// ---------------------------------------------------------------------
// 安全な fallback タイトル/本文
// ---------------------------------------------------------------------
const FALLBACK_TITLE = '百錬自得';
const FALLBACK_BODY  = '新しいお報せがあります';

function safeStr(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

// ---------------------------------------------------------------------
// push イベント
// ---------------------------------------------------------------------
self.addEventListener('push', (event: PushEvent) => {
  // ★ iOS Fix: 全処理を try で包み、最悪でも fallback 通知を必ず出す。
  //   iOS は showNotification を呼ばずに push ハンドラを終えると
  //   即「通知を出さなかった」と判定し、繰り返すと配信抑制される可能性。
  const handle = async (): Promise<void> => {
    let title = FALLBACK_TITLE;
    let body  = FALLBACK_BODY;
    let url   = '/';
    let category = 'default';
    let tag   = 'forge-default';
    let icon  = '/icons/icon-192x192.png';
    let badge = '/icons/icon-192x192.png';

    try {
      if (event.data) {
        const text = event.data.text();
        try {
          const parsed = JSON.parse(text) as Partial<PushPayload>;
          title    = safeStr(parsed.title, FALLBACK_TITLE);
          body     = safeStr(parsed.body,  FALLBACK_BODY);
          url      = safeStr(parsed.url,   '/');
          category = safeStr(parsed.category, 'default');
          tag      = safeStr(parsed.tag,   `forge-${category}`);
          icon     = safeStr(parsed.icon,  '/icons/icon-192x192.png');
          badge    = safeStr(parsed.badge, '/icons/icon-192x192.png');
        } catch {
          // JSON でなければ生テキストを body として使う
          body = safeStr(text, FALLBACK_BODY);
        }
      }
    } catch {
      // event.data 取得自体が失敗した場合もフォールバックで継続
    }

    // ★ iOS Fix: 最終的に title が空でないことを必ず保証
    if (!title || title.length === 0) title = FALLBACK_TITLE;
    if (!body  || body.length  === 0) body  = FALLBACK_BODY;

    // iOS Safari が確実に処理できるプロパティのみ
    const options: NotificationOptions = {
      body,
      icon,
      badge,
      tag,
      data: {
        url,
        category,
        ts: Date.now(),
      },
    };

    try {
      await self.registration.showNotification(title, options);
    } catch (err) {
      // ★ iOS Fix: showNotification 自体が失敗した場合、最小オプションで再試行
      try {
        await self.registration.showNotification(FALLBACK_TITLE, {
          body: FALLBACK_BODY,
        });
      } catch {
        // 二度目も失敗したら諦める（少なくとも push ハンドラは正常終了させる）
      }
    }
  };

  // ★ iOS Fix: waitUntil で Promise を必ず返すこと
  event.waitUntil(handle());
});

// ---------------------------------------------------------------------
// notificationclick イベント
// ---------------------------------------------------------------------
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const data = (event.notification.data ?? {}) as { url?: string };
  const targetPath = typeof data.url === 'string' && data.url.length > 0 ? data.url : '/';

  const focusOrOpen = async (): Promise<void> => {
    try {
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
    } catch {
      // 最悪でもクラッシュさせない
    }
  };

  event.waitUntil(focusOrOpen());
});

// ---------------------------------------------------------------------
// pushsubscriptionchange イベント
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
      } catch {}
    })(),
  );
});

// ---------------------------------------------------------------------
// activate
// ---------------------------------------------------------------------
self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(self.clients.claim());
});

export {};
