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

export const metadata: Metadata = {
  title:       '百錬自得 | 剣道稽古記録',
  description: '剣道の稽古を記録し、成長を可視化する稽古管理アプリ',
  // ★ 修正: Next.js App Router の manifest.ts は /manifest.webmanifest として配信される
  manifest:    '/manifest.webmanifest',
  appleWebApp: {
    capable:        true,
    statusBarStyle: 'black-translucent',
    title:          '百錬自得',
    // ★ 修正: パスを実ファイル位置（/icons/）と一致させる
    startupImage:   '/icons/icon-512x512.png',
  },
  icons: {
    // ★ 修正: パスを実ファイル位置（/icons/）と一致（元のlayoutが正しかった）
    icon: [
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
  },
  other: {
    'mobile-web-app-capable':                'yes',
    // ★ 追加: Apple 専用メタタグ（iOS PWA の信頼性を最大化）
    'apple-mobile-web-app-capable':          'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'apple-mobile-web-app-title':            '百錬自得',
  },
};

export const viewport: Viewport = {
  themeColor:   '#1e1b4b',
  width:        'device-width',
  initialScale: 1,
  // maximumScale: 1 と userScalable: false を削除。
  //
  // iOS 16以降、PWA standaloneモードで user-scalable=no / maximum-scale=1 を
  // 指定すると、input・textarea タップ時にソフトキーボードが表示されない
  // Apple側の既知バグが発生する。Safari通常タブでは再現せず standaloneのみ。
  //
  // ズーム防止の代替策として、globals.css 側で入力要素の font-size を 16px 以上に
  // 設定している（iOS は font-size < 16px の input フォーカス時に自動ズームするため）。
  viewportFit:  'cover',
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
