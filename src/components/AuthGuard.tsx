'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isLoggedIn } from '@/lib/auth';

const PUBLIC_PATHS = ['/login'];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // localStorage はクライアントのみ参照可能
    const isPublic = PUBLIC_PATHS.includes(pathname);
    if (!isPublic && !isLoggedIn()) {
      router.replace('/login');
    } else {
      setChecked(true);
    }
  }, [pathname, router]);

  // 認証確認前は何も表示しない（ちらつき防止）
  if (!checked && !PUBLIC_PATHS.includes(pathname)) return null;

  return <>{children}</>;
}
