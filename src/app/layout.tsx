import type { Metadata } from 'next';
import { M_PLUS_Rounded_1c } from 'next/font/google';
import './globals.css';
import Navigation from '@/components/Navigation';

const mplus = M_PLUS_Rounded_1c({
  subsets: ['latin'],
  weight: ['400', '500', '700', '800'],
  variable: '--font-mplus',
  display: 'swap',
});

export const metadata: Metadata = {
  title: '百錬自得 | 剣道稽古記録',
  description: '剣道の稽古を記録し、成長を可視化する稽古管理アプリ',
};

export const viewport = {
  themeColor: '#1e1b4b',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={mplus.variable}>
      <body className="app-outer antialiased">
        {/* PC: 両サイドを藍色で飾る */}
        <div className="pc-side pc-side-left" aria-hidden="true">
          <div className="pc-deco-text">百錬自得</div>
          <div className="pc-deco-sub">剣道稽古記録</div>
        </div>

        {/* メインコンテンツ */}
        <div className="app-shell">
          <main className="app-main">{children}</main>
          <Navigation />
        </div>

        <div className="pc-side pc-side-right" aria-hidden="true" />
      </body>
    </html>
  );
}
