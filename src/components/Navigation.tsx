'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Swords } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/',       label: 'ホーム',   Icon: LayoutDashboard },
  { href: '/record', label: '稽古記録', Icon: Swords },
];

export default function Navigation() {
  const pathname = usePathname();

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
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = pathname === href;
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
                  position:'absolute', top:0, left:'50%', transform:'translateX(-50%)',
                  width:32, height:2.5, background:'#1e1b4b', borderRadius:'0 0 3px 3px',
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
      </div>
    </nav>
  );
}
