'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
// 変更後
import { Home, Swords, Users, LogOut, Target } from 'lucide-react';
import { useEffect, useState } from 'react';
// ★ Phase13.7: auth.ts の公式APIを使用
import { getAuthUser, logoutAndRedirect } from '@/lib/auth';
import type { AuthUser } from '@/lib/auth';

export default function Navigation() {
  const pathname  = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);

  // ★ Phase13.7: localStorage に直接アクセスせず、getAuthUser() を使用
  useEffect(() => {
    setUser(getAuthUser());
  }, []);

  // ★ Phase13.7: 自前で localStorage.removeItem() するのではなく、
  // auth.ts が提供する公式APIを使うことで、認証データの削除と
  // ハードナビゲーションを一括で正しく実行する。
  const handleLogout = () => {
    logoutAndRedirect();
  };

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

// 変更後
  /* ── nav items ────────────────────────────────────────────────── */
  // ★ Phase16: 反射神経養成ミニゲーム『刹那ノ見切』へのリンクを追加
  const navItems = [
    { href: '/',         label: 'ホーム',   icon: Home   },
    { href: '/record',   label: '稽古記録', icon: Swords },
    { href: '/rivals',   label: '門下生',   icon: Users  },
    { href: '/minigame', label: '見切',     icon: Target },
  ] as const;


  return (
    <nav className="bottom-nav" role="navigation" aria-label="メインナビゲーション">
      {navItems.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={`nav-item ${isActive(href) ? 'nav-item--active' : ''}`}
          aria-current={isActive(href) ? 'page' : undefined}
        >
          <Icon className="nav-icon" aria-hidden="true" />
          <span className="nav-label">{label}</span>
        </Link>
      ))}

      {/* ── ユーザー名 / ログアウト ─────────────────────────────── */}
      <button
        type="button"
        onClick={handleLogout}
        className="nav-item nav-item--logout"
        aria-label="ログアウト"
      >
        <LogOut className="nav-icon" aria-hidden="true" />
        <span className="nav-label nav-label--user">
          {user?.name ?? 'ログアウト'}
        </span>
      </button>
    </nav>
  );
}
