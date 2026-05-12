// next.config.ts
// =====================================================================
// Next.js + PWA 設定
// ★ Phase7:  @ducanh2912/next-pwa 導入
// ★ Phase12: customWorkerSrc を 'worker' に設定。
//            worker/index.ts が自動生成 sw.js に結合され、push /
//            notificationclick イベントを処理する。
// =====================================================================

import type { NextConfig } from 'next';
import withPWAInit from '@ducanh2912/next-pwa';

const isDev = process.env.NODE_ENV === 'development';

const withPWA = withPWAInit({
  dest:         'public',
  register:     true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable:      isDev, // 開発時はSW無効化（Push検証は production build で）

  // ★ Phase12: カスタムワーカー
  customWorkerSrc:    'worker',     // worker/index.ts を取り込む
  customWorkerDest:   'public',     // 出力先（自動生成 sw.js とマージ）
  customWorkerPrefix: 'forge-pwa',  // 出力ファイル prefix

  workboxOptions: {
    disableDevLogs: true,
  },
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // ※ 既存の他設定があればここにマージしてください
  images: {
    unoptimized: true,
  },

};