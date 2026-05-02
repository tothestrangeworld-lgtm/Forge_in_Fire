// =====================================================================
// 百錬自得 - 認証ユーティリティ
// localStorage にログイン情報を保存・読み取りする
// =====================================================================

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
 */
export function logoutAndRedirect(): void {
  clearAuthUser();
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
