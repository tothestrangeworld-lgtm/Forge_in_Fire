// src/components/Navigation.tsx
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Swords, Users, LogOut } from 'lucide-react';
import { clearAuthUser, getAuthUser } from '@/lib/auth';

const NAV_LINKS = [
  { href: '/',       label: 'ホーム',   Icon: LayoutDashboard },
  { href: '/record', label: '稽古記録', Icon: Swords },
  { href: '/rivals', label: '門下生',   Icon: Users },
];

export default function Navigation() {
  const pathname = usePathname();
  const router   = useRouter();
  const user     = getAuthUser();

  // ログインページではナビゲーション非表示
  if (pathname === '/login') return null;

  function handleLogout() {
    if (!confirm(`${user?.name ?? 'ユーザー'} をログアウトしますか？`)) return;
    clearAuthUser();
    router.replace('/login');
  }

  return (
    <nav style={{
      position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)',
      width:'100%', maxWidth:430,
      background:'rgba(255,255,255,0.92)',
      backdropFilter:'blur(16px)',
      borderTop:'1px solid #ede9fe',
      zIndex:50,
    }}>
      <div style={{ display:'flex' }}>
        {NAV_LINKS.map(({ href, label, Icon }) => {
          // /rivals/[id] など配下のパスでも「門下生」タブをアクティブにする
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link key={href} href={href} style={{
              flex:1, display:'flex', flexDirection:'column',
              alignItems:'center', gap:3, padding:'10px 0 14px',
              color: active ? '#1e1b4b' : '#a8a29e',
              textDecoration:'none', transition:'color .15s',
              position:'relative',
            }}>
              {active && (
                <span style={{
                  position:'absolute', top:0, left:'50%',
                  transform:'translateX(-50%)',
                  width:32, height:2.5,
                  background:'#1e1b4b',
                  borderRadius:'0 0 3px 3px',
                }} />
              )}
              <Icon style={{
                width:22, height:22,
                strokeWidth: active ? 2.5 : 1.8,
                transform: active ? 'scale(1.1)' : 'scale(1)',
                transition:'transform .15s',
              }} />
              <span style={{ fontSize:11, fontWeight: active ? 700 : 500, letterSpacing:'0.04em' }}>
                {label}
              </span>
            </Link>
          );
        })}

        {/* ログアウトボタン */}
        <button
          onClick={handleLogout}
          style={{
            flex:1, display:'flex', flexDirection:'column',
            alignItems:'center', gap:3, padding:'10px 0 14px',
            background:'none', border:'none', cursor:'pointer',
            color:'#a8a29e', fontFamily:'inherit',
          }}
        >
          <LogOut style={{ width:22, height:22, strokeWidth:1.8 }} />
          <span style={{ fontSize:10, fontWeight:500, letterSpacing:'0.04em' }}>
            {user?.name ? user.name.slice(0,4) : 'ログアウト'}
          </span>
        </button>

      </div>
    </nav>
  );
}