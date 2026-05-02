import type { Metadata, Viewport } from 'next';
import { M_PLUS_Rounded_1c } from 'next/font/google';
import './globals.css';
import Navigation from '@/components/Navigation';
import AuthGuard  from '@/components/AuthGuard';

const mplus = M_PLUS_Rounded_1c({
  subsets:  ['latin'],
  weight:   ['400', '500', '700', '800'],
  variable: '--font-mplus',
  display:  'swap',
});

// ★ 上にあった重複部分を削除し、こちらにまとめました
export const metadata: Metadata = {
  title:       '百錬自得 | 剣道稽古記録',
  description: '剣道の稽古を記録し、成長を可視化する稽古管理アプリ',
  manifest:    '/manifest.json', // ← ここを .webmanifest から .json に変更
  appleWebApp: {
    capable:           true,
    statusBarStyle:    'black-translucent',
    title:             '百錬自得',
    startupImage:      '/icon/icon-512x512.png',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  themeColor:           '#1e1b4b',
  width:                'device-width',
  initialScale:         1,
  maximumScale:         1,
  userScalable:         false,
  viewportFit:          'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={mplus.variable}>
      <body className="app-outer antialiased">
        <div className="pc-side pc-side-left" aria-hidden="true">
          <div className="pc-deco-text">百錬自得</div>
          <div className="pc-deco-sub">剣道稽古記録</div>
        </div>

        <AuthGuard>
          <div className="app-shell">
            <main className="app-main">{children}</main>
            <Navigation />
          </div>
        </AuthGuard>

        <div className="pc-side pc-side-right" aria-hidden="true" />
      </body>
    </html>
  );
}