'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isLoggedIn } from '@/lib/auth';

const PUBLIC_PATHS = ['/login'];

// 認証状態を3値で管理
// - pending      : localStorage 確認中（children を描画しない）
// - authenticated: ログイン済み（children を描画する）
// - redirecting  : 未ログイン確定 → /login へ遷移中（children を描画しない）
type AuthState = 'pending' | 'authenticated' | 'redirecting';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const isPublic = PUBLIC_PATHS.includes(pathname);

  // publicページは確認不要なので最初から authenticated にする
  const [authState, setAuthState] = useState<AuthState>(
    isPublic ? 'authenticated' : 'pending'
  );

  // pathname 変化時 or マウント時に認証チェック
  useEffect(() => {
    if (isPublic) {
      setAuthState('authenticated');
      return;
    }

    if (!isLoggedIn()) {
      // 'redirecting' の間は children が return null でブロックされるため、
      // page.tsx の useEffect が発火して user_id 空のまま API を叩くレース
      // コンディションを防止する。
      setAuthState('redirecting');
      // ソフトナビゲーションではなくハードナビゲーションで遷移することで、
      // Next.js の router cache に起因するリダイレクトループを防止する。
      window.location.href = '/login';
    } else {
      setAuthState('authenticated');
    }
  }, [pathname, isPublic]);  // router は依存不要（window.location.href に変更したため）

  // ウィンドウへのフォーカス復帰・タブ表示復帰時にも認証を再チェックする。
  // これにより「同一パス上でのログアウト後に別タブから戻ってきた」ケースや、
  // router.push でのソフトナビゲーション後に pathname が変わらなかったケースを補足する。
  useEffect(() => {
    if (isPublic) return;

    function recheckAuth() {
      if (!isLoggedIn()) {
        setAuthState('redirecting');
        window.location.href = '/login';
      }
    }

    window.addEventListener('focus', recheckAuth);
    document.addEventListener('visibilitychange', recheckAuth);

    return () => {
      window.removeEventListener('focus', recheckAuth);
      document.removeEventListener('visibilitychange', recheckAuth);
    };
  }, [isPublic]);

  // pending / redirecting はいずれも何も描画しない
  if (authState !== 'authenticated') return null;

  return <>{children}</>;
}
