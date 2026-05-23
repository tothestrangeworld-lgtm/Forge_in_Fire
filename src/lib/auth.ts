// =====================================================================
// 百錬自得 - 認証ユーティリティ
// localStorage にログイン情報を保存・読み取りする
// ★ Phase 17.1: ログアウト時に SWR永続化キャッシュも完全クリア
// =====================================================================

import { clearPersistedCache } from '@/lib/swrCache';

const AUTH_KEY = 'hyakuren_user';

export interface AuthUser {
  user_id: string;
  name:    string;
  role:    string;
}

const isBrowser = typeof window !== 'undefined';

/** 現在ログイン中のユーザーを取得（未ログインは null） */
export function getAuthUser(): AuthUser | null {
  if (!isBrowser) return null;
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

/** ログイン情報を保存 */
export function setAuthUser(user: AuthUser): void {
  if (!isBrowser) return;
  localStorage.setItem(AUTH_KEY, JSON.stringify(user));
}

/** ログアウト（保存情報を削除） */
export function clearAuthUser(): void {
  if (!isBrowser) return;
  localStorage.removeItem(AUTH_KEY);
}

/**
 * ログアウトしてログイン画面へ遷移する。
 *
 * router.push / router.replace（ソフトナビゲーション）を使うと、
 * pathname が変わらない場合に AuthGuard の useEffect が再発火せず、
 * authState が 'authenticated' のまま残ってログイン画面に遷移しない問題がある。
 * window.location.href によるハードナビゲーションでページを完全にリロードし、
 * AuthGuard を初期状態から再評価させることで確実にログアウトを完了させる。
 *
 * ★ Phase 17.1:
 *   ログアウト時に SWR の localStorage 永続化キャッシュも必ず削除する。
 *   これによりマルチユーザー時の前ユーザーデータ汚染を完全に防止する。
 *   実行順:
 *     1. SWR永続化キャッシュをクリア（前ユーザーのデータを完全消去）
 *     2. 認証情報をクリア（hyakuren_user）
 *     3. ハードナビゲーションで /login へ遷移
 *        → ページ全体がリロードされ、SWRメモリキャッシュも自動的に消える
 */
export function logoutAndRedirect(): void {
  // ★ Phase 17.1: SWR永続化キャッシュを先に削除
  // （ログアウト後の他ユーザーログインで前ユーザーのデータが見えるのを防止）
  clearPersistedCache();

  // 認証情報をクリア
  clearAuthUser();

  // ハードナビゲーションでログイン画面へ
  if (isBrowser) {
    window.location.href = '/login';
  }
}

/** ログイン済みかどうか */
export function isLoggedIn(): boolean {
  return getAuthUser() !== null;
}

/** 現在のユーザーIDを返す（未ログインは空文字） */
export function getCurrentUserId(): string {
  return getAuthUser()?.user_id ?? '';
}
