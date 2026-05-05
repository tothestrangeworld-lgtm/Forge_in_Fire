'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Swords, Users, LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';

type NavUser = {
  name: string;
  user_id: string;
} | null;

export default function Navigation() {
  const pathname  = usePathname();
  const [user, setUser] = useState<NavUser>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (stored) setUser(JSON.parse(stored));
    } catch {
      /* ignore */
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  /* ── nav items ────────────────────────────────────────────────── */
  const navItems = [
    { href: '/',       label: 'ホーム',   icon: Home   },
    { href: '/record', label: '稽古記録', icon: Swords },
    { href: '/rivals', label: '門下生',   icon: Users  },
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
