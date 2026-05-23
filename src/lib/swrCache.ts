// src/lib/swrCache.ts
// =====================================================================
// 百錬自得 - SWR localStorage 永続化キャッシュプロバイダ ★ Phase 17.1
// =====================================================================
//
// 目的:
//   アプリのタスクキル後の初回起動時に、localStorage に永続化された
//   前回のSWRキャッシュを使って 0秒 で画面を即時描画する。
//   裏でGASと通信し、データが届き次第UIを静かに更新（Stale-While-Revalidate）。
//
// 4層キャッシュ構造:
//   Layer 1: SWR Memory Cache       (Phase 17:  5分/10分/60分)
//   Layer 2: localStorage Cache     (Phase 17.1: 30分) ★この実装
//   Layer 3: GAS CacheService       (Phase 17:  30分/6時間)
//   Layer 4: Google Sheets          (Source of Truth)
//
// 設計:
//   - SWRの公式 provider 機構を使用（透過的に全フックへ適用）
//   - エントリには userId / timestamp / version を含めて整合性を保証
//   - beforeunload で全キャッシュを localStorage に書き戻し
//   - サイズが上限を超える場合は古いエントリから削除（LRU）
//   - ログアウト時は logoutAndRedirect() で完全クリア
//
// セキュリティ考慮:
//   - userId 検証: 別ユーザーのキャッシュ汚染を防止
//   - TTL検証:    30分以上経過したキャッシュは破棄
//   - version検証: スキーマ破壊的変更時に旧データを自動破棄
// =====================================================================

import { getCurrentUserId } from '@/lib/auth';

// =====================================================================
// 定数定義
// =====================================================================

/** localStorage に保存する際のキー */
export const SWR_CACHE_STORAGE_KEY = 'hyakuren-swr-cache';

/** キャッシュのTTL（30分） */
const TTL_MS = 30 * 60 * 1000;

/** localStorage 容量上限（4MB） */
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * キャッシュスキーマのバージョン。
 * 破壊的変更時にインクリメントすることで、旧バージョンの
 * localStorage キャッシュを自動的に無効化できる。
 *
 * 履歴:
 *   v1: Phase 17.1 初版
 */
const CACHE_VERSION = 'v1';

// =====================================================================
// 型定義
// =====================================================================

/**
 * localStorage に保存される全体構造
 */
interface PersistedCache {
  userId:    string;       // どのユーザーのキャッシュか（汚染防止）
  version:   string;       // スキーマバージョン
  timestamp: number;       // 保存時刻（TTL判定用）
  entries:   Array<[string, unknown]>; // Mapのエントリ配列
}

// =====================================================================
// ユーティリティ関数
// =====================================================================

/**
 * SSRセーフな localStorage アクセス
 */
function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

/**
 * SWRキャッシュキーを文字列化する。
 * SWRは配列キー（例: ['dashboard', 'U0001']）も扱うため、
 * Map<string, unknown> として扱うために JSON.stringify する。
 *
 * 注意: SWRの Map は実際には key=任意の値（オブジェクトや配列含む）を許容するが、
 * provider内では SWR が serialize した文字列キーで管理されているため、
 * そのまま Map.set/get が使える。
 */

/**
 * localStorage から永続化キャッシュをロードする。
 * 検証に失敗した場合は空Mapを返す（データを無視）。
 */
function loadCacheFromStorage(): Map<string, unknown> {
  if (!isBrowser()) return new Map();

  try {
    const raw = localStorage.getItem(SWR_CACHE_STORAGE_KEY);
    if (!raw) return new Map();

    const parsed = JSON.parse(raw) as PersistedCache;

    // ── 検証1: 構造チェック ──
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.userId !== 'string' ||
      typeof parsed.version !== 'string' ||
      typeof parsed.timestamp !== 'number' ||
      !Array.isArray(parsed.entries)
    ) {
      console.warn('[swrCache] 不正な構造のキャッシュを検出。破棄します。');
      localStorage.removeItem(SWR_CACHE_STORAGE_KEY);
      return new Map();
    }

    // ── 検証2: スキーマバージョンチェック ──
    if (parsed.version !== CACHE_VERSION) {
      console.info(
        `[swrCache] バージョン不一致（保存=${parsed.version} / 現在=${CACHE_VERSION}）。破棄します。`
      );
      localStorage.removeItem(SWR_CACHE_STORAGE_KEY);
      return new Map();
    }

    // ── 検証3: ユーザーIDチェック（汚染防止） ──
    const currentUserId = getCurrentUserId();
    if (!currentUserId) {
      // 未ログイン状態でロードされた場合は、念のため空Mapを返す
      // （AuthGuardが未ログインを検知してログイン画面へ遷移する）
      return new Map();
    }
    if (parsed.userId !== currentUserId) {
      console.warn(
        `[swrCache] ユーザーID不一致（保存=${parsed.userId} / 現在=${currentUserId}）。破棄します。`
      );
      localStorage.removeItem(SWR_CACHE_STORAGE_KEY);
      return new Map();
    }

    // ── 検証4: TTLチェック ──
    const elapsed = Date.now() - parsed.timestamp;
    if (elapsed > TTL_MS) {
      console.info(
        `[swrCache] TTL超過（経過=${Math.floor(elapsed / 1000)}秒 / 上限=${TTL_MS / 1000}秒）。破棄します。`
      );
      localStorage.removeItem(SWR_CACHE_STORAGE_KEY);
      return new Map();
    }

    // ── ロード成功 ──
    console.info(
      `[swrCache] HIT（${parsed.entries.length}件 / 経過=${Math.floor(elapsed / 1000)}秒）`
    );
    return new Map(parsed.entries);
  } catch (e) {
    console.warn('[swrCache] ロード中に例外発生。破棄します。', e);
    try {
      localStorage.removeItem(SWR_CACHE_STORAGE_KEY);
    } catch {
      /* noop */
    }
    return new Map();
  }
}

/**
 * Mapを localStorage に書き出す。
 * サイズが上限を超える場合は、古いエントリから削除して再試行（LRU）。
 */
function saveCacheToStorage(map: Map<string, unknown>): void {
  if (!isBrowser()) return;

  try {
    const userId = getCurrentUserId();
    if (!userId) {
      // 未ログイン状態では保存しない
      return;
    }

    let entries = Array.from(map.entries());
    if (entries.length === 0) {
      // 空ならクリアする
      localStorage.removeItem(SWR_CACHE_STORAGE_KEY);
      return;
    }

    // ── 書き出し試行（最大3回 LRU 削除しながら） ──
    let attempt = 0;
    const MAX_ATTEMPTS = 3;

    while (attempt < MAX_ATTEMPTS) {
      const payload: PersistedCache = {
        userId,
        version:   CACHE_VERSION,
        timestamp: Date.now(),
        entries,
      };
      const json = JSON.stringify(payload);

      // サイズチェック
      if (json.length <= MAX_BYTES) {
        try {
          localStorage.setItem(SWR_CACHE_STORAGE_KEY, json);
          console.info(
            `[swrCache] SAVE成功（${entries.length}件 / ${Math.round(json.length / 1024)}KB）`
          );
          return;
        } catch (e) {
          // QuotaExceededError などをキャッチして LRU 削除して再試行
          console.warn('[swrCache] localStorage.setItem 失敗。LRU削除して再試行', e);
        }
      } else {
        console.warn(
          `[swrCache] サイズ超過（${Math.round(json.length / 1024)}KB > ${MAX_BYTES / 1024}KB）。LRU削除して再試行`
        );
      }

      // ── LRU削除: エントリ数を半分に減らす（古い方から削除） ──
      // SWR内部の挿入順を信頼し、Mapの先頭側=古いとみなして削除する
      const halfCount = Math.floor(entries.length / 2);
      if (halfCount === 0) break; // これ以上削れない
      entries = entries.slice(entries.length - halfCount); // 後半（=新しい方）のみ残す
      attempt++;
    }

    // ── 全て失敗した場合は完全クリア ──
    console.warn('[swrCache] 全試行失敗。localStorage を完全クリアします。');
    try {
      localStorage.removeItem(SWR_CACHE_STORAGE_KEY);
    } catch {
      /* noop */
    }
  } catch (e) {
    // 想定外エラーは握りつぶす（UI動作には影響させない）
    console.warn('[swrCache] saveCacheToStorage で例外発生。', e);
  }
}

// =====================================================================
// SWR Provider ファクトリ
// =====================================================================

/**
 * SWR の `provider` プロパティに渡すファクトリ関数。
 *
 * 使い方:
 *   <SWRConfig value={{ provider: createPersistedCache }}>
 *
 * SWR は内部でこのファクトリを1度だけ呼び出して Map を取得し、
 * その Map を全フックの共通キャッシュとして使う。
 * mutate するとこの Map が直接更新されるため、beforeunload 時に
 * 書き戻すだけで「最新状態の永続化」が実現できる。
 */
export function createPersistedCache(): Map<string, unknown> {
  // ── 1. 起動時: localStorage からキャッシュをロード ──
  const map = loadCacheFromStorage();

  // ── 2. 離脱時: Map を localStorage へ書き出し ──
  if (isBrowser()) {
    // beforeunload: タブを閉じる/リロード時に発火
    window.addEventListener('beforeunload', () => {
      saveCacheToStorage(map);
    });

    // visibilitychange (hidden): モバイルでのバックグラウンド遷移時に発火
    // （beforeunloadはモバイルで発火しないことがあるため二重保険）
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        saveCacheToStorage(map);
      }
    });

    // pagehide: iOS Safari では beforeunload より確実に発火
    window.addEventListener('pagehide', () => {
      saveCacheToStorage(map);
    });
  }

  return map;
}

// =====================================================================
// 公開ユーティリティ（auth.ts などから呼ばれる）
// =====================================================================

/**
 * localStorage の SWR キャッシュを完全に削除する。
 * ログアウト時に必ず呼ぶこと。
 */
export function clearPersistedCache(): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(SWR_CACHE_STORAGE_KEY);
    console.info('[swrCache] CLEAR（ログアウトによる完全削除）');
  } catch (e) {
    console.warn('[swrCache] clearPersistedCache 失敗', e);
  }
}
