'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isLoggedIn } from '@/lib/auth';

const PUBLIC_PATHS = ['/login'];

// 認証状態を3値で管理
// - pending     : localStorage 確認中（children を描画しない）
// - authenticated: ログイン済み（children を描画する）
// - redirecting : 未ログイン確定 → /login へ遷移中（children を描画しない）
type AuthState = 'pending' | 'authenticated' | 'redirecting';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const isPublic = PUBLIC_PATHS.includes(pathname);

  // publicページは確認不要なので最初から authenticated にする
  const [authState, setAuthState] = useState<AuthState>(
    isPublic ? 'authenticated' : 'pending'
  );

  useEffect(() => {
    if (isPublic) {
      setAuthState('authenticated');
      return;
    }

    if (!isLoggedIn()) {
      // リダイレクト中フラグを先に立ててから遷移する。
      // 'redirecting' の間は children が return null でブロックされるため、
      // page.tsx の useEffect が発火して user_id 空のまま API を叩くレース
      // コンディションを防止する。
      setAuthState('redirecting');
      router.replace('/login');
    } else {
      setAuthState('authenticated');
    }
  }, [pathname, router, isPublic]);

  // pending / redirecting はいずれも何も描画しない
  if (authState !== 'authenticated') return null;

  return <>{children}</>;
}
