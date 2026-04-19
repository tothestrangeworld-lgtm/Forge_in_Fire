'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, PenLine, BarChart2, Swords } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/',            label: 'ホーム', Icon: LayoutDashboard },
  { href: '/record',      label: '記録',   Icon: PenLine },
  { href: '/history',     label: 'グラフ', Icon: BarChart2 },
  { href: '/techniques',  label: '技',     Icon: Swords },
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
              alignItems:'center', gap:3, padding:'10px 0 12px',
              color: active ? '#1e1b4b' : '#a8a29e',
              textDecoration:'none', transition:'color .15s',
              position:'relative',
            }}>
              {active && (
                <span style={{
                  position:'absolute', top:0, left:'50%', transform:'translateX(-50%)',
                  width:24, height:2, background:'#1e1b4b', borderRadius:'0 0 2px 2px',
                }} />
              )}
              <Icon style={{
                width:20, height:20,
                strokeWidth: active ? 2.5 : 1.8,
                transform: active ? 'scale(1.1)' : 'scale(1)',
                transition:'transform .15s',
              }} />
              <span style={{ fontSize:10, fontWeight: active ? 700 : 500, letterSpacing:'0.04em' }}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
